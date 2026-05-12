/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { initI18n, i18next } from '../../../src/i18n/i18n'
import { MachinePanel } from '../../../src/ui/MachinePanel'
import type { MachineInfo } from '../../../src/game/Factory'
import type { Direction } from '../../../src/game/types'
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

describe('MachinePanel runtime info', () => {
  let parent: HTMLDivElement
  let panel: MachinePanel

  beforeEach(() => {
    parent = document.createElement('div')
    panel = new MachinePanel(parent)
  })

  it('renders recipe name, state, and produced count when runtime info is provided', () => {
    panel.setMachine(fakeMachine)
    ;(panel as unknown as {
      setRuntimeInfo: (info: {
        state: 'idle' | 'processing' | 'blocked'
        recipeName: string | null
        itemsProduced: number
      } | null) => void
    }).setRuntimeInfo({
      state: 'processing',
      recipeName: 'Basic Drivetrain',
      itemsProduced: 3,
    })

    const runtimeRows = parent.querySelectorAll<HTMLElement>('.ui-machine-panel-runtime')
    expect(runtimeRows.length).toBe(4)
    const text = Array.from(runtimeRows)
      .map((r) => r.textContent ?? '')
      .join(' | ')

    const recipeLabel = i18next.t('machine_panel.recipe')
    const processingLabel = i18next.t('machine_panel.state_processing')
    const producedLabel = i18next.t('machine_panel.produced')

    expect(text).toContain(recipeLabel)
    expect(text).toContain('Basic Drivetrain')
    expect(text).toContain(processingLabel)
    expect(text).toContain(producedLabel)
    expect(text).toContain('3')
  })

  it('renders the no-recipe placeholder and idle state when recipeName is null', () => {
    panel.setMachine(fakeMachine)
    ;(panel as unknown as {
      setRuntimeInfo: (info: {
        state: 'idle' | 'processing' | 'blocked'
        recipeName: string | null
        itemsProduced: number
      } | null) => void
    }).setRuntimeInfo({
      state: 'idle',
      recipeName: null,
      itemsProduced: 0,
    })

    const runtimeRows = parent.querySelectorAll<HTMLElement>('.ui-machine-panel-runtime')
    expect(runtimeRows.length).toBe(4)
    const text = Array.from(runtimeRows)
      .map((r) => r.textContent ?? '')
      .join(' | ')

    expect(text).toContain(i18next.t('machine_panel.no_recipe'))
    expect(text).toContain(i18next.t('machine_panel.state_idle'))
  })

  it('hides or blanks the runtime row when setRuntimeInfo(null) is called', () => {
    panel.setMachine(fakeMachine)
    const setRuntimeInfo = (panel as unknown as {
      setRuntimeInfo: (info: {
        state: 'idle' | 'processing' | 'blocked'
        recipeName: string | null
        itemsProduced: number
      } | null) => void
    }).setRuntimeInfo.bind(panel)

    setRuntimeInfo({ state: 'blocked', recipeName: 'X', itemsProduced: 1 })
    setRuntimeInfo(null)

    const runtimeRows = parent.querySelectorAll<HTMLElement>('.ui-machine-panel-runtime')
    const allHidden = Array.from(runtimeRows).every(
      (row) =>
        row.style.display === 'none' ||
        (row.querySelector<HTMLElement>('.ui-machine-panel-value')?.textContent ?? '').trim() === '',
    )
    expect(allHidden).toBe(true)

    // Type select and info row remain
    expect(parent.querySelector('.ui-machine-panel-select')).not.toBeNull()
    expect(parent.querySelector('.ui-machine-panel-info')).not.toBeNull()
  })

  it('updates in place without duplicating runtime DOM nodes when called repeatedly', () => {
    panel.setMachine(fakeMachine)
    const setRuntimeInfo = (panel as unknown as {
      setRuntimeInfo: (info: {
        state: 'idle' | 'processing' | 'blocked'
        recipeName: string | null
        itemsProduced: number
      } | null) => void
    }).setRuntimeInfo.bind(panel)

    setRuntimeInfo({ state: 'idle', recipeName: 'A', itemsProduced: 0 })
    setRuntimeInfo({ state: 'processing', recipeName: 'B', itemsProduced: 5 })
    setRuntimeInfo({ state: 'blocked', recipeName: 'C', itemsProduced: 9 })

    const rows = parent.querySelectorAll('.ui-machine-panel-runtime')
    expect(rows.length).toBe(4)

    const text = Array.from(rows)
      .map((r) => r.textContent ?? '')
      .join(' | ')
    expect(text).toContain('C')
    expect(text).toContain('9')
    expect(text).not.toContain('A')
    expect(text).not.toContain('B')
  })
})

describe('machine_panel locale keys', () => {
  const requiredKeys = [
    'recipe',
    'state',
    'state_idle',
    'state_processing',
    'state_blocked',
    'no_recipe',
    'produced',
  ]

  it('en.json contains all new machine_panel runtime keys', () => {
    const mp = (enLocale as unknown as Record<string, Record<string, string>>).machine_panel
    expect(mp).toBeDefined()
    for (const key of requiredKeys) {
      expect(mp[key], `en machine_panel.${key} missing`).toBeTruthy()
    }
  })

  it('cs.json contains all new machine_panel runtime keys', () => {
    const mp = (csLocale as unknown as Record<string, Record<string, string>>).machine_panel
    expect(mp).toBeDefined()
    for (const key of requiredKeys) {
      expect(mp[key], `cs machine_panel.${key} missing`).toBeTruthy()
    }
  })
})
