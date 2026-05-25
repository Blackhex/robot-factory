import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ALL_OUTPUTS_CONNECTED_ENV } from '../../../src/game/MachineBehaviors'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'

// USER-CONFIRMED REQUIREMENT (verbatim):
// "If Fabricator have basic part matching its recipe on the input, it
//  should prefer consuming it instead of creating new part so the input
//  queue is not stalled."
//
// Behavior spec for these tests:
//   - Matching items queue in `inputSlots` (up to `maxInputSlots`).
//   - Each tick where state is `idle` and `outputSlot === null`:
//       * If a matching item sits in `inputSlots`: MOVE the OLDEST one to
//         `outputSlot`. Stay idle. Timer stays 0. No defect roll.
//       * Otherwise: start a normal fresh production cycle (tickDefault).

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

describe('part_fabricator: prefer consuming queued input over fresh production', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('on tick, moves the OLDEST queued matching item to outputSlot; N-1 remain in inputSlots; state stays idle; timer stays 0', () => {
    // GIVEN — fabricator with three matching items queued.
    const m = new Machine('pf', 'part_fabricator')
    m.setRecipe(recipe('wheel_press_small'))
    m.start()
    const a = createItem('wheel_small')
    const b = createItem('wheel_small')
    const c = createItem('wheel_small')
    expect(m.addInput(a)).toBe(true)
    expect(m.addInput(b)).toBe(true)
    expect(m.addInput(c)).toBe(true)
    expect(m.inputSlots).toHaveLength(3)
    expect(m.outputSlot).toBeNull()

    // WHEN
    m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)

    // THEN — oldest (a) moved to output; b, c remain in inputSlots in
    // their original order; no production cycle started.
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.id).toBe(a.id)
    expect(m.inputSlots).toHaveLength(2)
    expect(m.inputSlots[0].id).toBe(b.id)
    expect(m.inputSlots[1].id).toBe(c.id)
    expect(m.state).toBe('idle')
    expect(m.processingTimer).toBe(0)
  })

  it('falls through to fresh production when both inputSlots and outputSlot are empty (state → processing, timer > 0)', () => {
    // GIVEN — started fabricator with NOTHING queued.
    const m = new Machine('pf', 'part_fabricator')
    m.setRecipe(recipe('wheel_press_small'))
    m.start()
    expect(m.inputSlots).toHaveLength(0)
    expect(m.outputSlot).toBeNull()
    expect(m.state).toBe('idle')

    // WHEN
    m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)

    // THEN — normal fresh production cycle has started.
    expect(m.state).toBe('processing')
    expect(m.processingTimer).toBeGreaterThan(0)
  })

  it('prefers queued matching input over fresh production: with one queued item, ticks moves it to output and does NOT start a production cycle', () => {
    // GIVEN — recipe set, started, ONE matching item queued.
    const m = new Machine('pf', 'part_fabricator')
    m.setRecipe(recipe('wheel_press_small'))
    m.start()
    const queued = createItem('wheel_small')
    expect(m.addInput(queued)).toBe(true)
    expect(m.outputSlot).toBeNull()
    expect(m.state).toBe('idle')
    expect(m.processingTimer).toBe(0)

    // WHEN
    m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)

    // THEN — moved (not produced anew); state stayed idle; no timer.
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.id).toBe(queued.id)
    expect(m.inputSlots).toHaveLength(0)
    expect(m.state).toBe('idle')
    expect(m.processingTimer).toBe(0)
  })

  it('accepts up to maxInputSlots matching items even while outputSlot is occupied (capacity = maxInputSlots + 1)', () => {
    // GIVEN — output slot already holds a pass-through item.
    const m = new Machine('pf', 'part_fabricator')
    m.setRecipe(recipe('wheel_press_small'))
    m.outputSlot = createItem('wheel_small')

    // WHEN — push maxInputSlots additional matching items.
    for (let i = 0; i < m.maxInputSlots; i++) {
      expect(m.addInput(createItem('wheel_small'))).toBe(true)
    }

    // THEN — input queue is exactly at capacity and outputSlot is still
    // occupied. Effective buffer is maxInputSlots + 1 matching items.
    expect(m.inputSlots).toHaveLength(m.maxInputSlots)
    expect(m.outputSlot).not.toBeNull()

    // AND — one more push is refused (input queue full).
    expect(m.addInput(createItem('wheel_small'))).toBe(false)
  })

  it('drains in FIFO order: A, B, C in → A, B, C out (taking outputSlot between ticks)', () => {
    // GIVEN — three matching items queued in order A, B, C.
    const m = new Machine('pf', 'part_fabricator')
    m.setRecipe(recipe('wheel_press_small'))
    m.start()
    const a = createItem('wheel_small')
    const b = createItem('wheel_small')
    const c = createItem('wheel_small')
    expect(m.addInput(a)).toBe(true)
    expect(m.addInput(b)).toBe(true)
    expect(m.addInput(c)).toBe(true)

    // WHEN — drain one per tick by emptying outputSlot between ticks.
    const drained: string[] = []
    for (let i = 0; i < 3; i++) {
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
      expect(m.outputSlot).not.toBeNull()
      drained.push(m.outputSlot!.id)
      m.outputSlot = null
    }

    // THEN — drain order matches insertion order.
    expect(drained).toEqual([a.id, b.id, c.id])
    expect(m.inputSlots).toHaveLength(0)
  })

  it('preserves the defective flag when moving a queued input to outputSlot', () => {
    // GIVEN — a defective matching item queued.
    const m = new Machine('pf', 'part_fabricator')
    m.setRecipe(recipe('wheel_press_small'))
    m.start()
    const defective = createItem('wheel_small')
    defective.isDefective = true
    expect(m.addInput(defective)).toBe(true)

    // WHEN
    m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)

    // THEN — defect flag survives the move (no defect roll re-applied).
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.id).toBe(defective.id)
    expect(m.outputSlot!.isDefective).toBe(true)
  })
})
