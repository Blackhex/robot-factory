import type { Item } from './Item'
import type { BeltInfo } from './types'

/**
 * A single item captured from a removed belt during a live edit.
 *
 * The discrete one-item-per-cell contract identifies an item by
 * `(segmentIndex, positionOnCell)`.
 */
export interface CapturedBeltItem {
  /** Discrete segment index of the captured item on the OLD belt (0..oldSegCount-1). */
  segmentIndex: number
  /** Fractional progress on the captured cell, in `[0, 1)`. */
  positionOnCell: number
  item: Item
}

export interface RemovedBeltInventory {
  sourceMachineId: string
  destinationMachineId: string
  sourceSlot: BeltInfo['sourceSlot'] | undefined | null
  destinationSlot: BeltInfo['destinationSlot'] | undefined | null
  sourceCellX: number
  sourceCellZ: number
  destinationCellX?: number
  destinationCellZ?: number
  segmentCount: number
  items: CapturedBeltItem[]
}

/**
 * A planned placement on a destination belt under the discrete contract.
 */
export interface BeltInventoryPlacement {
  beltId: string
  newSegmentIndex: number
  newPositionOnCell: number
  item: Item
}

export type DropReason = 'capacity' | 'no_match'

export interface DroppedInventoryItem {
  item: Item
  oldSegmentIndex: number
  reason: DropReason
}

export interface BeltInventoryMigrationPlan {
  claimedItemIds: Set<string>
  slotIdentityMismatchSuppressedItemIds: Set<string>
  placements: BeltInventoryPlacement[]
  dropped: DroppedInventoryItem[]
  remainingInventories: RemovedBeltInventory[]
}

export function planBeltInventoryMigration(
  inventories: readonly RemovedBeltInventory[],
  replacementBelts: Iterable<BeltInfo>,
  editAddedBelt: boolean,
): BeltInventoryMigrationPlan {
  const belts = Array.from(replacementBelts)
  const claimedItemIds = new Set<string>()
  const slotIdentityMismatchSuppressedItemIds = new Set<string>()
  const placements: BeltInventoryPlacement[] = []
  const dropped: DroppedInventoryItem[] = []
  const remainingInventories: RemovedBeltInventory[] = []

  for (const inventory of inventories) {
    const exact = findExactSlotReplacement(inventory, belts)
    if (!exact.replacement) {
      if (exact.hasEndpointMatch && !exact.hasExactSlotMatch) {
        for (const captured of inventory.items) {
          slotIdentityMismatchSuppressedItemIds.add(captured.item.id)
        }
      }
      if (!editAddedBelt) remainingInventories.push(inventory)
      continue
    }

    for (const captured of inventory.items) claimedItemIds.add(captured.item.id)
    const result = planExactSlotMigration(inventory, exact.replacement)
    placements.push(...result.placements)
    dropped.push(...result.dropped)
  }

  return {
    claimedItemIds,
    slotIdentityMismatchSuppressedItemIds,
    placements,
    dropped,
    remainingInventories,
  }
}

function planExactSlotMigration(
  inventory: RemovedBeltInventory,
  replacement: BeltInfo,
): { placements: BeltInventoryPlacement[]; dropped: DroppedInventoryItem[] } {
  const newSegCount = Math.max(0, replacement.path.length - 1)
  const placements: BeltInventoryPlacement[] = []
  const dropped: DroppedInventoryItem[] = []
  if (newSegCount === 0) {
    for (const captured of inventory.items) {
      dropped.push({
        item: captured.item,
        oldSegmentIndex: captured.segmentIndex,
        reason: 'capacity',
      })
    }
    return { placements, dropped }
  }

  interface ResolvedCapture {
    oldSeg: number
    oldPos: number
    item: Item
  }
  const resolved: ResolvedCapture[] = inventory.items.map((c) => ({
    oldSeg: c.segmentIndex,
    oldPos: c.positionOnCell,
    item: c.item,
  }))
  // Flow order: by oldSegmentIndex asc, tiebreak positionOnCell asc.
  resolved.sort((a, b) => a.oldSeg - b.oldSeg || a.oldPos - b.oldPos)

  const occupied = new Set<number>()
  for (const cap of resolved) {
    // Source-anchored projection: an item N cells from the source on the
    // OLD chain stays N cells from the source on the NEW chain. The
    // source machine is the chain anchor; topology changes never move an
    // item visually unless its target cell is past the new chain end. This
    // preserves tick-discrete spacing across machine moves: at any tick
    // boundary all items have positionOnCell = (tick % cellTicks) /
    // cellTicks, so source-anchored placement keeps the stream uniform.
    const targetSeg = Math.max(0, cap.oldSeg)
    let seg = targetSeg
    while (seg < newSegCount && occupied.has(seg)) seg++
    if (seg >= newSegCount) {
      dropped.push({ item: cap.item, oldSegmentIndex: cap.oldSeg, reason: 'capacity' })
      continue
    }
    occupied.add(seg)
    placements.push({
      beltId: replacement.id,
      newSegmentIndex: seg,
      newPositionOnCell: cap.oldPos,
      item: cap.item,
    })
  }
  return { placements, dropped }
}

function findExactSlotReplacement(
  inventory: RemovedBeltInventory,
  belts: readonly BeltInfo[],
): { replacement: BeltInfo | undefined; hasEndpointMatch: boolean; hasExactSlotMatch: boolean } {
  const endpointMatches = belts.filter((belt) =>
    belt.sourceMachine.id === inventory.sourceMachineId &&
    belt.destinationMachine.id === inventory.destinationMachineId,
  )
  const exactSlotMatch = endpointMatches.find((belt) => hasExactSlotIdentity(inventory, belt))
  return {
    replacement: exactSlotMatch,
    hasEndpointMatch: endpointMatches.length > 0,
    hasExactSlotMatch: exactSlotMatch !== undefined,
  }
}

export function hasExactSlotIdentity(inventory: RemovedBeltInventory, belt: BeltInfo): boolean {
  return isKnownSlot(inventory.sourceSlot) &&
    isKnownSlot(inventory.destinationSlot) &&
    isKnownSlot(belt.sourceSlot) &&
    isKnownSlot(belt.destinationSlot) &&
    belt.sourceSlot === inventory.sourceSlot &&
    belt.destinationSlot === inventory.destinationSlot
}

function isKnownSlot(slot: BeltInfo['sourceSlot'] | undefined | null): slot is BeltInfo['sourceSlot'] {
  return slot !== undefined && slot !== null
}
