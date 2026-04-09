import i18next from 'i18next'
import { getAllLevels } from '../game/Level'

export class LevelSelect {
  private container: HTMLDivElement
  private grid: HTMLDivElement
  private progress: Map<string, number> = new Map()

  onLevelSelected: (levelId: string) => void = () => {}

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'ui-level-select'

    const card = document.createElement('div')
    card.className = 'ui-level-select-card'

    const title = document.createElement('h2')
    title.className = 'ui-level-select-title'
    title.textContent = i18next.t('level_select.title')
    title.dataset.i18nKey = 'level_select.title'
    card.appendChild(title)

    this.grid = document.createElement('div')
    this.grid.className = 'ui-level-select-grid'
    card.appendChild(this.grid)

    // Back button
    const backBtn = document.createElement('button')
    backBtn.className = 'ui-level-select-back'
    backBtn.textContent = i18next.t('level_select.back')
    backBtn.dataset.i18nKey = 'level_select.back'
    backBtn.addEventListener('click', () => this.onBack())
    card.appendChild(backBtn)

    this.container.appendChild(card)
    parent.appendChild(this.container)

    this.container.style.display = 'none'
    this.renderLevels()

    i18next.on('languageChanged', this.updateLabels)
  }

  onBack: () => void = () => {}

  updateProgress(progress: Map<string, number>): void {
    this.progress = new Map(progress)
    this.renderLevels()
  }

  private isLevelUnlocked(index: number): boolean {
    if (index === 0) return true
    const levels = getAllLevels()
    const prevLevel = levels[index - 1]
    const prevStars = this.progress.get(prevLevel.id) ?? 0
    return prevStars >= 1
  }

  private renderLevels(): void {
    this.grid.innerHTML = ''
    const levels = getAllLevels()

    for (let i = 0; i < levels.length; i++) {
      const level = levels[i]
      const unlocked = this.isLevelUnlocked(i)
      const stars = this.progress.get(level.id) ?? 0

      const card = document.createElement('button')
      card.className = 'ui-level-card'
      if (!unlocked) card.classList.add('ui-level-card--locked')
      card.disabled = !unlocked

      const number = document.createElement('div')
      number.className = 'ui-level-card-number'
      number.textContent = String(i + 1)
      card.appendChild(number)

      const name = document.createElement('div')
      name.className = 'ui-level-card-name'
      name.textContent = i18next.t(level.nameKey)
      card.appendChild(name)

      const desc = document.createElement('div')
      desc.className = 'ui-level-card-desc'
      desc.textContent = i18next.t(level.descriptionKey)
      card.appendChild(desc)

      const starsRow = document.createElement('div')
      starsRow.className = 'ui-level-card-stars'
      if (unlocked) {
        starsRow.innerHTML = this.renderStars(stars, 9)
      } else {
        const lockIcon = document.createElement('span')
        lockIcon.className = 'ui-level-card-lock'
        lockIcon.textContent = i18next.t('level_select.locked')
        starsRow.appendChild(lockIcon)
      }
      card.appendChild(starsRow)

      if (unlocked) {
        card.addEventListener('click', () => this.onLevelSelected(level.id))
      }

      this.grid.appendChild(card)
    }
  }

  private renderStars(earned: number, max: number): string {
    let html = ''
    for (let i = 0; i < max; i++) {
      html += i < earned
        ? '<span class="ui-star ui-star--filled">★</span>'
        : '<span class="ui-star ui-star--empty">☆</span>'
    }
    return html
  }

  private updateLabels = (): void => {
    const title = this.container.querySelector<HTMLElement>('[data-i18n-key="level_select.title"]')
    if (title) title.textContent = i18next.t('level_select.title')

    const back = this.container.querySelector<HTMLElement>('[data-i18n-key="level_select.back"]')
    if (back) back.textContent = i18next.t('level_select.back')

    this.renderLevels()
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
}
