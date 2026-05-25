import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import {
  ALL_OUTPUTS_CONNECTED_ENV,
  MACHINE_BEHAVIORS,
} from '../../../src/game/MachineBehaviors'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'

// USER-CONFIRMED REQUIREMENT CHANGE (supersedes the previous pass-through
// spec): "If Fabricator have basic part matching its recipe on the input,
// it should prefer consuming it instead of creating new part so the input
// queue is not stalled."
//
// Matching items now QUEUE in `inputSlots` (raising the effective buffer
// from 1 → maxInputSlots + 1). Each tick, when state is idle and outputSlot
// is empty, the OLDEST matching input is MOVED to outputSlot (no defect
// roll, no processing timer). If inputSlots is empty, the fabricator falls
// through to normal fresh production.

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

const behavior = MACHINE_BEHAVIORS.part_fabricator

describe('part_fabricator pass-through (zero-input recipe)', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  describe('MACHINE_BEHAVIORS.part_fabricator.canConsume', () => {
    it('returns false when no recipe is set', () => {
      const m = new Machine('pf', 'part_fabricator')
      expect(behavior.canConsume(m, 'wheel_small')).toBe(false)
      expect(behavior.canConsume(m, 'chassis_light')).toBe(false)
    })

    it("returns true for the recipe's output type", () => {
      const m = new Machine('pf', 'part_fabricator')
      m.setRecipe(recipe('wheel_press_small'))
      expect(behavior.canConsume(m, 'wheel_small')).toBe(true)
    })

    it("returns false for any other item type", () => {
      const m = new Machine('pf', 'part_fabricator')
      m.setRecipe(recipe('wheel_press_small'))
      expect(behavior.canConsume(m, 'wheel_medium')).toBe(false)
      expect(behavior.canConsume(m, 'chassis_light')).toBe(false)
      expect(behavior.canConsume(m, 'circuit_basic')).toBe(false)
      expect(behavior.canConsume(m, 'robot_explorer')).toBe(false)
    })
  })

  describe('MACHINE_BEHAVIORS.part_fabricator.canAcceptItemType', () => {
    it("returns true for the output type when an input slot is free, regardless of outputSlot state", () => {
      const m = new Machine('pf', 'part_fabricator')
      m.setRecipe(recipe('wheel_press_small'))
      expect(m.outputSlot).toBeNull()
      expect(behavior.canAcceptItemType(m, 'wheel_small')).toBe(true)

      // Even with the output slot occupied, acceptance is gated on the
      // INPUT queue capacity (not the output slot). The arriving item now
      // queues in inputSlots and waits its turn to be moved to output.
      m.outputSlot = createItem('wheel_small')
      expect(behavior.canAcceptItemType(m, 'wheel_small')).toBe(true)
    })

    it("returns false for the output type once the input queue is full", () => {
      const m = new Machine('pf', 'part_fabricator')
      m.setRecipe(recipe('wheel_press_small'))
      for (let i = 0; i < m.maxInputSlots; i++) {
        m.inputSlots.push(createItem('wheel_small'))
      }
      expect(behavior.canAcceptItemType(m, 'wheel_small')).toBe(false)
    })

    it('returns false for any non-output type even when input slots are empty', () => {
      const m = new Machine('pf', 'part_fabricator')
      m.setRecipe(recipe('wheel_press_small'))
      expect(behavior.canAcceptItemType(m, 'wheel_medium')).toBe(false)
      expect(behavior.canAcceptItemType(m, 'chassis_light')).toBe(false)
    })

    it('returns false when no recipe is set', () => {
      const m = new Machine('pf', 'part_fabricator')
      expect(behavior.canAcceptItemType(m, 'wheel_small')).toBe(false)
    })
  })

  describe('matching-item ingestion via Machine.addInput', () => {
    it('queues the arriving output-type item in inputSlots (NOT outputSlot)', () => {
      const m = new Machine('pf', 'part_fabricator')
      m.setRecipe(recipe('wheel_press_small'))
      const arriving = createItem('wheel_small')

      const accepted = m.addInput(arriving)

      expect(accepted).toBe(true)
      expect(m.outputSlot).toBeNull()
      expect(m.inputSlots).toHaveLength(1)
      expect(m.inputSlots[0].id).toBe(arriving.id)
      expect(m.inputSlots[0].type).toBe('wheel_small')
    })

    it('rejects a non-output-type arrival (still a fatal mis-routing case)', () => {
      const m = new Machine('pf', 'part_fabricator')
      m.setRecipe(recipe('wheel_press_small'))
      const arriving = createItem('wheel_medium')

      const accepted = m.addInput(arriving)

      expect(accepted).toBe(false)
      expect(m.inputSlots).toHaveLength(0)
      expect(m.outputSlot).toBeNull()
    })

    it('accepts multiple matching arrivals up to maxInputSlots, then rejects the next one', () => {
      const m = new Machine('pf', 'part_fabricator')
      m.setRecipe(recipe('wheel_press_small'))

      for (let i = 0; i < m.maxInputSlots; i++) {
        expect(m.addInput(createItem('wheel_small'))).toBe(true)
      }
      expect(m.addInput(createItem('wheel_small'))).toBe(false)
      expect(m.inputSlots).toHaveLength(m.maxInputSlots)
    })
  })

  describe('tick moves a queued matching item to outputSlot (prefer-consume rule)', () => {
    it('moves the queued matching item to outputSlot WITHOUT starting a production cycle', () => {
      const m = new Machine('pf', 'part_fabricator')
      m.setRecipe(recipe('wheel_press_small'))
      m.start()
      const arriving = createItem('wheel_small')
      m.addInput(arriving)

      // ASSERT — pre-tick: item is queued in inputSlots, not in output.
      expect(m.inputSlots).toHaveLength(1)
      expect(m.outputSlot).toBeNull()
      expect(m.processingTimer).toBe(0)
      expect(m.state).toBe('idle')

      // WHEN
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)

      // THEN — moved from input to output; no processing cycle started.
      expect(m.inputSlots).toHaveLength(0)
      expect(m.outputSlot).not.toBeNull()
      expect(m.outputSlot!.id).toBe(arriving.id)
      expect(m.outputSlot!.type).toBe('wheel_small')
      expect(m.state).toBe('idle')
      expect(m.processingTimer).toBe(0)
    })

    it('preserves item identity and the defective flag through the input-to-output move', () => {
      const m = new Machine('pf', 'part_fabricator')
      m.setRecipe(recipe('wheel_press_small'))
      m.start()
      const arriving = createItem('wheel_small')
      arriving.isDefective = true

      m.addInput(arriving)
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)

      expect(m.outputSlot).not.toBeNull()
      expect(m.outputSlot!.id).toBe(arriving.id)
      expect(m.outputSlot!.isDefective).toBe(true)
    })
  })
})
