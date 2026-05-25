import type { ItemType } from '../game/types'

/**
 * Per-item-type display scale tiers used by `ItemRenderer` when
 * composing each per-instance Matrix4. Items fall into three strictly-
 * increasing visual size tiers — small (raw / parts), medium
 * (sub-assemblies), large (finished robots) — so players can read the
 * factory at a glance.
 *
 * Authored as a `Record<ItemType, number>` so adding a new `ItemType`
 * is a compile error until a tier is assigned here.
 */
const SMALL_SCALE = 1.0
const MEDIUM_SCALE = 1.5
const LARGE_SCALE = 1.8

const ITEM_SCALES: Record<ItemType, number> = {
  wheel_small: SMALL_SCALE,
  wheel_medium: SMALL_SCALE,
  wheel_large: SMALL_SCALE,
  battery_standard: SMALL_SCALE,
  battery_high_capacity: SMALL_SCALE,
  chassis_light: SMALL_SCALE,
  chassis_heavy: SMALL_SCALE,
  circuit_basic: SMALL_SCALE,
  circuit_advanced: SMALL_SCALE,
  drivetrain_basic: MEDIUM_SCALE,
  drivetrain_advanced: MEDIUM_SCALE,
  power_unit_standard: MEDIUM_SCALE,
  power_unit_high: MEDIUM_SCALE,
  robot_explorer: LARGE_SCALE,
  robot_worker: LARGE_SCALE,
}

export function getItemScale(type: ItemType): number {
  return ITEM_SCALES[type]
}
