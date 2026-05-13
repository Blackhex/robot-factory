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

describe('ProjectsPanel — inline rename', () => {
  let parent: HTMLDivElement
  let panel: ProjectsPanel

  type PanelWithRename = ProjectsPanel & {
    onNameChange: (slotId: string, newName: string) => void
  }

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

  function realRows(): HTMLElement[] {
    return Array.from(
      parent.querySelectorAll<HTMLElement>(
        '.ui-projects-slot:not(.ui-projects-slot--empty)',
      ),
    )
  }

  function nameInputOf(row: HTMLElement): HTMLInputElement {
    const input = row.querySelector<HTMLInputElement>('.ui-projects-slot-name-input')
    if (!input) throw new Error('row is missing .ui-projects-slot-name-input')
    return input
  }

  it('renders a saved-slot name as <input type="text"> with class ui-projects-slot-name-input (no <span class="ui-projects-slot-name">)', () => {
    panel.setSlots([makeSlot('a', 'Alpha')])

    const row = realRows()[0]!
    const input = row.querySelector<HTMLInputElement>('.ui-projects-slot-name-input')
    expect(input).not.toBeNull()
    expect(input!.tagName).toBe('INPUT')
    expect(input!.type).toBe('text')

    const span = row.querySelector('.ui-projects-slot-name')
    expect(span).toBeNull()
  })

  it('keeps the <span class="ui-projects-slot-name"> placeholder label on the empty row (only saved rows become editable)', () => {
    panel.setSlots([makeSlot('a', 'Alpha')])

    const empty = parent.querySelector<HTMLElement>('.ui-projects-slot--empty')!
    const span = empty.querySelector('.ui-projects-slot-name')
    expect(span).not.toBeNull()
    expect(span!.tagName).toBe('SPAN')

    const input = empty.querySelector('.ui-projects-slot-name-input')
    expect(input).toBeNull()
  })

  it('input.value reflects the slot display name', () => {
    panel.setSlots([
      makeSlot('a', 'Alpha'),
      makeSlot('b', 'My Cool Project'),
    ])

    const rows = realRows()
    expect(nameInputOf(rows[0]!).value).toBe('Alpha')
    expect(nameInputOf(rows[1]!).value).toBe('My Cool Project')
  })

  it('input.value for an "Autosave" slot is rendered through displayNameFor (translated label, not the literal "Autosave")', () => {
    panel.setSlots([makeSlot('autosave-id', 'Autosave')])

    const row = realRows()[0]!
    const input = nameInputOf(row)
    expect(input.value).toBe(i18next.t('projects.autosave_name'))
  })

  it('exposes a public mutable onNameChange callback (defaults to a no-op)', () => {
    expect(typeof (panel as PanelWithRename).onNameChange).toBe('function')
    // Default no-op must not throw when invoked with arbitrary args.
    expect(() =>
      (panel as PanelWithRename).onNameChange('whatever', 'whatever'),
    ).not.toThrow()
  })

  it('typing in the input fires an "input" event that calls onNameChange(slotId, currentInputValue) per keystroke', () => {
    const onNameChange = vi.fn()
    ;(panel as PanelWithRename).onNameChange = onNameChange

    panel.setSlots([makeSlot('a', 'Alpha')])
    const input = nameInputOf(realRows()[0]!)

    input.value = 'Alph'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.value = 'Alpha2'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.value = 'Alpha2!'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    expect(onNameChange).toHaveBeenCalledTimes(3)
    expect(onNameChange).toHaveBeenNthCalledWith(1, 'a', 'Alph')
    expect(onNameChange).toHaveBeenNthCalledWith(2, 'a', 'Alpha2')
    expect(onNameChange).toHaveBeenNthCalledWith(3, 'a', 'Alpha2!')
  })

  it('clicking the name input does NOT toggle row selection (click is stopped at the input)', () => {
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])

    const rowB = realRows()[1]!
    rowB.click()
    expect(panel.getSelectedSlotId()).toBe('b')

    const inputA = nameInputOf(realRows()[0]!)
    inputA.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    // Selection unchanged — rowA's row click handler must not fire.
    expect(panel.getSelectedSlotId()).toBe('b')
    expect(realRows()[0]!.classList.contains('is-selected')).toBe(false)
  })

  it('clicking elsewhere on a slot row (not the input) still selects the row', () => {
    panel.setSlots([makeSlot('a', 'Alpha')])

    const row = realRows()[0]!
    // Click the row itself (not the input child) — selection should toggle on.
    row.click()

    expect(panel.getSelectedSlotId()).toBe('a')
    expect(row.classList.contains('is-selected')).toBe(true)
  })

  it('double-clicking the name input does NOT trigger onLoadSlot (dblclick is stopped at the input)', () => {
    const onLoadSlot = vi.fn()
    panel.onLoadSlot = onLoadSlot
    panel.setSlots([makeSlot('a', 'Alpha')])

    const input = nameInputOf(realRows()[0]!)
    input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(onLoadSlot).not.toHaveBeenCalled()
  })

  it('double-clicking elsewhere on the row still loads the slot', () => {
    const onLoadSlot = vi.fn()
    panel.onLoadSlot = onLoadSlot
    panel.setSlots([makeSlot('a', 'Alpha')])

    const row = realRows()[0]!
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(onLoadSlot).toHaveBeenCalledWith('a')
  })

  it('after setSlots() re-renders, the input is present and reflects the latest name', () => {
    panel.setSlots([makeSlot('a', 'Alpha')])
    expect(nameInputOf(realRows()[0]!).value).toBe('Alpha')

    panel.setSlots([makeSlot('a', 'Alpha v2')])
    const input = nameInputOf(realRows()[0]!)
    expect(input).not.toBeNull()
    expect(input.value).toBe('Alpha v2')
  })
})

describe('ProjectsPanel — inline rename: blur and a11y', () => {
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

  function realRows(): HTMLElement[] {
    return Array.from(
      parent.querySelectorAll<HTMLElement>(
        '.ui-projects-slot:not(.ui-projects-slot--empty)',
      ),
    )
  }

  function nameInputOf(row: HTMLElement): HTMLInputElement {
    const input = row.querySelector<HTMLInputElement>('.ui-projects-slot-name-input')
    if (!input) throw new Error('row is missing .ui-projects-slot-name-input')
    return input
  }

  function srSpanOf(row: HTMLElement): HTMLElement {
    const span = row.querySelector<HTMLElement>('.ui-projects-slot-name-sr')
    if (!span) throw new Error('row is missing .ui-projects-slot-name-sr')
    return span
  }

  it('blur with empty value restores the input to the persisted slot name', () => {
    panel.setSlots([makeSlot('a', 'Original')])
    const row = realRows()[0]!
    const input = nameInputOf(row)

    // Mid-edit: user clears the field.
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))

    // Blur — focus moves elsewhere without committing an empty rename.
    input.dispatchEvent(new Event('blur'))

    expect(input.value).toBe('Original')
  })

  it('blur with whitespace-only value also restores the input to the persisted slot name', () => {
    panel.setSlots([makeSlot('a', 'Original')])
    const row = realRows()[0]!
    const input = nameInputOf(row)

    input.value = '   '
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('blur'))

    expect(input.value).toBe('Original')
  })

  it('blur with a non-empty value does NOT change the input value', () => {
    panel.setSlots([makeSlot('a', 'Original')])
    const row = realRows()[0]!
    const input = nameInputOf(row)

    input.value = 'Renamed'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('blur'))

    expect(input.value).toBe('Renamed')
  })

  it('SR mirror span (.ui-projects-slot-name-sr) updates textContent on each non-empty keystroke', () => {
    panel.setSlots([makeSlot('a', 'Original')])
    const row = realRows()[0]!
    const input = nameInputOf(row)
    const srSpan = srSpanOf(row)

    expect(srSpan.textContent).toBe('Original')

    input.value = 'OriginalA'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(srSpan.textContent).toBe('OriginalA')

    input.value = 'OriginalAB'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(srSpan.textContent).toBe('OriginalAB')
  })

  it('SR mirror span does NOT update on empty keystroke — keeps the last non-empty value', () => {
    panel.setSlots([makeSlot('a', 'Original')])
    const row = realRows()[0]!
    const input = nameInputOf(row)
    const srSpan = srSpanOf(row)

    // Establish a non-empty mid-edit value first.
    input.value = 'OriginalX'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(srSpan.textContent).toBe('OriginalX')

    // Clear — SR mirror must NOT flash empty to assistive tech.
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(srSpan.textContent).toBe('OriginalX')
  })

  it('SR mirror span does NOT update on whitespace-only keystroke — keeps the last non-empty value', () => {
    panel.setSlots([makeSlot('a', 'Original')])
    const row = realRows()[0]!
    const input = nameInputOf(row)
    const srSpan = srSpanOf(row)

    input.value = '   '
    input.dispatchEvent(new Event('input', { bubbles: true }))

    expect(srSpan.textContent).toBe('Original')
  })

  it('blur restore re-syncs the SR span to the persisted slot name (consistent with the visible input)', () => {
    panel.setSlots([makeSlot('a', 'Original')])
    const row = realRows()[0]!
    const input = nameInputOf(row)
    const srSpan = srSpanOf(row)

    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('blur'))

    expect(srSpan.textContent).toBe('Original')
    expect(input.value).toBe('Original')
  })
})

// REQUIREMENT: while the user is mid-rename, the wire layer commits each
// keystroke to storage but intentionally skips refreshSlots() so the
// focused <input> survives. The panel's cached `slots[]` (and the row's
// `value` HTML attribute + SR mirror span) therefore drift away from
// storage. A new public `updateSlotName(slotId, newName)` method must
// re-sync the cache and the row in place — without re-rendering — so
// that:
//   1. A subsequent blur-restore (which reads the cached slot via
//      `displayNameFor`) snaps to the LATEST committed name, not the
//      stale one from initial render.
//   2. The `value` HTML attribute (queried by POMs via
//      `input[value="…"]`) reflects the latest committed name.
//   3. The SR mirror span stays consistent with the visible input.
//   4. The focused <input> node is preserved (no rebuild → no focus
//      drop, no caret reset).
describe('ProjectsPanel — inline rename: cache sync', () => {
  let parent: HTMLDivElement
  let panel: ProjectsPanel

  type PanelWithCacheSync = ProjectsPanel & {
    updateSlotName: (slotId: string, newName: string) => void
  }

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

  function realRows(): HTMLElement[] {
    return Array.from(
      parent.querySelectorAll<HTMLElement>(
        '.ui-projects-slot:not(.ui-projects-slot--empty)',
      ),
    )
  }

  function nameInputOf(row: HTMLElement): HTMLInputElement {
    const input = row.querySelector<HTMLInputElement>('.ui-projects-slot-name-input')
    if (!input) throw new Error('row is missing .ui-projects-slot-name-input')
    return input
  }

  function srSpanOf(row: HTMLElement): HTMLElement {
    const span = row.querySelector<HTMLElement>('.ui-projects-slot-name-sr')
    if (!span) throw new Error('row is missing .ui-projects-slot-name-sr')
    return span
  }

  it('exposes a public updateSlotName(slotId, newName) method', () => {
    expect(typeof (panel as PanelWithCacheSync).updateSlotName).toBe('function')
  })

  it('updateSlotName updates the cached slot in place', () => {
    const slot = makeSlot('a', 'Original')
    panel.setSlots([slot])

    ;(panel as PanelWithCacheSync).updateSlotName(slot.id, 'Edited')

    // Read the private cache directly — this is the exact field the
    // blur-restore handler dereferences via `displayNameFor(slot)`.
    const cachedSlots = (panel as unknown as { slots: ProjectSlot[] }).slots
    expect(cachedSlots[0]!.name).toBe('Edited')
  })

  it('updateSlotName updates BOTH input.value (the property) AND the value HTML attribute', () => {
    const slot = makeSlot('a', 'Original')
    panel.setSlots([slot])
    const input = nameInputOf(realRows()[0]!)

    ;(panel as PanelWithCacheSync).updateSlotName(slot.id, 'Edited')

    expect(input.value).toBe('Edited')
    expect(input.getAttribute('value')).toBe('Edited')
  })

  it('updateSlotName updates the SR mirror span textContent', () => {
    const slot = makeSlot('a', 'Original')
    panel.setSlots([slot])
    const srSpan = srSpanOf(realRows()[0]!)

    ;(panel as PanelWithCacheSync).updateSlotName(slot.id, 'Edited')

    expect(srSpan.textContent).toBe('Edited')
  })

  it('updateSlotName does NOT re-render the row (input node reference is preserved)', () => {
    const slot = makeSlot('a', 'Original')
    panel.setSlots([slot])
    const row = realRows()[0]!
    const beforeInput = nameInputOf(row)

    ;(panel as PanelWithCacheSync).updateSlotName(slot.id, 'Edited')

    const afterInput = row.querySelector<HTMLInputElement>('.ui-projects-slot-name-input')
    expect(afterInput).toBe(beforeInput)
    // Node still attached to the live document — no rebuild swapped it out.
    expect(document.body.contains(beforeInput)).toBe(true)
  })

  it('updateSlotName for an unknown slot id is a no-op (no crash, no DOM change)', () => {
    panel.setSlots([makeSlot('a', 'Original')])
    const input = nameInputOf(realRows()[0]!)

    expect(() =>
      (panel as PanelWithCacheSync).updateSlotName('nonexistent', 'X'),
    ).not.toThrow()

    expect(input.value).toBe('Original')
    expect(input.getAttribute('value')).toBe('Original')
  })

  // BUG 1 regression: without `updateSlotName`, the blur-restore handler
  // reads the stale cached slot ("Original") and snaps the cleared
  // input back to "Original" — even though storage already holds
  // "Edited". After the wire layer calls `updateSlotName('Edited')`,
  // the blur-restore must snap to "Edited" instead.
  it('blur on cleared input restores to the LATEST cached name (after a prior updateSlotName)', () => {
    const slot = makeSlot('a', 'Original')
    panel.setSlots([slot])
    const row = realRows()[0]!
    const input = nameInputOf(row)
    const srSpan = srSpanOf(row)

    // Simulate one keystroke: input fires, wire commits to storage,
    // wire calls updateSlotName to keep the panel cache in sync.
    input.value = 'Edited'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    ;(panel as PanelWithCacheSync).updateSlotName(slot.id, 'Edited')

    // User now clears the field and blurs.
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('blur'))

    // Blur-restore must read the LATEST cached name ("Edited"), not the
    // stale one captured at row construction ("Original").
    expect(input.value).toBe('Edited')
    expect(srSpan.textContent).toBe('Edited')
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

// REQUIREMENT: drag-and-drop reordering of project rows.
//
// New surface on `ProjectsPanel` (none of which exists in RED):
//   - Each non-placeholder row gets a `button.ui-projects-slot-grip`
//     drag handle with `aria-label = i18next.t('projects.drag_handle_aria')`
//     and `data-i18n-key="projects.drag_handle_aria"`. The placeholder
//     row has NO grip.
//   - `onReorder: (orderedSlotIds: string[]) => void = () => {}` field
//     emitting the FULL new ordering of real slot ids (placeholder
//     excluded). Always emitted as a fresh array.
//   - During a drag, the dragged row(s) are physically reordered IN
//     PLACE (live preview) so the user sees the would-be drop position
//     before releasing — no separate `.ui-projects-drop-indicator`
//     line is inserted.
//   - On `drop`, the previewed order is committed via `onReorder`
//     exactly once. On cancel (`dragend` without drop, pointer
//     released outside the list, `cancelInFlightDrag()`), the original
//     order snapshot taken at `dragstart` is restored.
//   - Multi-selection drag preserves the dragged subset's relative
//     order in the original list.
//   - Keyboard reordering with Alt+ArrowUp / Alt+ArrowDown.
//   - Touch/pointer-drag fallback on the grip.
//
// All assertions read DOM / public callback fields only.
describe('ProjectsPanel — drag-and-drop reordering', () => {
  let parent: HTMLDivElement
  let panel: ProjectsPanel

  // Local extension type: the new `onReorder` field and a per-grip touch
  // start helper. Lets the file compile against the current
  // ProjectsPanel typings without `as any`.
  type ReorderPanel = ProjectsPanel & {
    onReorder?: (orderedSlotIds: string[]) => void
  }

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

  function realRows(): HTMLElement[] {
    return Array.from(
      parent.querySelectorAll<HTMLElement>(
        '.ui-projects-slot:not(.ui-projects-slot--empty)',
      ),
    )
  }

  function emptyRow(): HTMLElement {
    return parent.querySelector<HTMLElement>('.ui-projects-slot--empty')!
  }

  function gripOf(row: HTMLElement): HTMLElement {
    const g = row.querySelector<HTMLElement>('.ui-projects-slot-grip')
    if (!g) throw new Error('row has no .ui-projects-slot-grip')
    return g
  }

  /**
   * Stamp a known geometry on a row so the drag handler can compute
   * top-half / bottom-half from `clientY`. Each row is `H` tall and
   * stacked vertically starting at y=0.
   */
  const ROW_H = 40
  function stampRowRects(rows: HTMLElement[]): void {
    rows.forEach((row, i) => {
      const top = i * ROW_H
      Object.defineProperty(row, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          top,
          bottom: top + ROW_H,
          left: 0,
          right: 200,
          width: 200,
          height: ROW_H,
          x: 0,
          y: top,
          toJSON: () => ({}),
        }),
      })
    })
  }

  function topHalfY(rowIndex: number): number {
    return rowIndex * ROW_H + ROW_H * 0.25
  }

  function bottomHalfY(rowIndex: number): number {
    return rowIndex * ROW_H + ROW_H * 0.75
  }

  // jsdom does not always implement `DataTransfer` / `DragEvent`. Build
  // a minimal object that records `setData`/`getData` calls and attach
  // it to a synthetic `MouseEvent` of the requested drag type. The
  // production handler only needs `event.dataTransfer` to be present,
  // not a real DataTransfer instance.
  interface FakeDataTransfer {
    types: string[]
    data: Map<string, string>
    effectAllowed: string
    dropEffect: string
    setData(format: string, value: string): void
    getData(format: string): string
  }
  function makeDataTransfer(): FakeDataTransfer {
    const data = new Map<string, string>()
    return {
      types: [],
      data,
      effectAllowed: 'move',
      dropEffect: 'move',
      setData(format: string, value: string): void {
        data.set(format, value)
        if (!this.types.includes(format)) this.types.push(format)
      },
      getData(format: string): string {
        return data.get(format) ?? ''
      },
    }
  }

  function dispatchDragEvent(
    target: EventTarget,
    type: string,
    opts: {
      clientX?: number
      clientY?: number
      dataTransfer?: FakeDataTransfer
    } = {},
  ): { event: Event; dataTransfer: FakeDataTransfer } {
    const dt = opts.dataTransfer ?? makeDataTransfer()
    const ev = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: opts.clientX ?? 0,
      clientY: opts.clientY ?? 0,
    })
    Object.defineProperty(ev, 'dataTransfer', {
      configurable: true,
      value: dt,
    })
    target.dispatchEvent(ev)
    return { event: ev, dataTransfer: dt }
  }

  function dispatchPointerDown(
    target: EventTarget,
    opts: {
      clientX?: number
      clientY?: number
      pointerType?: string
      pointerId?: number
    } = {},
  ): void {
    const PE = (globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent
    const init: PointerEventInit = {
      bubbles: true,
      cancelable: true,
      clientX: opts.clientX ?? 0,
      clientY: opts.clientY ?? 0,
      pointerType: opts.pointerType ?? 'touch',
      pointerId: opts.pointerId ?? 1,
    }
    const ev = PE
      ? new PE('pointerdown', init)
      : new MouseEvent('pointerdown', init as MouseEventInit)
    target.dispatchEvent(ev)
  }

  function dispatchPointerMove(
    target: EventTarget,
    opts: { clientX?: number; clientY?: number; pointerId?: number } = {},
  ): void {
    const PE = (globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent
    const init: PointerEventInit = {
      bubbles: true,
      cancelable: true,
      clientX: opts.clientX ?? 0,
      clientY: opts.clientY ?? 0,
      pointerType: 'touch',
      pointerId: opts.pointerId ?? 1,
    }
    const ev = PE
      ? new PE('pointermove', init)
      : new MouseEvent('pointermove', init as MouseEventInit)
    target.dispatchEvent(ev)
  }

  function dispatchPointerUp(
    target: EventTarget,
    opts: { clientX?: number; clientY?: number; pointerId?: number } = {},
  ): void {
    const PE = (globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent
    const init: PointerEventInit = {
      bubbles: true,
      cancelable: true,
      clientX: opts.clientX ?? 0,
      clientY: opts.clientY ?? 0,
      pointerType: 'touch',
      pointerId: opts.pointerId ?? 1,
    }
    const ev = PE
      ? new PE('pointerup', init)
      : new MouseEvent('pointerup', init as MouseEventInit)
    target.dispatchEvent(ev)
  }

  function ctrlClick(el: HTMLElement): void {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))
  }

  // -------- Grip DOM ---------------------------------------------------

  it('every real slot row contains a .ui-projects-slot-grip drag handle', () => {
    panel.setSlots([makeSlot('a', 'Alpha'), makeSlot('b', 'Beta')])
    const grips = parent.querySelectorAll(
      '.ui-projects-slot:not(.ui-projects-slot--empty) .ui-projects-slot-grip',
    )
    expect(grips.length).toBe(2)
  })

  it('the grip is a <button> for keyboard accessibility', () => {
    panel.setSlots([makeSlot('a', 'Alpha')])
    const grip = parent.querySelector('.ui-projects-slot-grip')!
    expect(grip.tagName).toBe('BUTTON')
  })

  it('the grip carries an aria-label and a data-i18n-key for re-localization', () => {
    panel.setSlots([makeSlot('a', 'Alpha')])
    const grip = parent.querySelector<HTMLElement>('.ui-projects-slot-grip')!
    expect(grip.getAttribute('aria-label')).toBe(
      i18next.t('projects.drag_handle_aria'),
    )
    expect(grip.dataset.i18nKey).toBe('projects.drag_handle_aria')
  })

  it('the placeholder row has NO grip and is not draggable', () => {
    panel.setSlots([makeSlot('a', 'Alpha')])

    // Sanity: real rows DO have a grip; otherwise the negative
    // assertion below would pass vacuously while the feature is
    // entirely unimplemented.
    expect(
      realRows()[0]!.querySelector('.ui-projects-slot-grip'),
    ).not.toBeNull()

    const empty = emptyRow()
    expect(empty.querySelector('.ui-projects-slot-grip')).toBeNull()
    // `draggable` attribute is absent or false on the placeholder row.
    const draggableAttr = empty.getAttribute('draggable')
    expect(draggableAttr === null || draggableAttr === 'false').toBe(true)
  })

  // -------- onReorder field --------------------------------------------

  it('exposes a public `onReorder` callback that defaults to a no-op', () => {
    const p = panel as ReorderPanel
    expect(typeof p.onReorder).toBe('function')
    expect(() => p.onReorder?.([])).not.toThrow()
  })

  // -------- Single-row drag via grip -----------------------------------

  it('dragging row B and dropping on row A top-half emits ["B","A","C"]', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const rows = realRows()
    stampRowRects(rows)
    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    const { dataTransfer } = dispatchDragEvent(gripOf(rows[1]!), 'dragstart')
    dispatchDragEvent(rows[0]!, 'dragover', {
      clientY: topHalfY(0),
      dataTransfer,
    })
    dispatchDragEvent(rows[0]!, 'drop', {
      clientY: topHalfY(0),
      dataTransfer,
    })

    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(['B', 'A', 'C'])
  })

  it('dragging row B and dropping on row A bottom-half emits ["A","B","C"]', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const rows = realRows()
    stampRowRects(rows)
    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    const { dataTransfer } = dispatchDragEvent(gripOf(rows[1]!), 'dragstart')
    dispatchDragEvent(rows[0]!, 'dragover', {
      clientY: bottomHalfY(0),
      dataTransfer,
    })
    dispatchDragEvent(rows[0]!, 'drop', {
      clientY: bottomHalfY(0),
      dataTransfer,
    })

    // The "no-op for adjacent identity" case is acceptable; the spec
    // requires the actual emitted ordering to be ['A','B','C'].
    if (onReorder.mock.calls.length > 0) {
      expect(onReorder).toHaveBeenLastCalledWith(['A', 'B', 'C'])
    }
  })

  it('dragging row B and dropping on row C bottom-half emits ["A","C","B"]', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const rows = realRows()
    stampRowRects(rows)
    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    const { dataTransfer } = dispatchDragEvent(gripOf(rows[1]!), 'dragstart')
    dispatchDragEvent(rows[2]!, 'dragover', {
      clientY: bottomHalfY(2),
      dataTransfer,
    })
    dispatchDragEvent(rows[2]!, 'drop', {
      clientY: bottomHalfY(2),
      dataTransfer,
    })

    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(['A', 'C', 'B'])
  })

  it('dropping on the empty placeholder snaps the dragged row to last position', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const rows = realRows()
    const empty = emptyRow()
    stampRowRects([...rows, empty])
    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    const { dataTransfer } = dispatchDragEvent(gripOf(rows[1]!), 'dragstart')
    dispatchDragEvent(empty, 'dragover', {
      clientY: ROW_H * 3 + ROW_H * 0.5,
      dataTransfer,
    })
    dispatchDragEvent(empty, 'drop', {
      clientY: ROW_H * 3 + ROW_H * 0.5,
      dataTransfer,
    })

    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(['A', 'C', 'B'])
  })

  // -------- Multi-selection drag ---------------------------------------

  it('multi-select drag (A+C) dropped on D bottom-half emits ["B","D","A","C"]', () => {
    panel.setSlots([
      makeSlot('A', 'A'),
      makeSlot('B', 'B'),
      makeSlot('C', 'C'),
      makeSlot('D', 'D'),
    ])
    const rows = realRows()
    stampRowRects(rows)
    rows[0]!.click() // select A
    ctrlClick(rows[2]!) // add C
    expect(panel.getSelectedSlotIds()).toEqual(['A', 'C'])

    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    const { dataTransfer } = dispatchDragEvent(gripOf(rows[2]!), 'dragstart')
    dispatchDragEvent(rows[3]!, 'dragover', {
      clientY: bottomHalfY(3),
      dataTransfer,
    })
    dispatchDragEvent(rows[3]!, 'drop', {
      clientY: bottomHalfY(3),
      dataTransfer,
    })

    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(['B', 'D', 'A', 'C'])
  })

  it('multi-select drag (A+C) dropped on B top-half emits ["A","C","B","D"]', () => {
    panel.setSlots([
      makeSlot('A', 'A'),
      makeSlot('B', 'B'),
      makeSlot('C', 'C'),
      makeSlot('D', 'D'),
    ])
    const rows = realRows()
    stampRowRects(rows)
    rows[0]!.click()
    ctrlClick(rows[2]!)

    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    const { dataTransfer } = dispatchDragEvent(gripOf(rows[2]!), 'dragstart')
    dispatchDragEvent(rows[1]!, 'dragover', {
      clientY: topHalfY(1),
      dataTransfer,
    })
    dispatchDragEvent(rows[1]!, 'drop', {
      clientY: topHalfY(1),
      dataTransfer,
    })

    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(['A', 'C', 'B', 'D'])
  })

  it('dragging the entire selection set is a no-op (no onReorder)', () => {
    panel.setSlots([
      makeSlot('A', 'A'),
      makeSlot('B', 'B'),
      makeSlot('C', 'C'),
      makeSlot('D', 'D'),
    ])
    const rows = realRows()
    stampRowRects(rows)
    rows[0]!.click()
    ctrlClick(rows[1]!)
    ctrlClick(rows[2]!)
    ctrlClick(rows[3]!)
    expect(panel.getSelectedSlotIds()).toEqual(['A', 'B', 'C', 'D'])

    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    const { dataTransfer } = dispatchDragEvent(gripOf(rows[0]!), 'dragstart')
    dispatchDragEvent(rows[3]!, 'dragover', {
      clientY: bottomHalfY(3),
      dataTransfer,
    })
    dispatchDragEvent(rows[3]!, 'drop', {
      clientY: bottomHalfY(3),
      dataTransfer,
    })

    expect(onReorder).not.toHaveBeenCalled()
  })

  // -------- Placeholder is not draggable -------------------------------

  it('dragstart on the placeholder row does NOT emit onReorder', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B')])
    const rows = realRows()
    const empty = emptyRow()
    stampRowRects([...rows, empty])

    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    // Sanity precondition: dragging from a real row's grip and
    // dropping on the placeholder DOES emit — otherwise the negative
    // assertion below passes vacuously while drag-and-drop isn't
    // implemented at all.
    {
      const { dataTransfer } = dispatchDragEvent(gripOf(rows[0]!), 'dragstart')
      dispatchDragEvent(empty, 'dragover', {
        clientY: ROW_H * 2 + ROW_H * 0.5,
        dataTransfer,
      })
      dispatchDragEvent(empty, 'drop', {
        clientY: ROW_H * 2 + ROW_H * 0.5,
        dataTransfer,
      })
    }
    expect(onReorder).toHaveBeenCalled()
    onReorder.mockClear()

    // Re-fetch rows after the panel re-renders following the previous
    // reorder.
    const rows2 = realRows()
    const empty2 = emptyRow()
    stampRowRects([...rows2, empty2])

    // Placeholder has no grip — dispatch on the row itself.
    const { dataTransfer } = dispatchDragEvent(empty2, 'dragstart')
    dispatchDragEvent(rows2[0]!, 'dragover', {
      clientY: topHalfY(0),
      dataTransfer,
    })
    dispatchDragEvent(rows2[0]!, 'drop', {
      clientY: topHalfY(0),
      dataTransfer,
    })

    expect(onReorder).not.toHaveBeenCalled()
  })

  // -------- Drop indicator (removed) -----------------------------------
  // The standalone `.ui-projects-drop-indicator` line was replaced by
  // live in-list preview of the dragged row(s) — see the live-preview
  // suite below for the new contract.

  // -------- Keyboard reordering ----------------------------------------

  it('Alt+ArrowDown on the top slot moves it down one position and emits the new order', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const rows = realRows()
    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    rows[0]!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
      }),
    )

    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(['B', 'A', 'C'])
  })

  it('Alt+ArrowUp on the top slot is a no-op', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    // Sanity precondition: Alt+ArrowDown on the second row DOES emit
    // — otherwise the negative assertion below passes vacuously while
    // keyboard reordering is entirely unimplemented.
    realRows()[1]!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
      }),
    )
    expect(onReorder).toHaveBeenCalled()
    onReorder.mockClear()

    realRows()[0]!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        altKey: true,
        bubbles: true,
      }),
    )

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('Alt+ArrowDown on the LAST real slot is a no-op (placeholder must remain last)', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    // Sanity precondition: Alt+ArrowDown on a non-last row MUST fire
    // onReorder. Without this guard, the negative assertion below
    // would pass vacuously when keyboard reordering isn't wired up at
    // all.
    realRows()[0]!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
      }),
    )
    expect(onReorder).toHaveBeenCalled()
    onReorder.mockClear()

    // Re-fetch rows because the previous reorder caused a re-render.
    const rowsAfter = realRows()
    rowsAfter[rowsAfter.length - 1]!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
      }),
    )

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('keeps focus on the moved row after a keyboard reorder', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const initialRows = realRows()
    initialRows[0]!.tabIndex = 0
    initialRows[0]!.focus()

    initialRows[0]!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
      }),
    )

    // After reorder + re-render: slot A (the originally focused slot)
    // moved from index 0 to index 1. Focus must follow it to its new
    // DOM position.
    const after = realRows()
    expect(after[1]!.dataset.slotId).toBe('A')
    const focused = document.activeElement as HTMLElement | null
    expect(focused).toBe(after[1]!)
  })

  it('plain ArrowUp/ArrowDown (no Alt) does not emit onReorder', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    // Sanity precondition: with Alt held, ArrowDown DOES emit —
    // otherwise this negative test passes vacuously.
    realRows()[0]!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
      }),
    )
    expect(onReorder).toHaveBeenCalled()
    onReorder.mockClear()

    const rowsAfter = realRows()
    rowsAfter[0]!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: false,
        bubbles: true,
      }),
    )
    rowsAfter[1]!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        altKey: false,
        bubbles: true,
      }),
    )

    expect(onReorder).not.toHaveBeenCalled()
  })

  // -------- Touch / pointer drag ---------------------------------------

  it('touch pointer-drag from a grip onto another row emits onReorder', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const rows = realRows()
    stampRowRects(rows)
    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    // Stub elementFromPoint so the pointer-drag handler can locate the
    // current target row from clientX/clientY.
    const originalElementFromPoint = document.elementFromPoint
    document.elementFromPoint = (x: number, y: number): Element | null => {
      void x
      for (const r of [...rows, emptyRow()]) {
        const rect = r.getBoundingClientRect()
        if (y >= rect.top && y < rect.bottom) return r
      }
      return null
    }

    try {
      const grip = gripOf(rows[1]!)
      // Start drag at the centre of row B.
      dispatchPointerDown(grip, {
        clientX: 100,
        clientY: ROW_H * 1 + ROW_H * 0.5,
        pointerType: 'touch',
        pointerId: 7,
      })
      // Move past a small threshold to commit to drag mode.
      dispatchPointerMove(grip, {
        clientX: 100,
        clientY: ROW_H * 1 + ROW_H * 0.5 - 12,
        pointerId: 7,
      })
      // Move into row A's top half.
      dispatchPointerMove(grip, {
        clientX: 100,
        clientY: topHalfY(0),
        pointerId: 7,
      })
      dispatchPointerUp(grip, {
        clientX: 100,
        clientY: topHalfY(0),
        pointerId: 7,
      })

      expect(onReorder).toHaveBeenCalledTimes(1)
      expect(onReorder).toHaveBeenCalledWith(['B', 'A', 'C'])
    } finally {
      document.elementFromPoint = originalElementFromPoint
    }
  })

  // -------- Live preview during dragover -------------------------------
  //
  // NEW BEHAVIOR (RED): instead of inserting a separate
  // `.ui-projects-drop-indicator` line into the list, the dragged
  // row(s) themselves should be physically moved in the DOM during
  // each `dragover` to show the would-be drop position live. The
  // dragged row keeps its `is-dragging` class (ghost styling) while
  // it sits in its preview slot. The placeholder row stays last at
  // all times. A `dragend` without a matching `drop` reverts to the
  // original DOM order; a `drop` commits the previewed order.

  function visualSlotOrder(): string[] {
    return Array.from(
      parent.querySelectorAll<HTMLElement>(
        '.ui-projects-slot:not(.ui-projects-slot--empty)',
      ),
    ).map((r) => r.dataset.slotId ?? '')
  }

  function placeholderIsLast(): boolean {
    const all = parent.querySelectorAll<HTMLElement>('.ui-projects-slot')
    return (
      all.length > 0 &&
      all[all.length - 1]!.classList.contains('ui-projects-slot--empty')
    )
  }

  it('live-preview: dragover on row C bottom-half moves dragged row A to [B, C, A]', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const rows = realRows()
    stampRowRects(rows)

    const { dataTransfer } = dispatchDragEvent(gripOf(rows[0]!), 'dragstart')
    dispatchDragEvent(rows[2]!, 'dragover', {
      clientY: bottomHalfY(2),
      dataTransfer,
    })

    expect(visualSlotOrder()).toEqual(['B', 'C', 'A'])
    expect(placeholderIsLast()).toBe(true)
    // The dragged row (now in its preview position) keeps the
    // `is-dragging` class so it remains visually ghosted.
    const movedA = parent.querySelector<HTMLElement>(
      '.ui-projects-slot[data-slot-id="A"]',
    )!
    expect(movedA.classList.contains('is-dragging')).toBe(true)
  })

  it('live-preview: dragover on row A top-half moves dragged row C to [C, A, B]', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const rows = realRows()
    stampRowRects(rows)

    const { dataTransfer } = dispatchDragEvent(gripOf(rows[2]!), 'dragstart')
    dispatchDragEvent(rows[0]!, 'dragover', {
      clientY: topHalfY(0),
      dataTransfer,
    })

    expect(visualSlotOrder()).toEqual(['C', 'A', 'B'])
    expect(placeholderIsLast()).toBe(true)
  })

  it('live-preview: multi-row drag (A+C) over row D bottom-half shows [B, D, A, C]', () => {
    panel.setSlots([
      makeSlot('A', 'A'),
      makeSlot('B', 'B'),
      makeSlot('C', 'C'),
      makeSlot('D', 'D'),
    ])
    const rows = realRows()
    stampRowRects(rows)
    rows[0]!.click()
    ctrlClick(rows[2]!)
    expect(panel.getSelectedSlotIds()).toEqual(['A', 'C'])

    const { dataTransfer } = dispatchDragEvent(gripOf(rows[0]!), 'dragstart')
    dispatchDragEvent(rows[3]!, 'dragover', {
      clientY: bottomHalfY(3),
      dataTransfer,
    })

    expect(visualSlotOrder()).toEqual(['B', 'D', 'A', 'C'])
    expect(placeholderIsLast()).toBe(true)
  })

  it('live-preview: dragover on the placeholder snaps the dragged row to just before the placeholder', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const rows = realRows()
    const empty = emptyRow()
    stampRowRects([...rows, empty])

    const { dataTransfer } = dispatchDragEvent(gripOf(rows[1]!), 'dragstart')
    dispatchDragEvent(empty, 'dragover', {
      clientY: ROW_H * 3 + ROW_H * 0.5,
      dataTransfer,
    })

    expect(visualSlotOrder()).toEqual(['A', 'C', 'B'])
    // Placeholder must remain at the very end of the list — it should
    // never be displaced by the live-preview move.
    const all = parent.querySelectorAll<HTMLElement>('.ui-projects-slot')
    expect(all.length).toBe(4)
    expect(all[3]!.classList.contains('ui-projects-slot--empty')).toBe(true)
  })

  it('live-preview: dragend without drop reverts the DOM order and clears is-dragging', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const rows = realRows()
    stampRowRects(rows)
    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    const grip = gripOf(rows[0]!)
    const { dataTransfer } = dispatchDragEvent(grip, 'dragstart')
    dispatchDragEvent(rows[2]!, 'dragover', {
      clientY: bottomHalfY(2),
      dataTransfer,
    })
    // Sanity precondition: the live-preview reordering occurred.
    // Without this, the revert-to-original assertion below would pass
    // vacuously when the live-preview feature is entirely
    // unimplemented.
    expect(visualSlotOrder()).toEqual(['B', 'C', 'A'])

    // Cancel the drag (Escape / drag-out) — no drop event.
    dispatchDragEvent(grip, 'dragend', { dataTransfer })

    expect(visualSlotOrder()).toEqual(['A', 'B', 'C'])
    expect(placeholderIsLast()).toBe(true)
    // No row should keep the dragging ghost class.
    const dragging = parent.querySelectorAll('.ui-projects-slot.is-dragging')
    expect(dragging.length).toBe(0)
    // The slots array is unchanged (proven indirectly: onReorder was
    // never invoked, so applyReorderToLocalSlots was never called).
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('live-preview: drop commits the previewed order with exactly one onReorder call', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const rows = realRows()
    stampRowRects(rows)
    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    const { dataTransfer } = dispatchDragEvent(gripOf(rows[0]!), 'dragstart')
    dispatchDragEvent(rows[2]!, 'dragover', {
      clientY: bottomHalfY(2),
      dataTransfer,
    })
    expect(visualSlotOrder()).toEqual(['B', 'C', 'A'])

    dispatchDragEvent(rows[2]!, 'drop', {
      clientY: bottomHalfY(2),
      dataTransfer,
    })

    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(['B', 'C', 'A'])
    expect(visualSlotOrder()).toEqual(['B', 'C', 'A'])
    expect(placeholderIsLast()).toBe(true)
  })

  it('live-preview: no .ui-projects-drop-indicator element is inserted during dragover', () => {
    panel.setSlots([makeSlot('A', 'A'), makeSlot('B', 'B'), makeSlot('C', 'C')])
    const rows = realRows()
    stampRowRects(rows)
    const list = parent.querySelector('.ui-projects-list')!

    const { dataTransfer } = dispatchDragEvent(gripOf(rows[0]!), 'dragstart')
    dispatchDragEvent(rows[2]!, 'dragover', {
      clientY: bottomHalfY(2),
      dataTransfer,
    })

    expect(list.querySelectorAll('.ui-projects-drop-indicator').length).toBe(0)
  })

  it('live-preview: consecutive dragovers update DOM order without duplicating rows', () => {
    panel.setSlots([
      makeSlot('A', 'A'),
      makeSlot('B', 'B'),
      makeSlot('C', 'C'),
      makeSlot('D', 'D'),
    ])
    const rows = realRows()
    stampRowRects(rows)
    const list = parent.querySelector('.ui-projects-list')!

    const grip = gripOf(rows[0]!)
    const { dataTransfer } = dispatchDragEvent(grip, 'dragstart')

    dispatchDragEvent(rows[1]!, 'dragover', {
      clientY: bottomHalfY(1),
      dataTransfer,
    })
    expect(visualSlotOrder()).toEqual(['B', 'A', 'C', 'D'])
    expect(list.querySelectorAll('.ui-projects-slot').length).toBe(5)
    expect(placeholderIsLast()).toBe(true)

    dispatchDragEvent(rows[3]!, 'dragover', {
      clientY: bottomHalfY(3),
      dataTransfer,
    })
    expect(visualSlotOrder()).toEqual(['B', 'C', 'D', 'A'])
    expect(list.querySelectorAll('.ui-projects-slot').length).toBe(5)
    expect(placeholderIsLast()).toBe(true)

    dispatchDragEvent(rows[1]!, 'dragover', {
      clientY: topHalfY(1),
      dataTransfer,
    })
    expect(visualSlotOrder()).toEqual(['A', 'B', 'C', 'D'])
    expect(list.querySelectorAll('.ui-projects-slot').length).toBe(5)
    expect(placeholderIsLast()).toBe(true)
  })

  it('live-preview: dragend after many preview moves restores the exact original order', () => {
    panel.setSlots([
      makeSlot('A', 'A'),
      makeSlot('B', 'B'),
      makeSlot('C', 'C'),
      makeSlot('D', 'D'),
    ])
    const rows = realRows()
    stampRowRects(rows)
    const onReorder = vi.fn()
    ;(panel as ReorderPanel).onReorder = onReorder

    const grip = gripOf(rows[1]!)
    const { dataTransfer } = dispatchDragEvent(grip, 'dragstart')

    // Bounce B across many preview positions.
    dispatchDragEvent(rows[0]!, 'dragover', {
      clientY: topHalfY(0),
      dataTransfer,
    })
    dispatchDragEvent(rows[3]!, 'dragover', {
      clientY: bottomHalfY(3),
      dataTransfer,
    })
    dispatchDragEvent(rows[2]!, 'dragover', {
      clientY: topHalfY(2),
      dataTransfer,
    })
    dispatchDragEvent(rows[0]!, 'dragover', {
      clientY: topHalfY(0),
      dataTransfer,
    })
    // Sanity precondition: at least one of the preview moves above
    // shuffled the DOM away from the original [A, B, C, D] order.
    // Without this, the revert assertion would pass vacuously while
    // the live-preview feature is entirely unimplemented.
    expect(visualSlotOrder()).not.toEqual(['A', 'B', 'C', 'D'])

    dispatchDragEvent(grip, 'dragend', { dataTransfer })

    expect(visualSlotOrder()).toEqual(['A', 'B', 'C', 'D'])
    expect(placeholderIsLast()).toBe(true)
    // Slots array unchanged: onReorder never fired (no drop occurred).
    expect(onReorder).not.toHaveBeenCalled()
  })
})