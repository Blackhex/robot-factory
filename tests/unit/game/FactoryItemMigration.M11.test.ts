import { describe, it, expect, beforeEach } from 'vitest'
import { expectFactoryState } from '../helpers/factoryAssert'
import {
  attachSimToFactory,
  createMigrationTestContext,
  expectSimBeltsMatchFactory,
  findItemById,
  injectItem,
  orderedItemIdsOnFactoryBelt,
  populateSim,
  restoreEmptySiblingSplitterOutputFixture,
  type MigrationTestContext,
} from './helpers/FactoryItemMigrationHelpers'

// TODO: re-enable in Phase 2 — migration rewrite for one-item-per-belt
// Phase 2 RED: re-enabled.
describe('Factory belt edit during running simulation — item migration M11', () => {
  let factory: MigrationTestContext['factory']
  let sim: MigrationTestContext['sim']

  beforeEach(() => {
    ;({ factory, sim } = createMigrationTestContext())
  })

  describe('M11 — same-endpoint slot isolation includes empty removed lanes', () => {
    it('does not migrate a nonmatching removed inventory onto the replacement for its empty sibling lane', () => {
      // GIVEN: two lanes connect the same splitter/output endpoint pair.
      // The direct right-to-left lane is empty; the routed left-to-right lane carries one item.
      const { emptySiblingLane, nonmatchingLane } = restoreEmptySiblingSplitterOutputFixture(factory)
      expect(nonmatchingLane.path.some((cell) => cell.x === 1 && cell.z === 4)).toBe(true)
      expect(emptySiblingLane.path.some((cell) => cell.x === 1 && cell.z === 4)).toBe(false)

      populateSim(factory, sim)
      sim.start()
      const nonmatchingItemId = injectItem(sim, nonmatchingLane, 2, 0.0, 'sensor_camera')
      attachSimToFactory(factory, sim)

      // WHEN: both same-endpoint lanes are removed, but only the empty sibling's slot pair is recreated.
      expect(factory.removeBeltById(emptySiblingLane.id)).toBe(true)
      expect(factory.removeBeltById(nonmatchingLane.id)).toBe(true)
      const source = factory.getMachineAt(2, 3)!
      const destination = factory.getMachineAt(7, 3)!
      const replacedEmptySibling = factory.placeBeltChain(source, destination, 'output', {
        fixedRotations: true,
        sourceSlotPosition: 'right',
        targetSlotPosition: 'left',
      })
      expect(replacedEmptySibling).toBe(true)

      // THEN: the replacement exists for the empty right-to-left lane only.
      expectFactoryState(factory, {
        grid: {
          box: [0, 2, 9, 5],
          expected: [
            '| | | | | | | | | | |',
            '| | |S|─|─|─|─|O| | |',
            '| | | | | | | | | | |',
            '| | | | | | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 2, z: 3, rotation: 'south' },
          { x: 7, z: 3, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 2, z: 3 },
            destination: { x: 7, z: 3 },
            path: [
              { x: 2, z: 3 },
              { x: 3, z: 3 },
              { x: 4, z: 3 },
              { x: 5, z: 3 },
              { x: 6, z: 3 },
              { x: 7, z: 3 },
            ],
          },
        ],
      })
      const replacement = factory.getBelts()[0]
      expect(replacement.sourceSlot).toBe(emptySiblingLane.sourceSlot)
      expect(replacement.destinationSlot).toBe(emptySiblingLane.destinationSlot)
      expect(replacement.sourceSlot).not.toBe(nonmatchingLane.sourceSlot)
      expect(replacement.destinationSlot).not.toBe(nonmatchingLane.destinationSlot)
      expectSimBeltsMatchFactory(factory, sim)

      const replacementItemIds = orderedItemIdsOnFactoryBelt(sim, replacement)
      expect(replacementItemIds).not.toContain(nonmatchingItemId)
      expect(findItemById(sim, nonmatchingItemId)).toBeUndefined()
    })
  })
})
