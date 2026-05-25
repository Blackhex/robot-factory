/**
 * @vitest-environment jsdom
 *
 * RED-phase tests for MachinePanel recipe-details rows.
 *
 * Spec: MachineRuntimeInfo gains `recipeInputs` and `recipeOutputs`
 * (ReadonlyArray<{ type: ItemType; quantity: number }>). The panel
 * renders two new runtime rows ("Needs" / "Makes" — keys
 * `machine_panel.recipe_inputs` / `machine_panel.recipe_outputs`)
 * that show a comma-joined "<qty>× <singular item name>" summary
 * using `items.<itemType>`. Rows are hidden when no recipe is set
 * (or list is empty). They sit immediately after the Recipe row
 * and before the State row. The dirty-check on setRuntimeInfo must
 * detect changes in recipeInputs/recipeOutputs.
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest'
import { initI18n, i18next } from '../../../src/i18n/i18n'
import { MachinePanel, type MachineRuntimeInfo } from '../../../src/ui/MachinePanel'
import type { MachineInfo } from '../../../src/game/Factory'
import type { Direction } from '../../../src/game/types'

beforeAll(async () => {
  await initI18n()
})

const fakeMachine: MachineInfo = {
  id: 'machine_1',
  name: '',
  type: 'assembler',
  x: 2,
  z: 3,
  rotation: 'south' as Direction,
  slots: { inputs: ['back'], outputs: ['front'] },
}

function findRowByKey(parent: HTMLElement, key: string): HTMLElement | null {
  const label = parent.querySelector<HTMLElement>(`[data-i18n-key="${key}"]`)
  if (!label) return null
  // The row is the label's parent .ui-machine-panel-row
  return label.closest<HTMLElement>('.ui-machine-panel-row')
}

function rowValue(parent: HTMLElement, key: string): string {
  const row = findRowByKey(parent, key)
  if (!row) throw new Error(`row with key ${key} not found`)
  const value = row.querySelector<HTMLElement>('.ui-machine-panel-value')
  return (value?.textContent ?? '').trim()
}

function rowVisible(parent: HTMLElement, key: string): boolean {
  const row = findRowByKey(parent, key)
  if (!row) return false
  return row.style.display !== 'none'
}

describe('MachinePanel recipe inputs/outputs rows', () => {
  let parent: HTMLDivElement
  let panel: MachinePanel

  beforeEach(() => {
    parent = document.createElement('div')
    panel = new MachinePanel(parent)
    panel.setMachine(fakeMachine)
  })

  afterEach(async () => {
    if (i18next.language !== 'en') {
      await i18next.changeLanguage('en')
    }
  })

  it('shows recipe_inputs row with comma-separated qty × name when a recipe is set with inputs', () => {
    const info: MachineRuntimeInfo = {
      state: 'idle',
      recipeName: 'Basic Drivetrain',
      itemsProduced: 0,
      inputs: [],
      recipeInputs: [
        { type: 'wheel_small', quantity: 2 },
        { type: 'chassis_light', quantity: 1 },
      ],
      recipeOutputs: [{ type: 'drivetrain_basic', quantity: 1 }],
    }
    panel.setRuntimeInfo(info)

    expect(rowVisible(parent, 'machine_panel.recipe_inputs')).toBe(true)
    expect(rowVisible(parent, 'machine_panel.recipe_outputs')).toBe(true)
    expect(rowValue(parent, 'machine_panel.recipe_inputs')).toBe(
      '2× Small Wheel, 1× Light Chassis',
    )
    expect(rowValue(parent, 'machine_panel.recipe_outputs')).toBe(
      '1× Basic Drivetrain',
    )
  })

  it('hides recipe_inputs / recipe_outputs rows when recipeName is null', () => {
    const info: MachineRuntimeInfo = {
      state: 'idle',
      recipeName: null,
      itemsProduced: 0,
      inputs: [],
      recipeInputs: [],
      recipeOutputs: [],
    }
    panel.setRuntimeInfo(info)

    expect(rowVisible(parent, 'machine_panel.recipe_inputs')).toBe(false)
    expect(rowVisible(parent, 'machine_panel.recipe_outputs')).toBe(false)
  })

  it('hides recipe_inputs / recipe_outputs rows when info is null', () => {
    panel.setRuntimeInfo(null)

    expect(rowVisible(parent, 'machine_panel.recipe_inputs')).toBe(false)
    expect(rowVisible(parent, 'machine_panel.recipe_outputs')).toBe(false)
  })

  it('DOM order — recipe_inputs and recipe_outputs sit between Recipe and State', () => {
    const info: MachineRuntimeInfo = {
      state: 'processing',
      recipeName: 'Basic Drivetrain',
      itemsProduced: 1,
      inputs: [{ type: 'wheel_small', quantity: 1 }],
      recipeInputs: [{ type: 'wheel_small', quantity: 2 }],
      recipeOutputs: [{ type: 'drivetrain_basic', quantity: 1 }],
    }
    panel.setRuntimeInfo(info)

    const props = parent.querySelector('.ui-machine-panel-props')
    if (!props) throw new Error('props container not found')
    const rows = Array.from(
      props.querySelectorAll<HTMLElement>(':scope > .ui-machine-panel-row'),
    )
    const keys = rows.map((r) => {
      const labeled = r.querySelector<HTMLElement>('[data-i18n-key]')
      return labeled?.dataset.i18nKey ?? '(info)'
    })

    const idxRecipe = keys.indexOf('machine_panel.recipe')
    const idxInputs = keys.indexOf('machine_panel.recipe_inputs')
    const idxOutputs = keys.indexOf('machine_panel.recipe_outputs')
    const idxState = keys.indexOf('machine_panel.state')

    expect(idxRecipe).toBeGreaterThanOrEqual(0)
    expect(idxInputs).toBe(idxRecipe + 1)
    expect(idxOutputs).toBe(idxRecipe + 2)
    expect(idxState).toBe(idxRecipe + 3)
  })

  it('re-rendering with changed recipeInputs updates the displayed value', () => {
    const base: MachineRuntimeInfo = {
      state: 'idle',
      recipeName: 'Basic Drivetrain',
      itemsProduced: 0,
      inputs: [],
      recipeInputs: [{ type: 'wheel_small', quantity: 1 }],
      recipeOutputs: [{ type: 'drivetrain_basic', quantity: 1 }],
    }
    panel.setRuntimeInfo(base)
    expect(rowValue(parent, 'machine_panel.recipe_inputs')).toBe('1× Small Wheel')

    const updated: MachineRuntimeInfo = {
      ...base,
      recipeInputs: [
        { type: 'wheel_small', quantity: 2 },
        { type: 'chassis_light', quantity: 1 },
      ],
    }
    panel.setRuntimeInfo(updated)
    expect(rowValue(parent, 'machine_panel.recipe_inputs')).toBe(
      '2× Small Wheel, 1× Light Chassis',
    )
  })

  it('single-input recipe shows no trailing comma', () => {
    const info: MachineRuntimeInfo = {
      state: 'idle',
      recipeName: 'Pass-through',
      itemsProduced: 0,
      inputs: [],
      recipeInputs: [{ type: 'wheel_small', quantity: 3 }],
      recipeOutputs: [{ type: 'wheel_small', quantity: 3 }],
    }
    panel.setRuntimeInfo(info)

    const value = rowValue(parent, 'machine_panel.recipe_inputs')
    expect(value).toBe('3× Small Wheel')
    expect(value).not.toMatch(/,\s*$/)
    expect(value).not.toMatch(/^\s*,/)
  })

  it('hides recipe_inputs / recipe_outputs rows when recipeName is set but lists are empty', () => {
    const info: MachineRuntimeInfo = {
      state: 'idle',
      recipeName: 'Recycle',
      itemsProduced: 0,
      inputs: [],
      recipeInputs: [],
      recipeOutputs: [],
    }
    panel.setRuntimeInfo(info)

    expect(rowVisible(parent, 'machine_panel.recipe_inputs')).toBe(false)
    expect(rowVisible(parent, 'machine_panel.recipe_outputs')).toBe(false)
  })

  it('renders the Czech label "Potřebuje" for recipe_inputs after switching language to cs', async () => {
    await i18next.changeLanguage('cs')

    const info: MachineRuntimeInfo = {
      state: 'idle',
      recipeName: 'Základní pohon',
      itemsProduced: 0,
      inputs: [],
      recipeInputs: [{ type: 'wheel_small', quantity: 2 }],
      recipeOutputs: [{ type: 'drivetrain_basic', quantity: 1 }],
    }
    panel.setRuntimeInfo(info)

    const label = parent.querySelector<HTMLElement>(
      '[data-i18n-key="machine_panel.recipe_inputs"]',
    )
    expect(label?.textContent).toBe('Potřebuje')

    const outputsLabel = parent.querySelector<HTMLElement>(
      '[data-i18n-key="machine_panel.recipe_outputs"]',
    )
    expect(outputsLabel?.textContent).toBe('Vyrobí')
  })
})
