import { describe, it, expect } from 'vitest'
import { getRecipeById, getAllRecipes } from '../../../src/game/Recipe'
import { Machine } from '../../../src/game/Machine'

const REMOVED_RECIPE_IDS = [
  'assemble_robot_guardian',
  'assemble_sensor_array_basic',
  'assemble_sensor_array_advanced',
  'sensor_fab_proximity',
  'sensor_fab_camera',
  'sensor_fab_lidar',
] as const

const SURVIVING_RECIPE_IDS = [
  // Fabricator
  'wheel_press_small',
  'wheel_press_medium',
  'wheel_press_large',
  'battery_assembly_standard',
  'battery_assembly_high',
  'chassis_stamper_light',
  'chassis_stamper_heavy',
  'circuit_printer_basic',
  'circuit_printer_advanced',
  // Assembler
  'assemble_drivetrain_basic',
  'assemble_drivetrain_advanced',
  'assemble_power_unit_standard',
  'assemble_power_unit_high',
  'assemble_robot_explorer',
  'assemble_robot_worker',
] as const

const REMOVED_ITEM_TYPES = [
  'sensor_proximity',
  'sensor_camera',
  'sensor_lidar',
  'sensor_array_basic',
  'sensor_array_advanced',
  'robot_guardian',
  'raw_material',
] as const

describe('Recipe cleanup — sensor/guardian/raw_material removal', () => {
  describe('removed recipes', () => {
    for (const id of REMOVED_RECIPE_IDS) {
      it(`getRecipeById('${id}') returns undefined`, () => {
        expect(getRecipeById(id)).toBeUndefined()
      })
    }
  })

  describe('surviving recipe registry', () => {
    it('getAllRecipes() length matches the surviving set', () => {
      expect(getAllRecipes().length).toBe(SURVIVING_RECIPE_IDS.length)
    })

    for (const id of SURVIVING_RECIPE_IDS) {
      it(`contains '${id}'`, () => {
        expect(getRecipeById(id)).toBeDefined()
      })
    }
  })

  describe('robot recipes use 3 inputs', () => {
    it('assemble_robot_explorer has exactly chassis_light, drivetrain_basic, power_unit_standard (each ×1)', () => {
      const r = getRecipeById('assemble_robot_explorer')
      expect(r).toBeDefined()
      expect(r!.inputs.length).toBe(3)
      const map = new Map(r!.inputs.map((i) => [i.type, i.quantity]))
      expect(map.get('chassis_light')).toBe(1)
      expect(map.get('drivetrain_basic')).toBe(1)
      expect(map.get('power_unit_standard')).toBe(1)
    })

    it('assemble_robot_worker has exactly chassis_heavy, drivetrain_advanced, power_unit_high (each ×1)', () => {
      const r = getRecipeById('assemble_robot_worker')
      expect(r).toBeDefined()
      expect(r!.inputs.length).toBe(3)
      const map = new Map(r!.inputs.map((i) => [i.type, i.quantity]))
      expect(map.get('chassis_heavy')).toBe(1)
      expect(map.get('drivetrain_advanced')).toBe(1)
      expect(map.get('power_unit_high')).toBe(1)
    })

    it('no surviving recipe has more than 3 inputs', () => {
      for (const r of getAllRecipes()) {
        expect(r.inputs.length, `${r.id} has too many inputs`).toBeLessThanOrEqual(3)
      }
    })
  })

  describe('removed item types do not appear in any recipe', () => {
    for (const t of REMOVED_ITEM_TYPES) {
      it(`'${t}' is not referenced as a recipe input or output`, () => {
        for (const r of getAllRecipes()) {
          for (const inp of r.inputs) {
            expect(inp.type, `${r.id} input references removed type ${t}`).not.toBe(t)
          }
          for (const out of r.outputs) {
            expect(out.type, `${r.id} output references removed type ${t}`).not.toBe(t)
          }
        }
      })
    }
  })

  describe('Assembler default maxInputSlots', () => {
    it('Machine("m1","assembler") default constructor has maxInputSlots === 3', () => {
      const m = new Machine('m1', 'assembler')
      expect(m.maxInputSlots).toBe(3)
    })
  })

  describe('removed item types are not assignable to ItemType (compile-time)', () => {
    // These @ts-expect-error directives will be INACTIVE while the types
    // still exist (tsc will report each as an unused expect-error).
    // After the GREEN step removes these variants from `ItemType`, the
    // directives become active and tsc passes.
    it('removed ItemType variants fail to type-check', () => {
      // @ts-expect-error — 'sensor_proximity' must be removed from ItemType
      const a: import('../../../src/game/types').ItemType = 'sensor_proximity'
      // @ts-expect-error — 'sensor_camera' must be removed from ItemType
      const b: import('../../../src/game/types').ItemType = 'sensor_camera'
      // @ts-expect-error — 'sensor_lidar' must be removed from ItemType
      const c: import('../../../src/game/types').ItemType = 'sensor_lidar'
      // @ts-expect-error — 'sensor_array_basic' must be removed from ItemType
      const d: import('../../../src/game/types').ItemType = 'sensor_array_basic'
      // @ts-expect-error — 'sensor_array_advanced' must be removed from ItemType
      const e: import('../../../src/game/types').ItemType = 'sensor_array_advanced'
      // @ts-expect-error — 'robot_guardian' must be removed from ItemType
      const f: import('../../../src/game/types').ItemType = 'robot_guardian'
      // @ts-expect-error — 'raw_material' must be removed from ItemType
      const g: import('../../../src/game/types').ItemType = 'raw_material'
      void a; void b; void c; void d; void e; void f; void g
      expect(true).toBe(true)
    })
  })
})
