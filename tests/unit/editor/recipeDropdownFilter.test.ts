import { describe, it, expect } from 'vitest'
import {
  filterRecipeOptions,
  resolveRecipeOptionsForBlock,
  buildRecipeDropdownEntries,
  pickValidRecipeForMachineType,
  type RecipeDropdownEntry,
} from '../../../src/editor/recipeDropdownFilter.ts'
import { RECIPE_TABLE } from '../../../src/editor/enumTables.ts'
import { getAllRecipes, getRecipeById } from '../../../src/game/Recipe.ts'

/**
 * Labels mirror the //% block="..." annotations in
 * pxt-target/libs/core/enums.d.ts (Recipe enum). These are what PXT
 * actually puts into the dropdown tuples it generates for the patched
 * FieldDropdown.prototype.getOptions interception point.
 */
const PXT_RECIPE_OPTIONS: readonly [string, string][] = [
  ['Small Wheels', 'Recipe.WheelPressSmall'],
  ['Medium Wheels', 'Recipe.WheelPressMedium'],
  ['Large Wheels', 'Recipe.WheelPressLarge'],
  ['Standard Batteries', 'Recipe.BatteryAssemblyStandard'],
  ['High-Cap Batteries', 'Recipe.BatteryAssemblyHigh'],
  ['Light Chassis', 'Recipe.ChassisStamperLight'],
  ['Heavy Chassis', 'Recipe.ChassisStamperHeavy'],
  ['Basic Circuits', 'Recipe.CircuitPrinterBasic'],
  ['Advanced Circuits', 'Recipe.CircuitPrinterAdvanced'],
  ['Basic Drivetrain', 'Recipe.AssembleDrivetrainBasic'],
  ['Adv. Drivetrain', 'Recipe.AssembleDrivetrainAdvanced'],
  ['Std. Power Unit', 'Recipe.AssemblePowerUnitStandard'],
  ['High Power Unit', 'Recipe.AssemblePowerUnitHigh'],
  ['Explorer Robot', 'Recipe.AssembleRobotExplorer'],
  ['Worker Robot', 'Recipe.AssembleRobotWorker'],
]

const FABRICATOR_VALUES = [
  'Recipe.WheelPressSmall',
  'Recipe.WheelPressMedium',
  'Recipe.WheelPressLarge',
  'Recipe.BatteryAssemblyStandard',
  'Recipe.BatteryAssemblyHigh',
  'Recipe.ChassisStamperLight',
  'Recipe.ChassisStamperHeavy',
  'Recipe.CircuitPrinterBasic',
  'Recipe.CircuitPrinterAdvanced',
]

const ASSEMBLER_VALUES = [
  'Recipe.AssembleDrivetrainBasic',
  'Recipe.AssembleDrivetrainAdvanced',
  'Recipe.AssemblePowerUnitStandard',
  'Recipe.AssemblePowerUnitHigh',
  'Recipe.AssembleRobotExplorer',
  'Recipe.AssembleRobotWorker',
]

function buildAllEntries(): RecipeDropdownEntry[] {
  return RECIPE_TABLE.map(({ enumName, id }) => {
    const recipe = getRecipeById(id)
    if (!recipe) throw new Error(`Recipe id missing in fixture: ${id}`)
    return {
      enumName,
      id,
      machineType: recipe.machineType,
      label: enumName,
    }
  })
}

describe('filterRecipeOptions', () => {
  it('returns only fabricator-recipe tuples preserving their PXT labels', () => {
    const entries = buildAllEntries()
    const opts = filterRecipeOptions(PXT_RECIPE_OPTIONS, entries, 'part_fabricator')

    const expected = PXT_RECIPE_OPTIONS.filter(([, v]) => FABRICATOR_VALUES.includes(v))
    expect(opts).toEqual(expected)
    // Sanity: labels must be the localized PXT labels, NOT enum names.
    expect(opts.map(([label]) => label)).toContain('Small Wheels')
    expect(opts.map(([label]) => label)).not.toContain('WheelPressSmall')
  })

  it('returns only assembler-recipe tuples preserving their PXT labels', () => {
    const entries = buildAllEntries()
    const opts = filterRecipeOptions(PXT_RECIPE_OPTIONS, entries, 'assembler')

    const expected = PXT_RECIPE_OPTIONS.filter(([, v]) => ASSEMBLER_VALUES.includes(v))
    expect(opts).toEqual(expected)
    expect(opts.map(([label]) => label)).toContain('Adv. Drivetrain')
    expect(opts.map(([label]) => label)).not.toContain('AssembleDrivetrainAdvanced')
  })

  it('returns origOptions unchanged when machineType is undefined', () => {
    const entries = buildAllEntries()
    const opts = filterRecipeOptions(PXT_RECIPE_OPTIONS, entries, undefined)
    expect(opts).toEqual(PXT_RECIPE_OPTIONS)
  })

  it('falls back to origOptions unchanged when no recipes match the machineType (splitter)', () => {
    const entries = buildAllEntries()
    const opts = filterRecipeOptions(PXT_RECIPE_OPTIONS, entries, 'splitter')
    expect(opts).toEqual(PXT_RECIPE_OPTIONS)
  })

  it('label preservation: returned labels equal input labels verbatim, not enum names', () => {
    const entries = buildAllEntries()
    const opts = filterRecipeOptions(PXT_RECIPE_OPTIONS, entries, 'part_fabricator')
    for (const [label, value] of opts) {
      const original = PXT_RECIPE_OPTIONS.find(([, v]) => v === value)
      expect(original).toBeDefined()
      expect(label).toBe(original![0])
      expect(label).not.toBe(value.slice('Recipe.'.length))
    }
  })
})

/**
 * Minimal Blockly block stand-in used by resolveRecipeOptionsForBlock.
 * Mirrors the real Blockly API surface the production code touches:
 *   - block.getInputTargetBlock(name) -> Block | null
 *   - block.getField(name) -> Field | null
 *   - field.getValue() -> string
 */
function makeBlockWithShadowMachine(value: string | null) {
  const shadow = value === null ? null : {
    getField(name: string) {
      if (name !== 'machine') return null
      return { getValue: () => value }
    },
  }
  return {
    getInputTargetBlock(name: string) {
      return name === 'machine' ? shadow : null
    },
    // Direct getField on the host block must NOT yield the value — PXT
    // generates the machine slot as a value input with a shadow reporter.
    getField(_name: string) {
      return null
    },
  }
}

function makeLegacyBlockWithDirectField(value: string) {
  return {
    // No getInputTargetBlock available (legacy / older Blockly surface).
    getField(name: string) {
      if (name !== 'machine') return null
      return { getValue: () => value }
    },
  }
}

const MACHINE_MEMBERS_8 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

describe('resolveRecipeOptionsForBlock', () => {
  it('reads machine value via the connected shadow reporter (fabricator slot)', () => {
    const block = makeBlockWithShadowMachine('Machine.A')
    const iframeWindow = {
      __rf_machineItems: [{ slotIndex: 0, id: 'm1', name: 'Fab1', type: 'part_fabricator' }],
      __rf_machineMembers: MACHINE_MEMBERS_8,
      __rf_recipeEntries: buildRecipeDropdownEntries(),
    }

    const opts = resolveRecipeOptionsForBlock(block, iframeWindow, PXT_RECIPE_OPTIONS)

    const expected = PXT_RECIPE_OPTIONS.filter(([, v]) => FABRICATOR_VALUES.includes(v))
    expect(opts).toEqual(expected)
    expect(opts).toHaveLength(9)
  })

  it('reads machine value via the connected shadow reporter (assembler slot)', () => {
    const block = makeBlockWithShadowMachine('Machine.B')
    const iframeWindow = {
      __rf_machineItems: [{ slotIndex: 1, id: 'm2', name: 'Asm1', type: 'assembler' }],
      __rf_machineMembers: MACHINE_MEMBERS_8,
      __rf_recipeEntries: buildRecipeDropdownEntries(),
    }

    const opts = resolveRecipeOptionsForBlock(block, iframeWindow, PXT_RECIPE_OPTIONS)

    const expected = PXT_RECIPE_OPTIONS.filter(([, v]) => ASSEMBLER_VALUES.includes(v))
    expect(opts).toEqual(expected)
    expect(opts).toHaveLength(6)
  })

  it('falls back to origOptions unchanged when no shadow is connected', () => {
    const block = makeBlockWithShadowMachine(null)
    const iframeWindow = {
      __rf_machineItems: [{ slotIndex: 0, id: 'm1', name: 'Fab1', type: 'part_fabricator' }],
      __rf_machineMembers: MACHINE_MEMBERS_8,
      __rf_recipeEntries: buildRecipeDropdownEntries(),
    }

    const opts = resolveRecipeOptionsForBlock(block, iframeWindow, PXT_RECIPE_OPTIONS)
    expect(opts).toEqual(PXT_RECIPE_OPTIONS)
  })

  it('falls back to origOptions unchanged when the slot index is not present in __rf_machineItems', () => {
    const block = makeBlockWithShadowMachine('Machine.C')
    const iframeWindow = {
      __rf_machineItems: [{ slotIndex: 0, id: 'm1', name: 'Fab1', type: 'part_fabricator' }],
      __rf_machineMembers: MACHINE_MEMBERS_8,
      __rf_recipeEntries: buildRecipeDropdownEntries(),
    }

    const opts = resolveRecipeOptionsForBlock(block, iframeWindow, PXT_RECIPE_OPTIONS)
    expect(opts).toEqual(PXT_RECIPE_OPTIONS)
  })

  it('resilience: falls back to legacy block.getField path when getInputTargetBlock is unavailable', () => {
    // Defends against Blockly API drift / older surface where the value
    // input was modelled as a direct field rather than a child reporter.
    const block = makeLegacyBlockWithDirectField('Machine.A')
    const iframeWindow = {
      __rf_machineItems: [{ slotIndex: 0, id: 'm1', name: 'Fab1', type: 'part_fabricator' }],
      __rf_machineMembers: MACHINE_MEMBERS_8,
      __rf_recipeEntries: buildRecipeDropdownEntries(),
    }

    const opts = resolveRecipeOptionsForBlock(block, iframeWindow, PXT_RECIPE_OPTIONS)
    const expected = PXT_RECIPE_OPTIONS.filter(([, v]) => FABRICATOR_VALUES.includes(v))
    expect(opts).toEqual(expected)
  })
})

describe('recipe data source integrity', () => {
  it('has exactly 15 recipes from getAllRecipes()', () => {
    expect(getAllRecipes()).toHaveLength(15)
  })

  it('every RECIPE_TABLE entry maps to a real recipe and the count matches getAllRecipes()', () => {
    expect(RECIPE_TABLE).toHaveLength(getAllRecipes().length)

    for (const entry of RECIPE_TABLE) {
      const recipe = getRecipeById(entry.id)
      expect(recipe, `recipe id ${entry.id}`).toBeDefined()
    }
  })

  it('every RecipeDropdownEntry machineType matches the canonical recipe definition', () => {
    for (const entry of buildRecipeDropdownEntries()) {
      const recipe = getRecipeById(entry.id)
      expect(recipe, `recipe id ${entry.id}`).toBeDefined()
      expect(recipe!.machineType).toBe(entry.machineType)
    }
  })
})

describe('pickValidRecipeForMachineType', () => {
  it('keeps current fabricator recipe when machineType is part_fabricator', () => {
    const entries = buildRecipeDropdownEntries()
    const result = pickValidRecipeForMachineType('Recipe.WheelPressSmall', entries, 'part_fabricator')
    expect(result).toBe('Recipe.WheelPressSmall')
  })

  it('auto-resets fabricator recipe to first assembler recipe when machineType switches to assembler', () => {
    const entries = buildRecipeDropdownEntries()
    const result = pickValidRecipeForMachineType('Recipe.WheelPressSmall', entries, 'assembler')
    expect(result).toBe('Recipe.AssembleDrivetrainBasic')
  })

  it('auto-resets assembler recipe to first fabricator recipe when machineType switches to part_fabricator', () => {
    const entries = buildRecipeDropdownEntries()
    const result = pickValidRecipeForMachineType('Recipe.AssembleRobotWorker', entries, 'part_fabricator')
    expect(result).toBe('Recipe.WheelPressSmall')
  })

  it('returns currentValue unchanged when machineType is undefined', () => {
    const entries = buildRecipeDropdownEntries()
    const result = pickValidRecipeForMachineType('Recipe.WheelPressSmall', entries, undefined)
    expect(result).toBe('Recipe.WheelPressSmall')
  })

  it('returns currentValue unchanged when machineType has no recipes (splitter)', () => {
    const entries = buildRecipeDropdownEntries()
    const result = pickValidRecipeForMachineType('Recipe.WheelPressSmall', entries, 'splitter')
    expect(result).toBe('Recipe.WheelPressSmall')
  })

  it('picks first fabricator recipe when currentValue is null and machineType is part_fabricator', () => {
    const entries = buildRecipeDropdownEntries()
    const result = pickValidRecipeForMachineType(null, entries, 'part_fabricator')
    expect(result).toBe('Recipe.WheelPressSmall')
  })

  it('replaces unknown currentValue with first assembler recipe when machineType is assembler', () => {
    const entries = buildRecipeDropdownEntries()
    const result = pickValidRecipeForMachineType('Recipe.NonExistent', entries, 'assembler')
    expect(result).toBe('Recipe.AssembleDrivetrainBasic')
  })
})

describe('resolveRecipeOptionsForBlock — read-only', () => {
  it('does NOT mutate the block or its machine field (no auto-reset side-effect)', () => {
    // resolveRecipeOptionsForBlock must remain a pure query: it only
    // returns filtered options. The auto-reset of a now-invalid recipe
    // field belongs to pickValidRecipeForMachineType + the caller that
    // wires a Blockly change listener — never to the dropdown filter.
    const setValueCalls: string[] = []
    const shadow = {
      getField(name: string) {
        if (name !== 'machine') return null
        return {
          getValue: () => 'Machine.A',
          setValue: (v: string) => { setValueCalls.push(`shadow.machine=${v}`) },
        }
      },
    }
    const recipeField = {
      getValue: () => 'Recipe.WheelPressSmall',
      setValue: (v: string) => { setValueCalls.push(`block.recipe=${v}`) },
    }
    const block = {
      getInputTargetBlock(name: string) { return name === 'machine' ? shadow : null },
      getField(name: string) { return name === 'recipe' ? recipeField : null },
    }
    const iframeWindow = {
      // Slot type is assembler — WheelPressSmall is NO LONGER valid here.
      __rf_machineItems: [{ slotIndex: 0, id: 'm1', name: 'Asm1', type: 'assembler' }],
      __rf_machineMembers: MACHINE_MEMBERS_8,
      __rf_recipeEntries: buildRecipeDropdownEntries(),
    }

    const opts = resolveRecipeOptionsForBlock(block, iframeWindow, PXT_RECIPE_OPTIONS)

    // Options are correctly filtered to assembler set...
    const expected = PXT_RECIPE_OPTIONS.filter(([, v]) => ASSEMBLER_VALUES.includes(v))
    expect(opts).toEqual(expected)
    // ...but no setValue was called on either field (no mutation).
    expect(setValueCalls).toEqual([])
  })
})
