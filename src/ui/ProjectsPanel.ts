import { i18next } from '../i18n/i18n'
import type { ProjectSlot } from '../utils/SandboxProjects'
import { ProjectsPanelReorderController } from './ProjectsPanelReorderController'

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
  private reorderController: ProjectsPanelReorderController
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
  onRequestClose: () => void = () => {}
  onReorder: (orderedSlotIds: string[]) => void = () => {}

  private outsideClickIgnoreElements: HTMLElement[] = []
  private listenersAttached = false
  private handlePointerDown = (event: Event): void => {
    if (!this.isOpen()) return
    const target = event.target as Node | null
    if (!target) return
    if (this.container.contains(target)) return
    for (const el of this.outsideClickIgnoreElements) {
      if (el.contains(target)) return
    }
    if (target instanceof Element && target.closest('.ui-modal-backdrop')) return
    this.onRequestClose()
  }
  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen()) return
    if (event.key !== 'Escape') return
    // Modal owns Escape first — its capture-phase handler may already have
    // consumed and removed the modal before this bubble handler runs, so
    // check both defaultPrevented and the live document state.
    if (event.defaultPrevented) return
    if (document.querySelector('.ui-modal-backdrop')) return
    this.onRequestClose()
  }

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.id = 'projects-container'
    this.container.className = 'ui-projects-panel'

    this.list = document.createElement('div')
    this.list.className = 'ui-projects-list'
    this.container.appendChild(this.list)

    this.reorderController = new ProjectsPanelReorderController({
      listEl: this.list,
      getOrderedSlotIds: () => this.slots.map((s) => s.id),
      getSelectedSlotIds: () => [...this.selectedSlotIds],
      isPlaceholderRow: (el) => el.classList.contains('ui-projects-slot--empty'),
      onReorder: (newOrder, focusSlotId) => {
        this.applyReorderToLocalSlots(newOrder, focusSlotId)
        this.onReorder([...newOrder])
      },
    })

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
    if (!this.listenersAttached) {
      // Capture phase so we see the click before the page's own handlers swallow it.
      document.addEventListener('pointerdown', this.handlePointerDown, true)
      document.addEventListener('keydown', this.handleKeyDown)
      this.listenersAttached = true
    }
  }

  hide(): void {
    this.container.classList.remove('open')
    document.body.classList.remove('projects-open')
    this.reorderController.cancelInFlightDrag()
    if (this.listenersAttached) {
      document.removeEventListener('pointerdown', this.handlePointerDown, true)
      document.removeEventListener('keydown', this.handleKeyDown)
      this.listenersAttached = false
    }
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

  setOutsideClickIgnoreElements(elements: HTMLElement[]): void {
    this.outsideClickIgnoreElements = [...elements]
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
    row.tabIndex = 0
    if (this.selectedSlotIds.has(slot.id)) row.classList.add('is-selected')

    const grip = document.createElement('button')
    grip.type = 'button'
    grip.className = 'ui-projects-slot-grip'
    grip.dataset.i18nKey = 'projects.drag_handle_aria'
    grip.dataset.i18nAttr = 'aria-label'
    grip.setAttribute('aria-label', i18next.t('projects.drag_handle_aria'))
    grip.textContent = '⋮⋮'
    grip.addEventListener('click', (ev) => ev.stopPropagation())
    row.appendChild(grip)

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
    this.reorderController.attachToSlotRow(row, slot.id)
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
    this.reorderController.attachToPlaceholderRow(row)
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
      if (!key) continue
      const text = i18next.t(key)
      const attr = el.dataset.i18nAttr
      if (attr) el.setAttribute(attr, text)
      else el.textContent = text
    }
  }

  private applyReorderToLocalSlots(newOrder: string[], focusSlotId?: string): void {
    const byId = new Map(this.slots.map((s) => [s.id, s]))
    const reordered: ProjectSlot[] = []
    for (const id of newOrder) {
      const slot = byId.get(id)
      if (slot) reordered.push(slot)
    }
    this.slots = reordered
    if (focusSlotId !== undefined) {
      // Keyboard reorder path: re-render so the new order is reflected
      // in the DOM, then move focus to the displaced row.
      this.renderList()
      const row = this.list.querySelector<HTMLElement>(
        `.ui-projects-slot[data-slot-id="${CSS.escape(focusSlotId)}"]`,
      )
      row?.focus()
    }
    // Drag path: the reorder controller has already moved the row nodes
    // in place via live preview. Re-rendering would destroy/recreate
    // them and cause a flicker — only the in-memory `slots` array
    // needs syncing here.
  }

  dispose(): void {
    this.reorderController.dispose()
    if (this.listenersAttached) {
      document.removeEventListener('pointerdown', this.handlePointerDown, true)
      document.removeEventListener('keydown', this.handleKeyDown)
      this.listenersAttached = false
    }
    i18next.off('languageChanged', this.handleLangChange)
    this.container.remove()
  }
}
