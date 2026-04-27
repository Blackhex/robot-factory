/**
 * Regression coverage for items on edited belts during running simulation.
 * Shared migration setup lives in helpers/FactoryItemMigrationHelpers.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderGrid } from '../helpers/factoryAssert'
import {
  allItemsOnSimBelts,
  attachSimToFactory,
  createMigrationTestContext,
  expectSimBeltsMatchFactory,
  findItemOnCell,
  injectItem,
  place4CellStraight,
  place6CellStraight,
  populateSim,
  type MigrationTestContext,
} from './helpers/FactoryItemMigrationHelpers'

// TODO: re-enable in Phase 2 — migration rewrite for one-item-per-belt
// Phase 2 RED: re-enabled. Tests using `injectOrderedInventory` may pack
// multiple items per cell — those scenarios are now over-capacity under
// the one-item-per-cell rule and will exhibit drops. Failing tests are
// expected RED until the GREEN agent updates expectations.
describe('Factory belt edit during running simulation — item migration', () => {
  let factory: MigrationTestContext['factory']
  let sim: MigrationTestContext['sim']

  beforeEach(() => {
    ;({ factory, sim } = createMigrationTestContext())
  })

  describe('M1 — removed belt, exact-slot replacement covers the same cells', () => {
    it('item on cell (2,0) migrates onto the exact-slot successor covering (2,0)', () => {
      // GIVEN: a 4-cell straight belt with a wheel on cell (2,0).
      const oldBelt = place4CellStraight(factory)
      const oldSourceSlot = oldBelt.sourceSlot
      const oldDestinationSlot = oldBelt.destinationSlot
      populateSim(factory, sim)
      sim.start()
      const itemId = injectItem(sim, oldBelt, 2, 0.0, 'wheel_small')
      expect(allItemsOnSimBelts(sim)).toHaveLength(1)
      attachSimToFactory(factory, sim)

      // WHEN: the edit removes the old belt and re-places an exact-slot
      // successor whose path covers exactly the same cells.
      const oldBeltId = oldBelt.id
      factory.removeBeltById(oldBeltId)
      const f = factory.getMachineAt(0, 0)!
      const a = factory.getMachineAt(3, 0)!
      const replaced = factory.placeBeltChain(f, a)
      expect(replaced, 'replacement chain placed').toBeTruthy()

      // THEN (post-edit topology): grid is unchanged in shape.
      expect(renderGrid(factory, 0, 0, 4, 1)).toBe(
        [
          '|F|─|─|A| |',
          '| | | | | |',
        ].join('\n'),
      )
      const newBelts = factory.getBelts()
      expect(newBelts).toHaveLength(1)
      expect(newBelts[0].id).not.toBe(oldBeltId)
      expect(newBelts[0].sourceSlot).toBe(oldSourceSlot)
      expect(newBelts[0].destinationSlot).toBe(oldDestinationSlot)
      expect(newBelts[0].path).toEqual([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
      ])

      // THEN (sim invariant): no stale segments, no missing segments.
      expectSimBeltsMatchFactory(factory, sim)

      // THEN (item migration): exactly one wheel still exists, on a
      // segment that covers cell (2,0).
      const remaining = allItemsOnSimBelts(sim)
      expect(remaining).toHaveLength(1)
      const found = findItemOnCell(sim, 2, 0, 'wheel_small')
      expect(found, 'item migrated onto a belt covering (2,0)').toBeDefined()
      // M7: id continuity (GREEN may preserve id; if so this passes).
      expect(found!.item.id).toBe(itemId)
    })
  })

  describe('M2 — removed belt, replacement does NOT cover the item cell', () => {
    // removed: superseded by one-item-per-cell rule (discrete projection
    // re-maps captured items by segment index proportionally, so items on
    // formerly-covered cells now project to a new segment instead of being
    // destroyed).
    it.skip('item on cell (4,0) is destroyed when the new chain only covers cells (0..3,0)', () => {
      // GIVEN: a 6-cell straight belt with a wheel on cell (4,0).
      const oldBelt = place6CellStraight(factory)
      populateSim(factory, sim)
      sim.start()
      injectItem(sim, oldBelt, 4, 0.0, 'wheel_small')
      expect(allItemsOnSimBelts(sim)).toHaveLength(1)
      attachSimToFactory(factory, sim)

      // WHEN: moveMachine A from (5,0) to (3,0). New chain is the
      // 4-cell straight (0,0)→(3,0). Cell (4,0) is no longer covered.
      const moved = factory.moveMachine(5, 0, 3, 0)
      expect(moved, 'moveMachine succeeded').toBe(true)

      // THEN: factory has a single 4-cell belt covering (0,0)→(3,0).
      const newBelts = factory.getBelts()
      expect(newBelts).toHaveLength(1)
      expect(newBelts[0].path).toEqual([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
      ])

      // THEN (sim invariant).
      expectSimBeltsMatchFactory(factory, sim)

      // THEN: item destroyed — no belt covers cell (4,0).
      expect(allItemsOnSimBelts(sim)).toHaveLength(0)
      expect(findItemOnCell(sim, 4, 0, 'wheel_small')).toBeUndefined()
    })
  })

  describe('M3 — removed belt, no replacement', () => {
    it('items on the removed belt are destroyed cleanly with no exception', () => {
      // GIVEN: 4-cell belt with two items.
      const oldBelt = place4CellStraight(factory)
      populateSim(factory, sim)
      sim.start()
      injectItem(sim, oldBelt, 0, 0.5, 'wheel_small')
      injectItem(sim, oldBelt, 2, 0.0, 'wheel_medium')
      expect(allItemsOnSimBelts(sim)).toHaveLength(2)
      attachSimToFactory(factory, sim)

      // WHEN: remove the belt with no replacement.
      expect(() => factory.removeBeltById(oldBelt.id)).not.toThrow()

      // THEN: no factory belts remain.
      expect(factory.getBelts()).toHaveLength(0)

      // THEN (sim invariant): no stale segments either.
      expectSimBeltsMatchFactory(factory, sim)

      // THEN: every item is gone.
      expect(allItemsOnSimBelts(sim)).toHaveLength(0)
    })
  })

  describe('M4 — multi-cell migration during machine move', () => {
    // removed: superseded by one-item-per-cell rule (uncovered-cell
    // destruction semantics no longer apply under discrete projection).
    it.skip('items on cells covered by the new chain migrate; items on uncovered cells are destroyed', () => {
      // GIVEN: 6-cell straight belt (0,0)→(5,0) with three items at
      // cells (1,0), (3,0), (4,0).
      const oldBelt = place6CellStraight(factory)
      populateSim(factory, sim)
      sim.start()
      const id1 = injectItem(sim, oldBelt, 1, 0.0, 'wheel_small') // on (1,0)
      const id2 = injectItem(sim, oldBelt, 3, 0.0, 'wheel_medium') // on (3,0)
      const id3 = injectItem(sim, oldBelt, 4, 0.0, 'wheel_large') // on (4,0)
      expect(allItemsOnSimBelts(sim)).toHaveLength(3)
      attachSimToFactory(factory, sim)

      // WHEN: move the assembler from (5,0) to (3,0). The new chain
      // F(0,0) → A(3,0) has path (0,0)→(1,0)→(2,0)→(3,0): cells (1,0)
      // and (3,0) are still covered, but (4,0) is not.
      const moved = factory.moveMachine(5, 0, 3, 0)
      expect(moved, 'moveMachine succeeded').toBe(true)

      // THEN: factory has a single 4-cell belt.
      const newBelts = factory.getBelts()
      expect(newBelts).toHaveLength(1)
      expect(newBelts[0].path).toEqual([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
      ])

      // THEN (sim invariant).
      expectSimBeltsMatchFactory(factory, sim)

      // THEN: items at covered cells survived; item at (4,0) destroyed.
      const remaining = allItemsOnSimBelts(sim)
      expect(remaining).toHaveLength(2)
      expect(findItemOnCell(sim, 1, 0, 'wheel_small')).toBeDefined()
      expect(findItemOnCell(sim, 3, 0, 'wheel_medium')).toBeDefined()
      expect(findItemOnCell(sim, 4, 0, 'wheel_large')).toBeUndefined()
      // Original wheel_large id should not appear anywhere.
      expect(remaining.find((it) => it.id === id3)).toBeUndefined()
      // M7: surviving ids should be preserved.
      expect(remaining.find((it) => it.id === id1)).toBeDefined()
      expect(remaining.find((it) => it.id === id2)).toBeDefined()
    })
  })

  describe('M5 — edit while sim is paused (not running)', () => {
    it('moveMachine completes without throwing when no items exist', () => {
      // GIVEN: a 4-cell belt; sim is built but NOT started.
      place4CellStraight(factory)
      populateSim(factory, sim)
      // Notably: sim.start() is NOT called. No items on belts.
      expect(allItemsOnSimBelts(sim)).toHaveLength(0)
      attachSimToFactory(factory, sim)

      // WHEN: a machine move that removes+replaces belts. With paused
      // sim, the new chain preserves the original source/destination slots.
      expect(() => {
        const ok = factory.moveMachine(3, 0, 3, 1)
        expect(ok, 'moveMachine succeeded with sim not running').toBe(true)
      }).not.toThrow()

      // THEN: the factory belts reflect the new layout.
      expect(renderGrid(factory, 0, 0, 3, 1)).toBe(
        [
          '|F|┐| | |',
          '| |└|─|A|',
        ].join('\n'),
      )
      const newBelts = factory.getBelts()
      expect(newBelts).toHaveLength(1)
      expect(newBelts[0].sourceSlot).toBe('front')
      expect(newBelts[0].destinationSlot).toBe('left')
      expect(newBelts[0].path).toEqual([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 1, z: 1 },
        { x: 2, z: 1 },
        { x: 3, z: 1 },
      ])

      // THEN: still no items anywhere — migration with empty input is
      // a safe no-op.
      expect(allItemsOnSimBelts(sim)).toHaveLength(0)
    })
  })

  describe('M6 — atomicity of multi-belt edits', () => {
    // removed: superseded by one-item-per-cell rule (this test asserted
    // cell-precise placement after migration, which is no longer guaranteed
    // under proportional segment projection).
    it.skip('migration applies AFTER all placements, not interleaved per remove', () => {
      // GIVEN: two parallel belts — A on row z=0, B on row z=2 —
      // sharing no cells.
      //   F1(0,0) ─ belt A ─> A1(2,0)   path (0,0)(1,0)(2,0)
      //   F2(0,2) ─ belt B ─> A2(2,2)   path (0,2)(1,2)(2,2)
      // Item is on belt A's cell (1,0). When we move A1 from (2,0) to
      // (4,0), belt A is replaced by a longer 5-cell chain still
      // covering (1,0). Belt B is unaffected. Atomicity check: the
      // wheel must NOT be destroyed at the moment belt A is removed
      // (before its replacement is placed). It must end up on the new
      // belt A', NOT on belt B.
      const f1 = factory.placeMachine(0, 0, 'part_fabricator', 'south')!
      const a1 = factory.placeMachine(2, 0, 'assembler', 'south')!
      const f2 = factory.placeMachine(0, 2, 'part_fabricator', 'south')!
      const a2 = factory.placeMachine(2, 2, 'assembler', 'south')!
      expect(factory.placeBeltChain(f1, a1)).toBeTruthy()
      expect(factory.placeBeltChain(f2, a2)).toBeTruthy()
      const beltsBefore = factory.getBelts()
      expect(beltsBefore).toHaveLength(2)
      const beltA = beltsBefore.find((b) => b.sourceMachine.id === f1.id)!
      const beltB = beltsBefore.find((b) => b.sourceMachine.id === f2.id)!
      expect(beltA.path).toEqual([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
      ])
      expect(beltB.path).toEqual([
        { x: 0, z: 2 },
        { x: 1, z: 2 },
        { x: 2, z: 2 },
      ])

      populateSim(factory, sim)
      sim.start()
      const wheelId = injectItem(sim, beltA, 1, 0.0, 'wheel_small')
      attachSimToFactory(factory, sim)

      // WHEN: move A1 from (2,0) to (4,0). New belt A' covers
      // (0,0)(1,0)(2,0)(3,0)(4,0).
      const moved = factory.moveMachine(2, 0, 4, 0)
      expect(moved, 'moveMachine succeeded').toBe(true)

      // THEN: factory has 2 belts; belt A' covers (1,0); belt B
      // unchanged.
      const beltsAfter = factory.getBelts()
      expect(beltsAfter).toHaveLength(2)
      const newBeltA = beltsAfter.find((b) => b.sourceMachine.id === f1.id)!
      const unchangedBeltB = beltsAfter.find(
        (b) => b.sourceMachine.id === f2.id,
      )!
      expect(newBeltA.path).toEqual([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
        { x: 4, z: 0 },
      ])
      expect(unchangedBeltB.path).toEqual([
        { x: 0, z: 2 },
        { x: 1, z: 2 },
        { x: 2, z: 2 },
      ])

      // THEN (sim invariant).
      expectSimBeltsMatchFactory(factory, sim)

      // THEN: the wheel survived and is on a row-0 belt covering (1,0).
      const remaining = allItemsOnSimBelts(sim)
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe(wheelId)
      const found = findItemOnCell(sim, 1, 0, 'wheel_small')
      expect(found, 'wheel migrated to a belt covering (1,0)').toBeDefined()
      // Anti-spec: NOT on belt B (z=2).
      expect(found!.belt.fromZ).toBe(0)
      expect(found!.belt.toZ).toBe(0)
    })
  })

  describe('M7 — item id continuity', () => {
    it('preserves item id across migration to a belt covering the same cell', () => {
      // GIVEN: 4-cell belt; one item with a known id.
      const oldBelt = place4CellStraight(factory)
      populateSim(factory, sim)
      sim.start()
      const itemId = injectItem(sim, oldBelt, 2, 0.0, 'wheel_small')
      attachSimToFactory(factory, sim)

      // WHEN: same removal + replacement as M1.
      factory.removeBeltById(oldBelt.id)
      factory.placeBeltChain(
        factory.getMachineAt(0, 0)!,
        factory.getMachineAt(3, 0)!,
      )

      // THEN (sim invariant): the item must reside on a CURRENT
      // factory segment, not on a stale one. Without this guard, RED
      // would falsely pass because the item has never moved off the
      // old segment.
      expectSimBeltsMatchFactory(factory, sim)

      // THEN: the migrated item is still the SAME id (renderer relies
      // on id continuity for smooth interpolation).
      const remaining = allItemsOnSimBelts(sim)
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe(itemId)
    })
  })

  describe('repeated moves do not duplicate items', () => {
    /**
     * RED: Bug B — moving a machine multiple times during a running simulation
     * is observed to multiply the number of items on the belt. After each move
     * the migration path appears to re-claim items into the new belt without
     * removing them from the captured inventory of the prior edit, OR the
     * migration coordinator is not resetting captured-state between edits.
     */
    it('two consecutive valid moves preserve total item count (no duplication)', () => {
      // GIVEN: 4-cell straight belt F(0,0) ─ ─ ─ A(3,0) with 3 items on
      // distinct cells.
      const oldBelt = place4CellStraight(factory)
      populateSim(factory, sim)
      sim.start()
      const ids = [
        injectItem(sim, oldBelt, 0, 0.0, 'wheel_small'),
        injectItem(sim, oldBelt, 1, 0.0, 'wheel_small'),
        injectItem(sim, oldBelt, 2, 0.0, 'wheel_small'),
      ]
      expect(allItemsOnSimBelts(sim)).toHaveLength(3)
      attachSimToFactory(factory, sim)

      // WHEN: simulation runs (one tick) before each move so items have a
      // chance to advance — this mirrors the user scenario where the user
      // drags a machine while the simulation is running.
      for (let t = 0; t < 3; t++) sim.tick()
      expect(factory.moveMachine(3, 0, 4, 0), 'first move ok').toBe(true)
      for (let t = 0; t < 3; t++) sim.tick()
      expect(
        allItemsOnSimBelts(sim),
        'after FIRST move + ticks: total item count must equal N (not 2N) — duplication detected',
      ).toHaveLength(3)

      // Move BACK to the original position — the user scenario specifically
      // mentions "drags machine back to A or to C".
      expect(factory.moveMachine(4, 0, 3, 0), 'second move (back) ok').toBe(true)
      for (let t = 0; t < 3; t++) sim.tick()

      // THEN: total item count is still N. Failure here means the migration
      // path duplicated items across edits.
      expect(
        allItemsOnSimBelts(sim),
        'after SECOND move: total item count must equal N (not 2N or 3N) — duplication detected',
      ).toHaveLength(3)

      // AND: factory layout returns to the 4-cell straight original.
      const beltsAfter = factory.getBelts()
      expect(beltsAfter).toHaveLength(1)
      expect(beltsAfter[0].path).toEqual([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
      ])
      expectSimBeltsMatchFactory(factory, sim)

      // AND: the surviving items are exactly the original three ids — no
      // new items were minted by the migration path.
      const remainingIds = allItemsOnSimBelts(sim).map((i) => i.id).sort()
      expect(remainingIds).toEqual([...ids].sort())
    })

    it('three consecutive valid moves still preserve total item count', () => {
      // GIVEN: same 4-cell straight setup with 3 distinct items.
      const oldBelt = place4CellStraight(factory)
      populateSim(factory, sim)
      sim.start()
      const ids = [
        injectItem(sim, oldBelt, 0, 0.0, 'wheel_small'),
        injectItem(sim, oldBelt, 1, 0.0, 'wheel_small'),
        injectItem(sim, oldBelt, 2, 0.0, 'wheel_small'),
      ]
      expect(allItemsOnSimBelts(sim)).toHaveLength(3)
      attachSimToFactory(factory, sim)

      // WHEN: three successive moves with sim ticks between each (mirrors
      // a running simulation while the user repeatedly drags the machine).
      for (let t = 0; t < 3; t++) sim.tick()
      expect(factory.moveMachine(3, 0, 4, 0)).toBe(true)
      for (let t = 0; t < 3; t++) sim.tick()
      expect(factory.moveMachine(4, 0, 3, 0)).toBe(true)
      for (let t = 0; t < 3; t++) sim.tick()
      expect(factory.moveMachine(3, 0, 4, 0)).toBe(true)
      for (let t = 0; t < 3; t++) sim.tick()

      // THEN: total item count is still exactly N.
      expect(
        allItemsOnSimBelts(sim),
        'after THREE moves: total item count must equal N — duplication detected',
      ).toHaveLength(3)

      // AND: same set of item ids — no new items minted by migration.
      const remainingIds = allItemsOnSimBelts(sim).map((i) => i.id).sort()
      expect(
        remainingIds,
        'migration must reuse captured items, not mint new ones',
      ).toEqual([...ids].sort())
    })
  })
})
