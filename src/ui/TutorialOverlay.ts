import i18next from 'i18next'

export interface TutorialStep {
  messageKey: string
  highlightSelector?: string
  position: 'top' | 'bottom' | 'left' | 'right'
}

export class TutorialOverlay {
  private container: HTMLDivElement
  private backdrop: HTMLDivElement
  private tooltip: HTMLDivElement
  private tooltipText: HTMLDivElement
  private tooltipArrow: HTMLDivElement
  private nextBtn: HTMLButtonElement
  private skipBtn: HTMLButtonElement
  private stepCounter: HTMLSpanElement
  private steps: TutorialStep[] = []
  private currentIndex = 0

  onComplete: () => void = () => {}

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'ui-tutorial'

    // Semi-transparent backdrop
    this.backdrop = document.createElement('div')
    this.backdrop.className = 'ui-tutorial-backdrop'
    this.container.appendChild(this.backdrop)

    // Tooltip
    this.tooltip = document.createElement('div')
    this.tooltip.className = 'ui-tutorial-tooltip'

    this.tooltipArrow = document.createElement('div')
    this.tooltipArrow.className = 'ui-tutorial-arrow'
    this.tooltip.appendChild(this.tooltipArrow)

    this.tooltipText = document.createElement('div')
    this.tooltipText.className = 'ui-tutorial-text'
    this.tooltip.appendChild(this.tooltipText)

    // Step counter
    this.stepCounter = document.createElement('span')
    this.stepCounter.className = 'ui-tutorial-counter'
    this.tooltip.appendChild(this.stepCounter)

    // Buttons row
    const buttons = document.createElement('div')
    buttons.className = 'ui-tutorial-buttons'

    this.skipBtn = document.createElement('button')
    this.skipBtn.className = 'ui-tutorial-btn ui-tutorial-btn--skip'
    this.skipBtn.textContent = i18next.t('tutorial.skip')
    this.skipBtn.addEventListener('click', () => this.skip())
    buttons.appendChild(this.skipBtn)

    this.nextBtn = document.createElement('button')
    this.nextBtn.className = 'ui-tutorial-btn ui-tutorial-btn--next'
    this.nextBtn.textContent = i18next.t('tutorial.next')
    this.nextBtn.addEventListener('click', () => this.nextStep())
    buttons.appendChild(this.nextBtn)

    this.tooltip.appendChild(buttons)
    this.container.appendChild(this.tooltip)
    parent.appendChild(this.container)

    this.container.style.display = 'none'

    i18next.on('languageChanged', this.updateLabels)
  }

  loadTutorial(steps: TutorialStep[]): void {
    this.steps = steps
    this.currentIndex = 0
  }

  start(): void {
    if (this.steps.length === 0) return
    this.currentIndex = 0
    this.container.style.display = 'block'
    this.showCurrentStep()
  }

  nextStep(): void {
    this.currentIndex++
    if (this.currentIndex >= this.steps.length) {
      this.complete()
      return
    }
    this.showCurrentStep()
  }

  skip(): void {
    this.hide()
    this.onComplete()
  }

  private complete(): void {
    this.hide()
    this.onComplete()
  }

  private showCurrentStep(): void {
    const step = this.steps[this.currentIndex]
    if (!step) return

    this.tooltipText.textContent = i18next.t(step.messageKey)
    this.stepCounter.textContent = `${this.currentIndex + 1} / ${this.steps.length}`

    // Update next button text for last step
    this.nextBtn.textContent = this.currentIndex === this.steps.length - 1
      ? i18next.t('tutorial.finish')
      : i18next.t('tutorial.next')

    // Position tooltip relative to highlighted element
    this.positionTooltip(step)
  }

  private positionTooltip(step: TutorialStep): void {
    // Reset classes
    this.tooltip.classList.remove(
      'ui-tutorial-tooltip--top',
      'ui-tutorial-tooltip--bottom',
      'ui-tutorial-tooltip--left',
      'ui-tutorial-tooltip--right',
    )
    this.tooltip.classList.add(`ui-tutorial-tooltip--${step.position}`)

    if (step.highlightSelector) {
      const target = document.querySelector(step.highlightSelector)
      if (target) {
        const rect = target.getBoundingClientRect()

        // Position the spotlight cutout via CSS custom properties
        this.backdrop.style.setProperty('--spotlight-x', `${rect.left + rect.width / 2}px`)
        this.backdrop.style.setProperty('--spotlight-y', `${rect.top + rect.height / 2}px`)
        this.backdrop.style.setProperty('--spotlight-w', `${rect.width + 16}px`)
        this.backdrop.style.setProperty('--spotlight-h', `${rect.height + 16}px`)
        this.backdrop.classList.add('ui-tutorial-backdrop--spotlight')

        // Position tooltip
        switch (step.position) {
          case 'bottom':
            this.tooltip.style.top = `${rect.bottom + 16}px`
            this.tooltip.style.left = `${rect.left + rect.width / 2}px`
            this.tooltip.style.transform = 'translateX(-50%)'
            break
          case 'top':
            this.tooltip.style.top = `${rect.top - 16}px`
            this.tooltip.style.left = `${rect.left + rect.width / 2}px`
            this.tooltip.style.transform = 'translate(-50%, -100%)'
            break
          case 'right':
            this.tooltip.style.top = `${rect.top + rect.height / 2}px`
            this.tooltip.style.left = `${rect.right + 16}px`
            this.tooltip.style.transform = 'translateY(-50%)'
            break
          case 'left':
            this.tooltip.style.top = `${rect.top + rect.height / 2}px`
            this.tooltip.style.left = `${rect.left - 16}px`
            this.tooltip.style.transform = 'translate(-100%, -50%)'
            break
        }
      } else {
        this.centerTooltip()
      }
    } else {
      this.backdrop.classList.remove('ui-tutorial-backdrop--spotlight')
      this.centerTooltip()
    }
  }

  private centerTooltip(): void {
    this.tooltip.style.top = '50%'
    this.tooltip.style.left = '50%'
    this.tooltip.style.transform = 'translate(-50%, -50%)'
  }

  private updateLabels = (): void => {
    this.skipBtn.textContent = i18next.t('tutorial.skip')
    if (this.steps.length > 0 && this.currentIndex < this.steps.length) {
      this.showCurrentStep()
    }
  }

  show(): void {
    this.container.style.display = 'block'
  }

  hide(): void {
    this.container.style.display = 'none'
  }

  dispose(): void {
    i18next.off('languageChanged', this.updateLabels)
    this.container.remove()
  }
}
