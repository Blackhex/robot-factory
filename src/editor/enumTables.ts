/**
 * Canonical enum tables shared across the editor layer.
 *
 * This module is a pure constant table — it must not import from
 * BlockInterpreter, recipeDropdownFilter, PxtEditor, or anything in
 * src/game/.
 */

export const RECIPE_TABLE = [
  { enumName: 'WheelPressSmall', id: 'wheel_press_small' },
  { enumName: 'WheelPressMedium', id: 'wheel_press_medium' },
  { enumName: 'WheelPressLarge', id: 'wheel_press_large' },
  { enumName: 'BatteryAssemblyStandard', id: 'battery_assembly_standard' },
  { enumName: 'BatteryAssemblyHigh', id: 'battery_assembly_high' },
  { enumName: 'ChassisStamperLight', id: 'chassis_stamper_light' },
  { enumName: 'ChassisStamperHeavy', id: 'chassis_stamper_heavy' },
  { enumName: 'CircuitPrinterBasic', id: 'circuit_printer_basic' },
  { enumName: 'CircuitPrinterAdvanced', id: 'circuit_printer_advanced' },
  { enumName: 'AssembleDrivetrainBasic', id: 'assemble_drivetrain_basic' },
  { enumName: 'AssembleDrivetrainAdvanced', id: 'assemble_drivetrain_advanced' },
  { enumName: 'AssemblePowerUnitStandard', id: 'assemble_power_unit_standard' },
  { enumName: 'AssemblePowerUnitHigh', id: 'assemble_power_unit_high' },
  { enumName: 'AssembleRobotExplorer', id: 'assemble_robot_explorer' },
  { enumName: 'AssembleRobotWorker', id: 'assemble_robot_worker' },
] as const
