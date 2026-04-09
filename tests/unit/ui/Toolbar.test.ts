/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { initI18n } from '../../../src/i18n/i18n'
import { Toolbar } from '../../../src/ui/Toolbar'

beforeAll(async () => {
  await initI18n()
})

describe('Toolbar', () => {
  let parent: HTMLDivElement

  beforeEach(() => {
    // GIVEN a fresh parent element with a Toolbar rendered inside
    parent = document.createElement('div')
    new Toolbar(parent)
  })

  it('should NOT render a machine type dropdown', () => {
    // WHEN we query for the machine-type select
    const select = parent.querySelector<HTMLSelectElement>('.ui-toolbar-select')

    // THEN it should not exist
    expect(select).toBeNull()
  })

  it('should NOT have any tool-mode buttons (place/remove/select)', () => {
    // WHEN we inspect all button labels
    const buttons = parent.querySelectorAll('button')
    const buttonTexts = Array.from(buttons).map((b) => b.textContent?.toLowerCase() ?? '')

    // THEN no "place", "remove", "select" tool buttons exist
    for (const text of buttonTexts) {
      expect(text).not.toMatch(/\bplace\b/)
      expect(text).not.toMatch(/\bremove\b/)
      expect(text).not.toMatch(/\bselect\b/)
    }
    // THEN only: editor, start, pause, restart, save, load, export (7 non-lang buttons)
    const nonLangButtons = Array.from(buttons).filter(
      (b) => !b.classList.contains('ui-lang-btn'),
    )
    expect(nonLangButtons.length).toBe(7) // editor, start, pause, restart, save, load, export
  })

  it('should have editor, save, load, export buttons', () => {
    // WHEN we collect i18n keys from toolbar buttons
    const buttons = parent.querySelectorAll<HTMLButtonElement>('.ui-toolbar-btn')
    const keys = Array.from(buttons)
      .map((b) => b.dataset.i18nKey)
      .filter(Boolean)

    // THEN the expected action keys are present
    expect(keys).toContain('actions.open_editor')
    expect(keys).toContain('toolbar.save')
    expect(keys).toContain('toolbar.load')
    expect(keys).toContain('toolbar.export')
  })

  it('should have Start button with correct i18n key and CSS class', () => {
    // WHEN we query for the start button
    const btn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--start')

    // THEN it exists with the correct i18n key and text
    expect(btn).not.toBeNull()
    expect(btn!.dataset.i18nKey).toBe('actions.start')
    expect(btn!.textContent).toBe('Start')
  })

  it('should have Pause button with correct i18n key and CSS class', () => {
    // WHEN we query for the pause button
    const btn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--pause')

    // THEN it exists with the correct i18n key and text
    expect(btn).not.toBeNull()
    expect(btn!.dataset.i18nKey).toBe('actions.pause')
    expect(btn!.textContent).toBe('Pause')
  })

  it('should have Restart button with correct i18n key and CSS class', () => {
    // WHEN we query for the restart button
    const btn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--restart')

    // THEN it exists with the correct i18n key and text
    expect(btn).not.toBeNull()
    expect(btn!.dataset.i18nKey).toBe('actions.restart')
    expect(btn!.textContent).toBe('Restart')
  })

  it('should group sim buttons inside .ui-toolbar-sim-controls', () => {
    // WHEN we query the sim-controls group
    const group = parent.querySelector('.ui-toolbar-sim-controls')

    // THEN it contains exactly 3 buttons
    expect(group).not.toBeNull()
    const btns = group!.querySelectorAll('button')
    expect(btns.length).toBe(3)
  })

  it('should fire onStart callback when Start button is clicked', () => {
    // GIVEN a toolbar with an onStart spy
    const toolbar = new Toolbar(document.createElement('div'))
    const spy = vi.fn()
    toolbar.onStart = spy
    const container = (toolbar as any).container as HTMLDivElement

    // WHEN start button is clicked
    container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--start')!.click()

    // THEN the callback fires once
    expect(spy).toHaveBeenCalledOnce()
  })

  it('should fire onPause callback when Pause button is clicked', () => {
    // GIVEN a toolbar with an onPause spy
    const toolbar = new Toolbar(document.createElement('div'))
    const spy = vi.fn()
    toolbar.onPause = spy
    const container = (toolbar as any).container as HTMLDivElement

    // WHEN pause button is clicked
    container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--pause')!.click()

    // THEN the callback fires once
    expect(spy).toHaveBeenCalledOnce()
  })

  it('should fire onRestart callback when Restart button is clicked', () => {
    // GIVEN a toolbar with an onRestart spy
    const toolbar = new Toolbar(document.createElement('div'))
    const spy = vi.fn()
    toolbar.onRestart = spy
    const container = (toolbar as any).container as HTMLDivElement

    // WHEN restart button is clicked
    container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--restart')!.click()

    // THEN the callback fires once
    expect(spy).toHaveBeenCalledOnce()
  })
})
