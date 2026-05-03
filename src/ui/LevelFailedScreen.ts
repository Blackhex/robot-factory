import i18next from 'i18next'

/**
 * "Level Failed" overlay shown for campaign runs where the player ends the
 * simulation without meeting the level's required output count (UX
 * blocker B1). Replaces the regular `ScoreScreen` for the failure path —
 * the two are mutually exclusive.
 *
 * Mounted as a sibling DOM overlay on `#ui-overlay`. Visibility is
 * controlled by `main.ts` from the `GameManager.stateChanged` handler so
 * this class never imports from `src/game/` or `src/rendering/`.
 */
export class LevelFailedScreen {
  private container: HTMLDivElement
  private titleEl: HTMLHeadingElement
  private levelNameEl: HTMLDivElement
  private messageEl: HTMLParagraphElement
  private retryBtn: HTMLButtonElement
  private backBtn: HTMLButtonElement

  onRetry: () => void = () => {}
  onBackToLevelSelect: () => void = () => {}

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'ui-level-failed-screen'

    const card = document.createElement('div')
    card.className = 'ui-level-failed-card'

    this.titleEl = document.createElement('h2')
    this.titleEl.className = 'ui-level-failed-title'
    this.titleEl.textContent = i18next.t('level_failed.title')
    card.appendChild(this.titleEl)

    this.levelNameEl = document.createElement('div')
    this.levelNameEl.className = 'ui-level-failed-level-name'
    card.appendChild(this.levelNameEl)

    this.messageEl = document.createElement('p')
    this.messageEl.className = 'ui-level-failed-message'
    this.messageEl.textContent = i18next.t('level_failed.message')
    card.appendChild(this.messageEl)

    const buttons = document.createElement('div')
    buttons.className = 'ui-level-failed-buttons'

    this.retryBtn = document.createElement('button')
    this.retryBtn.className = 'ui-level-failed-btn ui-level-failed-btn--primary'
    this.retryBtn.textContent = i18next.t('level_failed.retry')
    this.retryBtn.addEventListener('click', () => this.onRetry())
    buttons.appendChild(this.retryBtn)

    this.backBtn = document.createElement('button')
    this.backBtn.className = 'ui-level-failed-btn'
    this.backBtn.textContent = i18next.t('level_failed.back_to_select')
    this.backBtn.addEventListener('click', () => this.onBackToLevelSelect())
    buttons.appendChild(this.backBtn)

    card.appendChild(buttons)
    this.container.appendChild(card)
    parent.appendChild(this.container)

    this.container.style.display = 'none'

    i18next.on('languageChanged', this.updateLabels)
  }

  setLevelName(levelName: string): void {
    this.levelNameEl.textContent = levelName
  }

  show(): void {
    this.container.style.display = 'flex'
  }

  hide(): void {
    this.container.style.display = 'none'
  }

  dispose(): void {
    i18next.off('languageChanged', this.updateLabels)
    this.container.remove()
  }

  private updateLabels = (): void => {
    this.titleEl.textContent = i18next.t('level_failed.title')
    this.messageEl.textContent = i18next.t('level_failed.message')
    this.retryBtn.textContent = i18next.t('level_failed.retry')
    this.backBtn.textContent = i18next.t('level_failed.back_to_select')
  }
}
