import type { BeltInfo } from './types'

/**
 * Discrete one-item-per-cell capacity model.
 *
 * Each `ConveyorBelt` segment instance holds at most one item, so a logical
 * belt's total inventory capacity is exactly its segment count
 * (`path.length - 1`).
 */
export function beltSegmentItemCapacity(): number {
  return 1
}

export function beltInventoryCapacity(belt: Pick<BeltInfo, 'path'>): number {
  return Math.max(0, belt.path.length - 1)
}
