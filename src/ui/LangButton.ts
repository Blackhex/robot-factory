import { i18next, switchLanguage } from '../i18n/i18n'

/**
 * Standalone language toggle button. Mounted globally on `#ui-overlay` so
 * it appears on every screen (Main Menu, Level Select, in-level, Score,
 * Level Failed) — see UX blocker B2.
 *
 * Uses the canonical `.ui-lang-btn` selector that page objects (e.g.
 * `MainMenuPage`, `LevelSelectPage`, `ToolbarPage`) target. The toolbar
 * no longer renders its own copy.
 */
export class LangButton {
  private container: HTMLDivElement
  private button: HTMLButtonElement
  private handleLangChange = (): void => this.updateLabel()

  constructor(parent: HTMLElement) {
    // Wrapper isolates focus/positioning concerns from the bare button so
    // we can apply layout (`position: fixed`) without bleeding into the
    // toolbar's flex layout.
    this.container = document.createElement('div')
    this.container.className = 'ui-lang-btn-container'

    this.button = document.createElement('button')
    this.button.className = 'ui-lang-btn'
    this.button.type = 'button'
    this.button.setAttribute('aria-label', i18next.t('language'))
    this.button.textContent = this.computeLabel()
    this.button.addEventListener('click', () => {
      void this.toggleLanguage()
    })

    this.container.appendChild(this.button)
    parent.appendChild(this.container)

    i18next.on('languageChanged', this.handleLangChange)
  }

  show(): void {
    this.container.style.display = 'flex'
  }

  hide(): void {
    this.container.style.display = 'none'
  }

  dispose(): void {
    i18next.off('languageChanged', this.handleLangChange)
    this.container.remove()
  }

  private computeLabel(): string {
    return i18next.language === 'en' ? 'CS' : 'EN'
  }

  private updateLabel(): void {
    this.button.textContent = this.computeLabel()
    this.button.setAttribute('aria-label', i18next.t('language'))
  }

  private async toggleLanguage(): Promise<void> {
    const next = i18next.language === 'en' ? 'cs' : 'en'
    await switchLanguage(next)
  }
}
