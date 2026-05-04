import { describe, it, expect, beforeEach, vi } from 'vitest'
import { expectFactoryState } from '../helpers/factoryAssert'
import {
  createMigrationTestContext,
  expectSimBeltsMatchFactory,
  findItemById,
  populateSim,
  tickUntil,
  type MigrationTestContext,
} from './helpers/FactoryItemMigrationHelpers'

// TODO: re-enable in Phase 2 — migration rewrite for one-item-per-belt
// Phase 2 RED: re-enabled.
describe('Factory belt edit during running simulation — item migration M8', () => {
  let factory: MigrationTestContext['factory']
  let sim: MigrationTestContext['sim']

  beforeEach(() => {
    ;({ factory, sim } = createMigrationTestContext())
  })

  describe('M8 — moved destination receives the migrated in-flight item', () => {
    it('continues the same produced item toward a right-moved factory output instead of waiting for a replacement', () => {
      vi.useFakeTimers()
      try {
        // GIVEN: a running simulation with a fabricator feeding the right-hand destination.
        const fabricator = factory.placeMachine(0, 1, 'part_fabricator', 'south')!
        const output = factory.placeMachine(5, 1, 'factory_output', 'south')!
        expect(factory.placeBeltChain(fabricator, output)).toBe(true)
        expectFactoryState(factory, {
          grid: {
            box: [0, 0, 7, 2],
            expected: [
              '| | | | | | | | |',
              '|F|─|─|─|─|O| | |',
              '| | | | | | | | |',
            ].join('\n'),
          },
          machines: [
            { x: 0, z: 1, rotation: 'east' },

            { x: 5, z: 1, rotation: 'south' },
          ],
          belts: [
            {
              source: { x: 0, z: 1 },
              destination: { x: 5, z: 1 },
              path: [
                { x: 0, z: 1 },
                { x: 1, z: 1 },
                { x: 2, z: 1 },
                { x: 3, z: 1 },
                { x: 4, z: 1 },
                { x: 5, z: 1 },
              ],
            },
          ],
        })

        populateSim(factory, sim)
        factory.attachSimulation(sim)
        const producedItemIds: string[] = []
        const deliveredItemIds: string[] = []
        sim.on('item_produced', (event) => {
          producedItemIds.push(event.data.itemId as string)
        })
        sim.on('output_delivered', (event) => {
          deliveredItemIds.push(event.data.itemId as string)
        })
        sim.start()

        sim.enqueueCommand({
          type: 'SET_RECIPE',
          machineId: fabricator.id,
          recipeId: 'wheel_press_small',
        })
        sim.enqueueCommand({ type: 'START_MACHINE', machineId: fabricator.id })
        tickUntil(sim, () => producedItemIds.length === 1, 10)
        const producedItemId = producedItemIds[0]
        sim.enqueueCommand({ type: 'STOP_MACHINE', machineId: fabricator.id })
        sim.tick()

        tickUntil(sim, () => {
          const location = findItemById(sim, producedItemId)
          return location?.belt.fromX === 2 && location.belt.fromZ === 1
        }, 40)
        const beforeMoveLocation = findItemById(sim, producedItemId)
        expect(beforeMoveLocation, 'produced item is in flight before the move').toBeDefined()
        expect(beforeMoveLocation!.belt.fromX).toBe(2)
        expect(beforeMoveLocation!.belt.fromZ).toBe(1)
        expect(beforeMoveLocation!.item.type).toBe('wheel_small')

        // WHEN: the right/destination machine moves farther right and the belt is recomputed.
        expect(factory.moveMachine(5, 1, 7, 1)).toBe(true)

        // THEN: the recomputed belt still covers the old in-flight cell and points to the moved destination.
        expectFactoryState(factory, {
          grid: {
            box: [0, 0, 7, 2],
            expected: [
              '| | | | | | | | |',
              '|F|─|─|─|─|─|─|O|',
              '| | | | | | | | |',
            ].join('\n'),
          },
          machines: [
            { x: 0, z: 1, rotation: 'east' },
            { x: 7, z: 1, rotation: 'south' },
          ],
          belts: [
            {
              source: { x: 0, z: 1 },
              destination: { x: 7, z: 1 },
              path: [
                { x: 0, z: 1 },
                { x: 1, z: 1 },
                { x: 2, z: 1 },
                { x: 3, z: 1 },
                { x: 4, z: 1 },
                { x: 5, z: 1 },
                { x: 6, z: 1 },
                { x: 7, z: 1 },
              ],
            },
          ],
        })
        expectSimBeltsMatchFactory(factory, sim)
        const afterMoveLocation = findItemById(sim, producedItemId)
        expect(afterMoveLocation, 'same item survives on a current recomputed belt').toBeDefined()
        expect(afterMoveLocation!.belt.fromX).toBe(2)
        expect(afterMoveLocation!.belt.fromZ).toBe(1)
        expect(afterMoveLocation!.item.id).toBe(producedItemId)

        // THEN: after deterministic ticks, the moved destination receives that same item.
        tickUntil(sim, () => deliveredItemIds.includes(producedItemId), 80)
        const outputMachine = sim.getMachine(output.id)
        expect(outputMachine).toBeDefined()
        expect(outputMachine!.consumedItems).toBe(1)
        expect(sim.outputsDelivered).toBe(1)
        expect(deliveredItemIds).toEqual([producedItemId])
        expect(producedItemIds).toEqual([producedItemId])
        expect(findItemById(sim, producedItemId)).toBeUndefined()
      } finally {
        sim.stop()
        vi.useRealTimers()
      }
    })
  })
})
