import type { ItemType } from '../game/types'
import { buildBeltPath } from './BeltPath'

/**
 * Per-frame arc-length resolution for items on belts. The resolvers in
 * this module own the math that the `ItemRenderer.update()` loop runs
 * once per item: pause hold, first-sight seed, same-belt advance, and
 * cross-belt chain-arc carry-over. They are pure functions (no Three.js
 * imports, no DOM, no shared mutable state) so they can be unit-tested
 * directly and the renderer file stays focused on instance plumbing.
 *
 * See `ItemRenderer.update()` JSDoc for the full per-frame contract.
 */

export interface BeltRenderData {
  from: { x: number; z: number }
  to: { x: number; z: number }
  prevSegmentFrom?: { x: number; z: number }
  /** Belt fraction per second (used for render-time interpolation). */
  speed?: number
  items: ReadonlyArray<{ id?: string; type: ItemType; position: number }>
}

/** Sim tick interval in seconds (renderer's ±1-tick bound on truth). */
export const SIM_TICK_INTERVAL = 0.1

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
 */
export interface ItemRenderState {
  renderedArc: number
  beltKey: string
  pathLength: number
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

/**
 * Paused branch: hold last rendered position so paused frames don't
 * yank items visually back onto truth. Caller must guarantee
 * `prev.beltKey === key` (otherwise the renderer must fall through to
 * the cross-belt or seed branches).
 */
export function resolvePausedArc(
  prev: ItemRenderState,
  key: string,
  info: PathInfo,
): RenderArcResolution {
  return {
    renderedArc: prev.renderedArc,
    activeBeltKey: key,
    activePath: info.path,
    activePathLength: prev.pathLength,
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

/**
 * Same-belt advance: `renderedArc += speed * dt * L`, then clamped to
 * `[truthArc ± speed*SIM_TICK_INTERVAL*L]` (symmetric ±1-tick bound),
 * monotonic, and capped at the cell end for back-pressure.
 */
export function resolveSameBeltAdvance(
  prev: ItemRenderState,
  key: string,
  info: PathInfo,
  truthArc: number,
  speed: number,
  dt: number,
): RenderArcResolution {
  const L = info.L
  const tickAdvance = speed * SIM_TICK_INTERVAL * L
  let next = prev.renderedArc + speed * dt * L
  next = clampToTickInterval(next, truthArc, tickAdvance)
  if (next < prev.renderedArc) next = prev.renderedArc
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
): RenderArcResolution {
  const L = info.L
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
