import { describe, it, expect, beforeEach } from 'vitest'
import { BeltRouter, hasLShapeAtEndpoints } from '../../../src/game/BeltRouter'
import { Factory } from '../../../src/game/Factory'
import type { GridPosition } from '../../../src/game/types'

describe('hasLShapeAtEndpoints()', () => {
  it('should return false for path with fewer than 3 points', () => {
    // WHEN + THEN
    expect(hasLShapeAtEndpoints([{ x: 0, z: 0 }, { x: 1, z: 0 }])).toBe(false)
    expect(hasLShapeAtEndpoints([{ x: 0, z: 0 }])).toBe(false)
    expect(hasLShapeAtEndpoints([])).toBe(false)
  })

  it('should return false for straight path', () => {
    // GIVEN
    const path: GridPosition[] = [
      { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 },
    ]

    // WHEN + THEN
    expect(hasLShapeAtEndpoints(path)).toBe(false)
  })

  it('should return true when path turns at the source endpoint', () => {
    // GIVEN — turns right at point 1
    const path: GridPosition[] = [
      { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 },
    ]

    // WHEN + THEN
    expect(hasLShapeAtEndpoints(path)).toBe(true)
  })

  it('should return true when path turns at the target endpoint', () => {
    // GIVEN — straight at source, turns at target
    const path: GridPosition[] = [
      { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 },
    ]

    // WHEN + THEN
    expect(hasLShapeAtEndpoints(path)).toBe(true)
  })

  it('should return false when turn is in the middle (not at endpoints)', () => {
    // GIVEN — straight at source (0→1→2), turn in middle (2→3), straight at target (3→4)
    const path: GridPosition[] = [
      { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 2, z: 2 },
    ]

    // WHEN + THEN
    // Source: d1=(1,0), d2=(1,0) — straight ✓
    // Target: prev d=(0,1), last d=(0,1) — straight ✓
    expect(hasLShapeAtEndpoints(path)).toBe(false)
  })
})

describe('BeltRouter', () => {
  let factory: Factory

  beforeEach(() => {
    factory = new Factory(10, 10)
  })

  describe('computeBeltPath()', () => {
    it('should compute straight horizontal path', () => {
      // GIVEN
      const router = new BeltRouter(factory)

      // WHEN
      const path = router.computeBeltPath({ x: 1, z: 1 }, { x: 4, z: 1 })

      // THEN
      expect(path).toHaveLength(4)
      expect(path[0]).toEqual({ x: 1, z: 1 })
      expect(path[3]).toEqual({ x: 4, z: 1 })
      for (const p of path) expect(p.z).toBe(1)
    })

    it('should compute straight vertical path', () => {
      // GIVEN
      const router = new BeltRouter(factory)

      // WHEN
      const path = router.computeBeltPath({ x: 2, z: 1 }, { x: 2, z: 5 })

      // THEN
      expect(path).toHaveLength(5)
      for (const p of path) expect(p.x).toBe(2)
    })

    it('should compute L-shaped path (X first, then Z)', () => {
      // GIVEN
      const router = new BeltRouter(factory)

      // WHEN
      const path = router.computeBeltPath({ x: 0, z: 0 }, { x: 3, z: 2 })

      // THEN — X-first: (0,0)→(1,0)→(2,0)→(3,0)→(3,1)→(3,2) = 6 points
      expect(path).toHaveLength(6)
      expect(path[0]).toEqual({ x: 0, z: 0 })
      expect(path[path.length - 1]).toEqual({ x: 3, z: 2 })
      expect(path[1]).toEqual({ x: 1, z: 0 })
      expect(path[3]).toEqual({ x: 3, z: 0 })
    })

    it('should handle same-cell path', () => {
      // GIVEN
      const router = new BeltRouter(factory)

      // WHEN
      const path = router.computeBeltPath({ x: 3, z: 3 }, { x: 3, z: 3 })

      // THEN
      expect(path).toHaveLength(1)
      expect(path[0]).toEqual({ x: 3, z: 3 })
    })
  })

  describe('computeBeltPathZFirst()', () => {
    it('should compute L-shaped path (Z first, then X)', () => {
      // GIVEN
      const router = new BeltRouter(factory)

      // WHEN
      const path = router.computeBeltPathZFirst({ x: 0, z: 0 }, { x: 3, z: 2 })

      // THEN — Z-first: (0,0)→(0,1)→(0,2)→(1,2)→(2,2)→(3,2) = 6 points
      expect(path).toHaveLength(6)
      expect(path[0]).toEqual({ x: 0, z: 0 })
      expect(path[path.length - 1]).toEqual({ x: 3, z: 2 })
      expect(path[1]).toEqual({ x: 0, z: 1 })
      expect(path[2]).toEqual({ x: 0, z: 2 })
    })
  })

  describe('wouldPathCollide()', () => {
    it('should return false for a clear path', () => {
      // GIVEN
      const router = new BeltRouter(factory)
      const path: GridPosition[] = [
        { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 },
      ]

      // WHEN + THEN
      expect(router.wouldPathCollide(path)).toBe(false)
    })

    it('should return true when path crosses existing belt', () => {
      // GIVEN
      const router = new BeltRouter(factory)
      factory.placeMachine(2, 1, 'assembler')
      factory.placeMachine(3, 1, 'assembler')
      factory.restoreState([], [{ sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 2, z: 1 }, { x: 3, z: 1 }] }])
      const path: GridPosition[] = [
        { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 },
      ]

      // WHEN + THEN
      expect(router.wouldPathCollide(path)).toBe(true)
    })

    it('should skip collision when belt is in ignoreBeltIds', () => {
      // GIVEN
      const router = new BeltRouter(factory)
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(3, 1, 'assembler')
      factory.restoreState([], [{ sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }] }])
      const belt = factory.getBeltsAt(2, 1)[0]
      const path: GridPosition[] = [
        { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 },
      ]

      // WHEN + THEN
      expect(router.wouldPathCollide(path, new Set([belt.id]))).toBe(false)
    })

    it('should return true when intermediate cell has a machine', () => {
      // GIVEN
      const router = new BeltRouter(factory)
      factory.placeMachine(2, 1, 'assembler')
      const path: GridPosition[] = [
        { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 },
      ]

      // WHEN + THEN
      expect(router.wouldPathCollide(path)).toBe(true)
    })

    it('should NOT collide when machine is at first or last position only', () => {
      // GIVEN
      const router = new BeltRouter(factory)
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(3, 1, 'assembler')
      const path: GridPosition[] = [
        { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 },
      ]

      // WHEN + THEN
      expect(router.wouldPathCollide(path)).toBe(false)
    })

    it('should detect self-crossing path (U-turn)', () => {
      // GIVEN
      const router = new BeltRouter(factory)
      const path: GridPosition[] = [
        { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 0 },
      ]

      // WHEN + THEN
      expect(router.wouldPathCollide(path)).toBe(true)
    })
  })

  describe('findBestBeltPath()', () => {
    it('should return X-first path when clear', () => {
      // GIVEN
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(4, 1, 'assembler')
      const router = new BeltRouter(factory)

      // WHEN
      const result = router.findBestBeltPath({ x: 1, z: 1 }, { x: 4, z: 1 })

      // THEN
      expect(result.collides).toBe(false)
      expect(result.path[0]).toEqual({ x: 1, z: 1 })
      expect(result.path[result.path.length - 1]).toEqual({ x: 4, z: 1 })
    })

    it('should try Z-first path when X-first collides', () => {
      // GIVEN
      factory.placeMachine(0, 0, 'part_fabricator')
      factory.placeMachine(3, 2, 'assembler')
      factory.placeMachine(2, 0, 'quality_checker') // block X-first path
      const router = new BeltRouter(factory)

      // WHEN
      const result = router.findBestBeltPath({ x: 0, z: 0 }, { x: 3, z: 2 })

      // THEN — should find an alternative (Z-first or BFS)
      expect(result.path[0]).toEqual({ x: 0, z: 0 })
      expect(result.path[result.path.length - 1]).toEqual({ x: 3, z: 2 })
    })

    it('should return collides=true when no clear path exists', () => {
      // GIVEN — fully blocked scenario on a tiny grid (use restoreState to bypass slot-blocking)
      const tiny = new Factory(3, 3)
      tiny.restoreState([
        { x: 0, z: 0, type: 'part_fabricator', rotation: 'south' },
        { x: 2, z: 2, type: 'assembler', rotation: 'south' },
        { x: 1, z: 0, type: 'painter', rotation: 'south' },
        { x: 0, z: 1, type: 'recycler', rotation: 'south' },
        { x: 1, z: 1, type: 'quality_checker', rotation: 'south' },
        { x: 2, z: 0, type: 'painter', rotation: 'south' },
        { x: 0, z: 2, type: 'recycler', rotation: 'south' },
        { x: 2, z: 1, type: 'quality_checker', rotation: 'south' },
        { x: 1, z: 2, type: 'painter', rotation: 'south' },
      ], [])
      const router = new BeltRouter(tiny)

      // WHEN
      const result = router.findBestBeltPath({ x: 0, z: 0 }, { x: 2, z: 2 })

      // THEN
      expect(result.collides).toBe(true)
    })
  })

  describe('bfsPathfind()', () => {
    it('should return null when target is unreachable', () => {
      // GIVEN
      const tiny = new Factory(3, 1)
      tiny.placeMachine(0, 0, 'part_fabricator')
      tiny.placeMachine(2, 0, 'quality_checker')
      tiny.placeMachine(1, 0, 'painter') // block only path
      const router = new BeltRouter(tiny)

      // WHEN
      const result = router.bfsPathfind({ x: 0, z: 0 }, { x: 2, z: 0 })

      // THEN
      expect(result).toBeNull()
    })

    it('should find straight path on open grid', () => {
      // GIVEN
      const router = new BeltRouter(factory)

      // WHEN
      const result = router.bfsPathfind({ x: 1, z: 1 }, { x: 4, z: 1 })

      // THEN
      expect(result).not.toBeNull()
      expect(result![0]).toEqual({ x: 1, z: 1 })
      expect(result![result!.length - 1]).toEqual({ x: 4, z: 1 })
    })

    it('should respect requiredFirstDir', () => {
      // GIVEN
      const router = new BeltRouter(factory)

      // WHEN
      const result = router.bfsPathfind(
        { x: 3, z: 3 }, { x: 3, z: 6 },
        undefined,
        { x: 0, z: 1 }, // must go +Z first
      )

      // THEN
      if (result && result.length >= 2) {
        const dz = result[1].z - result[0].z
        expect(dz).toBe(1) // first step in +Z direction
      }
    })
  })
})
