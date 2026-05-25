import type { ItemType, MachineType } from './types.ts'

export interface RecipeInput {
  readonly type: ItemType
  readonly quantity: number
}

export interface RecipeOutput {
  readonly type: ItemType
  readonly quantity: number
}

export interface Recipe {
  readonly id: string
  readonly inputs: ReadonlyArray<RecipeInput>
  readonly outputs: ReadonlyArray<RecipeOutput>
  readonly processingTicks: number
  readonly machineType: MachineType
}

// --- Fabricator Recipes (raw material → part) ---

const wheelPress: Recipe = {
  id: 'wheel_press_small',
  inputs: [],
  outputs: [{ type: 'wheel_small', quantity: 1 }],
  processingTicks: 5,
  machineType: 'part_fabricator',
}

const wheelPressMedium: Recipe = {
  id: 'wheel_press_medium',
  inputs: [],
  outputs: [{ type: 'wheel_medium', quantity: 1 }],
  processingTicks: 7,
  machineType: 'part_fabricator',
}

const wheelPressLarge: Recipe = {
  id: 'wheel_press_large',
  inputs: [],
  outputs: [{ type: 'wheel_large', quantity: 1 }],
  processingTicks: 9,
  machineType: 'part_fabricator',
}

const batteryAssemblyStandard: Recipe = {
  id: 'battery_assembly_standard',
  inputs: [],
  outputs: [{ type: 'battery_standard', quantity: 1 }],
  processingTicks: 6,
  machineType: 'part_fabricator',
}

const batteryAssemblyHigh: Recipe = {
  id: 'battery_assembly_high',
  inputs: [],
  outputs: [{ type: 'battery_high_capacity', quantity: 1 }],
  processingTicks: 10,
  machineType: 'part_fabricator',
}

const chassisStamperLight: Recipe = {
  id: 'chassis_stamper_light',
  inputs: [],
  outputs: [{ type: 'chassis_light', quantity: 1 }],
  processingTicks: 8,
  machineType: 'part_fabricator',
}

const chassisStamperHeavy: Recipe = {
  id: 'chassis_stamper_heavy',
  inputs: [],
  outputs: [{ type: 'chassis_heavy', quantity: 1 }],
  processingTicks: 12,
  machineType: 'part_fabricator',
}

const circuitPrinterBasic: Recipe = {
  id: 'circuit_printer_basic',
  inputs: [],
  outputs: [{ type: 'circuit_basic', quantity: 1 }],
  processingTicks: 5,
  machineType: 'part_fabricator',
}

const circuitPrinterAdvanced: Recipe = {
  id: 'circuit_printer_advanced',
  inputs: [],
  outputs: [{ type: 'circuit_advanced', quantity: 1 }],
  processingTicks: 8,
  machineType: 'part_fabricator',
}

// --- Assembler Recipes (parts → sub-assemblies) ---

const assembleDrivetrainBasic: Recipe = {
  id: 'assemble_drivetrain_basic',
  inputs: [
    { type: 'wheel_small', quantity: 2 },
    { type: 'circuit_basic', quantity: 1 },
  ],
  outputs: [{ type: 'drivetrain_basic', quantity: 1 }],
  processingTicks: 10,
  machineType: 'assembler',
}

const assembleDrivetrainAdvanced: Recipe = {
  id: 'assemble_drivetrain_advanced',
  inputs: [
    { type: 'wheel_large', quantity: 2 },
    { type: 'circuit_advanced', quantity: 1 },
  ],
  outputs: [{ type: 'drivetrain_advanced', quantity: 1 }],
  processingTicks: 14,
  machineType: 'assembler',
}

const assemblePowerUnitStandard: Recipe = {
  id: 'assemble_power_unit_standard',
  inputs: [
    { type: 'battery_standard', quantity: 1 },
    { type: 'circuit_basic', quantity: 1 },
  ],
  outputs: [{ type: 'power_unit_standard', quantity: 1 }],
  processingTicks: 8,
  machineType: 'assembler',
}

const assemblePowerUnitHigh: Recipe = {
  id: 'assemble_power_unit_high',
  inputs: [
    { type: 'battery_high_capacity', quantity: 1 },
    { type: 'circuit_advanced', quantity: 1 },
  ],
  outputs: [{ type: 'power_unit_high', quantity: 1 }],
  processingTicks: 12,
  machineType: 'assembler',
}

// --- Assembler Recipes (sub-assemblies → robots) ---

const assembleRobotExplorer: Recipe = {
  id: 'assemble_robot_explorer',
  inputs: [
    { type: 'chassis_light', quantity: 1 },
    { type: 'drivetrain_basic', quantity: 1 },
    { type: 'power_unit_standard', quantity: 1 },
  ],
  outputs: [{ type: 'robot_explorer', quantity: 1 }],
  processingTicks: 20,
  machineType: 'assembler',
}

const assembleRobotWorker: Recipe = {
  id: 'assemble_robot_worker',
  inputs: [
    { type: 'chassis_heavy', quantity: 1 },
    { type: 'drivetrain_advanced', quantity: 1 },
    { type: 'power_unit_high', quantity: 1 },
  ],
  outputs: [{ type: 'robot_worker', quantity: 1 }],
  processingTicks: 25,
  machineType: 'assembler',
}

// --- Recipe Registry ---

const ALL_RECIPES: ReadonlyArray<Recipe> = [
  wheelPress,
  wheelPressMedium,
  wheelPressLarge,
  batteryAssemblyStandard,
  batteryAssemblyHigh,
  chassisStamperLight,
  chassisStamperHeavy,
  circuitPrinterBasic,
  circuitPrinterAdvanced,
  assembleDrivetrainBasic,
  assembleDrivetrainAdvanced,
  assemblePowerUnitStandard,
  assemblePowerUnitHigh,
  assembleRobotExplorer,
  assembleRobotWorker,
]

const recipeMap = new Map<string, Recipe>()
for (const recipe of ALL_RECIPES) {
  recipeMap.set(recipe.id, recipe)
}

export function getRecipeById(id: string): Recipe | undefined {
  return recipeMap.get(id)
}

export function getRecipeByOutputType(itemType: string): Recipe | undefined {
  return ALL_RECIPES.find(
    (r) =>
      r.machineType === 'part_fabricator' &&
      r.outputs.some((o) => o.type === itemType),
  )
}

export function getRecipesForMachineType(
  machineType: MachineType,
): ReadonlyArray<Recipe> {
  return ALL_RECIPES.filter((r) => r.machineType === machineType)
}

export function getAllRecipes(): ReadonlyArray<Recipe> {
  return ALL_RECIPES
}
