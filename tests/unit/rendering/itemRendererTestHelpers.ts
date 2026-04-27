/**
 * Shared helpers and constants for ItemRenderer test suites.
 */
import { ItemRenderer } from '../../../src/rendering/ItemRenderer'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { createItem } from '../../../src/game/Item'
import type { ItemType } from '../../../src/game/types'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const GRID_W = 20
export const GRID_H = 20
export const HALF_W = GRID_W / 2
export const HALF_H = GRID_H / 2
export const ITEM_TYPE: ItemType = 'wheel_small'
export const SPEED = 1.0
export const TICK_INTERVAL = 0.1 // 10 Hz
export const RENDER_DT = 1 / 60 // 60 fps
export const FRAMES_PER_TICK = 6 // 0.1 / (1/60) ≈ 6
export const INPUT_CADENCE_TICKS = 10 // one item every 10 ticks (= 1 s)

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ItemStateView {
  renderedArc: number
  beltKey: string
  pathLength: number
}

/** Minimal shape shared by all per-test harness types. */
export interface BeltChainHarness {
  belts: ConveyorBelt[]
  chainOffsets: number[]
  cellLengths: number[]
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function readItemStates(
  renderer: ItemRenderer,
): Map<string, ItemStateView> {
  return (renderer as unknown as { itemStates: Map<string, ItemStateView> })
    .itemStates
}

export function beltKey(b: ConveyorBelt): string {
  return `${b.fromX},${b.fromZ}->${b.toX},${b.toZ}`
}

/**
 * Compute chain-arc-from-chain-start for a sim item, given the belt it
 * is currently on. Returns NaN if the item is not in any belt (e.g.
 * already delivered).
 */
export function simChainArc(
  harness: BeltChainHarness,
  itemId: string,
): number {
  for (let i = 0; i < harness.belts.length; i++) {
    const it = harness.belts[i].getItems().find((x) => x.id === itemId)
    if (it) {
      const clamped = Math.max(0, Math.min(1, it.positionOnBelt))
      return harness.chainOffsets[i] + clamped * harness.cellLengths[i]
    }
  }
  return Number.NaN
}

/** Build a beltKey → chain-arc-offset map matching `chainOffsets`. */
export function chainOffsetsByKey(harness: BeltChainHarness): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < harness.belts.length; i++) {
    m.set(beltKey(harness.belts[i]), harness.chainOffsets[i])
  }
  return m
}

/**
 * Inject a fresh item onto belts[0] if the cell is empty. Returns the
 * injected item id, or null if the input cell is occupied (back-pressure
 * at the source).
 */
export function injectItem(harness: BeltChainHarness): string | null {
  const item = createItem(ITEM_TYPE)
  if (!harness.belts[0].addItem(item)) return null
  return item.id
}
