/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initI18n } from '../../../src/i18n/i18n'
import { i18next } from '../../../src/i18n/i18n'
import { Toolbar } from '../../../src/ui/Toolbar'

beforeAll(async () => {
  await initI18n()
})

describe('Toolbar — Projects button', () => {
  let parent: HTMLDivElement
  let toolbar: Toolbar

  beforeEach(() => {
    parent = document.createElement('div')
    toolbar = new Toolbar(parent)
  })

  it('renders a ui-toolbar-btn--projects button', () => {
    const btn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--projects')
    expect(btn).not.toBeNull()
  })

  it('hides the Projects button by default', () => {
    const btn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--projects')!
    expect(btn.style.display).toBe('none')
  })

  it('toggles Projects button visibility via setSandboxMode', () => {
    const btn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--projects')!

    toolbar.setSandboxMode(true)
    expect(btn.style.display).not.toBe('none')

    toolbar.setSandboxMode(false)
    expect(btn.style.display).toBe('none')
  })

  it('invokes onOpenProjects when the Projects button is clicked', () => {
    const handler = vi.fn()
    toolbar.onOpenProjects = handler

    const btn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--projects')!
    btn.click()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does NOT render Save / Load / Export buttons in the toolbar', () => {
    const buttons = parent.querySelectorAll<HTMLButtonElement>('.ui-toolbar-btn')
    const keys = Array.from(buttons).map((b) => b.dataset.i18nKey)

    expect(keys).not.toContain('toolbar.save')
    expect(keys).not.toContain('toolbar.load')
    expect(keys).not.toContain('toolbar.export')

    const saveText = i18next.t('toolbar.save')
    const loadText = i18next.t('toolbar.load')
    const exportText = i18next.t('toolbar.export')
    const allText = parent.textContent ?? ''
    // None of the legacy labels should appear as button text in the toolbar
    for (const btn of buttons) {
      const t = (btn.textContent ?? '').trim()
      expect(t).not.toBe(saveText)
      expect(t).not.toBe(loadText)
      expect(t).not.toBe(exportText)
    }
    // sanity guard: ensure we actually checked something
    expect(typeof allText).toBe('string')
  })

  it('does NOT expose onSave / onLoad / onExport callbacks', () => {
    const tb = toolbar as unknown as Record<string, unknown>
    expect(tb.onSave).toBeUndefined()
    expect(tb.onLoad).toBeUndefined()
    expect(tb.onExport).toBeUndefined()
  })

  it('renders Projects button immediately after Menu and BEFORE the Code button', () => {
    const root = parent.querySelector<HTMLDivElement>('.ui-toolbar')!
    const directBtns = Array.from(root.children).filter((el) =>
      el.classList.contains('ui-toolbar-btn'),
    ) as HTMLButtonElement[]

    expect(directBtns.length).toBeGreaterThanOrEqual(3)
    expect(directBtns[0].classList.contains('ui-toolbar-btn--back-to-menu')).toBe(true)
    expect(directBtns[1].classList.contains('ui-toolbar-btn--projects')).toBe(true)
    expect(directBtns[2].classList.contains('ui-toolbar-btn--editor')).toBe(true)
  })

  it('setEditorPanelOpen toggles is-panel-open on the Code button', () => {
    const btn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--editor')!
    expect(btn.classList.contains('is-panel-open')).toBe(false)

    toolbar.setEditorPanelOpen(true)
    expect(btn.classList.contains('is-panel-open')).toBe(true)

    toolbar.setEditorPanelOpen(false)
    expect(btn.classList.contains('is-panel-open')).toBe(false)
  })

  it('setProjectsPanelOpen toggles is-panel-open on the Projects button', () => {
    const btn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--projects')!
    expect(btn.classList.contains('is-panel-open')).toBe(false)

    toolbar.setProjectsPanelOpen(true)
    expect(btn.classList.contains('is-panel-open')).toBe(true)

    toolbar.setProjectsPanelOpen(false)
    expect(btn.classList.contains('is-panel-open')).toBe(false)
  })

  it('panel-open methods are independent across the two buttons', () => {
    const editorBtn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--editor')!
    const projectsBtn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--projects')!

    toolbar.setEditorPanelOpen(true)
    expect(editorBtn.classList.contains('is-panel-open')).toBe(true)
    expect(projectsBtn.classList.contains('is-panel-open')).toBe(false)

    toolbar.setEditorPanelOpen(false)
    toolbar.setProjectsPanelOpen(true)
    expect(editorBtn.classList.contains('is-panel-open')).toBe(false)
    expect(projectsBtn.classList.contains('is-panel-open')).toBe(true)
  })

  it('default state: neither Code nor Projects button has is-panel-open', () => {
    const editorBtn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--editor')!
    const projectsBtn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--projects')!
    expect(editorBtn.classList.contains('is-panel-open')).toBe(false)
    expect(projectsBtn.classList.contains('is-panel-open')).toBe(false)
  })
})

describe('Toolbar — panel-open CSS rules in src/style.css', () => {
  const css = readFileSync(
    resolve(__dirname, '../../../src/style.css'),
    'utf-8',
  )

  it('defines a rule for .ui-toolbar-btn--editor.is-panel-open', () => {
    expect(css).toMatch(/\.ui-toolbar-btn--editor\s*\.is-panel-open|\.ui-toolbar-btn--editor\.is-panel-open/)
    // Specifically require the chained (combined) selector, not descendant.
    expect(css).toMatch(/\.ui-toolbar-btn--editor\.is-panel-open/)
  })

  it('defines a rule for .ui-toolbar-btn--projects.is-panel-open', () => {
    expect(css).toMatch(/\.ui-toolbar-btn--projects\.is-panel-open/)
  })
})
