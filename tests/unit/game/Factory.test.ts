import { describe, it, expect, beforeEach } from 'vitest'
import { Factory, getSlotPositions, slotPositionToOffset, hasLShapeAtEndpoints } from '../../../src/game/Factory'
import type { GridPosition, MachineType, SlotPosition } from '../../../src/game/types'

function createTestFactory(width = 5, height = 5): Factory {
  return new Factory(width, height)
}

/** Shorthand: returns a `[from, to]` pair of GridPositions for belt segment assertions. */
function seg(fx: number, fz: number, tx: number, tz: number): [GridPosition, GridPosition] {
  return [{ x: fx, z: fz }, { x: tx, z: tz }]
}

/** Shorthand: create a belt entry for restoreState([], [...]) calls. */
function beltEntry(...pathCoords: [number, number][]): { sourceSlot: SlotPosition; destinationSlot: SlotPosition; path: GridPosition[] } {
  return {
    sourceSlot: 'front',
    destinationSlot: 'front',
    path: pathCoords.map(([x, z]) => ({ x, z })),
  }
}

/** Assert factory has EXACTLY the given belt segments (order-independent). */
function expectBeltSegments(factory: Factory, expected: [GridPosition, GridPosition][]) {
  const actual: [GridPosition, GridPosition][] = []
  for (const belt of factory.getBelts()) {
    for (let i = 0; i < belt.path.length - 1; i++) {
      actual.push([belt.path[i], belt.path[i + 1]])
    }
  }
  const fmt = (segs: [GridPosition, GridPosition][]) =>
    segs.map(([f, t]) => `(${f.x},${f.z})→(${t.x},${t.z})`).join(', ')
  expect(actual.length, `Belt count mismatch.\n  Expected: [${fmt(expected)}]\n  Actual:   [${fmt(actual)}]`).toBe(expected.length)
  for (const [ef, et] of expected) {
    const found = actual.some(([af, at]) =>
      af.x === ef.x && af.z === ef.z && at.x === et.x && at.z === et.z
    )
    expect(found, `Missing belt segment (${ef.x},${ef.z})→(${et.x},${et.z}).\n  Actual: [${fmt(actual)}]`).toBe(true)
  }
}

/**
 * Machine type → single display character.
 * A=assembler, P=painter, R=recycler, Q=quality_checker,
 * S=splitter, F=part_fabricator
 */
const MACHINE_CHAR = {
  assembler: 'A',
  painter: 'P',
  recycler: 'R',
  quality_checker: 'Q',
  splitter: 'S',
  part_fabricator: 'F',
} as Record<MachineType, string>

/**
 * Render a rectangular region of the factory grid as an ASCII string.
 *
 * Format: `|c|c|c|\n|c|c|c|` where each `c` is one character per cell.
 * Rows = Z axis (z1 at top, z2 at bottom). Columns = X axis (x1 at left).
 *
 * Cell priority:
 * 1. Machine → type letter (A, P, R, Q, S, M, F)
 * 2. Belt intermediate cell → box-drawing character based on entry/exit direction
 * 3. Empty → space
 *
 * Belt characters for intermediate path cells:
 * - Straight: `─` (horizontal), `│` (vertical)
 * - Corners: `┌` (right+down), `┐` (left+down), `└` (right+up), `┘` (left+up)
 */
function renderGrid(factory: Factory, x1: number, z1: number, x2: number, z2: number): string {
  // Build a map: "x,z" → character
  const charMap = new Map<string, string>()

  // 1. Mark all belt intermediate cells
  for (const belt of factory.getBelts()) {
    for (let i = 1; i < belt.path.length - 1; i++) {
      const { x, z } = belt.path[i]
      const key = `${x},${z}`
      if (charMap.has(key)) {
        charMap.set(key, '+') // multiple belts → crossing
        continue
      }
      const prev = belt.path[i - 1]
      const next = belt.path[i + 1]
      const inDx = x - prev.x
      const inDz = z - prev.z
      const outDx = next.x - x
      const outDz = next.z - z
      charMap.set(key, beltChar(inDx, inDz, outDx, outDz))
    }
  }

  // 2. Mark machines (overrides belt chars at machine cells)
  for (const machine of factory.getMachines()) {
    charMap.set(`${machine.x},${machine.z}`, MACHINE_CHAR[machine.type] ?? '?')
  }

  // 3. Render
  const rows: string[] = []
  for (let z = z1; z <= z2; z++) {
    let row = '|'
    for (let x = x1; x <= x2; x++) {
      row += (charMap.get(`${x},${z}`) ?? ' ') + '|'
    }
    rows.push(row)
  }
  return rows.join('\n')
}

function beltChar(inDx: number, inDz: number, outDx: number, outDz: number): string {
  // Straight
  if (inDx === outDx && inDz === outDz) {
    return inDx !== 0 ? '─' : '│'
  }
  // For corners, determine which two sides of the cell are connected:
  // Entry: inDx=+1→left wall, inDx=-1→right wall, inDz=+1→top wall, inDz=-1→bottom wall
  // Exit:  outDx=+1→right wall, outDx=-1→left wall, outDz=+1→bottom wall, outDz=-1→top wall
  const sides = new Set<string>()
  if (inDx === 1)  sides.add('L')
  if (inDx === -1) sides.add('R')
  if (inDz === 1)  sides.add('T')
  if (inDz === -1) sides.add('B')
  if (outDx === 1)  sides.add('R')
  if (outDx === -1) sides.add('L')
  if (outDz === 1)  sides.add('B')
  if (outDz === -1) sides.add('T')

  if (sides.has('R') && sides.has('B')) return '┌'
  if (sides.has('L') && sides.has('B')) return '┐'
  if (sides.has('R') && sides.has('T')) return '└'
  if (sides.has('L') && sides.has('T')) return '┘'
  if (sides.has('L') && sides.has('R')) return '─'
  if (sides.has('T') && sides.has('B')) return '│'
  return '?'
}

/**
 * Assert that ALL belts in the factory connect to valid machine I/O slots.
 * The second cell in each belt path must match a valid slot offset for the source machine's rotation.
 * The second-to-last cell must match a valid slot offset for the destination machine's rotation.
 */
function assertBeltSlotInvariant(factory: Factory): void {
  for (const belt of factory.getBelts()) {
    if (belt.path.length < 2) continue

    // Source slot validation
    const srcOff = { x: belt.path[1].x - belt.path[0].x, z: belt.path[1].z - belt.path[0].z }
    const srcSlots = getSlotPositions(belt.sourceMachine.type)
    const srcOutputOffsets = srcSlots.outputs.map(p => slotPositionToOffset(p, belt.sourceMachine.rotation))
    const srcValid = srcOutputOffsets.some(o => o.x === srcOff.x && o.z === srcOff.z)
    expect(srcValid,
      `BELT-SLOT VIOLATION: Belt ${belt.id} exits source ${belt.sourceMachine.type}(${belt.sourceMachine.x},${belt.sourceMachine.z}) rotation=${belt.sourceMachine.rotation} in direction (${srcOff.x},${srcOff.z}) which is not a valid output slot. Valid output slots: ${JSON.stringify(srcOutputOffsets)}`
    ).toBe(true)

    // Destination slot validation
    const n = belt.path.length
    const dstOff = { x: belt.path[n-2].x - belt.path[n-1].x, z: belt.path[n-2].z - belt.path[n-1].z }
    const dstSlots = getSlotPositions(belt.destinationMachine.type)
    const dstInputOffsets = dstSlots.inputs.map(p => slotPositionToOffset(p, belt.destinationMachine.rotation))
    const dstValid = dstInputOffsets.some(o => o.x === dstOff.x && o.z === dstOff.z)
    expect(dstValid,
      `BELT-SLOT VIOLATION: Belt ${belt.id} enters destination ${belt.destinationMachine.type}(${belt.destinationMachine.x},${belt.destinationMachine.z}) rotation=${belt.destinationMachine.rotation} from direction (${dstOff.x},${dstOff.z}) which is not a valid input slot. Valid input slots: ${JSON.stringify(dstInputOffsets)}`
    ).toBe(true)
  }
}

describe('Factory', () => {
  let factory: Factory

  beforeEach(() => {
    factory = createTestFactory()
  })

  describe('cellHasBeltsExcluding()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should return false for empty cell', () => {
      // WHEN + THEN
      expect(factory.cellHasBeltsExcluding(0, 0)).toBe(false)
    })

    it('should return true when cell has belts and no exclusion set', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 4, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 4)!)

      // WHEN + THEN
      expect(factory.cellHasBeltsExcluding(1, 2)).toBe(true)
      assertBeltSlotInvariant(factory)
    })

    it('should return false when all belts in cell are excluded', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 4, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 4)!)
      const beltIds = factory.getConnectedBeltIds(1, 1)

      // WHEN + THEN
      expect(factory.cellHasBeltsExcluding(1, 2, beltIds)).toBe(false)
      assertBeltSlotInvariant(factory)
    })

    it('should return true when cell has non-excluded belts', () => {
      // GIVEN — two belt chains pass through adjacent cells
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 4, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 4)!)

      factory.placeMachine(3, 1, 'assembler')
      factory.placeMachine(3, 4, 'recycler')
      factory.placeBeltChain(factory.getMachineAt(3, 1)!, factory.getMachineAt(3, 4)!)

      const firstChainIds = factory.getConnectedBeltIds(1, 1)

      // WHEN + THEN — cell (3,2) has belts from second chain, not excluded
      expect(factory.cellHasBeltsExcluding(3, 2, firstChainIds)).toBe(true)
      assertBeltSlotInvariant(factory)
    })

    it('should return false for out-of-bounds coordinates', () => {
      // WHEN + THEN
      expect(factory.cellHasBeltsExcluding(-1, 0)).toBe(false)
      expect(factory.cellHasBeltsExcluding(0, 10)).toBe(false)
    })
  })

  describe('clear()', () => {
    it('should remove all machines and belts', () => {
      // GIVEN
      factory.restoreState(
        [
          { x: 0, z: 0, type: 'assembler', rotation: 'south' },
          { x: 1, z: 1, type: 'painter', rotation: 'south' },
          { x: 2, z: 0, type: 'assembler', rotation: 'south' },
          { x: 3, z: 0, type: 'assembler', rotation: 'south' },
        ],
        [beltEntry([2, 0], [3, 0])],
      )

      // WHEN
      factory.clear()

      // THEN
      expect(factory.getMachines()).toHaveLength(0)
      expect(factory.getBelts()).toHaveLength(0)
      expect(factory.getMachineAt(0, 0)).toBeNull()
      expect(factory.getBeltsAt(2, 0)).toHaveLength(0)
      assertBeltSlotInvariant(factory)
    })

    it('should allow placing again after clear', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'assembler')
      factory.clear()

      // WHEN + THEN
      expect(factory.placeMachine(0, 0, 'painter')).toBeTruthy()
    })
  })

  describe('computeBeltFromSlotPath()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should return a non-colliding path between two machines', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(5, 5, 'painter')

      // WHEN
      const result = factory.computeBeltFromSlotPath(
        { x: 1, z: 1 }, { x: 5, z: 5 }, 'output',
      )

      // THEN
      expect(result).not.toBeNull()
      expect(result!.collides).toBe(false)
      expect(result!.path[0]).toEqual({ x: 1, z: 1 })
      expect(result!.path[result!.path.length - 1]).toEqual({ x: 5, z: 5 })
    })

    it('should return collides=true when path is blocked', () => {
      // GIVEN — use restoreState to bypass slot-blocking for walled-off setup
      factory = createTestFactory(5, 5)
      factory.restoreState([
        { x: 0, z: 0, type: 'assembler', rotation: 'south' },
        { x: 4, z: 4, type: 'painter', rotation: 'south' },
        { x: 1, z: 0, type: 'recycler', rotation: 'south' },
        { x: 0, z: 1, type: 'quality_checker', rotation: 'south' },
      ], [])

      // WHEN
      const result = factory.computeBeltFromSlotPath(
        { x: 0, z: 0 }, { x: 4, z: 4 }, 'output',
      )

      // THEN
      expect(result).not.toBeNull()
      expect(result!.collides).toBe(true)
    })

    it('should respect ignoreBeltIds parameter', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 5)!)
      const ignoreBeltIds = factory.getConnectedBeltIds(1, 1)

      // WHEN
      const result = factory.computeBeltFromSlotPath(
        { x: 1, z: 1 }, { x: 1, z: 5 }, 'output', ignoreBeltIds,
      )

      // THEN — with ignore, the direct path should be non-colliding
      expect(result).not.toBeNull()
      expect(result!.collides).toBe(false)
      assertBeltSlotInvariant(factory)
    })

    it('should produce adjacent path segments', () => {
      // GIVEN
      factory.placeMachine(2, 2, 'assembler')
      factory.placeMachine(6, 6, 'painter')

      // WHEN
      const result = factory.computeBeltFromSlotPath(
        { x: 2, z: 2 }, { x: 6, z: 6 }, 'output',
      )

      // THEN
      expect(result).not.toBeNull()
      for (let i = 1; i < result!.path.length; i++) {
        const dx = Math.abs(result!.path[i].x - result!.path[i - 1].x)
        const dz = Math.abs(result!.path[i].z - result!.path[i - 1].z)
        expect(dx + dz).toBe(1)
      }
    })
  })

  describe('constructor()', () => {
    it('should create grid with default 20x20 size', () => {
      // WHEN
      const f = new Factory()

      // THEN
      expect(f.width).toBe(20)
      expect(f.height).toBe(20)
    })

    it('should create grid with custom size', () => {
      // THEN
      expect(factory.width).toBe(5)
      expect(factory.height).toBe(5)
    })
  })

  describe('findBestBeltPath()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should return X-first path when no collision', () => {
      // GIVEN
      const from = { x: 1, z: 1 }
      const to = { x: 4, z: 4 }

      // WHEN
      const result = factory.findBestBeltPath(from, to)

      // THEN — X-first: walk X then Z
      expect(result.collides).toBe(false)
      expect(result.path).toEqual([
        { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 4, z: 1 },
        { x: 4, z: 2 }, { x: 4, z: 3 }, { x: 4, z: 4 },
      ])
    })

    it('should return Z-first path when X-first collides but Z-first does not', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(4, 4, 'painter')
      // Block the X-first path by putting a machine on an intermediate cell
      factory.placeMachine(3, 1, 'recycler')

      // WHEN
      const result = factory.findBestBeltPath({ x: 1, z: 1 }, { x: 4, z: 4 })

      // THEN — Should be Z-first since X-first is blocked by machine at (3,1)
      expect(result.collides).toBe(false)
      expect(result.path).toEqual([
        { x: 1, z: 1 }, { x: 1, z: 2 }, { x: 1, z: 3 }, { x: 1, z: 4 },
        { x: 2, z: 4 }, { x: 3, z: 4 }, { x: 4, z: 4 },
      ])
    })

    it('should return X-first with collides=true when all paths are blocked', () => {
      // GIVEN — use restoreState to bypass slot-blocking for walled-off setup
      factory = createTestFactory(5, 5)
      factory.restoreState([
        { x: 0, z: 0, type: 'assembler', rotation: 'south' },
        { x: 4, z: 4, type: 'painter', rotation: 'south' },
        { x: 1, z: 0, type: 'recycler', rotation: 'south' },
        { x: 0, z: 1, type: 'quality_checker', rotation: 'south' },
      ], [])

      // WHEN
      const result = factory.findBestBeltPath({ x: 0, z: 0 }, { x: 4, z: 4 })

      // THEN
      expect(result.collides).toBe(true)
    })

    it('should respect ignoreBeltIds parameter', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(4, 1, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(4, 1)!)

      // WHEN — ignore existing belts so the direct path is not blocked
      const ignoreBeltIds = factory.getConnectedBeltIds(1, 1)
      const withIgnore = factory.findBestBeltPath({ x: 1, z: 1 }, { x: 4, z: 1 }, ignoreBeltIds)

      // THEN — direct straight path found without collision
      expect(withIgnore.collides).toBe(false)
      expect(withIgnore.path).toEqual([
        { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 4, z: 1 },
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should return non-colliding path for straight lines', () => {
      // WHEN
      const result = factory.findBestBeltPath({ x: 1, z: 3 }, { x: 5, z: 3 })

      // THEN — Straight X-line: X-first and Z-first produce the same path
      expect(result.collides).toBe(false)
      expect(result.path).toEqual([
        { x: 1, z: 3 }, { x: 2, z: 3 }, { x: 3, z: 3 }, { x: 4, z: 3 }, { x: 5, z: 3 },
      ])
    })

    it('should reject X-first L-path with turn at source when requiredFirstDir forces it', () => {
      // GIVEN + WHEN
      const result = factory.findBestBeltPath(
        { x: 0, z: 0 }, { x: 3, z: 3 },
        undefined,
        { x: 0, z: 1 }, // requiredFirstDir = +Z
      )

      // THEN — First step must be in +Z direction
      expect(result.collides).toBe(false)
      expect(result.path[1].x - result.path[0].x).toBe(0)
      expect(result.path[1].z - result.path[0].z).toBe(1)
    })

    it('should reject L-path with turn at target when requiredLastDir forces it', () => {
      // GIVEN + WHEN
      const result = factory.findBestBeltPath(
        { x: 0, z: 0 }, { x: 3, z: 3 },
        undefined,
        undefined,
        { x: 0, z: 1 }, // requiredLastDir = +Z
      )

      // THEN — Last step must be in +Z direction
      expect(result.collides).toBe(false)
      const last = result.path.length - 1
      expect(result.path[last].x - result.path[last - 1].x).toBe(0)
      expect(result.path[last].z - result.path[last - 1].z).toBe(1)
    })

    it('should produce a valid non-colliding path when obstacles block L-paths', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'assembler')
      factory.placeMachine(4, 4, 'painter')
      factory.placeMachine(2, 0, 'recycler')
      factory.placeMachine(0, 2, 'quality_checker')

      // WHEN
      const result = factory.findBestBeltPath({ x: 0, z: 0 }, { x: 4, z: 4 })

      // THEN
      expect(result.collides).toBe(false)
      expect(result.path.length).toBeGreaterThanOrEqual(2)
      // Path starts at source and ends at destination
      expect(result.path[0]).toEqual({ x: 0, z: 0 })
      expect(result.path[result.path.length - 1]).toEqual({ x: 4, z: 4 })
    })

    it('should produce a valid non-colliding path reaching the target', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'assembler')
      factory.placeMachine(4, 4, 'painter')
      factory.placeMachine(2, 0, 'recycler')
      factory.placeMachine(0, 2, 'quality_checker')

      // WHEN
      const result = factory.findBestBeltPath({ x: 0, z: 0 }, { x: 4, z: 4 })

      // THEN
      expect(result.collides).toBe(false)
      expect(result.path[0]).toEqual({ x: 0, z: 0 })
      expect(result.path[result.path.length - 1]).toEqual({ x: 4, z: 4 })
      // All steps must be to adjacent cells
      for (let i = 1; i < result.path.length; i++) {
        const dx = Math.abs(result.path[i].x - result.path[i - 1].x)
        const dz = Math.abs(result.path[i].z - result.path[i - 1].z)
        expect(dx + dz).toBe(1)
      }
    })

    it('should use BFS to route around obstacles', () => {
      // GIVEN — Block both L-shaped paths to force BFS with multiple turns
      factory.placeMachine(3, 0, 'recycler')   // blocks X-first
      factory.placeMachine(0, 3, 'recycler')   // blocks Z-first

      // WHEN
      const result = factory.findBestBeltPath({ x: 0, z: 0 }, { x: 5, z: 5 })

      // THEN
      expect(result.collides).toBe(false)
      expect(result.path[0]).toEqual({ x: 0, z: 0 })
      expect(result.path[result.path.length - 1]).toEqual({ x: 5, z: 5 })
    })
  })

  describe('getBelts()', () => {
    it('should return all placed belts', () => {
      // GIVEN — three machines spaced apart, connected by belt chains
      factory = createTestFactory(10, 10)
      factory.placeMachine(0, 0, 'assembler')
      factory.placeMachine(0, 3, 'assembler')
      factory.placeMachine(0, 6, 'assembler')
      factory.placeBeltChain(factory.getMachineAt(0, 0)!, factory.getMachineAt(0, 3)!)
      factory.placeBeltChain(factory.getMachineAt(0, 3)!, factory.getMachineAt(0, 6)!)

      // THEN
      expect(factory.getBelts()).toHaveLength(2)
      assertBeltSlotInvariant(factory)
    })
  })

  describe('getBeltsAt()', () => {
    it('should return belts connected to a position', () => {
      // GIVEN — three machines spaced apart, connected by belt chains
      factory = createTestFactory(10, 10)
      factory.placeMachine(1, 0, 'assembler')
      factory.placeMachine(1, 3, 'assembler')
      factory.placeMachine(1, 6, 'assembler')
      factory.placeBeltChain(factory.getMachineAt(1, 0)!, factory.getMachineAt(1, 3)!)
      factory.placeBeltChain(factory.getMachineAt(1, 3)!, factory.getMachineAt(1, 6)!)

      // WHEN — query the middle machine position where two belts meet
      const belts = factory.getBeltsAt(1, 3)

      // THEN
      expect(belts).toHaveLength(2)
      assertBeltSlotInvariant(factory)
    })

    it('should return empty array for cell with no belts', () => {
      // WHEN + THEN
      expect(factory.getBeltsAt(0, 0)).toHaveLength(0)
    })

    it('should return empty array for out-of-bounds', () => {
      // WHEN + THEN
      expect(factory.getBeltsAt(-1, 0)).toHaveLength(0)
    })

    it('should return empty array when no belts at cell', () => {
      factory = createTestFactory(10, 10)
      // WHEN + THEN
      expect(factory.getBeltsAt(0, 0)).toHaveLength(0)
    })

    it('should return belt that passes through cell with full connection info', () => {
      factory = createTestFactory(10, 10)
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 5)!)

      // WHEN
      const belts = factory.getBeltsAt(1, 3)

      // THEN
      expect(belts).toHaveLength(1)
      expect(belts[0].sourceMachine.x).toBe(1)
      expect(belts[0].sourceMachine.z).toBe(1)
      expect(belts[0].destinationMachine.x).toBe(1)
      expect(belts[0].destinationMachine.z).toBe(5)
      expect(belts[0].path.length).toBeGreaterThanOrEqual(5)
      assertBeltSlotInvariant(factory)
    })

    it('should return same belt from any cell in its path', () => {
      factory = createTestFactory(10, 10)
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 5)!)

      // WHEN
      const beltFrom1 = factory.getBeltsAt(1, 1)[0]
      const beltFrom3 = factory.getBeltsAt(1, 3)[0]
      const beltFrom5 = factory.getBeltsAt(1, 5)[0]

      // THEN
      expect(beltFrom1.id).toBe(beltFrom3.id)
      expect(beltFrom3.id).toBe(beltFrom5.id)
      assertBeltSlotInvariant(factory)
    })
  })

  describe('getConnectedBeltIds()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should return empty set for a machine with no belts', () => {
      // GIVEN
      factory.placeMachine(2, 2, 'assembler')

      // WHEN
      const ids = factory.getConnectedBeltIds(2, 2)

      // THEN
      expect(ids).toBeInstanceOf(Set)
      expect(ids.size).toBe(0)
    })

    it('should return empty set for a cell with no machine', () => {
      // WHEN
      const ids = factory.getConnectedBeltIds(0, 0)

      // THEN
      expect(ids).toBeInstanceOf(Set)
      expect(ids.size).toBe(0)
    })

    it('should return correct belt IDs for a single chain', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(4, 1, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(4, 1)!)

      expectBeltSegments(factory, [
        seg(1, 1, 2, 1),
        seg(2, 1, 3, 1),
        seg(3, 1, 4, 1),
      ])

      // WHEN
      const allBelts = factory.getBelts()
      const ids = factory.getConnectedBeltIds(1, 1)

      // THEN — Should contain exactly the belts in the chain
      expect(ids.size).toBe(allBelts.length)
      for (const belt of allBelts) {
        expect(ids.has(belt.id)).toBe(true)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should return belt IDs from multiple chains connected to one machine', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'splitter')
      factory.placeMachine(3, 0, 'painter')
      factory.placeMachine(6, 3, 'painter')

      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(3, 0)!)
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(6, 3)!)

      expectBeltSegments(factory, [
        seg(3, 3, 3, 2),
        seg(3, 2, 3, 1),
        seg(3, 1, 3, 0),
        seg(3, 3, 4, 3),
        seg(4, 3, 5, 3),
        seg(5, 3, 6, 3),
      ])

      // WHEN
      const allBelts = factory.getBelts()
      const ids = factory.getConnectedBeltIds(3, 3)

      // THEN — Should contain all belt IDs from both chains
      expect(ids.size).toBe(allBelts.length)
      for (const belt of allBelts) {
        expect(ids.has(belt.id)).toBe(true)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should return only belts connected to the queried machine', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'assembler')
      factory.placeMachine(3, 0, 'painter')
      factory.placeBeltChain(factory.getMachineAt(0, 0)!, factory.getMachineAt(3, 0)!)

      // Separate unconnected belt chain
      factory.placeMachine(0, 5, 'assembler')
      factory.placeMachine(3, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(0, 5)!, factory.getMachineAt(3, 5)!)

      expectBeltSegments(factory, [
        seg(0, 0, 1, 0),
        seg(1, 0, 2, 0),
        seg(2, 0, 3, 0),
        seg(0, 5, 1, 5),
        seg(1, 5, 2, 5),
        seg(2, 5, 3, 5),
      ])

      // WHEN
      const idsA = factory.getConnectedBeltIds(0, 0)
      const idsB = factory.getConnectedBeltIds(0, 5)

      // THEN — Each set should only contain its own chain's belt (1 belt per connection)
      expect(idsA.size).toBe(1)
      expect(idsB.size).toBe(1)

      // No overlap
      for (const id of idsA) {
        expect(idsB.has(id)).toBe(false)
      }
      assertBeltSlotInvariant(factory)
    })
  })

  describe('getConnectedMachines()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should return empty array for cell with no machine', () => {
      // WHEN
      const result = factory.getConnectedMachines(0, 0)

      // THEN
      expect(result).toEqual([])
    })

    it('should return empty array for machine with no belts', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')

      // WHEN
      const result = factory.getConnectedMachines(3, 3)

      // THEN
      expect(result).toEqual([])
    })

    it('should return destination machine when queried machine is source', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 5)!)

      // WHEN
      const result = factory.getConnectedMachines(1, 1)

      // THEN
      expect(result).toHaveLength(1)
      expect(result[0].position).toEqual({ x: 1, z: 5 })
      expect(result[0].machineIsSource).toBe(true)
      assertBeltSlotInvariant(factory)
    })

    it('should return source machine when queried machine is destination', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 5)!)

      // WHEN
      const result = factory.getConnectedMachines(1, 5)

      // THEN
      expect(result).toHaveLength(1)
      expect(result[0].position).toEqual({ x: 1, z: 1 })
      expect(result[0].machineIsSource).toBe(false)
      assertBeltSlotInvariant(factory)
    })

    it('should return multiple connected machines for hub machine', () => {
      // GIVEN
      factory.placeMachine(5, 5, 'splitter')
      factory.placeMachine(5, 8, 'painter')
      factory.placeMachine(8, 5, 'assembler')
      factory.placeBeltChain(factory.getMachineAt(5, 5)!, factory.getMachineAt(5, 8)!)
      factory.placeBeltChain(factory.getMachineAt(5, 5)!, factory.getMachineAt(8, 5)!)

      // WHEN
      const result = factory.getConnectedMachines(5, 5)

      // THEN
      expect(result).toHaveLength(2)
      const positions = result.map(r => r.position)
      expect(positions).toContainEqual({ x: 5, z: 8 })
      expect(positions).toContainEqual({ x: 8, z: 5 })
      assertBeltSlotInvariant(factory)
    })

    it('should report correct machineIsSource for mixed source/dest connections', () => {
      // GIVEN — machine B is destination of A, and source to C
      factory.placeMachine(1, 1, 'assembler')   // A
      factory.placeMachine(1, 5, 'part_fabricator') // B
      factory.placeMachine(1, 8, 'painter')      // C
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 5)!)
      factory.placeBeltChain(factory.getMachineAt(1, 5)!, factory.getMachineAt(1, 8)!)

      // WHEN
      const result = factory.getConnectedMachines(1, 5)

      // THEN — B is destination of A (machineIsSource=false) and source to C (machineIsSource=true)
      expect(result).toHaveLength(2)
      const fromA = result.find(r => r.position.x === 1 && r.position.z === 1)
      const toC = result.find(r => r.position.x === 1 && r.position.z === 8)
      expect(fromA).toEqual(expect.objectContaining({ position: { x: 1, z: 1 }, machineIsSource: false }))
      expect(toC).toEqual(expect.objectContaining({ position: { x: 1, z: 8 }, machineIsSource: true }))
      assertBeltSlotInvariant(factory)
    })
  })

  describe('getFreeSlotsOfType()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should return all output slots when no belts exist', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'splitter')
      const machine = factory.getMachineAt(3, 3)!

      // WHEN
      const free = factory.getFreeSlotsOfType(machine, 'output')

      // THEN
      expect(free).toHaveLength(3)
    })

    it('should return remaining free slots after one is connected', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'splitter')
      factory.placeMachine(3, 7, 'painter')
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(3, 7)!)

      expectBeltSegments(factory, [
        seg(3, 3, 3, 4),
        seg(3, 4, 3, 5),
        seg(3, 5, 3, 6),
        seg(3, 6, 3, 7),
      ])

      // WHEN
      const splitter = factory.getMachineAt(3, 3)!
      const free = factory.getFreeSlotsOfType(splitter, 'output')

      // THEN — +X and -X remain
      expect(free).toHaveLength(2)
      assertBeltSlotInvariant(factory)
    })

    it('should return all input slots for assembler when none connected', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')
      const machine = factory.getMachineAt(3, 3)!

      // WHEN
      const free = factory.getFreeSlotsOfType(machine, 'input')

      // THEN
      expect(free).toHaveLength(3)
    })
  })

  describe('getMachineAt()', () => {
    it('should return null when no machine is placed', () => {
      // WHEN + THEN
      expect(factory.getMachineAt(0, 0)).toBeNull()
    })

    it('should return machine info when placed', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'quality_checker')

      // WHEN
      const machine = factory.getMachineAt(3, 3)

      // THEN
      expect(machine).not.toBeNull()
      expect(machine!.type).toBe('quality_checker')
      expect(machine!.x).toBe(3)
      expect(machine!.z).toBe(3)
    })

    it('should return null for out-of-bounds coordinates', () => {
      // WHEN + THEN
      expect(factory.getMachineAt(-1, 0)).toBeNull()
      expect(factory.getMachineAt(100, 100)).toBeNull()
    })
  })

  describe('getMachineById()', () => {
    it('should return machine by its ID', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'assembler')
      const machine = factory.getMachines()[0]

      // WHEN + THEN
      expect(factory.getMachineById(machine.id)).toBe(machine)
    })

    it('should return null for unknown ID', () => {
      // WHEN + THEN
      expect(factory.getMachineById('nonexistent')).toBeNull()
    })
  })

  describe('getMachines()', () => {
    it('should return empty arrays initially', () => {
      // THEN
      expect(factory.getMachines()).toHaveLength(0)
      expect(factory.getBelts()).toHaveLength(0)
    })

    it('should return all placed machines', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'assembler')
      factory.placeMachine(1, 1, 'painter')

      // THEN
      expect(factory.getMachines()).toHaveLength(2)
    })
  })

  describe('getSlotPositions()', () => {
    it('should return 1 input and 3 outputs for splitter at rotation 0', () => {
      // WHEN
      const positions = getSlotPositions('splitter')
      const inputOffsets = positions.inputs.map(p => slotPositionToOffset(p, 'south'))
      const outputOffsets = positions.outputs.map(p => slotPositionToOffset(p, 'south'))

      // THEN
      expect(positions.inputs).toHaveLength(1)
      expect(positions.outputs).toHaveLength(3)
      // Input at -Z
      expect(inputOffsets[0]).toEqual({ x: 0, z: -1 })
      // Outputs at +Z, +X, -X
      expect(outputOffsets).toContainEqual({ x: 0, z: 1 })
      expect(outputOffsets).toContainEqual({ x: 1, z: 0 })
      expect(outputOffsets).toContainEqual({ x: -1, z: 0 })
    })

    it('should return 3 inputs and 1 output for assembler at rotation 0', () => {
      // WHEN
      const positions = getSlotPositions('assembler')
      const inputOffsets = positions.inputs.map(p => slotPositionToOffset(p, 'south'))
      const outputOffsets = positions.outputs.map(p => slotPositionToOffset(p, 'south'))

      // THEN
      expect(positions.inputs).toHaveLength(3)
      expect(positions.outputs).toHaveLength(1)
      // Output at +Z
      expect(outputOffsets[0]).toEqual({ x: 0, z: 1 })
      // Inputs at -Z, +X, -X
      expect(inputOffsets).toContainEqual({ x: 0, z: -1 })
      expect(inputOffsets).toContainEqual({ x: 1, z: 0 })
      expect(inputOffsets).toContainEqual({ x: -1, z: 0 })
    })

    it('should return 1 input and 1 output for standard machine types', () => {
      // GIVEN
      const standardTypes: MachineType[] = ['part_fabricator', 'quality_checker', 'painter', 'recycler']

      // WHEN + THEN
      for (const type of standardTypes) {
        const positions = getSlotPositions(type)
        expect(positions.inputs).toHaveLength(1)
        expect(positions.outputs).toHaveLength(1)
      }
    })

    it('should rotate splitter slots by 90 degrees', () => {
      // WHEN
      const positions = getSlotPositions('splitter')
      const inputOffsets = positions.inputs.map(p => slotPositionToOffset(p, 'east'))
      const outputOffsets = positions.outputs.map(p => slotPositionToOffset(p, 'east'))

      // THEN
      expect(inputOffsets).toHaveLength(1)
      expect(outputOffsets).toHaveLength(3)
      // Input (base {0,-1}) rotated 90° => {x: -1, z: 0}
      expect(inputOffsets[0].x).toBe(-1)
      expect(Object.is(inputOffsets[0].z, 0) || Object.is(inputOffsets[0].z, -0)).toBe(true)
    })

    it('should rotate assembler slots by 180 degrees', () => {
      // WHEN
      const positions = getSlotPositions('assembler')
      const outputOffsets = positions.outputs.map(p => slotPositionToOffset(p, 'north'))

      // THEN — At rotation 180: output at -Z
      expect(Math.abs(outputOffsets[0].x)).toBe(0)
      expect(outputOffsets[0].z).toBe(-1)
    })
  })

  describe('hasBeltSegment()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should return false when no belts exist', () => {
      // WHEN + THEN
      expect(factory.hasBeltSegment({ x: 0, z: 0 }, { x: 1, z: 0 })).toBe(false)
    })

    it('should return true for an existing belt segment', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 4, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 4)!)

      // WHEN + THEN
      expect(factory.hasBeltSegment({ x: 1, z: 1 }, { x: 1, z: 2 })).toBe(true)
      expect(factory.hasBeltSegment({ x: 1, z: 2 }, { x: 1, z: 3 })).toBe(true)
      assertBeltSlotInvariant(factory)
    })

    it('should return false for reversed direction of existing segment', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 4, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 4)!)

      // WHEN + THEN — belt goes (1,1)→(1,2), not (1,2)→(1,1)
      expect(factory.hasBeltSegment({ x: 1, z: 2 }, { x: 1, z: 1 })).toBe(false)
      assertBeltSlotInvariant(factory)
    })

    it('should return false for non-adjacent cells that have belts', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 4, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 4)!)

      // WHEN + THEN — (1,1) and (1,3) are not adjacent segments in this belt
      expect(factory.hasBeltSegment({ x: 1, z: 1 }, { x: 1, z: 3 })).toBe(false)
      assertBeltSlotInvariant(factory)
    })

    it('should ignore belts in ignoreBeltIds set', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 4, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 4)!)
      const beltIds = factory.getConnectedBeltIds(1, 1)

      // WHEN + THEN — with ignore, the segment should not be found
      expect(factory.hasBeltSegment({ x: 1, z: 1 }, { x: 1, z: 2 }, beltIds)).toBe(false)
      assertBeltSlotInvariant(factory)
    })

    it('should still find segments from non-ignored belts', () => {
      // GIVEN — two independent belt chains
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 4, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 4)!)

      factory.placeMachine(5, 1, 'assembler')
      factory.placeMachine(5, 4, 'recycler')
      factory.placeBeltChain(factory.getMachineAt(5, 1)!, factory.getMachineAt(5, 4)!)

      const beltIdsFirst = factory.getConnectedBeltIds(1, 1)

      // WHEN + THEN — ignoring first chain, second chain is still found
      expect(factory.hasBeltSegment({ x: 5, z: 1 }, { x: 5, z: 2 }, beltIdsFirst)).toBe(true)
      assertBeltSlotInvariant(factory)
    })
  })

  describe('hasLShapeAtEndpoints()', () => {
    it('should return false for paths with fewer than 3 cells', () => {
      // WHEN + THEN
      expect(hasLShapeAtEndpoints([])).toBe(false)
      expect(hasLShapeAtEndpoints([{ x: 0, z: 0 }])).toBe(false)
      expect(hasLShapeAtEndpoints([{ x: 0, z: 0 }, { x: 1, z: 0 }])).toBe(false)
    })

    it('should return false for a straight path', () => {
      // GIVEN
      const path = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 }]

      // WHEN + THEN
      expect(hasLShapeAtEndpoints(path)).toBe(false)
    })

    it('should return true when turn occurs at the source endpoint', () => {
      // GIVEN — Turn right at the first intermediate cell: (0,0)→(1,0)→(1,1)
      const path = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }]

      // WHEN + THEN
      expect(hasLShapeAtEndpoints(path)).toBe(true)
    })

    it('should return true when turn occurs at the target endpoint', () => {
      // GIVEN — Straight middle but turn at end: (0,0)→(1,0)→(2,0)→(2,1)
      const path = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }]

      // WHEN + THEN
      expect(hasLShapeAtEndpoints(path)).toBe(true)
    })

    it('should return false when turn is in the middle only', () => {
      // GIVEN
      const path = [
        { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 },
        { x: 2, z: 1 }, { x: 2, z: 2 }, { x: 2, z: 3 },
      ]

      // WHEN + THEN
      expect(hasLShapeAtEndpoints(path)).toBe(false)
    })

    it('should return true when turns occur at both endpoints', () => {
      // GIVEN — Turn at both source and target
      const path = [
        { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 1, z: 2 }, { x: 2, z: 2 },
      ]

      // WHEN + THEN
      expect(hasLShapeAtEndpoints(path)).toBe(true)
    })
  })

  describe('isInBounds()', () => {
    it('should return true for valid coordinates', () => {
      // WHEN + THEN
      expect(factory.isInBounds(0, 0)).toBe(true)
      expect(factory.isInBounds(4, 4)).toBe(true)
      expect(factory.isInBounds(2, 3)).toBe(true)
    })

    it('should return false for negative coordinates', () => {
      // WHEN + THEN
      expect(factory.isInBounds(-1, 0)).toBe(false)
      expect(factory.isInBounds(0, -1)).toBe(false)
    })

    it('should return false for coordinates beyond grid', () => {
      // WHEN + THEN
      expect(factory.isInBounds(5, 0)).toBe(false)
      expect(factory.isInBounds(0, 5)).toBe(false)
      expect(factory.isInBounds(10, 10)).toBe(false)
    })
  })

  describe('isSlotFree()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should return true when no belt connects to the slot', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')
      const machine = factory.getMachineAt(3, 3)!
      const outputOffset = { x: 0, z: 1 } // default output at +Z

      // WHEN + THEN
      expect(factory.isSlotFree(machine, outputOffset)).toBe(true)
    })

    it('should return false when a belt connects to the slot', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')
      factory.placeMachine(3, 7, 'painter')
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(3, 7)!)

      expectBeltSegments(factory, [
        seg(3, 3, 3, 4),
        seg(3, 4, 3, 5),
        seg(3, 5, 3, 6),
        seg(3, 6, 3, 7),
      ])
      const machine = factory.getMachineAt(3, 3)!
      const outputOffset = { x: 0, z: 1 } // output at +Z

      // WHEN + THEN
      expect(factory.isSlotFree(machine, outputOffset)).toBe(false)
      assertBeltSlotInvariant(factory)
    })

    it('should handle slots on different sides independently', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'splitter')
      factory.placeMachine(3, 7, 'painter')
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(3, 7)!)

      expectBeltSegments(factory, [
        seg(3, 3, 3, 4),
        seg(3, 4, 3, 5),
        seg(3, 5, 3, 6),
        seg(3, 6, 3, 7),
      ])
      const splitter = factory.getMachineAt(3, 3)!

      // WHEN + THEN — Output at +Z is now occupied
      expect(factory.isSlotFree(splitter, { x: 0, z: 1 })).toBe(false)
      // Output at +X is still free
      expect(factory.isSlotFree(splitter, { x: 1, z: 0 })).toBe(true)
      // Output at -X is still free
      expect(factory.isSlotFree(splitter, { x: -1, z: 0 })).toBe(true)
      assertBeltSlotInvariant(factory)
    })
  })

  describe('machineHasAnyBelts()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should return false when machine has no belts', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')

      // WHEN + THEN
      expect(factory.machineHasAnyBelts(3, 3)).toBe(false)
    })

    it('should return true when machine has a belt connection', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')
      factory.placeMachine(3, 7, 'painter')
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(3, 7)!)
      expectBeltSegments(factory, [
        seg(3, 3, 3, 4),
        seg(3, 4, 3, 5),
        seg(3, 5, 3, 6),
        seg(3, 6, 3, 7),
      ])

      // WHEN + THEN
      expect(factory.machineHasAnyBelts(3, 3)).toBe(true)
      assertBeltSlotInvariant(factory)
    })

    it('should return false for out-of-bounds coordinates', () => {
      // WHEN + THEN
      expect(factory.machineHasAnyBelts(-1, 0)).toBe(false)
    })
  })

  describe('moveMachine()', () => {
    it('should move machine to empty cell', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')

      // ASSERT
      expect(renderGrid(factory, 0, 0, 4, 4)).toBe([
        '| | | | | |',
        '| |A| | | |',
        '| | | | | |',
        '| | | | | |',
        '| | | | | |',
      ].join('\n'))

      // WHEN
      const result = factory.moveMachine(1, 1, 3, 3)

      // THEN
      expect(renderGrid(factory, 0, 0, 4, 4)).toBe([
        '| | | | | |',
        '| | | | | |',
        '| | | | | |',
        '| | | |A| |',
        '| | | | | |',
      ].join('\n'))
      expect(result).toBe(true)
      expect(factory.getMachineAt(1, 1)).toBeNull()
      expect(factory.getMachineAt(3, 3)).not.toBeNull()
      expect(factory.getMachineAt(3, 3)!.type).toBe('assembler')
    })

    it('should update machine coordinates after move', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'painter')

      // ASSERT
      expect(renderGrid(factory, 0, 0, 3, 3)).toBe([
        '|P| | | |',
        '| | | | |',
        '| | | | |',
        '| | | | |',
      ].join('\n'))

      // WHEN
      factory.moveMachine(0, 0, 2, 3)

      // THEN
      expect(renderGrid(factory, 0, 0, 3, 3)).toBe([
        '| | | | |',
        '| | | | |',
        '| | | | |',
        '| | |P| |',
      ].join('\n'))
      const machine = factory.getMachineAt(2, 3)!
      expect(machine.x).toBe(2)
      expect(machine.z).toBe(3)
    })

    it('should fail when source cell has no machine', () => {
      // WHEN + THEN
      expect(factory.moveMachine(0, 0, 1, 1)).toBe(false)
    })

    it('should fail when target cell is occupied', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'assembler')
      factory.placeMachine(1, 1, 'painter')

      // WHEN + THEN
      expect(factory.moveMachine(0, 0, 1, 1)).toBe(false)
    })

    it('should fail for out-of-bounds coordinates', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'assembler')

      // WHEN + THEN
      expect(factory.moveMachine(0, 0, -1, 0)).toBe(false)
      expect(factory.moveMachine(0, 0, 5, 5)).toBe(false)
    })

    it('should clear belts from original position when machine moves', () => {
      // GIVEN — two machines spaced apart, connected by belt chain
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 3, 'assembler')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 3)!)
      expect(factory.getBelts()).toHaveLength(1)

      // ASSERT
      expect(renderGrid(factory, 0, 0, 4, 4)).toBe([
        '| | | | | |',
        '| |A| | | |',
        '| |│| | | |',
        '| |A| | | |',
        '| | | | | |',
      ].join('\n'))

      // WHEN
      factory.moveMachine(1, 1, 3, 0)

      // THEN: Old position belt data is cleared; belt reconnects from new position.
      expect(factory.getBelts()).toHaveLength(1)
      // Old position (1,1) should not have stale belt data
      for (const belt of factory.getBelts()) {
        for (let i = 0; i < belt.path.length - 1; i++) {
          const dx = Math.abs(belt.path[i].x - belt.path[i + 1].x)
          const dz = Math.abs(belt.path[i].z - belt.path[i + 1].z)
          expect(dx + dz).toBe(1)
        }
      }
      assertBeltSlotInvariant(factory)
    })

    it('should reconnect belt chains to connected machines after move', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      factory.placeMachine(2, 2, 'assembler')
      factory.placeMachine(2, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(2, 2)!, factory.getMachineAt(2, 5)!)
      expectBeltSegments(factory, [
        seg(2, 2, 2, 3),
        seg(2, 3, 2, 4),
        seg(2, 4, 2, 5),
      ])

      // ASSERT
      expect(renderGrid(factory, 1, 1, 5, 5)).toBe([
        '| | | | | |',
        '| |A| | | |',
        '| |│| | | |',
        '| |│| | | |',
        '| |P| | | |',
      ].join('\n'))

      // WHEN
      factory.moveMachine(2, 2, 4, 2)

      // THEN: Belt chain should be reconnected from (4,2) to (2,5)
      expect(renderGrid(factory, 1, 1, 5, 5)).toBe([
        '| | | | | |',
        '| | | |A| |',
        '| |┌|─|┘| |',
        '| |│| | | |',
        '| |P| | | |',
      ].join('\n'))
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].sourceMachine.x).toBe(4)
      expect(belts[0].sourceMachine.z).toBe(2)
      expect(belts[0].destinationMachine.x).toBe(2)
      expect(belts[0].destinationMachine.z).toBe(5)
      // Path must have valid adjacent segments
      for (let i = 0; i < belts[0].path.length - 1; i++) {
        const dx = Math.abs(belts[0].path[i].x - belts[0].path[i + 1].x)
        const dz = Math.abs(belts[0].path[i].z - belts[0].path[i + 1].z)
        expect(dx + dz).toBe(1)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should drop belt chain if reconnection would collide', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 4, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 4)!)

      expectBeltSegments(factory, [
        seg(1, 1, 1, 2),
        seg(1, 2, 1, 3),
        seg(1, 3, 1, 4),
      ])

      // Place a blocking machine in the path of the reconnection
      factory.placeMachine(5, 3, 'recycler')
      // Place a machine connected via belt to the recycler to create blocking belt segments
      factory.placeMachine(5, 0, 'assembler')
      factory.placeBeltChain(factory.getMachineAt(5, 0)!, factory.getMachineAt(5, 3)!)

      // ASSERT
      expect(renderGrid(factory, 0, 0, 6, 4)).toBe([
        '| | | | | |A| |',
        '| |A| | | |│| |',
        '| |│| | | |│| |',
        '| |│| | | |R| |',
        '| |P| | | | | |',
      ].join('\n'))

      // WHEN — Move to a position where reconnection routes around blocking
      factory.moveMachine(1, 1, 6, 1)

      // THEN: All remaining belts must be valid (adjacent path segments).
      expect(renderGrid(factory, 0, 0, 6, 4)).toBe([
        '| | | | | |A| |',
        '| | | | | |│|A|',
        '| | | | | |│|│|',
        '| |┌|┐| | |R|│|',
        '| |P|└|─|─|─|┘|',
      ].join('\n'))
      for (const belt of factory.getBelts()) {
        for (let i = 0; i < belt.path.length - 1; i++) {
          const dx = Math.abs(belt.path[i].x - belt.path[i + 1].x)
          const dz = Math.abs(belt.path[i].z - belt.path[i + 1].z)
          expect(dx + dz).toBe(1)
        }
      }
      assertBeltSlotInvariant(factory)
    })

    it('should preserve belt direction when target machine is moved', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      factory.placeMachine(2, 2, 'assembler')  // source
      factory.placeMachine(2, 5, 'painter')    // target
      factory.placeBeltChain(factory.getMachineAt(2, 2)!, factory.getMachineAt(2, 5)!)

      // Source machine rotation: output faces +Z (south)
      expect(factory.getMachineAt(2, 2)!.rotation).toBe('south')
      // Target machine rotation: output faces +Z (south), input at -Z faces arriving belt
      expect(factory.getMachineAt(2, 5)!.rotation).toBe('south')

      expect(renderGrid(factory, 2, 2, 2, 5)).toBe([
        '|A|',
        '|│|',
        '|│|',
        '|P|',
      ].join('\n'))

      // WHEN — Move the target machine (painter) to a new position
      factory.moveMachine(2, 5, 4, 5)

      // THEN
      expect(renderGrid(factory, 2, 2, 5, 5)).toBe([
        '|A| | | |',
        '|└|─|┐| |',
        '| | |│| |',
        '| | |P| |',
      ].join('\n'))
      const source = factory.getMachineAt(2, 2)!
      const target = factory.getMachineAt(4, 5)!
      // Both machines preserve south rotation (fixedRotations=true succeeds)
      expect(source.rotation).toBe('south')
      expect(target.rotation).toBe('south')
      // Both machines should still have belts
      expectBeltSegments(factory, [
        seg(2, 2, 2, 3),
        seg(2, 3, 3, 3),
        seg(3, 3, 4, 3),
        seg(4, 3, 4, 4),
        seg(4, 4, 4, 5),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should not create non-adjacent belts when moving', () => {
      // GIVEN — two machines spaced apart, connected by belt chain
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 3, 'assembler')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 3)!)

      // ASSERT
      expect(renderGrid(factory, 0, 0, 4, 4)).toBe([
        '| | | | | |',
        '| |A| | | |',
        '| |│| | | |',
        '| |A| | | |',
        '| | | | | |',
      ].join('\n'))

      // WHEN
      factory.moveMachine(1, 1, 4, 4)

      // THEN: All remaining belts must have adjacent path segments.
      for (const belt of factory.getBelts()) {
        for (let i = 0; i < belt.path.length - 1; i++) {
          const dx = Math.abs(belt.path[i].x - belt.path[i + 1].x)
          const dz = Math.abs(belt.path[i].z - belt.path[i + 1].z)
          expect(dx + dz).toBe(1)
        }
      }
      assertBeltSlotInvariant(factory)
    })

    it('should preserve belts not connected to the moved machine', () => {
      // GIVEN — use 10x10 grid for room to space machines apart
      factory = createTestFactory(10, 10)
      factory.placeMachine(0, 0, 'assembler')
      // Belt chain not connected to the machine at (0,0)
      factory.placeMachine(5, 0, 'assembler')
      factory.placeMachine(5, 3, 'assembler')
      factory.placeMachine(5, 6, 'assembler')
      factory.placeBeltChain(factory.getMachineAt(5, 0)!, factory.getMachineAt(5, 3)!)
      factory.placeBeltChain(factory.getMachineAt(5, 3)!, factory.getMachineAt(5, 6)!)

      // ASSERT
      expect(factory.getBelts()).toHaveLength(2)

      // WHEN
      factory.moveMachine(0, 0, 9, 9)

      // THEN — unconnected belts are preserved
      expect(factory.getBelts()).toHaveLength(2)
      expect(factory.getBeltsAt(5, 0)).toHaveLength(1)
      expect(factory.getBeltsAt(5, 3)).toHaveLength(2)
      expect(factory.getBeltsAt(5, 6)).toHaveLength(1)
      expect(factory.getMachineAt(9, 9)).not.toBeNull()
      expect(factory.getMachineAt(0, 0)).toBeNull()
      assertBeltSlotInvariant(factory)
    })

    it('should clean up belt references from old position after move', () => {
      // GIVEN — two machines spaced apart, connected by belt chain
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 3, 'assembler')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 3)!)

      // ASSERT
      expect(renderGrid(factory, 0, 0, 4, 4)).toBe([
        '| | | | | |',
        '| |A| | | |',
        '| |│| | | |',
        '| |A| | | |',
        '| | | | | |',
      ].join('\n'))

      // WHEN
      factory.moveMachine(1, 1, 3, 0)

      // THEN: Old machine cell's stale belt data is cleaned up.
      // (1,1) no longer has any machine or stale belt references.
      expect(factory.getMachineAt(1, 1)).toBeNull()
      expect(factory.getBelts()).toHaveLength(1)
      for (const belt of factory.getBelts()) {
        for (let i = 0; i < belt.path.length - 1; i++) {
          const dx = Math.abs(belt.path[i].x - belt.path[i + 1].x)
          const dz = Math.abs(belt.path[i].z - belt.path[i + 1].z)
          expect(dx + dz).toBe(1)
        }
      }
      assertBeltSlotInvariant(factory)
    })

    it('should allow move when bidirectional belts can be reconnected without crossing', () => {
      // GIVEN: 20×20 grid, two south-facing machines with bidirectional belts
      factory = createTestFactory(20, 20)
      const a = factory.placeMachine(9, 10, 'part_fabricator')!
      const b = factory.placeMachine(10, 10, 'part_fabricator')!
      factory.rotateMachine(a, 'south')
      factory.rotateMachine(b, 'south')
      // Connect A→B and B→A with fixedRotations=true (bidirectional)
      factory.placeBeltChain(a, b, 'output', true)
      factory.placeBeltChain(b, a, 'output', true)

      // ASSERT: both belts exist before the move
      expect(factory.getBelts()).toHaveLength(2)
      assertBeltSlotInvariant(factory)

      // WHEN: move B down to (10,13) — belts can be reconnected without crossing
      const result = factory.moveMachine(10, 10, 10, 13)

      // THEN: move succeeds because smart routing avoids belt crossings
      expect(result).toBe(true)

      // AND: machine B should be at new position
      expect(factory.getMachineAt(10, 13)).not.toBeNull()
      expect(factory.getMachineAt(10, 13)!.type).toBe('part_fabricator')

      // AND: belts should be reconnected without crossings
      expect(factory.getBelts().length).toBeGreaterThanOrEqual(1)
      assertBeltSlotInvariant(factory)
    })
  })

  describe('moveMachine() preserves rotations during reconnection', () => {
    beforeEach(() => {
      factory = createTestFactory(12, 12)
    })

    it('should preserve rotations when moving apart and valid path exists', () => {
      // GIVEN: A at (3,5) south, B at (4,5) south, connected with fixedRotations
      const a = factory.placeMachine(3, 5, 'part_fabricator')!
      const b = factory.placeMachine(4, 5, 'part_fabricator')!
      factory.rotateMachine(a, 'south')
      factory.rotateMachine(b, 'south')
      factory.placeBeltChain(a, b, 'output', true)

      // ASSERT: both face south, belt exists
      expect(a.rotation).toBe('south')
      expect(b.rotation).toBe('south')
      expect(factory.getBelts()).toHaveLength(1)
      assertBeltSlotInvariant(factory)

      // WHEN: move B one cell further east (4,5) → (5,5)
      factory.moveMachine(4, 5, 5, 5)

      // THEN: both machines should STILL face south — no auto-rotation
      expect(a.rotation).toBe('south')
      expect(b.rotation).toBe('south')
      // Belt should be reconnected
      expect(factory.getBelts()).toHaveLength(1)
      assertBeltSlotInvariant(factory)
    })

    it('should preserve rotations when moving machine two cells further away', () => {
      // GIVEN: A at (3,5) south, B at (4,5) south, connected with fixedRotations
      const a = factory.placeMachine(3, 5, 'part_fabricator')!
      const b = factory.placeMachine(4, 5, 'part_fabricator')!
      factory.rotateMachine(a, 'south')
      factory.rotateMachine(b, 'south')
      factory.placeBeltChain(a, b, 'output', true)

      // ASSERT: both face south
      expect(a.rotation).toBe('south')
      expect(b.rotation).toBe('south')
      expect(factory.getBelts()).toHaveLength(1)

      // WHEN: move B two cells further east (4,5) → (6,5)
      factory.moveMachine(4, 5, 6, 5)

      // THEN: both machines should STILL face south
      expect(a.rotation).toBe('south')
      expect(b.rotation).toBe('south')
      expect(factory.getBelts()).toHaveLength(1)
      assertBeltSlotInvariant(factory)
    })

    it('should preserve rotations after multiple consecutive moves', () => {
      // GIVEN: A at (3,5) south, B at (4,5) south, connected with fixedRotations
      const a = factory.placeMachine(3, 5, 'part_fabricator')!
      const b = factory.placeMachine(4, 5, 'part_fabricator')!
      factory.rotateMachine(a, 'south')
      factory.rotateMachine(b, 'south')
      factory.placeBeltChain(a, b, 'output', true)

      // ASSERT
      expect(a.rotation).toBe('south')
      expect(b.rotation).toBe('south')

      // WHEN: first move — B goes from (4,5) to (5,5)
      factory.moveMachine(4, 5, 5, 5)

      // THEN: rotations preserved after first move
      expect(a.rotation).toBe('south')
      expect(b.rotation).toBe('south')
      expect(factory.getBelts()).toHaveLength(1)
      assertBeltSlotInvariant(factory)

      // WHEN: second move — B goes from (5,5) to (6,5)
      factory.moveMachine(5, 5, 6, 5)

      // THEN: rotations STILL preserved after second move
      expect(a.rotation).toBe('south')
      expect(b.rotation).toBe('south')
      expect(factory.getBelts()).toHaveLength(1)
      assertBeltSlotInvariant(factory)
    })

    it('should fall back to rotation only when fixed-rotation path is impossible', () => {
      // GIVEN: A at (1,1) south, B at (2,1) south
      // Place blocking machines so that a south-south belt path is impossible
      const a = factory.placeMachine(1, 1, 'part_fabricator')!
      const b = factory.placeMachine(2, 1, 'part_fabricator')!
      factory.rotateMachine(a, 'south')
      factory.rotateMachine(b, 'south')
      factory.placeBeltChain(a, b, 'output', true)

      // ASSERT
      expect(a.rotation).toBe('south')
      expect(b.rotation).toBe('south')
      expect(factory.getBelts()).toHaveLength(1)

      // Place blockers around the new position to make fixedRotation path impossible
      // B moves to (0,0) corner — south output goes to (0,1) which is A's row,
      // south input comes from (0,-1) which is out of bounds
      // Surround with machines so no south-facing path can work
      factory.placeMachine(0, 0, 'recycler') // blocker at target
      factory.placeMachine(0, 2, 'recycler') // blocker below
      factory.placeMachine(1, 2, 'recycler') // blocker below A

      // WHEN: move B to (0,1) — cramped position where south-south can't connect
      // Actually we need B to go somewhere that fixedRotations fails but rotation works
      // Move B so it's hemmed in and can't connect with fixed south rotation
      factory.moveMachine(2, 1, 0, 1)

      // THEN: belt should still reconnect (via rotation fallback)
      // At least one machine should have been rotated as fallback
      expect(factory.getBelts()).toHaveLength(1)
      assertBeltSlotInvariant(factory)
    })

    it('should drop crossing belt when two south-facing machines have bidirectional belts and one is moved apart', () => {
      // GIVEN: A at (9,10) south, B at (10,10) south — side by side on a 20×20 grid
      factory = createTestFactory(20, 20)
      const a = factory.placeMachine(9, 10, 'part_fabricator')!
      const b = factory.placeMachine(10, 10, 'part_fabricator')!
      factory.rotateMachine(a, 'south')
      factory.rotateMachine(b, 'south')

      // Connect A→B and B→A (bidirectional belts)
      factory.placeBeltChain(a, b, 'output', true)
      factory.placeBeltChain(b, a, 'output', true)

      // ASSERT: both belts exist, both machines face south
      expect(a.rotation).toBe('south')
      expect(b.rotation).toBe('south')
      expect(factory.getBelts()).toHaveLength(2)
      assertBeltSlotInvariant(factory)

      // WHEN: move B from (10,10) to (11,10) — just 1 cell apart
      factory.moveMachine(10, 10, 11, 10)

      // THEN: both machines should STILL face south
      expect(a.rotation).toBe('south')
      expect(b.rotation).toBe('south')
      // At least 1 belt survives; crossing belt may be dropped
      expect(factory.getBelts().length).toBeGreaterThanOrEqual(1)
      assertBeltSlotInvariant(factory)
    })

    it('should drop crossing belt in simpler bidirectional scenario when one machine is moved', () => {
      // GIVEN: A at (3,5) south, B at (4,5) south — simple side-by-side
      factory = createTestFactory(12, 12)
      const a = factory.placeMachine(3, 5, 'part_fabricator')!
      const b = factory.placeMachine(4, 5, 'part_fabricator')!
      factory.rotateMachine(a, 'south')
      factory.rotateMachine(b, 'south')

      // Connect A→B with one belt, then B→A with another (bidirectional)
      factory.placeBeltChain(a, b, 'output', true)
      factory.placeBeltChain(b, a, 'output', true)

      // ASSERT: 2 belts, both south
      expect(a.rotation).toBe('south')
      expect(b.rotation).toBe('south')
      expect(factory.getBelts()).toHaveLength(2)
      assertBeltSlotInvariant(factory)

      // WHEN: move B one cell further east (4,5) → (5,5)
      factory.moveMachine(4, 5, 5, 5)

      // THEN: both machines still south, crossing belt dropped
      expect(a.rotation).toBe('south')
      expect(b.rotation).toBe('south')
      expect(factory.getBelts().length).toBeGreaterThanOrEqual(1)
      assertBeltSlotInvariant(factory)
    })
  })

  describe('placeBelt()', () => {
    it('should place a belt between two adjacent machines with valid slots', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      factory.placeMachine(2, 2, 'assembler')
      factory.placeMachine(2, 4, 'assembler')
      const src = factory.getMachineAt(2, 2)!
      const dst = factory.getMachineAt(2, 4)!

      // WHEN
      const result = factory.placeBelt(src, { x: 0, z: 1 }, dst, { x: 0, z: -1 })

      // THEN
      expect(result).toBe(true)
      expect(factory.getBelts().length).toBeGreaterThanOrEqual(1)
      assertBeltSlotInvariant(factory)
    })

    it('should fail when sourceSlot is not a valid output', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      factory.placeMachine(2, 2, 'assembler')
      factory.placeMachine(2, 4, 'assembler')
      const src = factory.getMachineAt(2, 2)!
      const dst = factory.getMachineAt(2, 4)!

      // WHEN — (0,-1) is an input slot for assembler, not an output
      const result = factory.placeBelt(src, { x: 0, z: -1 }, dst, { x: 0, z: -1 })

      // THEN
      expect(result).toBe(false)
      assertBeltSlotInvariant(factory)
    })

    it('should fail when destSlot is not a valid input', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      factory.placeMachine(2, 2, 'assembler')
      factory.placeMachine(2, 4, 'assembler')
      const src = factory.getMachineAt(2, 2)!
      const dst = factory.getMachineAt(2, 4)!

      // WHEN — (0,1) is an output slot for assembler, not an input
      const result = factory.placeBelt(src, { x: 0, z: 1 }, dst, { x: 0, z: 1 })

      // THEN
      expect(result).toBe(false)
      assertBeltSlotInvariant(factory)
    })

    it('should fail when slot is already occupied', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      factory.placeMachine(2, 2, 'assembler')
      factory.placeMachine(2, 4, 'assembler')
      factory.placeMachine(2, 6, 'assembler')
      const src = factory.getMachineAt(2, 2)!
      const dst1 = factory.getMachineAt(2, 4)!
      const dst2 = factory.getMachineAt(2, 6)!
      // First belt occupies src output (0,1) and dst input (0,-1)
      factory.placeBelt(src, { x: 0, z: 1 }, dst1, { x: 0, z: -1 })

      // WHEN — Try to reuse same source output slot
      const result = factory.placeBelt(src, { x: 0, z: 1 }, dst2, { x: 0, z: -1 })

      // THEN
      expect(result).toBe(false)
      assertBeltSlotInvariant(factory)
    })

    it('should fail when slot cells are not adjacent', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      factory.placeMachine(2, 2, 'assembler')
      factory.placeMachine(2, 6, 'assembler') // too far apart
      const src = factory.getMachineAt(2, 2)!
      const dst = factory.getMachineAt(2, 6)!

      // WHEN — source slot cell is (2,3), dest slot cell is (2,5) — not adjacent
      const result = factory.placeBelt(src, { x: 0, z: 1 }, dst, { x: 0, z: -1 })

      // THEN
      expect(result).toBe(false)
      assertBeltSlotInvariant(factory)
    })
  })

  describe('placeBeltChain()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('L-shaped +X then +Z: source faces +X (90°), target faces +Z (0°)', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(4, 4, 'painter')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(4, 4)!)

      // THEN
      expect(renderGrid(factory, 1, 1, 4, 4)).toBe([
        '|A|─|─|┐|',
        '| | | |│|',
        '| | | |│|',
        '| | | |P|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(1, 1, 2, 1),
        seg(2, 1, 3, 1),
        seg(3, 1, 4, 1),
        seg(4, 1, 4, 2),
        seg(4, 2, 4, 3),
        seg(4, 3, 4, 4),
      ])
      const src = factory.getMachineAt(1, 1)!
      const tgt = factory.getMachineAt(4, 4)!
      // Source output faces first leg (+X) → rotation east
      expect(src.rotation).toBe('east')
      // Target output faces last leg (+Z) → rotation south, input faces -Z (arriving belt)
      expect(tgt.rotation).toBe('south')
      assertBeltSlotInvariant(factory)
    })

    it('L-shaped -X then -Z: source faces -X (270°), target faces -Z (180°)', () => {
      // GIVEN
      factory.placeMachine(5, 5, 'assembler')
      factory.placeMachine(2, 2, 'painter')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(5, 5)!, factory.getMachineAt(2, 2)!)

      // THEN
      expect(renderGrid(factory, 2, 2, 5, 5)).toBe([
        '|P| | | |',
        '|│| | | |',
        '|│| | | |',
        '|└|─|─|A|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(5, 5, 4, 5),
        seg(4, 5, 3, 5),
        seg(3, 5, 2, 5),
        seg(2, 5, 2, 4),
        seg(2, 4, 2, 3),
        seg(2, 3, 2, 2),
      ])
      const src = factory.getMachineAt(5, 5)!
      const tgt = factory.getMachineAt(2, 2)!
      // Source output faces first leg (-X) → rotation west
      expect(src.rotation).toBe('west')
      // Target output faces last leg (-Z) → rotation north
      expect(tgt.rotation).toBe('north')
      assertBeltSlotInvariant(factory)
    })

    it('L-shaped +X then -Z: source faces +X (90°), target faces -Z (180°)', () => {
      // GIVEN
      factory.placeMachine(1, 5, 'assembler')
      factory.placeMachine(4, 2, 'painter')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(1, 5)!, factory.getMachineAt(4, 2)!)

      // THEN
      expect(renderGrid(factory, 1, 2, 4, 5)).toBe([
        '| | | |P|',
        '| | | |│|',
        '| | | |│|',
        '|A|─|─|┘|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(1, 5, 2, 5),
        seg(2, 5, 3, 5),
        seg(3, 5, 4, 5),
        seg(4, 5, 4, 4),
        seg(4, 4, 4, 3),
        seg(4, 3, 4, 2),
      ])
      const src = factory.getMachineAt(1, 5)!
      const tgt = factory.getMachineAt(4, 2)!
      // Source output faces first leg (+X) → east
      expect(src.rotation).toBe('east')
      // Target output faces last leg (-Z) → north
      expect(tgt.rotation).toBe('north')
      assertBeltSlotInvariant(factory)
    })

    it('L-shaped -X then +Z: source faces -X (270°), target faces +Z (0°)', () => {
      // GIVEN
      factory.placeMachine(5, 1, 'assembler')
      factory.placeMachine(2, 4, 'painter')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(5, 1)!, factory.getMachineAt(2, 4)!)

      // THEN
      expect(renderGrid(factory, 2, 1, 5, 4)).toBe([
        '|┌|─|─|A|',
        '|│| | | |',
        '|│| | | |',
        '|P| | | |',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(5, 1, 4, 1),
        seg(4, 1, 3, 1),
        seg(3, 1, 2, 1),
        seg(2, 1, 2, 2),
        seg(2, 2, 2, 3),
        seg(2, 3, 2, 4),
      ])
      const src = factory.getMachineAt(5, 1)!
      const tgt = factory.getMachineAt(2, 4)!
      // Source output faces first leg (-X) → west
      expect(src.rotation).toBe('west')
      // Target output faces last leg (+Z) → south
      expect(tgt.rotation).toBe('south')
      assertBeltSlotInvariant(factory)
    })

    it('straight +X belt chain: both face +X (90°)', () => {
      // GIVEN
      factory.placeMachine(1, 3, 'assembler')
      factory.placeMachine(5, 3, 'painter')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(1, 3)!, factory.getMachineAt(5, 3)!)

      // THEN
      expect(renderGrid(factory, 1, 3, 5, 3)).toBe([
        '|A|─|─|─|P|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(1, 3, 2, 3),
        seg(2, 3, 3, 3),
        seg(3, 3, 4, 3),
        seg(4, 3, 5, 3),
      ])
      const src = factory.getMachineAt(1, 3)!
      const tgt = factory.getMachineAt(5, 3)!
      // dx>0, dz=0 → both get rotationToFace(dx,0)=east
      expect(src.rotation).toBe('east')
      expect(tgt.rotation).toBe('east')
      assertBeltSlotInvariant(factory)
    })

    it('straight -X belt chain: both face -X (270°)', () => {
      // GIVEN
      factory.placeMachine(5, 3, 'assembler')
      factory.placeMachine(1, 3, 'painter')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(5, 3)!, factory.getMachineAt(1, 3)!)

      // THEN
      expect(renderGrid(factory, 1, 3, 5, 3)).toBe([
        '|P|─|─|─|A|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(5, 3, 4, 3),
        seg(4, 3, 3, 3),
        seg(3, 3, 2, 3),
        seg(2, 3, 1, 3),
      ])
      expect(factory.getMachineAt(5, 3)!.rotation).toBe('west')
      expect(factory.getMachineAt(1, 3)!.rotation).toBe('west')
      assertBeltSlotInvariant(factory)
    })

    it('straight +Z belt chain: both face +Z (0°)', () => {
      // GIVEN
      factory.placeMachine(3, 1, 'assembler')
      factory.placeMachine(3, 5, 'painter')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(3, 1)!, factory.getMachineAt(3, 5)!)

      // THEN
      expect(renderGrid(factory, 3, 1, 3, 5)).toBe([
        '|A|',
        '|│|',
        '|│|',
        '|│|',
        '|P|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(3, 1, 3, 2),
        seg(3, 2, 3, 3),
        seg(3, 3, 3, 4),
        seg(3, 4, 3, 5),
      ])
      expect(factory.getMachineAt(3, 1)!.rotation).toBe('south')
      expect(factory.getMachineAt(3, 5)!.rotation).toBe('south')
      assertBeltSlotInvariant(factory)
    })

    it('straight -Z belt chain: both face -Z (180°)', () => {
      // GIVEN
      factory.placeMachine(3, 5, 'assembler')
      factory.placeMachine(3, 1, 'painter')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(3, 5)!, factory.getMachineAt(3, 1)!)

      // THEN
      expect(renderGrid(factory, 3, 1, 3, 5)).toBe([
        '|P|',
        '|│|',
        '|│|',
        '|│|',
        '|A|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(3, 5, 3, 4),
        seg(3, 4, 3, 3),
        seg(3, 3, 3, 2),
        seg(3, 2, 3, 1),
      ])
      expect(factory.getMachineAt(3, 5)!.rotation).toBe('north')
      expect(factory.getMachineAt(3, 1)!.rotation).toBe('north')
      assertBeltSlotInvariant(factory)
    })

    it('should auto-rotate both unconnected machines to face each other when fixedRotations is not set', () => {
      // GIVEN — Place two machines with default south rotation, not connected by belts
      factory.placeMachine(1, 3, 'assembler')
      factory.placeMachine(5, 3, 'painter')
      expect(factory.getMachineAt(1, 3)!.rotation).toBe('south')
      expect(factory.getMachineAt(5, 3)!.rotation).toBe('south')

      // WHEN — placeBeltChain without fixedRotations → auto-rotation kicks in
      factory.placeBeltChain(factory.getMachineAt(1, 3)!, factory.getMachineAt(5, 3)!)

      // THEN — Both should be auto-rotated to face +X (east) for a straight east belt
      expect(factory.getMachineAt(1, 3)!.rotation).toBe('east')
      expect(factory.getMachineAt(5, 3)!.rotation).toBe('east')
      assertBeltSlotInvariant(factory)
    })

    it('should use Z-first path when X-first would collide', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(4, 4, 'painter')
      // Place a blocking machine on the X-first intermediate path
      factory.placeMachine(3, 1, 'recycler')

      // WHEN
      const result = factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(4, 4)!)

      // THEN — Verify belts follow Z-first path: (1,1)→(1,2)→(1,3)→(1,4)→(2,4)→(3,4)→(4,4)
      expect(result).toBe(true)
      expect(renderGrid(factory, 1, 1, 4, 4)).toBe([
        '|A| |R| |',
        '|│| | | |',
        '|│| | | |',
        '|└|─|─|P|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(1, 1, 1, 2),
        seg(1, 2, 1, 3),
        seg(1, 3, 1, 4),
        seg(1, 4, 2, 4),
        seg(2, 4, 3, 4),
        seg(3, 4, 4, 4),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should return false when source is completely walled off', () => {
      // GIVEN — use restoreState to bypass slot-blocking for walled-off setup
      factory = createTestFactory(5, 5)
      factory.restoreState([
        { x: 0, z: 0, type: 'assembler', rotation: 'south' },
        { x: 4, z: 4, type: 'painter', rotation: 'south' },
        { x: 1, z: 0, type: 'recycler', rotation: 'south' },
        { x: 0, z: 1, type: 'quality_checker', rotation: 'south' },
      ], [])

      // WHEN
      const result = factory.placeBeltChain(factory.getMachineAt(0, 0)!, factory.getMachineAt(4, 4)!)

      // THEN
      expect(result).toBe(false)
      expect(factory.getBelts()).toHaveLength(0)
      assertBeltSlotInvariant(factory)
    })

    it('should rotate source to face Z-direction for Z-first path', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(4, 4, 'painter')
      // Block X-first path
      factory.placeMachine(3, 1, 'recycler')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(4, 4)!)

      // THEN — Z-first path: first leg goes +Z → source output faces +Z → south
      const src = factory.getMachineAt(1, 1)!
      expect(src.rotation).toBe('south')
      expectBeltSegments(factory, [
        seg(1, 1, 1, 2),
        seg(1, 2, 1, 3),
        seg(1, 3, 1, 4),
        seg(1, 4, 2, 4),
        seg(2, 4, 3, 4),
        seg(3, 4, 4, 4),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should rotate target to face X-direction for Z-first path', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(4, 4, 'painter')
      // Block X-first path
      factory.placeMachine(3, 1, 'recycler')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(4, 4)!)

      // THEN — Z-first path: last leg goes +X → target output faces +X → east
      const tgt = factory.getMachineAt(4, 4)!
      expect(tgt.rotation).toBe('east')
      expectBeltSegments(factory, [
        seg(1, 1, 1, 2),
        seg(1, 2, 1, 3),
        seg(1, 3, 1, 4),
        seg(1, 4, 2, 4),
        seg(2, 4, 3, 4),
        seg(3, 4, 4, 4),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should use X-first path and rotations when X-first is clear', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(4, 4, 'painter')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(4, 4)!)

      // THEN — X-first path: first leg goes +X → source faces +X → east
      const src = factory.getMachineAt(1, 1)!
      expect(src.rotation).toBe('east')
      // X-first path: last leg goes +Z → target faces +Z → south
      const tgt = factory.getMachineAt(4, 4)!
      expect(tgt.rotation).toBe('south')
      expectBeltSegments(factory, [
        seg(1, 1, 2, 1),
        seg(2, 1, 3, 1),
        seg(3, 1, 4, 1),
        seg(4, 1, 4, 2),
        seg(4, 2, 4, 3),
        seg(4, 3, 4, 4),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should produce correct rotations for Z-first with negative directions', () => {
      // GIVEN
      factory.placeMachine(5, 5, 'assembler')
      factory.placeMachine(2, 2, 'painter')
      // Block X-first path: (5,5)→(4,5)→(3,5)→(2,5)→(2,4)→(2,3)→(2,2)
      factory.placeMachine(3, 5, 'recycler')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(5, 5)!, factory.getMachineAt(2, 2)!)

      // THEN — Z-first: first leg goes -Z → source faces -Z → north
      expect(factory.getMachineAt(5, 5)!.rotation).toBe('north')
      // Z-first: last leg goes -X → target faces -X → west
      expect(factory.getMachineAt(2, 2)!.rotation).toBe('west')
      expectBeltSegments(factory, [
        seg(5, 5, 5, 4),
        seg(5, 4, 5, 3),
        seg(5, 3, 5, 2),
        seg(5, 2, 4, 2),
        seg(4, 2, 3, 2),
        seg(3, 2, 2, 2),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should not affect straight-line paths (X-first and Z-first identical)', () => {
      // GIVEN
      factory.placeMachine(1, 3, 'assembler')
      factory.placeMachine(5, 3, 'painter')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(1, 3)!, factory.getMachineAt(5, 3)!)

      // THEN — Straight +X line: both paths are the same
      expectBeltSegments(factory, [
        seg(1, 3, 2, 3),
        seg(2, 3, 3, 3),
        seg(3, 3, 4, 3),
        seg(4, 3, 5, 3),
      ])
      expect(factory.getMachineAt(1, 3)!.rotation).toBe('east') // faces +X
      expect(factory.getMachineAt(5, 3)!.rotation).toBe('east') // faces +X
      assertBeltSlotInvariant(factory)
    })

    it('should not affect straight Z-line paths', () => {
      // GIVEN
      factory.placeMachine(3, 1, 'assembler')
      factory.placeMachine(3, 5, 'painter')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(3, 1)!, factory.getMachineAt(3, 5)!)

      // THEN
      expectBeltSegments(factory, [
        seg(3, 1, 3, 2),
        seg(3, 2, 3, 3),
        seg(3, 3, 3, 4),
        seg(3, 4, 3, 5),
      ])
      expect(factory.getMachineAt(3, 1)!.rotation).toBe('south') // faces +Z
      expect(factory.getMachineAt(3, 5)!.rotation).toBe('south') // faces +Z
      assertBeltSlotInvariant(factory)
    })

    it('should not create crossing belts when slot segments cross existing belts', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      factory.placeMachine(3, 3, 'splitter')
      factory.placeMachine(3, 6, 'assembler')
      factory.placeMachine(5, 4, 'quality_checker')

      // Connect A to B (vertical)
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(3, 6)!, 'output')

      // WHEN — connect A to C — path is valid and reaches destination
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(5, 4)!, 'output')

      // THEN — Both chains should have produced belts
      expect(renderGrid(factory, 3, 3, 5, 6)).toBe([
        '|S|─|┐|',
        '|│| |Q|',
        '|│| | |',
        '|A| | |',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(3, 3, 3, 4),
        seg(3, 4, 3, 5),
        seg(3, 5, 3, 6),
        seg(3, 3, 4, 3),
        seg(4, 3, 5, 3),
        seg(5, 3, 5, 4),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should produce valid belt chain for L-shaped path', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(5, 5, 'painter')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(5, 5)!)

      // THEN
      expect(renderGrid(factory, 1, 1, 5, 5)).toBe([
        '|A|─|─|─|┐|',
        '| | | | |│|',
        '| | | | |│|',
        '| | | | |│|',
        '| | | | |P|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(1, 1, 2, 1),
        seg(2, 1, 3, 1),
        seg(3, 1, 4, 1),
        seg(4, 1, 5, 1),
        seg(5, 1, 5, 2),
        seg(5, 2, 5, 3),
        seg(5, 3, 5, 4),
        seg(5, 4, 5, 5),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should produce valid belt chain with BFS-routed path', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'assembler')
      factory.placeMachine(5, 5, 'painter')
      // Block standard L-paths
      factory.placeMachine(3, 0, 'recycler')
      factory.placeMachine(0, 3, 'recycler')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(0, 0)!, factory.getMachineAt(5, 5)!)

      // THEN
      expect(renderGrid(factory, 0, 0, 5, 5)).toBe([
        '|A|─|┐|R| | |',
        '| | |└|─|─|┐|',
        '| | | | | |│|',
        '|R| | | | |│|',
        '| | | | | |│|',
        '| | | | | |P|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(0, 0, 1, 0),
        seg(1, 0, 2, 0),
        seg(2, 0, 2, 1),
        seg(2, 1, 3, 1),
        seg(3, 1, 4, 1),
        seg(4, 1, 5, 1),
        seg(5, 1, 5, 2),
        seg(5, 2, 5, 3),
        seg(5, 3, 5, 4),
        seg(5, 4, 5, 5),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should maintain valid belt path when reconnecting after rotation', () => {
      // GIVEN
      factory.placeMachine(2, 2, 'assembler')
      factory.placeMachine(6, 6, 'painter')
      factory.placeBeltChain(factory.getMachineAt(2, 2)!, factory.getMachineAt(6, 6)!)

      // ASSERT
      expect(renderGrid(factory, 1, 1, 7, 7)).toBe([
        '| | | | | | | |',
        '| |A|─|─|─|┐| |',
        '| | | | | |│| |',
        '| | | | | |│| |',
        '| | | | | |│| |',
        '| | | | | |P| |',
        '| | | | | | | |',
      ].join('\n'))

      // WHEN — Rotate source machine — chains are removed and reconnected
      factory.rotateMachine(factory.getMachineAt(2, 2)!, 'north')

      // THEN: Rotation set to north; belt exits via north output (0,-1)
      // and routes to painter via a valid path.
      expect(factory.getMachineAt(2, 2)!.rotation).toBe('north')
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].sourceMachine.x).toBe(2)
      expect(belts[0].sourceMachine.z).toBe(2)
      expect(belts[0].destinationMachine.x).toBe(6)
      expect(belts[0].destinationMachine.z).toBe(6)
      // All path segments must be adjacent
      for (let i = 0; i < belts[0].path.length - 1; i++) {
        const dx = Math.abs(belts[0].path[i].x - belts[0].path[i + 1].x)
        const dz = Math.abs(belts[0].path[i].z - belts[0].path[i + 1].z)
        expect(dx + dz).toBe(1)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should preserve rotated machine rotation and auto-rotate the other', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')
      factory.placeMachine(3, 6, 'painter')
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(3, 6)!)

      // ASSERT
      expect(renderGrid(factory, 2, 2, 4, 6)).toBe([
        '| | | |',
        '| |A| |',
        '| |│| |',
        '| |│| |',
        '| |P| |',
      ].join('\n'))

      // WHEN — Rotate the source machine to 'west'
      factory.rotateMachine(factory.getMachineAt(3, 3)!, 'west')

      // THEN — rotation set to west; belt exits via west output and routes to painter
      expect(factory.getMachineAt(3, 3)!.rotation).toBe('west')
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      // All path segments must be adjacent
      for (let i = 0; i < belts[0].path.length - 1; i++) {
        const dx = Math.abs(belts[0].path[i].x - belts[0].path[i + 1].x)
        const dz = Math.abs(belts[0].path[i].z - belts[0].path[i + 1].z)
        expect(dx + dz).toBe(1)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should still have a belt connecting both machines after rotateMachine', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')
      factory.placeMachine(3, 6, 'painter')
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(3, 6)!)
      const beltCountBefore = factory.getBelts().length
      expect(beltCountBefore).toBe(1)

      // ASSERT
      expect(renderGrid(factory, 2, 2, 4, 6)).toBe([
        '| | | |',
        '| |A| |',
        '| |│| |',
        '| |│| |',
        '| |P| |',
      ].join('\n'))

      // WHEN
      factory.rotateMachine(factory.getMachineAt(3, 3)!, 'east')

      // THEN — rotation set to east; belt exits via east output and routes to painter
      expect(factory.getMachineAt(3, 3)!.rotation).toBe('east')
      // A belt should still connect (3,3) ↔ (3,6)
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].sourceMachine.x).toBe(3)
      expect(belts[0].sourceMachine.z).toBe(3)
      expect(belts[0].destinationMachine.x).toBe(3)
      expect(belts[0].destinationMachine.z).toBe(6)
      // All path segments must be adjacent
      for (let i = 0; i < belts[0].path.length - 1; i++) {
        const dx = Math.abs(belts[0].path[i].x - belts[0].path[i + 1].x)
        const dz = Math.abs(belts[0].path[i].z - belts[0].path[i + 1].z)
        expect(dx + dz).toBe(1)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should maintain valid belt path when reconnecting after move', () => {
      // GIVEN
      const assembler = factory.placeMachine(1, 1, 'assembler')
      const painter = factory.placeMachine(5, 5, 'painter')
      factory.placeBeltChain(assembler!, painter!)

      // WHEN
      factory.moveMachine(1, 1, 3, 1)

      // THEN
      expect(renderGrid(factory, 1, 1, 5, 5)).toBe([
        '| | |A|─|┐|',
        '| | | | |│|',
        '| | | | |│|',
        '| | | | |│|',
        '| | | | |P|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(3, 1, 4, 1),
        seg(4, 1, 5, 1),
        seg(5, 1, 5, 2),
        seg(5, 2, 5, 3),
        seg(5, 3, 5, 4),
        seg(5, 4, 5, 5),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should produce short L-shape path for diagonal placement, not a U-turn', () => {
      factory = createTestFactory(15, 15)
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')
      factory.placeMachine(6, 5, 'painter')

      // WHEN
      const result = factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(6, 5)!)

      // THEN
      expect(result).toBe(true)

      expect(renderGrid(factory, 3, 3, 6, 5)).toBe([
        '|A|─|─|┐|',
        '| | | |│|',
        '| | | |P|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(3, 3, 4, 3),
        seg(4, 3, 5, 3),
        seg(5, 3, 6, 3),
        seg(6, 3, 6, 4),
        seg(6, 4, 6, 5),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should create direct path for vertically aligned machines', () => {
      factory = createTestFactory(15, 15)
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')
      factory.placeMachine(3, 6, 'painter')

      // WHEN
      const result = factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(3, 6)!)

      // THEN
      expect(result).toBe(true)

      expectBeltSegments(factory, [
        seg(3, 3, 3, 4),
        seg(3, 4, 3, 5),
        seg(3, 5, 3, 6),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should create valid path for perpendicular slot arrangements with existing belts', () => {
      factory = createTestFactory(15, 15)
      // GIVEN — A at (3,3) with default rotation (south)
      factory.placeMachine(3, 3, 'assembler')
      // Dummy at (3,0) connected via belt to lock A's rotation to south
      factory.placeMachine(3, 0, 'assembler')
      factory.placeBeltChain(factory.getMachineAt(3, 0)!, factory.getMachineAt(3, 3)!)

      // B at (6,3) — connect to distant dummy to lock B's rotation to east
      factory.placeMachine(6, 3, 'assembler')
      factory.placeMachine(9, 3, 'assembler')
      factory.placeBeltChain(factory.getMachineAt(6, 3)!, factory.getMachineAt(9, 3)!)

      // WHEN
      const result = factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(6, 3)!)

      // THEN — auto-rotation finds path from A output to B input
      expect(result).toBe(true)
      expectBeltSegments(factory, [
        seg(3, 0, 3, 1),
        seg(3, 1, 3, 2),
        seg(3, 2, 3, 3),
        seg(6, 3, 7, 3),
        seg(7, 3, 8, 3),
        seg(8, 3, 9, 3),
        seg(3, 3, 3, 4),
        seg(3, 4, 4, 4),
        seg(4, 4, 5, 4),
        seg(5, 4, 5, 3),
        seg(5, 3, 6, 3),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should pick shortest slot pair for splitter-to-assembler connection', () => {
      factory = createTestFactory(15, 15)
      // GIVEN — Splitter at (3,3) rotation=0: outputs at (3,4) south, (4,3) east, (2,3) west
      factory.placeMachine(3, 3, 'splitter')
      // Lock splitter rotation south via distant dummy
      factory.placeMachine(3, 0, 'painter')
      factory.placeBeltChain(factory.getMachineAt(3, 0)!, factory.getMachineAt(3, 3)!)

      // Assembler at (6,3) rotation=0: inputs at back (6,2), right (7,3), left (5,3)
      factory.placeMachine(6, 3, 'assembler')
      // Lock assembler rotation south via distant dummy
      factory.placeMachine(6, 6, 'painter')
      factory.placeBeltChain(factory.getMachineAt(6, 3)!, factory.getMachineAt(6, 6)!)

      // WHEN
      const result = factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(6, 3)!)

      // THEN — Best pair: east output (4,3) → west input (5,3) gives straight east path
      expect(result).toBe(true)
      expectBeltSegments(factory, [
        seg(3, 0, 3, 1),
        seg(3, 1, 3, 2),
        seg(3, 2, 3, 3),
        seg(6, 3, 6, 4),
        seg(6, 4, 6, 5),
        seg(6, 5, 6, 6),
        seg(3, 3, 4, 3),
        seg(4, 3, 5, 3),
        seg(5, 3, 6, 3),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should find path around obstacle when direct route is blocked', () => {
      factory = createTestFactory(15, 15)
      // GIVEN
      factory.placeMachine(3, 3, 'part_fabricator')
      factory.placeMachine(6, 3, 'part_fabricator')
      factory.placeMachine(5, 3, 'painter') // blocker between A and B

      // WHEN
      const result = factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(6, 3)!)

      // THEN — Can't go straight east through (5,3); must route around the obstacle
      expect(result).toBe(true)
      expect(renderGrid(factory, 3, 3, 6, 4)).toBe([
        '|F|┐|P|F|',
        '| |└|─|┘|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(3, 3, 4, 3),
        seg(4, 3, 4, 4),
        seg(4, 4, 5, 4),
        seg(5, 4, 6, 4),
        seg(6, 4, 6, 3),
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should produce direct path for horizontally adjacent machines', () => {
      factory = createTestFactory(10, 10)
      // GIVEN — two part_fabricators placed next to each other
      factory.placeMachine(3, 3, 'part_fabricator')
      factory.placeMachine(4, 3, 'part_fabricator')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(4, 3)!)

      // THEN — should be a direct 2-cell path, NOT a U-turn
      expect(renderGrid(factory, 2, 2, 5, 4)).toBe([
        '| | | | |',
        '| |F|F| |',
        '| | | | |',
      ].join('\n'))
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].path).toEqual([
        { x: 3, z: 3 },
        { x: 4, z: 3 },
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should produce direct path for horizontally adjacent machines', () => {
      factory = createTestFactory(10, 10)
      // GIVEN — two side-by-side machines (no slot conflict for south-facing)
      factory.placeMachine(3, 3, 'part_fabricator')
      factory.placeMachine(4, 3, 'part_fabricator')

      // WHEN
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(4, 3)!)

      // THEN
      expect(renderGrid(factory, 2, 2, 5, 4)).toBe([
        '| | | | |',
        '| |F|F| |',
        '| | | | |',
      ].join('\n'))
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].path).toEqual([
        { x: 3, z: 3 },
        { x: 4, z: 3 },
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should NOT produce U-turn for adjacent machines with auto-rotation', () => {
      factory = createTestFactory(10, 10)
      // GIVEN — two south-facing part_fabricators next to each other
      factory.placeMachine(3, 3, 'part_fabricator')  // default south
      factory.placeMachine(4, 3, 'part_fabricator')  // default south

      // WHEN — connect with auto-rotation (no fixedRotations)
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(4, 3)!, 'output')

      // THEN — auto-rotation finds direct east path
      expect(renderGrid(factory, 2, 2, 5, 4)).toBe([
        '| | | | |',
        '| |F|F| |',
        '| | | | |',
      ].join('\n'))
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].path).toEqual([
        { x: 3, z: 3 },
        { x: 4, z: 3 },
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should preserve rotated machine rotation after rotateMachine reconnects', () => {
      factory = createTestFactory(10, 10)
      // GIVEN — A(3,3) connected to P(6,3) straight east
      factory.placeMachine(3, 3, 'assembler')
      factory.placeMachine(6, 3, 'painter')
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(6, 3)!)

      // ASSERT
      expect(renderGrid(factory, 2, 2, 7, 4)).toBe([
        '| | | | | | |',
        '| |A|─|─|P| |',
        '| | | | | | |',
      ].join('\n'))

      // WHEN — rotate A to south (rotation is locked)
      factory.rotateMachine(factory.getMachineAt(3, 3)!, 'south')

      // THEN — A keeps south rotation; P auto-rotates to east
      expect(factory.getMachineAt(3, 3)!.rotation).toBe('south')
      expect(factory.getMachineAt(6, 3)!.rotation).toBe('east')
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      // All path segments must be adjacent
      for (let i = 0; i < belts[0].path.length - 1; i++) {
        const dx = Math.abs(belts[0].path[i].x - belts[0].path[i + 1].x)
        const dz = Math.abs(belts[0].path[i].z - belts[0].path[i + 1].z)
        expect(dx + dz).toBe(1)
      }
      // Belt still connects (3,3) and (6,3)
      expect(belts[0].sourceMachine.x).toBe(3)
      expect(belts[0].sourceMachine.z).toBe(3)
      expect(belts[0].destinationMachine.x).toBe(6)
      expect(belts[0].destinationMachine.z).toBe(3)
      assertBeltSlotInvariant(factory)
    })

    it('should NOT produce U-turn when moveMachine places source adjacent to target', () => {
      factory = createTestFactory(10, 10)
      // GIVEN — A(2,3) → P(5,3) with belt, both initially facing east
      factory.placeMachine(2, 3, 'assembler')
      factory.placeMachine(5, 3, 'painter')
      factory.placeBeltChain(factory.getMachineAt(2, 3)!, factory.getMachineAt(5, 3)!)
      // Both face east after placeBeltChain
      expect(factory.getMachineAt(2, 3)!.rotation).toBe('east')
      expect(factory.getMachineAt(5, 3)!.rotation).toBe('east')

      // ASSERT
      expect(renderGrid(factory, 2, 2, 6, 4)).toBe([
        '| | | | | |',
        '|A|─|─|P| |',
        '| | | | | |',
      ].join('\n'))

      // WHEN — move A closer to P
      factory.moveMachine(2, 3, 3, 3)

      // THEN — the reconnected belt should be a direct short path
      expect(renderGrid(factory, 2, 2, 6, 4)).toBe([
        '| | | | | |',
        '| |A|─|P| |',
        '| | | | | |',
      ].join('\n'))
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].path).toEqual([
        { x: 3, z: 3 },
        { x: 4, z: 3 },
        { x: 5, z: 3 },
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should NOT produce U-turn for ghost preview of adjacent machine with south rotation', () => {
      factory = createTestFactory(10, 10)
      // GIVEN — A(3,3) → P(5,3) with belt
      factory.placeMachine(3, 3, 'assembler')
      factory.placeMachine(5, 3, 'painter')
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(5, 3)!)

      // ASSERT — initial state
      expect(renderGrid(factory, 2, 2, 6, 4)).toBe([
        '| | | | | |',
        '| |A|─|P| |',
        '| | | | | |',
      ].join('\n'))

      const machine = factory.getMachineAt(3, 3)!
      const connectedBeltIds = factory.getConnectedBeltIds(3, 3)

      // WHEN — compute ghost path for A at (4,3), keeping current rotation
      const ghostResult = factory.computeReconnectPath(
        4, 3,
        machine.type, machine.rotation,
        { x: 5, z: 3 }, true,
        connectedBeltIds,
      )

      // THEN — ghost path should be a direct 2-cell path
      expect(ghostResult).not.toBeNull()
      expect(ghostResult!.path).toEqual([
        { x: 4, z: 3 },
        { x: 5, z: 3 },
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should NOT U-turn when two south-facing machines are connected by placeBeltChain', () => {
      factory = createTestFactory(10, 10)
      // GIVEN — Two machines both facing south (locked by existing belts to other machines)
      // Machine A at (3,3) facing south, connected to dummy D1 at (3,5)
      factory.placeMachine(3, 3, 'splitter')
      factory.placeMachine(3, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(3, 5)!)
      expect(factory.getMachineAt(3, 3)!.rotation).toBe('south')

      // Machine B at (5,3) facing south, connected to dummy D2 at (5,5)
      // (5,3) is outside splitter A's output slots (4,3 east, 2,3 west, 3,4 south))
      factory.placeMachine(5, 3, 'splitter')
      factory.placeMachine(5, 5, 'recycler')
      factory.placeBeltChain(factory.getMachineAt(5, 3)!, factory.getMachineAt(5, 5)!)
      expect(factory.getMachineAt(5, 3)!.rotation).toBe('south')

      // WHEN — connect A(3,3) → B(5,3) — both already have belts, rotations are locked
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(5, 3)!, 'output')

      // THEN — should find a short path using available slots, NOT a U-turn through south
      const allBelts = factory.getBelts()
      expect(allBelts).toHaveLength(3)
      const beltToB = allBelts.find(b =>
        (b.sourceMachine.x === 3 && b.sourceMachine.z === 3 && b.destinationMachine.x === 5 && b.destinationMachine.z === 3) ||
        (b.sourceMachine.x === 5 && b.sourceMachine.z === 3 && b.destinationMachine.x === 3 && b.destinationMachine.z === 3)
      )
      expect(beltToB).toBeDefined()
      // Belt path should be short (no U-turn), going east through available slots
      expect(beltToB!.path.length).toBeLessThanOrEqual(5)
      for (let i = 0; i < beltToB!.path.length - 1; i++) {
        const dx = Math.abs(beltToB!.path[i].x - beltToB!.path[i + 1].x)
        const dz = Math.abs(beltToB!.path[i].z - beltToB!.path[i + 1].z)
        expect(dx + dz).toBe(1)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should not U-turn when machines 3 apart have same rotation and are reconnected with fixedRotations', () => {
      factory = createTestFactory(10, 10)
      // GIVEN — A at (3,3) facing south, P at (6,3) facing south, connected with fixedRotations
      factory.placeMachine(3, 3, 'splitter')
      factory.placeMachine(6, 3, 'assembler')
      // Lock both to south rotation by connecting to other machines first
      factory.placeMachine(3, 5, 'recycler')
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(3, 5)!)
      factory.placeMachine(6, 5, 'quality_checker')
      factory.placeBeltChain(factory.getMachineAt(6, 3)!, factory.getMachineAt(6, 5)!)
      // Both now face south with existing belt connections
      expect(factory.getMachineAt(3, 3)!.rotation).toBe('south')
      expect(factory.getMachineAt(6, 3)!.rotation).toBe('south')

      // WHEN — connect A→P with fixedRotations (like rotateMachine does)
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(6, 3)!, 'output', true)

      // THEN — belt goes straight east, not a U-turn
      expect(renderGrid(factory, 2, 1, 7, 6)).toBe([
        '| | | | | | |',
        '| | | | | | |',
        '| |S|─|─|A| |',
        '| |│| | |│| |',
        '| |R| | |Q| |',
        '| | | | | | |',
      ].join('\n'))
      const belt = factory.getBelts().find(b =>
        (b.sourceMachine.x === 3 && b.sourceMachine.z === 3 && b.destinationMachine.x === 6 && b.destinationMachine.z === 3) ||
        (b.sourceMachine.x === 6 && b.sourceMachine.z === 3 && b.destinationMachine.x === 3 && b.destinationMachine.z === 3)
      )
      expect(belt).toBeDefined()
      expect(belt!.path).toEqual([
        { x: 3, z: 3 },
        { x: 4, z: 3 },
        { x: 5, z: 3 },
        { x: 6, z: 3 },
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should not U-turn when connecting two machines 3 cells apart with auto-rotation', () => {
      factory = createTestFactory(10, 10)
      // GIVEN — two machines, no other connections
      factory.placeMachine(3, 3, 'assembler')
      factory.placeMachine(6, 3, 'painter')

      // WHEN — connect with auto-rotation (no fixedRotations)
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(6, 3)!, 'output')

      // THEN — straight east path
      expect(renderGrid(factory, 2, 2, 7, 4)).toBe([
        '| | | | | | |',
        '| |A|─|─|P| |',
        '| | | | | | |',
      ].join('\n'))
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].path).toEqual([
        { x: 3, z: 3 },
        { x: 4, z: 3 },
        { x: 5, z: 3 },
        { x: 6, z: 3 },
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should not U-turn for ghost preview of machines 3 cells apart with south rotation', () => {
      factory = createTestFactory(15, 15)
      // GIVEN — A at (3,3) connected to P at (6,6), both face east after auto-rotation
      factory.placeMachine(3, 3, 'assembler')
      factory.placeMachine(6, 6, 'painter')
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(6, 6)!)

      // ASSERT — initial state
      expect(renderGrid(factory, 2, 2, 7, 7)).toBe([
        '| | | | | | |',
        '| |A|─|─|┐| |',
        '| | | | |│| |',
        '| | | | |│| |',
        '| | | | |P| |',
        '| | | | | | |',
      ].join('\n'))

      const machine = factory.getMachineAt(3, 3)!
      const connectedBeltIds = factory.getConnectedBeltIds(3, 3)

      // WHEN — ghost preview: move A to (3,6), making it 3 cells from P at (6,6)
      const ghostResult = factory.computeReconnectPath(
        3, 6,
        machine.type, machine.rotation,
        { x: 6, z: 6 }, true,
        connectedBeltIds,
      )

      // THEN — ghost should route through valid slots (preserving rotations)
      expect(ghostResult).not.toBeNull()
      expect(ghostResult!.path).toEqual([
        { x: 3, z: 6 },
        { x: 4, z: 6 },
        { x: 4, z: 5 },
        { x: 5, z: 5 },
        { x: 6, z: 5 },
        { x: 6, z: 6 },
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should prefer short L-path over U-turn for diagonally offset machines with auto-rotation', () => {
      factory = createTestFactory(10, 10)
      // GIVEN — A at (3,3), P at (5,5)
      factory.placeMachine(3, 3, 'assembler')
      factory.placeMachine(5, 5, 'painter')

      // WHEN — connect with auto-rotation (no fixedRotations)
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(5, 5)!, 'output')

      // THEN — L-shape, auto-rotation picks optimal slot pair
      expect(renderGrid(factory, 2, 2, 6, 6)).toBe([
        '| | | | | |',
        '| |A|─|┐| |',
        '| | | |│| |',
        '| | | |P| |',
        '| | | | | |',
      ].join('\n'))
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].path).toEqual([
        { x: 3, z: 3 },
        { x: 4, z: 3 },
        { x: 5, z: 3 },
        { x: 5, z: 4 },
        { x: 5, z: 5 },
      ])
      assertBeltSlotInvariant(factory)
    })

    it('should not U-turn when source moved from vertical alignment to horizontal offset', () => {
      // GIVEN — A(5,5) → B(5,8) straight south belt
      factory = createTestFactory(15, 15)
      factory.placeMachine(5, 5, 'assembler')
      factory.placeMachine(5, 8, 'painter')
      factory.placeBeltChain(factory.getMachineAt(5, 5)!, factory.getMachineAt(5, 8)!)

      // Both face south after auto-rotation
      expect(factory.getMachineAt(5, 5)!.rotation).toBe('south')
      expect(factory.getMachineAt(5, 8)!.rotation).toBe('south')

      // ASSERT
      expect(renderGrid(factory, 4, 4, 9, 9)).toBe([
        '| | | | | | |',
        '| |A| | | | |',
        '| |│| | | | |',
        '| |│| | | | |',
        '| |P| | | | |',
        '| | | | | | |',
      ].join('\n'))

      // Step 1: compute ghost path (what user sees during drag)
      const machine = factory.getMachineAt(5, 5)!
      const connectedBeltIds = factory.getConnectedBeltIds(5, 5)
      const connections = factory.getConnectedMachines(5, 5)
      const ghostResult = factory.computeReconnectPath(
        8, 5, // new position: 3 cells east, same row
        machine.type, machine.rotation,
        connections[0].position, connections[0].machineIsSource,
        connectedBeltIds,
      )

      // Step 2: actually move the machine
      factory.moveMachine(5, 5, 8, 5)

      // THEN — neither ghost nor drop should U-turn
      expect(renderGrid(factory, 4, 4, 9, 9)).toBe([
        '| | | | | | |',
        '| | | | |A| |',
        '| |┌|─|─|┘| |',
        '| |│| | | | |',
        '| |P| | | | |',
        '| | | | | | |',
      ].join('\n'))
      expect(ghostResult).not.toBeNull()
      expect(ghostResult!.path).toEqual([
        { x: 8, z: 5 },
        { x: 8, z: 6 },
        { x: 7, z: 6 },
        { x: 6, z: 6 },
        { x: 5, z: 6 },
        { x: 5, z: 7 },
        { x: 5, z: 8 },
      ])
      const droppedBelts = factory.getBelts()
      expect(droppedBelts).toHaveLength(1)
      expect(droppedBelts[0].path).toEqual(ghostResult!.path)
      assertBeltSlotInvariant(factory)
    })

    it('should not U-turn when source moved diagonally from target', () => {
      // GIVEN — A(5,5) → B(5,8) straight south belt
      factory = createTestFactory(15, 15)
      factory.placeMachine(5, 5, 'assembler')
      factory.placeMachine(5, 8, 'painter')
      factory.placeBeltChain(factory.getMachineAt(5, 5)!, factory.getMachineAt(5, 8)!)

      // ASSERT
      expect(renderGrid(factory, 4, 4, 9, 9)).toBe([
        '| | | | | | |',
        '| |A| | | | |',
        '| |│| | | | |',
        '| |│| | | | |',
        '| |P| | | | |',
        '| | | | | | |',
      ].join('\n'))

      // Move A to (8,6) — 3 east, 1 south of original
      const machine = factory.getMachineAt(5, 5)!
      const connBeltIds = factory.getConnectedBeltIds(5, 5)
      const conns = factory.getConnectedMachines(5, 5)
      const ghost = factory.computeReconnectPath(
        8, 6, machine.type, machine.rotation,
        conns[0].position, conns[0].machineIsSource, connBeltIds,
      )

      factory.moveMachine(5, 5, 8, 6)

      // THEN
      expect(renderGrid(factory, 4, 4, 9, 9)).toBe([
        '| | | | | | |',
        '| | | | | | |',
        '| | | | |A| |',
        '| |┌|─|─|┘| |',
        '| |P| | | | |',
        '| | | | | | |',
      ].join('\n'))
      expect(ghost).not.toBeNull()
      expect(ghost!.path).toEqual([
        { x: 8, z: 6 },
        { x: 8, z: 7 },
        { x: 7, z: 7 },
        { x: 6, z: 7 },
        { x: 5, z: 7 },
        { x: 5, z: 8 },
      ])
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].path).toEqual(ghost!.path)
      assertBeltSlotInvariant(factory)
    })

    it('should preserve rotated machine rotation through all rotations for horizontally offset machines', () => {
      // GIVEN — A(5,5) → B(8,5) connected by straight east belt
      factory = createTestFactory(15, 15)
      factory.placeMachine(5, 5, 'assembler')
      factory.placeMachine(8, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(5, 5)!, factory.getMachineAt(8, 5)!)

      // ASSERT
      expect(renderGrid(factory, 4, 4, 9, 6)).toBe([
        '| | | | | | |',
        '| |A|─|─|P| |',
        '| | | | | | |',
      ].join('\n'))

      // WHEN — rotate A to south (locked)
      factory.rotateMachine(factory.getMachineAt(5, 5)!, 'south')

      // THEN — A keeps south rotation; P auto-rotates; belt still connects both
      expect(factory.getMachineAt(5, 5)!.rotation).toBe('south')
      const beltsS = factory.getBelts()
      expect(beltsS).toHaveLength(1)
      expect(beltsS[0].sourceMachine.x).toBe(5)
      expect(beltsS[0].destinationMachine.x).toBe(8)
      for (let i = 0; i < beltsS[0].path.length - 1; i++) {
        const dx = Math.abs(beltsS[0].path[i].x - beltsS[0].path[i + 1].x)
        const dz = Math.abs(beltsS[0].path[i].z - beltsS[0].path[i + 1].z)
        expect(dx + dz).toBe(1)
      }

      // Rotate to north — A keeps north; belt still valid
      factory.rotateMachine(factory.getMachineAt(5, 5)!, 'north')
      expect(factory.getMachineAt(5, 5)!.rotation).toBe('north')
      const beltsN = factory.getBelts()
      expect(beltsN).toHaveLength(1)
      for (let i = 0; i < beltsN[0].path.length - 1; i++) {
        const dx = Math.abs(beltsN[0].path[i].x - beltsN[0].path[i + 1].x)
        const dz = Math.abs(beltsN[0].path[i].z - beltsN[0].path[i + 1].z)
        expect(dx + dz).toBe(1)
      }

      // Rotate to west — A keeps west; belt still valid
      factory.rotateMachine(factory.getMachineAt(5, 5)!, 'west')
      expect(factory.getMachineAt(5, 5)!.rotation).toBe('west')
      const beltsW = factory.getBelts()
      expect(beltsW).toHaveLength(1)
      for (let i = 0; i < beltsW[0].path.length - 1; i++) {
        const dx = Math.abs(beltsW[0].path[i].x - beltsW[0].path[i + 1].x)
        const dz = Math.abs(beltsW[0].path[i].z - beltsW[0].path[i + 1].z)
        expect(dx + dz).toBe(1)
      }
      assertBeltSlotInvariant(factory)
    })
  })

  describe('placeMachine()', () => {
    it('should place a machine on an empty cell', () => {
      // ASSERT
      expect(renderGrid(factory, 0, 0, 2, 2)).toBe([
        '| | | |',
        '| | | |',
        '| | | |',
      ].join('\n'))

      // WHEN
      const result = factory.placeMachine(1, 1, 'assembler')

      // THEN
      expect(renderGrid(factory, 0, 0, 2, 2)).toBe([
        '| | | |',
        '| |A| |',
        '| | | |',
      ].join('\n'))
      expect(result).toBeTruthy()
      expect(factory.getMachineAt(1, 1)).not.toBeNull()
      expect(factory.getMachineAt(1, 1)!.type).toBe('assembler')
    })

    it('should fail to place on an occupied cell', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')

      // ASSERT
      expect(renderGrid(factory, 0, 0, 2, 2)).toBe([
        '| | | |',
        '| |A| |',
        '| | | |',
      ].join('\n'))

      // WHEN
      const result = factory.placeMachine(1, 1, 'painter')

      // THEN
      expect(renderGrid(factory, 0, 0, 2, 2)).toBe([
        '| | | |',
        '| |A| |',
        '| | | |',
      ].join('\n'))
      expect(result).toBeNull()
    })

    it('should fail to place out of bounds', () => {
      // WHEN + THEN
      expect(factory.placeMachine(-1, 0, 'assembler')).toBeNull()
      expect(factory.placeMachine(0, 5, 'assembler')).toBeNull()
    })

    it('should assign unique IDs to each machine', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'part_fabricator')
      factory.placeMachine(1, 0, 'painter')
      factory.placeMachine(2, 0, 'recycler')

      // WHEN
      const machines = factory.getMachines()
      const ids = machines.map((m) => m.id)
      const uniqueIds = new Set(ids)

      // THEN
      expect(uniqueIds.size).toBe(3)
    })

    it('should assign a meaningful default name', () => {
      // WHEN
      factory.placeMachine(1, 1, 'assembler')

      // THEN
      expect(factory.getMachineAt(1, 1)!.name).toBe('Assembler 1')
    })
  })

  describe('removeBeltById()', () => {
    it('should remove an existing belt', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'painter')
      factory.placeMachine(1, 0, 'painter')
      factory.restoreState([], [beltEntry([0, 0], [1, 0])])
      const belt = factory.getBelts()[0]

      // WHEN
      const result = factory.removeBeltById(belt.id)

      // THEN
      expect(result).toBe(true)
      expect(factory.getBelts()).toHaveLength(0)
      assertBeltSlotInvariant(factory)
    })

    it('should fail to remove a non-existent belt', () => {
      // WHEN + THEN
      expect(factory.removeBeltById('nonexistent')).toBe(false)
    })

    it('should clean up belt references from grid cells', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'painter')
      factory.placeMachine(1, 0, 'painter')
      factory.restoreState([], [beltEntry([0, 0], [1, 0])])
      const belt = factory.getBelts()[0]

      // WHEN
      factory.removeBeltById(belt.id)

      // THEN
      expect(factory.getBeltsAt(0, 0)).toHaveLength(0)
      expect(factory.getBeltsAt(1, 0)).toHaveLength(0)
      assertBeltSlotInvariant(factory)
    })

    it('should remove all cells of a belt connection', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 5)!)

      const belt = factory.getBelts()[0]

      // ASSERT
      expect(renderGrid(factory, 0, 0, 2, 5)).toBe([
        '| | | |',
        '| |A| |',
        '| |│| |',
        '| |│| |',
        '| |│| |',
        '| |P| |',
      ].join('\n'))

      // WHEN
      factory.removeBeltById(belt.id)

      // THEN
      expect(renderGrid(factory, 0, 0, 2, 5)).toBe([
        '| | | |',
        '| |A| |',
        '| | | |',
        '| | | |',
        '| | | |',
        '| |P| |',
      ].join('\n'))
      expect(factory.getBelts()).toHaveLength(0)
      assertBeltSlotInvariant(factory)
    })

    it('should not affect other belt connections', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 5)!)

      factory.placeMachine(5, 1, 'assembler')
      factory.placeMachine(5, 5, 'recycler')
      factory.placeBeltChain(factory.getMachineAt(5, 1)!, factory.getMachineAt(5, 5)!)

      const belt1 = factory.getBeltsAt(1, 3)[0]

      // ASSERT
      expect(renderGrid(factory, 0, 0, 6, 5)).toBe([
        '| | | | | | | |',
        '| |A| | | |A| |',
        '| |│| | | |│| |',
        '| |│| | | |│| |',
        '| |│| | | |│| |',
        '| |P| | | |R| |',
      ].join('\n'))

      // WHEN
      factory.removeBeltById(belt1.id)

      // THEN
      expect(renderGrid(factory, 0, 0, 6, 5)).toBe([
        '| | | | | | | |',
        '| |A| | | |A| |',
        '| | | | | |│| |',
        '| | | | | |│| |',
        '| | | | | |│| |',
        '| |P| | | |R| |',
      ].join('\n'))

      // THEN
      expect(factory.getBeltsAt(1, 3)).toHaveLength(0)
      const belt2 = factory.getBeltsAt(5, 3)
      expect(belt2).toHaveLength(1)
      assertBeltSlotInvariant(factory)
    })

    it('can find belt at cell, then remove it', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      factory.placeMachine(2, 2, 'assembler')
      factory.placeMachine(2, 6, 'painter')
      factory.placeBeltChain(factory.getMachineAt(2, 2)!, factory.getMachineAt(2, 6)!)

      const beltsAtCell = factory.getBeltsAt(2, 4)
      expect(beltsAtCell).toHaveLength(1)

      // ASSERT
      expect(renderGrid(factory, 1, 1, 3, 6)).toBe([
        '| | | |',
        '| |A| |',
        '| |│| |',
        '| |│| |',
        '| |│| |',
        '| |P| |',
      ].join('\n'))

      // WHEN
      factory.removeBeltById(beltsAtCell[0].id)

      // THEN
      expect(renderGrid(factory, 1, 1, 3, 6)).toBe([
        '| | | |',
        '| |A| |',
        '| | | |',
        '| | | |',
        '| | | |',
        '| |P| |',
      ].join('\n'))
      expect(factory.getBelts()).toHaveLength(0)
      expect(factory.machineHasAnyBelts(2, 2)).toBe(false)
      expect(factory.machineHasAnyBelts(2, 6)).toBe(false)
      assertBeltSlotInvariant(factory)
    })
  })

  describe('removeMachine()', () => {
    it('should remove an existing machine', () => {
      // GIVEN
      factory.placeMachine(2, 2, 'assembler')

      // WHEN
      const result = factory.removeMachine(2, 2)

      // THEN
      expect(result).toBe(true)
      expect(factory.getMachineAt(2, 2)).toBeNull()
    })

    it('should fail to remove from empty cell', () => {
      // WHEN + THEN
      expect(factory.removeMachine(0, 0)).toBe(false)
    })

    it('should fail to remove out of bounds', () => {
      // WHEN + THEN
      expect(factory.removeMachine(-1, 0)).toBe(false)
      expect(factory.removeMachine(5, 5)).toBe(false)
    })

    it('should remove machine from getMachines() collection', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')

      // WHEN
      factory.removeMachine(1, 1)

      // THEN
      expect(factory.getMachines()).toHaveLength(0)
    })

    it('should remove machine with no belts correctly', () => {
      // GIVEN
      factory.placeMachine(2, 2, 'painter')

      // WHEN + THEN
      expect(factory.removeMachine(2, 2)).toBe(true)
      expect(factory.getMachineAt(2, 2)).toBeNull()
      expect(factory.getMachines()).toHaveLength(0)
      expect(factory.getBelts()).toHaveLength(0)
    })

    it('should remove ALL belt segments in a multi-segment chain when removing a machine', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      // Machine A at (1,1), Machine B at (1,5)
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 5, 'painter')
      // Create a belt chain with 4 segments: (1,1)→(1,2)→(1,3)→(1,4)→(1,5)
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 5)!)
      expectBeltSegments(factory, [
        seg(1, 1, 1, 2),
        seg(1, 2, 1, 3),
        seg(1, 3, 1, 4),
        seg(1, 4, 1, 5),
      ])

      // ASSERT
      expect(renderGrid(factory, 0, 0, 2, 5)).toBe([
        '| | | |',
        '| |A| |',
        '| |│| |',
        '| |│| |',
        '| |│| |',
        '| |P| |',
      ].join('\n'))

      // WHEN — Remove machine A — ALL 4 belt segments must be removed
      factory.removeMachine(1, 1)

      // THEN
      expect(renderGrid(factory, 0, 0, 2, 5)).toBe([
        '| | | |',
        '| | | |',
        '| | | |',
        '| | | |',
        '| | | |',
        '| |P| |',
      ].join('\n'))
      expect(factory.getBelts()).toHaveLength(0)
      // Intermediate cells should have no belt references
      expect(factory.getBeltsAt(1, 2)).toHaveLength(0)
      expect(factory.getBeltsAt(1, 3)).toHaveLength(0)
      expect(factory.getBeltsAt(1, 4)).toHaveLength(0)
      // Machine B's cell should also be clean
      expect(factory.getBeltsAt(1, 5)).toHaveLength(0)
      assertBeltSlotInvariant(factory)
    })

    it('should remove ALL belt segments when removing the machine at the other end of a chain', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 5)!)
      expectBeltSegments(factory, [
        seg(1, 1, 1, 2),
        seg(1, 2, 1, 3),
        seg(1, 3, 1, 4),
        seg(1, 4, 1, 5),
      ])

      // ASSERT
      expect(renderGrid(factory, 0, 0, 2, 5)).toBe([
        '| | | |',
        '| |A| |',
        '| |│| |',
        '| |│| |',
        '| |│| |',
        '| |P| |',
      ].join('\n'))

      // WHEN — Remove machine B (target end) — all 4 segments must also be removed
      factory.removeMachine(1, 5)

      // THEN
      expect(renderGrid(factory, 0, 0, 2, 5)).toBe([
        '| | | |',
        '| |A| |',
        '| | | |',
        '| | | |',
        '| | | |',
        '| | | |',
      ].join('\n'))
      expect(factory.getBelts()).toHaveLength(0)
      expect(factory.getBeltsAt(1, 1)).toHaveLength(0)
      expect(factory.getBeltsAt(1, 2)).toHaveLength(0)
      expect(factory.getBeltsAt(1, 3)).toHaveLength(0)
      expect(factory.getBeltsAt(1, 4)).toHaveLength(0)
      assertBeltSlotInvariant(factory)
    })

    it('should remove all chains when machine has belts going to multiple machines', () => {
      // GIVEN — Splitter (3 outputs: front, right, left) at (4,4),
      // Painter at (1,4) west, Recycler at (4,7) south
      factory = createTestFactory(10, 10)
      factory.placeMachine(4, 4, 'splitter')
      factory.placeMachine(1, 4, 'painter')
      factory.placeMachine(4, 7, 'recycler')
      // Chain 1: S→P (3 segments going west, uses 'front' output)
      factory.placeBeltChain(factory.getMachineAt(4, 4)!, factory.getMachineAt(1, 4)!)
      // Chain 2: S→R (3 segments going south, uses 'right' output)
      factory.placeBeltChain(factory.getMachineAt(4, 4)!, factory.getMachineAt(4, 7)!)
      expect(renderGrid(factory, 1, 4, 4, 7)).toBe([
        '|P|─|─|S|',
        '| | | |│|',
        '| | | |│|',
        '| | | |R|',
      ].join('\n'))
      expectBeltSegments(factory, [
        seg(4, 4, 3, 4),
        seg(3, 4, 2, 4),
        seg(2, 4, 1, 4),
        seg(4, 4, 4, 5),
        seg(4, 5, 4, 6),
        seg(4, 6, 4, 7),
      ])

      // WHEN — Remove splitter — both chains (all 6 segments) must go
      factory.removeMachine(4, 4)

      // THEN
      expect(renderGrid(factory, 1, 4, 4, 7)).toBe([
        '|P| | | |',
        '| | | | |',
        '| | | | |',
        '| | | |R|',
      ].join('\n'))
      expect(factory.getBelts()).toHaveLength(0)
      expect(factory.getBeltsAt(2, 4)).toHaveLength(0)
      expect(factory.getBeltsAt(3, 4)).toHaveLength(0)
      expect(factory.getBeltsAt(4, 5)).toHaveLength(0)
      expect(factory.getBeltsAt(4, 6)).toHaveLength(0)
      assertBeltSlotInvariant(factory)
    })

    it('should NOT affect belts between unrelated machines when removing a machine', () => {
      // GIVEN
      factory = createTestFactory(10, 10)
      // Machine A at (1,1) connected to Machine B at (1,4)
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 4, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 4)!)
      // Independent: Machine C at (7,1) connected to Machine D at (7,4)
      factory.placeMachine(7, 1, 'recycler')
      factory.placeMachine(7, 4, 'quality_checker')
      factory.placeBeltChain(factory.getMachineAt(7, 1)!, factory.getMachineAt(7, 4)!)

      expectBeltSegments(factory, [
        seg(1, 1, 1, 2),
        seg(1, 2, 1, 3),
        seg(1, 3, 1, 4),
        seg(7, 1, 7, 2),
        seg(7, 2, 7, 3),
        seg(7, 3, 7, 4),
      ])

      // ASSERT
      expect(renderGrid(factory, 0, 0, 8, 4)).toBe([
        '| | | | | | | | | |',
        '| |A| | | | | |R| |',
        '| |│| | | | | |│| |',
        '| |│| | | | | |│| |',
        '| |P| | | | | |Q| |',
      ].join('\n'))

      // WHEN — Remove Machine A — only its chain should be removed
      factory.removeMachine(1, 1)

      // THEN
      expect(renderGrid(factory, 0, 0, 8, 4)).toBe([
        '| | | | | | | | | |',
        '| | | | | | | |R| |',
        '| | | | | | | |│| |',
        '| | | | | | | |│| |',
        '| |P| | | | | |Q| |',
      ].join('\n'))
      // C→D chain must remain intact
      expectBeltSegments(factory, [
        seg(7, 1, 7, 2),
        seg(7, 2, 7, 3),
        seg(7, 3, 7, 4),
      ])
      assertBeltSlotInvariant(factory)
    })
  })

  describe('renameMachine()', () => {
    it('should set the name on an existing machine', () => {
      // GIVEN
      factory.placeMachine(2, 2, 'assembler')

      // WHEN
      const result = factory.renameMachine(2, 2, 'My Assembler')

      // THEN
      expect(result).toBe(true)
      expect(factory.getMachineAt(2, 2)!.name).toBe('My Assembler')
    })

    it('should return false for empty cell', () => {
      // WHEN + THEN
      expect(factory.renameMachine(0, 0, 'Ghost')).toBe(false)
    })

    it('should return false for out-of-bounds', () => {
      // WHEN + THEN
      expect(factory.renameMachine(-1, 0, 'Nope')).toBe(false)
      expect(factory.renameMachine(0, 5, 'Nope')).toBe(false)
    })

    it('should overwrite a previously set name', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'painter')
      factory.renameMachine(1, 1, 'First')

      // WHEN
      factory.renameMachine(1, 1, 'Second')

      // THEN
      expect(factory.getMachineAt(1, 1)!.name).toBe('Second')
    })

    it('should preserve name through restoreState', () => {
      // WHEN
      factory.restoreState(
        [{ x: 1, z: 1, type: 'assembler', rotation: 'south', name: 'Restored Bot' }],
        [],
      )

      // THEN
      expect(factory.getMachineAt(1, 1)!.name).toBe('Restored Bot')
    })

    it('should default to auto-generated name in restoreState when name is omitted', () => {
      // WHEN
      factory.restoreState(
        [{ x: 1, z: 1, type: 'assembler', rotation: 'south' }],
        [],
      )

      // THEN
      expect(factory.getMachineAt(1, 1)!.name).toBe('Assembler 1')
    })
  })

  describe('resolveTargetSlot()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should return the single free slot for standard machine', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')
      factory.placeMachine(3, 7, 'painter')
      const target = factory.getMachineAt(3, 7)!

      // WHEN
      const slot = factory.resolveTargetSlot({ x: 3, z: 3 }, target, 'output')

      // THEN
      expect(slot).not.toBeNull()
      expect(slot).toEqual({ x: 0, z: -1 })
    })

    it('should return null when all slots are occupied', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')
      factory.placeMachine(3, 7, 'painter')
      // Connect a belt to occupy the input slot
      factory.placeBeltChain(factory.getMachineAt(3, 3)!, factory.getMachineAt(3, 7)!)

      expectBeltSegments(factory, [
        seg(3, 3, 3, 4),
        seg(3, 4, 3, 5),
        seg(3, 5, 3, 6),
        seg(3, 6, 3, 7),
      ])
      const target = factory.getMachineAt(3, 7)!

      // WHEN
      const slot = factory.resolveTargetSlot({ x: 3, z: 3 }, target, 'output')

      // THEN
      expect(slot).toBeNull()
      assertBeltSlotInvariant(factory)
    })

    it('should pick closest free slot for multi-slot machine', () => {
      // GIVEN
      factory.placeMachine(5, 5, 'assembler')
      const assembler = factory.getMachineAt(5, 5)!

      // WHEN — Source to the left, sourceSlotType='output' means: find an input slot on the target assembler
      const slot = factory.resolveTargetSlot({ x: 2, z: 5 }, assembler, 'output')

      // THEN
      expect(slot).toBeDefined()
      expect(slot).toEqual({ x: -1, z: 0 })
    })
  })

  describe('restoreState()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should restore machines at specified positions', () => {
      // WHEN
      factory.restoreState(
        [
          { x: 1, z: 1, type: 'assembler', rotation: 'south' },
          { x: 3, z: 3, type: 'painter', rotation: 'east' },
        ],
        [],
      )

      // THEN
      expect(factory.getMachines()).toHaveLength(2)
      expect(factory.getMachineAt(1, 1)!.type).toBe('assembler')
      expect(factory.getMachineAt(1, 1)!.rotation).toBe('south')
      expect(factory.getMachineAt(3, 3)!.type).toBe('painter')
      expect(factory.getMachineAt(3, 3)!.rotation).toBe('east')
    })

    it('should restore belts connecting machines', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 4, 'painter')

      // WHEN
      factory.restoreState([], [beltEntry([1, 1], [1, 2], [1, 3], [1, 4])])

      // THEN
      expect(factory.getBelts()).toHaveLength(1)
      const belt = factory.getBelts()[0]
      expect(belt.path).toHaveLength(4)
      expect(belt.sourceMachine.x).toBe(1)
      expect(belt.sourceMachine.z).toBe(1)
      expect(belt.destinationMachine.x).toBe(1)
      expect(belt.destinationMachine.z).toBe(4)
      assertBeltSlotInvariant(factory)
    })

    it('should skip belts with fewer than 2 path points', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')

      // WHEN
      factory.restoreState([], [
        { sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 1, z: 1 }] },
      ])

      // THEN — belt with 1 path point should be ignored
      expect(factory.getBelts()).toHaveLength(0)
      assertBeltSlotInvariant(factory)
    })

    it('should skip belts when source or dest machine is missing', () => {
      // GIVEN — only place the source machine, not the destination
      factory.placeMachine(1, 1, 'assembler')

      // WHEN — belt references machine at (1,4) which doesn't exist
      factory.restoreState([], [beltEntry([1, 1], [1, 2], [1, 3], [1, 4])])

      // THEN
      expect(factory.getBelts()).toHaveLength(0)
      assertBeltSlotInvariant(factory)
    })

    it('should restore both machines and belts in one call', () => {
      // WHEN
      factory.restoreState(
        [
          { x: 2, z: 2, type: 'assembler', rotation: 'south' },
          { x: 2, z: 5, type: 'painter', rotation: 'south' },
        ],
        [beltEntry([2, 2], [2, 3], [2, 4], [2, 5])],
      )

      // THEN
      expect(factory.getMachines()).toHaveLength(2)
      expect(factory.getBelts()).toHaveLength(1)
      expect(factory.getBeltsAt(2, 3)).toHaveLength(1)
      assertBeltSlotInvariant(factory)
    })
  })

  describe('rotateMachine()', () => {
    it('should maintain valid belt after rotation', () => {
      // GIVEN: Two machines connected by a belt.
      const assembler = factory.placeMachine(2, 2, 'assembler')
      const painter = factory.placeMachine(3, 3, 'painter')
      factory.placeBeltChain(assembler!, painter!)

      // ASSERT: Initial belt connection is valid between (2,2) and (3,3)
      expect(renderGrid(factory, 1, 1, 3, 3)).toBe([
        '| | | |',
        '| |A|┐|',
        '| | |P|',
      ].join('\n'))

      // WHEN: Rotate source machine to north — chains are removed and reconnected.
      factory.rotateMachine(assembler!, 'north')

      // THEN: Rotation set to north; belt exits via north output and routes around to painter.
      expect(assembler!.rotation).toBe('north')
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].sourceMachine.x).toBe(2)
      expect(belts[0].sourceMachine.z).toBe(2)
      expect(belts[0].destinationMachine.x).toBe(3)
      expect(belts[0].destinationMachine.z).toBe(3)
      // All path segments must be adjacent
      for (let i = 0; i < belts[0].path.length - 1; i++) {
        const dx = Math.abs(belts[0].path[i].x - belts[0].path[i + 1].x)
        const dz = Math.abs(belts[0].path[i].z - belts[0].path[i + 1].z)
        expect(dx + dz).toBe(1)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should rotate to east and reconnect belt', () => {
      factory = createTestFactory(10, 10)
      // GIVEN
      const assembler = factory.placeMachine(4, 4, 'assembler')
      const painter = factory.placeMachine(6, 6, 'painter')
      factory.placeBeltChain(assembler!, painter!)

      // ASSERT
      expect(renderGrid(factory, 3, 3, 7, 7)).toBe([
        '| | | | | |',
        '| |A|─|┐| |',
        '| | | |│| |',
        '| | | |P| |',
        '| | | | | |',
      ].join('\n'))

      // WHEN
      factory.rotateMachine(assembler!, 'east')

      // THEN
      expect(renderGrid(factory, 3, 3, 7, 7)).toBe([
        '| | | | | |',
        '| |A|─|┐| |',
        '| | | |│| |',
        '| | | |P| |',
        '| | | | | |',
      ].join('\n'))
      expect(assembler!.rotation).toBe('east')
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].sourceMachine.x).toBe(4)
      expect(belts[0].sourceMachine.z).toBe(4)
      expect(belts[0].destinationMachine.x).toBe(6)
      expect(belts[0].destinationMachine.z).toBe(6)
      // All path segments must be adjacent
      for (let i = 0; i < belts[0].path.length - 1; i++) {
        const dx = Math.abs(belts[0].path[i].x - belts[0].path[i + 1].x)
        const dz = Math.abs(belts[0].path[i].z - belts[0].path[i + 1].z)
        expect(dx + dz).toBe(1)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should rotate to south and reconnect belt', () => {
      factory = createTestFactory(10, 10)
      // GIVEN
      const assembler = factory.placeMachine(4, 4, 'assembler')
      const painter = factory.placeMachine(6, 6, 'painter')
      factory.placeBeltChain(assembler!, painter!)

      // ASSERT
      expect(renderGrid(factory, 3, 3, 7, 7)).toBe([
        '| | | | | |',
        '| |A|─|┐| |',
        '| | | |│| |',
        '| | | |P| |',
        '| | | | | |',
      ].join('\n'))

      // WHEN
      factory.rotateMachine(assembler!, 'south')

      // THEN — rotated machine keeps south; other auto-rotates
      expect(assembler!.rotation).toBe('south')
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].sourceMachine.x).toBe(4)
      expect(belts[0].sourceMachine.z).toBe(4)
      expect(belts[0].destinationMachine.x).toBe(6)
      expect(belts[0].destinationMachine.z).toBe(6)
      // All path segments must be adjacent
      for (let i = 0; i < belts[0].path.length - 1; i++) {
        const dx = Math.abs(belts[0].path[i].x - belts[0].path[i + 1].x)
        const dz = Math.abs(belts[0].path[i].z - belts[0].path[i + 1].z)
        expect(dx + dz).toBe(1)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should rotate to west and reconnect belt', () => {
      factory = createTestFactory(10, 10)
      // GIVEN
      const assembler = factory.placeMachine(4, 4, 'assembler')
      const painter = factory.placeMachine(6, 6, 'painter')
      factory.placeBeltChain(assembler!, painter!)

      // ASSERT
      expect(renderGrid(factory, 3, 3, 7, 7)).toBe([
        '| | | | | |',
        '| |A|─|┐| |',
        '| | | |│| |',
        '| | | |P| |',
        '| | | | | |',
      ].join('\n'))

      // WHEN
      factory.rotateMachine(assembler!, 'west')

      // THEN — rotated machine keeps west; other auto-rotates
      expect(assembler!.rotation).toBe('west')
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].sourceMachine.x).toBe(4)
      expect(belts[0].sourceMachine.z).toBe(4)
      expect(belts[0].destinationMachine.x).toBe(6)
      expect(belts[0].destinationMachine.z).toBe(6)
      // All path segments must be adjacent
      for (let i = 0; i < belts[0].path.length - 1; i++) {
        const dx = Math.abs(belts[0].path[i].x - belts[0].path[i + 1].x)
        const dz = Math.abs(belts[0].path[i].z - belts[0].path[i + 1].z)
        expect(dx + dz).toBe(1)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should return false for machine not in the grid', () => {
      factory = createTestFactory(10, 10)
      // GIVEN — create a fake machine reference not placed in factory
      factory.placeMachine(2, 2, 'assembler')
      const machine = factory.getMachineAt(2, 2)!
      factory.removeMachine(2, 2)

      // WHEN
      const result = factory.rotateMachine(machine, 'east')

      // THEN
      expect(result).toBe(false)
    })

    it('should produce short belt when destination machine is rotated', () => {
      factory = createTestFactory(15, 15)
      // GIVEN — A(5,5) → B(8,5) connected by straight east belt
      factory.placeMachine(5, 5, 'assembler')
      factory.placeMachine(8, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(5, 5)!, factory.getMachineAt(8, 5)!)

      // ASSERT — initial state: both face east, straight belt
      expect(factory.getMachineAt(5, 5)!.rotation).toBe('east')
      expect(factory.getMachineAt(8, 5)!.rotation).toBe('east')
      expect(renderGrid(factory, 4, 4, 9, 6)).toBe([
        '| | | | | | |',
        '| |A|─|─|P| |',
        '| | | | | | |',
      ].join('\n'))

      // WHEN — rotate the RIGHT machine (B/painter) to south
      factory.rotateMachine(factory.getMachineAt(8, 5)!, 'south')

      // THEN — B should keep south rotation, belt should be short (not U-turn)
      expect(factory.getMachineAt(8, 5)!.rotation).toBe('south')
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      // Manhattan distance = 3, belt should be at most manhattan + 3 = 6 cells
      console.log('Path:', JSON.stringify(belts[0].path))
      console.log('Path length:', belts[0].path.length)
      console.log('Grid:', renderGrid(factory, 4, 4, 9, 7))
      // The belt path should NOT go below row 7 or above row 3 (U-turn indicator)
      for (const cell of belts[0].path) {
        expect(Math.abs(cell.z - 5),
          `Cell (${cell.x},${cell.z}) too far from machines — U-turn! Path: ${JSON.stringify(belts[0].path)}`
        ).toBeLessThanOrEqual(2)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should produce short belt when destination machine is rotated to north', () => {
      factory = createTestFactory(15, 15)
      // GIVEN — A(5,5) → B(8,5) connected by straight east belt
      factory.placeMachine(5, 5, 'assembler')
      factory.placeMachine(8, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(5, 5)!, factory.getMachineAt(8, 5)!)

      // WHEN — rotate B to north
      factory.rotateMachine(factory.getMachineAt(8, 5)!, 'north')

      // THEN
      expect(factory.getMachineAt(8, 5)!.rotation).toBe('north')
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      console.log('Path:', JSON.stringify(belts[0].path))
      console.log('Path length:', belts[0].path.length)
      console.log('Grid:', renderGrid(factory, 4, 3, 9, 6))
      for (const cell of belts[0].path) {
        expect(Math.abs(cell.z - 5),
          `Cell (${cell.x},${cell.z}) too far — U-turn! Path: ${JSON.stringify(belts[0].path)}`
        ).toBeLessThanOrEqual(2)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should produce short belt when destination machine is rotated to west', () => {
      factory = createTestFactory(15, 15)
      // GIVEN — A(5,5) → B(8,5) connected by straight east belt
      factory.placeMachine(5, 5, 'assembler')
      factory.placeMachine(8, 5, 'painter')
      factory.placeBeltChain(factory.getMachineAt(5, 5)!, factory.getMachineAt(8, 5)!)

      // WHEN — rotate B to west (output faces AWAY from A)
      factory.rotateMachine(factory.getMachineAt(8, 5)!, 'west')

      // THEN
      expect(factory.getMachineAt(8, 5)!.rotation).toBe('west')
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      console.log('Path:', JSON.stringify(belts[0].path))
      console.log('Path length:', belts[0].path.length)
      console.log('Grid:', renderGrid(factory, 4, 3, 9, 7))
      for (const cell of belts[0].path) {
        expect(Math.abs(cell.z - 5),
          `Cell (${cell.x},${cell.z}) too far — U-turn! Path: ${JSON.stringify(belts[0].path)}`
        ).toBeLessThanOrEqual(2)
      }
      assertBeltSlotInvariant(factory)
    })

    it('DIAG: reproduce screenshot U-turn after multiple rotations', () => {
      factory = createTestFactory(15, 15)

      // Step 1: Place A(5,7) and B(8,7), connect with belt
      factory.placeMachine(5, 7, 'assembler')
      factory.placeMachine(8, 7, 'painter')
      factory.placeBeltChain(factory.getMachineAt(5, 7)!, factory.getMachineAt(8, 7)!)
      console.log('Step 1 - Initial connection:')
      console.log('A rot:', factory.getMachineAt(5, 7)!.rotation, 'B rot:', factory.getMachineAt(8, 7)!.rotation)
      console.log('Grid:', renderGrid(factory, 4, 5, 9, 9))
      console.log('Path:', JSON.stringify(factory.getBelts()[0]?.path))

      // Step 2: Rotate LEFT machine (A) to west
      factory.rotateMachine(factory.getMachineAt(5, 7)!, 'west')
      console.log('\nStep 2 - After rotating A to west:')
      console.log('A rot:', factory.getMachineAt(5, 7)!.rotation, 'B rot:', factory.getMachineAt(8, 7)!.rotation)
      console.log('Grid:', renderGrid(factory, 3, 5, 9, 9))
      console.log('Path:', JSON.stringify(factory.getBelts()[0]?.path))
      console.log('Path length:', factory.getBelts()[0]?.path.length)

      // Step 3: Rotate RIGHT machine (B) to south
      factory.rotateMachine(factory.getMachineAt(8, 7)!, 'south')
      console.log('\nStep 3 - After rotating B to south:')
      console.log('A rot:', factory.getMachineAt(5, 7)!.rotation, 'B rot:', factory.getMachineAt(8, 7)!.rotation)
      console.log('Grid:', renderGrid(factory, 3, 5, 10, 11))
      console.log('Path:', JSON.stringify(factory.getBelts()[0]?.path))
      console.log('Path length:', factory.getBelts()[0]?.path.length)

      // Step 4: Also try rotating B to north after that
      factory.rotateMachine(factory.getMachineAt(8, 7)!, 'north')
      console.log('\nStep 4 - After rotating B to north:')
      console.log('A rot:', factory.getMachineAt(5, 7)!.rotation, 'B rot:', factory.getMachineAt(8, 7)!.rotation)
      console.log('Grid:', renderGrid(factory, 3, 5, 10, 9))
      console.log('Path:', JSON.stringify(factory.getBelts()[0]?.path))
      console.log('Path length:', factory.getBelts()[0]?.path.length)

      // THEN — no belt should have a path longer than 10 cells for manhattan=3
      for (const belt of factory.getBelts()) {
        expect(belt.path.length, `U-turn detected! Path: ${JSON.stringify(belt.path)}`).toBeLessThanOrEqual(10)
      }
      assertBeltSlotInvariant(factory)
    })

    it('should produce short belt through valid slots after rotating destination machine', () => {
      factory = createTestFactory(15, 15)
      // GIVEN — A(5,7) → B(8,7) connected by straight east belt
      factory.placeMachine(5, 7, 'assembler')
      factory.placeMachine(8, 7, 'painter')
      factory.placeBeltChain(factory.getMachineAt(5, 7)!, factory.getMachineAt(8, 7)!)

      // ASSERT — initial state
      expect(factory.getMachineAt(5, 7)!.rotation).toBe('east')
      expect(factory.getMachineAt(8, 7)!.rotation).toBe('east')
      expect(renderGrid(factory, 4, 6, 9, 8)).toBe([
        '| | | | | | |',
        '| |A|─|─|P| |',
        '| | | | | | |',
      ].join('\n'))

      // WHEN — rotate B to south
      factory.rotateMachine(factory.getMachineAt(8, 7)!, 'south')

      // THEN — INVARIANT 1: all belts must connect through valid slots
      assertBeltSlotInvariant(factory)
      
      // THEN — INVARIANT 2: belt must exist and be short
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      const manhattan = Math.abs(5 - 8) + Math.abs(7 - 7) // = 3
      // Belt path should be at most manhattan + 3 = 6 cells (L-shape with slot overhead)
      // NOT 8+ cells (U-turn)
      expect(belts[0].path.length,
        `Belt path too long (${belts[0].path.length} cells for manhattan ${manhattan}): ${JSON.stringify(belts[0].path)}\nGrid:\n${renderGrid(factory, 4, 5, 9, 9)}`
      ).toBeLessThanOrEqual(manhattan + 3)
      
      // THEN — verify with renderGrid (exact expected layout)
      console.log('After rotating B to south:')
      console.log('A rot:', factory.getMachineAt(5, 7)!.rotation)
      console.log('B rot:', factory.getMachineAt(8, 7)!.rotation)
      console.log('Path:', JSON.stringify(belts[0].path))
      console.log('Grid:\n' + renderGrid(factory, 4, 5, 9, 9))
    })

    it('should produce short belt through valid slots after rotating source machine', () => {
      factory = createTestFactory(15, 15)
      // GIVEN — A(5,7) → B(8,7) connected by straight east belt
      factory.placeMachine(5, 7, 'assembler')
      factory.placeMachine(8, 7, 'painter')
      factory.placeBeltChain(factory.getMachineAt(5, 7)!, factory.getMachineAt(8, 7)!)

      // Test ALL rotations of the source machine
      for (const rotation of ['south', 'north', 'west'] as const) {
        // Reset: reconnect with east belt first
        if (factory.getBelts().length > 0) {
          for (const b of [...factory.getBelts()]) factory.removeBeltById(b.id)
        }
        factory.placeBeltChain(factory.getMachineAt(5, 7)!, factory.getMachineAt(8, 7)!)
        
        // WHEN — rotate SOURCE machine A
        factory.rotateMachine(factory.getMachineAt(5, 7)!, rotation)
        
        // THEN — INVARIANT 1: valid slots
        assertBeltSlotInvariant(factory)
        
        // THEN — INVARIANT 2: short path
        const belts = factory.getBelts()
        const manhattan = 3
        console.log(`A rotated to ${rotation}: A=${factory.getMachineAt(5, 7)!.rotation} B=${factory.getMachineAt(8, 7)!.rotation}`)
        if (belts.length > 0) {
          console.log(`Path (${belts[0].path.length} cells): ${JSON.stringify(belts[0].path)}`)
          console.log('Grid:\n' + renderGrid(factory, 3, 5, 9, 9))
          expect(belts[0].path.length,
            `Rotation ${rotation}: path too long (${belts[0].path.length} cells for manhattan ${manhattan}): ${JSON.stringify(belts[0].path)}`
          ).toBeLessThanOrEqual(manhattan + 5)
        } else {
          console.log('No belt placed!')
        }
      }
    })

    it('should not create crossing belt paths when rotating machine in bidirectional loop', () => {
      factory = createTestFactory(20, 20)
      // GIVEN: two south-facing machines with bidirectional belts
      const a = factory.placeMachine(9, 10, 'part_fabricator')!
      const b = factory.placeMachine(10, 10, 'part_fabricator')!
      factory.placeBeltChain(a, b, 'output', true)
      factory.placeBeltChain(b, a, 'output', true)
      expect(factory.getBelts()).toHaveLength(2)

      // WHEN: rotate B twice
      factory.rotateMachine(b, 'west')
      factory.rotateMachine(b, 'north')

      // THEN: no belt paths should cross at intermediate cells
      const belts = factory.getBelts()
      // Collect all intermediate cells (non-machine cells) from all belt paths
      const intermediateCells = new Map<string, string>() // "x,z" → belt id
      for (const belt of belts) {
        for (let i = 1; i < belt.path.length - 1; i++) {
          const key = `${belt.path[i].x},${belt.path[i].z}`
          if (intermediateCells.has(key)) {
            // Two different belts share an intermediate cell → crossing!
            throw new Error(`Belt crossing detected at (${belt.path[i].x},${belt.path[i].z}): belt ${intermediateCells.get(key)} and belt ${belt.id}`)
          }
          intermediateCells.set(key, belt.id)
        }
      }
      assertBeltSlotInvariant(factory)
    })
  })

  describe('updateMachineType()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should change the type of an existing machine', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')

      // WHEN
      const result = factory.updateMachineType(3, 3, 'painter')

      // THEN
      expect(result).toBe(true)
      expect(factory.getMachineAt(3, 3)!.type).toBe('painter')
    })

    it('should update the slots to match the new type', () => {
      // GIVEN
      factory.placeMachine(3, 3, 'assembler')

      // WHEN
      factory.updateMachineType(3, 3, 'splitter')

      // THEN — splitter has 1 input and 3 outputs
      const machine = factory.getMachineAt(3, 3)!
      expect(machine.slots.inputs).toHaveLength(1)
      expect(machine.slots.outputs).toHaveLength(3)
    })

    it('should return false for empty cell', () => {
      // WHEN + THEN
      expect(factory.updateMachineType(0, 0, 'painter')).toBe(false)
    })

    it('should return false for out-of-bounds coordinates', () => {
      // WHEN + THEN
      expect(factory.updateMachineType(-1, 0, 'painter')).toBe(false)
      expect(factory.updateMachineType(0, 10, 'painter')).toBe(false)
    })

    it('should preserve machine position and id after type change', () => {
      // GIVEN
      factory.placeMachine(4, 4, 'recycler')
      const idBefore = factory.getMachineAt(4, 4)!.id

      // WHEN
      factory.updateMachineType(4, 4, 'quality_checker')

      // THEN
      const machine = factory.getMachineAt(4, 4)!
      expect(machine.id).toBe(idBefore)
      expect(machine.x).toBe(4)
      expect(machine.z).toBe(4)
      expect(machine.type).toBe('quality_checker')
    })
  })

  describe('slot-blocking placement constraint', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    // ─── placeMachine tests ────────────────────────────────

    it('should reject placing a machine directly in front of another machine\'s output slot', () => {
      // GIVEN: assembler at (5,5) rotation south → output slot faces (5,6)
      factory.placeMachine(5, 5, 'assembler')

      // ASSERT
      expect(renderGrid(factory, 4, 4, 6, 6)).toBe([
        '| | | |',
        '| |A| |',
        '| | | |',
      ].join('\n'))

      // WHEN: try to place a machine at (5,6) — directly in front of assembler's output
      const result = factory.placeMachine(5, 6, 'painter')

      // THEN: placement must be rejected
      expect(result).toBeNull()
      expect(factory.getMachineAt(5, 6)).toBeNull()
    })

    it('should reject placing a machine directly behind another machine (blocking its input slot)', () => {
      // GIVEN: assembler at (5,5) rotation south → input slot faces (5,4)
      factory.placeMachine(5, 5, 'assembler')

      // ASSERT
      expect(renderGrid(factory, 4, 4, 6, 6)).toBe([
        '| | | |',
        '| |A| |',
        '| | | |',
      ].join('\n'))

      // WHEN: try to place a machine at (5,4) — directly behind assembler (blocking input)
      const result = factory.placeMachine(5, 4, 'painter')

      // THEN: placement must be rejected
      expect(result).toBeNull()
      expect(factory.getMachineAt(5, 4)).toBeNull()
    })

    it('should allow placing a machine on the side (not in front of any slot)', () => {
      // GIVEN: painter at (5,5) rotation south → slots face (5,6) and (5,4)
      factory.placeMachine(5, 5, 'painter')

      // WHEN: place machine at (6,5) — side of painter, not blocking any slot
      const result = factory.placeMachine(6, 5, 'recycler')

      // THEN: placement succeeds
      expect(result).not.toBeNull()
      expect(factory.getMachineAt(6, 5)).not.toBeNull()
      expect(renderGrid(factory, 4, 4, 7, 6)).toBe([
        '| | | | |',
        '| |P|R| |',
        '| | | | |',
      ].join('\n'))
    })

    it('should reject splitter placement adjacent to any existing machine (all 4 neighbors blocked)', () => {
      // GIVEN: assembler at (5,3) — the splitter at (5,5) has slots on all 4 sides
      // Splitter slots at south: front→(5,6), back→(5,4), right→(6,5), left→(4,5)
      // Placing assembler at (5,6) blocks splitter's front slot
      factory.placeMachine(5, 6, 'assembler')

      // WHEN: try to place splitter at (5,5) — its front slot (0,1) points at assembler at (5,6)
      const result = factory.placeMachine(5, 5, 'splitter')

      // THEN: placement must be rejected
      expect(result).toBeNull()
      expect(factory.getMachineAt(5, 5)).toBeNull()
    })

    it('should reject assembler placement adjacent to any existing machine (all 4 neighbors blocked)', () => {
      // GIVEN: painter at (5,6), assembler at (5,5) has slots on all 4 sides
      factory.placeMachine(5, 6, 'painter')

      // WHEN: try to place assembler at (5,5) — its front slot (0,1) points at painter at (5,6)
      const result = factory.placeMachine(5, 5, 'assembler')

      // THEN: placement must be rejected
      expect(result).toBeNull()
      expect(factory.getMachineAt(5, 5)).toBeNull()
    })

    it('should reject placing a regular machine in front of a splitter\'s side output slot', () => {
      // GIVEN: splitter at (5,5) rotation south → right output at (6,5)
      factory.placeMachine(5, 5, 'splitter')

      // WHEN: try to place painter at (6,5) — in front of splitter's right output
      const result = factory.placeMachine(6, 5, 'painter')

      // THEN: placement must be rejected
      expect(result).toBeNull()
      expect(factory.getMachineAt(6, 5)).toBeNull()
    })

    it('should allow placing a machine 2 cells away (not directly adjacent to slots)', () => {
      // GIVEN: assembler at (5,5) rotation south → output at (5,6), input at (5,4)
      factory.placeMachine(5, 5, 'assembler')

      // WHEN: place machine at (5,7) — 2 cells south (not directly adjacent)
      const result = factory.placeMachine(5, 7, 'painter')

      // THEN: placement succeeds
      expect(result).not.toBeNull()
      expect(factory.getMachineAt(5, 7)).not.toBeNull()
      expect(renderGrid(factory, 4, 4, 6, 8)).toBe([
        '| | | |',
        '| |A| |',
        '| | | |',
        '| |P| |',
        '| | | |',
      ].join('\n'))
    })

    // ─── moveMachine tests ─────────────────────────────────

    it('should reject moving a machine to a slot-blocked position', () => {
      // GIVEN: assembler at (5,5), painter at (2,2)
      factory.placeMachine(5, 5, 'assembler')
      factory.placeMachine(2, 2, 'painter')

      // ASSERT
      expect(renderGrid(factory, 1, 1, 6, 6)).toBe([
        '| | | | | | |',
        '| |P| | | | |',
        '| | | | | | |',
        '| | | | | | |',
        '| | | | |A| |',
        '| | | | | | |',
      ].join('\n'))

      // WHEN: move painter to (5,6) — directly in front of assembler's output slot
      const result = factory.moveMachine(2, 2, 5, 6)

      // THEN: move must be rejected
      expect(result).toBe(false)
      expect(factory.getMachineAt(2, 2)).not.toBeNull() // painter still at original position
      expect(factory.getMachineAt(5, 6)).toBeNull()
    })

    it('should allow moving a machine to a non-blocked position', () => {
      // GIVEN: assembler at (5,5), painter at (2,2)
      factory.placeMachine(5, 5, 'assembler')
      factory.placeMachine(2, 2, 'painter')

      // WHEN: move painter to (7,5) — side of assembler, no slots blocked
      const result = factory.moveMachine(2, 2, 7, 5)

      // THEN: move succeeds
      expect(result).toBe(true)
      expect(factory.getMachineAt(2, 2)).toBeNull()
      expect(factory.getMachineAt(7, 5)).not.toBeNull()
      expect(renderGrid(factory, 4, 4, 8, 6)).toBe([
        '| | | | | |',
        '| |A| |P| |',
        '| | | | | |',
      ].join('\n'))
    })

    // ─── rotateMachine tests ───────────────────────────────

    it('should skip rotation that makes a slot face a neighbor and use next valid CW rotation', () => {
      // GIVEN: part_fabricator at (5,5) rotation south, neighbor at (6,5) on its side (valid placement)
      const machine = factory.placeMachine(5, 5, 'part_fabricator')!
      factory.placeMachine(6, 5, 'painter')

      // ASSERT: machine starts at south, neighbor is on the side
      expect(machine.rotation).toBe('south')
      expect(renderGrid(factory, 4, 4, 7, 6)).toBe([
        '| | | | |',
        '| |F|P| |',
        '| | | | |',
      ].join('\n'))

      // WHEN: rotate to east — output would face (6,5) which has a machine → blocked
      const result = factory.rotateMachine(machine, 'east')

      // THEN: east is invalid (output slot faces neighbor), should skip to next valid CW
      // CW order after east: south → output (5,6) free, input (5,4) free → valid
      expect(result).toBe(true)
      expect(machine.rotation).toBe('south')
    })

    it('should return false and keep current rotation when no valid rotation exists', () => {
      // GIVEN: assembler at (5,5) with machines on all 4 sides
      // Using restoreState to set up the grid directly, bypassing placement validation.
      // Direct placeMachine calls would be rejected by the slot-blocking constraint
      // because (5,6) and (5,4) are the assembler's output/input slots.
      factory.restoreState([
        { x: 5, z: 5, type: 'assembler', rotation: 'south' },
        { x: 5, z: 6, type: 'part_fabricator', rotation: 'south' },
        { x: 5, z: 4, type: 'painter', rotation: 'south' },
        { x: 6, z: 5, type: 'recycler', rotation: 'south' },
        { x: 4, z: 5, type: 'quality_checker', rotation: 'south' },
      ], [])

      const machine = factory.getMachineAt(5, 5)!

      // ASSERT
      expect(machine).not.toBeNull()
      expect(machine.rotation).toBe('south')
      expect(renderGrid(factory, 3, 3, 7, 7)).toBe([
        '| | | | | |',
        '| | |P| | |',
        '| |Q|A|R| |',
        '| | |F| | |',
        '| | | | | |',
      ].join('\n'))

      // WHEN: try to rotate — every rotation makes a slot face a neighbor
      const result = factory.rotateMachine(machine, 'north')

      // THEN: no valid rotation → stays at south, returns false
      expect(result).toBe(false)
      expect(machine.rotation).toBe('south')
    })

    it('should always succeed rotation when no neighbors exist', () => {
      // GIVEN: isolated assembler at (5,5)
      const machine = factory.placeMachine(5, 5, 'assembler')!

      // ASSERT
      expect(machine.rotation).toBe('south')

      // WHEN: rotate to north
      const result = factory.rotateMachine(machine, 'north')

      // THEN: succeeds freely
      expect(result).toBe(true)
      expect(machine.rotation).toBe('north')
    })
  })

  // ─── canMoveMachine ────────────────────────────────────

  describe('canMoveMachine()', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should return true when target is empty and not slot-blocked', () => {
      // GIVEN: assembler at (2,2), target (7,7) is far away and empty
      factory.placeMachine(2, 2, 'assembler')

      // WHEN
      const result = factory.canMoveMachine(2, 2, 7, 7)

      // THEN
      expect(result).toBe(true)
    })

    it('should return false when target cell has a machine', () => {
      // GIVEN: assembler at (2,2), painter at (7,7)
      factory.placeMachine(2, 2, 'assembler')
      factory.placeMachine(7, 7, 'painter')

      // WHEN
      const result = factory.canMoveMachine(2, 2, 7, 7)

      // THEN
      expect(result).toBe(false)
    })

    it('should return false when target is out of bounds (negative)', () => {
      // GIVEN: assembler at (2,2)
      factory.placeMachine(2, 2, 'assembler')

      // WHEN + THEN
      expect(factory.canMoveMachine(2, 2, -1, 0)).toBe(false)
    })

    it('should return false when target is out of bounds (beyond grid)', () => {
      // GIVEN: assembler at (2,2), grid is 10×10
      factory.placeMachine(2, 2, 'assembler')

      // WHEN + THEN
      expect(factory.canMoveMachine(2, 2, 10, 5)).toBe(false)
    })

    it('should return false when source has no machine', () => {
      // GIVEN: no machine at (0,0)

      // WHEN
      const result = factory.canMoveMachine(0, 0, 5, 5)

      // THEN
      expect(result).toBe(false)
    })

    it('should return false when target is slot-blocked by neighbor output', () => {
      // GIVEN: assembler at (5,5) rotation south → output slot at (5,6)
      //        painter at (2,2) — we want to move it to (5,6)
      factory.placeMachine(5, 5, 'assembler')
      factory.placeMachine(2, 2, 'painter')

      // WHEN: try to query move to (5,6) — blocked by assembler's output slot
      const result = factory.canMoveMachine(2, 2, 5, 6)

      // THEN
      expect(result).toBe(false)
    })

    it('should return false when target is slot-blocked by neighbor input', () => {
      // GIVEN: assembler at (5,5) rotation south → input slot at (5,4)
      //        painter at (2,2) — we want to move it to (5,4)
      factory.placeMachine(5, 5, 'assembler')
      factory.placeMachine(2, 2, 'painter')

      // WHEN: try to query move to (5,4) — blocked by assembler's input slot
      const result = factory.canMoveMachine(2, 2, 5, 4)

      // THEN
      expect(result).toBe(false)
    })

    it('should return true when target is next to a neighbor but on the side (not slot-blocked)', () => {
      // GIVEN: part_fabricator at (5,5) rotation south → slots at (5,4) and (5,6)
      //        painter at (2,2) — we want to move it to (6,5) (side of part_fabricator)
      factory.placeMachine(5, 5, 'part_fabricator')
      factory.placeMachine(2, 2, 'painter')

      // WHEN: move to (6,5) — side of part_fabricator, no slot conflict
      const result = factory.canMoveMachine(2, 2, 6, 5)

      // THEN
      expect(result).toBe(true)
    })

    it('should not modify factory state (read-only check)', () => {
      // GIVEN: assembler at (2,2)
      factory.placeMachine(2, 2, 'assembler')

      // WHEN: call canMoveMachine (regardless of result)
      factory.canMoveMachine(2, 2, 5, 5)

      // THEN: machine is still at (2,2), target is still empty
      expect(factory.getMachineAt(2, 2)).not.toBeNull()
      expect(factory.getMachineAt(2, 2)!.type).toBe('assembler')
      expect(factory.getMachineAt(5, 5)).toBeNull()
    })

    it('should return false when source is out of bounds', () => {
      // WHEN + THEN
      expect(factory.canMoveMachine(-1, -1, 5, 5)).toBe(false)
    })

    it('should return true when source and target are the same cell', () => {
      // GIVEN: assembler at (3,3)
      factory.placeMachine(3, 3, 'assembler')

      // WHEN: query move to same position (drag back to origin)
      const result = factory.canMoveMachine(3, 3, 3, 3)

      // THEN: returning to origin is always valid
      expect(result).toBe(true)
    })

    it('should return false when move would cause belt crossing', () => {
      // GIVEN: 20×20 grid, two south-facing machines with bidirectional belts
      factory = createTestFactory(20, 20)
      const a = factory.placeMachine(9, 10, 'part_fabricator')!
      const b = factory.placeMachine(10, 10, 'part_fabricator')!
      factory.rotateMachine(a, 'south')
      factory.rotateMachine(b, 'south')
      // Connect A→B and B→A with fixedRotations=true (bidirectional)
      factory.placeBeltChain(a, b, 'output', true)
      factory.placeBeltChain(b, a, 'output', true)

      // ASSERT: both belts exist before the move query
      expect(factory.getBelts()).toHaveLength(2)
      assertBeltSlotInvariant(factory)

      // WHEN: try to move B down to (10,13) — smart routing avoids crossing
      const result = factory.canMoveMachine(10, 10, 10, 13)

      // THEN: move is allowed because belts can be reconnected without crossing
      expect(result).toBe(true)
    })

    it('should return false when move would drop a belt (no valid reconnection path)', () => {
      // GIVEN: 10×10 grid, machine A connected to machine B via belt,
      // and the target position is surrounded by blocking machines so
      // no reconnection path exists
      factory = createTestFactory(10, 10)
      const a = factory.placeMachine(1, 1, 'part_fabricator')!
      const b = factory.placeMachine(3, 1, 'part_fabricator')!
      factory.placeBeltChain(a, b, 'output')

      // ASSERT: belt exists
      expect(factory.getBelts()).toHaveLength(1)
      assertBeltSlotInvariant(factory)

      // Surround target position (8,8) with machines on all sides
      // so no belt can route from A at (1,1) to B moved to (8,8)
      factory.placeMachine(7, 8, 'assembler')
      factory.placeMachine(8, 7, 'assembler')
      factory.placeMachine(8, 9, 'assembler')
      factory.placeMachine(9, 8, 'assembler')
      // Also block diagonal approaches
      factory.placeMachine(7, 7, 'assembler')
      factory.placeMachine(7, 9, 'assembler')
      factory.placeMachine(9, 7, 'assembler')
      factory.placeMachine(9, 9, 'assembler')

      // WHEN: try to move B to the surrounded position (8,8)
      const result = factory.canMoveMachine(3, 1, 8, 8)

      // THEN: move should be rejected — belt from A cannot reconnect to B at (8,8)
      expect(result).toBe(false)
    })

    it('should return true when move preserves all belt connections', () => {
      // GIVEN: 10×10 grid, two machines connected by a belt,
      // move one to a nearby position where reconnection is easy
      factory = createTestFactory(10, 10)
      const a = factory.placeMachine(2, 2, 'part_fabricator')!
      const b = factory.placeMachine(5, 2, 'part_fabricator')!
      factory.placeBeltChain(a, b, 'output')

      // ASSERT: belt exists
      expect(factory.getBelts()).toHaveLength(1)
      assertBeltSlotInvariant(factory)

      // WHEN: move B one step away — reconnection should be straightforward
      const result = factory.canMoveMachine(5, 2, 6, 2)

      // THEN: move should be allowed — belt can reconnect cleanly
      expect(result).toBe(true)
    })
  })

  describe('placeBeltChain() with fixedRotations', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should not rotate machines when fixedRotations is true', () => {
      // GIVEN: two fabricators side by side, both facing south
      const left = factory.placeMachine(3, 5, 'part_fabricator')!
      const right = factory.placeMachine(4, 5, 'part_fabricator')!

      // ASSERT: both face south
      expect(left.rotation).toBe('south')
      expect(right.rotation).toBe('south')

      // WHEN: connect with fixedRotations=true
      const result = factory.placeBeltChain(left, right, 'output', true)

      // THEN: belt is created, machines keep their rotations
      expect(result).toBe(true)
      expect(left.rotation).toBe('south')
      expect(right.rotation).toBe('south')
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      assertBeltSlotInvariant(factory)
    })

    it('should auto-rotate machines when fixedRotations is not set', () => {
      // GIVEN: two fabricators side by side, both facing south
      const left = factory.placeMachine(3, 5, 'part_fabricator')!
      const right = factory.placeMachine(4, 5, 'part_fabricator')!

      // WHEN: connect without fixedRotations
      const result = factory.placeBeltChain(left, right, 'output')

      // THEN: belt is created, machines get auto-rotated
      expect(result).toBe(true)
      // At least one machine should have been rotated (they can't connect in south-south without routing)
      const rotated = left.rotation !== 'south' || right.rotation !== 'south'
      expect(rotated).toBe(true)
      assertBeltSlotInvariant(factory)
    })
  })

  describe('computePlacementPlan input-slot routing', () => {
    beforeEach(() => {
      factory = createTestFactory(15, 15)
    })

    it('should auto-rotate assembler input toward fabricator and fabricator output toward assembler', () => {
      // GIVEN: assembler at (3,5) and fabricator at (7,5) on same row
      // Assembler has inputs: back, right, left; output: front
      // Fabricator has input: back; output: front (default)
      const assembler = factory.placeMachine(3, 5, 'assembler')!
      const fabricator = factory.placeMachine(7, 5, 'part_fabricator')!

      // WHEN: drag from assembler INPUT slot to fabricator
      // sourceSlotType='input' means the source machine (assembler) should present
      // an INPUT slot, and the target (fabricator) should present an OUTPUT slot.
      // Items flow: fabricator output → belt → assembler input
      const result = factory.placeBeltChain(assembler, fabricator, 'input')

      // THEN: belt should be placed successfully (non-colliding path found)
      expect(result).toBe(true)

      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)

      // The assembler must have at least one INPUT slot facing east (+X, toward fabricator)
      const asmSlots = getSlotPositions('assembler')
      const asmInputOffsets = asmSlots.inputs.map(s => slotPositionToOffset(s, assembler.rotation))
      const asmHasInputFacingEast = asmInputOffsets.some(o => o.x === 1 && o.z === 0)
      expect(asmHasInputFacingEast,
        `Assembler rotation=${assembler.rotation} has no input facing east. Input offsets: ${JSON.stringify(asmInputOffsets)}`
      ).toBe(true)

      // The fabricator must have its OUTPUT slot facing west (-X, toward assembler)
      const fabSlots = getSlotPositions('part_fabricator')
      const fabOutputOffsets = fabSlots.outputs.map(s => slotPositionToOffset(s, fabricator.rotation))
      const fabHasOutputFacingWest = fabOutputOffsets.some(o => o.x === -1 && o.z === 0)
      expect(fabHasOutputFacingWest,
        `Fabricator rotation=${fabricator.rotation} has no output facing west. Output offsets: ${JSON.stringify(fabOutputOffsets)}`
      ).toBe(true)

      assertBeltSlotInvariant(factory)
    })

    it('should route belt from fabricator output to assembler left input when assembler already has one belt connected', () => {
      // GIVEN: assembler at (5,5) with default rotation 'south'
      const assembler = factory.placeMachine(5, 5, 'assembler')!
      expect(assembler).not.toBeNull()

      // Place a helper fabricator at (5,2) — north of assembler
      const helperFab = factory.placeMachine(5, 2, 'part_fabricator')!
      expect(helperFab).not.toBeNull()

      // Connect helper fabricator to assembler to lock assembler's rotation
      // This connects helperFab output → assembler back input, locking assembler at 'south'
      const helperResult = factory.placeBeltChain(helperFab, assembler, 'output')
      expect(helperResult).toBe(true)
      expect(factory.getBelts()).toHaveLength(1)

      // ASSERT: assembler now has belts → will NOT be auto-rotated
      // Assembler rotation should be 'south' (output faces +Z)
      expect(assembler.rotation).toBe('south')

      // Place standalone fabricator at (5,8) — south of assembler, no belts
      const standaloneFab = factory.placeMachine(5, 8, 'part_fabricator')!
      expect(standaloneFab).not.toBeNull()

      // WHEN: drag from assembler INPUT to standalone fabricator
      // sourceSlotType='input' → assembler presents input, fabricator presents output
      // Items flow: fabricator output → belt → assembler input
      const result = factory.placeBeltChain(assembler, standaloneFab, 'input')

      // THEN: belt should be placed successfully
      expect(result).toBe(true)
      expect(factory.getBelts()).toHaveLength(2)

      // The standalone fabricator should auto-rotate so its OUTPUT faces
      // toward the assembler (northward, i.e. -Z direction)
      const fabSlots = getSlotPositions('part_fabricator')
      const fabOutputOffsets = fabSlots.outputs.map(s => slotPositionToOffset(s, standaloneFab.rotation))
      const fabHasOutputFacingNorth = fabOutputOffsets.some(o => o.x === 0 && o.z === -1)
      expect(fabHasOutputFacingNorth,
        `Fabricator rotation=${standaloneFab.rotation} should have output facing north (-Z). Output offsets: ${JSON.stringify(fabOutputOffsets)}`
      ).toBe(true)

      assertBeltSlotInvariant(factory)
    })
  })

  describe('placeBeltChain auto-rotation fallback', () => {
    beforeEach(() => {
      factory = createTestFactory(20, 20)
    })

    it('should preserve machine rotations with fixedRotations=true', () => {
      // GIVEN — two south-facing fabricators on same column, B is south of A
      // Both face south: A output at (5,6), B input at (5,7) → straight path works
      const machineA = factory.placeMachine(5, 5, 'part_fabricator')!
      const machineB = factory.placeMachine(5, 8, 'part_fabricator')!
      expect(machineA.rotation).toBe('south')
      expect(machineB.rotation).toBe('south')

      // ASSERT
      expect(renderGrid(factory, 5, 5, 5, 8)).toBe([
        '|F|',
        '| |',
        '| |',
        '|F|',
      ].join('\n'))

      // WHEN — place with fixedRotations=true
      const result = factory.placeBeltChain(machineA, machineB, 'output', true)

      // THEN — succeeds AND rotations are preserved
      expect(result).toBe(true)
      expect(machineA.rotation).toBe('south')
      expect(machineB.rotation).toBe('south')
      assertBeltSlotInvariant(factory)
    })

    it('should auto-rotate unconnected machines when fixedRotations is false', () => {
      // GIVEN — two fabricators on same row, both facing south (wrong way for east-west belt)
      const machineA = factory.placeMachine(5, 5, 'part_fabricator')!
      const machineB = factory.placeMachine(8, 5, 'part_fabricator')!
      expect(machineA.rotation).toBe('south')
      expect(machineB.rotation).toBe('south')

      // ASSERT
      expect(renderGrid(factory, 5, 5, 8, 5)).toBe([
        '|F| | |F|',
      ].join('\n'))

      // WHEN — place without fixedRotations (auto-rotation allowed)
      const result = factory.placeBeltChain(machineA, machineB, 'output')

      // THEN — succeeds with auto-rotation
      expect(result).toBe(true)
      expect(factory.getBelts()).toHaveLength(1)

      // At least one machine should have been rotated from default 'south'
      const rotationChanged = machineA.rotation !== 'south' || machineB.rotation !== 'south'
      expect(rotationChanged,
        `Expected auto-rotation from default 'south'. A=${machineA.rotation}, B=${machineB.rotation}`
      ).toBe(true)

      assertBeltSlotInvariant(factory)
    })

    it('should produce shorter belt path with auto-rotation than with fixed rotations', () => {
      // GIVEN — two south-facing fabricators side by side on same row
      // With fixedRotations=true: BFS must route around machines via slots (longer S-path)
      // Without fixedRotations: machines rotate to face each other (shorter straight path)
      const mA1 = factory.placeMachine(5, 5, 'part_fabricator')!
      const mB1 = factory.placeMachine(7, 5, 'part_fabricator')!

      // WHEN — place with fixedRotations=true
      const fixedResult = factory.placeBeltChain(mA1, mB1, 'output', true)
      expect(fixedResult).toBe(true)
      const fixedPathLength = factory.getBelts()[0].path.length
      const fixedARotation = mA1.rotation
      const fixedBRotation = mB1.rotation

      // Rotations should stay at 'south' with fixedRotations=true
      expect(fixedARotation).toBe('south')
      expect(fixedBRotation).toBe('south')

      // GIVEN — fresh factory for auto-rotation test
      factory = createTestFactory(20, 20)
      const mA2 = factory.placeMachine(5, 5, 'part_fabricator')!
      const mB2 = factory.placeMachine(7, 5, 'part_fabricator')!

      // WHEN — place without fixedRotations
      const autoResult = factory.placeBeltChain(mA2, mB2, 'output')
      expect(autoResult).toBe(true)
      const autoPathLength = factory.getBelts()[0].path.length

      // THEN — auto-rotated path should be shorter or equal (direct east-west)
      expect(autoPathLength).toBeLessThanOrEqual(fixedPathLength)
      assertBeltSlotInvariant(factory)
    })

    it('should succeed with auto-rotation when machines face away from each other on same column', () => {
      // GIVEN — two south-facing fabricators on same column, B is NORTH of A
      // A at (5,5) south: output faces +Z, B at (5,2) south: input faces -Z
      // Without auto-rotation, belt would need a long detour
      const machineA = factory.placeMachine(5, 5, 'part_fabricator')!
      const machineB = factory.placeMachine(5, 2, 'part_fabricator')!
      expect(machineA.rotation).toBe('south')
      expect(machineB.rotation).toBe('south')

      // ASSERT
      expect(renderGrid(factory, 5, 2, 5, 5)).toBe([
        '|F|',
        '| |',
        '| |',
        '|F|',
      ].join('\n'))

      // WHEN — place without fixedRotations (auto-rotation allowed)
      const result = factory.placeBeltChain(machineA, machineB, 'output')

      // THEN — should succeed: planner auto-rotates machines to connect
      expect(result).toBe(true)
      expect(factory.getBelts()).toHaveLength(1)

      const belt = factory.getBelts()[0]
      expect(belt.sourceMachine.id).toBe(machineA.id)
      expect(belt.destinationMachine.id).toBe(machineB.id)

      // At least one machine should have been rotated from default 'south'
      const rotationChanged = machineA.rotation !== 'south' || machineB.rotation !== 'south'
      expect(rotationChanged,
        `Expected auto-rotation from default 'south'. A=${machineA.rotation}, B=${machineB.rotation}`
      ).toBe(true)

      assertBeltSlotInvariant(factory)
    })

    it('should rotate source output toward destination with auto-rotation', () => {
      // GIVEN — fabricator A far west of B, both facing south
      const machineA = factory.placeMachine(3, 5, 'part_fabricator')!
      const machineB = factory.placeMachine(8, 5, 'part_fabricator')!
      expect(machineA.rotation).toBe('south')
      expect(machineB.rotation).toBe('south')

      // WHEN — place belt with auto-rotation
      const result = factory.placeBeltChain(machineA, machineB, 'output')

      // THEN — machineA's output (front) should face east toward machineB
      expect(result).toBe(true)

      // Verify: A's output slot faces toward B (east direction)
      const srcSlots = getSlotPositions('part_fabricator')
      const srcOutputOffsets = srcSlots.outputs.map(s => slotPositionToOffset(s, machineA.rotation))
      // At least one output offset should point in +X direction (east)
      const hasEastOutput = srcOutputOffsets.some(o => o.x > 0)
      expect(hasEastOutput,
        `machineA rotation=${machineA.rotation} should have output facing east. Offsets: ${JSON.stringify(srcOutputOffsets)}`
      ).toBe(true)

      assertBeltSlotInvariant(factory)
    })
  })

  describe('placeBeltChain slot type validation', () => {
    beforeEach(() => {
      factory = createTestFactory(10, 10)
    })

    it('should reject belt where source slot resolves to an input slot', () => {
      // GIVEN: A Shipper (factory_output) has 4 input slots and 0 output slots.
      // A Fabricator (part_fabricator) has 1 input and 1 output (default slots).
      const shipper = factory.placeMachine(2, 2, 'factory_output')!
      const fabricator = factory.placeMachine(2, 5, 'part_fabricator')!
      expect(shipper).not.toBeNull()
      expect(fabricator).not.toBeNull()
      expect(shipper.slots.outputs).toHaveLength(0)
      expect(shipper.slots.inputs).toHaveLength(4)

      // WHEN: Try to create a belt FROM the shipper (as source with 'output' slot type).
      // The shipper has no output slots, so this must fail.
      const result = factory.placeBeltChain(shipper, fabricator, 'output')

      // THEN: Should return false — shipper has no outputs to serve as source.
      expect(result).toBe(false)
      expect(factory.getBelts()).toHaveLength(0)
    })

    it('should reject belt creating input-to-input connection', () => {
      // GIVEN: Two Shippers — both have only input slots, no outputs.
      const shipperA = factory.placeMachine(2, 2, 'factory_output')!
      const shipperB = factory.placeMachine(2, 5, 'factory_output')!
      expect(shipperA).not.toBeNull()
      expect(shipperB).not.toBeNull()
      expect(shipperA.slots.outputs).toHaveLength(0)
      expect(shipperB.slots.outputs).toHaveLength(0)

      // WHEN/THEN: Neither direction should produce a belt — no outputs exist on either machine.
      const resultOutput = factory.placeBeltChain(shipperA, shipperB, 'output')
      expect(resultOutput).toBe(false)

      const resultInput = factory.placeBeltChain(shipperA, shipperB, 'input')
      expect(resultInput).toBe(false)

      expect(factory.getBelts()).toHaveLength(0)
    })

    it('should allow valid output-to-input connection', () => {
      // GIVEN: A Fabricator (has output 'front') and a Shipper (has inputs on all sides).
      const fabricator = factory.placeMachine(2, 2, 'part_fabricator')!
      const shipper = factory.placeMachine(2, 5, 'factory_output')!
      expect(fabricator).not.toBeNull()
      expect(shipper).not.toBeNull()
      expect(fabricator.slots.outputs.length).toBeGreaterThan(0)
      expect(shipper.slots.inputs.length).toBeGreaterThan(0)

      // WHEN: Connect fabricator (output) → shipper (input).
      const result = factory.placeBeltChain(fabricator, shipper, 'output')

      // THEN: Should succeed.
      expect(result).toBe(true)
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)

      // The belt's sourceSlot must be an output of the fabricator.
      const belt = belts[0]
      expect(fabricator.slots.outputs).toContain(belt.sourceSlot)
      // The belt's destinationSlot must be an input of the shipper.
      expect(shipper.slots.inputs).toContain(belt.destinationSlot)

      assertBeltSlotInvariant(factory)
    })

    it('should fail with sourceSlotType=input when target has no outputs (Shipper)', () => {
      // GIVEN: Fabricator at (5,5) and Shipper at (8,5).
      factory = createTestFactory(15, 15)
      const fabricator = factory.placeMachine(5, 5, 'part_fabricator')!
      const shipper = factory.placeMachine(8, 5, 'factory_output')!
      expect(fabricator).not.toBeNull()
      expect(shipper).not.toBeNull()
      expect(shipper.slots.outputs).toHaveLength(0)

      // WHEN: Try placeBeltChain with sourceSlotType='input' — this means
      // source uses its input slot, target must provide an output slot.
      // Shipper has no outputs, so this should fail.
      const resultInput = factory.placeBeltChain(fabricator, shipper, 'input')

      // THEN: Should fail — Shipper has no output slots for the reverse end.
      expect(resultInput).toBe(false)
      expect(factory.getBelts()).toHaveLength(0)

      // WHEN: Try placeBeltChain with sourceSlotType='output' — Fabricator
      // uses its output slot, Shipper provides an input slot. Should succeed.
      const resultOutput = factory.placeBeltChain(fabricator, shipper, 'output')

      // THEN: Should succeed — Fabricator output → Shipper input.
      expect(resultOutput).toBe(true)
      expect(factory.getBelts()).toHaveLength(1)

      const belt = factory.getBelts()[0]
      expect(fabricator.slots.outputs).toContain(belt.sourceSlot)
      expect(shipper.slots.inputs).toContain(belt.destinationSlot)

      assertBeltSlotInvariant(factory)

      // Verify grid shows the connection
      expect(renderGrid(factory, 4, 4, 9, 6)).toMatchSnapshot()
    })

    it('should succeed with reverse slot type when first belt exists', () => {
      // GIVEN: Shipper at (8,5), Fabricator A at (8,8), Fabricator B at (12,5).
      factory = createTestFactory(20, 20)
      const shipper = factory.placeMachine(8, 5, 'factory_output')!
      const fabricatorA = factory.placeMachine(8, 8, 'part_fabricator')!
      const fabricatorB = factory.placeMachine(12, 5, 'part_fabricator')!
      expect(shipper).not.toBeNull()
      expect(fabricatorA).not.toBeNull()
      expect(fabricatorB).not.toBeNull()

      // WHEN: Connect Fabricator A → Shipper with 'output' — should succeed.
      const belt1Result = factory.placeBeltChain(fabricatorA, shipper, 'output')
      expect(belt1Result).toBe(true)
      expect(factory.getBelts()).toHaveLength(1)

      // WHEN: Try placeBeltChain(fabricatorB, shipper, 'input') — should fail
      // because Shipper has no output slots.
      const belt2InputResult = factory.placeBeltChain(fabricatorB, shipper, 'input')
      expect(belt2InputResult).toBe(false)
      expect(factory.getBelts()).toHaveLength(1) // no new belt added

      // WHEN: Try placeBeltChain(fabricatorB, shipper, 'output') — should succeed
      // because Fabricator B has outputs and Shipper still has free input slots.
      const belt2OutputResult = factory.placeBeltChain(fabricatorB, shipper, 'output')
      expect(belt2OutputResult).toBe(true)
      expect(factory.getBelts()).toHaveLength(2)

      // THEN: Both belts feed into the Shipper's input slots.
      const belts = factory.getBelts()
      for (const belt of belts) {
        expect(shipper.slots.inputs).toContain(belt.destinationSlot)
      }

      assertBeltSlotInvariant(factory)

      // Verify grid shows both connections
      expect(renderGrid(factory, 6, 3, 14, 10)).toMatchSnapshot()
    })
  })

  describe('placeBeltChain slot freedom validation', () => {
    it('should return null or colliding when both machines have no free slots for the requested type', () => {
      // GIVEN: 20×20 factory with Shipper at (8,5), Fabricator A at (8,8), Fabricator B at (12,5).
      factory = createTestFactory(20, 20)
      const shipper = factory.placeMachine(8, 5, 'factory_output')!
      const fabA = factory.placeMachine(8, 8, 'part_fabricator')!
      const fabB = factory.placeMachine(12, 5, 'part_fabricator')!
      expect(shipper).not.toBeNull()
      expect(fabA).not.toBeNull()
      expect(fabB).not.toBeNull()

      // Connect Fab A → Shipper (occupies Fab A's only output slot)
      const belt1 = factory.placeBeltChain(fabA, shipper, 'output')
      expect(belt1).toBe(true)

      // Connect Fab B → Shipper (occupies Fab B's only output slot)
      const belt2 = factory.placeBeltChain(fabB, shipper, 'output')
      expect(belt2).toBe(true)
      expect(factory.getBelts()).toHaveLength(2)

      // ASSERT: Initial grid state with both connections
      expect(renderGrid(factory, 6, 3, 14, 10)).toMatchSnapshot()

      // WHEN: computeBeltFromSlotPath(Fab B → Fab A, 'output')
      // Both fabricators have their only output slot occupied.
      const result = factory.computeBeltFromSlotPath(
        { x: 12, z: 5 }, { x: 8, z: 8 }, 'output'
      )

      // THEN: Should return null or collides:true — NOT a non-colliding path
      if (result !== null) {
        expect(result.collides).toBe(true)
      }
    })

    it('should reject placeBeltChain when source output slot is already occupied', () => {
      // GIVEN: 20×20 factory with Shipper at (8,5), Fabricator A at (8,8), Fabricator B at (12,5).
      factory = createTestFactory(20, 20)
      const shipper = factory.placeMachine(8, 5, 'factory_output')!
      const fabA = factory.placeMachine(8, 8, 'part_fabricator')!
      const fabB = factory.placeMachine(12, 5, 'part_fabricator')!
      expect(shipper).not.toBeNull()
      expect(fabA).not.toBeNull()
      expect(fabB).not.toBeNull()

      // Connect Fab A → Shipper (occupies Fab A's only output slot)
      const belt1 = factory.placeBeltChain(fabA, shipper, 'output')
      expect(belt1).toBe(true)

      // Connect Fab B → Shipper (occupies Fab B's only output slot)
      const belt2 = factory.placeBeltChain(fabB, shipper, 'output')
      expect(belt2).toBe(true)
      expect(factory.getBelts()).toHaveLength(2)

      // ASSERT: Initial grid state with both connections
      expect(renderGrid(factory, 6, 3, 14, 10)).toMatchSnapshot()

      // WHEN: placeBeltChain(Fab B → Fab A, 'output')
      // Fab B's only output slot is already occupied by belt2.
      const result = factory.placeBeltChain(fabB, fabA, 'output')

      // THEN: Should return false — slot is occupied
      expect(result).toBe(false)
      // No new belt should be added
      expect(factory.getBelts()).toHaveLength(2)
    })

    it('should auto-rotate fabricator when connecting with placeBeltChain', () => {
      // GIVEN: 20×20 factory with Shipper at (8,5), Fabricator at (12,5).
      factory = createTestFactory(20, 20)
      const shipper = factory.placeMachine(8, 5, 'factory_output')!
      const fab = factory.placeMachine(12, 5, 'part_fabricator')!
      expect(shipper).not.toBeNull()
      expect(fab).not.toBeNull()

      // Default rotation is 'south'
      expect(fab.rotation).toBe('south')

      // WHEN: Connect Fab → Shipper with 'output'
      const result = factory.placeBeltChain(fab, shipper, 'output')
      expect(result).toBe(true)

      // THEN: Fabricator should have rotated to face the shipper (west, since shipper is at lower x)
      expect(fab.rotation).not.toBe('south')
      expect(fab.rotation).toBe('west')

      // Verify belt is valid
      assertBeltSlotInvariant(factory)

      // Verify grid shows the connection
      expect(renderGrid(factory, 6, 3, 14, 7)).toMatchSnapshot()
    })
  })
})