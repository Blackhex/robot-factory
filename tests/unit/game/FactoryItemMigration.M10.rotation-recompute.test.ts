import { describe, it, expect, beforeEach } from 'vitest'
import { renderGrid } from '../helpers/factoryAssert'
import {
  beltTupleSummaries,
  createMigrationTestContext,
  placeBlockedTwoLaneSplitterAssemblerFixture,
  type MigrationTestContext,
} from './helpers/FactoryItemMigrationHelpers'

// TODO: re-enable in Phase 2 — migration rewrite for one-item-per-belt
// Phase 2 RED: re-enabled.
describe('Factory belt edit during running simulation — item migration M10 rotation recompute', () => {
  let factory: MigrationTestContext['factory']

  beforeEach(() => {
    ;({ factory } = createMigrationTestContext())
  })

  describe('M10 — exact-slot rotation recompute', () => {
    it('removes a rotated same-endpoint lane instead of reconnecting it through different slots', () => {
      // GIVEN: the same two explicit slot lanes are connected to the
      // assembler. Rotation uses the same automatic recomputation machinery as
      // move, so the old left/left lane must not be retagged or replaced as a
      // different slot pair between the same endpoint machines.
      const { oldRightBelt, oldLeftBelt } = placeBlockedTwoLaneSplitterAssemblerFixture(factory)
      const splitterId = oldRightBelt.sourceMachine.id
      const assembler = oldRightBelt.destinationMachine
      expect(oldRightBelt.sourceSlot).toBe('right')
      expect(oldRightBelt.destinationSlot).toBe('right')
      expect(oldLeftBelt.sourceMachine.id).toBe(splitterId)
      expect(oldLeftBelt.destinationMachine.id).toBe(assembler.id)
      expect(oldLeftBelt.sourceSlot).toBe('left')
      expect(oldLeftBelt.destinationSlot).toBe('left')

      // WHEN: rotating the assembler triggers automatic recomputation for the
      // two same-endpoint lanes.
      expect(factory.rotateMachine(assembler, 'north')).toBe(true)

      // THEN: the recomputed topology may keep only exact original slot pairs.
      // Here the right/right lane survives rotation and the left/left lane is
      // absent; a front/back replacement for that old lane is invalid.
      expect(renderGrid(factory, 0, 1, 9, 5)).toBe([
        '| | | | | | | | | | |',
        '| |┌|─|─|─|┐| | | | |',
        '| |S| | |P|└|─|A| | |',
        '| | | | | | | | | | |',
        '| | | | | | | | | | |',
      ].join('\n'))
      expect(factory.getMachineAt(1, 3)!.rotation).toBe('east')
      expect(factory.getMachineAt(4, 3)!.rotation).toBe('south')
      expect(factory.getMachineAt(7, 3)!.rotation).toBe('north')

      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts.map((belt) => ({
        sourceMachineId: belt.sourceMachine.id,
        destinationMachineId: belt.destinationMachine.id,
        sourceSlot: belt.sourceSlot,
        destinationSlot: belt.destinationSlot,
        path: belt.path,
      }))).toEqual([
        {
          sourceMachineId: splitterId,
          destinationMachineId: assembler.id,
          sourceSlot: 'right',
          destinationSlot: 'right',
          path: [
            { x: 1, z: 3 },
            { x: 1, z: 2 },
            { x: 2, z: 2 },
            { x: 3, z: 2 },
            { x: 4, z: 2 },
            { x: 5, z: 2 },
            { x: 5, z: 3 },
            { x: 6, z: 3 },
            { x: 7, z: 3 },
          ],
        },
      ])
      expect(belts.some((belt) =>
        belt.sourceMachine.id === splitterId &&
        belt.destinationMachine.id === assembler.id &&
        belt.sourceSlot === 'front' &&
        belt.destinationSlot === 'back'
      )).toBe(false)
    })

    it('preserves all exactly reconnectable same-endpoint lanes during public rotation recompute', () => {
      // GIVEN: the same two same-endpoint lane identities can both reconnect
      // exactly after the assembler rotates in place.
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

      // WHEN: public rotation recomputation removes both original lanes and
      // must not treat one successful endpoint pair as covering its sibling.
      expect(factory.rotateMachine(assembler, 'north')).toBe(true)

      // THEN: both original exact slot identities remain present after the
      // edit, with full path and endpoint geometry preserved per lane.
      expect(renderGrid(factory, 0, 1, 9, 5)).toBe([
        '| | | | | | | | | | |',
        '| |┌|─|─|─|┐| | | | |',
        '| |S| | | |└|─|A|┐| |',
        '| |└|─|─|─|─|─|─|┘| |',
        '| | | | | | | | | | |',
      ].join('\n'))
      expect(factory.getMachineAt(1, 3)!.rotation).toBe('east')
      expect(factory.getMachineAt(7, 3)!.rotation).toBe('north')

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
            { x: 8, z: 4 },
            { x: 8, z: 3 },
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
            { x: 5, z: 3 },
            { x: 6, z: 3 },
            { x: 7, z: 3 },
          ],
        },
      ])
    })
  })
})
