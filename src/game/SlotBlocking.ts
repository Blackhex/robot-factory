import type { Direction, MachineInfo, SlotPositions } from './types'
import { slotPositionToOffset } from './SlotUtils'

/**
 * Pure helper: does any slot of `machine` (at its given rotation) point at a
 * cell currently occupied by a different machine?
 *
 * This is the "Direction 2" half of the slot-blocking constraint.
 * Shared by `Factory.isSlotBlocked` and
 * `PlacementPlanner.computePlacementPlan` so the two enforcement sites
 * cannot drift apart.
 *
 * @param machine — `{x, z, rotation, slots, id?}`. `id` (if provided) is
 *   used so a machine never blocks itself.
 * @param getMachineAt — caller-supplied lookup. The Factory passes its own
 *   grid lookup; the planner passes a closure that consults
 *   `virtualMachines` + `ignoreMachinePositions` + the underlying grid.
 */
export function machineSlotPointsAtNeighbor(
  machine: { x: number; z: number; rotation: Direction; slots: SlotPositions; id?: string },
  getMachineAt: (x: number, z: number) => MachineInfo | null,
): boolean {
  const { x, z, rotation, slots, id } = machine
  for (const sp of [...slots.inputs, ...slots.outputs]) {
    const off = slotPositionToOffset(sp, rotation)
    const nx = x + off.x
    const nz = z + off.z
    const target = getMachineAt(nx, nz)
    if (target && target.id !== id) return true
  }
  return false
}
