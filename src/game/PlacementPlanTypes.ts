import type { Direction, GridPosition, MachineInfo, SlotPosition } from './types'

/**
 * Options bag for PlacementPlanner.computePlacementPlan. All fields are
 * optional; callers may pass an empty object (or omit the argument entirely)
 * to use the defaults.
 */
export interface PlacementPlanOptions {
  ignoreBeltIds?: ReadonlySet<string>
  fixedRotations?: boolean
  virtualMachines?: ReadonlyMap<string, MachineInfo>
  ignoreMachinePositions?: ReadonlySet<string>
  forcedHasBelts?: ReadonlySet<string>
  extraBlockedCells?: ReadonlySet<string>
  targetSlotPosition?: SlotPosition
  sourceSlotPosition?: SlotPosition
  /** Currently ignored by PlacementPlanner; ConnectedBeltEditOrchestrator validates the result downstream via `beltHasExactTuple`. */
  requireTargetSlotPosition?: boolean
  /**
   * When true, the planner falls back to placing the belt in the opposite
   * direction (source<->target swapped, slot type flipped) ONLY if the target
   * has no free slot of the requested complementary type. Used for
   * explicit-slot drags from the UI. Defaults to `false`.
   */
  tryReverseSlotType?: boolean
}

/**
 * Result of PlacementPlanner.computePlacementPlan. The `srcRotation` field
 * ALWAYS refers to the original `from` machine passed in, even when `reversed`
 * is true. The target's rotation is never derived; callers should read it from
 * the target machine directly.
 */
export interface PlacementPlanResult {
  path: GridPosition[]
  collides: boolean
  srcRotation?: Direction
  /**
   * True when the planner internally fell back to the reverse slot type
   * (source<->target swapped, slot type flipped). `srcRotation` still refers
   * to the original `from` machine; it is NOT swapped.
   */
  reversed?: boolean
}

export type ComputePlacementPlan = (
  from: GridPosition,
  to: GridPosition,
  sourceSlotType: 'input' | 'output',
  opts?: PlacementPlanOptions,
) => PlacementPlanResult | null