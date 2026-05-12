/**
 * Shared types used by Page Objects. Kept local to the POM library so specs
 * never need to import from `src/`.
 */

export interface GridCoord {
  x: number
  z: number
}

export interface GridSize {
  width: number
  height: number
}

export const DEFAULT_GRID_SIZE: GridSize = { width: 20, height: 20 }

export interface MachineInfo {
  id: string
  type: string
  x: number
  z: number
  name?: string
}

export interface BeltInfo {
  id: string
}

export type MachineState = 'idle' | 'processing' | 'blocked'

/**
 * Structured view of a single `factory_set_recipe` block on the live
 * Blockly workspace. Computed from the workspace's serialized DOM so the
 * spec never needs to parse XML directly.
 */
export interface SetRecipeBlockInfo {
  /** Block id assigned by Blockly. */
  id: string
  /** True iff the block has a `<value name="machine">` input element. */
  hasMachineValueInput: boolean
  /**
   * Type of the block/shadow connected to the machine value input, e.g.
   * `'factory_pick_machine'`. Null when the input is missing or empty.
   */
  machineSlotChildType: string | null
  /**
   * Whether the connected child is rendered as a `<shadow>` (rather than
   * a real `<block>`). Null when the slot is empty/missing.
   */
  machineSlotChildIsShadow: boolean | null
  /**
   * Value of the `<field name="machine">` field on the connected child,
   * e.g. `'Machine.B'`. Null when the slot is empty/missing or the child
   * has no such field.
   */
  machineFieldValue: string | null
  /** Value of the `<field name="recipe">` field on the parent block. */
  recipeFieldValue: string | null
}

/**
 * Structured view of a single PXT consumer block on the live Blockly
 * workspace whose machine/belt parameter is wired through a pluggable
 * `<value name="…">` slot (`factory_pick_machine` or `factory_pick_belt`
 * shadow). Generic counterpart of {@link SetRecipeBlockInfo}; produced
 * by `PxtEditorPage.readPluggableConsumerBlocksFromLiveWorkspace`.
 *
 * `slotName` and `slotChildFieldName` are the same as the Blockly slot
 * name on the parent block (e.g. `"machine"` or `"belt"`) and the
 * `<field name="…">` name on the wired child shadow (also `"machine"`
 * or `"belt"`). Tracked per-instance because the rollout flips 5
 * different consumer blocks across two slot families.
 */
export interface PluggableConsumerBlockInfo {
  /** Block id assigned by Blockly. */
  id: string
  /** Block type queried, echoed back for diagnostics. */
  blockType: string
  /** Slot name queried (e.g. `"machine"` or `"belt"`). */
  slotName: string
  /** True iff the block has a `<value name="${slotName}">` input element. */
  hasValueInput: boolean
  /**
   * Type of the block/shadow connected to the slot value input, e.g.
   * `'factory_pick_machine'` or `'factory_pick_belt'`. Null when the
   * input is missing or empty.
   */
  slotChildType: string | null
  /** Whether the connected child is rendered as a `<shadow>`. */
  slotChildIsShadow: boolean | null
  /**
   * Value of `<field name="${slotChildFieldName}">` on the connected
   * child (e.g. `'Machine.B'` or `'Belt.A'`). Null when the slot is
   * empty/missing or the child has no such field.
   */
  slotChildFieldValue: string | null
}

export interface SimSnapshot {
  running: boolean
  machineCount: number
  beltCount: number
  itemsOnBelts: number
  beltItemCounts: number[]
  machineStates: Array<{
    id: string
    state: string
    inputSlots: number
    outputSlot: boolean
    consumedItems: number
  }>
}

export interface SimulationRunState {
  running: boolean
  paused: boolean
}

export interface DragMachinePauseSemantics {
  beforeDrag: SimulationRunState
  whilePointerHeldAtDestination: SimulationRunState
  afterDrop: SimulationRunState
}

export interface BeltItemSnapshot {
  id: string
  type: string
  quality: number
  positionOnBelt: number
  beltId: string
  fromX: number
  fromZ: number
  toX: number
  toZ: number
}

export interface OutputDeliverySnapshot {
  itemId: string
  itemType: string
  machineId: string
  tick: number
}

export interface OutputDeliveryRecorderState {
  hasSimulation: boolean
  attachedFlag: boolean
  listenerCount: number
}

export interface BeltMeshInspection {
  corners: Array<{
    key: string
    geometryType: string
    vertexCount: number
    hasUV: boolean
    uvRange: { minU: number; maxU: number; minV: number; maxV: number } | null
    positionX: number
    positionY: number
    positionZ: number
    bbMin: { x: number; y: number; z: number } | null
    bbMax: { x: number; y: number; z: number } | null
  }>
  straights: Array<{
    key: string
    geometryType: string
    vertexCount: number
    positionX: number
    positionY: number
    positionZ: number
  }>
  totalMeshes: number
}

export interface BeltCornerHighlightState {
  key: string
  isHighlighted: boolean
  emissiveHex: number
  emissiveStrength: number
  materialUuid: string | string[]
}

export interface BeltHighlightInspection {
  cornerCount: number
  results: BeltCornerHighlightState[]
}

export type BeltClearInspection = BeltCornerHighlightState

export interface SceneItemMeshes {
  totalCount: number
  meshes: Array<{ count: number; instancesAtItemY: number }>
}

export interface ItemInstancePosition {
  x: number
  z: number
}

export interface ItemInstancePositions {
  totalCount: number
  /** Sum of all instance X coordinates — a stable signature for movement detection. */
  sumX: number
  /** Sum of all instance Z coordinates — a stable signature for movement detection. */
  sumZ: number
  positions: ItemInstancePosition[]
}

/**
 * A single straight segment of a belt path expressed in **world-space**
 * coordinates (ItemRenderer's coordinate system: cell `(gx, gz)` maps to
 * world `(gx - W/2 + 0.5, gz - H/2 + 0.5)`). Used by edit-during-simulation
 * tests to assert rendered item positions lie on a current belt path.
 */
export interface BeltPathSegment {
  ax: number
  az: number
  bx: number
  bz: number
}

export interface DropdownSnapshot {
  optionLabels: string[]
  fieldValue: string
  faceText: string
}

export interface FlyoutBlockSnapshot {
  id: string
  type: string
  apiText: string
  apiValue: string
  svgTexts: string[]
}

export interface EventBlockInfoEntry {
  registered: boolean
  hasPrevious: boolean
  hasNext: boolean
  color: string
}
