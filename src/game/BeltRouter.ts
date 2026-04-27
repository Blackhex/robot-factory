import type { GridPosition } from './types'
import type { GridReader } from './GridReader'

/** Check if a path has an L-shape turn at the first or last intermediate cell. */
export function hasLShapeAtEndpoints(path: GridPosition[]): boolean {
  if (path.length < 3) return false
  // Check at source endpoint
  const d1x = path[1].x - path[0].x
  const d1z = path[1].z - path[0].z
  const d2x = path[2].x - path[1].x
  const d2z = path[2].z - path[1].z
  if (d1x !== d2x || d1z !== d2z) return true
  // Check at target endpoint
  const n = path.length
  const pDx = path[n - 2].x - path[n - 3].x
  const pDz = path[n - 2].z - path[n - 3].z
  const lDx = path[n - 1].x - path[n - 2].x
  const lDz = path[n - 1].z - path[n - 2].z
  return pDx !== lDx || pDz !== lDz
}

export class BeltRouter {
  private readonly grid: GridReader

  constructor(grid: GridReader) {
    this.grid = grid
  }

  /**
   * Compute the L-shaped belt path between two cells WITHOUT placing anything.
   * Walks X-first then Z. Returns the ordered list of grid positions.
   */
  computeBeltPath(from: GridPosition, to: GridPosition): GridPosition[] {
    const path: GridPosition[] = [{ x: from.x, z: from.z }]
    let cx = from.x
    while (cx !== to.x) {
      cx += cx < to.x ? 1 : -1
      path.push({ x: cx, z: from.z })
    }
    let cz = from.z
    while (cz !== to.z) {
      cz += cz < to.z ? 1 : -1
      path.push({ x: to.x, z: cz })
    }
    return path
  }

  /**
   * Compute the L-shaped belt path between two cells WITHOUT placing anything.
   * Walks Z-first then X (alternative to computeBeltPath).
   */
  computeBeltPathZFirst(from: GridPosition, to: GridPosition): GridPosition[] {
    const path: GridPosition[] = [{ x: from.x, z: from.z }]
    let cz = from.z
    while (cz !== to.z) {
      cz += cz < to.z ? 1 : -1
      path.push({ x: from.x, z: cz })
    }
    let cx = from.x
    while (cx !== to.x) {
      cx += cx < to.x ? 1 : -1
      path.push({ x: cx, z: to.z })
    }
    return path
  }

  /**
   * Find the best (non-colliding) belt path between two positions.
   * Tries X-first path first; if it collides, tries Z-first.
   * Returns whichever doesn't collide (preferring X-first).
   * If all paths collide, prefers the first direction-satisfying candidate
   * (xFirst → zFirst → BFS); falls back to xFirst if none satisfy constraints.
   * Optional `requiredFirstDir`/`requiredLastDir` constrain path directions at endpoints.
   */
  findBestBeltPath(
    from: GridPosition,
    to: GridPosition,
    ignoreBeltIds?: ReadonlySet<string>,
    requiredFirstDir?: GridPosition,
    requiredLastDir?: GridPosition,
    ignoreMachinePositions?: ReadonlySet<string>,
    blockedPositions?: ReadonlySet<string>,
  ): { path: GridPosition[], collides: boolean } {
    // Helper to check if a path satisfies direction constraints
    const satisfiesConstraints = (path: GridPosition[]): boolean => {
      if (path.length < 2) return true
      if (requiredFirstDir) {
        const dx = path[1].x - path[0].x
        const dz = path[1].z - path[0].z
        if (dx !== requiredFirstDir.x || dz !== requiredFirstDir.z) return false
      }
      if (requiredLastDir) {
        const last = path.length - 1
        const dx = path[last].x - path[last - 1].x
        const dz = path[last].z - path[last - 1].z
        if (dx !== requiredLastDir.x || dz !== requiredLastDir.z) return false
      }
      return true
    }

    // Prefer L-shaped paths when available (fewest turns)
    const xFirst = this.computeBeltPath(from, to)
    if (!this.wouldPathCollide(xFirst, ignoreBeltIds, ignoreMachinePositions, blockedPositions) && satisfiesConstraints(xFirst)) {
      return { path: xFirst, collides: false }
    }
    const zFirst = this.computeBeltPathZFirst(from, to)
    if (!this.wouldPathCollide(zFirst, ignoreBeltIds, ignoreMachinePositions, blockedPositions) && satisfiesConstraints(zFirst)) {
      return { path: zFirst, collides: false }
    }

    // BFS pathfinding — allows multiple turns to route around obstacles
    const bfsPath = this.bfsPathfind(from, to, ignoreBeltIds, requiredFirstDir, requiredLastDir, ignoreMachinePositions, blockedPositions)
    if (bfsPath && !this.wouldPathCollide(bfsPath, ignoreBeltIds, ignoreMachinePositions, blockedPositions)) {
      return { path: bfsPath, collides: false }
    }

    // No collision-free path — prefer direction-satisfying colliding path for ghost rendering
    if (satisfiesConstraints(xFirst)) return { path: xFirst, collides: true }
    if (satisfiesConstraints(zFirst)) return { path: zFirst, collides: true }
    if (bfsPath) return { path: bfsPath, collides: true }
    return { path: xFirst, collides: true }
  }

  /**
   * BFS pathfinding from `from` to `to`, allowing multiple turns.
   * Uses direction-aware visited set to prevent L-shapes at endpoints.
   */
  bfsPathfind(
    from: GridPosition,
    to: GridPosition,
    ignoreBeltIds?: ReadonlySet<string>,
    requiredFirstDir?: GridPosition,
    requiredLastDir?: GridPosition,
    ignoreMachinePositions?: ReadonlySet<string>,
    blockedPositions?: ReadonlySet<string>,
  ): GridPosition[] | null {
    const maxNodes = this.grid.width * this.grid.height * 4
    const visited = new Set<string>()
    const queue: Array<{ pos: GridPosition; path: GridPosition[] }> = []
    const directions: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

    queue.push({ pos: { x: from.x, z: from.z }, path: [{ x: from.x, z: from.z }] })
    // Mark source as visited from all directions
    for (const [dx, dz] of directions) {
      visited.add(`${from.x},${from.z},${dx},${dz}`)
    }

    let explored = 0

    while (queue.length > 0 && explored < maxNodes) {
      const { pos: current, path } = queue.shift()!
      explored++

      if (current.x === to.x && current.z === to.z) {
        // If requiredLastDir is set, verify the last step direction matches
        if (requiredLastDir && path.length >= 2) {
          const last = path.length - 1
          const ldx = path[last].x - path[last - 1].x
          const ldz = path[last].z - path[last - 1].z
          if (ldx !== requiredLastDir.x || ldz !== requiredLastDir.z) continue
        }
        return path
      }

      for (const [dx, dz] of directions) {
        const nx = current.x + dx
        const nz = current.z + dz

        if (!this.grid.isInBounds(nx, nz)) continue

        // Constrain first step direction if required
        if (requiredFirstDir && path.length === 1) {
          if (dx !== requiredFirstDir.x || dz !== requiredFirstDir.z) continue
        }

        // Direction-aware visited key
        const nKey = `${nx},${nz},${dx},${dz}`
        if (visited.has(nKey)) continue

        // Intermediate cells must not have machines; target cell is OK
        const isTarget = nx === to.x && nz === to.z
        if (!isTarget && this.grid.getMachineAt(nx, nz) !== null && !ignoreMachinePositions?.has(`${nx},${nz}`)) continue
        if (!isTarget && blockedPositions?.has(`${nx},${nz}`)) continue

        // No duplicate belt segment in the same direction
        if (this.grid.hasBeltSegment(current, { x: nx, z: nz }, ignoreBeltIds)) continue

        if ((current.x !== from.x || current.z !== from.z) && this.grid.cellHasBeltsExcluding(current.x, current.z, ignoreBeltIds)) continue
        if (!isTarget && this.grid.cellHasBeltsExcluding(nx, nz, ignoreBeltIds)) continue

        // Don't mark target as visited — allow multiple arrival directions
        if (!isTarget) {
          visited.add(nKey)
        }
        queue.push({ pos: { x: nx, z: nz }, path: [...path, { x: nx, z: nz }] })
      }
    }

    return null
  }

  /** Check whether any segment in a pre-computed path would collide with existing belts/machines. */
  wouldPathCollide(path: GridPosition[], ignoreBeltIds?: ReadonlySet<string>, ignoreMachinePositions?: ReadonlySet<string>, blockedPositions?: ReadonlySet<string>): boolean {
    // Self-crossing check: detect if any intermediate cell (not first/last)
    // appears more than once in the path, creating a U-turn/loop
    const visitedCells = new Set<string>()
    for (let i = 1; i < path.length - 1; i++) {
      const key = `${path[i].x},${path[i].z}`
      if (visitedCells.has(key)) return true
      visitedCells.add(key)
      if (this.grid.cellHasBeltsExcluding(path[i].x, path[i].z, ignoreBeltIds)) return true
    }

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]
      const b = path[i + 1]
      // Duplicate belt segment
      if (this.grid.hasBeltSegment(a, b, ignoreBeltIds)) return true

      // Intermediate cells (not the first or last, which are machines)
      // must not contain other machines
      if (i > 0) {
        const machine = this.grid.getMachineAt(a.x, a.z)
        if (machine && !ignoreMachinePositions?.has(`${a.x},${a.z}`)) return true
        if (!machine && blockedPositions?.has(`${a.x},${a.z}`)) return true
      }

      // Check if this segment crosses an existing perpendicular belt
      // at any shared cell.
      const segDx = b.x - a.x
      const segDz = b.z - a.z
      const cellsToCheck: GridPosition[] = []
      if (i > 0) cellsToCheck.push(a)
      if (i + 1 < path.length - 1) cellsToCheck.push(b)
      for (const cell of cellsToCheck) {
        const dirs = this.getSegmentDirectionsAt(cell.x, cell.z, ignoreBeltIds)
        for (const { dx: eDx, dz: eDz } of dirs) {
          // Perpendicular check: one horizontal, one vertical
          if (segDx !== 0 && eDz !== 0) return true // new=horizontal, existing=vertical
          if (segDz !== 0 && eDx !== 0) return true // new=vertical, existing=horizontal
        }
      }
    }
    return false
  }

  /** Extract segment directions at a given cell from belt paths. */
  private getSegmentDirectionsAt(
    cx: number, cz: number,
    ignoreBeltIds?: ReadonlySet<string>,
  ): Array<{ dx: number, dz: number }> {
    const result: Array<{ dx: number, dz: number }> = []
    for (const belt of this.grid.getBeltsAt(cx, cz)) {
      if (ignoreBeltIds?.has(belt.id)) continue
      for (let i = 0; i < belt.path.length; i++) {
        if (belt.path[i].x !== cx || belt.path[i].z !== cz) continue
        if (i < belt.path.length - 1) {
          result.push({
            dx: belt.path[i + 1].x - belt.path[i].x,
            dz: belt.path[i + 1].z - belt.path[i].z,
          })
        }
        if (i > 0) {
          result.push({
            dx: belt.path[i].x - belt.path[i - 1].x,
            dz: belt.path[i].z - belt.path[i - 1].z,
          })
        }
        break
      }
    }
    return result
  }
}
