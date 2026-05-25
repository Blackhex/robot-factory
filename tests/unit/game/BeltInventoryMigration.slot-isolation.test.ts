import { describe, expect, it, beforeEach } from 'vitest'
import {
  planBeltInventoryMigration,
  type RemovedBeltInventory,
} from '../../../src/game/BeltInventoryMigration'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import type { BeltInfo } from '../../../src/game/types'
import { beltCoversCell, machine } from './helpers/BeltInventoryMigrationPlannerHelpers'

// TODO: re-enable in Phase 2 — migration rewrite for one-item-per-belt
// Phase 2: re-enabled. Slot-tuple isolation is preserved under the new
// discrete contract — items on a belt with mismatched slots must not be
// migrated to a belt with different slots.
describe('planBeltInventoryMigration() - slot isolation', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('does not migrate parallel inventory with nonmatching slots to the only endpoint replacement', () => {
    // GIVEN: two removed belt inventories had the same endpoint machines but
    // different slot pairs, and only the front-to-back pair was replaced.
    const sourceMachine = machine('source', 0, 0)
    const destinationMachine = machine('destination', 5, 0)
    const replacement: BeltInfo = {
      id: 'front_to_back_replacement',
      name: 'front_to_back_replacement',
      sourceMachine,
      sourceSlot: 'front',
      destinationMachine,
      destinationSlot: 'back',
      path: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
        { x: 4, z: 0 },
        { x: 5, z: 0 },
      ],
    }
    const matchingItem = createItem('wheel_small', 91)
    const nonmatchingItem = createItem('wheel_small', 72)
    const matchingInventory: RemovedBeltInventory = {
      sourceMachineId: sourceMachine.id,
      destinationMachineId: destinationMachine.id,
      sourceSlot: 'front',
      destinationSlot: 'back',
      sourceCellX: 0,
      sourceCellZ: 0,
      segmentCount: 7,
      items: [
        {
          // Use a segment index that fits within the replacement chain so
          // source-anchored projection retains the item; this test exercises
          // slot-isolation, not segment-overflow handling.
          segmentIndex: 4,
          positionOnCell: 0,
          item: matchingItem,
        },
      ],
    }
    const nonmatchingInventory: RemovedBeltInventory = {
      sourceMachineId: sourceMachine.id,
      destinationMachineId: destinationMachine.id,
      sourceSlot: 'left',
      destinationSlot: 'right',
      sourceCellX: 0,
      sourceCellZ: 0,
      segmentCount: 7,
      items: [
        {
          segmentIndex: 4,
          positionOnCell: 0,
          item: nonmatchingItem,
        },
      ],
    }

    expect(replacement.sourceMachine.id).toBe(matchingInventory.sourceMachineId)
    expect(replacement.destinationMachine.id).toBe(matchingInventory.destinationMachineId)
    expect(replacement.sourceSlot).toBe(matchingInventory.sourceSlot)
    expect(replacement.destinationSlot).toBe(matchingInventory.destinationSlot)
    expect(replacement.sourceMachine.id).toBe(nonmatchingInventory.sourceMachineId)
    expect(replacement.destinationMachine.id).toBe(nonmatchingInventory.destinationMachineId)
    expect(replacement.sourceSlot).not.toBe(nonmatchingInventory.sourceSlot)
    expect(replacement.destinationSlot).not.toBe(nonmatchingInventory.destinationSlot)
    expect(beltCoversCell(replacement, 5, 1)).toBe(false)
    expect(beltCoversCell(replacement, 5, -1)).toBe(false)

    // WHEN: the migration planner evaluates both removed inventories against the only replacement.
    const plan = planBeltInventoryMigration([matchingInventory, nonmatchingInventory], [replacement], true)

    // THEN: only the inventory whose source/destination slot pair matches the replacement is migrated.
    const placementItemIds = plan.placements.map((placement) => placement.item.id)
    expect(placementItemIds).toEqual([matchingItem.id])
    expect(placementItemIds).not.toContain(nonmatchingItem.id)
    expect(plan.claimedItemIds.has(matchingItem.id)).toBe(true)
    expect(plan.claimedItemIds.has(nonmatchingItem.id)).toBe(false)
  })

  it('keeps same-endpoint inventories isolated by replacement slot pair', () => {
    // GIVEN: three removed inventories share the same endpoint machines, but
    // only the right-to-right and left-to-left slot pairs have replacements.
    const sourceMachine = machine('source', 1, 3)
    const destinationMachine = machine('destination', 6, 3)
    const rightReplacement: BeltInfo = {
      id: 'right_replacement',
      name: 'right_replacement',
      sourceMachine,
      sourceSlot: 'right',
      destinationMachine,
      destinationSlot: 'right',
      path: [
        { x: 1, z: 3 },
        { x: 1, z: 2 },
        { x: 2, z: 2 },
        { x: 3, z: 2 },
        { x: 4, z: 2 },
        { x: 5, z: 2 },
        { x: 6, z: 2 },
        { x: 6, z: 3 },
      ],
    }
    const leftReplacement: BeltInfo = {
      id: 'left_replacement',
      name: 'left_replacement',
      sourceMachine,
      sourceSlot: 'left',
      destinationMachine,
      destinationSlot: 'left',
      path: [
        { x: 1, z: 3 },
        { x: 1, z: 4 },
        { x: 2, z: 4 },
        { x: 3, z: 4 },
        { x: 4, z: 4 },
        { x: 5, z: 4 },
        { x: 6, z: 4 },
        { x: 6, z: 3 },
      ],
    }
    const rightItems = [createItem('wheel_small', 91), createItem('wheel_small', 92)]
    const leftItems = [createItem('wheel_medium', 81), createItem('wheel_medium', 82)]
    const nonmatchingItem = createItem('wheel_small', 73)
    const rightInventory: RemovedBeltInventory = {
      sourceMachineId: sourceMachine.id,
      destinationMachineId: destinationMachine.id,
      sourceSlot: 'right',
      destinationSlot: 'right',
      sourceCellX: 1,
      sourceCellZ: 3,
      segmentCount: 8,
      items: [
        { segmentIndex: 0, positionOnCell: 0, item: rightItems[0] },
        // Use a segment index that fits within the replacement chain so
        // source-anchored projection retains the item; this test exercises
        // slot-pair isolation across same-endpoint lanes, not overflow.
        { segmentIndex: 6, positionOnCell: 0, item: rightItems[1] },
      ],
    }
    const leftInventory: RemovedBeltInventory = {
      sourceMachineId: sourceMachine.id,
      destinationMachineId: destinationMachine.id,
      sourceSlot: 'left',
      destinationSlot: 'left',
      sourceCellX: 1,
      sourceCellZ: 3,
      segmentCount: 8,
      items: [
        { segmentIndex: 0, positionOnCell: 0, item: leftItems[0] },
        { segmentIndex: 6, positionOnCell: 0, item: leftItems[1] },
      ],
    }
    const nonmatchingInventory: RemovedBeltInventory = {
      sourceMachineId: sourceMachine.id,
      destinationMachineId: destinationMachine.id,
      sourceSlot: 'front',
      destinationSlot: 'back',
      sourceCellX: 1,
      sourceCellZ: 3,
      segmentCount: 8,
      items: [
        { segmentIndex: 6, positionOnCell: 0, item: nonmatchingItem },
      ],
    }

    expect(rightReplacement.sourceMachine.id).toBe(leftReplacement.sourceMachine.id)
    expect(rightReplacement.destinationMachine.id).toBe(leftReplacement.destinationMachine.id)
    expect(rightReplacement.sourceSlot).toBe(rightInventory.sourceSlot)
    expect(rightReplacement.destinationSlot).toBe(rightInventory.destinationSlot)
    expect(leftReplacement.sourceSlot).toBe(leftInventory.sourceSlot)
    expect(leftReplacement.destinationSlot).toBe(leftInventory.destinationSlot)
    expect([rightReplacement.sourceSlot, leftReplacement.sourceSlot]).not.toContain(nonmatchingInventory.sourceSlot)
    expect([rightReplacement.destinationSlot, leftReplacement.destinationSlot]).not.toContain(nonmatchingInventory.destinationSlot)
    expect(beltCoversCell(rightReplacement, 7, 2)).toBe(false)
    expect(beltCoversCell(leftReplacement, 7, 4)).toBe(false)

    // WHEN: the planner evaluates multiple inventories and replacements with identical endpoint ids.
    const plan = planBeltInventoryMigration(
      [rightInventory, leftInventory, nonmatchingInventory],
      [rightReplacement, leftReplacement],
      true,
    )

    // THEN: each slot-matched inventory migrates only to its corresponding replacement.
    const placementsByBelt = new Map<string, string[]>()
    for (const placement of plan.placements) {
      placementsByBelt.set(
        placement.beltId,
        [...(placementsByBelt.get(placement.beltId) ?? []), placement.item.id],
      )
    }
    expect(placementsByBelt.get(rightReplacement.id)).toEqual(rightItems.map((item) => item.id))
    expect(placementsByBelt.get(leftReplacement.id)).toEqual(leftItems.map((item) => item.id))
    expect([...placementsByBelt.values()].flat()).not.toContain(nonmatchingItem.id)
    expect(plan.claimedItemIds.has(rightItems[0].id)).toBe(true)
    expect(plan.claimedItemIds.has(rightItems[1].id)).toBe(true)
    expect(plan.claimedItemIds.has(leftItems[0].id)).toBe(true)
    expect(plan.claimedItemIds.has(leftItems[1].id)).toBe(true)
    expect(plan.claimedItemIds.has(nonmatchingItem.id)).toBe(false)
    expect(plan.remainingInventories).toEqual([])
  })
})
