/**
 * RED tests for the one-item-per-belt-instance contract (Phase 1 of the
 * discrete belt refactor).
 *
 * Contract under test (NEW):
 * - Each `ConveyorBelt` instance represents a SINGLE cell-to-cell segment
 *   and may hold AT MOST one item at a time.
 * - `addItem` succeeds iff `getItemCount() === 0` (independent of any
 *   `BELT_ITEM_SPACING` rule, which is being retired).
 * - `insertItemAt` rejects if the belt already contains an item.
 * - `BELT_ITEM_SPACING` and `ITEMS_PER_BELT_SEGMENT` are no longer part of
 *   the public surface of `BeltInventoryRules`.
 *
 * Multi-cell paths are modelled as sequences of 1-cell `ConveyorBelt`
 * instances in production (`BeltInfo.path` + `FactorySimulationSync`),
 * so this contract does not break the per-cell hand-off mechanism (see
 * test (e) below).
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
  it('rejects a second addItem even when the first item is past 0.15', () => {
    // GIVEN
    const a = createItem('wheel_small')
    expect(belt.addItem(a)).toBe(true)
    // Advance until A is past 0.5 (well beyond the retired BELT_ITEM_SPACING).
    for (let i = 0; i < 6; i++) belt.advance() // 0.6
    expect(a.positionOnBelt).toBeGreaterThan(0.5)

    // WHEN
    const b = createItem('wheel_small')
    const result = belt.addItem(b)

    // THEN
    expect(result).toBe(false)
    expect(belt.getItemCount()).toBe(1)
    expect(belt.getItems()[0].id).toBe(a.id)
  })

  // (b)
  it('rejects a second addItem even when the first item is at 0.99', () => {
    // GIVEN
    const a = createItem('wheel_small')
    expect(belt.addItem(a)).toBe(true)
    // Advance close to the end (ten ticks ≈ 0.999, eleventh caps to 1.0).
    for (let i = 0; i < 10; i++) belt.advance()
    expect(a.positionOnBelt).toBeGreaterThan(0.95)

    // WHEN
    const b = createItem('wheel_small')
    const result = belt.addItem(b)

    // THEN
    expect(result).toBe(false)
    expect(belt.getItemCount()).toBe(1)
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
  it('maintains getItemCount() <= 1 across any sequence of addItem/advance', () => {
    // GIVEN — scripted scenario: 10 addItem attempts interleaved with
    // advance ticks. After every step the invariant must hold.
    const types = [
      'wheel_small',
      'wheel_medium',
      'wheel_large',
      'circuit_basic',
      'circuit_advanced',
      'sensor_camera',
      'chassis_light',
      'wheel_small',
      'circuit_basic',
      'wheel_medium',
    ] as const

    // WHEN / THEN
    for (const type of types) {
      belt.addItem(createItem(type))
      expect(belt.getItemCount()).toBeLessThanOrEqual(1)
      belt.advance()
      expect(belt.getItemCount()).toBeLessThanOrEqual(1)
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
  it('insertItemAt rejects when the belt is already occupied', () => {
    // GIVEN
    const a = createItem('wheel_small')
    expect(belt.addItem(a)).toBe(true)

    // WHEN — `insertItemAt` is `void` today; under the new contract it
    // must either return `false` or throw. We accept either signalling
    // strategy, but the belt must not gain a second item.
    const b = createItem('circuit_basic')
    let signalled = false
    try {
      const result = (belt.insertItemAt as (item: unknown, p: number) => unknown)(b, 0.5)
      if (result === false) signalled = true
    } catch {
      signalled = true
    }

    // THEN
    expect(signalled).toBe(true)
    expect(belt.getItemCount()).toBe(1)
    expect(belt.getItems()[0].id).toBe(a.id)
  })

  // (g)
  it('BELT_ITEM_SPACING and ITEMS_PER_BELT_SEGMENT are no longer exported', () => {
    // The constants must be removed from the BeltInventoryRules module.
    expect((BeltInventoryRules as Record<string, unknown>)['BELT_ITEM_SPACING']).toBeUndefined()
    expect((BeltInventoryRules as Record<string, unknown>)['ITEMS_PER_BELT_SEGMENT']).toBeUndefined()
  })
})
