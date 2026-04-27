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
// Phase 2: re-enabled. Exact slot identity matching preserved under the
// new discrete contract.
describe('planBeltInventoryMigration() - exact slot identity', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('rejects ordered migration for a same-endpoint candidate with mismatched slots', () => {
    // GIVEN: one removed inventory has source/destination slots recorded, and the
    // only candidate has the same endpoint machines but a different slot pair.
    const sourceMachine = machine('source', 0, 0)
    const destinationMachine = machine('destination', 5, 0)
    const replacement = beltInfo({
      id: 'front_to_back_candidate',
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
    const item = createItem('sensor_camera', 72)
    const inventory = removedInventory({
      sourceMachine,
      destinationMachine,
      sourceSlot: 'left',
      destinationSlot: 'right',
      sourceCellX: 0,
      sourceCellZ: 0,
      segmentCount: 7,
      items: [
        {
          cellX: 5,
          cellZ: -1,
          item,
        },
      ],
    })

    expect(replacement.sourceMachine.id).toBe(inventory.sourceMachineId)
    expect(replacement.destinationMachine.id).toBe(inventory.destinationMachineId)
    expect(replacement.sourceSlot).not.toBe(inventory.sourceSlot)
    expect(replacement.destinationSlot).not.toBe(inventory.destinationSlot)
    expect(beltCoversCell(replacement, 5, -1)).toBe(false)

    // WHEN: the planner sees only a same-endpoint candidate whose slot pair does not match.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: the uncovered item is not assigned an ordered migration target.
    expectNoOrderedMigration(plan, item)
  })

  it('rejects ordered migration for known mismatched slots when captured endpoint cells moved', () => {
    // GIVEN: the removed inventory recorded both endpoint cells and a known slot pair,
    // but the only candidate moved the endpoint cells and uses a different known slot pair.
    const sourceMachine = machine('source', 0, 0)
    const destinationMachine = machine('destination', 5, 0)
    const replacement = beltInfo({
      id: 'moved_front_to_back_candidate',
      sourceMachine,
      sourceSlot: 'front',
      destinationMachine,
      destinationSlot: 'back',
      path: [
        { x: 0, z: 1 },
        { x: 1, z: 1 },
        { x: 2, z: 1 },
        { x: 3, z: 1 },
        { x: 4, z: 1 },
        { x: 5, z: 1 },
      ],
    })
    const item = createItem('sensor_camera', 79)
    const inventory = removedInventory({
      sourceMachine,
      destinationMachine,
      sourceSlot: 'left',
      destinationSlot: 'right',
      sourceCellX: 0,
      sourceCellZ: 0,
      destinationCellX: 5,
      destinationCellZ: 0,
      segmentCount: 7,
      items: [
        {
          cellX: 5,
          cellZ: 0,
          item,
        },
      ],
    })

    expect(replacement.sourceMachine.id).toBe(inventory.sourceMachineId)
    expect(replacement.destinationMachine.id).toBe(inventory.destinationMachineId)
    expect(replacement.sourceSlot).not.toBe(inventory.sourceSlot)
    expect(replacement.destinationSlot).not.toBe(inventory.destinationSlot)
    expect(replacement.path[0]).not.toEqual({ x: inventory.sourceCellX, z: inventory.sourceCellZ })
    expect(replacement.path[replacement.path.length - 1]).not.toEqual({
      x: inventory.destinationCellX,
      z: inventory.destinationCellZ,
    })
    expect(beltInventoryCapacity(replacement)).toBeGreaterThanOrEqual(inventory.items.length)
    expect(beltCoversCell(replacement, 5, 0)).toBe(false)

    // WHEN: moved endpoint cells are present without exact slot identity.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: known source/destination slot mismatch still prevents ordered migration.
    expectNoOrderedMigration(plan, item)
  })

  it('rejects ordered migration for a full known slot mismatch with one stable endpoint cell', () => {
    // GIVEN: the removed inventory recorded both endpoint cells and a known slot pair,
    // while the only candidate keeps the source cell stable, moves the destination cell,
    // and uses a completely different known slot pair.
    const sourceMachine = machine('source', 0, 0)
    const destinationMachine = machine('destination', 5, 0)
    const replacement = beltInfo({
      id: 'destination_moved_front_to_back_candidate',
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
        { x: 5, z: 1 },
      ],
    })
    const item = createItem('sensor_camera', 78)
    const inventory = removedInventory({
      sourceMachine,
      destinationMachine,
      sourceSlot: 'left',
      destinationSlot: 'right',
      sourceCellX: 0,
      sourceCellZ: 0,
      destinationCellX: 5,
      destinationCellZ: 0,
      segmentCount: 7,
      items: [
        {
          cellX: 4,
          cellZ: 1,
          item,
        },
      ],
    })

    expect(replacement.sourceMachine.id).toBe(inventory.sourceMachineId)
    expect(replacement.destinationMachine.id).toBe(inventory.destinationMachineId)
    expect(replacement.sourceSlot).not.toBe(inventory.sourceSlot)
    expect(replacement.destinationSlot).not.toBe(inventory.destinationSlot)
    expect(replacement.path[0]).toEqual({ x: inventory.sourceCellX, z: inventory.sourceCellZ })
    expect(replacement.path[replacement.path.length - 1]).not.toEqual({
      x: inventory.destinationCellX,
      z: inventory.destinationCellZ,
    })
    expect(beltInventoryCapacity(replacement)).toBeGreaterThanOrEqual(inventory.items.length)
    expect(beltCoversCell(replacement, 4, 1)).toBe(false)

    // WHEN: exactly one endpoint cell moved and the other stayed stable.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: known source/destination slot mismatch still prevents ordered migration.
    expectNoOrderedMigration(plan, item)
  })

  it('rejects ordered migration for a partial source-slot-only identity match', () => {
    // GIVEN: one removed inventory has known source/destination slots, and the
    // only candidate keeps the endpoint machines and source slot but changes destination slot.
    const sourceMachine = machine('source', 0, 0)
    const destinationMachine = machine('destination', 5, 0)
    const replacement = beltInfo({
      id: 'front_to_right_candidate',
      sourceMachine,
      sourceSlot: 'front',
      destinationMachine,
      destinationSlot: 'right',
      path: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
        { x: 4, z: 0 },
        { x: 5, z: 0 },
      ],
    })
    const item = createItem('sensor_camera', 76)
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
    expect(replacement.sourceSlot).toBe(inventory.sourceSlot)
    expect(replacement.destinationSlot).not.toBe(inventory.destinationSlot)
    expect(beltInventoryCapacity(replacement)).toBeGreaterThanOrEqual(inventory.items.length)
    expect(beltCoversCell(replacement, 5, 1)).toBe(false)

    // WHEN: the planner sees a same-endpoint candidate that only partially matches known slots.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: the item is not assigned an ordered placement without exact slot identity.
    expectNoOrderedMigration(plan, item)
  })

  it('rejects ordered migration for a partial known slot mismatch with one stable endpoint cell', () => {
    // GIVEN: the removed inventory recorded both endpoint cells and both slots are known,
    // while the only candidate keeps the source slot and cell stable but changes the
    // destination slot and destination cell.
    const sourceMachine = machine('source', 0, 0)
    const destinationMachine = machine('destination', 5, 0)
    const replacement = beltInfo({
      id: 'destination_moved_front_to_right_candidate',
      sourceMachine,
      sourceSlot: 'front',
      destinationMachine,
      destinationSlot: 'right',
      path: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
        { x: 4, z: 0 },
        { x: 5, z: 0 },
        { x: 5, z: -1 },
      ],
    })
    const item = createItem('wheel_medium', 85)
    const inventory = removedInventory({
      sourceMachine,
      destinationMachine,
      sourceSlot: 'front',
      destinationSlot: 'back',
      sourceCellX: 0,
      sourceCellZ: 0,
      destinationCellX: 5,
      destinationCellZ: 0,
      segmentCount: 7,
      items: [
        {
          cellX: 4,
          cellZ: -1,
          item,
        },
      ],
    })

    expect(replacement.sourceMachine.id).toBe(inventory.sourceMachineId)
    expect(replacement.destinationMachine.id).toBe(inventory.destinationMachineId)
    expect(replacement.sourceSlot).toBe(inventory.sourceSlot)
    expect(replacement.destinationSlot).not.toBe(inventory.destinationSlot)
    expect(replacement.path[0]).toEqual({ x: inventory.sourceCellX, z: inventory.sourceCellZ })
    expect(replacement.path[replacement.path.length - 1]).not.toEqual({
      x: inventory.destinationCellX,
      z: inventory.destinationCellZ,
    })
    expect(beltInventoryCapacity(replacement)).toBeGreaterThanOrEqual(inventory.items.length)
    expect(beltCoversCell(replacement, 4, -1)).toBe(false)

    // WHEN: exactly one endpoint cell moved and the other stayed stable.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: partial known slot mismatch still prevents ordered migration.
    expectNoOrderedMigration(plan, item)
  })

  it('rejects ordered migration for a known partial-slot match when captured endpoint cells moved', () => {
    // GIVEN: the removed inventory recorded both endpoint cells and both slots are known,
    // but the only candidate moved endpoint cells while matching only the source slot.
    const sourceMachine = machine('source', 0, 0)
    const destinationMachine = machine('destination', 5, 0)
    const replacement = beltInfo({
      id: 'moved_front_to_right_candidate',
      sourceMachine,
      sourceSlot: 'front',
      destinationMachine,
      destinationSlot: 'right',
      path: [
        { x: 0, z: -1 },
        { x: 1, z: -1 },
        { x: 2, z: -1 },
        { x: 3, z: -1 },
        { x: 4, z: -1 },
        { x: 5, z: -1 },
      ],
    })
    const item = createItem('wheel_medium', 84)
    const inventory = removedInventory({
      sourceMachine,
      destinationMachine,
      sourceSlot: 'front',
      destinationSlot: 'back',
      sourceCellX: 0,
      sourceCellZ: 0,
      destinationCellX: 5,
      destinationCellZ: 0,
      segmentCount: 7,
      items: [
        {
          cellX: 5,
          cellZ: 0,
          item,
        },
      ],
    })

    expect(replacement.sourceMachine.id).toBe(inventory.sourceMachineId)
    expect(replacement.destinationMachine.id).toBe(inventory.destinationMachineId)
    expect(replacement.sourceSlot).toBe(inventory.sourceSlot)
    expect(replacement.destinationSlot).not.toBe(inventory.destinationSlot)
    expect(replacement.path[0]).not.toEqual({ x: inventory.sourceCellX, z: inventory.sourceCellZ })
    expect(replacement.path[replacement.path.length - 1]).not.toEqual({
      x: inventory.destinationCellX,
      z: inventory.destinationCellZ,
    })
    expect(beltInventoryCapacity(replacement)).toBeGreaterThanOrEqual(inventory.items.length)
    expect(beltCoversCell(replacement, 5, 0)).toBe(false)

    // WHEN: moved endpoint cells are present without exact slot identity.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: partial known slot mismatch still prevents ordered migration.
    expectNoOrderedMigration(plan, item)
  })

})
