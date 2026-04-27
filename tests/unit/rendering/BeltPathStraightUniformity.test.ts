/**
 * @vitest-environment jsdom
 *
 * Verifies the "uniform straight cell length" contract at the renderer
 * level: every straight cell — whether interior, chain-endpoint, or
 * adjacent to a corner — has L = 1.0 and renders at the same
 * world-space speed.
 *
 * Scope: white-box. Asserts directly against `BeltPath.length` for the
 * cells that `buildBeltPath` produces. The renderer's per-frame advance
 * scales by `BeltPath.length`, so uniform lengths across straights
 * imply uniform world-space speed.
 */
import { describe, it, expect } from 'vitest'
import { buildBeltPath } from '../../../src/rendering/BeltPath'
import { CORNER_CELL_LENGTH } from '../../../src/utils/BeltGeometry'

const HALF_W = 10
const HALF_H = 10

interface Cell {
  x: number
  z: number
}

function pathLengthAt(
  cells: Cell[],
  i: number,
): number {
  const from = cells[i]
  const to = cells[i + 1]
  const prev = i > 0 ? cells[i - 1] : undefined
  const path = buildBeltPath(from, to, prev, HALF_W, HALF_H)
  return path.length
}

describe('BeltPath — straight cells render at uniform L=1.0 world length', () => {
  it('straight cell BEFORE a corner has rendered length 1.0', () => {
    // Path: (0,0) → (1,0) → (1,1) → (1,2)
    //   seg0: straight east, NEXT cell turns south
    //   seg1: corner
    //   seg2: straight south, PREV cell was a corner
    const cells: Cell[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
      { x: 1, z: 2 },
    ]
    expect(pathLengthAt(cells, 0)).toBe(1.0)
  })

  it('straight cell AFTER a corner has rendered length 1.0', () => {
    const cells: Cell[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
      { x: 1, z: 2 },
    ]
    expect(pathLengthAt(cells, 2)).toBe(1.0)
  })

  it('straight cell sandwiched between two corners has rendered length 1.0', () => {
    // Path: (0,0) → (0,1) → (1,1) → (2,1) → (2,2) → (2,3)
    //   seg2 (1,1)→(2,1) is straight east, prev is corner, next is corner
    const cells: Cell[] = [
      { x: 0, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      { x: 2, z: 2 },
      { x: 2, z: 3 },
    ]
    expect(pathLengthAt(cells, 2)).toBe(1.0)
  })

  it('corner cell still has rendered length CORNER_CELL_LENGTH ≈ 0.871', () => {
    const cells: Cell[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
      { x: 1, z: 2 },
    ]
    expect(pathLengthAt(cells, 1)).toBeCloseTo(CORNER_CELL_LENGTH, 12)
  })

  it('all-straight chain: every segment has rendered length 1.0', () => {
    const cells: Cell[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
      { x: 4, z: 0 },
    ]
    for (let i = 0; i < cells.length - 1; i++) {
      expect(pathLengthAt(cells, i)).toBe(1.0)
    }
  })

  it('S-shape chain: ALL straight cells have length 1.0, only corners deviate', () => {
    // Path: (0,0) → (1,0) → (2,0) → (2,1) → (2,2) → (3,2) → (4,2)
    const cells: Cell[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 1 },
      { x: 2, z: 2 },
      { x: 3, z: 2 },
      { x: 4, z: 2 },
    ]
    // Straight segments: 0, 1, 3, 5
    expect(pathLengthAt(cells, 0)).toBe(1.0)
    expect(pathLengthAt(cells, 1)).toBe(1.0)
    expect(pathLengthAt(cells, 3)).toBe(1.0)
    expect(pathLengthAt(cells, 5)).toBe(1.0)
    // Corner segments: 2, 4
    expect(pathLengthAt(cells, 2)).toBeCloseTo(CORNER_CELL_LENGTH, 12)
    expect(pathLengthAt(cells, 4)).toBeCloseTo(CORNER_CELL_LENGTH, 12)
  })
})
