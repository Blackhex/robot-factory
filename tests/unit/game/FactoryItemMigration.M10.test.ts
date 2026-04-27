import { describe, it, expect, beforeEach } from 'vitest'
import { renderGrid } from '../helpers/factoryAssert'
import {
  createMigrationTestContext,
  placeBlockedTwoLaneSplitterAssemblerFixture,
  type MigrationTestContext,
} from './helpers/FactoryItemMigrationHelpers'

// TODO: re-enable in Phase 2 — migration rewrite for one-item-per-belt
// Phase 2 RED: re-enabled.
describe('Factory belt edit during running simulation — item migration M10 exact-slot replacements', () => {
  let factory: MigrationTestContext['factory']

  beforeEach(() => {
    ;({ factory } = createMigrationTestContext())
  })

  describe('M10 — same-endpoint exact-slot replacement', () => {
    it('preserves a single-lane destination slot during no-item public move recompute', () => {
      // GIVEN: one splitter lane feeds the assembler's explicit left input.
      // No simulation inventory is attached, so public move exercises the
      // single-lane/no-item recompute path.
      factory.restoreState(
        [
          { x: 1, z: 3, type: 'splitter', rotation: 'east' },
          { x: 7, z: 3, type: 'assembler', rotation: 'east' },
        ],
        [
          {
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
        ],
      )
      expect(renderGrid(factory, 0, 2, 8, 4)).toBe([
        '| | | | | | | | | |',
        '| |S| | | | | |A| |',
        '| |└|─|─|─|─|─|┘| |',
      ].join('\n'))
      const oldBelt = factory.getBelts()[0]
      const splitterId = oldBelt.sourceMachine.id
      const assemblerId = oldBelt.destinationMachine.id
      expect(oldBelt.sourceSlot).toBe('left')
      expect(oldBelt.destinationSlot).toBe('left')

      // WHEN: moving the assembler triggers automatic recomputation with no
      // captured belt inventory.
      expect(factory.moveMachine(7, 3, 6, 3)).toBe(true)

      // THEN: because the exact left input is still reachable, the recomputed
      // belt must preserve the destination slot identity instead of reconnecting
      // to a sibling assembler input.
      expect(factory.getMachineAt(1, 3)!.rotation).toBe('east')
      expect(factory.getMachineAt(6, 3)!.rotation).toBe('east')

      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].sourceSlot).toBe('left')
      expect(belts[0].destinationSlot).toBe('left')
      expect(belts.map((belt) => ({
        sourceMachineId: belt.sourceMachine.id,
        destinationMachineId: belt.destinationMachine.id,
        sourceSlot: belt.sourceSlot,
        destinationSlot: belt.destinationSlot,
        path: belt.path,
      }))).toEqual([
        {
          sourceMachineId: splitterId,
          destinationMachineId: assemblerId,
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
            { x: 6, z: 3 },
          ],
        },
      ])
      expect(belts.some((belt) => belt.destinationSlot !== 'left')).toBe(false)
      expect(renderGrid(factory, 0, 2, 8, 4)).toBe([
        '| | | | | | | | | |',
        '| |S| | | | |A| | |',
        '| |└|─|─|─|─|┘| | |',
      ].join('\n'))
    })

    it('preserves a single-lane destination slot during no-item public rotation recompute', () => {
      // GIVEN: one splitter lane feeds the assembler's explicit left input.
      // No simulation inventory is attached, so public rotation exercises the
      // same no-item automatic recomputation risk as move.
      factory.restoreState(
        [
          { x: 1, z: 3, type: 'splitter', rotation: 'east' },
          { x: 7, z: 3, type: 'assembler', rotation: 'east' },
        ],
        [
          {
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
        ],
      )
      expect(renderGrid(factory, 0, 2, 9, 4)).toBe([
        '| | | | | | | | | | |',
        '| |S| | | | | |A| | |',
        '| |└|─|─|─|─|─|┘| | |',
      ].join('\n'))
      const oldBelt = factory.getBelts()[0]
      const splitterId = oldBelt.sourceMachine.id
      const assembler = oldBelt.destinationMachine
      expect(oldBelt.sourceSlot).toBe('left')
      expect(oldBelt.destinationSlot).toBe('left')

      // WHEN: rotating the assembler triggers automatic recomputation with no
      // captured belt inventory.
      expect(factory.rotateMachine(assembler, 'north')).toBe(true)

      // THEN: because the exact left input is still reachable after rotation,
      // the recomputed belt must preserve that destination slot identity.
      expect(factory.getMachineAt(1, 3)!.rotation).toBe('east')
      expect(factory.getMachineAt(7, 3)!.rotation).toBe('north')

      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].sourceSlot).toBe('left')
      expect(belts[0].destinationSlot).toBe('left')
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
      ])
      expect(belts.some((belt) => belt.destinationSlot !== 'left')).toBe(false)
      expect(renderGrid(factory, 0, 2, 9, 4)).toBe([
        '| | | | | | | | | | |',
        '| |S| | | | | |A|┐| |',
        '| |└|─|─|─|─|─|─|┘| |',
      ].join('\n'))
    })

    it('removes a moved same-endpoint lane instead of reconnecting it through different slots', () => {
      // GIVEN: the splitter and assembler are connected by two explicit slot
      // lanes. The lower left/left lane is the regression case: public move
      // must not reconnect it through a different slot pair between the same
      // endpoint machines.
      const { oldRightBelt, oldLeftBelt } = placeBlockedTwoLaneSplitterAssemblerFixture(factory)
      const splitterId = oldRightBelt.sourceMachine.id
      const assemblerId = oldRightBelt.destinationMachine.id
      expect(oldRightBelt.sourceSlot).toBe('right')
      expect(oldRightBelt.destinationSlot).toBe('right')
      expect(oldLeftBelt.sourceMachine.id).toBe(splitterId)
      expect(oldLeftBelt.destinationMachine.id).toBe(assemblerId)
      expect(oldLeftBelt.sourceSlot).toBe('left')
      expect(oldLeftBelt.destinationSlot).toBe('left')

      // WHEN: moving the assembler triggers Factory's automatic belt
      // recomputation for both connected lanes.
      expect(factory.moveMachine(7, 3, 6, 3)).toBe(true)

      // THEN: only exact original slot-pair reconnections may remain. In this
      // compact fixture the right/right lane is recomputable and the left/left
      // lane is not, so the latter must be removed instead of replaced by a
      // front/back lane between the same endpoint machines.
      expect(renderGrid(factory, 0, 2, 8, 4)).toBe([
        '| |┌|─|─|─|─|┐| | |',
        '| |S| | |P| |A| | |',
        '| | | | | | | | | |',
      ].join('\n'))
      expect(factory.getMachineAt(1, 3)!.rotation).toBe('east')
      expect(factory.getMachineAt(4, 3)!.rotation).toBe('south')
      expect(factory.getMachineAt(6, 3)!.rotation).toBe('east')

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
          destinationMachineId: assemblerId,
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
            { x: 6, z: 3 },
          ],
        },
      ])
      expect(belts.some((belt) =>
        belt.sourceMachine.id === splitterId &&
        belt.destinationMachine.id === assemblerId &&
        belt.sourceSlot === 'front' &&
        belt.destinationSlot === 'back'
      )).toBe(false)
    })
  })
})
