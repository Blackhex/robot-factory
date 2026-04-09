import { i18next } from '../i18n/i18n'

export class MainMenu {
  private container: HTMLDivElement
  private titleEl: HTMLHeadingElement
  private subtitleEl: HTMLParagraphElement
  private startBtn: HTMLButtonElement
  private sandboxBtn: HTMLButtonElement

  onStart: () => void = () => {}
  onSandbox: () => void = () => {}
  private handleLangChange = (): void => { this.updateLabels() }

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'ui-main-menu'

    const card = document.createElement('div')
    card.className = 'ui-main-menu-card'

    this.titleEl = document.createElement('h1')
    this.titleEl.className = 'ui-main-menu-title'
    this.titleEl.textContent = i18next.t('main_menu.title')
    card.appendChild(this.titleEl)

    this.subtitleEl = document.createElement('p')
    this.subtitleEl.className = 'ui-main-menu-subtitle'
    this.subtitleEl.textContent = i18next.t('main_menu.subtitle')
    card.appendChild(this.subtitleEl)

    this.startBtn = document.createElement('button')
    this.startBtn.className = 'ui-main-menu-btn ui-main-menu-btn--primary'
    this.startBtn.textContent = i18next.t('main_menu.start')
    this.startBtn.addEventListener('click', () => this.onStart())
    card.appendChild(this.startBtn)

    this.sandboxBtn = document.createElement('button')
    this.sandboxBtn.className = 'ui-main-menu-btn'
    this.sandboxBtn.textContent = i18next.t('main_menu.sandbox')
    this.sandboxBtn.addEventListener('click', () => this.onSandbox())
    card.appendChild(this.sandboxBtn)

    this.container.appendChild(card)
    parent.appendChild(this.container)

    i18next.on('languageChanged', this.handleLangChange)
  }

  private updateLabels(): void {
    this.titleEl.textContent = i18next.t('main_menu.title')
    this.subtitleEl.textContent = i18next.t('main_menu.subtitle')
    this.startBtn.textContent = i18next.t('main_menu.start')
    this.sandboxBtn.textContent = i18next.t('main_menu.sandbox')
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
}
