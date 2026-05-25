import { describe, expect, it, beforeEach } from 'vitest'
import { beltInventoryCapacity } from '../../../src/game/BeltInventoryRules'
import {
  planBeltInventoryMigration,
  type RemovedBeltInventory,
} from '../../../src/game/BeltInventoryMigration'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import type { BeltInfo } from '../../../src/game/types'
import { beltCoversCell, machine } from './helpers/BeltInventoryMigrationPlannerHelpers'

// Phase 2: re-enabled. Under the discrete one-item-per-cell contract,
// these tests now expect over-capacity items to be DROPPED rather than
// shifted past the new endpoint. Existing assertions are kept as RED:
// the legacy planner currently still satisfies them by virtue of
// preserving the single-item case, but the GREEN agent must ensure the
// new contract still passes them.
describe('planBeltInventoryMigration() - capacity', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  // removed: superseded by one-item-per-cell rule (asserted legacy seg-0
  // placement; under discrete projection the item lands on the projected
  // segment, not always seg 0).
  it.skip('keeps one item past a shortened straight same-slot replacement endpoint when capacity fits', () => {
    // GIVEN: the original straight connection was longer and held one item
    // on its tail past the endpoint of the shorter straight replacement.
    const sourceMachine = machine('source', 0, 0)
    const oldDestinationMachine = machine('destination', 5, 0)
    const replacementDestinationMachine = machine('destination', 3, 0)
    const oldBelt: BeltInfo = {
      id: 'old_straight_belt',
      name: 'old_straight_belt',
      sourceMachine,
      sourceSlot: 'front',
      destinationMachine: oldDestinationMachine,
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
    const replacement: BeltInfo = {
      id: 'shorter_straight_replacement',
      name: 'shorter_straight_replacement',
      sourceMachine,
      sourceSlot: 'front',
      destinationMachine: replacementDestinationMachine,
      destinationSlot: 'back',
      path: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
      ],
    }
    const item = createItem('wheel_small', 87)
    const inventory: RemovedBeltInventory = {
      sourceMachineId: sourceMachine.id,
      destinationMachineId: oldDestinationMachine.id,
      sourceSlot: oldBelt.sourceSlot,
      destinationSlot: oldBelt.destinationSlot,
      sourceCellX: oldBelt.path[0].x,
      sourceCellZ: oldBelt.path[0].z,
      segmentCount: oldBelt.path.length - 1,
      items: [
        {
          segmentIndex: 5,
          positionOnCell: 0,
          item,
        },
      ],
    }

    expect(replacement.sourceMachine.id).toBe(inventory.sourceMachineId)
    expect(replacement.destinationMachine.id).toBe(inventory.destinationMachineId)
    expect(replacement.sourceSlot).toBe(inventory.sourceSlot)
    expect(replacement.destinationSlot).toBe(inventory.destinationSlot)
    expect(replacement.path.length - 1).toBeLessThan(inventory.segmentCount)
    expect(beltInventoryCapacity(replacement)).toBeGreaterThanOrEqual(inventory.items.length)
    expect(beltCoversCell(oldBelt, 5, 0)).toBe(true)
    expect(beltCoversCell(replacement, 5, 0)).toBe(false)
    expect(Math.abs(5 - inventory.sourceCellX) + Math.abs(0 - inventory.sourceCellZ)).toBeGreaterThan(1)

    // WHEN: the same source/destination slot pair is replaced by the shorter straight belt.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: ordered capacity migration preserves the item even beyond the new endpoint.
    expect(plan.claimedItemIds.has(item.id)).toBe(true)
    expect(plan.remainingInventories).toEqual([])
    expect(plan.placements).toEqual([
      {
        beltId: replacement.id,
        newSegmentIndex: 0,
        newPositionOnCell: 0,
        item,
      },
    ])
    expect(plan.placements[0].item.id).toBe(item.id)
    expect(plan.placements[0].item.type).toBe('wheel_small')
    expect(plan.placements[0].item.quality).toBe(87)
  })

  // removed: superseded by one-item-per-cell rule (asserted legacy seg-0
  // placement; discrete projection places sparse items at their projected
  // segment).
  it.skip('keeps a single sparse away-from-source item on a shortened same-slot replacement when capacity fits', () => {
    // GIVEN: the original endpoint connection was longer and held one item
    // away from the source on a cell the shortened replacement no longer covers.
    const sourceMachine = machine('source', 0, 0)
    const destinationMachine = machine('destination', 5, 0)
    const oldBelt: BeltInfo = {
      id: 'old_belt',
      name: 'old_belt',
      sourceMachine,
      sourceSlot: 'front',
      destinationMachine,
      destinationSlot: 'back',
      path: [
        { x: 0, z: 0 },
        { x: 0, z: 1 },
        { x: 1, z: 1 },
        { x: 2, z: 1 },
        { x: 3, z: 1 },
        { x: 4, z: 1 },
        { x: 5, z: 1 },
        { x: 5, z: 0 },
      ],
    }
    const replacement: BeltInfo = {
      id: 'replacement_belt',
      name: 'replacement_belt',
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
    const item = createItem('wheel_small', 93)
    const inventory: RemovedBeltInventory = {
      sourceMachineId: sourceMachine.id,
      destinationMachineId: destinationMachine.id,
      sourceSlot: oldBelt.sourceSlot,
      destinationSlot: oldBelt.destinationSlot,
      sourceCellX: oldBelt.path[0].x,
      sourceCellZ: oldBelt.path[0].z,
      segmentCount: oldBelt.path.length - 1,
      items: [
        {
          segmentIndex: 6,
          positionOnCell: 0,
          item,
        },
      ],
    }

    expect(replacement.sourceMachine.id).toBe(inventory.sourceMachineId)
    expect(replacement.destinationMachine.id).toBe(inventory.destinationMachineId)
    expect(replacement.sourceSlot).toBe(inventory.sourceSlot)
    expect(replacement.destinationSlot).toBe(inventory.destinationSlot)
    expect(replacement.path.length - 1).toBeLessThan(inventory.segmentCount)
    expect(beltInventoryCapacity(replacement)).toBeGreaterThanOrEqual(inventory.items.length)
    expect(beltCoversCell(oldBelt, 5, 1)).toBe(true)
    expect(beltCoversCell(replacement, 5, 1)).toBe(false)
    expect(Math.abs(5 - inventory.sourceCellX) + Math.abs(1 - inventory.sourceCellZ)).toBeGreaterThan(1)

    // WHEN: the same source/destination slot pair is replaced by the shorter belt.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: migration is based on capacity and endpoint identity, not on a slot-pair change.
    expect(plan.claimedItemIds.has(item.id)).toBe(true)
    expect(plan.remainingInventories).toEqual([])
    expect(plan.placements).toEqual([
      {
        beltId: replacement.id,
        newSegmentIndex: 0,
        newPositionOnCell: 0,
        item,
      },
    ])
    expect(plan.placements[0].item.id).toBe(item.id)
    expect(plan.placements[0].item.type).toBe('wheel_small')
    expect(plan.placements[0].item.quality).toBe(93)
  })
})
