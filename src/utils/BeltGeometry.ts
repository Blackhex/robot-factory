/**
 * Pure, translation-invariant belt arc-length math shared by the game
 * simulation and the renderer.
 *
 * Each rendered belt cell carries a path through it. The "active" arc
 * length of a cell depends only on its own shape:
 *
 *   - Straight cell (in-direction equals out-direction):     1.0
 *     ALWAYS — even when an adjacent cell turns. The straight cell
 *     renders entry-edge midpoint to exit-edge midpoint (length 1.0)
 *     and the adjacent corner uses the same boundary midpoint as its
 *     own endpoint, so continuity is preserved without shortening
 *     either cell.
 *   - Corner cell (in-direction differs from out-direction): 2*S + (π/2)*R
 *     ≈ 0.871238898 with S=0.2, R=0.3.
 *
 * The simulation advances items at uniform CELL TIME — every cell takes
 * the same number of ticks regardless of arc length (`position += speed *
 * dt`, no division by length). The renderer scales its per-frame world
 * advance by these lengths so corner cells render at proportional world
 * speed. The lengths reported here are therefore a renderer-only concern
 * for visual interpolation; the simulation does not use them for timing.
 *
 * Layer rule: this module lives under `src/utils/` so both `src/game/`
 * (which must not depend on `src/rendering/`) and the renderer can import
 * it. This file is the single source of truth for `CORNER_STRAIGHT_LEN`
 * — `src/rendering/BeltGeometry.ts` re-exports the constant from here.
 */

export interface CellRef {
  x: number
  z: number
}

/**
 * Half-length of the straight stub on either side of a corner cell's
 * arc. Mesh layout in `src/rendering/BeltGeometry.ts` re-exports this
 * value, so the math here and the rendered geometry stay in lock-step.
 */
export const CORNER_STRAIGHT_LEN = 0.2
const ARC_R = 0.5 - CORNER_STRAIGHT_LEN // 0.3
const HALF_PI = Math.PI / 2

/** Active arc length of the corner cell shape. */
export const CORNER_CELL_LENGTH = 2 * CORNER_STRAIGHT_LEN + HALF_PI * ARC_R

/**
 * Active arc length of a single belt cell.
 * Translation-invariant — depends only on relative grid coordinates.
 *
 * The cell modeled is the segment going `from` → `to`. Its in-direction is
 * `from - prevFrom` (or, if `prevFrom` is undefined, the same as the
 * out-direction — i.e. a chain start).
 *
 * Contract:
 *   - Straight cell (in-direction equals out-direction): always 1.0.
 *   - Corner cell (in-direction differs from out-direction): CORNER_CELL_LENGTH.
 */
export function beltSegmentLength(
  from: CellRef,
  to: CellRef,
  prevFrom: CellRef | undefined,
): number {
  const outDx = to.x - from.x
  const outDz = to.z - from.z
  const inDx = prevFrom ? from.x - prevFrom.x : outDx
  const inDz = prevFrom ? from.z - prevFrom.z : outDz

  const isCorner =
    prevFrom !== undefined && (inDx !== outDx || inDz !== outDz)

  if (isCorner) return CORNER_CELL_LENGTH
  return 1.0
}

/**
 * Convenience: compute the per-segment lengths of a full belt path.
 * `path` lists the cell coordinates the chain traverses
 * (`path[i] → path[i+1]` is one segment). Returns an array of length
 * `path.length - 1`.
 */
export function beltPathSegmentLengths(path: ReadonlyArray<CellRef>): number[] {
  const out: number[] = []
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i]
    const to = path[i + 1]
    const prevFrom = i > 0 ? path[i - 1] : undefined
    out.push(beltSegmentLength(from, to, prevFrom))
  }
  return out
}
