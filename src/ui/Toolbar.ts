import { i18next } from '../i18n/i18n'

interface ButtonSpec {
  key: string
  className: string
  onClick: () => void
}

export type ToolbarSimulationState = 'idle' | 'running' | 'paused' | 'stopped'

export class Toolbar {
  private container: HTMLDivElement
  private pauseBtn: HTMLButtonElement
  private editorBtn!: HTMLButtonElement
  private projectsBtn: HTMLButtonElement
  private buttons = new Map<string, HTMLButtonElement>()
  private handleLangChange = () => this.updateLabels()

  onToggleEditor: () => void = () => {}
  onStart: () => void = () => {}
  onPause: () => void = () => {}
  onResume: () => void = () => {}
  onRestart: () => void = () => {}
  onOpenProjects: () => void = () => {}
  onBackToMenu: () => void = () => {}
  onResetView: () => void = () => {}

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'ui-toolbar'

    this.makeButton(this.container, {
      key: 'toolbar.back_to_menu',
      className: 'ui-toolbar-btn--back-to-menu',
      onClick: () => this.onBackToMenu(),
    })

    // Projects button: visible only in Sandbox mode. The button always
    // exists in the DOM (so unit tests can grab a stable reference) and
    // is hidden via display:none by default. setSandboxMode(true/false)
    // controls visibility AND DOM attachment — campaign mode fully detaches
    // it so e2e `expectProjectsButtonHidden` (toHaveCount(0)) passes.
    this.projectsBtn = this.makeButton(this.container, {
      key: 'actions.open_projects',
      className: 'ui-toolbar-btn--projects',
      onClick: () => this.onOpenProjects(),
    })
    this.projectsBtn.style.display = 'none'

    this.editorBtn = this.makeButton(this.container, {
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

    this.makeButton(this.container, {
      key: 'toolbar.reset_view',
      className: 'ui-toolbar-btn--reset-view',
      onClick: () => this.onResetView(),
    })

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

  private updateLabels(): void {
    for (const btn of this.buttons.values()) {
      btn.textContent = i18next.t(btn.dataset.i18nKey!)
    }
  }

  setEditorPanelOpen(open: boolean): void {
    this.editorBtn.classList.toggle('is-panel-open', open)
  }

  setProjectsPanelOpen(open: boolean): void {
    this.projectsBtn.classList.toggle('is-panel-open', open)
  }

  setPaused(paused: boolean): void {
    const key = paused ? 'actions.resume' : 'actions.pause'
    this.pauseBtn.dataset.i18nKey = key
    this.pauseBtn.textContent = i18next.t(key)
    this.pauseBtn.classList.toggle('is-paused', paused)
  }

  setSandboxMode(enabled: boolean): void {
    if (enabled) {
      this.projectsBtn.style.display = ''
      if (!this.projectsBtn.isConnected) {
        // Re-attach in original position (immediately before the editor button).
        if (this.editorBtn.parentElement === this.container) {
          this.container.insertBefore(this.projectsBtn, this.editorBtn)
        } else {
          this.container.appendChild(this.projectsBtn)
        }
      }
    } else {
      this.projectsBtn.style.display = 'none'
      this.projectsBtn.remove()
    }
  }

  setSimulationState(state: ToolbarSimulationState): void {
    const start = this.buttons.get('actions.start')!
    const pause = this.pauseBtn
    const restart = this.buttons.get('actions.restart')!

    const apply = (btn: HTMLButtonElement, enabled: boolean) => {
      btn.disabled = !enabled
      btn.classList.toggle('is-disabled', !enabled)
    }

    switch (state) {
      case 'idle':
        apply(start, true)
        apply(pause, false)
        apply(restart, false)
        break
      case 'running':
        apply(start, false)
        apply(pause, true)
        apply(restart, true)
        break
      case 'paused':
        apply(start, false)
        apply(pause, true)
        apply(restart, true)
        break
      case 'stopped':
        apply(start, false)
        apply(pause, false)
        apply(restart, true)
        break
    }
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
