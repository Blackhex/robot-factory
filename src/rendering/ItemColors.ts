import type { ItemType } from '../game/types'

/**
 * Per-item-type display colors used by `ItemRenderer` to allocate one
 * `InstancedMesh` material per type. Kept as a small standalone module
 * so the renderer file stays focused on rendering logic.
 */
export const ITEM_COLORS: Record<ItemType, number> = {
  wheel_small: 0xbbbbbb,
  wheel_medium: 0x999999,
  wheel_large: 0x777777,
  battery_standard: 0xddaa22,
  battery_high_capacity: 0xff8833,
  chassis_light: 0x5588dd,
  chassis_heavy: 0x334488,
  circuit_basic: 0x22cccc,
  circuit_advanced: 0x118888,
  drivetrain_basic: 0xcc8844,
  drivetrain_advanced: 0x886633,
  power_unit_standard: 0xcccc22,
  power_unit_high: 0xeeee44,
  robot_explorer: 0xffcc00,
  robot_worker: 0xff8800,
}

/**
 * Color used for items flagged as `isDefective` on belts. Bright red,
 * deliberately distinct from every per-type entry in `ITEM_COLORS` so
 * defective items are unambiguously identifiable in the 3D scene. The
 * renderer applies this via `InstancedMesh.setColorAt(idx, ...)` per
 * defective instance; clean instances receive `ITEM_COLORS[type]`.
 */
export const DEFECTIVE_ITEM_COLOR: number = 0xff2222
