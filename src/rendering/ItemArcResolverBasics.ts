import type {
  ItemRenderState,
  PathInfo,
  RenderArcResolution,
} from './ItemArcResolverTypes'

/**
 * Paused-snap branch: snap to sim truth on the current belt. This is
 * the SECOND-and-subsequent paused-frame branch — the dispatcher
 * (`ItemRenderer.update`) routes the FIRST paused frame after a
 * running frame to `resolvePausedHold` instead, so this resolver only
 * runs once `wasLastFramePaused === true`.
 *
 * While paused sim truth doesn't change, so this produces a stable,
 * uniformly-spaced layout for the duration of the pause — the layout
 * settles to truth one render frame (~16ms) after pause-entry. The
 * caller only routes to this branch when `prev.beltKey === key`;
 * cross-belt or seed paths handle the other cases.
 *
 * Trade-off: this is a deliberate choice over a "hold last rendered
 * position on every paused frame" behavior. Holding indefinitely froze
 * each item's per-frame extrapolation lead — varying between 0
 * (newly-seeded) and `+tickAdvance` (settled) — producing visibly
 * uneven spacing while the player inspected the paused factory.
 * Snapping to truth from the second paused frame onward is preferable
 * to ongoing visual corruption; the pause-hold sibling preserves the
 * E2E no-jump invariant for the pause-entry transition.
 *
 * `activePathLength` uses `info.L` (recomputed this frame from the
 * belt's current geometry) rather than `prev.pathLength` (cached from
 * the previous frame), so a Factory edit that changed the belt's
 * prev-segment elbow between frames is reflected immediately on pause.
 */
export function resolvePausedArc(
  key: string,
  info: PathInfo,
  truthArc: number,
): RenderArcResolution {
  return {
    renderedArc: truthArc,
    activeBeltKey: key,
    activePath: info.path,
    activePathLength: info.L,
  }
}

/**
 * Pause-entry branch: on the first paused frame after a running
 * frame, hold the previously rendered position. This prevents a
 * visible jump when the player clicks pause — the held extrapolation
 * lead from the last running frame becomes the rendered position
 * for one paused frame.
 *
 * Subsequent paused frames are routed to `resolvePausedArc` (snap
 * to truth) by the caller, so the layout settles to uniform sim-truth
 * positions ~16ms after pause-entry. See `resolvePausedArc` for the
 * stable-layout branch and `ItemRenderer.update` for the dispatch.
 */
export function resolvePausedHold(
  prev: ItemRenderState,
  key: string,
  info: PathInfo,
): RenderArcResolution {
  return {
    renderedArc: prev.renderedArc,
    activeBeltKey: key,
    activePath: info.path,
    activePathLength: info.L,
  }
}

/**
 * Seed branch: first sight of an id or seed-frame (`dt <= 0`). Snap
 * to sim truth on the current belt. Also the only entry point for a
 * brand-new id into tracked state.
 */
export function resolveSeedArc(
  truthArc: number,
  key: string,
  info: PathInfo,
): RenderArcResolution {
  return {
    renderedArc: truthArc,
    activeBeltKey: key,
    activePath: info.path,
    activePathLength: info.L,
  }
}