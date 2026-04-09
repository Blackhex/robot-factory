import i18next from 'i18next'

export interface HUDStats {
  itemsProduced: number
  robotsCompleted: number
  timeElapsed: number
  qualityPercent: number
}

export class HUD {
  private container: HTMLDivElement
  private levelNameEl: HTMLDivElement
  private itemsEl: HTMLSpanElement
  private robotsEl: HTMLSpanElement
  private timeEl: HTMLSpanElement
  private qualityEl: HTMLSpanElement

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'ui-hud'

    // Level name
    this.levelNameEl = document.createElement('div')
    this.levelNameEl.className = 'ui-hud-level'
    this.container.appendChild(this.levelNameEl)

    // Metrics grid
    const metrics = document.createElement('div')
    metrics.className = 'ui-hud-metrics'

    this.itemsEl = this.createMetric(metrics, 'hud.items_produced')
    this.robotsEl = this.createMetric(metrics, 'hud.robots_completed')
    this.timeEl = this.createMetric(metrics, 'hud.time')
    this.qualityEl = this.createMetric(metrics, 'hud.quality')

    this.container.appendChild(metrics)

    parent.appendChild(this.container)

    this.container.style.display = 'none'

    i18next.on('languageChanged', this.updateLabels)
  }

  private createMetric(parent: HTMLElement, labelKey: string): HTMLSpanElement {
    const row = document.createElement('div')
    row.className = 'ui-hud-metric'

    const label = document.createElement('span')
    label.className = 'ui-hud-metric-label'
    label.textContent = i18next.t(labelKey)
    label.dataset.i18nKey = labelKey
    row.appendChild(label)

    const value = document.createElement('span')
    value.className = 'ui-hud-metric-value'
    value.textContent = '0'
    row.appendChild(value)

    parent.appendChild(row)
    return value
  }

  setLevelName(name: string): void {
    this.levelNameEl.textContent = name
  }

  update(stats: HUDStats): void {
    this.itemsEl.textContent = String(stats.itemsProduced)
    this.robotsEl.textContent = String(stats.robotsCompleted)
    const minutes = Math.floor(stats.timeElapsed / 60)
    const seconds = Math.floor(stats.timeElapsed % 60)
    this.timeEl.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`
    this.qualityEl.textContent = `${Math.round(stats.qualityPercent)}%`
  }

  private updateLabels = (): void => {
    const labels = this.container.querySelectorAll<HTMLElement>('.ui-hud-metric-label')
    for (const label of labels) {
      const key = label.dataset.i18nKey
      if (key) label.textContent = i18next.t(key)
    }
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
