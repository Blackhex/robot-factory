import i18next from 'i18next'

/**
 * PXT bakes the locale at iframe load time and has no live-reload API,
 * so a mid-session app-language toggle cannot re-render the embedded
 * editor in place — only a page reload picks up the new locale. This
 * module owns the small toast that informs the player to reload, plus
 * the i18next `languageChanged` listener that triggers it.
 *
 * Pure DOM + i18next; no three.js, game, or rendering imports.
 */

export type PxtLocale = 'en' | 'cs'

/** Map an i18next app-language code to the PXT locale code shipped under public/pxt-editor/locales/. */
export function toPxtLocale(lang: string | undefined): PxtLocale {
  return lang === 'cs' ? 'cs' : 'en'
}

export interface PxtLanguageReloadNoticeOptions {
  container: HTMLElement
  isEditorVisible: () => boolean
  iframeLangAtMount: PxtLocale
}

export interface PxtLanguageReloadNoticeHandle {
  dispose(): void
  /**
   * Force a fresh check of `i18next.language` against `iframeLangAtMount`
   * and show the notice if they differ AND the editor is currently visible.
   * Called by `PxtEditor.show()` so a player who dismissed the toast before
   * opening the editor still sees the prompt on first open.
   */
  checkLanguageMismatch(): void
}

export function installPxtLanguageReloadNotice(opts: PxtLanguageReloadNoticeOptions): PxtLanguageReloadNoticeHandle {
  const { container, isEditorVisible, iframeLangAtMount } = opts
  let noticeEl: HTMLDivElement | null = null
  let noticeTimeout: ReturnType<typeof setTimeout> | null = null
  let keydownHandler: ((ev: KeyboardEvent) => void) | null = null

  const dismiss = (): void => {
    if (noticeTimeout) {
      clearTimeout(noticeTimeout)
      noticeTimeout = null
    }
    if (keydownHandler) {
      window.removeEventListener('keydown', keydownHandler, true)
      keydownHandler = null
    }
    if (noticeEl) {
      noticeEl.remove()
      noticeEl = null
    }
  }

  const show = (): void => {
    dismiss()
    const notice = document.createElement('div')
    notice.className = 'pxt-editor-language-reload-notice'
    // `role="alert"` + `aria-live="assertive"` so screen readers announce
    // the 6-second toast immediately; `aria-atomic` ensures the full
    // message is read on every update; `tabindex=0` lets keyboard users
    // focus and dismiss via Escape (also Enter/Space).
    notice.setAttribute('role', 'alert')
    notice.setAttribute('aria-live', 'assertive')
    notice.setAttribute('aria-atomic', 'true')
    notice.setAttribute('tabindex', '0')
    notice.textContent = i18next.t('editor.language_reload_notice')
    notice.style.cssText = [
      'position: absolute',
      'top: 12px',
      'left: 50%',
      'transform: translateX(-50%)',
      'z-index: 10000',
      'background: rgba(15, 17, 23, 0.95)',
      'color: var(--rf-text, #e2e6ed)',
      'border: 1px solid var(--rf-accent, #4fc3f7)',
      'border-radius: 6px',
      'padding: 8px 14px',
      'font-family: var(--rf-font, system-ui, sans-serif)',
      'font-size: 0.875rem',
      'cursor: pointer',
      'box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4)',
      'max-width: 80%',
      'text-align: center',
      'pointer-events: auto',
    ].join(';')
    notice.addEventListener('click', dismiss)
    keydownHandler = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' || ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
        // stopImmediatePropagation so the global window-capture exit-to-menu
        // handler (wireWindowEvents) never sees this Escape and the player
        // doesn't lose their level just by dismissing a transient toast.
        ev.preventDefault()
        ev.stopImmediatePropagation()
        ev.stopPropagation()
        dismiss()
      }
    }
    // Register on `window` at capture phase so we sit on the same surface
    // as the exit-to-menu handler in `wireWindowEvents`; the isEscapeBlocked
    // gate in main.ts also short-circuits the exit binding while the
    // notice owns focus, so this is belt-and-braces.
    window.addEventListener('keydown', keydownHandler, true)
    container.appendChild(notice)
    noticeEl = notice
    // Auto-focus the notice for keyboard users (Esc/Enter/Space dismiss).
    // Only steal focus from a passive document — never preempt an editor
    // surface, input field, or other interactive element the user is using.
    const active = document.activeElement
    if (!active || active === document.body) {
      notice.focus()
    }
    noticeTimeout = setTimeout(dismiss, 6000)
  }

  const checkLanguageMismatch = (): void => {
    if (toPxtLocale(i18next.language) !== iframeLangAtMount && isEditorVisible()) {
      show()
    }
  }

  const handler = (lng: string): void => {
    if (toPxtLocale(lng) !== iframeLangAtMount && isEditorVisible()) {
      show()
    }
  }
  i18next.on('languageChanged', handler)

  return {
    dispose(): void {
      i18next.off('languageChanged', handler)
      dismiss()
    },
    checkLanguageMismatch,
  }
}
