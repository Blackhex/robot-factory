export interface GridPosition {
  x: number
  z: number
}

export type Direction = 'north' | 'south' | 'east' | 'west'

export type SlotPosition = 'front' | 'back' | 'left' | 'right'

export interface SlotPositions {
  inputs: SlotPosition[]
  outputs: SlotPosition[]
}

export type MachineOutputPort = 'primary' | 'secondary' | 'tertiary'

export const SLOT_FIELD: Record<MachineOutputPort, 'outputSlot' | 'secondaryOutputSlot' | 'tertiaryOutputSlot'> = {
  primary: 'outputSlot',
  secondary: 'secondaryOutputSlot',
  tertiary: 'tertiaryOutputSlot',
}

/**
 * Canonical iteration order for machine output ports. Single source of
 * truth — `Simulation` and `StarvationGuard` both import this rather
 * than re-declaring the tuple inline (avoids silent drift if a 4th
 * port is ever added to {@link MachineOutputPort}).
 */
export const OUTPUT_PORTS = ['primary', 'secondary', 'tertiary'] as const satisfies readonly MachineOutputPort[]

export type MachineType =
  | 'part_fabricator'
  | 'assembler'
  | 'painter'
  | 'recycler'
  | 'splitter'
  | 'factory_output'

/**
 * Single source of truth for all `MachineType` values. Other modules
 * (e.g., the SaveLoad validator) should derive their allow-lists from
 * this constant rather than re-listing the union members.
 */
export const ALL_MACHINE_TYPES = [
  'part_fabricator',
  'assembler',
  'painter',
  'recycler',
  'splitter',
  'factory_output',
] as const satisfies readonly MachineType[]

// Compile-time exhaustiveness sentinel: if a new variant is added to the
// `MachineType` union without also being appended to `ALL_MACHINE_TYPES`,
// `_MachineTypeExhaustive` resolves to `never` and the assignment below
// fails to type-check, breaking `tsc --noEmit`.
type _MachineTypeExhaustive =
  Exclude<MachineType, (typeof ALL_MACHINE_TYPES)[number]> extends never ? true : never
const _machineTypeExhaustive: _MachineTypeExhaustive = true
void _machineTypeExhaustive

/**
 * Machine types that can be placed by the user via the MachinePanel.
 * Excludes `factory_output` because that is pre-placed by the level
 * definition (see LevelDefinition.startingMachines) — never user-placed.
 */
export const PLACEABLE_MACHINE_TYPES = [
  'part_fabricator',
  'assembler',
  'painter',
  'recycler',
  'splitter',
] as const satisfies readonly Exclude<MachineType, 'factory_output'>[]

// Compile-time bidirectional exhaustiveness for PLACEABLE_MACHINE_TYPES:
type _PlaceableMachineTypeExhaustive =
  Exclude<Exclude<MachineType, 'factory_output'>, (typeof PLACEABLE_MACHINE_TYPES)[number]> extends never
    ? (typeof PLACEABLE_MACHINE_TYPES)[number] extends Exclude<MachineType, 'factory_output'>
      ? true
      : never
    : never
const _placeableMachineTypeExhaustive: _PlaceableMachineTypeExhaustive = true
void _placeableMachineTypeExhaustive

export interface MachineInfo {
  id: string
  name: string
  type: MachineType
  x: number
  z: number
  rotation: Direction
  slots: SlotPositions
}

export interface BeltInfo {
  id: string
  name: string
  sourceMachine: MachineInfo
  sourceSlot: SlotPosition
  destinationMachine: MachineInfo
  destinationSlot: SlotPosition
  /** Ordered cells from source machine to destination machine (inclusive). */
  path: GridPosition[]
}

export type ItemType =
  | 'wheel_small'
  | 'wheel_medium'
  | 'wheel_large'
  | 'sensor_proximity'
  | 'sensor_camera'
  | 'sensor_lidar'
  | 'battery_standard'
  | 'battery_high_capacity'
  | 'chassis_light'
  | 'chassis_heavy'
  | 'circuit_basic'
  | 'circuit_advanced'
  | 'drivetrain_basic'
  | 'drivetrain_advanced'
  | 'sensor_array_basic'
  | 'sensor_array_advanced'
  | 'power_unit_standard'
  | 'power_unit_high'
  | 'robot_explorer'
  | 'robot_worker'
  | 'robot_guardian'
  | 'raw_material'

/**
 * Single source of truth for all `ItemType` values. Pinned to the union
 * by a compile-time exhaustiveness sentinel — if a new variant is added
 * to `ItemType` without also being appended here, the sentinel resolves
 * to `never` and `tsc --noEmit` fails.
 */
export const ALL_ITEM_TYPES = [
  'wheel_small',
  'wheel_medium',
  'wheel_large',
  'sensor_proximity',
  'sensor_camera',
  'sensor_lidar',
  'battery_standard',
  'battery_high_capacity',
  'chassis_light',
  'chassis_heavy',
  'circuit_basic',
  'circuit_advanced',
  'drivetrain_basic',
  'drivetrain_advanced',
  'sensor_array_basic',
  'sensor_array_advanced',
  'power_unit_standard',
  'power_unit_high',
  'robot_explorer',
  'robot_worker',
  'robot_guardian',
  'raw_material',
] as const satisfies readonly ItemType[]

type _ItemTypeExhaustive =
  Exclude<ItemType, (typeof ALL_ITEM_TYPES)[number]> extends never ? true : never
const _itemTypeExhaustive: _ItemTypeExhaustive = true
void _itemTypeExhaustive

/**
 * Single source of truth for the subset of ItemTypes that represent
 * fully-assembled robots. Used by Simulation to count `robotsProduced`
 * when an item reaches a factory_output. Pinned to the union by a
 * compile-time exhaustiveness sentinel — adding a new `robot_*` variant
 * to `ItemType` without appending it here breaks `tsc --noEmit`.
 */
export const ROBOT_ITEM_TYPES = [
  'robot_explorer',
  'robot_worker',
  'robot_guardian',
] as const satisfies readonly ItemType[]

type _RobotItemTypeExhaustive =
  Extract<ItemType, `robot_${string}`> extends (typeof ROBOT_ITEM_TYPES)[number]
    ? (typeof ROBOT_ITEM_TYPES)[number] extends Extract<ItemType, `robot_${string}`> ? true : never
    : never
const _robotItemTypeExhaustive: _RobotItemTypeExhaustive = true
void _robotItemTypeExhaustive

/**
 * Single source of truth for the subset of ItemTypes that represent
 * raw parts (wheels, sensors, batteries, chassis, circuits, raw_material).
 * Used by `getItemCategory()` and HUD breakdown counters.
 */
export const PART_ITEM_TYPES = [
  'wheel_small',
  'wheel_medium',
  'wheel_large',
  'sensor_proximity',
  'sensor_camera',
  'sensor_lidar',
  'battery_standard',
  'battery_high_capacity',
  'chassis_light',
  'chassis_heavy',
  'circuit_basic',
  'circuit_advanced',
  'raw_material',
] as const satisfies readonly ItemType[]

/**
 * Single source of truth for the subset of ItemTypes that represent
 * sub-assemblies (drivetrains, sensor arrays, power units). Used by
 * `getItemCategory()` and HUD breakdown counters.
 */
export const ASSEMBLY_ITEM_TYPES = [
  'drivetrain_basic',
  'drivetrain_advanced',
  'sensor_array_basic',
  'sensor_array_advanced',
  'power_unit_standard',
  'power_unit_high',
] as const satisfies readonly ItemType[]

// Compile-time guard: the union of the three category tuples must
// exactly equal `ItemType` (no missing, no extra members). Adding a
// new `ItemType` without classifying it breaks `tsc --noEmit`.
type _AllCategoriesUnion =
  | (typeof PART_ITEM_TYPES)[number]
  | (typeof ASSEMBLY_ITEM_TYPES)[number]
  | (typeof ROBOT_ITEM_TYPES)[number]
type _AllCategoriesExhaustive =
  Exclude<ItemType, _AllCategoriesUnion> extends never
    ? _AllCategoriesUnion extends ItemType ? true : never
    : never
const _allCategoriesExhaustive: _AllCategoriesExhaustive = true
void _allCategoriesExhaustive

// Compile-time guard: no value appears in more than one category tuple.
type _CategoriesDisjoint =
  Extract<(typeof PART_ITEM_TYPES)[number], (typeof ASSEMBLY_ITEM_TYPES)[number]> extends never
    ? Extract<(typeof PART_ITEM_TYPES)[number], (typeof ROBOT_ITEM_TYPES)[number]> extends never
      ? Extract<(typeof ASSEMBLY_ITEM_TYPES)[number], (typeof ROBOT_ITEM_TYPES)[number]> extends never
        ? true
        : never
      : never
    : never
const _categoriesDisjoint: _CategoriesDisjoint = true
void _categoriesDisjoint

const PART_ITEM_TYPE_SET: ReadonlySet<ItemType> = new Set<ItemType>(PART_ITEM_TYPES)
const ASSEMBLY_ITEM_TYPE_SET: ReadonlySet<ItemType> = new Set<ItemType>(ASSEMBLY_ITEM_TYPES)

export type ItemCategory = 'part' | 'assembly' | 'robot'

export function getItemCategory(type: ItemType): ItemCategory {
  if (PART_ITEM_TYPE_SET.has(type)) return 'part'
  if (ASSEMBLY_ITEM_TYPE_SET.has(type)) return 'assembly'
  return 'robot'
}

export type MachineState = 'idle' | 'processing' | 'blocked'

export interface SetRecipeCommand {
  readonly type: 'SET_RECIPE'
  readonly machineId: string
  readonly recipeId: string
}

export interface StartMachineCommand {
  readonly type: 'START_MACHINE'
  readonly machineId: string
}

export interface StopMachineCommand {
  readonly type: 'STOP_MACHINE'
  readonly machineId: string
}

export interface SetBeltSpeedCommand {
  readonly type: 'SET_BELT_SPEED'
  readonly beltId: string
  readonly speed: number
}

export interface SetMachineSpeedCommand {
  readonly type: 'SET_MACHINE_SPEED'
  readonly machineId: string
  readonly speed: number
}

export interface SetOutputSidesCommand {
  readonly type: 'SET_OUTPUT_SIDES'
  readonly machineId: string
  /** Bitmask: SPLITTER_SIDE_BIT.left | .forward | .right (subset of 1..7). */
  readonly sidesBitmask: number
  /**
   * When set, the command was emitted from inside an `on item arrives`
   * handler. The dispatcher records a per-item routing override on the
   * target splitter (consumed once by `tickSplitter` when this item is
   * routed) in addition to updating the sticky `outputSidesConfig`.
   * Required to make per-item routing deterministic when multiple
   * items arrive at the same splitter in the same tick.
   */
  readonly itemId?: string
}

/**
 * Per-item routing override emitted by the `route current item to`
 * block. Targets a Splitter only. Unlike `SET_OUTPUT_SIDES`, this
 * command MUST NOT mutate the splitter's sticky `outputSidesConfig`
 * — it only records a one-shot override in `perItemRouteOverrides`
 * for the named item. Last write to the same itemId wins.
 */
export interface RouteCurrentItemToCommand {
  readonly type: 'ROUTE_CURRENT_ITEM_TO'
  readonly machineId: string
  readonly itemId: string
  /** Bitmask using SPLITTER_SIDE_BIT values (typically a single side). */
  readonly sidesBitmask: number
}

/**
 * Splitter routing decision. `forward` is the default when no
 * `route current item to` block fires inside an `on item arrives`
 * handler. The mapping to the machine's three output slots is fixed
 * in {@link SPLITTER_SIDE_TO_PORT} and shared by simulation + editor.
 */
export type SplitterSide = 'left' | 'forward' | 'right'

export const SPLITTER_SIDE_TO_PORT: Record<SplitterSide, MachineOutputPort> = {
  forward: 'primary',
  right: 'secondary',
  left: 'tertiary',
}

/** Bit value of each splitter side in the `outputSidesConfig` bitfield. */
export const SPLITTER_SIDE_BIT: Record<SplitterSide, number> = {
  left: 1,
  forward: 2,
  right: 4,
}

/** Default `outputSidesConfig` value: all three sides enabled. */
export const SPLITTER_ALL_SIDES_BITS =
  SPLITTER_SIDE_BIT.left | SPLITTER_SIDE_BIT.forward | SPLITTER_SIDE_BIT.right

/**
 * Splitter sides in the canonical iteration order used by `tickSplitter`
 * to decode `outputSidesConfig`. The order encodes the round-robin walk:
 * with config = ALL, items cycle left → forward → right → left → …
 */
export const SPLITTER_SIDES_IN_BIT_ORDER: readonly SplitterSide[] = ['left', 'forward', 'right']

/**
 * Queue-level control command that pauses dispatch of subsequent
 * commands for the requested number of ticks. `WAIT` is consumed by
 * `Simulation.processCommands()` and is NEVER passed to the
 * `SimulationCommandDispatcher` — it has no side-effecting semantics.
 */
export interface WaitCommand {
  readonly type: 'WAIT'
  readonly ticks: number
}

export type SimulationCommand =
  | SetRecipeCommand
  | StartMachineCommand
  | StopMachineCommand
  | SetBeltSpeedCommand
  | SetMachineSpeedCommand
  | SetOutputSidesCommand
  | RouteCurrentItemToCommand
  | WaitCommand

export type SimulationEventType =
  | 'item_produced'
  | 'item_delivered'
  | 'output_delivered'
  | 'item_discarded'
  | 'machine_state_changed'
  | 'machine_cycle_completed'
  | 'order_complete'
  | 'belt_jam'
  | 'machine_idle'
  | 'tick'
  | 'game_over'

export interface SimulationEvent {
  type: SimulationEventType
  tick: number
  data: Record<string, unknown>
}

export type GameOverReason = 'unconsumable_input' | 'no_recipe' | 'starvation'
export type GameOverCause = 'machine_disabled'

export interface GameOverInfo {
  reason: GameOverReason
  cause?: GameOverCause
  machineId: string
  itemId?: string
  itemType?: ItemType
  tick: number
}

const RECIPE_REQUIRED_MACHINE_TYPES: ReadonlySet<MachineType> = new Set<MachineType>([
  'part_fabricator',
  'assembler',
  'painter',
])

/**
 * Returns true for machine types that cannot operate without a recipe.
 * Starting such a machine while `currentRecipe === null` is a fatal
 * configuration error (Game Over: 'no_recipe').
 */
export function isRecipeRequiredMachineType(type: MachineType): boolean {
  return RECIPE_REQUIRED_MACHINE_TYPES.has(type)
}
