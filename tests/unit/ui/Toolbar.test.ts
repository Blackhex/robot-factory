/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { initI18n, switchLanguage } from '../../../src/i18n/i18n'
import { Toolbar } from '../../../src/ui/Toolbar'
import enLocale from '../../../src/locales/en.json'
import csLocale from '../../../src/locales/cs.json'

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
    // THEN only: back-to-menu, editor, start, pause, restart, save, load, export, reset-view (9 non-lang buttons)
    const nonLangButtons = Array.from(buttons).filter(
      (b) => !b.classList.contains('ui-lang-btn'),
    )
    expect(nonLangButtons.length).toBe(9) // back-to-menu, editor, start, pause, restart, save, load, export, reset-view
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

  describe('Pause/Resume toggle', () => {
    it('should set i18nKey to actions.resume and text to "Resume" when setPaused(true)', () => {
      // GIVEN a fresh toolbar
      const toolbar = new Toolbar(document.createElement('div'))
      const container = (toolbar as any).container as HTMLDivElement
      const btn = container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--pause')!

      // WHEN we mark the toolbar as paused
      toolbar.setPaused(true)

      // THEN the button advertises the resume action
      expect(btn.dataset.i18nKey).toBe('actions.resume')
      expect(btn.textContent).toBe('Resume')
      // AND it remains queryable by the existing pause class
      expect(btn.classList.contains('ui-toolbar-btn--pause')).toBe(true)
    })

    it('should restore i18nKey to actions.pause and text to "Pause" when setPaused(false)', () => {
      // GIVEN a paused toolbar
      const toolbar = new Toolbar(document.createElement('div'))
      const container = (toolbar as any).container as HTMLDivElement
      const btn = container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--pause')!
      toolbar.setPaused(true)

      // WHEN we resume
      toolbar.setPaused(false)

      // THEN the button advertises the pause action again
      expect(btn.dataset.i18nKey).toBe('actions.pause')
      expect(btn.textContent).toBe('Pause')
    })

    it('should fire onPause (not onResume) when clicked while NOT paused', () => {
      // GIVEN a non-paused toolbar with both spies wired
      const toolbar = new Toolbar(document.createElement('div'))
      const onPause = vi.fn()
      const onResume = vi.fn()
      toolbar.onPause = onPause
      toolbar.onResume = onResume
      const container = (toolbar as any).container as HTMLDivElement

      // WHEN the button is clicked
      container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--pause')!.click()

      // THEN only onPause fires
      expect(onPause).toHaveBeenCalledOnce()
      expect(onResume).not.toHaveBeenCalled()
    })

    it('should fire onResume (not onPause) when clicked while paused', () => {
      // GIVEN a paused toolbar with both spies wired
      const toolbar = new Toolbar(document.createElement('div'))
      const onPause = vi.fn()
      const onResume = vi.fn()
      toolbar.onPause = onPause
      toolbar.onResume = onResume
      toolbar.setPaused(true)
      const container = (toolbar as any).container as HTMLDivElement

      // WHEN the button is clicked
      container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--pause')!.click()

      // THEN only onResume fires
      expect(onResume).toHaveBeenCalledOnce()
      expect(onPause).not.toHaveBeenCalled()
    })

    it('should default onResume to a no-op so clicking while paused does not throw', () => {
      // GIVEN a paused toolbar with no onResume override
      const toolbar = new Toolbar(document.createElement('div'))
      toolbar.setPaused(true)
      const container = (toolbar as any).container as HTMLDivElement
      const btn = container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--pause')!

      // THEN clicking does not throw
      expect(() => btn.click()).not.toThrow()
      // AND onResume is a function by default
      expect(typeof toolbar.onResume).toBe('function')
    })

    it('should keep the resume label localized after switching language while paused', async () => {
      // GIVEN a paused toolbar in English
      await switchLanguage('en')
      const toolbar = new Toolbar(document.createElement('div'))
      const container = (toolbar as any).container as HTMLDivElement
      const btn = container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--pause')!
      toolbar.setPaused(true)
      expect(btn.textContent).toBe('Resume')

      // WHEN switching to Czech
      await switchLanguage('cs')

      // THEN the button still uses the resume key, with the Czech localization
      expect(btn.dataset.i18nKey).toBe('actions.resume')
      expect(btn.textContent).toBe((csLocale as any).actions.resume)
      expect(btn.textContent).not.toBe('Resume')

      // cleanup: restore default language for other tests
      await switchLanguage('en')
    })
  })

  describe('Locale keys', () => {
    it('should define actions.resume in both en.json and cs.json', () => {
      // THEN both locale files expose the resume action key
      expect((enLocale as any).actions?.resume).toBe('Resume')
      expect(typeof (csLocale as any).actions?.resume).toBe('string')
      expect((csLocale as any).actions?.resume.length).toBeGreaterThan(0)
    })

    it('should define toolbar.back_to_menu as a non-empty string in en.json', () => {
      const value = (enLocale as any).toolbar?.back_to_menu
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    })

    it('should define toolbar.back_to_menu as a non-empty string in cs.json', () => {
      const value = (csLocale as any).toolbar?.back_to_menu
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    })

    it('should define toolbar.sandbox_badge as a non-empty string in en.json', () => {
      const value = (enLocale as any).toolbar?.sandbox_badge
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    })

    it('should define toolbar.sandbox_badge as a non-empty string in cs.json', () => {
      const value = (csLocale as any).toolbar?.sandbox_badge
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    })
  })

  describe('Back-to-Menu button', () => {
    it('should render a button with class ui-toolbar-btn--back-to-menu and localized label', async () => {
      // GIVEN english locale and a fresh toolbar
      if ((await import('../../../src/i18n/i18n')).i18next.language !== 'en') {
        await switchLanguage('en')
      }
      const localParent = document.createElement('div')
      new Toolbar(localParent)

      // WHEN we query the back-to-menu button
      const btn = localParent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--back-to-menu')

      // THEN it exists with the expected localized text
      expect(btn).not.toBeNull()
      const { i18next } = await import('../../../src/i18n/i18n')
      expect(btn!.textContent).toBe(i18next.t('toolbar.back_to_menu'))
    })

    it('should tag the back-to-menu button with data-i18n-key=toolbar.back_to_menu', () => {
      const btn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--back-to-menu')
      expect(btn).not.toBeNull()
      expect(btn!.dataset.i18nKey).toBe('toolbar.back_to_menu')
    })

    it('should fire onBackToMenu exactly once when the button is clicked', () => {
      // GIVEN a toolbar with an onBackToMenu spy
      const toolbar = new Toolbar(document.createElement('div'))
      const spy = vi.fn()
      toolbar.onBackToMenu = spy
      const container = (toolbar as any).container as HTMLDivElement
      const btn = container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--back-to-menu')!

      // WHEN the button is clicked
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      // THEN the callback fires once
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('should default onBackToMenu to a no-op so clicking does not throw', () => {
      const toolbar = new Toolbar(document.createElement('div'))
      const container = (toolbar as any).container as HTMLDivElement
      const btn = container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--back-to-menu')!
      expect(typeof toolbar.onBackToMenu).toBe('function')
      expect(() => btn.click()).not.toThrow()
    })

    it('should re-localize the back-to-menu button label on language change', async () => {
      // GIVEN a toolbar in English
      await switchLanguage('en')
      const toolbar = new Toolbar(document.createElement('div'))
      const container = (toolbar as any).container as HTMLDivElement
      const btn = container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--back-to-menu')!
      const englishLabel = btn.textContent

      // WHEN switching to Czech
      await switchLanguage('cs')

      // THEN the label is the Czech translation for the same key
      try {
        expect(btn.textContent).toBe((csLocale as any).toolbar?.back_to_menu)
        expect(btn.textContent).not.toBe(englishLabel)
      } finally {
        // cleanup: restore default language
        await switchLanguage('en')
      }
    })
  })

  describe('Sandbox badge', () => {
    function isHidden(el: HTMLElement): boolean {
      if (el.style.display === 'none') return true
      return getComputedStyle(el).display === 'none'
    }

    it('should render a sandbox badge that is hidden by default', () => {
      // WHEN we query for the badge
      const badge = parent.querySelector<HTMLElement>('.ui-toolbar-sandbox-badge')

      // THEN it exists but is hidden
      expect(badge).not.toBeNull()
      expect(isHidden(badge!)).toBe(true)
    })

    it('should show the sandbox badge with localized text after setSandboxMode(true)', async () => {
      // GIVEN english locale and a toolbar
      await switchLanguage('en')
      const toolbar = new Toolbar(document.createElement('div'))
      const container = (toolbar as any).container as HTMLDivElement
      const badge = container.querySelector<HTMLElement>('.ui-toolbar-sandbox-badge')!

      // WHEN sandbox mode is enabled
      toolbar.setSandboxMode(true)

      // THEN the badge is visible with the localized text
      expect(isHidden(badge)).toBe(false)
      const { i18next } = await import('../../../src/i18n/i18n')
      expect(badge.textContent).toBe(i18next.t('toolbar.sandbox_badge'))
    })

    it('should hide the sandbox badge again after setSandboxMode(false)', () => {
      // GIVEN a toolbar with sandbox mode initially enabled
      const toolbar = new Toolbar(document.createElement('div'))
      const container = (toolbar as any).container as HTMLDivElement
      const badge = container.querySelector<HTMLElement>('.ui-toolbar-sandbox-badge')!
      toolbar.setSandboxMode(true)
      expect(isHidden(badge)).toBe(false)

      // WHEN sandbox mode is disabled
      toolbar.setSandboxMode(false)

      // THEN the badge is hidden again
      expect(isHidden(badge)).toBe(true)
    })
  })

  describe('Simulation state management', () => {
    type SimulationState = 'idle' | 'running' | 'paused' | 'stopped'

    function buildToolbar(): {
      toolbar: Toolbar
      container: HTMLDivElement
      start: HTMLButtonElement
      pause: HTMLButtonElement
      restart: HTMLButtonElement
    } {
      const toolbar = new Toolbar(document.createElement('div'))
      const container = (toolbar as any).container as HTMLDivElement
      const start = container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--start')!
      const pause = container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--pause')!
      const restart = container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--restart')!
      return { toolbar, container, start, pause, restart }
    }

    function expectDisabled(btn: HTMLButtonElement): void {
      expect(btn.disabled).toBe(true)
      expect(btn.classList.contains('is-disabled')).toBe(true)
    }

    function expectEnabled(btn: HTMLButtonElement): void {
      expect(btn.disabled).toBe(false)
      expect(btn.classList.contains('is-disabled')).toBe(false)
    }

    it('should expose setSimulationState as a function', () => {
      // GIVEN a fresh toolbar
      const { toolbar } = buildToolbar()

      // THEN setSimulationState exists as a method
      expect(typeof (toolbar as any).setSimulationState).toBe('function')
    })

    it("should disable Pause and Restart and leave Start enabled in 'idle' state", () => {
      // GIVEN a toolbar
      const { toolbar, start, pause, restart } = buildToolbar()

      // WHEN the simulation enters the idle state
      ;(toolbar as any).setSimulationState('idle' satisfies SimulationState)

      // THEN Start is the prominent (enabled) action
      expectEnabled(start)
      // AND Pause and Restart are visually disabled
      expectDisabled(pause)
      expectDisabled(restart)
    })

    it("should enable Pause and Restart and disable Start in 'running' state", () => {
      // GIVEN a toolbar
      const { toolbar, start, pause, restart } = buildToolbar()

      // WHEN the simulation is running
      ;(toolbar as any).setSimulationState('running' satisfies SimulationState)

      // THEN Start is disabled (already running)
      expectDisabled(start)
      // AND Pause + Restart are actionable
      expectEnabled(pause)
      expectEnabled(restart)
    })

    it("should keep Pause enabled, disable Start, and enable Restart in 'paused' state", () => {
      // GIVEN a toolbar
      const { toolbar, start, pause, restart } = buildToolbar()

      // WHEN the simulation is paused
      ;(toolbar as any).setSimulationState('paused' satisfies SimulationState)

      // THEN Start remains disabled while a simulation exists
      expectDisabled(start)
      // AND Pause stays enabled (it doubles as Resume)
      expectEnabled(pause)
      // AND Restart is enabled
      expectEnabled(restart)
    })

    it("should disable Start and Pause and enable Restart in 'stopped' state", () => {
      // GIVEN a toolbar
      const { toolbar, start, pause, restart } = buildToolbar()

      // WHEN the simulation has stopped (game over / level complete)
      ;(toolbar as any).setSimulationState('stopped' satisfies SimulationState)

      // THEN Restart is the only actionable simulation control
      expectDisabled(start)
      expectDisabled(pause)
      expectEnabled(restart)
    })
  })

  describe('Reset View button', () => {
    it('should declare toolbar.reset_view as a non-empty string in en.json', () => {
      // THEN the EN locale exposes the reset_view label
      const value = (enLocale as any).toolbar?.reset_view
      expect(typeof value).toBe('string')
      expect(value.trim().length).toBeGreaterThan(0)
    })

    it('should declare toolbar.reset_view as a non-empty string in cs.json that differs from EN', () => {
      // THEN the CS locale exposes the reset_view label
      const csValue = (csLocale as any).toolbar?.reset_view
      const enValue = (enLocale as any).toolbar?.reset_view
      expect(typeof csValue).toBe('string')
      expect(csValue.trim().length).toBeGreaterThan(0)
      // AND it differs from the EN value (case-insensitive trimmed comparison)
      expect(csValue.trim().toLowerCase()).not.toBe(String(enValue ?? '').trim().toLowerCase())
    })

    it('should render a Reset View button with the localized label', async () => {
      // GIVEN english locale and a fresh toolbar
      const { i18next } = await import('../../../src/i18n/i18n')
      if (i18next.language !== 'en') {
        await switchLanguage('en')
      }
      const localParent = document.createElement('div')
      new Toolbar(localParent)

      // WHEN we query the reset-view button
      const btn = localParent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--reset-view')

      // THEN it exists with the expected localized text
      expect(btn).not.toBeNull()
      expect(btn!.textContent).toBe(i18next.t('toolbar.reset_view'))
    })

    it('should tag the Reset View button with data-i18n-key=toolbar.reset_view', () => {
      // WHEN we query the reset-view button on the default toolbar
      const btn = parent.querySelector<HTMLButtonElement>('.ui-toolbar-btn--reset-view')

      // THEN it carries the i18n key for re-localization on language change
      expect(btn).not.toBeNull()
      expect(btn!.dataset.i18nKey).toBe('toolbar.reset_view')
    })

    it('should fire onResetView exactly once when the Reset View button is clicked', () => {
      // GIVEN a toolbar with an onResetView spy
      const toolbar = new Toolbar(document.createElement('div'))
      const spy = vi.fn()
      ;(toolbar as any).onResetView = spy
      const container = (toolbar as any).container as HTMLDivElement
      const btn = container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--reset-view')!

      // WHEN the button is clicked
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      // THEN the callback fires exactly once
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('should default onResetView to a no-op so clicking does not throw', () => {
      // GIVEN a toolbar with no onResetView override
      const toolbar = new Toolbar(document.createElement('div'))
      const container = (toolbar as any).container as HTMLDivElement
      const btn = container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--reset-view')!

      // THEN onResetView is a function by default
      expect(typeof (toolbar as any).onResetView).toBe('function')
      // AND clicking does not throw
      expect(() => btn.click()).not.toThrow()
    })

    it('should re-localize the Reset View button label on language change', async () => {
      // GIVEN a toolbar in English
      await switchLanguage('en')
      const toolbar = new Toolbar(document.createElement('div'))
      const container = (toolbar as any).container as HTMLDivElement
      const btn = container.querySelector<HTMLButtonElement>('.ui-toolbar-btn--reset-view')!
      const englishLabel = btn.textContent

      // WHEN switching to Czech
      await switchLanguage('cs')

      // THEN the label is the Czech translation for the same key
      try {
        expect(btn.dataset.i18nKey).toBe('toolbar.reset_view')
        expect(btn.textContent).toBe((csLocale as any).toolbar?.reset_view)
        expect(btn.textContent).not.toBe(englishLabel)
      } finally {
        // cleanup: restore default language for other tests
        await switchLanguage('en')
      }
    })
  })
})
