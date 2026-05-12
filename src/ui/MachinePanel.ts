import { i18next } from '../i18n/i18n'
import { PLACEABLE_MACHINE_TYPES, type MachineType, type ItemType } from '../game/types'
import type { MachineInfo } from '../game/Factory'

export interface MachineRuntimeInfo {
  state: 'idle' | 'processing' | 'blocked'
  recipeName: string | null
  itemsProduced: number
  inputs: ReadonlyArray<{ type: ItemType; quantity: number }>
}

/**
 * Floating panel that shows properties of a selected machine.
 * Appears when a machine is clicked in "Select" tool mode.
 */
export class MachinePanel {
  private container: HTMLDivElement
  private nameInput: HTMLInputElement
  private infoEl: HTMLSpanElement
  private typeSelect: HTMLSelectElement
  private runtimeRecipeRow: HTMLDivElement
  private runtimeStateRow: HTMLDivElement
  private runtimeProducedRow: HTMLDivElement
  private runtimeInputsRow: HTMLDivElement
  private runtimeRecipeLabel: HTMLSpanElement
  private runtimeStateLabel: HTMLSpanElement
  private runtimeProducedLabel: HTMLSpanElement
  private runtimeInputsLabel: HTMLSpanElement
  private runtimeRecipeValue: HTMLSpanElement
  private runtimeStateValue: HTMLSpanElement
  private runtimeProducedValue: HTMLSpanElement
  private runtimeInputsValue: HTMLSpanElement
  private currentMachine: MachineInfo | null = null
  private currentRuntime: MachineRuntimeInfo | null = null
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

    // Runtime info: each value on its own labeled row so long recipe names
    // don't reflow the layout.
    const recipeRow = this.createRuntimeRow('machine_panel.recipe')
    this.runtimeRecipeRow = recipeRow.row
    this.runtimeRecipeLabel = recipeRow.label
    this.runtimeRecipeValue = recipeRow.value
    props.appendChild(this.runtimeRecipeRow)

    const stateRow = this.createRuntimeRow('machine_panel.state')
    this.runtimeStateRow = stateRow.row
    this.runtimeStateLabel = stateRow.label
    this.runtimeStateValue = stateRow.value
    props.appendChild(this.runtimeStateRow)

    const producedRow = this.createRuntimeRow('machine_panel.produced')
    this.runtimeProducedRow = producedRow.row
    this.runtimeProducedLabel = producedRow.label
    this.runtimeProducedValue = producedRow.value
    props.appendChild(this.runtimeProducedRow)

    const inputsRow = this.createRuntimeRow('machine_panel.inputs')
    this.runtimeInputsRow = inputsRow.row
    this.runtimeInputsLabel = inputsRow.label
    this.runtimeInputsValue = inputsRow.value
    props.appendChild(this.runtimeInputsRow)

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
    const previousId = this.currentMachine?.id ?? null
    this.currentMachine = machine
    if (!machine) {
      this.hide()
      return
    }
    if (machine.id !== previousId) {
      this.setRuntimeInfo(null)
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
    this.setRuntimeInfo(null)
  }

  dispose(): void {
    i18next.off('languageChanged', this.handleLangChange)
    this.container.remove()
  }

  setAvailableMachineTypes(types: readonly MachineType[]): void {
    this.availableTypes = types
    this.populateTypeOptions()
  }

  getCurrentMachine(): MachineInfo | null {
    return this.currentMachine
  }

  setRuntimeInfo(info: MachineRuntimeInfo | null): void {
    const prev = this.currentRuntime
    if (info === null && prev === null) return
    if (
      info !== null &&
      prev !== null &&
      info.state === prev.state &&
      info.recipeName === prev.recipeName &&
      info.itemsProduced === prev.itemsProduced &&
      inputsEqual(info.inputs, prev.inputs)
    ) {
      return
    }
    this.currentRuntime = info
    if (!info) {
      this.runtimeRecipeRow.style.display = 'none'
      this.runtimeStateRow.style.display = 'none'
      this.runtimeProducedRow.style.display = 'none'
      this.runtimeInputsRow.style.display = 'none'
      this.runtimeRecipeValue.textContent = ''
      this.runtimeStateValue.textContent = ''
      this.runtimeProducedValue.textContent = ''
      this.runtimeInputsValue.textContent = ''
      return
    }
    this.runtimeRecipeRow.style.display = ''
    this.runtimeStateRow.style.display = ''
    this.runtimeProducedRow.style.display = ''
    this.runtimeInputsRow.style.display = ''
    this.renderRuntime(info)
  }

  private renderRuntime(info: MachineRuntimeInfo): void {
    this.runtimeRecipeLabel.textContent = i18next.t('machine_panel.recipe')
    this.runtimeStateLabel.textContent = i18next.t('machine_panel.state')
    this.runtimeProducedLabel.textContent = i18next.t('machine_panel.produced')
    this.runtimeInputsLabel.textContent = i18next.t('machine_panel.inputs')
    this.runtimeRecipeValue.textContent =
      info.recipeName ?? i18next.t('machine_panel.no_recipe')
    this.runtimeStateValue.textContent = i18next.t(`machine_panel.state_${info.state}`)
    this.runtimeProducedValue.textContent = String(info.itemsProduced)
    this.runtimeInputsValue.textContent = formatInputs(info.inputs)
  }

  private createRuntimeRow(labelKey: string): {
    row: HTMLDivElement
    label: HTMLSpanElement
    value: HTMLSpanElement
  } {
    const row = document.createElement('div')
    row.className = 'ui-machine-panel-row ui-machine-panel-runtime'
    row.style.display = 'none'

    const label = document.createElement('span')
    label.className = 'ui-machine-panel-label'
    label.dataset.i18nKey = labelKey
    label.textContent = i18next.t(labelKey)
    row.appendChild(label)

    const value = document.createElement('span')
    value.className = 'ui-machine-panel-value'
    row.appendChild(value)

    return { row, label, value }
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
    if (this.currentRuntime) {
      this.renderRuntime(this.currentRuntime)
    }
  }
}

function inputsEqual(
  a: ReadonlyArray<{ type: ItemType; quantity: number }> | undefined,
  b: ReadonlyArray<{ type: ItemType; quantity: number }> | undefined,
): boolean {
  if (a === b) return true
  const aLen = a?.length ?? 0
  const bLen = b?.length ?? 0
  if (aLen !== bLen) return false
  if (!a || !b) return aLen === 0
  for (let i = 0; i < a.length; i++) {
    if (a[i].type !== b[i].type || a[i].quantity !== b[i].quantity) return false
  }
  return true
}

function formatInputs(
  inputs: ReadonlyArray<{ type: ItemType; quantity: number }> | undefined,
): string {
  if (!inputs || inputs.length === 0) return i18next.t('machine_panel.inputs_empty')
  return inputs
    .map((g) => `${g.quantity}× ${i18next.t(`parts.${g.type}`)}`)
    .join(', ')
}
