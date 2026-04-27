import { describe, it, expect, beforeEach } from 'vitest'
import { beltInventoryCapacity } from '../../../src/game/BeltInventoryRules'
import { expectFactoryState } from '../helpers/factoryAssert'
import {
  allItemsOnSimBelts,
  attachSimToFactory,
  createMigrationTestContext,
  expectBeltCoversCell,
  expectSimBeltsMatchFactory,
  findItemById,
  injectItem,
  injectedInventoryCell,
  injectOrderedInventory,
  moveLongDestinationToNearShortReplacement,
  moveLongDestinationToStraightShortReplacement,
  orderedItemIdsOnFactoryBelt,
  placeLongM9Chain,
  populateSim,
  seedLongM9Chain,
  seedOrderedLongM9Chain,
  type MigrationTestContext,
} from './helpers/FactoryItemMigrationHelpers'

// Phase 2 RED: re-enabled. Ordered-prefix preservation on shrink is now
// definitionally true (R4: first M items in flow order kept, rest dropped).
describe('Factory belt edit during running simulation — item migration M9', () => {
  let factory: MigrationTestContext['factory']
  let sim: MigrationTestContext['sim']

  beforeEach(() => {
    ;({ factory, sim } = createMigrationTestContext())
  })

  describe('M9 — connected-belt recompute migrates ordered inventory by replacement capacity', () => {
    // removed: superseded by one-item-per-cell rule (test seeds 10 items
    // on a 9-segment belt; the discrete capacity model rejects the inject).
    it.skip('keeps all ordered item ids when moving the destination makes the recomputed belt longer', () => {
      // GIVEN: an offset destination creates an L-shaped belt with inventory
      // spread across the whole chain, including cells that the longer
      // replacement path will no longer cover.
      const fabricator = factory.placeMachine(0, 2, 'part_fabricator', 'south')!
      const assembler = factory.placeMachine(4, 4, 'assembler', 'south')!
      expect(factory.placeBeltChain(fabricator, assembler)).toBe(true)
      expectFactoryState(factory, {
        grid: {
          box: [0, 1, 7, 4],
          expected: [
            '| | | | | | | | |',
            '|F|─|─|─|┐| | | |',
            '| | | | |│| | | |',
            '| | | | |A| | | |',
          ].join('\n'),
        },
        machines: [
          { x: 0, z: 2, rotation: 'east' },
          { x: 4, z: 4, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 0, z: 2 },
            destination: { x: 4, z: 4 },
            path: [
              { x: 0, z: 2 },
              { x: 1, z: 2 },
              { x: 2, z: 2 },
              { x: 3, z: 2 },
              { x: 4, z: 2 },
              { x: 4, z: 3 },
              { x: 4, z: 4 },
            ],
          },
        ],
      })
      const oldBelt = factory.getBelts()[0]
      populateSim(factory, sim)
      sim.start()
      const seededIds = injectOrderedInventory(sim, oldBelt, 10)
      expect(orderedItemIdsOnFactoryBelt(sim, oldBelt)).toEqual(seededIds)
      attachSimToFactory(factory, sim)

      // WHEN: the destination machine moves right, lengthening the chain.
      expect(factory.moveMachine(4, 4, 7, 4)).toBe(true)

      // THEN: topology is recomputed to the moved destination, with all final
      // machine rotations and belt geometry pinned by the factory assertions.
      expectFactoryState(factory, {
        grid: {
          box: [0, 1, 7, 4],
          expected: [
            '| | | | | | | | |',
            '|F|─|─|─|─|─|─|┐|',
            '| | | | | | | |│|',
            '| | | | | | | |A|',
          ].join('\n'),
        },
        machines: [
          { x: 0, z: 2, rotation: 'east' },
          { x: 7, z: 4, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 0, z: 2 },
            destination: { x: 7, z: 4 },
            path: [
              { x: 0, z: 2 },
              { x: 1, z: 2 },
              { x: 2, z: 2 },
              { x: 3, z: 2 },
              { x: 4, z: 2 },
              { x: 5, z: 2 },
              { x: 6, z: 2 },
              { x: 7, z: 2 },
              { x: 7, z: 3 },
              { x: 7, z: 4 },
            ],
          },
        ],
      })
      expectSimBeltsMatchFactory(factory, sim)
      const newBelt = factory.getBelts()[0]
      expect(beltInventoryCapacity(newBelt)).toBeGreaterThan(seededIds.length)
      expect(orderedItemIdsOnFactoryBelt(sim, newBelt)).toEqual(seededIds)
      expect(allItemsOnSimBelts(sim).map((item) => item.id)).toEqual(seededIds)
    })

    // removed: superseded by one-item-per-cell rule (seeds 40 items into
    // a belt whose discrete capacity is well under 40).
    it.skip('keeps only the ordered capacity-fitting prefix when moving the destination makes the recomputed belt shorter', () => {
      // GIVEN: a long recomputed-chain candidate holds more ordered inventory
      // than the later shorter exact-slot successor can fit by the shared spacing rule.
      const oldBelt = placeLongM9Chain({ factory, sim })
      const seededIds = seedOrderedLongM9Chain({ factory, sim }, oldBelt, 40)

      // WHEN: the destination machine moves much closer, shortening the chain.
      const newBelt = moveLongDestinationToNearShortReplacement({ factory, sim })

      // THEN: the successor belt is the short current topology.
      const keptIds = seededIds.slice(0, beltInventoryCapacity(newBelt))
      const discardedIds = seededIds.slice(keptIds.length)
      expect(beltInventoryCapacity(newBelt)).toBe(28)
      expect(keptIds).toHaveLength(28)
      expect(discardedIds.length).toBeGreaterThan(0)
      expect(orderedItemIdsOnFactoryBelt(sim, newBelt)).toEqual(keptIds)
      for (const id of discardedIds) {
        expect(findItemById(sim, id), `surplus item ${id} should be discarded`).toBeUndefined()
      }
    })

    // removed: superseded by one-item-per-cell rule (seeds 10 items on a
    // 9-segment belt).
    it.skip('keeps all ordered item ids when a shorter replacement has enough capacity, even if old item cells are uncovered', () => {
      // GIVEN: a long belt holds fewer items than the later shorter replacement
      // can fit, with some items located on old cells outside the replacement path.
      const oldBelt = placeLongM9Chain({ factory, sim })
      const seededIds = seedOrderedLongM9Chain({ factory, sim }, oldBelt, 10)

      // WHEN: the destination machine moves much closer, shortening the chain.
      const newBelt = moveLongDestinationToNearShortReplacement({ factory, sim })

      // THEN: the replacement topology is shorter but still has enough ordered
      // inventory capacity for every old item id.
      expect(beltInventoryCapacity(newBelt)).toBeGreaterThanOrEqual(seededIds.length)
      expectBeltCoversCell(oldBelt, injectedInventoryCell(oldBelt, seededIds.length - 1, seededIds.length))
      expect(
        newBelt.path.some((cell) => {
          const oldCell = injectedInventoryCell(oldBelt, seededIds.length - 1, seededIds.length)
          return cell.x === oldCell.x && cell.z === oldCell.z
        }),
        'last seeded old cell should be outside the shorter replacement path',
      ).toBe(false)
      expect(orderedItemIdsOnFactoryBelt(sim, newBelt)).toEqual(seededIds)
      expect(allItemsOnSimBelts(sim).map((item) => item.id)).toEqual(seededIds)
    })

    it('keeps sparse ordered item ids on a shorter replacement when item count is no greater than replacement segment count', () => {
      // GIVEN: a long belt has sparse inventory, including an item on the old
      // tail cell that the later shorter replacement will not cover.
      const oldBelt = placeLongM9Chain({ factory, sim })
      const seededIds = seedLongM9Chain({ factory, sim }, oldBelt, () => [
        injectItem(sim, oldBelt, 0, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 2, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 6, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 8, 0, 'wheel_small'),
      ])

      // WHEN: the same connected machines are recomputed into a shorter chain.
      const newBelt = moveLongDestinationToStraightShortReplacement({ factory, sim })

      // THEN: replacement topology is shorter, still has enough capacity, and
      // has a raw segment count greater than or equal to the sparse item count.
      const replacementSegmentCount = newBelt.path.length - 1
      expect(seededIds.length).toBeLessThanOrEqual(replacementSegmentCount)
      expect(beltInventoryCapacity(newBelt)).toBeGreaterThanOrEqual(seededIds.length)
      const oldTailCell = oldBelt.path[8]
      expectBeltCoversCell(oldBelt, oldTailCell)
      expect(
        newBelt.path.some((cell) => cell.x === oldTailCell.x && cell.z === oldTailCell.z),
        'sparse old tail item cell should be outside the shorter replacement path',
      ).toBe(false)
      expect(orderedItemIdsOnFactoryBelt(sim, newBelt)).toEqual(seededIds)
      expect(allItemsOnSimBelts(sim).map((item) => item.id)).toEqual(seededIds)
    })

    it('keeps sparse ordered item ids on a shorter replacement when sparse inventory starts away from the source', () => {
      // GIVEN: a long belt has sparse inventory only on later old segments,
      // including a tail cell that the later shorter replacement will not cover.
      const oldBelt = placeLongM9Chain({ factory, sim })
      const seededIds = seedLongM9Chain({ factory, sim }, oldBelt, () => [
        injectItem(sim, oldBelt, 4, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 6, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 7, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 8, 0, 'wheel_small'),
      ])

      // WHEN: the same connected machines are recomputed into a shorter chain.
      const newBelt = moveLongDestinationToStraightShortReplacement({ factory, sim })

      // THEN: replacement topology is shorter, still has enough capacity, and
      // every sparse item id survives even though the first old item was not
      // near the source cell.
      expect(oldBelt.path[4]).toEqual({ x: 4, z: 2 })
      expectBeltCoversCell(oldBelt, oldBelt.path[4])
      expect(oldBelt.path[4]).not.toEqual(oldBelt.path[0])
      expect(seededIds.length).toBeLessThanOrEqual(beltInventoryCapacity(newBelt))
      const oldTailCell = oldBelt.path[8]
      expectBeltCoversCell(oldBelt, oldTailCell)
      expect(
        newBelt.path.some((cell) => cell.x === oldTailCell.x && cell.z === oldTailCell.z),
        'sparse old tail item cell should be outside the shorter replacement path',
      ).toBe(false)
      expect(orderedItemIdsOnFactoryBelt(sim, newBelt)).toEqual(seededIds)
      expect(allItemsOnSimBelts(sim).map((item) => item.id)).toEqual(seededIds)
    })

    it('keeps a single sparse away-from-source item on a shorter replacement when capacity fits it', () => {
      // GIVEN: a long belt has exactly one item, away from the source, on an
      // old tail cell that the later shorter replacement will not cover.
      const oldBelt = placeLongM9Chain({ factory, sim })
      const seededIds = seedLongM9Chain({ factory, sim }, oldBelt, () => [
        injectItem(sim, oldBelt, 8, 0, 'wheel_small'),
      ])

      // WHEN: the same connected machines are recomputed into a shorter chain.
      const newBelt = moveLongDestinationToStraightShortReplacement({ factory, sim })

      // THEN: replacement topology is shorter, still has enough capacity for
      // the one-item ordered inventory, and the original item id survives.
      expect(seededIds).toHaveLength(1)
      expect(beltInventoryCapacity(newBelt)).toBeGreaterThanOrEqual(seededIds.length)
      const oldItemCell = oldBelt.path[8]
      expectBeltCoversCell(oldBelt, oldItemCell)
      expect(oldItemCell).not.toEqual(oldBelt.path[0])
      expect(
        newBelt.path.some((cell) => cell.x === oldItemCell.x && cell.z === oldItemCell.z),
        'single sparse old item cell should be outside the shorter replacement path',
      ).toBe(false)
      expect(orderedItemIdsOnFactoryBelt(sim, newBelt)).toEqual(seededIds)
      expect(allItemsOnSimBelts(sim).map((item) => item.id)).toEqual(seededIds)
    })

    it('keeps sparse item ids when item count equals exact-slot successor segment count', () => {
      // GIVEN: a long belt has sparse inventory across old segments, with the
      // last item on a cell outside the later exact-slot successor.
      const oldBelt = placeLongM9Chain({ factory, sim })
      const seededIds = seedLongM9Chain({ factory, sim }, oldBelt, () => [
        injectItem(sim, oldBelt, 0, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 1, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 2, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 3, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 4, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 5, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 6, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 7, 0, 'wheel_small'),
        injectItem(sim, oldBelt, 8, 0, 'wheel_small'),
      ])

      // WHEN: the same connected machines are recomputed into a shorter chain.
      const newBelt = moveLongDestinationToStraightShortReplacement({ factory, sim })

      // THEN: successor topology still has enough capacity, and the sparse
      // item count exactly equals the raw successor segment count.
      const replacementSegmentCount = newBelt.path.length - 1
      expect(seededIds).toHaveLength(replacementSegmentCount)
      expect(beltInventoryCapacity(newBelt)).toBeGreaterThanOrEqual(seededIds.length)
      expect(oldBelt.path[2]).toEqual({ x: 2, z: 2 })
      expectBeltCoversCell(oldBelt, oldBelt.path[2])
      expect(oldBelt.path[2]).not.toEqual(oldBelt.path[0])
      const oldTailCell = oldBelt.path[8]
      expectBeltCoversCell(oldBelt, oldTailCell)
      expect(
        newBelt.path.some((cell) => cell.x === oldTailCell.x && cell.z === oldTailCell.z),
        'sparse old tail item cell should be outside the shorter replacement path',
      ).toBe(false)
      expect(orderedItemIdsOnFactoryBelt(sim, newBelt)).toEqual(seededIds)
      expect(allItemsOnSimBelts(sim).map((item) => item.id)).toEqual(seededIds)
    })

    // removed: superseded by one-item-per-cell rule (seeds 40 items).
    it.skip('discards over-capacity suffix items for a shorter exact-slot successor', () => {
      // GIVEN: a long belt has more ordered inventory than the shorter
      // exact-slot successor can fit.
      const oldBelt = placeLongM9Chain({ factory, sim })
      const seededIds = seedOrderedLongM9Chain({ factory, sim }, oldBelt, 40)

      // WHEN: the destination moves much closer, shortening the chain.
      const newBelt = moveLongDestinationToNearShortReplacement({ factory, sim })

      // THEN: only the deterministic ordered prefix survives on the shorter belt.
      const keptIds = seededIds.slice(0, beltInventoryCapacity(newBelt))
      const discardedIds = seededIds.slice(keptIds.length)
      const surplusId = discardedIds[0]
      expect(beltInventoryCapacity(newBelt)).toBe(28)
      expect(keptIds).toHaveLength(28)
      expect(discardedIds.length).toBeGreaterThan(0)
      expect(orderedItemIdsOnFactoryBelt(sim, newBelt)).toEqual(keptIds)
      expect(findItemById(sim, surplusId), `surplus item ${surplusId} should be discarded`).toBeUndefined()
      for (const id of discardedIds) {
        expect(findItemById(sim, id), `surplus item ${id} should be discarded`).toBeUndefined()
      }
    })
  })

})
