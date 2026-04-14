/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { initI18n } from '../../../src/i18n/i18n'
import { MachinePanel } from '../../../src/ui/MachinePanel'
import type { MachineInfo } from '../../../src/game/Factory'
import type { Direction } from '../../../src/game/types'

beforeAll(async () => {
  await initI18n()
})

describe('MachinePanel', () => {
  let parent: HTMLDivElement
  let panel: MachinePanel

  const fakeMachine: MachineInfo = {
    id: 'machine_1',
    name: '',
    type: 'assembler',
    x: 2,
    z: 3,
    rotation: 'south' as Direction,
    slots: { inputs: ['back'], outputs: ['front'] },
  }

  beforeEach(() => {
    // GIVEN a fresh parent element with a MachinePanel rendered inside
    parent = document.createElement('div')
    panel = new MachinePanel(parent)
  })

  it('should have a Delete button', () => {
    // WHEN we query for the delete button
    const deleteBtn = parent.querySelector<HTMLButtonElement>('.ui-machine-panel-delete')

    // THEN it exists with the correct i18n key
    expect(deleteBtn).not.toBeNull()
    expect(deleteBtn!.dataset.i18nKey).toBe('machine_panel.delete')
  })

  it('should fire onDelete with current machine when Delete button is clicked', () => {
    // GIVEN an onDelete spy and a machine selected
    const spy = vi.fn()
    panel.onDelete = spy
    panel.setMachine(fakeMachine)

    // WHEN the delete button is clicked
    const deleteBtn = parent.querySelector<HTMLButtonElement>('.ui-machine-panel-delete')!
    deleteBtn.click()

    // THEN the callback fires with the selected machine
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(fakeMachine)
  })

  it('should NOT fire onDelete when no machine is selected', () => {
    // GIVEN an onDelete spy and no machine selected
    const spy = vi.fn()
    panel.onDelete = spy
    panel.setMachine(null)

    // WHEN the delete button is clicked
    const deleteBtn = parent.querySelector<HTMLButtonElement>('.ui-machine-panel-delete')!
    deleteBtn.click()

    // THEN the callback does not fire
    expect(spy).not.toHaveBeenCalled()
  })

  it('should display machine properties when setMachine is called', () => {
    // WHEN a machine is set
    panel.setMachine(fakeMachine)

    // THEN the panel is visible
    const container = parent.querySelector<HTMLDivElement>('.ui-machine-panel')!
    expect(container.style.display).toBe('flex')
  })

  it('should hide when setMachine(null) is called', () => {
    // GIVEN the panel is visible with a machine
    panel.setMachine(fakeMachine)

    // WHEN the machine is cleared
    panel.setMachine(null)

    // THEN the panel is hidden
    const container = parent.querySelector<HTMLDivElement>('.ui-machine-panel')!
    expect(container.style.display).toBe('none')
  })

  describe('setAvailableMachineTypes()', () => {
    function getDropdownValues(): string[] {
      const select = parent.querySelector<HTMLSelectElement>('.ui-machine-panel-select')!
      return Array.from(select.options).map(o => o.value)
    }

    function getDropdownLabels(): string[] {
      const select = parent.querySelector<HTMLSelectElement>('.ui-machine-panel-select')!
      return Array.from(select.options).map(o => o.textContent ?? '')
    }

    it('should show all default machine types when setAvailableMachineTypes is not called', () => {
      // GIVEN a panel created without calling setAvailableMachineTypes

      // THEN the dropdown contains all 6 default types
      const values = getDropdownValues()
      expect(values).toEqual([
        'part_fabricator',
        'assembler',
        'quality_checker',
        'painter',
        'recycler',
        'splitter',
      ])
    })

    it('should show only specified machine types when setAvailableMachineTypes is called', () => {
      // WHEN setAvailableMachineTypes is called with a subset
      panel.setAvailableMachineTypes(['part_fabricator', 'factory_output'])

      // THEN only those 2 types appear in the dropdown
      const values = getDropdownValues()
      expect(values).toEqual(['part_fabricator', 'factory_output'])
      expect(values).toHaveLength(2)
    })

    it('should include factory_output option when it is in available types', () => {
      // WHEN factory_output is included in the available types
      panel.setAvailableMachineTypes(['assembler', 'factory_output'])

      // THEN the dropdown contains factory_output with its i18n label
      const values = getDropdownValues()
      const labels = getDropdownLabels()
      expect(values).toContain('factory_output')
      const idx = values.indexOf('factory_output')
      expect(labels[idx]).toBe('Shipper')
    })

    it('should update dropdown options when setAvailableMachineTypes is called multiple times', () => {
      // GIVEN setAvailableMachineTypes is called with one list
      panel.setAvailableMachineTypes(['part_fabricator', 'assembler', 'painter'])
      expect(getDropdownValues()).toEqual(['part_fabricator', 'assembler', 'painter'])

      // WHEN it is called again with a different list
      panel.setAvailableMachineTypes(['recycler', 'factory_output'])

      // THEN the dropdown reflects the second list only
      const values = getDropdownValues()
      expect(values).toEqual(['recycler', 'factory_output'])
      expect(values).not.toContain('part_fabricator')
      expect(values).not.toContain('assembler')
      expect(values).not.toContain('painter')
    })
  })
})
