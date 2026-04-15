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

export type MachineType =
  | 'part_fabricator'
  | 'assembler'
  | 'quality_checker'
  | 'painter'
  | 'recycler'
  | 'splitter'
  | 'factory_output'

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

export interface RouteToCommand {
  readonly type: 'ROUTE_TO'
  readonly targetId: string
}

export interface SetQualityThresholdCommand {
  readonly type: 'SET_QUALITY_THRESHOLD'
  readonly machineId: string
  readonly threshold: number
}

export type SplitterConditionType = 'by_item_type' | 'by_quality' | 'alternating'

export interface SplitterCondition {
  readonly conditionType: SplitterConditionType
  readonly itemType?: ItemType
  readonly qualityThreshold?: number
}

export interface SetSplitterConditionCommand {
  readonly type: 'SET_SPLITTER_CONDITION'
  readonly machineId: string
  readonly condition: SplitterCondition
}

export type SimulationCommand =
  | SetRecipeCommand
  | StartMachineCommand
  | StopMachineCommand
  | SetBeltSpeedCommand
  | RouteToCommand
  | SetQualityThresholdCommand
  | SetSplitterConditionCommand

export type SimulationEventType =
  | 'item_produced'
  | 'item_delivered'
  | 'output_delivered'
  | 'machine_state_changed'
  | 'order_complete'
  | 'belt_jam'
  | 'machine_idle'
  | 'tick'

export interface SimulationEvent {
  type: SimulationEventType
  tick: number
  data: Record<string, unknown>
}
