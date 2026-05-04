import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'

/**
 * RED tests for the belt-handover overshoot-carry contract.
 *
 * Goal: when an item moves past `positionOnBelt = 1.0` during `advance(dt)`,
 * its progress beyond 1.0 (the overshoot) must be preserved, not clamped.
 * The handover code in `Simulation.deliverItems()` will then carry this
 * overshoot onto the next belt so an item travelling across many segments
 * sees uniform per-tick progress with no boundary pauses.
 */
describe('ConveyorBelt — handover overshoot-carry contract', () => {
  let belt: ConveyorBelt

  beforeEach(() => {
    resetItemIdCounter()
    belt = new ConveyorBelt('belt1', 0, 0, 1, 0, 1.0)
  })

  describe('advance(dt) overshoot preservation', () => {
    it('should NOT clamp positionOnBelt at 1.0 when one advance overshoots', () => {
      // GIVEN: an item placed near the end of the belt
      const item = createItem('wheel_small')
      belt.insertItemAt(item, 0.95)

      // WHEN: a single advance with delta = 0.1 (speed=1.0, dt=0.1)
      belt.advance(0.1)

      // THEN: the item must record the true post-advance position, 1.05,
      // not the clamped value 1.0. The 0.05 of progress past the boundary
      // is the overshoot that the handover step will carry onto the next
      // belt; clamping would discard it and produce visible jitter.
      expect(item.positionOnBelt).toBeCloseTo(1.05, 10)
    })

    it('should freeze position at the first overshoot value across successive advance() calls', () => {
      // INTENT PRESERVED: still verifies the post-overshoot semantics
      // for back-to-back ticks while the item is jammed at the boundary.
      // BEFORE: expected 1.15 after two advances (unbounded accumulation).
      // AFTER (A1 drift cap): the FIRST overshoot value (1.05) is kept;
      // subsequent advances are SKIPPED because position is already
      // >= 1.0. This is the regression guard for unbounded position drift
      // (probe observed pos=11.50 at tick 200 under back-pressure).
      const item = createItem('wheel_small')
      belt.insertItemAt(item, 0.95)

      // WHEN
      belt.advance(0.1) // first overshoot -> 1.05
      belt.advance(0.1) // A1: skip (already at >=1.0) -> stays 1.05

      // THEN
      expect(item.positionOnBelt).toBeCloseTo(1.05, 10)
    })
  })

  describe('getReadyItems()', () => {
    it('should report items with positionOnBelt >= 1.0 as ready', () => {
      // GIVEN
      const itemAtOne = createItem('wheel_small')
      belt.insertItemAt(itemAtOne, 1.0)

      // THEN
      expect(belt.getReadyItems()).toHaveLength(1)
      expect(belt.getReadyItems()[0].id).toBe(itemAtOne.id)
    })

    it('should report items with positionOnBelt past 1.0 as ready', () => {
      // GIVEN: an item that has overshot into [1.0, 2.0). insertItemAt
      // currently clamps to [0, 1], so we set the overshoot directly via
      // the item's public field — this mirrors the post-fix advance()
      // result where overshoot is preserved.
      const item = createItem('wheel_small')
      belt.insertItemAt(item, 1.0)
      item.positionOnBelt = 1.5

      // THEN
      expect(belt.getReadyItems()).toHaveLength(1)
      expect(belt.getReadyItems()[0].id).toBe(item.id)
    })

    it('should NOT report items with positionOnBelt strictly below 1.0', () => {
      // GIVEN
      const item = createItem('wheel_small')
      belt.insertItemAt(item, 0.99)

      // THEN
      expect(belt.getReadyItems()).toHaveLength(0)
    })
  })

  describe('insertItemAt() clamping (sanity guard)', () => {
    it('should clamp negative positions to 0', () => {
      // GIVEN
      const item = createItem('wheel_small')

      // WHEN
      const result = belt.insertItemAt(item, -0.5)

      // THEN
      expect(result).toBe(true)
      expect(item.positionOnBelt).toBe(0)
    })

    it('should clamp positions above 1 to 1', () => {
      // GIVEN
      const item = createItem('wheel_small')

      // WHEN
      const result = belt.insertItemAt(item, 1.7)

      // THEN
      expect(result).toBe(true)
      expect(item.positionOnBelt).toBe(1)
    })
  })

  // Two-items-per-cell handover spacing — the cell now holds up to 2
  // items provided every pair satisfies |posA − posB| ≥ MIN_ITEM_SPACING
  // (= 0.5). These extend (not replace) the existing handover assertions
  // above; the existing tests probe the orthogonal "overshoot is preserved
  // by advance, NOT clamped" contract.
  describe('acceptHandover with an existing item already on the cell', () => {
    it('accepts a handover when the existing item leaves a gap ≥ MIN_ITEM_SPACING', () => {
      // GIVEN — incumbent at 0.6, newcomer overshoot 0.05 → gap 0.55 ≥ 0.5.
      const incumbent = createItem('wheel_small')
      expect(belt.insertItemAt(incumbent, 0.6)).toBe(true)

      // WHEN
      const newcomer = createItem('circuit_basic')
      const ok = belt.acceptHandover(newcomer, 0.05)

      // THEN — both items live on the cell, sorted by position.
      expect(ok).toBe(true)
      expect(belt.getItemCount()).toBe(2)
      const sorted = belt
        .getItems()
        .slice()
        .sort((a, b) => a.positionOnBelt - b.positionOnBelt)
      expect(sorted[0].id).toBe(newcomer.id)
      expect(sorted[0].positionOnBelt).toBeCloseTo(0.05, 10)
      expect(sorted[1].id).toBe(incumbent.id)
      expect(sorted[1].positionOnBelt).toBeCloseTo(0.6, 10)
    })

    it('rejects a handover when spacing would be violated and leaves the upstream item parked', () => {
      // GIVEN — incumbent at 0.4 on the downstream cell; upstream item parked
      // at the end of an upstream cell (waiting for handover).
      const incumbent = createItem('wheel_small')
      expect(belt.insertItemAt(incumbent, 0.4)).toBe(true)

      const upstream = new ConveyorBelt('upstream', -1, 0, 0, 0, 1.0)
      const parked = createItem('circuit_basic')
      expect(upstream.insertItemAt(parked, 1.0)).toBe(true)

      // WHEN — try to hand parked over to `belt` with overshoot 0.05.
      // Gap to incumbent = 0.4 − 0.05 = 0.35 < 0.5 → REJECT.
      const ok = belt.acceptHandover(parked, 0.05)

      // THEN — downstream unchanged; upstream item stays exactly where it was.
      expect(ok).toBe(false)
      expect(belt.getItemCount()).toBe(1)
      expect(belt.getItems()[0].id).toBe(incumbent.id)
      expect(belt.getItems()[0].positionOnBelt).toBeCloseTo(0.4, 10)

      // Caller's invariant: on a `false` return the upstream item must
      // remain on the upstream belt — `acceptHandover` does NOT remove it
      // and the caller (Simulation.deliverItems) checks the return.
      expect(upstream.getItemCount()).toBe(1)
      expect(upstream.getItems()[0].id).toBe(parked.id)
      expect(parked.positionOnBelt).toBeCloseTo(1.0, 10)
    })
  })
})
