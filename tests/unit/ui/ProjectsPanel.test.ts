/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest'
import { initI18n, i18next, switchLanguage } from '../../../src/i18n/i18n'
import { ProjectsPanel } from '../../../src/ui/ProjectsPanel'
import type { ProjectSlot } from '../../../src/utils/SandboxProjects'

beforeAll(async () => {
  await initI18n()
})

function makeSlot(id: string, name: string, savedAt = 0): ProjectSlot {
  return { id, name, savedAt }
}

describe('ProjectsPanel', () => {
  let parent: HTMLDivElement
  let panel: ProjectsPanel

  beforeEach(async () => {
    await switchLanguage('en')
    document.body.innerHTML = ''
    document.body.className = ''
    parent = document.createElement('div')
    document.body.appendChild(parent)
    panel = new ProjectsPanel(parent)
  })

  afterEach(() => {
    panel.dispose()
    document.body.innerHTML = ''
  })

  it('appends a #projects-container element to the given parent', () => {
    const container = parent.querySelector('#projects-container')
    expect(container).not.toBeNull()
  })

  it('show() / hide() toggle the open class and body class', () => {
    const container = parent.querySelector('#projects-container')!

    panel.show()
    expect(container.classList.contains('open')).toBe(true)
    expect(document.body.classList.contains('projects-open')).toBe(true)

    panel.hide()
    expect(container.classList.contains('open')).toBe(false)
    expect(document.body.classList.contains('projects-open')).toBe(false)
  })

  it('isOpen() reflects state', () => {
    expect(panel.isOpen()).toBe(false)
    panel.show()
    expect(panel.isOpen()).toBe(true)
    panel.hide()
    expect(panel.isOpen()).toBe(false)
  })

  it('toggle() flips state', () => {
    expect(panel.isOpen()).toBe(false)
    panel.toggle()
    expect(panel.isOpen()).toBe(true)
    panel.toggle()
    expect(panel.isOpen()).toBe(false)
  })

  it('setSlots([]) renders only the empty placeholder row', () => {
    panel.setSlots([])

    const slotRows = parent.querySelectorAll('.ui-projects-slot:not(.ui-projects-slot--empty)')
    const emptyRows = parent.querySelectorAll('.ui-projects-slot--empty')

    expect(slotRows.length).toBe(0)
    expect(emptyRows.length).toBe(1)
  })

  it('setSlots(2 slots) renders 2 slot rows + 1 empty row at the end', () => {
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])

    const allRows = parent.querySelectorAll('.ui-projects-slot')
    expect(allRows.length).toBe(3)

    const last = allRows[allRows.length - 1]!
    expect(last.classList.contains('ui-projects-slot--empty')).toBe(true)
  })

  it('slot rows display the slot name', () => {
    panel.setSlots([makeSlot('a', 'My Cool Project')])

    const row = parent.querySelector('.ui-projects-slot:not(.ui-projects-slot--empty)')!
    expect(row.textContent).toContain('My Cool Project')
  })

  it('single-click on a slot row marks it is-selected; clicking another replaces selection', () => {
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])

    const rows = parent.querySelectorAll<HTMLElement>(
      '.ui-projects-slot:not(.ui-projects-slot--empty)',
    )
    const rowA = rows[0]!
    const rowB = rows[1]!

    rowA.click()
    expect(rowA.classList.contains('is-selected')).toBe(true)
    expect(panel.getSelectedSlotId()).toBe('a')

    rowB.click()
    expect(rowB.classList.contains('is-selected')).toBe(true)
    expect(rowA.classList.contains('is-selected')).toBe(false)
    expect(panel.getSelectedSlotId()).toBe('b')
  })

  it('single-click on the empty row marks it selected; getSelectedSlotId returns null', () => {
    panel.setSlots([makeSlot('a', 'Alpha')])

    const empty = parent.querySelector<HTMLElement>('.ui-projects-slot--empty')!
    empty.click()

    expect(empty.classList.contains('is-selected')).toBe(true)
    expect(panel.getSelectedSlotId()).toBeNull()
  })

  it('double-click on a slot row invokes onLoadSlot with the slot id', () => {
    const onLoadSlot = vi.fn()
    panel.onLoadSlot = onLoadSlot
    panel.setSlots([makeSlot('a', 'Alpha')])

    const row = parent.querySelector<HTMLElement>(
      '.ui-projects-slot:not(.ui-projects-slot--empty)',
    )!
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(onLoadSlot).toHaveBeenCalledWith('a')
  })

  // REQUIREMENT REVERSAL: Previously, double-clicking the empty "+ New
  // project" row was a no-op (it must NOT invoke onLoadSlot). The new
  // requirement reuses that gesture as the entry point for creating a
  // brand-new blank project: the empty row dblclick must invoke a fresh
  // `onCreateNew` callback (with no arguments) and must STILL not invoke
  // `onLoadSlot`. The load path remains bound only to real slot rows.
  it('double-click on the empty row invokes onCreateNew (and does NOT invoke onLoadSlot)', () => {
    const onCreateNew = vi.fn()
    const onLoadSlot = vi.fn()
    panel.onCreateNew = onCreateNew
    panel.onLoadSlot = onLoadSlot
    panel.setSlots([])

    const empty = parent.querySelector<HTMLElement>('.ui-projects-slot--empty')!
    empty.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(onCreateNew).toHaveBeenCalledTimes(1)
    expect(onCreateNew).toHaveBeenCalledWith()
    expect(onLoadSlot).not.toHaveBeenCalled()
  })

  it('every real slot row contains a .ui-projects-slot-save button', () => {
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])

    const saveBtns = parent.querySelectorAll(
      '.ui-projects-slot:not(.ui-projects-slot--empty) .ui-projects-slot-save',
    )
    expect(saveBtns.length).toBe(2)
  })

  it('the empty placeholder row contains a .ui-projects-slot-save button', () => {
    panel.setSlots([makeSlot('a', 'Alpha')])

    const saveBtns = parent.querySelectorAll('.ui-projects-slot--empty .ui-projects-slot-save')
    expect(saveBtns.length).toBe(1)
  })

  it('the empty placeholder row does NOT contain a .ui-projects-slot-delete button', () => {
    panel.setSlots([makeSlot('a', 'Alpha')])

    const deleteBtns = parent.querySelectorAll(
      '.ui-projects-slot--empty .ui-projects-slot-delete',
    )
    expect(deleteBtns.length).toBe(0)
  })

  it('clicking a slot row Save button invokes onSaveSlot with that slot id (independent of current selection)', () => {
    const onSaveSlot = vi.fn()
    panel.onSaveSlot = onSaveSlot
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])

    const rows = parent.querySelectorAll<HTMLElement>(
      '.ui-projects-slot:not(.ui-projects-slot--empty)',
    )
    const rowA = rows[0]!
    const rowB = rows[1]!

    rowB.click()
    expect(panel.getSelectedSlotId()).toBe('b')

    const saveBtnA = rowA.querySelector<HTMLButtonElement>('.ui-projects-slot-save')!
    saveBtnA.click()

    expect(onSaveSlot).toHaveBeenCalledWith('a')
    expect(panel.getSelectedSlotId()).toBe('b')
  })

  it('clicking the empty row Save button invokes onSaveSlot(null) (independent of current selection)', () => {
    const onSaveSlot = vi.fn()
    panel.onSaveSlot = onSaveSlot
    panel.setSlots([makeSlot('a', 'Alpha')])

    const rowA = parent.querySelector<HTMLElement>(
      '.ui-projects-slot:not(.ui-projects-slot--empty)',
    )!
    rowA.click()
    expect(panel.getSelectedSlotId()).toBe('a')

    const emptySaveBtn = parent.querySelector<HTMLButtonElement>(
      '.ui-projects-slot--empty .ui-projects-slot-save',
    )!
    emptySaveBtn.click()

    expect(onSaveSlot).toHaveBeenCalledWith(null)
    expect(panel.getSelectedSlotId()).toBe('a')
  })

  it('the bottom action row contains no .ui-projects-btn--save', () => {
    expect(parent.querySelector('.ui-projects-actions .ui-projects-btn--save')).toBeNull()
    expect(parent.querySelector('.ui-projects-btn--save')).toBeNull()
  })

  it('the bottom action row still contains Import and Export', () => {
    expect(parent.querySelector('.ui-projects-actions .ui-projects-btn--import')).not.toBeNull()
    expect(parent.querySelector('.ui-projects-actions .ui-projects-btn--export')).not.toBeNull()
  })

  it('Import button click invokes onImport', () => {
    const onImport = vi.fn()
    panel.onImport = onImport

    const btn = parent.querySelector<HTMLButtonElement>('.ui-projects-btn--import')!
    btn.click()

    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it('Export button click invokes onExport with the array of selected ids (could be empty, single, or many)', () => {
    const onExport = vi.fn()
    panel.onExport = onExport
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])

    const exportBtn = parent.querySelector<HTMLButtonElement>('.ui-projects-btn--export')!

    // 0 selected → empty array (means "current factory").
    exportBtn.click()
    expect(onExport).toHaveBeenLastCalledWith([])

    const rows = parent.querySelectorAll<HTMLElement>(
      '.ui-projects-slot:not(.ui-projects-slot--empty)',
    )
    const rowA = rows[0]!
    const rowB = rows[1]!

    // 1 selected → single-id array.
    rowA.click()
    exportBtn.click()
    expect(onExport).toHaveBeenLastCalledWith(['a'])

    // 2 selected (Ctrl+click) → both ids.
    rowB.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))
    exportBtn.click()
    expect(onExport).toHaveBeenLastCalledWith(['a', 'b'])
  })

  it('Delete button on a row invokes onDeleteSlot with that row id and does not toggle selection', () => {
    const onDeleteSlot = vi.fn()
    panel.onDeleteSlot = onDeleteSlot
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])

    const rows = parent.querySelectorAll<HTMLElement>(
      '.ui-projects-slot:not(.ui-projects-slot--empty)',
    )
    const rowA = rows[0]!
    const rowB = rows[1]!

    // Pre-select rowB so we can verify rowA's delete doesn't change selection
    rowB.click()
    expect(panel.getSelectedSlotId()).toBe('b')

    const deleteBtn = rowA.querySelector<HTMLButtonElement>('.ui-projects-slot-delete')!
    deleteBtn.click()

    expect(onDeleteSlot).toHaveBeenCalledWith('a')
    expect(panel.getSelectedSlotId()).toBe('b')
    expect(rowA.classList.contains('is-selected')).toBe(false)
  })

  it('setSlots preserves selection when the same id still exists; clears it otherwise', () => {
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])

    const rowA = parent.querySelector<HTMLElement>(
      '.ui-projects-slot:not(.ui-projects-slot--empty)',
    )!
    rowA.click()
    expect(panel.getSelectedSlotId()).toBe('a')

    // Re-render with 'a' still present
    panel.setSlots([makeSlot('a', 'Alpha v2'), makeSlot('c', 'Gamma')])
    expect(panel.getSelectedSlotId()).toBe('a')

    // Re-render without 'a' → selection cleared
    panel.setSlots([makeSlot('c', 'Gamma')])
    expect(panel.getSelectedSlotId()).toBeNull()
  })

  it('changing language re-renders static labels', async () => {
    panel.setSlots([])
    const saveBtn = parent.querySelector<HTMLButtonElement>(
      '.ui-projects-slot--empty .ui-projects-slot-save',
    )!
    const before = saveBtn.textContent

    await switchLanguage('cs')
    const afterBtn = parent.querySelector<HTMLButtonElement>(
      '.ui-projects-slot--empty .ui-projects-slot-save',
    )!
    const after = afterBtn.textContent

    expect(after).toBe(i18next.t('projects.save'))
    expect(typeof before).toBe('string')
  })
})

describe('ProjectsPanel — Multi-selection (Ctrl/Cmd+click)', () => {
  let parent: HTMLDivElement
  let panel: ProjectsPanel

  beforeEach(async () => {
    await switchLanguage('en')
    document.body.innerHTML = ''
    parent = document.createElement('div')
    document.body.appendChild(parent)
    panel = new ProjectsPanel(parent)
  })

  afterEach(() => {
    panel.dispose()
    document.body.innerHTML = ''
  })

  function realRows(): HTMLElement[] {
    return Array.from(
      parent.querySelectorAll<HTMLElement>(
        '.ui-projects-slot:not(.ui-projects-slot--empty)',
      ),
    )
  }

  function ctrlClick(el: HTMLElement): void {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))
  }

  function cmdClick(el: HTMLElement): void {
    el.dispatchEvent(
      new MouseEvent('click', { bubbles: true, metaKey: true, ctrlKey: false }),
    )
  }

  it('Plain click on a slot replaces selection with just that slot', () => {
    panel.setSlots([
      makeSlot('a', 'Alpha'),
      makeSlot('b', 'Beta'),
      makeSlot('c', 'Gamma'),
    ])
    const rows = realRows()
    ctrlClick(rows[0]!)
    ctrlClick(rows[1]!)
    expect(panel.getSelectedSlotIds()).toEqual(['a', 'b'])

    rows[2]!.click()
    expect(panel.getSelectedSlotIds()).toEqual(['c'])
  })

  it('Ctrl+click on a second slot adds it to the selection (both rows have is-selected)', () => {
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])
    const rows = realRows()
    rows[0]!.click()
    ctrlClick(rows[1]!)

    expect(rows[0]!.classList.contains('is-selected')).toBe(true)
    expect(rows[1]!.classList.contains('is-selected')).toBe(true)
    expect(panel.getSelectedSlotIds()).toEqual(['a', 'b'])
  })

  it('Ctrl+click on an already-selected slot removes it from the selection', () => {
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])
    const rows = realRows()
    rows[0]!.click()
    ctrlClick(rows[1]!)
    expect(panel.getSelectedSlotIds()).toEqual(['a', 'b'])

    ctrlClick(rows[0]!)
    expect(panel.getSelectedSlotIds()).toEqual(['b'])
    expect(rows[0]!.classList.contains('is-selected')).toBe(false)
    expect(rows[1]!.classList.contains('is-selected')).toBe(true)
  })

  it('getSelectedSlotIds returns the ids of all currently selected slots in insertion order', () => {
    panel.setSlots([
      makeSlot('a', 'Alpha'),
      makeSlot('b', 'Beta'),
      makeSlot('c', 'Gamma'),
    ])
    const rows = realRows()
    rows[1]!.click() // start with b
    ctrlClick(rows[0]!) // add a
    ctrlClick(rows[2]!) // add c

    expect(panel.getSelectedSlotIds()).toEqual(['b', 'a', 'c'])
  })

  it('getSelectedSlotId returns null when 0 or 2+ slots are selected, the single id when exactly 1', () => {
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])
    expect(panel.getSelectedSlotId()).toBeNull()

    const rows = realRows()
    rows[0]!.click()
    expect(panel.getSelectedSlotId()).toBe('a')

    ctrlClick(rows[1]!)
    expect(panel.getSelectedSlotId()).toBeNull()

    ctrlClick(rows[1]!) // toggle off → only 'a' remains
    expect(panel.getSelectedSlotId()).toBe('a')
  })

  it('Plain click on a third slot after a multi-select clears the others (back to single)', () => {
    panel.setSlots([
      makeSlot('a', 'Alpha'),
      makeSlot('b', 'Beta'),
      makeSlot('c', 'Gamma'),
    ])
    const rows = realRows()
    rows[0]!.click()
    ctrlClick(rows[1]!)
    expect(panel.getSelectedSlotIds()).toEqual(['a', 'b'])

    rows[2]!.click()
    expect(panel.getSelectedSlotIds()).toEqual(['c'])
    expect(rows[0]!.classList.contains('is-selected')).toBe(false)
    expect(rows[1]!.classList.contains('is-selected')).toBe(false)
    expect(rows[2]!.classList.contains('is-selected')).toBe(true)
  })

  it('Clicking the empty placeholder clears multi-selection and selects empty (getSelectedSlotIds returns [])', () => {
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])
    const rows = realRows()
    rows[0]!.click()
    ctrlClick(rows[1]!)
    expect(panel.getSelectedSlotIds()).toEqual(['a', 'b'])

    const empty = parent.querySelector<HTMLElement>('.ui-projects-slot--empty')!
    empty.click()

    expect(panel.getSelectedSlotIds()).toEqual([])
    expect(empty.classList.contains('is-selected')).toBe(true)
    expect(rows[0]!.classList.contains('is-selected')).toBe(false)
    expect(rows[1]!.classList.contains('is-selected')).toBe(false)
  })

  it('Selecting a real slot after the empty placeholder clears the empty selection', () => {
    panel.setSlots([makeSlot('a', 'Alpha')])
    const empty = parent.querySelector<HTMLElement>('.ui-projects-slot--empty')!
    empty.click()
    expect(empty.classList.contains('is-selected')).toBe(true)

    const rows = realRows()
    rows[0]!.click()

    expect(empty.classList.contains('is-selected')).toBe(false)
    expect(rows[0]!.classList.contains('is-selected')).toBe(true)
    expect(panel.getSelectedSlotIds()).toEqual(['a'])
  })

  it('Cmd+click also enables multi-select (Mac users)', () => {
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])
    const rows = realRows()
    rows[0]!.click()
    cmdClick(rows[1]!)

    expect(panel.getSelectedSlotIds()).toEqual(['a', 'b'])
    expect(rows[0]!.classList.contains('is-selected')).toBe(true)
    expect(rows[1]!.classList.contains('is-selected')).toBe(true)
  })
})

describe('ProjectsPanel header removal', () => {
  let parent: HTMLDivElement
  let panel: ProjectsPanel

  beforeEach(async () => {
    await switchLanguage('en')
    document.body.innerHTML = ''
    parent = document.createElement('div')
    document.body.appendChild(parent)
    panel = new ProjectsPanel(parent)
  })

  afterEach(() => {
    panel.dispose()
    document.body.innerHTML = ''
  })

  it('does not render a .ui-projects-header element', () => {
    expect(parent.querySelector('.ui-projects-header')).toBeNull()
  })

  it('does not render a .ui-projects-title element', () => {
    expect(parent.querySelector('.ui-projects-title')).toBeNull()
  })
})

// REQUIREMENT: while open, the Projects panel must dismiss itself when
// the user clicks outside it or presses Escape — but NOT when the click
// lands on the panel itself, on a registered ignore element (the toolbar
// Projects button, the resize handle), or inside an open `.ui-modal-backdrop`.
// The new public API on ProjectsPanel:
//   - `onRequestClose: () => void` callback (invoked, never closes
//     the panel itself — wiring decides how to react).
//   - `setOutsideClickIgnoreElements(elements: HTMLElement[]): void`
//     allowlist; clicks within any of these (or their descendants) must
//     NOT invoke `onRequestClose`.
//   - On `show()`: attach document-level `pointerdown` (capture phase)
//     and `keydown` listeners. On `hide()` and `dispose()`: detach them.
describe('ProjectsPanel — dismissal', () => {
  let parent: HTMLDivElement
  let panel: ProjectsPanel

  beforeEach(async () => {
    await switchLanguage('en')
    document.body.innerHTML = ''
    document.body.className = ''
    parent = document.createElement('div')
    document.body.appendChild(parent)
    panel = new ProjectsPanel(parent)
  })

  afterEach(() => {
    panel.dispose()
    document.body.innerHTML = ''
  })

  // jsdom (current Vitest pin) does not always implement `PointerEvent`
  // — fall back to `MouseEvent` of type `pointerdown` so the listener
  // (which only inspects `event.target`) sees an equivalent event.
  function dispatchPointerDown(target: EventTarget): void {
    const PE = (globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent
    const ev = PE
      ? new PE('pointerdown', { bubbles: true })
      : new MouseEvent('pointerdown', { bubbles: true })
    target.dispatchEvent(ev)
  }

  function dispatchKeyDown(key: string): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  }

  it('while open, a pointerdown outside the panel invokes onRequestClose', () => {
    panel.show()
    const onRequestClose = vi.fn()
    panel.onRequestClose = onRequestClose

    const outside = document.createElement('div')
    outside.id = 'outside-el'
    document.body.appendChild(outside)

    dispatchPointerDown(outside)

    expect(onRequestClose).toHaveBeenCalledTimes(1)
  })

  it('while open, a pointerdown on the panel container does NOT invoke onRequestClose', () => {
    panel.setSlots([makeSlot('a', 'Alpha')])
    panel.show()
    const onRequestClose = vi.fn()
    panel.onRequestClose = onRequestClose

    const container = parent.querySelector<HTMLElement>('#projects-container')!
    dispatchPointerDown(container)

    const slotRow = parent.querySelector<HTMLElement>(
      '.ui-projects-slot:not(.ui-projects-slot--empty)',
    )!
    dispatchPointerDown(slotRow)

    expect(onRequestClose).not.toHaveBeenCalled()
  })

  it('while open, a pointerdown on a registered ignore element does NOT invoke onRequestClose', () => {
    const externalBtn = document.createElement('button')
    externalBtn.id = 'ext-projects-btn'
    const childIcon = document.createElement('span')
    externalBtn.appendChild(childIcon)
    document.body.appendChild(externalBtn)

    panel.setOutsideClickIgnoreElements([externalBtn])
    panel.show()
    const onRequestClose = vi.fn()
    panel.onRequestClose = onRequestClose

    dispatchPointerDown(externalBtn)
    dispatchPointerDown(childIcon)

    expect(onRequestClose).not.toHaveBeenCalled()
  })

  it('while open, a pointerdown inside an element matching .ui-modal-backdrop does NOT invoke onRequestClose', () => {
    const backdrop = document.createElement('div')
    backdrop.className = 'ui-modal-backdrop'
    const card = document.createElement('div')
    card.className = 'ui-modal'
    const btn = document.createElement('button')
    btn.textContent = 'OK'
    card.appendChild(btn)
    backdrop.appendChild(card)
    document.body.appendChild(backdrop)

    panel.show()
    const onRequestClose = vi.fn()
    panel.onRequestClose = onRequestClose

    dispatchPointerDown(btn)
    dispatchPointerDown(card)
    dispatchPointerDown(backdrop)

    expect(onRequestClose).not.toHaveBeenCalled()
  })

  it('while CLOSED, a pointerdown outside the panel does NOT invoke onRequestClose', () => {
    const onRequestClose = vi.fn()
    panel.onRequestClose = onRequestClose

    // Panel never opened.
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    dispatchPointerDown(outside)

    // And after open + close, listeners must be detached.
    panel.show()
    panel.hide()
    dispatchPointerDown(outside)

    expect(onRequestClose).not.toHaveBeenCalled()
  })

  it('while open, an Escape keydown invokes onRequestClose', () => {
    panel.show()
    const onRequestClose = vi.fn()
    panel.onRequestClose = onRequestClose

    dispatchKeyDown('Escape')

    expect(onRequestClose).toHaveBeenCalledTimes(1)
  })

  it('while open, a non-Escape keydown does NOT invoke onRequestClose', () => {
    panel.show()
    const onRequestClose = vi.fn()
    panel.onRequestClose = onRequestClose

    dispatchKeyDown('a')
    dispatchKeyDown('Enter')
    dispatchKeyDown(' ')

    expect(onRequestClose).not.toHaveBeenCalled()
  })

  it('while CLOSED, an Escape keydown does NOT invoke onRequestClose', () => {
    const onRequestClose = vi.fn()
    panel.onRequestClose = onRequestClose

    dispatchKeyDown('Escape')

    expect(onRequestClose).not.toHaveBeenCalled()
  })

  it('after hide(), listeners are detached: outside pointerdown / Escape do NOT invoke onRequestClose', () => {
    panel.show()
    panel.hide()

    // Set the spy AFTER hide so any lingering invocation is attributable
    // to the listeners surviving past hide().
    const onRequestClose = vi.fn()
    panel.onRequestClose = onRequestClose

    const outside = document.createElement('div')
    document.body.appendChild(outside)
    dispatchPointerDown(outside)
    dispatchKeyDown('Escape')

    expect(onRequestClose).not.toHaveBeenCalled()
  })

  it('after dispose(), outside pointerdown and Escape do NOT invoke onRequestClose', () => {
    // Local panel — the outer afterEach also calls dispose() on the
    // shared `panel`, and a second dispose on this instance would be
    // wasteful. Use a fresh parent so removal is clean.
    const localParent = document.createElement('div')
    document.body.appendChild(localParent)
    const localPanel = new ProjectsPanel(localParent)

    localPanel.show()
    localPanel.dispose()

    const onRequestClose = vi.fn()
    localPanel.onRequestClose = onRequestClose

    const outside = document.createElement('div')
    document.body.appendChild(outside)
    dispatchPointerDown(outside)
    dispatchKeyDown('Escape')

    expect(onRequestClose).not.toHaveBeenCalled()
  })

  it('calling setOutsideClickIgnoreElements AFTER show() updates the active ignore set', () => {
    panel.show()
    const onRequestClose = vi.fn()
    panel.onRequestClose = onRequestClose

    const externalBtn = document.createElement('button')
    document.body.appendChild(externalBtn)

    // Before registering: button is "outside" → click dismisses.
    dispatchPointerDown(externalBtn)
    expect(onRequestClose).toHaveBeenCalledTimes(1)

    onRequestClose.mockReset()
    panel.setOutsideClickIgnoreElements([externalBtn])

    // After registering: button is in the ignore set → click ignored.
    dispatchPointerDown(externalBtn)
    expect(onRequestClose).not.toHaveBeenCalled()
  })
})