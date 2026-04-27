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
    it('accepts any item type', () => {
      // GIVEN
      const m = new Machine('out1', 'factory_output')

      // THEN
      expect(m.canConsume('wheel_small')).toBe(true)
      expect(m.canConsume('robot_guardian')).toBe(true)
      expect(m.canConsume('raw_material')).toBe(true)
    })
  })

  describe('pass-through machines', () => {
    it('quality_checker accepts any item type', () => {
      // GIVEN
      const m = new Machine('qc1', 'quality_checker')

      // THEN
      expect(m.canConsume('wheel_small')).toBe(true)
      expect(m.canConsume('chassis_heavy')).toBe(true)
    })

    it('splitter accepts any item type', () => {
      // GIVEN
      const m = new Machine('sp1', 'splitter')

      // THEN
      expect(m.canConsume('wheel_small')).toBe(true)
      expect(m.canConsume('sensor_lidar')).toBe(true)
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
      expect(m.canConsume('raw_material')).toBe(false)
    })

    it('rejects everything when its recipe has zero inputs', () => {
      // GIVEN — wheel_press_small is a zero-input fabricator recipe.
      const m = new Machine('pf2', 'part_fabricator')
      m.setRecipe(recipe('wheel_press_small'))

      // ASSERT — confirm the recipe really has no inputs.
      expect(recipe('wheel_press_small').inputs).toHaveLength(0)

      // THEN — nothing is consumable.
      expect(m.canConsume('wheel_small')).toBe(false)
      expect(m.canConsume('raw_material')).toBe(false)
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
      expect(m.canConsume('sensor_lidar')).toBe(false)
      expect(m.canConsume('chassis_light')).toBe(false)
      expect(m.canConsume('robot_explorer')).toBe(false)
    })

    it('accepts each input type for a multi-input robot recipe', () => {
      // GIVEN — assemble_robot_explorer:
      //   inputs = chassis_light + drivetrain_basic + sensor_array_basic + power_unit_standard
      const m = new Machine('asm3', 'assembler')
      m.setRecipe(recipe('assemble_robot_explorer'))

      // THEN — every recipe input is consumable.
      const accepted: ItemType[] = [
        'chassis_light',
        'drivetrain_basic',
        'sensor_array_basic',
        'power_unit_standard',
      ]
      for (const type of accepted) {
        expect(m.canConsume(type)).toBe(true)
      }

      // THEN — non-recipe types are rejected.
      expect(m.canConsume('chassis_heavy')).toBe(false)
      expect(m.canConsume('wheel_small')).toBe(false)
      expect(m.canConsume('raw_material')).toBe(false)
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
      expect(m.canConsume('raw_material')).toBe(false)
    })
  })
})
