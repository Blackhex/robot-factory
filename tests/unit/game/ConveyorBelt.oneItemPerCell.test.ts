/**
 * RED tests for the discrete-cell belt contract.
 *
 * Contract under test (NEW — two-items-per-cell with min-spacing):
 * - Each `ConveyorBelt` instance represents a SINGLE cell-to-cell segment
 *   and may hold AT MOST `ConveyorBelt.CELL_CAPACITY` (= 2) items.
 * - `addItem`, `insertItemAt`, and `acceptHandover` succeed only when:
 *     items.length < CELL_CAPACITY AND every existing item is at least
 *     `ConveyorBelt.MIN_ITEM_SPACING` (= 0.5) away from the candidate
 *     position. Otherwise they return `false` without modifying state.
 * - `BELT_ITEM_SPACING` and `ITEMS_PER_BELT_SEGMENT` are no longer part of
 *   the public surface of `BeltInventoryRules`.
 *
 * The cases below cover the SECOND-item-rejection paths (spacing
 * violations) and the FULL-cell rejection paths. The well-spaced ACCEPT
 * cases live in `ConveyorBelt.cellCapacity.test.ts`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import * as BeltInventoryRules from '../../../src/game/BeltInventoryRules'

describe('ConveyorBelt — one-item-per-cell contract', () => {
  let belt: ConveyorBelt

  beforeEach(() => {
    resetItemIdCounter()
    belt = new ConveyorBelt('belt1', 0, 0, 1, 0, 1.0)
  })

  // (a)
  // Cell capacity raised from 1 to 2 (with min-spacing 0.5); previously
  // this asserted that a second addItem is rejected purely because the
  // cell already held one item. The new contract rejects only on
  // spacing violation, so the test now sets up a SPACING-violating
  // scenario (existing item at 0.2 → newcomer at 0 → gap 0.2 < 0.5).
  it('rejects a second addItem when the first item is at 0.2 (gap 0.2 < MIN_ITEM_SPACING)', () => {
    // GIVEN
    const a = createItem('wheel_small')
    expect(belt.addItem(a)).toBe(true)
    // Advance until A is at 0.2 (within MIN_ITEM_SPACING of the entry).
    for (let i = 0; i < 2; i++) belt.advance() // 0.2
    expect(a.positionOnBelt).toBeCloseTo(0.2, 10)

    // WHEN
    const b = createItem('wheel_small')
    const result = belt.addItem(b)

    // THEN
    expect(result).toBe(false)
    expect(belt.getItemCount()).toBe(1)
    expect(belt.getItems()[0].id).toBe(a.id)
  })

  // (b)
  // Cell capacity raised from 1 to 2 (with min-spacing 0.5); previously
  // this asserted that a second addItem is rejected when the first is
  // near 1.0 (still occupied). Under the new contract a first item at
  // 0.95 leaves a gap of 0.95 ≥ 0.5 to a newcomer at 0, so addItem must
  // SUCCEED. The test now asserts the success path.
  it('accepts a second addItem when the first item is at 0.95 (gap 0.95 ≥ MIN_ITEM_SPACING)', () => {
    // GIVEN
    const a = createItem('wheel_small')
    expect(belt.addItem(a)).toBe(true)
    a.positionOnBelt = 0.95

    // WHEN
    const b = createItem('wheel_small')
    const result = belt.addItem(b)

    // THEN — both items live on the cell; the newcomer takes pos 0.
    expect(result).toBe(true)
    expect(belt.getItemCount()).toBe(2)
    const sorted = belt.getItems().slice().sort((x, y) => x.positionOnBelt - y.positionOnBelt)
    expect(sorted[0].id).toBe(b.id)
    expect(sorted[0].positionOnBelt).toBe(0)
    expect(sorted[1].id).toBe(a.id)
    expect(sorted[1].positionOnBelt).toBeCloseTo(0.95, 10)
  })

  // (c)
  it('accepts a new addItem after the first item is removed', () => {
    // GIVEN
    const a = createItem('wheel_small')
    expect(belt.addItem(a)).toBe(true)
    for (let i = 0; i < 11; i++) belt.advance() // ready
    expect(belt.getReadyItems()).toHaveLength(1)
    expect(belt.removeItem(a.id)).toBe(true)
    expect(belt.isEmpty()).toBe(true)

    // WHEN
    const b = createItem('circuit_basic')
    const result = belt.addItem(b)

    // THEN
    expect(result).toBe(true)
    expect(belt.getItemCount()).toBe(1)
    expect(belt.getItems()[0].positionOnBelt).toBe(0)
  })

  // (d)
  // Cell capacity raised from 1 to 2 (with min-spacing 0.5); previously
  // this asserted `getItemCount() <= 1` across an addItem/advance loop.
  // Under the new contract the bound is `CELL_CAPACITY` (= 2).
  it('maintains getItemCount() <= CELL_CAPACITY across any sequence of addItem/advance', () => {
    // GIVEN — scripted scenario: 10 addItem attempts interleaved with
    // advance ticks. After every step the invariant must hold.
    const types = [
      'wheel_small',
      'wheel_medium',
      'wheel_large',
      'circuit_basic',
      'circuit_advanced',
      'battery_standard',
      'chassis_light',
      'wheel_small',
      'circuit_basic',
      'wheel_medium',
    ] as const

    // WHEN / THEN
    for (const type of types) {
      belt.addItem(createItem(type))
      expect(belt.getItemCount()).toBeLessThanOrEqual(ConveyorBelt.CELL_CAPACITY)
      belt.advance()
      expect(belt.getItemCount()).toBeLessThanOrEqual(ConveyorBelt.CELL_CAPACITY)
    }
  })

  // (e)
  it('two single-cell belts chained still hand off cleanly under the one-per-belt rule', () => {
    // GIVEN — two segments B1 → B2 modelling a 2-cell path.
    const b1 = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
    const b2 = new ConveyorBelt('b2', 1, 0, 2, 0, 1.0)
    const item = createItem('wheel_small')
    expect(b1.addItem(item)).toBe(true)

    // WHEN — advance B1 until the item is ready.
    for (let i = 0; i < 11; i++) b1.advance()
    expect(b1.getReadyItems()).toHaveLength(1)
    expect(b2.isEmpty()).toBe(true) // downstream has capacity

    // Hand-off: simulate what FactorySimulationSync does between segments.
    const ready = b1.getReadyItems()[0]
    expect(b1.removeItem(ready.id)).toBe(true)
    expect(b2.addItem(ready)).toBe(true)

    // THEN — item now lives on B2 starting at 0.
    expect(b1.isEmpty()).toBe(true)
    expect(b2.getItemCount()).toBe(1)
    expect(b2.getItems()[0].id).toBe(item.id)
    expect(b2.getItems()[0].positionOnBelt).toBe(0)
  })

  // (f)
  // Cell capacity raised from 1 to 2 (with min-spacing 0.5); previously
  // this asserted that `insertItemAt` rejects when the belt holds any
  // item at all. The new contract rejects only on spacing/capacity
  // violation; the scenario is now a SPACING violation (incumbent at
  // 0.0, attempt at 0.4 → gap 0.4 < 0.5).
  it('insertItemAt rejects when spacing would be violated', () => {
    // GIVEN
    const a = createItem('wheel_small')
    expect(belt.insertItemAt(a, 0.0)).toBe(true)

    // WHEN
    const b = createItem('circuit_basic')
    const result = belt.insertItemAt(b, 0.4)

    // THEN — state unchanged.
    expect(result).toBe(false)
    expect(belt.getItemCount()).toBe(1)
    expect(belt.getItems()[0].id).toBe(a.id)
    expect(belt.getItems()[0].positionOnBelt).toBeCloseTo(0, 10)
  })

  // (g)
  it('BELT_ITEM_SPACING and ITEMS_PER_BELT_SEGMENT are no longer exported', () => {
    // The constants must be removed from the BeltInventoryRules module.
    expect((BeltInventoryRules as Record<string, unknown>)['BELT_ITEM_SPACING']).toBeUndefined()
    expect((BeltInventoryRules as Record<string, unknown>)['ITEMS_PER_BELT_SEGMENT']).toBeUndefined()
  })
})
