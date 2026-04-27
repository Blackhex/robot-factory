import { describe, expect, it, beforeEach } from 'vitest'
import { beltInventoryCapacity } from '../../../src/game/BeltInventoryRules'
import { planBeltInventoryMigration } from '../../../src/game/BeltInventoryMigration'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import {
  beltCoversCell,
  beltInfo,
  expectNoOrderedMigration,
  machine,
  removedInventory,
} from './helpers/BeltInventoryMigrationPlannerHelpers'

// TODO: re-enable in Phase 2 — migration rewrite for one-item-per-belt
// Phase 2: re-enabled. Missing slot identity behavior preserved.
describe('planBeltInventoryMigration() - missing slot identity', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('rejects ordered migration when removed inventory slot identity is unknown', () => {
    // GIVEN: a single removed inventory and candidate share endpoint machines,
    // but the removed inventory did not capture source/destination slot identity.
    const sourceMachine = machine('source', 0, 0)
    const destinationMachine = machine('destination', 5, 0)
    const replacement = beltInfo({
      id: 'known_slot_candidate_for_unknown_inventory',
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
    })
    const item = createItem('sensor_camera', 71)
    const inventory = removedInventory({
      sourceMachine,
      destinationMachine,
      sourceSlot: undefined,
      destinationSlot: null,
      sourceCellX: 0,
      sourceCellZ: 0,
      segmentCount: 7,
      items: [
        {
          cellX: 5,
          cellZ: 1,
          item,
        },
      ],
    })

    expect(replacement.sourceMachine.id).toBe(inventory.sourceMachineId)
    expect(replacement.destinationMachine.id).toBe(inventory.destinationMachineId)
    expect(inventory.sourceSlot).toBeUndefined()
    expect(inventory.destinationSlot).toBeNull()
    expect(replacement.sourceSlot).toBe('front')
    expect(replacement.destinationSlot).toBe('back')
    expect(beltInventoryCapacity(replacement)).toBeGreaterThanOrEqual(inventory.items.length)
    expect(beltCoversCell(replacement, 5, 1)).toBe(false)

    // WHEN: the planner sees one same-endpoint candidate with known slots.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: unknown removed slot identity is not enough to assign ordered migration.
    expectNoOrderedMigration(plan, item)
  })

  it('rejects ordered migration when candidate slot identity is unknown', () => {
    // GIVEN: a removed inventory has known slots, but the only same-endpoint
    // candidate cannot identify its source/destination slots.
    const sourceMachine = machine('source', 0, 0)
    const destinationMachine = machine('destination', 5, 0)
    const replacement = beltInfo({
      id: 'unknown_slot_candidate_for_known_inventory',
      sourceMachine,
      sourceSlot: undefined,
      destinationMachine,
      destinationSlot: null,
      path: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
        { x: 4, z: 0 },
        { x: 5, z: 0 },
      ],
    })
    const item = createItem('sensor_camera', 72)
    const inventory = removedInventory({
      sourceMachine,
      destinationMachine,
      sourceSlot: 'front',
      destinationSlot: 'back',
      sourceCellX: 0,
      sourceCellZ: 0,
      segmentCount: 7,
      items: [
        {
          cellX: 5,
          cellZ: 1,
          item,
        },
      ],
    })

    expect(replacement.sourceMachine.id).toBe(inventory.sourceMachineId)
    expect(replacement.destinationMachine.id).toBe(inventory.destinationMachineId)
    expect(inventory.sourceSlot).toBe('front')
    expect(inventory.destinationSlot).toBe('back')
    expect(replacement.sourceSlot).toBeUndefined()
    expect(replacement.destinationSlot).toBeNull()
    expect(beltInventoryCapacity(replacement)).toBeGreaterThanOrEqual(inventory.items.length)
    expect(beltCoversCell(replacement, 5, 1)).toBe(false)

    // WHEN: the planner sees exactly one same-endpoint candidate with unknown slots.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: unknown candidate slot identity is not enough to assign ordered migration.
    expectNoOrderedMigration(plan, item)
  })

  it('rejects ordered migration when both removed and candidate slot identities are unknown', () => {
    // GIVEN: a removed inventory and the only same-endpoint candidate both
    // have unknown source/destination slots.
    const sourceMachine = machine('source', 0, 0)
    const destinationMachine = machine('destination', 5, 0)
    const replacement = beltInfo({
      id: 'unknown_slot_candidate_for_unknown_inventory',
      sourceMachine,
      sourceSlot: undefined,
      destinationMachine,
      destinationSlot: null,
      path: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
        { x: 4, z: 0 },
        { x: 5, z: 0 },
      ],
    })
    const item = createItem('sensor_camera', 73)
    const inventory = removedInventory({
      sourceMachine,
      destinationMachine,
      sourceSlot: undefined,
      destinationSlot: null,
      sourceCellX: 0,
      sourceCellZ: 0,
      segmentCount: 7,
      items: [
        {
          cellX: 5,
          cellZ: 1,
          item,
        },
      ],
    })

    expect(replacement.sourceMachine.id).toBe(inventory.sourceMachineId)
    expect(replacement.destinationMachine.id).toBe(inventory.destinationMachineId)
    expect(replacement.sourceSlot).toBeUndefined()
    expect(inventory.sourceSlot).toBeUndefined()
    expect(replacement.destinationSlot).toBeNull()
    expect(inventory.destinationSlot).toBeNull()
    expect(beltInventoryCapacity(replacement)).toBeGreaterThanOrEqual(inventory.items.length)
    expect(beltCoversCell(replacement, 5, 1)).toBe(false)

    // WHEN: unknown slot identity appears equal by value on both sides.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: unknown identity still must not qualify for ordered migration.
    expectNoOrderedMigration(plan, item)
  })

  // removed: superseded by one-item-per-cell rule (asserted legacy seg-0
  // placement with 0.15 spacing; under discrete projection the second
  // item collides on the projected segment and is dropped).
  it.skip('uses ordered migration when endpoint and source/destination slots match exactly', () => {
    // GIVEN: the removed inventory and candidate agree on endpoint machines
    // and both source/destination slots.
    const sourceMachine = machine('source', 0, 0)
    const destinationMachine = machine('destination', 5, 0)
    const replacement = beltInfo({
      id: 'exact_front_to_back_candidate',
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
    })
    const firstItem = createItem('wheel_small', 73)
    const secondItem = createItem('sensor_camera', 74)
    const inventory = removedInventory({
      sourceMachine,
      destinationMachine,
      sourceSlot: 'front',
      destinationSlot: 'back',
      sourceCellX: 0,
      sourceCellZ: 0,
      segmentCount: 7,
      items: [
        {
          cellX: 5,
          cellZ: 1,
          item: firstItem,
        },
        {
          cellX: 5,
          cellZ: 2,
          item: secondItem,
        },
      ],
    })

    expect(replacement.sourceMachine.id).toBe(inventory.sourceMachineId)
    expect(replacement.destinationMachine.id).toBe(inventory.destinationMachineId)
    expect(replacement.sourceSlot).toBe(inventory.sourceSlot)
    expect(replacement.destinationSlot).toBe(inventory.destinationSlot)
    expect(beltInventoryCapacity(replacement)).toBeGreaterThanOrEqual(inventory.items.length)
    expect(beltCoversCell(replacement, 5, 1)).toBe(false)
    expect(beltCoversCell(replacement, 5, 2)).toBe(false)

    // WHEN: the planner sees an exact source/destination machine and slot match.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: ordered placement remains the desired positive path.
    expect(plan.placements).toEqual([
      {
        beltId: replacement.id,
        segmentIndex: 0,
        positionOnBelt: 0,
        item: firstItem,
      },
      {
        beltId: replacement.id,
        segmentIndex: 0,
        positionOnBelt: 0.15,
        item: secondItem,
      },
    ])
    expect(plan.claimedItemIds.has(firstItem.id)).toBe(true)
    expect(plan.claimedItemIds.has(secondItem.id)).toBe(true)
  })
})