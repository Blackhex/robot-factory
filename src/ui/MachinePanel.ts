import { i18next } from '../i18n/i18n'
import { PLACEABLE_MACHINE_TYPES, type MachineType } from '../game/types'
import type { MachineInfo } from '../game/Factory'

/**
 * Floating panel that shows properties of a selected machine.
 * Appears when a machine is clicked in "Select" tool mode.
 */
export class MachinePanel {
  private container: HTMLDivElement
  private nameInput: HTMLInputElement
  private infoEl: HTMLSpanElement
  private typeSelect: HTMLSelectElement
  private currentMachine: MachineInfo | null = null
  private availableTypes: readonly MachineType[] = PLACEABLE_MACHINE_TYPES
  private handleLangChange = () => this.updateLabels()

  onTypeChange: (machine: MachineInfo, newType: MachineType) => void = () => {}
  onDelete: (machine: MachineInfo) => void = () => {}
  onNameChange: (machine: MachineInfo, newName: string) => void = () => {}

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'ui-machine-panel'
    this.container.style.display = 'none'

    // Header: editable name input + close button
    const header = document.createElement('div')
    header.className = 'ui-machine-panel-header'

    this.nameInput = document.createElement('input')
    this.nameInput.type = 'text'
    this.nameInput.className = 'ui-machine-panel-name-input'
    this.nameInput.addEventListener('input', () => {
      if (this.currentMachine) {
        this.onNameChange(this.currentMachine, this.nameInput.value)
      }
    })
    header.appendChild(this.nameInput)

    const closeBtn = document.createElement('button')
    closeBtn.className = 'ui-machine-panel-close'
    closeBtn.textContent = '×'
    closeBtn.addEventListener('click', () => this.hide())
    header.appendChild(closeBtn)

    this.container.appendChild(header)

    // Properties
    const props = document.createElement('div')
    props.className = 'ui-machine-panel-props'

    // Type selector
    const typeRow = document.createElement('div')
    typeRow.className = 'ui-machine-panel-row'

    const typeLabel = document.createElement('label')
    typeLabel.className = 'ui-machine-panel-label'
    typeLabel.dataset.i18nKey = 'machine_panel.type'
    typeLabel.textContent = i18next.t('machine_panel.type')
    typeRow.appendChild(typeLabel)

    this.typeSelect = document.createElement('select')
    this.typeSelect.className = 'ui-machine-panel-select'
    this.populateTypeOptions()
    this.typeSelect.addEventListener('change', () => {
      if (this.currentMachine) {
        this.onTypeChange(this.currentMachine, this.typeSelect.value as MachineType)
      }
    })
    typeRow.appendChild(this.typeSelect)

    props.appendChild(typeRow)

    // Info line: position · direction
    const infoRow = document.createElement('div')
    infoRow.className = 'ui-machine-panel-row'

    this.infoEl = document.createElement('span')
    this.infoEl.className = 'ui-machine-panel-info'
    this.infoEl.textContent = '—'
    infoRow.appendChild(this.infoEl)

    props.appendChild(infoRow)
    this.container.appendChild(props)

    // Delete button
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'ui-machine-panel-delete'
    deleteBtn.dataset.i18nKey = 'machine_panel.delete'
    deleteBtn.textContent = i18next.t('machine_panel.delete')
    deleteBtn.addEventListener('click', () => {
      if (this.currentMachine) {
        this.onDelete(this.currentMachine)
      }
    })
    this.container.appendChild(deleteBtn)

    parent.appendChild(this.container)

    i18next.on('languageChanged', this.handleLangChange)
  }

  /** Show the panel with the selected machine's data. */
  setMachine(machine: MachineInfo | null): void {
    this.currentMachine = machine
    if (!machine) {
      this.hide()
      return
    }

    this.nameInput.value = machine.name || ''
    this.nameInput.placeholder = i18next.t(`machines.${machine.type}`)
    this.infoEl.textContent = `(${machine.x}, ${machine.z}) · ${machine.rotation}`
    this.typeSelect.value = machine.type

    this.container.style.display = 'flex'
  }

  show(): void {
    if (this.currentMachine) {
      this.container.style.display = 'flex'
    }
  }

  hide(): void {
    this.container.style.display = 'none'
    this.currentMachine = null
  }

  dispose(): void {
    i18next.off('languageChanged', this.handleLangChange)
    this.container.remove()
  }

  setAvailableMachineTypes(types: readonly MachineType[]): void {
    this.availableTypes = types
    this.populateTypeOptions()
  }

  private populateTypeOptions(): void {
    this.typeSelect.innerHTML = ''
    for (const type of this.availableTypes) {
      const opt = document.createElement('option')
      opt.value = type
      opt.textContent = i18next.t(`machines.${type}`)
      this.typeSelect.appendChild(opt)
    }
  }

  private updateLabels(): void {
    this.populateTypeOptions()
    if (this.currentMachine) {
      this.setMachine(this.currentMachine)
    }
    const elements = this.container.querySelectorAll<HTMLElement>('[data-i18n-key]')
    for (const el of elements) {
      const key = el.dataset.i18nKey
      if (key) el.textContent = i18next.t(key)
    }
  }
}
