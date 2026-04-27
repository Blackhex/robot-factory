import { describe, it, expect, beforeEach } from 'vitest'
import { renderGrid } from '../helpers/factoryAssert'
import {
  allItemsOnSimBelts,
  attachSimToFactory,
  beltTupleSummaries,
  createMigrationTestContext,
  expectSimBeltsMatchFactory,
  findBeltByEndpointsAndSlots,
  findItemById,
  injectItem,
  orderedItemIdsOnFactoryBelt,
  populateSim,
  type MigrationTestContext,
} from './helpers/FactoryItemMigrationHelpers'

// TODO: re-enable in Phase 2 — migration rewrite for one-item-per-belt
// Phase 2 RED: re-enabled.
describe('Factory belt edit during running simulation — item migration M10 move recompute', () => {
  let factory: MigrationTestContext['factory']
  let sim: MigrationTestContext['sim']

  beforeEach(() => {
    ;({ factory, sim } = createMigrationTestContext())
  })

  describe('M10 — exact-slot move recompute', () => {
    it('commits a valid machine move when no connected exact-slot lane can be recomputed', () => {
      // GIVEN: two explicit splitter-to-assembler lanes. Each exact-slot lane
      // would overlap an unrelated machine output slot after the assembler
      // moves one cell left, so neither lane can be recomputed even though the
      // destination cell itself is valid for the machine.
      const upperOutputBlocker = factory.placeMachine(4, 1, 'part_fabricator', 'south')!
      const splitter = factory.placeMachine(1, 3, 'splitter', 'east')!
      const lowerOutputBlocker = factory.placeMachine(4, 3, 'painter', 'south')!
      const assembler = factory.placeMachine(7, 3, 'assembler', 'east')!
      expect(upperOutputBlocker.type).toBe('part_fabricator')
      expect(lowerOutputBlocker.type).toBe('painter')
      expect(factory.placeBeltChain(splitter, assembler, 'output', {
        fixedRotations: true,
        sourceSlotPosition: 'right',
        targetSlotPosition: 'right',
      })).toBe(true)
      expect(factory.placeBeltChain(splitter, assembler, 'output', {
        fixedRotations: true,
        sourceSlotPosition: 'left',
        targetSlotPosition: 'left',
      })).toBe(true)

      expect(renderGrid(factory, 0, 1, 8, 4)).toBe([
        '| | | | |F| | | | |',
        '| |┌|─|─|─|─|─|┐| |',
        '| |S| | |P| | |A| |',
        '| |└|─|─|─|─|─|┘| |',
      ].join('\n'))
      expect(factory.getMachineAt(4, 1)!.rotation).toBe('south')
      expect(factory.getMachineAt(1, 3)!.rotation).toBe('east')
      expect(factory.getMachineAt(4, 3)!.rotation).toBe('south')
      expect(factory.getMachineAt(7, 3)!.rotation).toBe('east')
      expect(factory.getBelts()).toHaveLength(2)
      expect(beltTupleSummaries(factory)).toEqual([
        {
          sourceMachineId: splitter.id,
          destinationMachineId: assembler.id,
          source: { x: 1, z: 3 },
          destination: { x: 7, z: 3 },
          sourceSlot: 'left',
          destinationSlot: 'left',
          path: [
            { x: 1, z: 3 },
            { x: 1, z: 4 },
            { x: 2, z: 4 },
            { x: 3, z: 4 },
            { x: 4, z: 4 },
            { x: 5, z: 4 },
            { x: 6, z: 4 },
            { x: 7, z: 4 },
            { x: 7, z: 3 },
          ],
        },
        {
          sourceMachineId: splitter.id,
          destinationMachineId: assembler.id,
          source: { x: 1, z: 3 },
          destination: { x: 7, z: 3 },
          sourceSlot: 'right',
          destinationSlot: 'right',
          path: [
            { x: 1, z: 3 },
            { x: 1, z: 2 },
            { x: 2, z: 2 },
            { x: 3, z: 2 },
            { x: 4, z: 2 },
            { x: 5, z: 2 },
            { x: 6, z: 2 },
            { x: 7, z: 2 },
            { x: 7, z: 3 },
          ],
        },
      ])
      const oldLeftBelt = findBeltByEndpointsAndSlots(factory, splitter.id, assembler.id, 'left', 'left')
      const oldRightBelt = findBeltByEndpointsAndSlots(factory, splitter.id, assembler.id, 'right', 'right')

      populateSim(factory, sim)
      sim.start()
      const removedLeftId = injectItem(sim, oldLeftBelt, 3, 0, 'sensor_camera')
      const removedRightId = injectItem(sim, oldRightBelt, 3, 0, 'wheel_small')
      expect(oldLeftBelt.path[3]).toEqual({ x: 3, z: 4 })
      expect(oldRightBelt.path[3]).toEqual({ x: 3, z: 2 })
      expect(orderedItemIdsOnFactoryBelt(sim, oldLeftBelt)).toEqual([removedLeftId])
      expect(orderedItemIdsOnFactoryBelt(sim, oldRightBelt)).toEqual([removedRightId])
      attachSimToFactory(factory, sim)

      // WHEN: validating and committing the move. Movement validity is based
      // on the destination machine cell, not on preserving at least one belt
      // reconnection for the connected endpoint pair.
      expect(factory.canMoveMachine(7, 3, 6, 3)).toBe(true)
      expect(factory.moveMachine(7, 3, 6, 3)).toBe(true)

      // THEN: the assembler moves successfully and the unrecomputable exact
      // sourceMachineId/destinationMachineId/sourceSlot/destinationSlot lane
      // is removed instead of blocking the move.
      expect(renderGrid(factory, 0, 1, 8, 4)).toBe([
        '| | | | |F| | | | |',
        '| | | | | | | | | |',
        '| |S| | |P| |A| | |',
        '| | | | | | | | | |',
      ].join('\n'))
      expect(factory.getMachineAt(4, 1)!.rotation).toBe('south')
      expect(factory.getMachineAt(1, 3)!.rotation).toBe('east')
      expect(factory.getMachineAt(4, 3)!.rotation).toBe('south')
      expect(factory.getMachineAt(6, 3)!.rotation).toBe('east')
      expect(factory.getBelts()).toHaveLength(0)
      expect(factory.getBelts().some((belt) =>
        belt.sourceMachine.id === splitter.id &&
        belt.destinationMachine.id === assembler.id &&
        belt.sourceSlot === 'left' &&
        belt.destinationSlot === 'left'
      )).toBe(false)
      expect(factory.getBelts().some((belt) =>
        belt.sourceMachine.id === splitter.id &&
        belt.destinationMachine.id === assembler.id &&
        belt.sourceSlot === 'right' &&
        belt.destinationSlot === 'right'
      )).toBe(false)
      expectSimBeltsMatchFactory(factory, sim)
      expect(findItemById(sim, removedLeftId)).toBeUndefined()
      expect(findItemById(sim, removedRightId)).toBeUndefined()
      expect(allItemsOnSimBelts(sim)).toEqual([])
    })

    it('preserves all exactly reconnectable same-endpoint lanes during public move recompute', () => {
      // GIVEN: the splitter and assembler are connected by two same-endpoint
      // lanes through distinct slot pairs, and both exact slot pairs have room
      // to reconnect after the assembler moves farther away.
      const splitter = factory.placeMachine(1, 3, 'splitter', 'east')!
      const assembler = factory.placeMachine(7, 3, 'assembler', 'east')!
      expect(factory.placeBeltChain(splitter, assembler, 'output', {
        fixedRotations: true,
        sourceSlotPosition: 'right',
        targetSlotPosition: 'right',
      })).toBe(true)
      expect(factory.placeBeltChain(splitter, assembler, 'output', {
        fixedRotations: true,
        sourceSlotPosition: 'left',
        targetSlotPosition: 'left',
      })).toBe(true)

      expect(renderGrid(factory, 0, 2, 9, 4)).toBe([
        '| |┌|─|─|─|─|─|┐| | |',
        '| |S| | | | | |A| | |',
        '| |└|─|─|─|─|─|┘| | |',
      ].join('\n'))
      expect(factory.getBelts()).toHaveLength(2)
      expect(beltTupleSummaries(factory)).toEqual([
        {
          sourceMachineId: splitter.id,
          destinationMachineId: assembler.id,
          source: { x: 1, z: 3 },
          destination: { x: 7, z: 3 },
          sourceSlot: 'left',
          destinationSlot: 'left',
          path: [
            { x: 1, z: 3 },
            { x: 1, z: 4 },
            { x: 2, z: 4 },
            { x: 3, z: 4 },
            { x: 4, z: 4 },
            { x: 5, z: 4 },
            { x: 6, z: 4 },
            { x: 7, z: 4 },
            { x: 7, z: 3 },
          ],
        },
        {
          sourceMachineId: splitter.id,
          destinationMachineId: assembler.id,
          source: { x: 1, z: 3 },
          destination: { x: 7, z: 3 },
          sourceSlot: 'right',
          destinationSlot: 'right',
          path: [
            { x: 1, z: 3 },
            { x: 1, z: 2 },
            { x: 2, z: 2 },
            { x: 3, z: 2 },
            { x: 4, z: 2 },
            { x: 5, z: 2 },
            { x: 6, z: 2 },
            { x: 7, z: 2 },
            { x: 7, z: 3 },
          ],
        },
      ])

      // WHEN: public move recomputation removes both original lanes and must
      // attempt each exact source/destination/slot tuple independently.
      expect(factory.moveMachine(7, 3, 8, 3)).toBe(true)

      // THEN: both lanes survive, and neither slot identity is collapsed into
      // the other same-endpoint lane.
      expect(renderGrid(factory, 0, 2, 9, 4)).toBe([
        '| |┌|─|─|─|─|─|─|┐| |',
        '| |S| | | | | | |A| |',
        '| |└|─|─|─|─|─|─|┘| |',
      ].join('\n'))
      expect(factory.getMachineAt(1, 3)!.rotation).toBe('east')
      expect(factory.getMachineAt(8, 3)!.rotation).toBe('east')

      expect(factory.getBelts()).toHaveLength(2)
      expect(beltTupleSummaries(factory)).toEqual([
        {
          sourceMachineId: splitter.id,
          destinationMachineId: assembler.id,
          source: { x: 1, z: 3 },
          destination: { x: 8, z: 3 },
          sourceSlot: 'left',
          destinationSlot: 'left',
          path: [
            { x: 1, z: 3 },
            { x: 1, z: 4 },
            { x: 2, z: 4 },
            { x: 3, z: 4 },
            { x: 4, z: 4 },
            { x: 5, z: 4 },
            { x: 6, z: 4 },
            { x: 7, z: 4 },
            { x: 8, z: 4 },
            { x: 8, z: 3 },
          ],
        },
        {
          sourceMachineId: splitter.id,
          destinationMachineId: assembler.id,
          source: { x: 1, z: 3 },
          destination: { x: 8, z: 3 },
          sourceSlot: 'right',
          destinationSlot: 'right',
          path: [
            { x: 1, z: 3 },
            { x: 1, z: 2 },
            { x: 2, z: 2 },
            { x: 3, z: 2 },
            { x: 4, z: 2 },
            { x: 5, z: 2 },
            { x: 6, z: 2 },
            { x: 7, z: 2 },
            { x: 8, z: 2 },
            { x: 8, z: 3 },
          ],
        },
      ])
    })
  })
})
