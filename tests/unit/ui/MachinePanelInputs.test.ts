/**
 * @vitest-environment jsdom
 *
 * RED-phase tests for MachinePanel input-slot summary.
 *
 * Spec: MachineRuntimeInfo gains an `inputs: ReadonlyArray<{ type: ItemType,
 * quantity: number }>` field. The panel renders a 4th runtime row
 * ("Inputs" label + value) that shows either a localized "(empty)"
 * placeholder or a comma-joined "<qty>× <plural-name>" summary.
 *
 * The plural display name is taken from the `parts.<itemType>` locale
 * key; every ItemType must have an entry. The dirty-check on
 * setRuntimeInfo must detect changes in the inputs array.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { initI18n, i18next } from '../../../src/i18n/i18n'
import { MachinePanel, type MachineRuntimeInfo } from '../../../src/ui/MachinePanel'
import type { MachineInfo } from '../../../src/game/Factory'
import type { Direction } from '../../../src/game/types'
import { ALL_ITEM_TYPES } from '../../../src/game/types'
import enLocale from '../../../src/locales/en.json'
import csLocale from '../../../src/locales/cs.json'

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

function getRuntimeRows(parent: HTMLElement): HTMLElement[] {
  return Array.from(parent.querySelectorAll<HTMLElement>('.ui-machine-panel-runtime'))
}

function getInputsRow(parent: HTMLElement): HTMLElement {
  // The Inputs row is the runtime row whose label resolves to the
  // localized `machine_panel.inputs` text.
  const expectedLabel = i18next.t('machine_panel.inputs')
  for (const row of getRuntimeRows(parent)) {
    const label = row.querySelector<HTMLElement>('.ui-machine-panel-label')
    if (label && (label.textContent ?? '').trim() === expectedLabel) {
      return row
    }
  }
  throw new Error(
    `No runtime row found with label "${expectedLabel}". Rows seen: ${getRuntimeRows(parent)
      .map((r) => r.textContent ?? '')
      .join(' | ')}`,
  )
}

function getInputsValue(parent: HTMLElement): string {
  const row = getInputsRow(parent)
  const value = row.querySelector<HTMLElement>('.ui-machine-panel-value')
  return (value?.textContent ?? '').trim()
}

describe('MachinePanel inputs row', () => {
  let parent: HTMLDivElement
  let panel: MachinePanel

  beforeEach(() => {
    parent = document.createElement('div')
    panel = new MachinePanel(parent)
    panel.setMachine(fakeMachine)
  })

  it('renders the localized "(empty)" placeholder when inputs is an empty array', () => {
    const info: MachineRuntimeInfo = {
      state: 'idle',
      recipeName: null,
      itemsProduced: 0,
      inputs: [],
    }
    panel.setRuntimeInfo(info)

    const expected = i18next.t('machine_panel.inputs_empty')
    expect(expected.length).toBeGreaterThan(0)
    expect(getInputsValue(parent)).toBe(expected)
  })

  it('renders a comma-joined summary "2× Small Wheels, 1× Basic Circuits" for two grouped inputs', () => {
    const info: MachineRuntimeInfo = {
      state: 'processing',
      recipeName: 'Basic Drivetrain',
      itemsProduced: 0,
      inputs: [
        { type: 'wheel_small', quantity: 2 },
        { type: 'circuit_basic', quantity: 1 },
      ],
    }
    panel.setRuntimeInfo(info)

    expect(getInputsValue(parent)).toBe('2× Small Wheels, 1× Basic Circuits')
  })

  it('renders a single "3× Small Wheels" entry when only one item type is present', () => {
    const info: MachineRuntimeInfo = {
      state: 'processing',
      recipeName: 'Basic Drivetrain',
      itemsProduced: 0,
      inputs: [{ type: 'wheel_small', quantity: 3 }],
    }
    panel.setRuntimeInfo(info)

    expect(getInputsValue(parent)).toBe('3× Small Wheels')
  })

  it('preserves the order of grouped inputs as supplied by the caller', () => {
    const info: MachineRuntimeInfo = {
      state: 'processing',
      recipeName: 'Basic Drivetrain',
      itemsProduced: 0,
      inputs: [
        { type: 'circuit_basic', quantity: 1 },
        { type: 'wheel_small', quantity: 2 },
      ],
    }
    panel.setRuntimeInfo(info)

    expect(getInputsValue(parent)).toBe('1× Basic Circuits, 2× Small Wheels')
  })

  it('exposes a 6th runtime row (recipe + needs + makes + state + produced + inputs) when runtime info is set', () => {
    panel.setRuntimeInfo({
      state: 'idle',
      recipeName: null,
      itemsProduced: 0,
      inputs: [],
    })

    const rows = getRuntimeRows(parent)
    expect(rows.length).toBe(6)
  })

  it('hides the inputs row when setRuntimeInfo(null) is called', () => {
    panel.setRuntimeInfo({
      state: 'processing',
      recipeName: 'X',
      itemsProduced: 1,
      inputs: [{ type: 'wheel_small', quantity: 1 }],
    })
    panel.setRuntimeInfo(null)

    const rows = getRuntimeRows(parent)
    const allHidden = rows.every(
      (row) =>
        row.style.display === 'none' ||
        (row.querySelector<HTMLElement>('.ui-machine-panel-value')?.textContent ?? '').trim() === '',
    )
    expect(allHidden).toBe(true)
  })

  it('updates the inputs row when only the inputs field changes between calls', () => {
    // Same state/recipe/produced; only inputs differ. The dirty-check
    // must NOT short-circuit — it has to detect the inputs change.
    const base = {
      state: 'processing' as const,
      recipeName: 'Basic Drivetrain',
      itemsProduced: 0,
    }

    panel.setRuntimeInfo({
      ...base,
      inputs: [{ type: 'wheel_small', quantity: 2 }],
    })
    expect(getInputsValue(parent)).toBe('2× Small Wheels')

    panel.setRuntimeInfo({
      ...base,
      inputs: [{ type: 'wheel_small', quantity: 3 }],
    })
    expect(getInputsValue(parent)).toBe('3× Small Wheels')

    panel.setRuntimeInfo({
      ...base,
      inputs: [
        { type: 'wheel_small', quantity: 3 },
        { type: 'circuit_basic', quantity: 1 },
      ],
    })
    expect(getInputsValue(parent)).toBe('3× Small Wheels, 1× Basic Circuits')

    panel.setRuntimeInfo({
      ...base,
      inputs: [],
    })
    expect(getInputsValue(parent)).toBe(i18next.t('machine_panel.inputs_empty'))
  })

  it('does not duplicate runtime DOM nodes when called repeatedly with input changes', () => {
    const base = {
      state: 'processing' as const,
      recipeName: 'X',
      itemsProduced: 0,
    }
    panel.setRuntimeInfo({ ...base, inputs: [{ type: 'wheel_small', quantity: 1 }] })
    panel.setRuntimeInfo({ ...base, inputs: [{ type: 'wheel_small', quantity: 2 }] })
    panel.setRuntimeInfo({ ...base, inputs: [{ type: 'wheel_small', quantity: 3 }] })

    expect(getRuntimeRows(parent).length).toBe(6)
  })
})

describe('machine_panel inputs locale keys', () => {
  it('en.json contains machine_panel.inputs and machine_panel.inputs_empty', () => {
    const mp = (enLocale as unknown as Record<string, Record<string, string>>).machine_panel
    expect(mp.inputs, 'en machine_panel.inputs missing').toBeTruthy()
    expect(mp.inputs_empty, 'en machine_panel.inputs_empty missing').toBeTruthy()
  })

  it('cs.json contains machine_panel.inputs and machine_panel.inputs_empty', () => {
    const mp = (csLocale as unknown as Record<string, Record<string, string>>).machine_panel
    expect(mp.inputs, 'cs machine_panel.inputs missing').toBeTruthy()
    expect(mp.inputs_empty, 'cs machine_panel.inputs_empty missing').toBeTruthy()
  })
})

// All ItemType variants are imported from src/game/types.ts, where a
// compile-time `Exclude<ItemType, …> extends never` sentinel guarantees
// the array stays in lock-step with the `ItemType` union — adding a new
// variant without appending it to `ALL_ITEM_TYPES` breaks `tsc --noEmit`.

describe('parts.* locale coverage', () => {
  it('en.json defines a parts.<itemType> entry for every ItemType', () => {
    const parts = (enLocale as unknown as Record<string, Record<string, string>>).parts
    expect(parts).toBeDefined()
    for (const type of ALL_ITEM_TYPES) {
      expect(parts[type], `en parts.${type} missing`).toBeTruthy()
    }
  })

  it('cs.json defines a parts.<itemType> entry for every ItemType', () => {
    const parts = (csLocale as unknown as Record<string, Record<string, string>>).parts
    expect(parts).toBeDefined()
    for (const type of ALL_ITEM_TYPES) {
      expect(parts[type], `cs parts.${type} missing`).toBeTruthy()
    }
  })

  it('en parts.wheel_small and parts.circuit_basic use the expected plural names', () => {
    const parts = (enLocale as unknown as Record<string, Record<string, string>>).parts
    expect(parts.wheel_small).toBe('Small Wheels')
    expect(parts.circuit_basic).toBe('Basic Circuits')
  })
})
