import { describe, it, expect } from 'vitest'
import { Machine } from '../../../src/game/Machine'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'
import type { ItemType } from '../../../src/game/types'

// --- Helpers ---

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

/**
 * Painter recipes are not yet defined in the production registry, so we
 * fabricate a representative one inline. The shape mirrors a typical
 * painter recipe: takes a robot input and outputs the same robot type.
 */
function paintRobotExplorerRecipe(): Recipe {
  return {
    id: 'paint_robot_explorer_test',
    inputs: [{ type: 'robot_explorer', quantity: 1 }],
    outputs: [{ type: 'robot_explorer', quantity: 1 }],
    processingTicks: 5,
    machineType: 'painter',
  }
}

describe('Machine.canConsume', () => {
  describe('factory_output', () => {
    it('accepts any item type when enabled', () => {
      // GIVEN
      const m = new Machine('out1', 'factory_output')
      m.start()

      // THEN
      expect(m.canConsume('wheel_small')).toBe(true)
      expect(m.canConsume('robot_worker')).toBe(true)
      expect(m.canConsume('drivetrain_basic')).toBe(true)
    })

    it('rejects every item type while disabled', () => {
      // GIVEN
      const m = new Machine('out1', 'factory_output')

      // THEN
      expect(m.canConsume('wheel_small')).toBe(false)
      expect(m.canConsume('robot_worker')).toBe(false)
      expect(m.canConsume('drivetrain_basic')).toBe(false)
    })
  })

  describe('pass-through machines', () => {
    it('splitter accepts any item type', () => {
      // GIVEN
      const m = new Machine('sp1', 'splitter')

      // THEN
      expect(m.canConsume('wheel_small')).toBe(true)
      expect(m.canConsume('drivetrain_basic')).toBe(true)
    })

    it('recycler accepts any item type', () => {
      // GIVEN
      const m = new Machine('rc1', 'recycler')

      // THEN
      expect(m.canConsume('wheel_small')).toBe(true)
      expect(m.canConsume('robot_worker')).toBe(true)
    })
  })

  describe('part_fabricator', () => {
    it('rejects everything when no recipe is set', () => {
      // GIVEN
      const m = new Machine('pf1', 'part_fabricator')

      // THEN
      expect(m.canConsume('wheel_small')).toBe(false)
      expect(m.canConsume('chassis_light')).toBe(false)
      expect(m.canConsume('circuit_advanced')).toBe(false)
    })

    it('with zero-input recipe, accepts the configured output type as pass-through and rejects everything else', () => {
      // INTENTIONAL, USER-CONFIRMED BEHAVIOR CHANGE: a Fabricator whose
      // recipe has zero inputs now passes through arriving items of its
      // configured output type (no resource consumption, no Game Over).
      // Arrivals of any other type remain a Game Over condition, which
      // canConsume reports by returning false.
      const m = new Machine('pf2', 'part_fabricator')
      m.setRecipe(recipe('wheel_press_small'))

      // ASSERT — confirm the recipe really has no inputs and produces wheel_small.
      expect(recipe('wheel_press_small').inputs).toHaveLength(0)
      expect(recipe('wheel_press_small').outputs[0].type).toBe('wheel_small')

      // THEN — output-matching type is consumable (pass-through).
      expect(m.canConsume('wheel_small')).toBe(true)
      // THEN — any other type is still rejected.
      expect(m.canConsume('chassis_light')).toBe(false)
    })
  })

  describe('assembler', () => {
    it('rejects everything when no recipe is set', () => {
      // GIVEN
      const m = new Machine('asm1', 'assembler')

      // THEN
      expect(m.canConsume('wheel_small')).toBe(false)
      expect(m.canConsume('chassis_light')).toBe(false)
    })

    it('accepts only types listed in recipe.inputs', () => {
      // GIVEN — assemble_drivetrain_basic: inputs = wheel_small + circuit_basic
      const m = new Machine('asm2', 'assembler')
      m.setRecipe(recipe('assemble_drivetrain_basic'))

      // THEN — accepted inputs.
      expect(m.canConsume('wheel_small')).toBe(true)
      expect(m.canConsume('circuit_basic')).toBe(true)

      // THEN — rejected non-inputs.
      expect(m.canConsume('chassis_light')).toBe(false)
      expect(m.canConsume('robot_explorer')).toBe(false)
    })

    it('accepts each input type for a multi-input robot recipe', () => {
      // GIVEN — assemble_robot_explorer:
      //   inputs = chassis_light + drivetrain_basic + power_unit_standard
      const m = new Machine('asm3', 'assembler')
      m.setRecipe(recipe('assemble_robot_explorer'))

      // THEN — every recipe input is consumable.
      const accepted: ItemType[] = [
        'chassis_light',
        'drivetrain_basic',
        'power_unit_standard',
      ]
      for (const type of accepted) {
        expect(m.canConsume(type)).toBe(true)
      }

      // THEN — non-recipe types are rejected.
      expect(m.canConsume('chassis_heavy')).toBe(false)
      expect(m.canConsume('wheel_small')).toBe(false)
      expect(m.canConsume('drivetrain_advanced')).toBe(false)
    })
  })

  describe('painter', () => {
    it('rejects everything when no recipe is set', () => {
      // GIVEN
      const m = new Machine('pt1', 'painter')

      // THEN
      expect(m.canConsume('robot_explorer')).toBe(false)
      expect(m.canConsume('wheel_small')).toBe(false)
    })

    it('accepts only types listed in its recipe.inputs', () => {
      // GIVEN
      const m = new Machine('pt2', 'painter')
      m.setRecipe(paintRobotExplorerRecipe())

      // THEN
      expect(m.canConsume('robot_explorer')).toBe(true)

      // THEN — non-input types are rejected.
      expect(m.canConsume('robot_worker')).toBe(false)
      expect(m.canConsume('wheel_small')).toBe(false)
      expect(m.canConsume('chassis_light')).toBe(false)
    })
  })
})
