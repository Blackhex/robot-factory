import { i18next, switchLanguage } from '../i18n/i18n'

interface ButtonSpec {
  key: string
  className: string
  onClick: () => void
}

export class Toolbar {
  private container: HTMLDivElement
  private langButton: HTMLButtonElement
  private pauseBtn: HTMLButtonElement
  private buttons = new Map<string, HTMLButtonElement>()
  private handleLangChange = () => this.updateLabels()

  onToggleEditor: () => void = () => {}
  onStart: () => void = () => {}
  onPause: () => void = () => {}
  onResume: () => void = () => {}
  onRestart: () => void = () => {}
  onSave: () => void = () => {}
  onLoad: () => void = () => {}
  onExport: () => void = () => {}

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'ui-toolbar'

    this.makeButton(this.container, {
      key: 'actions.open_editor',
      className: 'ui-toolbar-btn--editor',
      onClick: () => this.onToggleEditor(),
    })

    const simGroup = document.createElement('div')
    simGroup.className = 'ui-toolbar-group ui-toolbar-sim-controls'

    this.makeButton(simGroup, {
      key: 'actions.start',
      className: 'ui-toolbar-btn--start',
      onClick: () => this.onStart(),
    })

    this.pauseBtn = this.makeButton(simGroup, {
      key: 'actions.pause',
      className: 'ui-toolbar-btn--pause',
      onClick: () => {
        if (this.pauseBtn.dataset.i18nKey === 'actions.resume') this.onResume()
        else this.onPause()
      },
    })

    this.makeButton(simGroup, {
      key: 'actions.restart',
      className: 'ui-toolbar-btn--restart',
      onClick: () => this.onRestart(),
    })

    this.container.appendChild(simGroup)

    const fileGroup = document.createElement('div')
    fileGroup.className = 'ui-toolbar-group'

    this.makeButton(fileGroup, {
      key: 'toolbar.save',
      className: '',
      onClick: () => this.onSave(),
    })

    this.makeButton(fileGroup, {
      key: 'toolbar.load',
      className: '',
      onClick: () => this.onLoad(),
    })

    this.makeButton(fileGroup, {
      key: 'toolbar.export',
      className: '',
      onClick: () => this.onExport(),
    })

    this.container.appendChild(fileGroup)

    this.langButton = document.createElement('button')
    this.langButton.className = 'ui-toolbar-btn ui-lang-btn'
    this.langButton.textContent = i18next.language === 'en' ? 'CS' : 'EN'
    this.langButton.addEventListener('click', () => this.toggleLanguage())
    this.container.appendChild(this.langButton)

    parent.appendChild(this.container)

    i18next.on('languageChanged', this.handleLangChange)
  }

  private makeButton(parent: HTMLElement, spec: ButtonSpec): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = ('ui-toolbar-btn ' + spec.className).trim()
    btn.dataset.i18nKey = spec.key
    btn.textContent = i18next.t(spec.key)
    btn.addEventListener('click', spec.onClick)
    parent.appendChild(btn)
    this.buttons.set(spec.key, btn)
    return btn
  }

  private async toggleLanguage(): Promise<void> {
    const next = i18next.language === 'en' ? 'cs' : 'en'
    await switchLanguage(next)
  }

  private updateLabels(): void {
    this.langButton.textContent = i18next.language === 'en' ? 'CS' : 'EN'
    for (const btn of this.buttons.values()) {
      btn.textContent = i18next.t(btn.dataset.i18nKey!)
    }
  }

  setPaused(paused: boolean): void {
    const key = paused ? 'actions.resume' : 'actions.pause'
    this.pauseBtn.dataset.i18nKey = key
    this.pauseBtn.textContent = i18next.t(key)
    this.pauseBtn.classList.toggle('is-paused', paused)
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
