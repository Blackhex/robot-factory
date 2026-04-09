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
})
