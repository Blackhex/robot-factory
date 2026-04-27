import * as THREE from 'three'
import type { Factory, BeltInfo } from '../game/Factory'
import {
  BELT_WIDTH,
  createCornerBeltGeometry,
  getCornerOffset,
  getCornerRotation,
} from './BeltGeometry'
import { createBeltArrowTexture, createBeltDirectionMaterial } from './RenderingAssets'

export {
  BELT_WIDTH,
  CORNER_OUTER_R,
  CORNER_INNER_R,
  CORNER_STRAIGHT_LEN,
  createCornerBeltGeometry,
  getCornerOffset,
  getCornerRotation,
} from './BeltGeometry'

export type BeltDirection = 'east' | 'west' | 'north' | 'south'

interface CellBeltInfo {
  directions: Set<string>
  beltIds: string[]
  flowBelt: BeltInfo | null
}

export interface BeltMeshRendererOptions {
  factory: Factory
  scene: THREE.Scene
  beltMeshes: Map<string, THREE.Mesh>
  cellBeltIds: Map<THREE.Mesh, string[]>
  gridToWorld: (x: number, z: number) => THREE.Vector3
}

export class BeltMeshRenderer {
  // BELT_SCROLL_SPEED units = UV scroll **per real second**. 1 UV cycle = 1 cell
  // (texture repeat=1, geometry width=1), default belt speed = 1 cell/sec
  // ⇒ chevrons match items at default speed regardless of FPS.
  private static readonly BELT_SCROLL_SPEED = 1.0

  private readonly factory: Factory
  private readonly scene: THREE.Scene
  private readonly beltMeshes: Map<string, THREE.Mesh>
  private readonly cellBeltIds: Map<THREE.Mesh, string[]>
  private readonly gridToWorld: (x: number, z: number) => THREE.Vector3
  private readonly beltGeometry: THREE.BoxGeometry
  private readonly beltArrowTexture: THREE.CanvasTexture
  private readonly beltDirectionMaterials: Map<BeltDirection, THREE.MeshStandardMaterial> = new Map()
  private readonly beltHighlightMaterials: Map<BeltDirection, THREE.MeshStandardMaterial> = new Map()
  // Per-(beltLogicalId, direction) cloned materials used by the cell meshes.
  // Each clone owns its own cloned chevron texture, so per-belt UV offsets
  // advance independently. The highlight clone SHARES its `map` with the
  // chevron clone of the same belt+dir, so a single map.offset.x update
  // advances both views (chevron + highlight) consistently.
  // Key: `${beltLogicalId}|${direction}`
  private readonly chevronMaterialsByBelt: Map<string, THREE.MeshStandardMaterial> = new Map()
  private readonly chevronHighlightByBelt: Map<string, THREE.MeshStandardMaterial> = new Map()
  private readonly cornerSideMaterial: THREE.MeshStandardMaterial
  private readonly cornerSideHighlightMaterial: THREE.MeshStandardMaterial
  private cornerBeltGeometryFwd: THREE.BufferGeometry | null = null
  private cornerBeltGeometryRev: THREE.BufferGeometry | null = null
  private highlightedBeltIds: Set<string> = new Set()

  constructor(options: BeltMeshRendererOptions) {
    this.factory = options.factory
    this.scene = options.scene
    this.beltMeshes = options.beltMeshes
    this.cellBeltIds = options.cellBeltIds
    this.gridToWorld = options.gridToWorld

    // width=1 ⇒ 1 UV cycle = 1 cell — keep in sync with BELT_SCROLL_SPEED
    this.beltGeometry = new THREE.BoxGeometry(1, 0.05, 1)
    this.beltGeometry.clearGroups()
    this.beltGeometry.addGroup(0, 12, 1)
    this.beltGeometry.addGroup(12, 6, 0)
    this.beltGeometry.addGroup(18, 6, 0)
    this.beltGeometry.addGroup(24, 12, 1)

    this.beltArrowTexture = createBeltArrowTexture()
    const directions: readonly BeltDirection[] = ['east', 'west', 'north', 'south']
    for (const dir of directions) {
      const baseMat = createBeltDirectionMaterial(dir, this.beltArrowTexture)
      this.beltDirectionMaterials.set(dir, baseMat)
      this.beltHighlightMaterials.set(dir, new THREE.MeshStandardMaterial({
        color: baseMat.color,
        roughness: 0.3,
        map: baseMat.map,
        emissive: new THREE.Color(0x4fc3f7),
        emissiveIntensity: 0.6,
      }))
    }

    this.cornerSideMaterial = new THREE.MeshStandardMaterial({
      color: 0x888899,
      roughness: 0.8,
    })
    this.cornerSideHighlightMaterial = new THREE.MeshStandardMaterial({
      color: 0x888899,
      emissive: 0x4fc3f7,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    })
  }

  update(): void {
    for (const [, mesh] of this.beltMeshes) {
      this.scene.remove(mesh)
    }
    this.beltMeshes.clear()
    this.cellBeltIds.clear()
    // Only dispose per-belt clones whose logical belt id is no longer in the
    // current Factory snapshot. Existing belts keep their cached clones (and
    // stable material UUIDs) across rebuilds — required so highlight → clear
    // cycles do not swap out the chevron material identity. Removed belts'
    // clones are released here to avoid GPU memory leakage.
    const currentBeltIds = new Set<string>(this.factory.getBelts().map(b => b.id))
    this.disposePerBeltMaterialsForRemovedBelts(currentBeltIds)

    this.renderCellBelts()

    if (this.highlightedBeltIds.size > 0) {
      for (const [, mesh] of this.beltMeshes) {
        const ids = this.cellBeltIds.get(mesh)
        if (ids && ids.some(id => this.highlightedBeltIds.has(id))) {
          this.applyBeltHighlight(mesh)
        }
      }
    }
  }

  highlightBelts(beltIds: string[]): void {
    this.highlightedBeltIds = new Set(beltIds)
    for (const [, mesh] of this.beltMeshes) {
      const ids = this.cellBeltIds.get(mesh)
      if (ids && ids.some(id => this.highlightedBeltIds.has(id))) {
        this.applyBeltHighlight(mesh)
      } else {
        this.restoreBeltMaterial(mesh)
      }
    }
  }

  clearHighlight(): void {
    this.highlightedBeltIds.clear()
    for (const [, mesh] of this.beltMeshes) {
      this.restoreBeltMaterial(mesh)
    }
  }

  /**
   * Advance the chevron texture scroll by `dt` real seconds.
   *
   * Contract: when `paused === true` (simulation paused or not running),
   * this is a no-op — the chevron offset is not updated regardless of `dt`.
   * Items on belts do not advance while paused, so the chevrons must not
   * advance either, otherwise the visual cue contradicts the sim state.
   *
   * Per-belt cloned chevron materials (one per `(beltLogicalId, direction)`
   * key) advance independently at `belt.speed * BELT_SCROLL_SPEED * dt` UV
   * units per real second, so SET_BELT_SPEED is reflected on screen and
   * two belts of different speeds scroll at different visual rates.
   * `BELT_SCROLL_SPEED` acts as a global rescale factor applied to every
   * belt regardless of whether `getSpeed` is provided.
   *
   * The shared `beltDirectionMaterials` are only used as clone templates
   * for `getOrCreatePerBeltMaterials` — no cell mesh references them in
   * production, so they are NOT ticked here.
   */
  tickChevronScroll(
    dt: number,
    paused: boolean,
    getSpeed?: (beltLogicalId: string) => number,
  ): void {
    if (paused) return
    // Tick the per-belt clones at their per-belt rate. The highlight clones
    // share their `map` reference with the chevron clones of the same
    // (beltId, dir), so updating the chevron map here also advances the
    // highlight view consistently — no separate iteration needed.
    for (const [key, mat] of this.chevronMaterialsByBelt) {
      const map = mat.map
      if (!map) continue
      const sepIdx = key.lastIndexOf('|')
      const beltId = sepIdx >= 0 ? key.slice(0, sepIdx) : key
      const beltSpeed = getSpeed?.(beltId) ?? 1.0
      map.offset.x -= beltSpeed * BeltMeshRenderer.BELT_SCROLL_SPEED * dt
    }
  }

  dispose(): void {
    for (const [, mesh] of this.beltMeshes) {
      this.scene.remove(mesh)
    }
    this.beltMeshes.clear()
    this.cellBeltIds.clear()

    this.disposePerBeltMaterials()

    this.beltGeometry.dispose()
    for (const mat of this.beltDirectionMaterials.values()) {
      if (mat.map) mat.map.dispose()
      mat.dispose()
    }
    this.beltDirectionMaterials.clear()
    this.beltArrowTexture.dispose()
    for (const mat of this.beltHighlightMaterials.values()) {
      mat.dispose()
    }
    this.beltHighlightMaterials.clear()
    this.cornerSideMaterial.dispose()
    this.cornerSideHighlightMaterial.dispose()
    if (this.cornerBeltGeometryFwd) {
      this.cornerBeltGeometryFwd.dispose()
      this.cornerBeltGeometryFwd = null
    }
    if (this.cornerBeltGeometryRev) {
      this.cornerBeltGeometryRev.dispose()
      this.cornerBeltGeometryRev = null
    }
  }

  /**
   * Release all per-(beltLogicalId, direction) cloned materials and their
   * cloned chevron textures. Called on `dispose()` (renderer teardown).
   * The chevron clone OWNS its map; the highlight clone SHARES that same
   * map reference, so the texture must be disposed only once (via the
   * chevron clone) to avoid double-free.
   */
  private disposePerBeltMaterials(): void {
    for (const mat of this.chevronMaterialsByBelt.values()) {
      if (mat.map) mat.map.dispose()
      mat.dispose()
    }
    this.chevronMaterialsByBelt.clear()
    for (const mat of this.chevronHighlightByBelt.values()) {
      // Map is shared with the chevron clone — already disposed above.
      mat.dispose()
    }
    this.chevronHighlightByBelt.clear()
  }

  /**
   * Release per-(beltLogicalId, direction) cloned materials whose
   * `beltLogicalId` is NOT in `currentBeltIds`. Existing belts keep their
   * cached clones (and stable material UUIDs) across rebuilds. The chevron
   * clone OWNS its map; the highlight clone SHARES that same map reference,
   * so the texture is disposed only once (via the chevron clone).
   */
  private disposePerBeltMaterialsForRemovedBelts(
    currentBeltIds: ReadonlySet<string>,
  ): void {
    for (const [key, mat] of this.chevronMaterialsByBelt) {
      const sepIdx = key.lastIndexOf('|')
      const beltId = sepIdx >= 0 ? key.slice(0, sepIdx) : key
      if (currentBeltIds.has(beltId)) continue
      if (mat.map) mat.map.dispose()
      mat.dispose()
      this.chevronMaterialsByBelt.delete(key)
    }
    for (const [key, mat] of this.chevronHighlightByBelt) {
      const sepIdx = key.lastIndexOf('|')
      const beltId = sepIdx >= 0 ? key.slice(0, sepIdx) : key
      if (currentBeltIds.has(beltId)) continue
      // Map is shared with the chevron clone — already disposed above.
      mat.dispose()
      this.chevronHighlightByBelt.delete(key)
    }
  }

  /**
   * Lazily create — or return the existing — per-(beltLogicalId, direction)
   * cloned chevron + highlight materials. The chevron clone owns its own
   * cloned texture map (so per-belt UV offsets advance independently); the
   * highlight clone shares that same map reference (so highlight chevrons
   * scroll at the same per-belt rate without a second tick step).
   */
  private getOrCreatePerBeltMaterials(
    beltId: string,
    dir: BeltDirection,
  ): { chevron: THREE.MeshStandardMaterial; highlight: THREE.MeshStandardMaterial } {
    const key = `${beltId}|${dir}`
    let chevron = this.chevronMaterialsByBelt.get(key)
    if (!chevron) {
      const baseMat =
        this.beltDirectionMaterials.get(dir) ?? this.beltDirectionMaterials.get('east')!
      chevron = baseMat.clone()
      if (baseMat.map) {
        chevron.map = baseMat.map.clone()
        chevron.map.needsUpdate = true
      }
      this.chevronMaterialsByBelt.set(key, chevron)
    }
    let highlight = this.chevronHighlightByBelt.get(key)
    if (!highlight) {
      const baseHl =
        this.beltHighlightMaterials.get(dir) ?? this.beltHighlightMaterials.get('east')!
      highlight = baseHl.clone()
      // Share the per-belt chevron's cloned map so highlight scrolls in lock-step.
      highlight.map = chevron.map
      this.chevronHighlightByBelt.set(key, highlight)
    }
    return { chevron, highlight }
  }

  private restoreBeltMaterial(mesh: THREE.Mesh): void {
    const isCorner = mesh.geometry !== this.beltGeometry
    const beltLogicalId = (mesh.userData.beltLogicalId as string | null | undefined) ?? null
    if (isCorner) {
      const dirMat = beltLogicalId
        ? this.getOrCreatePerBeltMaterials(beltLogicalId, 'east').chevron
        : this.beltDirectionMaterials.get('east')!
      mesh.material = [dirMat, this.cornerSideMaterial]
    } else {
      const dir = (mesh.userData.flowDir as BeltDirection) ?? 'east'
      const dirMat = beltLogicalId
        ? this.getOrCreatePerBeltMaterials(beltLogicalId, dir).chevron
        : (this.beltDirectionMaterials.get(dir) ?? this.beltDirectionMaterials.get('east')!)
      mesh.material = [dirMat, this.cornerSideMaterial]
    }
  }

  private applyBeltHighlight(mesh: THREE.Mesh): void {
    const isCorner = mesh.geometry !== this.beltGeometry
    const dir = isCorner ? 'east' : ((mesh.userData.flowDir as BeltDirection) ?? 'east')
    const beltLogicalId = (mesh.userData.beltLogicalId as string | null | undefined) ?? null
    const hlMat = beltLogicalId
      ? this.getOrCreatePerBeltMaterials(beltLogicalId, dir).highlight
      : (this.beltHighlightMaterials.get(dir) ?? this.beltHighlightMaterials.get('east')!)
    mesh.material = isCorner ? [hlMat, this.cornerSideHighlightMaterial] : hlMat
  }

  private renderCellBelts(): void {
    const belts = this.factory.getBelts()
    if (belts.length === 0) return

    const cellMap = new Map<string, CellBeltInfo>()
    const addDir = (x: number, z: number, dx: number, dz: number, belt: BeltInfo, isFrom: boolean) => {
      const key = `${x},${z}`
      let info = cellMap.get(key)
      if (!info) {
        info = { directions: new Set(), beltIds: [], flowBelt: null }
        cellMap.set(key, info)
      }
      info.directions.add(`${dx},${dz}`)
      if (!info.beltIds.includes(belt.id)) info.beltIds.push(belt.id)
      if (isFrom && !info.flowBelt) info.flowBelt = belt
      if (!info.flowBelt) info.flowBelt = belt
    }

    for (const belt of belts) {
      for (let i = 0; i < belt.path.length - 1; i++) {
        const segFrom = belt.path[i]
        const segTo = belt.path[i + 1]
        const dx = segTo.x - segFrom.x
        const dz = segTo.z - segFrom.z
        addDir(segFrom.x, segFrom.z, dx, dz, belt, i === 0)
        addDir(segTo.x, segTo.z, -dx, -dz, belt, false)
      }
    }

    for (const [key, info] of cellMap) {
      const [x, z] = key.split(',').map(Number)
      if (this.factory.getMachineAt(x, z)) continue

      const dirs = [...info.directions].map(d => {
        const p = d.split(',').map(Number)
        return { dx: p[0], dz: p[1] }
      })
      const worldPos = this.gridToWorld(x, z)

      if (dirs.length === 2) {
        const [d1, d2] = dirs
        const isCollinear = d1.dx + d2.dx === 0 && d1.dz + d2.dz === 0

        if (isCollinear) {
          const isHorizontal = d1.dx !== 0
          const dir = this.getCellFlowDirection(x, z, info)
          const beltLogicalId = info.flowBelt?.id ?? null
          const material = beltLogicalId
            ? this.getOrCreatePerBeltMaterials(beltLogicalId, dir).chevron
            : (this.beltDirectionMaterials.get(dir) ?? this.beltDirectionMaterials.get('east')!)
          const mesh = new THREE.Mesh(this.beltGeometry, [material, this.cornerSideMaterial])
          mesh.userData.flowDir = dir
          mesh.userData.beltLogicalId = beltLogicalId
          mesh.scale.set(isHorizontal ? 1.0 : BELT_WIDTH, 1, isHorizontal ? BELT_WIDTH : 1.0)
          mesh.position.set(worldPos.x, 0.025, worldPos.z)
          mesh.receiveShadow = true
          this.scene.add(mesh)
          this.beltMeshes.set(`cell_${x}_${z}`, mesh)
          this.cellBeltIds.set(mesh, info.beltIds)
        } else {
          const horiz = d1.dx !== 0 ? d1 : d2
          const vert = d1.dz !== 0 ? d1 : d2
          const offset = getCornerOffset(horiz.dx, vert.dz)
          const rotationY = getCornerRotation(horiz.dx, vert.dz)

          if (!this.cornerBeltGeometryFwd) {
            this.cornerBeltGeometryFwd = createCornerBeltGeometry(0.05, false)
            this.cornerBeltGeometryRev = createCornerBeltGeometry(0.05, true)
          }

          const cross = horiz.dx * vert.dz - horiz.dz * vert.dx
          let useReverseUV = cross <= 0

          if (info.flowBelt) {
            const fb = info.flowBelt
            const idx = fb.path.findIndex(p => p.x === x && p.z === z)
            if (idx >= 0) {
              let flowIsVertToHoriz = false
              if (idx < fb.path.length - 1) {
                flowIsVertToHoriz = fb.path[idx + 1].x - x !== 0
              } else if (idx > 0) {
                flowIsVertToHoriz = fb.path[idx - 1].z !== z
              }
              if (flowIsVertToHoriz) useReverseUV = !useReverseUV
            }
          }

          const cornerGeo = useReverseUV ? this.cornerBeltGeometryRev! : this.cornerBeltGeometryFwd!
          const beltLogicalId = info.flowBelt?.id ?? null
          const beltMat = beltLogicalId
            ? this.getOrCreatePerBeltMaterials(beltLogicalId, 'east').chevron
            : this.beltDirectionMaterials.get('east')!
          const mesh = new THREE.Mesh(cornerGeo, [beltMat, this.cornerSideMaterial])
          mesh.userData.beltLogicalId = beltLogicalId
          mesh.position.set(worldPos.x + offset.x, 0, worldPos.z + offset.z)
          mesh.rotation.y = rotationY
          mesh.receiveShadow = true
          this.scene.add(mesh)
          this.beltMeshes.set(`corner_${x}_${z}`, mesh)
          this.cellBeltIds.set(mesh, info.beltIds)
        }
      } else if (dirs.length === 1) {
        const d = dirs[0]
        const isHorizontal = d.dx !== 0
        const dir = this.getCellFlowDirection(x, z, info)
        const beltLogicalId = info.flowBelt?.id ?? null
        const material = beltLogicalId
          ? this.getOrCreatePerBeltMaterials(beltLogicalId, dir).chevron
          : (this.beltDirectionMaterials.get(dir) ?? this.beltDirectionMaterials.get('east')!)
        const mesh = new THREE.Mesh(this.beltGeometry, [material, this.cornerSideMaterial])
        mesh.userData.flowDir = dir
        mesh.userData.beltLogicalId = beltLogicalId
        mesh.scale.set(isHorizontal ? 0.5 : BELT_WIDTH, 1, isHorizontal ? BELT_WIDTH : 0.5)
        mesh.position.set(worldPos.x + d.dx * 0.25, 0.025, worldPos.z + d.dz * 0.25)
        mesh.receiveShadow = true
        this.scene.add(mesh)
        this.beltMeshes.set(`cell_${x}_${z}`, mesh)
        this.cellBeltIds.set(mesh, info.beltIds)
      }
    }
  }

  private getCellFlowDirection(x: number, z: number, info: { flowBelt: BeltInfo | null }): BeltDirection {
    if (!info.flowBelt) return 'east'
    const path = info.flowBelt.path
    const idx = path.findIndex(p => p.x === x && p.z === z)
    if (idx >= 0 && idx < path.length - 1) {
      return this.getSegmentDirection(path[idx], path[idx + 1])
    }
    if (idx > 0) {
      return this.getSegmentDirection(path[idx - 1], path[idx])
    }
    if (path.length >= 2) return this.getSegmentDirection(path[0], path[1])
    return 'east'
  }

  private getSegmentDirection(from: { x: number; z: number }, to: { x: number; z: number }): BeltDirection {
    const dx = to.x - from.x
    const dz = to.z - from.z
    if (dx > 0) return 'east'
    if (dx < 0) return 'west'
    if (dz > 0) return 'south'
    return 'north'
  }
}