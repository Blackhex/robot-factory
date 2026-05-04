import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'

describe('ConveyorBelt', () => {
  let belt: ConveyorBelt

  beforeEach(() => {
    resetItemIdCounter()
    belt = new ConveyorBelt('belt1', 0, 0, 1, 0, 1.0)
  })

  describe('advance(dt) with custom dt', () => {
    it('should advance by speed * dt when dt is provided', () => {
      // GIVEN
      const item = createItem('wheel_small')
      belt.addItem(item)

      // WHEN
      belt.advance(0.2) // speed=1.0, dt=0.2 → delta=0.2

      // THEN
      expect(item.positionOnBelt).toBeCloseTo(0.2)
    })

    it('should advance with very small dt', () => {
      // GIVEN
      const item = createItem('wheel_small')
      belt.addItem(item)

      // WHEN
      belt.advance(0.01) // speed=1.0, dt=0.01 → delta=0.01

      // THEN
      expect(item.positionOnBelt).toBeCloseTo(0.01)
    })

    it('should combine speed and dt correctly', () => {
      // GIVEN
      const fast = new ConveyorBelt('fast_dt', 0, 0, 1, 0, 3.0)
      const item = createItem('wheel_small')
      fast.addItem(item)

      // WHEN
      fast.advance(0.05) // speed=3.0, dt=0.05 → delta=0.15

      // THEN
      expect(item.positionOnBelt).toBeCloseTo(0.15)
    })

    it('should preserve first overshoot value but freeze it on subsequent advances', () => {
      // INTENT PRESERVED: the first advance that crosses 1.0 is NOT
      // clamped (overshoot is preserved for the boundary handover).
      // BEFORE: only asserted single advance to 5.0 (no follow-up tick).
      // AFTER (A1 drift cap): added a follow-up advance to assert that
      // the position stays at 5.0 — once an item is past 1.0 it is
      // frozen until handover/delivery clears the cell.
      const item = createItem('wheel_small')
      belt.addItem(item)

      // WHEN: one big advance overshoots well past 1.0
      belt.advance(5.0) // speed=1.0, dt=5.0 → first-overshoot value 5.0

      // THEN: first overshoot preserved
      expect(item.positionOnBelt).toBe(5.0)

      // WHEN: another tick under back-pressure
      belt.advance(0.1)

      // THEN: A1 — already at >=1.0, advance is a no-op. No drift.
      expect(item.positionOnBelt).toBe(5.0)
    })

    it('should default to 0.1 when dt is omitted', () => {
      // GIVEN
      const item = createItem('wheel_small')
      belt.addItem(item)

      // WHEN
      belt.advance() // default dt=0.1, speed=1.0 → delta=0.1

      // THEN
      expect(item.positionOnBelt).toBeCloseTo(0.1)
    })
  })

  describe('advancement', () => {
    it('should advance items by speed * TICK_DURATION per tick', () => {
      // GIVEN
      const item = createItem('wheel_small')
      belt.addItem(item)

      // WHEN
      belt.advance()

      // THEN
      // speed=1.0, TICK_DURATION=0.1 → delta=0.1
      expect(item.positionOnBelt).toBeCloseTo(0.1)
    })

    // Drift cap aligned with getReadyItems() (`>= 1.0 - 1e-9`) so back-
    // pressure-refused items no longer escape the cap and overshoot to
    // 1.1; previously this asserted `toBeCloseTo(1.1, 10)`.
    it('caps at 1.0 once the item reaches the end of the cell and is counted as ready', () => {
      // GIVEN
      const item = createItem('wheel_small')
      belt.addItem(item)

      // WHEN
      // 11 advances at 0.1 each. Cumulative `+= 0.1` accumulates float
      // drift (10 × 0.1 = 0.9999999999999999). The drift cap inside
      // advance() uses `>= 1.0 - 1e-9` to catch items at the end of the
      // cell despite that drift, so the item caps at ~1.0 and stops
      // advancing — the bug where back-pressure-refused items escaped
      // the cap and overshot to 1.1 was fixed alongside the per-cell
      // capacity raise to 2.
      for (let i = 0; i < 11; i++) {
        belt.advance()
      }

      // THEN
      expect(item.positionOnBelt).toBeGreaterThanOrEqual(1.0 - 1e-9)
      expect(item.positionOnBelt).toBeLessThanOrEqual(1.0 + 1e-9)
      expect(belt.getReadyItems().length).toBe(1)
    })

    it('should report items at position >= 1.0 as ready', () => {
      // GIVEN
      const item = createItem('wheel_small')
      belt.addItem(item)

      // WHEN
      // Due to floating point, 10 additions of 0.1 yields ~0.999...
      // Need 11 ticks so accumulated position passes 1.0.
      for (let i = 0; i < 11; i++) {
        belt.advance()
      }

      // THEN
      const ready = belt.getReadyItems()
      expect(ready).toHaveLength(1)
      expect(ready[0].id).toBe(item.id)
    })

    it('should not report items before position 1.0 as ready', () => {
      // GIVEN
      const item = createItem('wheel_small')
      belt.addItem(item)

      // WHEN
      belt.advance() // 0.1

      // THEN
      expect(belt.getReadyItems()).toHaveLength(0)
    })
  })

  describe('isEmpty()', () => {
    it('should be true for new belt', () => {
      // THEN
      expect(belt.isEmpty()).toBe(true)
    })

    it('should be false after adding item', () => {
      // WHEN
      belt.addItem(createItem('wheel_small'))

      // THEN
      expect(belt.isEmpty()).toBe(false)
    })
  })

  describe('item placement', () => {
    it('should add item at position 0', () => {
      // GIVEN
      const item = createItem('wheel_small')

      // WHEN
      const result = belt.addItem(item)

      // THEN
      expect(result).toBe(true)
      expect(belt.getItemCount()).toBe(1)
      expect(belt.getItems()[0].positionOnBelt).toBe(0)
    })

    // TODO: removed in one-item-per-belt refactor — assertion frames
    // rejection in terms of `BELT_ITEM_SPACING` ("near the start") which
    // is being retired. The one-item-per-belt rule is covered by the new
    // `ConveyorBelt.oneItemPerCell.test.ts`.
    it.skip('should reject item when another is near the start', () => {
      // GIVEN
      const a = createItem('wheel_small')
      belt.addItem(a)

      // WHEN
      const b = createItem('wheel_small')
      const result = belt.addItem(b)

      // THEN
      expect(result).toBe(false) // first item is at 0 < 0.15
    })

    // TODO: removed in one-item-per-belt refactor — verifies multi-item
    // belt acceptance once the leader passes `BELT_ITEM_SPACING`. Under
    // the new model `addItem` returns false until the leader leaves.
    it.skip('should accept second item when first has advanced past 0.15', () => {
      // GIVEN
      const a = createItem('wheel_small')
      belt.addItem(a)
      // Advance until first item > 0.15 (speed=1.0, delta=0.1/tick)
      belt.advance()
      belt.advance() // position = 0.2

      // WHEN
      const b = createItem('wheel_small')
      const result = belt.addItem(b)

      // THEN
      expect(result).toBe(true)
      expect(belt.getItemCount()).toBe(2)
    })
  })

  describe('item removal', () => {
    it('should remove item by ID', () => {
      // GIVEN
      const item = createItem('wheel_small')
      belt.addItem(item)

      // WHEN
      const result = belt.removeItem(item.id)

      // THEN
      expect(result).toBe(true)
      expect(belt.isEmpty()).toBe(true)
    })

    it('should return false for non-existent item', () => {
      // WHEN / THEN
      expect(belt.removeItem('nonexistent')).toBe(false)
    })
  })

  // TODO: removed in one-item-per-belt refactor — entire suite assumes
  // multiple items can coexist on a single ConveyorBelt instance.
  describe.skip('multiple items maintain order', () => {
    it('should keep items sorted by position', () => {
      // GIVEN
      const a = createItem('wheel_small')
      belt.addItem(a)
      // Advance first item past 0.15
      belt.advance()
      belt.advance() // a at 0.2

      // WHEN
      const b = createItem('circuit_basic')
      belt.addItem(b)

      // THEN
      const items = belt.getItems()
      expect(items[0].id).toBe(b.id) // b at 0.0 comes first in sort
      expect(items[1].id).toBe(a.id) // a at 0.2 comes second
    })

    it('should advance all items independently', () => {
      // GIVEN
      const a = createItem('wheel_small')
      belt.addItem(a)
      belt.advance()
      belt.advance() // a at 0.2

      const b = createItem('circuit_basic')
      belt.addItem(b) // b at 0.0

      // WHEN
      belt.advance()

      // THEN
      expect(a.positionOnBelt).toBeCloseTo(0.3)
      expect(b.positionOnBelt).toBeCloseTo(0.1)
    })
  })

  describe('speed affects advancement', () => {
    it('should advance faster with higher speed', () => {
      // GIVEN
      const fast = new ConveyorBelt('fast', 0, 0, 1, 0, 2.0)
      const item = createItem('wheel_small')
      fast.addItem(item)

      // WHEN
      fast.advance()

      // THEN
      // speed=2.0, TICK_DURATION=0.1 → delta=0.2
      expect(item.positionOnBelt).toBeCloseTo(0.2)
    })

    it('should advance slower with lower speed', () => {
      // GIVEN
      const slow = new ConveyorBelt('slow', 0, 0, 1, 0, 0.5)
      const item = createItem('wheel_small')
      slow.addItem(item)

      // WHEN
      slow.advance()

      // THEN
      // speed=0.5, TICK_DURATION=0.1 → delta=0.05
      expect(item.positionOnBelt).toBeCloseTo(0.05)
    })

    it('should reach end faster at higher speed', () => {
      // GIVEN
      const fast = new ConveyorBelt('fast2', 0, 0, 1, 0, 2.0)
      const item = createItem('wheel_small')
      fast.addItem(item)

      // WHEN
      // 5 ticks at 0.2/tick = 1.0
      for (let i = 0; i < 5; i++) {
        fast.advance()
      }

      // THEN
      expect(belt.getReadyItems.length).toBeDefined()
      expect(item.positionOnBelt).toBeCloseTo(1.0, 10)
    })
  })
})
