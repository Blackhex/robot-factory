import type { Item } from './Item'
import type { BeltInfo } from './types'
import { ConveyorBelt } from './ConveyorBelt'

/**
 * A single item captured from a removed belt during a live edit.
 *
 * Under the per-cell capacity contract (up to two items per cell
 * separated by `ConveyorBelt.MIN_ITEM_SPACING`) an item is identified
 * by `(segmentIndex, positionOnCell)`.
 */
export interface CapturedBeltItem {
  /** Segment index of the captured item on the OLD belt (0..oldSegCount-1). */
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
 * A planned placement on a destination belt under the per-cell capacity
 * contract (up to two items per cell separated by
 * `ConveyorBelt.MIN_ITEM_SPACING`).
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

  const cellOccupants = new Map<number, number[]>()
  const fits = (seg: number, pos: number): boolean =>
    ConveyorBelt.canFitAt(cellOccupants.get(seg) ?? [], pos)

  for (const cap of resolved) {
    // Source-anchored projection: an item N cells from the source on the
    // OLD chain stays N cells from the source on the NEW chain at the
    // same `oldPositionOnCell`. The source machine is the chain anchor;
    // topology changes never move an item visually unless its target
    // cell is past the new chain end. Under the two-items-per-cell
    // contract, collisions on the same seg are resolved by walking
    // forward to the next seg with room (preserving the existing
    // source-anchored intent for capacity 1, generalized for capacity 2).
    let seg = Math.max(0, cap.oldSeg)
    while (seg < newSegCount && !fits(seg, cap.oldPos)) seg++
    if (seg >= newSegCount) {
      dropped.push({ item: cap.item, oldSegmentIndex: cap.oldSeg, reason: 'capacity' })
      continue
    }
    const occList = cellOccupants.get(seg) ?? []
    occList.push(cap.oldPos)
    cellOccupants.set(seg, occList)
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
  const inventoryKey = beltEndpointKey(
    inventory.sourceMachineId,
    inventory.sourceSlot,
    inventory.destinationMachineId,
    inventory.destinationSlot,
  )
  const beltKey = beltEndpointKey(
    belt.sourceMachine.id,
    belt.sourceSlot,
    belt.destinationMachine.id,
    belt.destinationSlot,
  )
  return inventoryKey !== null && inventoryKey === beltKey
}

/**
 * Stable identity of a belt connection across a live edit.
 *
 * Two belts represent the same logical connection iff they share the
 * same `(sourceMachine.id, sourceSlot, destinationMachine.id,
 * destinationSlot)` quadruple — the "endpoint quadruple". The literal
 * `belt.id` is NOT stable: `FactoryBeltRegistry.nextBeltId()` mints a
 * fresh `belt_${n}` on every reconnect.
 *
 * The string encoding uses `|` as a separator. Safety: slot values
 * are a fixed string-union (`'front' | 'back' | 'left' | 'right'`)
 * and machine ids are `machine_${n}` — neither can contain `|`.
 *
 * Used by:
 *  - `BeltInventoryMigration.hasExactSlotIdentity` to decide whether
 *    a removed belt's items should migrate to a recomputed belt.
 *  - `FactorySimulationSync.removedBeltSpeeds` to key per-edit
 *    speed-restoration maps.
 *
 * Returns `null` when either slot is missing or unknown — those
 * belts cannot be matched as exact endpoints (matches the existing
 * `isKnownSlot` guard).
 */
export function beltEndpointKey(
  sourceMachineId: string,
  sourceSlot: BeltInfo['sourceSlot'] | undefined | null,
  destinationMachineId: string,
  destinationSlot: BeltInfo['destinationSlot'] | undefined | null,
): string | null {
  if (!isKnownSlot(sourceSlot) || !isKnownSlot(destinationSlot)) {
    return null
  }
  return `${sourceMachineId}|${sourceSlot}|${destinationMachineId}|${destinationSlot}`
}

function isKnownSlot(slot: BeltInfo['sourceSlot'] | undefined | null): slot is BeltInfo['sourceSlot'] {
  return slot !== undefined && slot !== null
}
