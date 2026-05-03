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
  sensor_proximity: 0x44cc44,
  sensor_camera: 0x339933,
  sensor_lidar: 0x66ee66,
  battery_standard: 0xddaa22,
  battery_high_capacity: 0xff8833,
  chassis_light: 0x5588dd,
  chassis_heavy: 0x334488,
  circuit_basic: 0x22cccc,
  circuit_advanced: 0x118888,
  drivetrain_basic: 0xcc8844,
  drivetrain_advanced: 0x886633,
  sensor_array_basic: 0x88ee88,
  sensor_array_advanced: 0x44aa44,
  power_unit_standard: 0xcccc22,
  power_unit_high: 0xeeee44,
  robot_explorer: 0xffcc00,
  robot_worker: 0xff8800,
  robot_guardian: 0xcc4400,
  raw_material: 0xaa8866,
}
