import { i18next } from '../i18n/i18n'
import type { BeltInfo } from '../game/types'

/**
 * Floating panel that shows properties of a selected belt chain.
 * Appears when a belt is clicked in the grid.
 */
export class BeltPanel {
  private container: HTMLDivElement
  private nameInput: HTMLInputElement
  private segmentsEl: HTMLSpanElement
  private sourceEl: HTMLSpanElement
  private targetEl: HTMLSpanElement
  private currentChain: BeltInfo | null = null
  private handleLangChange = () => this.updateLabels()

  onDelete: () => void = () => {}
  onNameChange: (belt: BeltInfo, newName: string) => void = () => {}

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'ui-belt-panel'
    this.container.style.display = 'none'

    // Header: editable name input + close button
    const header = document.createElement('div')
    header.className = 'ui-belt-panel-header'

    this.nameInput = document.createElement('input')
    this.nameInput.type = 'text'
    this.nameInput.className = 'ui-belt-panel-name-input'
    this.nameInput.addEventListener('input', () => {
      if (this.currentChain) {
        this.onNameChange(this.currentChain, this.nameInput.value)
      }
    })
    header.appendChild(this.nameInput)

    const closeBtn = document.createElement('button')
    closeBtn.className = 'ui-belt-panel-close'
    closeBtn.textContent = '×'
    closeBtn.addEventListener('click', () => this.hide())
    header.appendChild(closeBtn)

    this.container.appendChild(header)

    // Properties
    const props = document.createElement('div')
    props.className = 'ui-belt-panel-props'

    this.segmentsEl = this.addPropRow(props, 'belt_panel.segments')
    this.sourceEl = this.addPropRow(props, 'belt_panel.source')
    this.targetEl = this.addPropRow(props, 'belt_panel.target')

    this.container.appendChild(props)

    // Delete button
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'ui-belt-panel-delete'
    deleteBtn.dataset.i18nKey = 'belt_panel.delete'
    deleteBtn.textContent = i18next.t('belt_panel.delete')
    deleteBtn.addEventListener('click', () => {
      this.onDelete()
    })
    this.container.appendChild(deleteBtn)

    parent.appendChild(this.container)

    i18next.on('languageChanged', this.handleLangChange)
  }

  /** Show the panel with the selected belt's data. */
  setBeltChain(belt: BeltInfo | null): void {
    this.currentChain = belt
    if (!belt) {
      this.hide()
      return
    }

    this.nameInput.value = belt.name || ''
    this.nameInput.placeholder = i18next.t('belt_panel.title')
    this.segmentsEl.textContent = String(belt.path.length > 1 ? belt.path.length - 1 : 0)
    this.sourceEl.textContent = belt.sourceMachine
      ? `(${belt.sourceMachine.x}, ${belt.sourceMachine.z})`
      : '—'
    this.targetEl.textContent = belt.destinationMachine
      ? `(${belt.destinationMachine.x}, ${belt.destinationMachine.z})`
      : '—'

    this.container.style.display = 'flex'
  }

  show(): void {
    if (this.currentChain) {
      this.container.style.display = 'flex'
    }
  }

  hide(): void {
    this.container.style.display = 'none'
    this.currentChain = null
  }

  dispose(): void {
    i18next.off('languageChanged', this.handleLangChange)
    this.container.remove()
  }

  private addPropRow(parent: HTMLElement, labelKey: string): HTMLSpanElement {
    const row = document.createElement('div')
    row.className = 'ui-belt-panel-row'

    const label = document.createElement('span')
    label.className = 'ui-belt-panel-label'
    label.dataset.i18nKey = labelKey
    label.textContent = i18next.t(labelKey)
    row.appendChild(label)

    const value = document.createElement('span')
    value.className = 'ui-belt-panel-value'
    value.textContent = '—'
    row.appendChild(value)

    parent.appendChild(row)
    return value
  }

  private updateLabels(): void {
    if (this.currentChain) {
      this.setBeltChain(this.currentChain)
    }
    const elements = this.container.querySelectorAll<HTMLElement>('[data-i18n-key]')
    for (const el of elements) {
      const key = el.dataset.i18nKey
      if (key) el.textContent = i18next.t(key)
    }
  }
}
