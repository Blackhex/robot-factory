import i18next from 'i18next'
import type { GameOverInfo } from '../game/types'

export class GameOverModal {
  private container: HTMLDivElement
  private titleEl: HTMLHeadingElement
  private messageEl: HTMLParagraphElement
  private retryBtn: HTMLButtonElement
  private _lastInfo: GameOverInfo | null = null

  onRetry: () => void = () => {}

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'ui-game-over-modal'

    const card = document.createElement('div')
    card.className = 'ui-game-over-card'

    this.titleEl = document.createElement('h2')
    this.titleEl.className = 'ui-game-over-title'
    this.titleEl.textContent = i18next.t('game_over.title')
    card.appendChild(this.titleEl)

    this.messageEl = document.createElement('p')
    this.messageEl.className = 'ui-game-over-message'
    card.appendChild(this.messageEl)

    this.retryBtn = document.createElement('button')
    this.retryBtn.className = 'ui-game-over-btn'
    this.retryBtn.textContent = i18next.t('game_over.restart')
    this.retryBtn.addEventListener('click', () => this.onRetry())
    card.appendChild(this.retryBtn)

    this.container.appendChild(card)
    parent.appendChild(this.container)

    this.container.style.display = 'none'

    i18next.on('languageChanged', this.updateLabels)
  }

  show(info: GameOverInfo): void {
    this._lastInfo = info
    this.updateLabels()
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
    this.titleEl.textContent = i18next.t('game_over.title')
    this.retryBtn.textContent = i18next.t('game_over.restart')
    if (this._lastInfo) {
      const key = `game_over.reason.${this._lastInfo.reason}`
      this.messageEl.textContent = i18next.t(key, {
        machine: this._lastInfo.machineId,
        item: this._lastInfo.itemType,
      })
    }
  }
}
