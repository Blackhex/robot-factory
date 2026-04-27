import { describe, it, expect } from 'vitest'
import {
  beltSegmentLength,
  beltPathSegmentLengths,
  CORNER_CELL_LENGTH,
} from '../../../src/utils/BeltGeometry'

/**
 * Verifies the "uniform straight cell length" contract for
 * `beltSegmentLength`:
 *
 *   - Every straight cell returns length 1.0, regardless of whether a
 *     neighboring cell is a corner.
 *   - Corner cells return CORNER_CELL_LENGTH (≈0.871).
 *   - Straight cells render entry-edge midpoint to exit-edge midpoint
 *     (length 1.0); adjacent corners use boundary midpoints as their
 *     own endpoints, so continuity at the cell boundary is preserved
 *     without shortening the straight cell.
 */
describe('beltSegmentLength — straight cells always return 1.0 (no half-cells)', () => {
  it('straight cell BEFORE a corner still returns 1.0 (no shortening)', () => {
    // Path: (0,0) → (1,0) → (1,1) → (1,2)
    //   seg0: (0,0)→(1,0)  straight, NEXT cell (1,0)→(1,1) turns south
    //   seg1: (1,0)→(1,1)  CORNER (east → south)
    //   seg2: (1,1)→(1,2)  straight, PREV cell (1,0)→(1,1) was a corner
    const seg0Len = beltSegmentLength(
      { x: 0, z: 0 }, // from
      { x: 1, z: 0 }, // to
      undefined, // prevFrom (chain start)
    )
    expect(seg0Len).toBe(1.0)
  })

  it('straight cell AFTER a corner still returns 1.0 (no shortening)', () => {
    // Same path: seg2 is the straight cell whose PREV is the corner.
    const seg2Len = beltSegmentLength(
      { x: 1, z: 1 }, // from
      { x: 1, z: 2 }, // to
      { x: 1, z: 0 }, // prevFrom (the corner cell's from)
    )
    expect(seg2Len).toBe(1.0)
  })

  it('straight cell sandwiched between TWO corners still returns 1.0', () => {
    // Path: (0,0) → (0,1) → (1,1) → (2,1) → (2,2) → (2,3)
    //   seg0: (0,0)→(0,1)  straight chain start
    //   seg1: (0,1)→(1,1)  CORNER (south → east)
    //   seg2: (1,1)→(2,1)  straight, prev is corner AND next is corner
    //   seg3: (2,1)→(2,2)  CORNER (east → south)
    //   seg4: (2,2)→(2,3)  straight chain end after corner
    const seg2Len = beltSegmentLength(
      { x: 1, z: 1 }, // from
      { x: 2, z: 1 }, // to
      { x: 0, z: 1 }, // prevFrom (the prev corner's from)
    )
    expect(seg2Len).toBe(1.0)
  })

  it('isolated straight cell with no neighbors returns 1.0 (unchanged)', () => {
    const len = beltSegmentLength(
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      undefined,
    )
    expect(len).toBe(1.0)
  })

  it('straight cell with two straight neighbors returns 1.0 (unchanged)', () => {
    // Path: (0,0) → (1,0) → (2,0) → (3,0) — all straight east.
    const seg1Len = beltSegmentLength(
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 0, z: 0 },
    )
    expect(seg1Len).toBe(1.0)
  })

  it('corner cell still returns CORNER_CELL_LENGTH (≈0.871, unchanged)', () => {
    // Corner: (0,0)→(1,0) (east) followed by (1,0)→(1,1) (south).
    // We measure the corner segment itself: from=(1,0), to=(1,1),
    // prevFrom=(0,0).
    const cornerLen = beltSegmentLength(
      { x: 1, z: 0 },
      { x: 1, z: 1 },
      { x: 0, z: 0 },
    )
    expect(cornerLen).toBeCloseTo(CORNER_CELL_LENGTH, 12)
    // Sanity: corner length is the documented constant ≈ 0.871238898.
    expect(cornerLen).toBeGreaterThan(0.87)
    expect(cornerLen).toBeLessThan(0.88)
  })
})

describe('beltPathSegmentLengths — full-path uniformity (no half-cells)', () => {
  it('path with one corner: straights are 1.0, corner is CORNER_CELL_LENGTH', () => {
    // Path: (0,0) → (1,0) → (1,1) → (1,2)
    //   seg0: straight before corner
    //   seg1: corner
    //   seg2: straight after corner
    const lens = beltPathSegmentLengths([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
      { x: 1, z: 2 },
    ])
    expect(lens).toHaveLength(3)
    expect(lens[0]).toBe(1.0)
    expect(lens[1]).toBeCloseTo(CORNER_CELL_LENGTH, 12)
    expect(lens[2]).toBe(1.0)
    // No half-cells anywhere in the path.
    expect(lens.every((L) => L === 1.0 || Math.abs(L - CORNER_CELL_LENGTH) < 1e-12)).toBe(true)
  })

  it('path with corner mid-chain: all straights are 1.0', () => {
    // Path: (0,0) → (0,1) → (0,2) → (1,2) → (2,2)
    //   seg0: (0,0)→(0,1) straight south, chain start
    //   seg1: (0,1)→(0,2) straight south, NEXT is corner (today shortens)
    //   seg2: (0,2)→(1,2) CORNER (south → east)
    //   seg3: (1,2)→(2,2) straight east, PREV is corner (today shortens)
    const lens = beltPathSegmentLengths([
      { x: 0, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: 2 },
      { x: 1, z: 2 },
      { x: 2, z: 2 },
    ])
    expect(lens).toHaveLength(4)
    expect(lens[0]).toBe(1.0)
    expect(lens[1]).toBe(1.0)
    expect(lens[2]).toBeCloseTo(CORNER_CELL_LENGTH, 12)
    expect(lens[3]).toBe(1.0)
  })

  it('long S-shape path: every straight is 1.0, every corner is CORNER_CELL_LENGTH', () => {
    // Path: (0,0) → (1,0) → (2,0) → (2,1) → (2,2) → (3,2) → (4,2)
    //   seg0: straight east
    //   seg1: straight east, next is corner (today: 0.5)
    //   seg2: corner east → south
    //   seg3: straight south, prev is corner AND next is corner (today: 0.0)
    //   seg4: corner south → east
    //   seg5: straight east, prev is corner (today: 0.5)
    const lens = beltPathSegmentLengths([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 1 },
      { x: 2, z: 2 },
      { x: 3, z: 2 },
      { x: 4, z: 2 },
    ])
    expect(lens).toHaveLength(6)
    // Straights: seg0, seg1, seg3, seg5 — all 1.0.
    expect(lens[0]).toBe(1.0)
    expect(lens[1]).toBe(1.0)
    expect(lens[3]).toBe(1.0)
    expect(lens[5]).toBe(1.0)
    // Corners: seg2, seg4 — CORNER_CELL_LENGTH.
    expect(lens[2]).toBeCloseTo(CORNER_CELL_LENGTH, 12)
    expect(lens[4]).toBeCloseTo(CORNER_CELL_LENGTH, 12)
    // No length below the corner length anywhere.
    const minL = Math.min(...lens)
    expect(minL).toBeGreaterThanOrEqual(CORNER_CELL_LENGTH - 1e-12)
  })

  it('all-straight path: every segment is 1.0 (unchanged)', () => {
    const lens = beltPathSegmentLengths([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
    ])
    expect(lens).toEqual([1.0, 1.0, 1.0])
  })
})
