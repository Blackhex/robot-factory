import { i18next, switchLanguage } from '../i18n/i18n'

export class Toolbar {
  private container: HTMLDivElement
  private langButton: HTMLButtonElement
  private editorBtn: HTMLButtonElement
  private startBtn: HTMLButtonElement
  private pauseBtn: HTMLButtonElement
  private restartBtn: HTMLButtonElement
  private saveBtn: HTMLButtonElement
  private loadBtn: HTMLButtonElement
  private exportBtn: HTMLButtonElement
  private handleLangChange = () => this.updateLabels()

  onToggleEditor: () => void = () => {}
  onStart: () => void = () => {}
  onPause: () => void = () => {}
  onRestart: () => void = () => {}
  onSave: () => void = () => {}
  onLoad: () => void = () => {}
  onExport: () => void = () => {}

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'ui-toolbar'

    // Open Editor button — prominent accent color
    this.editorBtn = document.createElement('button')
    this.editorBtn.className = 'ui-toolbar-btn ui-toolbar-btn--editor'
    this.editorBtn.dataset.i18nKey = 'actions.open_editor'
    this.editorBtn.textContent = i18next.t('actions.open_editor')
    this.editorBtn.addEventListener('click', () => this.onToggleEditor())
    this.container.appendChild(this.editorBtn)

    // Simulation control buttons
    const simGroup = document.createElement('div')
    simGroup.className = 'ui-toolbar-group ui-toolbar-sim-controls'

    this.startBtn = document.createElement('button')
    this.startBtn.className = 'ui-toolbar-btn ui-toolbar-btn--start'
    this.startBtn.dataset.i18nKey = 'actions.start'
    this.startBtn.textContent = i18next.t('actions.start')
    this.startBtn.addEventListener('click', () => this.onStart())
    simGroup.appendChild(this.startBtn)

    this.pauseBtn = document.createElement('button')
    this.pauseBtn.className = 'ui-toolbar-btn ui-toolbar-btn--pause'
    this.pauseBtn.dataset.i18nKey = 'actions.pause'
    this.pauseBtn.textContent = i18next.t('actions.pause')
    this.pauseBtn.addEventListener('click', () => this.onPause())
    simGroup.appendChild(this.pauseBtn)

    this.restartBtn = document.createElement('button')
    this.restartBtn.className = 'ui-toolbar-btn ui-toolbar-btn--restart'
    this.restartBtn.dataset.i18nKey = 'actions.restart'
    this.restartBtn.textContent = i18next.t('actions.restart')
    this.restartBtn.addEventListener('click', () => this.onRestart())
    simGroup.appendChild(this.restartBtn)

    this.container.appendChild(simGroup)

    // Save/Load/Export buttons
    const fileGroup = document.createElement('div')
    fileGroup.className = 'ui-toolbar-group'

    this.saveBtn = document.createElement('button')
    this.saveBtn.className = 'ui-toolbar-btn'
    this.saveBtn.dataset.i18nKey = 'toolbar.save'
    this.saveBtn.textContent = i18next.t('toolbar.save')
    this.saveBtn.addEventListener('click', () => this.onSave())
    fileGroup.appendChild(this.saveBtn)

    this.loadBtn = document.createElement('button')
    this.loadBtn.className = 'ui-toolbar-btn'
    this.loadBtn.dataset.i18nKey = 'toolbar.load'
    this.loadBtn.textContent = i18next.t('toolbar.load')
    this.loadBtn.addEventListener('click', () => this.onLoad())
    fileGroup.appendChild(this.loadBtn)

    this.exportBtn = document.createElement('button')
    this.exportBtn.className = 'ui-toolbar-btn'
    this.exportBtn.dataset.i18nKey = 'toolbar.export'
    this.exportBtn.textContent = i18next.t('toolbar.export')
    this.exportBtn.addEventListener('click', () => this.onExport())
    fileGroup.appendChild(this.exportBtn)

    this.container.appendChild(fileGroup)

    // Language toggle
    this.langButton = document.createElement('button')
    this.langButton.className = 'ui-toolbar-btn ui-lang-btn'
    this.langButton.textContent = i18next.language === 'en' ? 'CS' : 'EN'
    this.langButton.addEventListener('click', () => this.toggleLanguage())
    this.container.appendChild(this.langButton)

    parent.appendChild(this.container)

    i18next.on('languageChanged', this.handleLangChange)
  }

  private async toggleLanguage(): Promise<void> {
    const next = i18next.language === 'en' ? 'cs' : 'en'
    await switchLanguage(next)
  }

  private updateLabels(): void {
    this.langButton.textContent = i18next.language === 'en' ? 'CS' : 'EN'
    this.saveBtn.textContent = i18next.t('toolbar.save')
    this.loadBtn.textContent = i18next.t('toolbar.load')
    this.exportBtn.textContent = i18next.t('toolbar.export')
    this.editorBtn.textContent = i18next.t('actions.open_editor')
    this.startBtn.textContent = i18next.t('actions.start')
    this.pauseBtn.textContent = i18next.t('actions.pause')
    this.restartBtn.textContent = i18next.t('actions.restart')
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
