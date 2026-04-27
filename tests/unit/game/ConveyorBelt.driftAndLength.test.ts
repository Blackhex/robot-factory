import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'

/**
 * Two ConveyorBelt contracts:
 *
 *  A1 — Drift cap. Once an item's `positionOnBelt` is >= 1.0 (i.e. the
 *       item is "ready" awaiting handover/delivery), `advance(dt)` MUST
 *       skip it. Otherwise back-pressure on a downstream cell allows the
 *       upstream item's position to drift unboundedly.
 *
 *  A2 — Cell-uniform traversal time. `advance(dt)` advances
 *       `positionOnBelt` by `speed * dt` (NO division by `length`), so
 *       every cell — regardless of arc length — is traversed in the
 *       same number of ticks. At speed 1, dt=0.1: 10 ticks per cell.
 *       `acceptHandover` accepts overshoot as a plain normalized
 *       position (pos - 1.0), placed directly — no division by the
 *       receiving belt's length.
 */
describe('ConveyorBelt — A1 drift cap on advance()', () => {
  let belt: ConveyorBelt

  beforeEach(() => {
    resetItemIdCounter()
    belt = new ConveyorBelt('belt1', 0, 0, 1, 0, 1.0)
  })

  it('preserves the first overshoot when advance crosses 1.0 (still no clamp)', () => {
    // GIVEN: an item at 0.95 on a default L=1.0 belt
    const item = createItem('wheel_small')
    belt.insertItemAt(item, 0.95)

    // WHEN: a single advance with delta = 0.1 (speed=1.0, dt=0.1, L=1.0)
    belt.advance(0.1)

    // THEN: the first overshoot value 1.05 is preserved (overshoot of
    // 0.05 will be carried forward by deliverItems on the next handover).
    expect(item.positionOnBelt).toBeCloseTo(1.05, 10)
  })

  it('freezes position at the first overshoot — does NOT advance again', () => {
    // GIVEN: an item that has just overshot to 1.05
    const item = createItem('wheel_small')
    belt.insertItemAt(item, 0.95)
    belt.advance(0.1) // -> 1.05

    // WHEN: another advance is attempted (back-pressure: downstream busy)
    belt.advance(0.1)

    // THEN: A1 — already-ready items are SKIPPED. Position stays at 1.05.
    expect(item.positionOnBelt).toBeCloseTo(1.05, 10)
  })

  it('keeps position at first-overshoot value even after many back-pressure ticks', () => {
    // GIVEN: an item that has overshot to 1.05
    const item = createItem('wheel_small')
    belt.insertItemAt(item, 0.95)
    belt.advance(0.1) // -> 1.05

    // WHEN: 100 more advance() calls (downstream stays jammed)
    for (let i = 0; i < 100; i++) {
      belt.advance(0.1)
    }

    // THEN: position is still the first-overshoot value, NOT 11.05.
    // This is the regression guard for the probe-observed pos=11.50 drift.
    expect(item.positionOnBelt).toBeCloseTo(1.05, 10)
  })

  it('skips items already at exactly 1.0 (boundary case)', () => {
    // GIVEN: item parked exactly at 1.0 (e.g. via insertItemAt)
    const item = createItem('wheel_small')
    belt.insertItemAt(item, 1.0)

    // WHEN
    belt.advance(0.1)

    // THEN: no advance, no drift past 1.0
    expect(item.positionOnBelt).toBe(1.0)
  })

  it('still advances items strictly below 1.0 normally', () => {
    // GIVEN
    const item = createItem('wheel_small')
    belt.insertItemAt(item, 0.5)

    // WHEN
    belt.advance(0.1)

    // THEN: regular advance still works for in-flight items.
    expect(item.positionOnBelt).toBeCloseTo(0.6, 10)
  })

  it('getReadyItems still reports overshot items (within 1e-9 tolerance)', () => {
    // GIVEN: an item at 0.95 that overshoots to 1.05 in one advance
    const item = createItem('wheel_small')
    belt.insertItemAt(item, 0.95)
    belt.advance(0.1)

    // THEN
    const ready = belt.getReadyItems()
    expect(ready).toHaveLength(1)
    expect(ready[0].id).toBe(item.id)
    expect(ready[0].positionOnBelt).toBeCloseTo(1.05, 10)
  })
})

describe('ConveyorBelt — A2 per-cell arc length', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  describe('constructor and length getter', () => {
    it('defaults belt.length to 1.0 when length is omitted', () => {
      // GIVEN
      const belt = new ConveyorBelt('b', 0, 0, 1, 0, 1.0)

      // THEN
      expect(belt.length).toBe(1.0)
    })

    it('exposes the explicitly provided length via belt.length', () => {
      // GIVEN: belts of two representative lengths — straight (L=1.0)
      // and corner (L≈0.871). Half-cells (L=0.5) no longer exist as a
      // topology case, but the ConveyorBelt API still accepts arbitrary L.
      const corner = new ConveyorBelt('corner', 0, 0, 1, 0, 1.0, 0.871)
      const full = new ConveyorBelt('full', 0, 0, 1, 0, 1.0, 1.0)

      // THEN
      expect(corner.length).toBe(0.871)
      expect(full.length).toBe(1.0)
    })
  })

  describe('advance(dt) uses speed*dt for cell-uniform traversal time', () => {
    it('advances by speed*dt regardless of length (L≈0.871 corner cell)', () => {
      // GIVEN: speed=1, dt=0.1 → cell delta = speed*dt = 0.1 (NOT 0.1/0.871)
      const belt = new ConveyorBelt('corner', 0, 0, 1, 0, 1.0, 0.871)
      const item = createItem('wheel_small')
      belt.insertItemAt(item, 0)

      // WHEN: one advance
      belt.advance(0.1)

      // THEN: position = 0.1, same as any other cell
      expect(item.positionOnBelt).toBeCloseTo(0.1, 10)
    })

    it('a corner cell (L≈0.871) takes 10 ticks to traverse, same as a full cell', () => {
      // GIVEN
      const belt = new ConveyorBelt('corner', 0, 0, 1, 0, 1.0, 0.871)
      const item = createItem('wheel_small')
      belt.insertItemAt(item, 0)

      // WHEN: 5 ticks — should be only halfway, NOT already at 1.0
      for (let i = 0; i < 5; i++) belt.advance(0.1)

      // THEN: 5 × 0.1 = 0.5 (half-way through the cell)
      expect(item.positionOnBelt).toBeCloseTo(0.5, 10)

      // WHEN: 5 more ticks (10 total)
      for (let i = 0; i < 5; i++) belt.advance(0.1)

      // THEN: 10 × 0.1 = 1.0 (item is now ready to hand off)
      expect(item.positionOnBelt).toBeCloseTo(1.0, 10)
    })

    it('advances by speed*dt regardless of length (L=2.0 long cell)', () => {
      // GIVEN: speed=1, dt=0.1 → cell delta = speed*dt = 0.1 (NOT 0.1/2.0)
      const belt = new ConveyorBelt('long', 0, 0, 1, 0, 1.0, 2.0)
      const item = createItem('wheel_small')
      belt.insertItemAt(item, 0)

      // WHEN
      belt.advance(0.1)

      // THEN: position = 0.1, same as any other cell
      expect(item.positionOnBelt).toBeCloseTo(0.1, 10)
    })

    it('a long cell (L=2.0) takes 10 ticks to traverse, same as a full cell', () => {
      // GIVEN
      const belt = new ConveyorBelt('long', 0, 0, 1, 0, 1.0, 2.0)
      const item = createItem('wheel_small')
      belt.insertItemAt(item, 0)

      // WHEN: 10 ticks
      for (let i = 0; i < 10; i++) belt.advance(0.1)

      // THEN: 10 × 0.1 = 1.0
      expect(item.positionOnBelt).toBeCloseTo(1.0, 10)
    })

    it('advances by speed*dt on a default L=1.0 belt (unchanged)', () => {
      // GIVEN
      const belt = new ConveyorBelt('full', 0, 0, 1, 0, 1.0)
      const item = createItem('wheel_small')
      belt.insertItemAt(item, 0)

      // WHEN
      belt.advance(0.1)

      // THEN: speed*dt = 1*0.1 = 0.1
      expect(item.positionOnBelt).toBeCloseTo(0.1, 10)
    })
  })

  describe('acceptHandover(item, overshoot) — plain normalized position', () => {
    it('on an L=1.0 belt, overshoot of 0.05 maps to position 0.05', () => {
      // GIVEN
      const belt = new ConveyorBelt('full', 0, 0, 1, 0, 1.0)
      const item = createItem('wheel_small')

      // WHEN
      const ok = belt.acceptHandover(item, 0.05)

      // THEN: position = overshoot directly = 0.05
      expect(ok).toBe(true)
      expect(item.positionOnBelt).toBeCloseTo(0.05, 10)
    })

    it('on an L≈0.871 belt, overshoot of 0.05 maps to position 0.05 (no division by length)', () => {
      // GIVEN: corner-cell receiver — overshoot is placed directly, NOT
      // divided by the cell's arc length.
      const belt = new ConveyorBelt('corner', 0, 0, 1, 0, 1.0, 0.871)
      const item = createItem('wheel_small')

      // WHEN
      const ok = belt.acceptHandover(item, 0.05)

      // THEN: position = 0.05 (NOT 0.05 / 0.871 ≈ 0.0574)
      expect(ok).toBe(true)
      expect(item.positionOnBelt).toBeCloseTo(0.05, 10)
    })

    it('on an L=2.0 belt, overshoot of 0.05 maps to position 0.05 (no division by length)', () => {
      // GIVEN: long-cell receiver — overshoot is placed directly.
      const belt = new ConveyorBelt('long', 0, 0, 1, 0, 1.0, 2.0)
      const item = createItem('wheel_small')

      // WHEN
      const ok = belt.acceptHandover(item, 0.05)

      // THEN: position = 0.05 (NOT 0.05 / 2.0 = 0.025)
      expect(ok).toBe(true)
      expect(item.positionOnBelt).toBeCloseTo(0.05, 10)
    })

    it('clamps overshoot at (1 - EPSILON) to keep position in [0, 1)', () => {
      // GIVEN: an overshoot of 1.0 would place the item at exactly 1.0;
      // defensive clamp keeps it strictly below 1.0.
      const belt = new ConveyorBelt('full', 0, 0, 1, 0, 1.0)
      const item = createItem('wheel_small')

      // WHEN
      const ok = belt.acceptHandover(item, 1.0)

      // THEN
      expect(ok).toBe(true)
      expect(item.positionOnBelt).toBeLessThan(1.0)
      expect(item.positionOnBelt).toBeGreaterThan(1.0 - 1e-10)
    })

    it('still rejects handover when the receiving cell is occupied', () => {
      // GIVEN: belt with one item already on it
      const belt = new ConveyorBelt('full', 0, 0, 1, 0, 1.0)
      const incumbent = createItem('wheel_small')
      belt.insertItemAt(incumbent, 0.3)

      // WHEN
      const newcomer = createItem('wheel_small')
      const ok = belt.acceptHandover(newcomer, 0.05)

      // THEN: one-item-per-cell contract preserved
      expect(ok).toBe(false)
      expect(belt.getItemCount()).toBe(1)
    })
  })
})
