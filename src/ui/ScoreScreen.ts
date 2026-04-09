import i18next from 'i18next'
import type { ScoreResult } from '../game/Scoring'

export class ScoreScreen {
  private container: HTMLDivElement
  private levelNameEl: HTMLHeadingElement
  private speedRow: HTMLDivElement
  private costRow: HTMLDivElement
  private qualityRow: HTMLDivElement
  private totalEl: HTMLDivElement
  private chartSvg: SVGSVGElement
  private nextBtn: HTMLButtonElement
  private retryBtn: HTMLButtonElement
  private backBtn: HTMLButtonElement

  onNextLevel: () => void = () => {}
  onRetry: () => void = () => {}
  onBackToMenu: () => void = () => {}

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'ui-score-screen'

    const card = document.createElement('div')
    card.className = 'ui-score-card'

    // Level name
    this.levelNameEl = document.createElement('h2')
    this.levelNameEl.className = 'ui-score-level-name'
    card.appendChild(this.levelNameEl)

    // Radar chart
    this.chartSvg = this.createRadarChart()
    card.appendChild(this.chartSvg)

    // Metric rows
    const metricsContainer = document.createElement('div')
    metricsContainer.className = 'ui-score-metrics'

    this.speedRow = this.createMetricRow(metricsContainer, 'scoring.speed')
    this.costRow = this.createMetricRow(metricsContainer, 'scoring.cost')
    this.qualityRow = this.createMetricRow(metricsContainer, 'scoring.quality')

    card.appendChild(metricsContainer)

    // Total stars
    this.totalEl = document.createElement('div')
    this.totalEl.className = 'ui-score-total'
    card.appendChild(this.totalEl)

    // Buttons
    const buttons = document.createElement('div')
    buttons.className = 'ui-score-buttons'

    this.retryBtn = document.createElement('button')
    this.retryBtn.className = 'ui-score-btn'
    this.retryBtn.textContent = i18next.t('score.retry')
    this.retryBtn.addEventListener('click', () => this.onRetry())
    buttons.appendChild(this.retryBtn)

    this.nextBtn = document.createElement('button')
    this.nextBtn.className = 'ui-score-btn ui-score-btn--primary'
    this.nextBtn.textContent = i18next.t('score.next_level')
    this.nextBtn.addEventListener('click', () => this.onNextLevel())
    buttons.appendChild(this.nextBtn)

    this.backBtn = document.createElement('button')
    this.backBtn.className = 'ui-score-btn'
    this.backBtn.textContent = i18next.t('score.back_to_menu')
    this.backBtn.addEventListener('click', () => this.onBackToMenu())
    buttons.appendChild(this.backBtn)

    card.appendChild(buttons)
    this.container.appendChild(card)
    parent.appendChild(this.container)

    this.container.style.display = 'none'

    i18next.on('languageChanged', this.updateLabels)
  }

  setScore(levelName: string, score: ScoreResult): void {
    this.levelNameEl.textContent = levelName

    this.setMetricStars(this.speedRow, score.speed.stars, score.speed.value)
    this.setMetricStars(this.costRow, score.cost.stars, score.cost.value)
    this.setMetricStars(this.qualityRow, score.quality.stars, score.quality.value)

    this.totalEl.innerHTML = `
      <span class="ui-score-total-label">${i18next.t('scoring.total_stars')}</span>
      <span class="ui-score-total-value">${this.renderStars(score.totalStars, 9)}</span>
      <span class="ui-score-total-count">${score.totalStars} / 9</span>
    `

    this.updateRadarChart(score)
  }

  private createMetricRow(parent: HTMLElement, labelKey: string): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'ui-score-metric'

    const label = document.createElement('span')
    label.className = 'ui-score-metric-label'
    label.textContent = i18next.t(labelKey)
    label.dataset.i18nKey = labelKey
    row.appendChild(label)

    const starsSpan = document.createElement('span')
    starsSpan.className = 'ui-score-metric-stars'
    row.appendChild(starsSpan)

    const valueSpan = document.createElement('span')
    valueSpan.className = 'ui-score-metric-value'
    row.appendChild(valueSpan)

    parent.appendChild(row)
    return row
  }

  private setMetricStars(row: HTMLDivElement, stars: number, value: number): void {
    const starsEl = row.querySelector('.ui-score-metric-stars')!
    starsEl.innerHTML = this.renderStars(stars, 3)
    const valueEl = row.querySelector('.ui-score-metric-value')!
    valueEl.textContent = String(value)
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

  private createRadarChart(): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('class', 'ui-score-chart')
    svg.setAttribute('viewBox', '0 0 200 200')
    svg.setAttribute('width', '200')
    svg.setAttribute('height', '200')

    // Background rings (3 levels)
    for (let i = 1; i <= 3; i++) {
      const radius = (i / 3) * 70
      const ring = this.createHexagonPath(100, 100, radius, ns)
      ring.setAttribute('class', 'ui-score-chart-ring')
      svg.appendChild(ring)
    }

    // Axis lines
    for (let a = 0; a < 3; a++) {
      const angle = (a * 2 * Math.PI) / 3 - Math.PI / 2
      const line = document.createElementNS(ns, 'line')
      line.setAttribute('x1', '100')
      line.setAttribute('y1', '100')
      line.setAttribute('x2', String(100 + Math.cos(angle) * 70))
      line.setAttribute('y2', String(100 + Math.sin(angle) * 70))
      line.setAttribute('class', 'ui-score-chart-axis')
      svg.appendChild(line)
    }

    // Axis labels
    const labels = ['scoring.speed', 'scoring.cost', 'scoring.quality']
    for (let a = 0; a < 3; a++) {
      const angle = (a * 2 * Math.PI) / 3 - Math.PI / 2
      const text = document.createElementNS(ns, 'text')
      text.setAttribute('x', String(100 + Math.cos(angle) * 88))
      text.setAttribute('y', String(100 + Math.sin(angle) * 88))
      text.setAttribute('class', 'ui-score-chart-label')
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('dominant-baseline', 'middle')
      text.dataset.i18nKey = labels[a]
      text.textContent = i18next.t(labels[a])
      svg.appendChild(text)
    }

    // Data polygon (initially empty)
    const poly = document.createElementNS(ns, 'polygon')
    poly.setAttribute('class', 'ui-score-chart-data')
    poly.setAttribute('points', '100,100 100,100 100,100')
    svg.appendChild(poly)

    return svg
  }

  private createHexagonPath(cx: number, cy: number, r: number, ns: string): SVGPolygonElement {
    const poly = document.createElementNS(ns, 'polygon') as SVGPolygonElement
    const points: string[] = []
    for (let i = 0; i < 3; i++) {
      const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2
      points.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`)
    }
    poly.setAttribute('points', points.join(' '))
    return poly
  }

  private updateRadarChart(score: ScoreResult): void {
    const poly = this.chartSvg.querySelector('.ui-score-chart-data')
    if (!poly) return

    const values = [score.speed.stars, score.cost.stars, score.quality.stars]
    const points: string[] = []
    for (let i = 0; i < 3; i++) {
      const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2
      const r = (values[i] / 3) * 70
      points.push(`${100 + Math.cos(angle) * r},${100 + Math.sin(angle) * r}`)
    }
    poly.setAttribute('points', points.join(' '))
  }

  private updateLabels = (): void => {
    this.nextBtn.textContent = i18next.t('score.next_level')
    this.retryBtn.textContent = i18next.t('score.retry')
    this.backBtn.textContent = i18next.t('score.back_to_menu')

    const labels = this.container.querySelectorAll<HTMLElement>('[data-i18n-key]')
    for (const el of labels) {
      const key = el.dataset.i18nKey
      if (key) el.textContent = i18next.t(key)
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
