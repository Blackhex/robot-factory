import { describe, it, expect, beforeEach } from 'vitest'
import {
  allItemsOnSimBelts,
  attachSimToFactory,
  createMigrationTestContext,
  expectBeltCoversCell,
  expectSimBeltsMatchFactory,
  expectSingleLaneExactSlotReplacementState,
  expectSingleLaneRemovedWithUnrelatedOverlapState,
  expectThreeLaneSplitterAssemblerInitialState,
  expectThreeLaneSplitterAssemblerRestoredLeftState,
  expectThreeLaneSplitterAssemblerRightOnlyState,
  expectThreeLaneSplitterAssemblerWithoutFrontState,
  findBeltByEndpointsAndSlots,
  findBeltBySlots,
  findItemById,
  injectItem,
  liveSimBeltItemSnapshot,
  orderedItemIdsOnFactoryBelt,
  placeThreeLaneSplitterAssemblerFixture,
  populateSim,
  restoreSingleLaneWithUnrelatedOverlapFixture,
  type MigrationTestContext,
  withFactoryEditBoundary,
} from './helpers/FactoryItemMigrationHelpers'

// TODO: re-enable in Phase 2 — migration rewrite for one-item-per-belt
// Phase 2 RED: re-enabled.
describe('Factory belt edit during running simulation — item migration M10 retained inventory', () => {
  let factory: MigrationTestContext['factory']
  let sim: MigrationTestContext['sim']

  beforeEach(() => {
    ;({ factory, sim } = createMigrationTestContext())
  })

  describe('M10 — retained exact-slot inventory', () => {
    it('does not migrate pure-remove inventory onto an unrelated belt that shares its old cell', () => {
      // GIVEN: a single same-endpoint lane has an item on a cell also covered
      // by an unrelated live belt. The unrelated belt shares a grid cell, but
      // not source/destination machine identity or slot identity.
      const { oldLeftBelt, unrelatedOverlappingBelt } = restoreSingleLaneWithUnrelatedOverlapFixture(factory)

      populateSim(factory, sim)
      sim.start()
      const removedId = injectItem(sim, oldLeftBelt, 3, 0, 'wheel_small')
      expect(oldLeftBelt.path[3]).toEqual({ x: 3, z: 4 })
      expectBeltCoversCell(unrelatedOverlappingBelt, { x: 3, z: 4 })
      expect(orderedItemIdsOnFactoryBelt(sim, oldLeftBelt)).toEqual([removedId])
      expect(orderedItemIdsOnFactoryBelt(sim, unrelatedOverlappingBelt)).toEqual([])
      attachSimToFactory(factory, sim)

      // WHEN: the old lane is removed without an exact identity-matched
      // replacement in the same edit.
      expect(factory.removeBeltById(oldLeftBelt.id)).toBe(true)

      // THEN: the item is absent from live belts instead of being migrated
      // onto the unrelated overlapping belt.
      expectSingleLaneRemovedWithUnrelatedOverlapState(factory)
      expectSimBeltsMatchFactory(factory, sim)
      expect(orderedItemIdsOnFactoryBelt(sim, unrelatedOverlappingBelt)).toEqual([])
      expect(findItemById(sim, removedId)).toBeUndefined()
      expect(allItemsOnSimBelts(sim).map((item) => item.id)).not.toContain(removedId)
    })

    it('keeps pure-remove inventory absent from unrelated overlapping belts before later exact-slot replacement', () => {
      // GIVEN: a single same-endpoint lane has an item on a cell also covered
      // by an unrelated live belt. Removing the lane has no exact identity-
      // matched replacement yet, so the item must not move to that unrelated
      // overlapping belt.
      const { splitter, assembler, oldLeftBelt, unrelatedOverlappingBelt } =
        restoreSingleLaneWithUnrelatedOverlapFixture(factory)

      populateSim(factory, sim)
      sim.start()
      const retainedId = injectItem(sim, oldLeftBelt, 3, 0, 'wheel_small')
      expect(oldLeftBelt.path[3]).toEqual({ x: 3, z: 4 })
      expectBeltCoversCell(unrelatedOverlappingBelt, { x: 3, z: 4 })
      expect(orderedItemIdsOnFactoryBelt(sim, oldLeftBelt)).toEqual([retainedId])
      expect(orderedItemIdsOnFactoryBelt(sim, unrelatedOverlappingBelt)).toEqual([])
      attachSimToFactory(factory, sim)

      // WHEN: public pure removal happens before a later public placement
      // recreates the exact slot match.
      expect(factory.removeBeltById(oldLeftBelt.id)).toBe(true)
      expectSingleLaneRemovedWithUnrelatedOverlapState(factory)
      expectSimBeltsMatchFactory(factory, sim)
      expect(orderedItemIdsOnFactoryBelt(sim, unrelatedOverlappingBelt)).toEqual([])
      expect(findItemById(sim, retainedId)).toBeUndefined()
      expect(allItemsOnSimBelts(sim).map((item) => item.id)).not.toContain(retainedId)

      expect(factory.placeBeltChain(splitter, assembler, 'output', {
        fixedRotations: true,
        sourceSlotPosition: 'left',
        targetSlotPosition: 'left',
      })).toBe(true)

      // THEN: only the later exact source/destination machine and slot match
      // can restore the retained item to a live belt.
      expectSingleLaneExactSlotReplacementState(factory)
      expectSimBeltsMatchFactory(factory, sim)
      const newLeftBelt = findBeltByEndpointsAndSlots(factory, splitter.id, assembler.id, 'left', 'left')
      expect(newLeftBelt.id).not.toBe(oldLeftBelt.id)
      expect(orderedItemIdsOnFactoryBelt(sim, unrelatedOverlappingBelt)).toEqual([])
      expect(orderedItemIdsOnFactoryBelt(sim, newLeftBelt)).toEqual([retainedId])
      expect(allItemsOnSimBelts(sim).filter((item) => item.id === retainedId)).toHaveLength(1)
    })

    it('flushes retained slot-matched inventory after unrelated removed inventory is queued', () => {
      // GIVEN: one unrelated belt plus three same-endpoint splitter lanes. The
      // left/left lane is removed together with another different slot-pair lane so it
      // is retained for a later exact replacement; the unrelated belt is then
      // removed before that later flush runs.
      const unrelatedSource = factory.placeMachine(0, 0, 'part_fabricator', 'south')!
      const unrelatedDestination = factory.placeMachine(2, 0, 'assembler', 'south')!
      expect(factory.placeBeltChain(unrelatedSource, unrelatedDestination)).toBe(true)
      const { splitter, assembler, oldFrontBelt, oldRightBelt, oldLeftBelt } =
        placeThreeLaneSplitterAssemblerFixture(factory, { includeUnrelatedBelt: true })
      const unrelatedBelt = factory.getBelts().find((belt) => belt.sourceMachine.id === unrelatedSource.id)!

      populateSim(factory, sim)
      sim.start()
      const discardedFrontId = injectItem(sim, oldFrontBelt, 3, 0, 'wheel_medium')
      const retainedLeftId = injectItem(sim, oldLeftBelt, 3, 0, 'wheel_small')
      const unrelatedRemovedId = injectItem(sim, unrelatedBelt, 1, 0, 'wheel_small')
      expect(oldFrontBelt.path[3]).toEqual({ x: 4, z: 3 })
      expect(oldLeftBelt.path[3]).toEqual({ x: 3, z: 4 })
      expect(unrelatedBelt.path[1]).toEqual({ x: 1, z: 0 })
      expect(orderedItemIdsOnFactoryBelt(sim, oldFrontBelt)).toEqual([discardedFrontId])
      expect(orderedItemIdsOnFactoryBelt(sim, oldLeftBelt)).toEqual([retainedLeftId])
      expect(orderedItemIdsOnFactoryBelt(sim, unrelatedBelt)).toEqual([unrelatedRemovedId])
      expect(orderedItemIdsOnFactoryBelt(sim, oldRightBelt)).toEqual([])
      attachSimToFactory(factory, sim)

      // WHEN: the retained lane is removed together with another different
      // same-endpoint slot-pair lane while the right/right endpoint belt remains, then
      // an unrelated belt is removed so its item remains unrelated when
      // the exact left/left replacement is placed later.
      withFactoryEditBoundary(factory, () => {
        expect(factory.removeBeltById(oldLeftBelt.id)).toBe(true)
        expect(factory.removeBeltById(oldFrontBelt.id)).toBe(true)
      })
      expect(factory.removeBeltById(unrelatedBelt.id)).toBe(true)
      expectThreeLaneSplitterAssemblerRightOnlyState(factory, true)
      expectSimBeltsMatchFactory(factory, sim)
      expect(findItemById(sim, retainedLeftId)).toBeUndefined()
      expect(findItemById(sim, discardedFrontId)).toBeUndefined()
      expect(findItemById(sim, unrelatedRemovedId)).toBeUndefined()

      expect(factory.placeBeltChain(splitter, assembler, 'output', {
        fixedRotations: true,
        sourceSlotPosition: 'left',
        targetSlotPosition: 'left',
      })).toBe(true)

      // THEN: the exact slot-matched replacement must claim the retained
      // removed inventory despite unrelated removed inventory being present.
      // The unrelated item remains unrelated to the replacement topology and
      // is dropped rather than placed onto the left/left lane.
      expectThreeLaneSplitterAssemblerRestoredLeftState(factory, true)
      expectSimBeltsMatchFactory(factory, sim)
      const newLeftBelt = findBeltBySlots(factory, 'left', 'left')
      expect(newLeftBelt.id).not.toBe(oldLeftBelt.id)
      expect(orderedItemIdsOnFactoryBelt(sim, newLeftBelt)).toEqual([retainedLeftId])
      expect(orderedItemIdsOnFactoryBelt(sim, oldRightBelt)).toEqual([])
      expect(findItemById(sim, discardedFrontId)).toBeUndefined()
      expect(findItemById(sim, unrelatedRemovedId)).toBeUndefined()
      expect(allItemsOnSimBelts(sim).map((item) => item.id)).toEqual([retainedLeftId])
    })

    it('does not flush retained inventory or move live sim items during canMoveMachine dry-run reconnection', () => {
      // GIVEN: three same-endpoint belts use distinct slot pairs. Removing the
      // front/back lane through public APIs creates retained migration state
      // because sibling endpoint belts still exist, while live items remain on
      // the current right/right and left/left belts.
      const { splitter, assembler, oldFrontBelt, oldRightBelt, oldLeftBelt } =
        placeThreeLaneSplitterAssemblerFixture(factory)

      populateSim(factory, sim)
      sim.start()
      const retainedFrontId = injectItem(sim, oldFrontBelt, 3, 0, 'wheel_medium')
      const liveRightId = injectItem(sim, oldRightBelt, 3, 0, 'wheel_small')
      const liveLeftId = injectItem(sim, oldLeftBelt, 3, 0, 'wheel_small')
      expect(oldFrontBelt.path[3]).toEqual({ x: 4, z: 3 })
      expect(orderedItemIdsOnFactoryBelt(sim, oldFrontBelt)).toEqual([retainedFrontId])
      expect(orderedItemIdsOnFactoryBelt(sim, oldRightBelt)).toEqual([liveRightId])
      expect(orderedItemIdsOnFactoryBelt(sim, oldLeftBelt)).toEqual([liveLeftId])
      attachSimToFactory(factory, sim)

      expect(factory.removeBeltById(oldFrontBelt.id)).toBe(true)
      expectThreeLaneSplitterAssemblerWithoutFrontState(factory)
      expectSimBeltsMatchFactory(factory, sim)
      expect(findItemById(sim, retainedFrontId)).toBeUndefined()
      expect(orderedItemIdsOnFactoryBelt(sim, oldRightBelt)).toEqual([liveRightId])
      expect(orderedItemIdsOnFactoryBelt(sim, oldLeftBelt)).toEqual([liveLeftId])
      const liveItemsBeforeValidation = liveSimBeltItemSnapshot(sim)

      // WHEN: validation previews moving the assembler and exercises the
      // connected-belt dry-run removal/reconnection path. This must be a pure
      // validation pass: no retained state may flush, and no live sim item may
      // be inserted, dropped, or moved.
      expect(factory.canMoveMachine(7, 3, 6, 3)).toBe(true)

      // THEN: factory topology and live sim items are unchanged after the dry
      // run, and the retained front item is still absent from live belts until
      // a real matching edit occurs.
      expectThreeLaneSplitterAssemblerWithoutFrontState(factory)
      expectSimBeltsMatchFactory(factory, sim)
      expect(liveSimBeltItemSnapshot(sim)).toEqual(liveItemsBeforeValidation)
      expect(findItemById(sim, retainedFrontId)).toBeUndefined()

      expect(factory.placeBeltChain(splitter, assembler, 'output', {
        fixedRotations: true,
        sourceSlotPosition: 'front',
        targetSlotPosition: 'back',
      })).toBe(true)

      // THEN: the later real front/back replacement still owns the retained
      // state and flushes it exactly once.
      expectThreeLaneSplitterAssemblerInitialState(factory)
      expectSimBeltsMatchFactory(factory, sim)
      const newFrontBelt = findBeltByEndpointsAndSlots(factory, splitter.id, assembler.id, 'front', 'back')
      expect(newFrontBelt.id).not.toBe(oldFrontBelt.id)
      expect(orderedItemIdsOnFactoryBelt(sim, newFrontBelt)).toEqual([retainedFrontId])
      expect(orderedItemIdsOnFactoryBelt(sim, oldRightBelt)).toEqual([liveRightId])
      expect(orderedItemIdsOnFactoryBelt(sim, oldLeftBelt)).toEqual([liveLeftId])
      expect(allItemsOnSimBelts(sim).map((item) => item.id).sort()).toEqual([
        liveLeftId,
        liveRightId,
        retainedFrontId,
      ].sort())
    })
  })
})
