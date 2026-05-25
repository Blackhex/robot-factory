import { describe, it, expect, beforeEach } from 'vitest'
import {
  allItemsOnSimBelts,
  attachSimToFactory,
  createMigrationTestContext,
  expectBlockedTwoLaneSplitterAssemblerMovedExactSlotState,
  expectSimBeltsMatchFactory,
  expectThreeLaneSplitterAssemblerRestoredLeftState,
  expectThreeLaneSplitterAssemblerRightOnlyState,
  findBeltBySlots,
  findItemById,
  injectItem,
  orderedItemIdsOnFactoryBelt,
  placeBlockedTwoLaneSplitterAssemblerFixture,
  placeThreeLaneSplitterAssemblerFixture,
  populateSim,
  type MigrationTestContext,
  withFactoryEditBoundary,
} from './helpers/FactoryItemMigrationHelpers'

// TODO: re-enable in Phase 2 — migration rewrite for one-item-per-belt
// Phase 2 RED: re-enabled.
describe('Factory belt edit during running simulation — item migration M10 inventory', () => {
  let factory: MigrationTestContext['factory']
  let sim: MigrationTestContext['sim']

  beforeEach(() => {
    ;({ factory, sim } = createMigrationTestContext())
  })

  describe('M10 — slot-matched inventory migration', () => {
    it('migrates slot-matched inventory and removes non-recomputable same-endpoint lanes during public move', () => {
      // GIVEN: a splitter and assembler have two same-endpoint belts through
      // different slot pairs. A blocker in the center row leaves only the
      // right/right lane recomputable with exact slot identity after the move.
      const { oldRightBelt, oldLeftBelt } = placeBlockedTwoLaneSplitterAssemblerFixture(factory)

      populateSim(factory, sim)
      sim.start()
      const rightSlotIds = [
        injectItem(sim, oldRightBelt, 0, 0, 'wheel_small'),
        // Use a segment index that fits within the post-move chain so
        // source-anchored projection retains the item; this test exercises
        // slot-matched migration, not segment-overflow handling.
        injectItem(sim, oldRightBelt, 6, 0, 'wheel_small'),
      ]
      expect(orderedItemIdsOnFactoryBelt(sim, oldRightBelt)).toEqual(rightSlotIds)
      expect(orderedItemIdsOnFactoryBelt(sim, oldLeftBelt)).toEqual([])
      attachSimToFactory(factory, sim)

      // WHEN: the public move operation removes both old same-endpoint belts
      // and reconnects only lanes whose source/destination slots can be
      // preserved exactly.
      expect(factory.moveMachine(7, 3, 6, 3)).toBe(true)

      // THEN: only the exact right/right lane remains; the left/left lane is
      // removed instead of being reconnected through different slots.
      expectBlockedTwoLaneSplitterAssemblerMovedExactSlotState(factory)
      expectSimBeltsMatchFactory(factory, sim)
      const newRightBelt = findBeltBySlots(factory, 'right', 'right')
      expect(newRightBelt.id).not.toBe(oldRightBelt.id)
      expect(factory.getBelts().some((belt) => belt.sourceSlot === 'left' && belt.destinationSlot === 'left')).toBe(false)
      expect(factory.getBelts().some((belt) => belt.sourceSlot === 'front' && belt.destinationSlot === 'back')).toBe(false)

      // THEN: the right-slot inventory migrates to its exact-slot successor.
      expect(orderedItemIdsOnFactoryBelt(sim, newRightBelt)).toEqual(rightSlotIds)
      expect(orderedItemIdsOnFactoryBelt(sim, oldLeftBelt)).toEqual([])
      expect(allItemsOnSimBelts(sim).map((item) => item.id).sort()).toEqual(rightSlotIds.sort())
    })

    it('discards inventory from a same-endpoint lane whose exact slots cannot be recomputed', () => {
      // GIVEN: a splitter and assembler have two same-endpoint belts through
      // different slot pairs. The item on the old left/left inventory must not
      // move to any surviving lane unless that exact slot pair is preserved.
      const { oldRightBelt, oldLeftBelt } = placeBlockedTwoLaneSplitterAssemblerFixture(factory)

      populateSim(factory, sim)
      sim.start()
      const rightSlotIds = [
        injectItem(sim, oldRightBelt, 0, 0, 'wheel_small'),
        // Use a segment index that fits within the post-move chain so
        // source-anchored projection retains the item; this test exercises
        // discard semantics for the unrecomputable left lane, not overflow.
        injectItem(sim, oldRightBelt, 6, 0, 'wheel_small'),
      ]
      const removedLeftId = injectItem(sim, oldLeftBelt, 3, 0, 'wheel_small')
      expect(oldLeftBelt.path[3]).toEqual({ x: 3, z: 4 })
      expect(orderedItemIdsOnFactoryBelt(sim, oldRightBelt)).toEqual(rightSlotIds)
      expect(orderedItemIdsOnFactoryBelt(sim, oldLeftBelt)).toEqual([removedLeftId])
      attachSimToFactory(factory, sim)

      // WHEN: the public move operation removes both old same-endpoint belts
      // and creates only exact-slot successors.
      expect(factory.moveMachine(7, 3, 6, 3)).toBe(true)

      // THEN: final topology contains only the recomputed right/right lane.
      expectBlockedTwoLaneSplitterAssemblerMovedExactSlotState(factory)
      expectSimBeltsMatchFactory(factory, sim)
      const newRightBelt = findBeltBySlots(factory, 'right', 'right')
      expect(factory.getBelts().some((belt) => belt.sourceSlot === 'left' && belt.destinationSlot === 'left')).toBe(false)
      expect(factory.getBelts().some((belt) => belt.sourceSlot === 'front' && belt.destinationSlot === 'back')).toBe(false)

      // THEN: only the slot-matched right/right inventory reaches the right
      // successor, and the left/left id is discarded because that exact lane
      // was removed.
      expect(orderedItemIdsOnFactoryBelt(sim, newRightBelt)).toEqual(rightSlotIds)
      expect(findItemById(sim, removedLeftId)).toBeUndefined()
      expect(allItemsOnSimBelts(sim).map((item) => item.id).sort()).toEqual([...rightSlotIds].sort())
    })

    it('flushes retained removed inventory after unrelated overlap rejection with an existing endpoint belt', () => {
      // GIVEN: three same-endpoint belts use distinct slot pairs.
      const { splitter, assembler, oldFrontBelt, oldRightBelt, oldLeftBelt } =
        placeThreeLaneSplitterAssemblerFixture(factory)

      populateSim(factory, sim)
      sim.start()
      const discardedFrontId = injectItem(sim, oldFrontBelt, 3, 0, 'wheel_small')
      const retainedLeftId = injectItem(sim, oldLeftBelt, 3, 0, 'wheel_small')
      expect(oldFrontBelt.path[3]).toEqual({ x: 4, z: 3 })
      expect(oldLeftBelt.path[3]).toEqual({ x: 3, z: 4 })
      expect(orderedItemIdsOnFactoryBelt(sim, oldFrontBelt)).toEqual([discardedFrontId])
      expect(orderedItemIdsOnFactoryBelt(sim, oldLeftBelt)).toEqual([retainedLeftId])
      expect(orderedItemIdsOnFactoryBelt(sim, oldRightBelt)).toEqual([])
      attachSimToFactory(factory, sim)

      // WHEN: two different slot-pair belts are removed in one pure edit
      // while the right/right endpoint belt remains. Public removeBeltById()
      // flushes each belt independently, so this focused regression uses the
      // private edit boundary to create retained inventory that the later
      // public placement must restore only through exact-slot replacement.
      withFactoryEditBoundary(factory, () => {
        expect(factory.removeBeltById(oldLeftBelt.id)).toBe(true)
        expect(factory.removeBeltById(oldFrontBelt.id)).toBe(true)
      })
      expectThreeLaneSplitterAssemblerRightOnlyState(factory)
      expectSimBeltsMatchFactory(factory, sim)
      expect(orderedItemIdsOnFactoryBelt(sim, oldRightBelt)).toEqual([])
      expect(findItemById(sim, discardedFrontId)).toBeUndefined()
      expect(findItemById(sim, retainedLeftId)).toBeUndefined()

      expect(factory.placeBeltChain(splitter, assembler, 'output', {
        fixedRotations: true,
        sourceSlotPosition: 'left',
        targetSlotPosition: 'left',
      })).toBe(true)

      // THEN: the later matching replacement must flush the retained removed
      // inventory even though the pure removal edit rejected unrelated
      // overlap as a migration target.
      expectThreeLaneSplitterAssemblerRestoredLeftState(factory)
      expectSimBeltsMatchFactory(factory, sim)
      const newLeftBelt = findBeltBySlots(factory, 'left', 'left')
      expect(newLeftBelt.id).not.toBe(oldLeftBelt.id)
      expect(orderedItemIdsOnFactoryBelt(sim, newLeftBelt)).toEqual([retainedLeftId])
      expect(orderedItemIdsOnFactoryBelt(sim, oldRightBelt)).toEqual([])
      expect(findItemById(sim, discardedFrontId)).toBeUndefined()
      expect(allItemsOnSimBelts(sim).map((item) => item.id)).toEqual([retainedLeftId])
    })
  })
})
