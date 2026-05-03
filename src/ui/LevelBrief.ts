import i18next from 'i18next'
import type { LevelDefinition, LevelGoal } from '../game/Level'

/**
 * Build-phase Level Brief panel.
 *
 * Displays the current level's name, description, and goals so the player
 * always knows what to build. Re-renders automatically on language change.
 */
export class LevelBrief {
  private container: HTMLDivElement
  private nameEl: HTMLDivElement
  private descriptionEl: HTMLDivElement
  private goalsEl: HTMLUListElement
  private currentLevel: LevelDefinition | null = null

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'ui-level-brief'

    this.nameEl = document.createElement('div')
    this.nameEl.className = 'ui-level-brief-name'
    this.container.appendChild(this.nameEl)

    this.descriptionEl = document.createElement('div')
    this.descriptionEl.className = 'ui-level-brief-description'
    this.container.appendChild(this.descriptionEl)

    this.goalsEl = document.createElement('ul')
    this.goalsEl.className = 'ui-level-brief-goals'
    this.container.appendChild(this.goalsEl)

    parent.appendChild(this.container)

    this.container.style.display = 'none'

    i18next.on('languageChanged', this.handleLanguageChange)
  }

  setLevel(level: LevelDefinition): void {
    this.currentLevel = level
    this.render()
  }

  show(): void {
    this.container.style.display = 'flex'
  }

  hide(): void {
    this.container.style.display = 'none'
  }

  dispose(): void {
    i18next.off('languageChanged', this.handleLanguageChange)
    this.container.remove()
  }

  private handleLanguageChange = (): void => {
    this.render()
  }

  private render(): void {
    const level = this.currentLevel
    if (!level) return

    this.nameEl.textContent = i18next.t(level.nameKey)
    this.descriptionEl.textContent = i18next.t(level.descriptionKey)

    // Reuse existing <li> elements where possible so external references
    // captured between renders (e.g. by tests or callers) still see the
    // updated text after a language change.
    const existing = this.goalsEl.children
    const goals = level.goals

    while (existing.length > goals.length) {
      this.goalsEl.removeChild(this.goalsEl.lastChild!)
    }
    while (existing.length < goals.length) {
      const li = document.createElement('li')
      li.className = 'ui-level-brief-goal'
      this.goalsEl.appendChild(li)
    }

    for (let i = 0; i < goals.length; i++) {
      ;(existing[i] as HTMLElement).textContent = this.formatGoal(goals[i])
    }
  }

  private formatGoal(goal: LevelGoal): string {
    switch (goal.type) {
      case 'produce_robots':
        return i18next.t('level_brief.goal.produce_robots', {
          count: goal.target,
          item: i18next.t('items.' + goal.itemType),
        })
      case 'produce_parts':
        return i18next.t('level_brief.goal.produce_parts', {
          count: goal.target,
          item: i18next.t('items.' + goal.itemType),
        })
      case 'quality_target':
        return i18next.t('level_brief.goal.quality_target', {
          percent: goal.target,
        })
      case 'time_limit':
        return i18next.t('level_brief.goal.time_limit', {
          seconds: goal.target,
        })
    }
  }
}
