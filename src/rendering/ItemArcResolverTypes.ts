import type { ItemType } from '../game/types'
import {
  BELT_CELL_CAPACITY,
  BELT_FP_DRIFT_EPS,
  BELT_MIN_ITEM_SPACING,
} from '../utils/BeltFlowInvariants'
import { buildBeltPath } from './BeltPath'

export interface BeltRenderData {
  from: { x: number; z: number }
  to: { x: number; z: number }
  prevSegmentFrom?: { x: number; z: number }
  /**
   * Real simulation render data may grant terminal belts one sim-state
   * change of grace before a parked front item counts as a jam. This
   * lets accepting sinks drain on the next delivery pass without being
   * misclassified as terminal back-pressure. Synthetic white-box belt
   * fixtures omit the hint and keep immediate terminal-jam semantics.
   */
  allowsTerminalDrainGrace?: boolean
  /** Belt fraction per second (used for render-time interpolation). */
  speed?: number
  items: ReadonlyArray<{
    id?: string
    type: ItemType
    position: number
    /**
     * When true, the renderer paints the instance with
     * `DEFECTIVE_ITEM_COLOR` instead of `ITEM_COLORS[type]`.
     * Optional so legacy/synthetic test fixtures that build
     * `BeltRenderData` literals without the flag continue to work.
     */
    isDefective?: boolean
  }>
}

/** Sim tick interval in seconds (renderer's ±1-tick bound on truth). */
export const SIM_TICK_INTERVAL = 0.1

/**
 * Per-cell minimum spacing between items, in normalized cell-fraction.
 *
 * Mirrors `ConveyorBelt.MIN_ITEM_SPACING` in the simulation (which the
 * renderer cannot import — `src/rendering/` may only depend on
 * `src/game/types`, intra-rendering, and `three`). The renderer applies
 * the same spacing constraint to its predictive interpolation so a
 * back item that sim has parked at `frontPos − MIN_ITEM_SPACING` cannot
 * be rendered past that physical limit. Without this cap the renderer
 * would settle at `truthArc + speed*SIM_TICK_INTERVAL*L` (one full tick
 * ahead of truth) on every spacing-capped item, since per-frame
 * predictive advance is only clamped by the symmetric ±1-tick bound
 * around truth — and truth never advances for a parked item.
 *
 */
export const RENDER_MIN_ITEM_SPACING = BELT_MIN_ITEM_SPACING

export const RENDER_CELL_CAPACITY = BELT_CELL_CAPACITY

/**
 * Float-drift tolerance for "at end of cell" / "at tick boundary"
 * comparisons in the rendering layer. Used to decide when an item
 * has reached a cell boundary or when a clamped position is at the
 * edge of its allowed range, despite cumulative `+= speed * dt`
 * accumulating float error (e.g. 10 × 0.1 = 0.9999999999999999).
 *
 */
export const RENDER_FP_EPS = BELT_FP_DRIFT_EPS

/** Cached belt path + its arc length. */
export interface PathInfo {
  path: ReturnType<typeof buildBeltPath>
  L: number
}

/**
 * Renderer-global per-item state, keyed by stable `Item.id`.
 *
 * `renderedArc` is in arc-length units on the path identified by
 * `beltKey` (∈ [0, pathLength]). During a multi-frame cross-belt
 * hand-over `beltKey` may temporarily lag behind the simulator's truth
 * belt — the renderer keeps drawing on the OLD belt's path until its
 * world-space position crosses the cell boundary, then promotes to the
 * NEW belt. `pathLength` always matches the path identified by
 * `beltKey`. See `ItemRenderer.update()` JSDoc for the full contract.
 *
 * `timeSinceCarry` (seconds since the most recent cross-belt promotion)
 * lets `resolveSameBeltAdvance` slow the per-frame advance for items
 * that just transferred onto a downstream belt — without that
 * scaling the renderer would extrapolate up to a full sim-tick of arc
 * by the end of the post-carry tick, breaking the back-pressure
 * test's ±0.05 cell tolerance (see
 * `ItemRendererStreamStability "back-pressure: rendered position
 * matches sim truth on every stuck cell"`).
 */
export interface ItemRenderState {
  renderedArc: number
  beltKey: string
  pathLength: number
  timeSinceCarry: number
}

/**
 * Per-frame resolved draw state. `activeBeltKey` / `activePath` /
 * `activePathLength` may identify the OLD belt during a multi-frame
 * cross-belt carry-over (see `ItemRenderer.update()` JSDoc).
 */
export interface RenderArcResolution {
  renderedArc: number
  activeBeltKey: string
  activePath: ReturnType<typeof buildBeltPath>
  activePathLength: number
}

/** Canonical belt key formula used to identify the belt path an item is on. */
export const beltKeyOf = (b: BeltRenderData): string =>
  `${b.from.x},${b.from.z}->${b.to.x},${b.to.z}`

/** Clamp `arc` to within `±tickAdvance` of `truthArc`. */
export const clampToTickInterval = (
  arc: number,
  truthArc: number,
  tickAdvance: number,
): number => {
  const upper = truthArc + tickAdvance
  const lower = truthArc - tickAdvance
  if (arc > upper) return upper
  if (arc < lower) return lower
  return arc
}