import { i18next } from '../i18n/i18n'
import type { ProjectSlot } from '../utils/SandboxProjects'

/**
 * Sandbox-only Projects panel — lists saved factory "projects" (slots)
 * and exposes Save / Import / Export controls. The panel is appended as
 * `#projects-container` to the given parent.
 *
 * Selection model:
 *  - One row at a time may be `is-selected` (a real slot OR the empty
 *    placeholder).
 *  - `getSelectedSlotId()` returns the slot id when a real slot is
 *    selected, or `null` when the empty placeholder is selected (or
 *    nothing is selected).
 */
export class ProjectsPanel {
  private container: HTMLDivElement
  private list: HTMLDivElement
  private importBtn: HTMLButtonElement
  private exportBtn: HTMLButtonElement
  private slots: ProjectSlot[] = []
  private selectedSlotIds: Set<string> = new Set()
  private emptySelected = false
  private handleLangChange = (): void => {
    this.updateLabels()
    this.renderList()
  }

  onSaveSlot: (slotId: string | null) => void = () => {}
  onLoadSlot: (slotId: string) => void = () => {}
  onDeleteSlot: (slotId: string) => void = () => {}
  onCreateNew: () => void = () => {}
  onImport: () => void = () => {}
  onExport: (slotIds: string[]) => void = () => {}

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.id = 'projects-container'
    this.container.className = 'ui-projects-panel'

    this.list = document.createElement('div')
    this.list.className = 'ui-projects-list'
    this.container.appendChild(this.list)

    const actions = document.createElement('div')
    actions.className = 'ui-projects-actions'

    this.importBtn = this.makeActionButton(
      'projects.import',
      'ui-projects-btn ui-projects-btn--import',
    )
    this.importBtn.addEventListener('click', () => this.onImport())

    this.exportBtn = this.makeActionButton(
      'projects.export',
      'ui-projects-btn ui-projects-btn--export',
    )
    this.exportBtn.addEventListener('click', () => this.onExport(this.getSelectedSlotIds()))

    actions.appendChild(this.importBtn)
    actions.appendChild(this.exportBtn)
    this.container.appendChild(actions)

    parent.appendChild(this.container)

    this.renderList()

    i18next.on('languageChanged', this.handleLangChange)
  }

  private makeActionButton(key: string, className: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = className
    btn.dataset.i18nKey = key
    btn.textContent = i18next.t(key)
    return btn
  }

  private makeInlineButton(
    className: string,
    i18nKey: string,
    onClick: (ev: MouseEvent) => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = className
    btn.dataset.i18nKey = i18nKey
    btn.textContent = i18next.t(i18nKey)
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation()
      onClick(ev)
    })
    return btn
  }

  show(): void {
    this.container.classList.add('open')
    document.body.classList.add('projects-open')
  }

  hide(): void {
    this.container.classList.remove('open')
    document.body.classList.remove('projects-open')
  }

  isOpen(): boolean {
    return this.container.classList.contains('open')
  }

  toggle(): void {
    if (this.isOpen()) this.hide()
    else this.show()
  }

  /** Direct access to the panel's root DOM container (used to attach the
   * shared horizontal-resize-handle drag helper). */
  getContainer(): HTMLDivElement {
    return this.container
  }

  setSlots(slots: ProjectSlot[]): void {
    this.slots = [...slots]
    const valid = new Set(this.slots.map((s) => s.id))
    for (const id of [...this.selectedSlotIds]) {
      if (!valid.has(id)) this.selectedSlotIds.delete(id)
    }
    this.renderList()
  }

  getSelectedSlotId(): string | null {
    if (this.selectedSlotIds.size === 1) {
      return this.selectedSlotIds.values().next().value ?? null
    }
    return null
  }

  getSelectedSlotIds(): string[] {
    return [...this.selectedSlotIds]
  }

  private renderList(): void {
    this.list.innerHTML = ''
    for (const slot of this.slots) {
      this.list.appendChild(this.makeSlotRow(slot))
    }
    this.list.appendChild(this.makeEmptyRow())
  }

  private makeSlotRow(slot: ProjectSlot): HTMLElement {
    const row = document.createElement('div')
    row.className = 'ui-projects-slot'
    row.dataset.slotId = slot.id
    if (this.selectedSlotIds.has(slot.id)) row.classList.add('is-selected')

    const name = document.createElement('span')
    name.className = 'ui-projects-slot-name'
    name.textContent = this.displayNameFor(slot)
    row.appendChild(name)

    const save = this.makeInlineButton('ui-projects-slot-save', 'projects.save', () =>
      this.onSaveSlot(slot.id),
    )
    row.appendChild(save)

    const del = this.makeInlineButton('ui-projects-slot-delete', 'projects.delete', () =>
      this.onDeleteSlot(slot.id),
    )
    row.appendChild(del)

    row.addEventListener('click', (ev) => this.handleRowClick(slot.id, ev))
    row.addEventListener('dblclick', () => this.onLoadSlot(slot.id))
    return row
  }

  private makeEmptyRow(): HTMLElement {
    const row = document.createElement('div')
    row.className = 'ui-projects-slot ui-projects-slot--empty'
    if (this.emptySelected && this.selectedSlotIds.size === 0) {
      row.classList.add('is-selected')
    }

    const label = document.createElement('span')
    label.className = 'ui-projects-slot-name'
    label.dataset.i18nKey = 'projects.empty_placeholder'
    label.textContent = i18next.t('projects.empty_placeholder')
    row.appendChild(label)

    const save = this.makeInlineButton('ui-projects-slot-save', 'projects.save', () =>
      this.onSaveSlot(null),
    )
    row.appendChild(save)

    row.addEventListener('click', () => this.selectEmpty())
    row.addEventListener('dblclick', () => this.onCreateNew())
    return row
  }

  private handleRowClick(id: string, ev: MouseEvent): void {
    if (ev.ctrlKey || ev.metaKey) {
      if (this.selectedSlotIds.has(id)) this.selectedSlotIds.delete(id)
      else this.selectedSlotIds.add(id)
      this.emptySelected = false
    } else {
      this.selectedSlotIds = new Set([id])
      this.emptySelected = false
    }
    this.refreshSelection()
  }

  private selectEmpty(): void {
    this.selectedSlotIds.clear()
    this.emptySelected = true
    this.refreshSelection()
  }

  private refreshSelection(): void {
    const rows = this.list.querySelectorAll<HTMLElement>('.ui-projects-slot')
    rows.forEach((row) => {
      const isEmpty = row.classList.contains('ui-projects-slot--empty')
      const matches = isEmpty
        ? this.emptySelected && this.selectedSlotIds.size === 0
        : !!row.dataset.slotId && this.selectedSlotIds.has(row.dataset.slotId)
      row.classList.toggle('is-selected', matches)
    })
  }

  private displayNameFor(slot: ProjectSlot): string {
    // Legacy autosave slot — its stored `name` is the literal string
    // "Autosave" (English). Translate at render time so language switches
    // re-localize without rewriting storage.
    if (slot.name === 'Autosave') return i18next.t('projects.autosave_name')
    return slot.name
  }

  private updateLabels(): void {
    for (const el of this.container.querySelectorAll<HTMLElement>('[data-i18n-key]')) {
      const key = el.dataset.i18nKey
      if (key) el.textContent = i18next.t(key)
    }
  }

  dispose(): void {
    i18next.off('languageChanged', this.handleLangChange)
    this.container.remove()
  }
}
