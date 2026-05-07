/**
 * Shared per-cell belt flow invariants.
 *
 * This module is layer-safe for both `src/game/` and `src/rendering/`.
 * It centralizes the simulation and renderer contract for how many items
 * fit on a belt cell, the minimum normalized spacing between them, and
 * the float-drift tolerance used at boundary comparisons.
 */
export const BELT_CELL_CAPACITY = 2

export const BELT_MIN_ITEM_SPACING = 1 / BELT_CELL_CAPACITY

export const BELT_FP_DRIFT_EPS = 1e-9