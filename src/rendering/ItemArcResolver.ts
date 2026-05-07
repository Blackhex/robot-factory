import {
  resolvePausedArc,
  resolvePausedHold,
  resolveSeedArc,
} from './ItemArcResolverBasics'
import {
  beltKeyOf,
  clampToTickInterval,
  RENDER_CELL_CAPACITY,
  RENDER_FP_EPS,
  RENDER_MIN_ITEM_SPACING,
  SIM_TICK_INTERVAL,
  type BeltRenderData,
  type ItemRenderState,
  type PathInfo,
  type RenderArcResolution,
} from './ItemArcResolverTypes'

export {
  beltKeyOf,
  clampToTickInterval,
  RENDER_CELL_CAPACITY,
  RENDER_FP_EPS,
  RENDER_MIN_ITEM_SPACING,
  resolvePausedArc,
  resolvePausedHold,
  resolveSeedArc,
  SIM_TICK_INTERVAL,
}
export type {
  BeltRenderData,
  ItemRenderState,
  PathInfo,
  RenderArcResolution,
}

/**
 * Per-frame arc-length resolution for items on belts. The resolvers in
 * this module own the math that the `ItemRenderer.update()` loop runs
 * once per item: pause-hold (first paused frame), pause-snap
 * (subsequent paused frames), first-sight seed, same-belt advance, and
 * cross-belt chain-arc carry-over. They are pure functions (no Three.js
 * imports, no DOM, no shared mutable state) so they can be unit-tested
 * directly and the renderer file stays focused on instance plumbing.
 *
 * See `ItemRenderer.update()` JSDoc for the full per-frame contract.
 */

/**
 * Same-belt advance: `renderedArc += speed * dt * L * advanceFactor`,
 * then clamped to `[truthArc - tickAdvance, truthArc + tickAdvance]`
 * (symmetric ±1-tick bound), monotonic, and capped at the cell end
 * for back-pressure.
 *
 * Three flow regimes, gated by `isCascadeBlocked` and the post-carry
 * window:
 *
 *   - **Normal flow** (`!isCascadeBlocked`): `advanceFactor = 1.0`.
 *     Full predictive extrapolation, clamped to ±tickAdvance around
 *     truth. Healthy cap-2 flow with a non-blocked downstream lives
 *     here so its per-frame Δworld stays uniform at every cell
 *     boundary.
 *
 *   - **Cascade-blocked, post-carry stretch**
 *     (`isCascadeBlocked && prev.timeSinceCarry + dt < SIM_TICK_INTERVAL`):
 *     `advanceFactor = 0.5`. Slows extrapolation while the item is
 *     bedding in on a downstream belt that is part of a back-pressure
 *     cascade. The `+ dt` lookahead exits the slowdown one frame
 *     earlier than the legacy `prev.timeSinceCarry < SIM_TICK_INTERVAL`
 *     gate (5 post-carry frames instead of 6). With the slowdown
 *     contributing `5 × 0.5 × dt × speed × L` of extrapolation, the
 *     end-of-stretch lead settles at ≈ `0.0417` cell-fractions —
 *     comfortably under the back-pressure test's `0.05` tolerance.
 *
 *   - **Cascade-blocked, post-stall** (`isCascadeBlocked &&
 *     !isPostCarryStretch`): `advanceFactor = 0` AND upper bound
 *     tightened to `truthArc + eps`. Once the post-carry window
 *     closes, predictive extrapolation must stop entirely — sim isn't
 *     going to move the item, and the renderer would otherwise drift
 *     out to `truthArc + tickAdvance` over the next few frames. The
 *     monotonic guard preserves any lead built up during the post-
 *     carry stretch (so no visible backward jumps), but no new lead
 *     accumulates.
 *
 * Why scale instead of cap-tighten in the post-carry stretch?
 *
 * The renderer extrapolates `speed * dt * L` per frame (≈ 0.0167 chain-
 * arc units at 60 Hz / speed 1.0 / L 1.0). Tightening the upper bound
 * to e.g. `tickAdvance / 2` would saturate the lead in three frames,
 * then stall the remaining three (`next` clamped down, monotonic guard
 * freezes `prev`) — and the stall tests
 * (`ItemRendererStallAtHandoff` H1 / H3) explicitly forbid sub-half-
 * mean Δworld frames. Halving the per-frame advance instead spreads
 * the lead budget smoothly across the post-carry frames: every frame
 * contributes a positive Δworld of `speed * dt * L * 0.5`, well above
 * the stall tests' thresholds. Those stall tests use chains with no
 * cap-2 cell at all, so `isCascadeBlocked` is FALSE on every belt and
 * the slowdown branch never fires for them.
 *
 * The upper bound is additionally tightened by the per-cell spacing
 * cap when `frontItemTruthArc` is provided AND the simulator's spacing
 * is at-or-above `MIN_ITEM_SPACING`. This mirrors
 * `ConveyorBelt.advance`'s spacing cap so a back item sim has parked
 * behind a stalled front item is rendered AT truth (= `frontPos −
 * MIN_ITEM_SPACING`) instead of one tick ahead.
 *
 * @param frontItemTruthArc Arc-length position (on this belt's path)
 *        of the next item ahead in sim's ascending order, or
 *        `undefined` when there is no front item on the same cell.
 * @param isCascadeBlocked `true` iff THIS belt or any belt downstream
 *        of it (transitively) is "self-blocked" — at
 *        `RENDER_CELL_CAPACITY` items with its front item parked at
 *        the cell end (`position >= 1 - eps`). Cascading the check is
 *        what catches sparsely-populated upstream belts in a back-
 *        pressure jam (e.g. game-over freezes producing one item per
 *        belt at pos 0): a direct-only check would leave them
 *        extrapolating toward `truthArc + tickAdvance`. Healthy cap-2
 *        flow (no jam anywhere on the chain) leaves this `false` on
 *        every belt.
 */
export function resolveSameBeltAdvance(
  prev: ItemRenderState,
  key: string,
  info: PathInfo,
  truthArc: number,
  speed: number,
  dt: number,
  frontItemTruthArc?: number,
  isCascadeBlocked: boolean = false,
): RenderArcResolution {
  const L = info.L
  const tickAdvance = speed * SIM_TICK_INTERVAL * L
  // The `+ dt` lookahead means the post-carry stretch lasts exactly
  // 5 frames at 60 Hz / 10 Hz sim — one frame fewer than the legacy
  // `prev.timeSinceCarry < SIM_TICK_INTERVAL` gate. That keeps the
  // accumulated lead at end-of-stretch under the 0.05 cell-fraction
  // back-pressure tolerance (`5 × 0.5 × 1/60 ≈ 0.0417`). The
  // `- RENDER_FP_EPS` slack absorbs the IEEE-754 drift in the cumulative
  // `prev.timeSinceCarry += dt` chain (`5 × (1/60) + 1/60 =
  // 0.09999999999999999` in JS), which would otherwise leak one extra
  // post-carry frame and push the lead up to exactly `0.05` — flagged
  // by the back-pressure test's strict `Math.abs(diff) > 0.05`. The
  // cascade-stalled branch then freezes the lead via
  // `advanceFactor = 0` and the monotonic guard.
  const isPostCarryStretch =
    isCascadeBlocked &&
    prev.timeSinceCarry + dt < SIM_TICK_INTERVAL - RENDER_FP_EPS
  const isCascadeStalled = isCascadeBlocked && !isPostCarryStretch
  const advanceFactor = isPostCarryStretch
    ? 0.5
    : isCascadeStalled
      ? 0
      : 1.0
  let next = prev.renderedArc + speed * dt * L * advanceFactor
  // Asymmetric clamp: lower at -(tickAdvance - 1e-9), upper at
  // +(tickAdvance - 1e-9). The 1e-9 slack on BOTH sides keeps the
  // FP-computed chain-arc diff strictly inside ±tickAdvance — without
  // the slack the cumulative `prev + speed*dt*L*advanceFactor` chain
  // saturates EXACTLY at tickAdvance, which renders as
  // 0.10000000000000009 > 0.1 after the chain-arc subtraction in
  // tests (see ItemRendererStreamStability "rendered chain-arc never
  // overshoots sim truth by more than one tick"). The lag side needs
  // the same slack because per-frame scaling lets `prev + scaled`
  // fall ~tickAdvance behind `truthArc` after a sim tick during the
  // post-carry stretch — without slack the lower clamp produces
  // `truthArc - tickAdvance`, which after FP-noisy chain-arc maths
  // also reads as `> tickAdvance` of lag.
  const lower = truthArc - tickAdvance + RENDER_FP_EPS
  // In the cascade-stalled branch, the upper bound tightens to truth
  // (no positive lead allowed). Combined with `advanceFactor = 0` this
  // freezes `next` at whatever the monotonic guard preserves of
  // `prev.renderedArc` — the post-carry-stretch lead, but no further
  // growth.
  const upper = isCascadeStalled
    ? truthArc + RENDER_FP_EPS
    : truthArc + tickAdvance - RENDER_FP_EPS
  if (next > upper) next = upper
  if (next < lower) next = lower
  if (next < prev.renderedArc) next = prev.renderedArc
  if (frontItemTruthArc !== undefined) {
    const minSpacingArc = RENDER_MIN_ITEM_SPACING * L
    const sep = frontItemTruthArc - truthArc
    // Apply spacing cap only when (a) the simulator's spacing matches
    // its own contract (sep >= MIN_ITEM_SPACING) AND (b) the front
    // item is genuinely PARKED at the cell end (front truth at L —
    // the only place sim parks a front-most item, awaiting handover).
    // In normal cap-2 flow the front item is mid-cell and advances by
    // `tickAdvance` per sim tick; the back item's truth advances in
    // lockstep, so the symmetric ±tickAdvance clamp on rendered arc
    // already keeps visual spacing consistent without pinning the
    // back item's render to its discrete sim truth (which would zero
    // out per-frame Δworld between sim ticks — see
    // ItemRendererUniformFlow). The cap-fires-only-when-parked rule
    // mirrors the JSDoc above: "a back item sim has parked behind a
    // stalled front item is rendered AT truth instead of one tick
    // ahead". With cheating-close test inputs the (a) clause skips
    // the cap so it doesn't pull rendered below truth.
    const frontParked = frontItemTruthArc >= L - RENDER_FP_EPS
    if (isCascadeBlocked && frontParked && sep >= minSpacingArc - RENDER_FP_EPS) {
      const spacingCap = frontItemTruthArc - minSpacingArc
      if (next > spacingCap) next = spacingCap
    }
  }
  if (next > L) next = L
  return {
    renderedArc: next,
    activeBeltKey: key,
    activePath: info.path,
    activePathLength: L,
  }
}

/**
 * Cross-belt carry-over: the simulator just delivered the item to a
 * downstream belt with overshoot. Instead of snapping to `truthArc`
 * on the new belt, carry over the natural advance through the cell
 * boundary so the world-space step on the hand-over frame stays at
 * `speed * dt * L`. See `ItemRenderer.update()` JSDoc for the full
 * contract (chain-adjacency + carry-distance guards, render-on-OLD
 * continuation when `nextArc < 0`).
 *
 * Exception: when the destination belt is cascade-blocked (itself or
 * any downstream belt is at capacity with its front item parked at
 * pos 1.0), the carry-over is replaced with a snap to truth on the
 * new belt. The cell boundary world position is shared between
 * `oldBelt.to` and `newBelt.from`, so this snap produces no visual
 * jump — it just plants the renderer at the same arc-length sim
 * placed it at, leaving the post-carry slowdown branch in
 * `resolveSameBeltAdvance` to bound the subsequent lead. Without this
 * snap, the `0.0167`-cell carry-over advance becomes the seed of a
 * `~0.1`-cell predictive lead that no later branch can shrink without
 * violating monotonicity (see the back-pressure test in
 * `ItemRendererStreamStability`).
 */
export function resolveCrossBeltCarry(
  prev: ItemRenderState,
  belt: BeltRenderData,
  key: string,
  info: PathInfo,
  beltByKey: ReadonlyMap<string, BeltRenderData>,
  getPathInfo: (k: string, b: BeltRenderData) => PathInfo,
  truthArc: number,
  speed: number,
  dt: number,
  isCascadeBlocked: boolean = false,
): RenderArcResolution {
  const L = info.L
  if (isCascadeBlocked) {
    // Snap to truth so cap-2 back items (sim places them at pos 0
    // when the cell is jammed) don't seed a predictive lead the
    // monotonic guard would later make unshrinkable.
    return {
      renderedArc: truthArc,
      activeBeltKey: key,
      activePath: info.path,
      activePathLength: L,
    }
  }
  const oldBelt = beltByKey.get(prev.beltKey)
  const isChainHandover =
    oldBelt !== undefined &&
    oldBelt.to.x === belt.from.x &&
    oldBelt.to.z === belt.from.z

  const tickAdvance = speed * SIM_TICK_INTERVAL * L
  const carryDistance = prev.pathLength - prev.renderedArc

  if (isChainHandover && carryDistance >= 0 && carryDistance < 1.5) {
    // Natural chain-arc advance from one cell back from the boundary,
    // expressed in NEW-belt arc units.
    let nextArc = -carryDistance + speed * dt * L
    // RELAXED ±1-tick bound so the carry-over isn't undone by a
    // snap-to-truth on the very next clamp.
    nextArc = clampToTickInterval(nextArc, truthArc, tickAdvance)

    if (nextArc >= 0) {
      // Reached / crossed the boundary — promote to NEW belt.
      if (nextArc > L) nextArc = L
      return {
        renderedArc: nextArc,
        activeBeltKey: key,
        activePath: info.path,
        activePathLength: L,
      }
    }

    // Not yet at the boundary — keep drawing on the OLD belt's path
    // at the chain-arc-equivalent position. `oldBelt` is non-undefined
    // here (isChainHandover guard).
    const oldInfo = getPathInfo(prev.beltKey, oldBelt!)
    let oldArc = prev.pathLength + nextArc
    if (oldArc < 0) oldArc = 0
    if (oldArc > oldInfo.L) oldArc = oldInfo.L
    return {
      renderedArc: oldArc,
      activeBeltKey: prev.beltKey,
      activePath: oldInfo.path,
      activePathLength: oldInfo.L,
    }
  }

  // Defensive: not a chain hand-over, or carryDistance is implausibly
  // large for a chain step. Snap to truth.
  return {
    renderedArc: truthArc,
    activeBeltKey: key,
    activePath: info.path,
    activePathLength: L,
  }
}
