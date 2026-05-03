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
  private sandboxBadge: HTMLSpanElement
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

    this.makeButton(this.container, {
      key: 'toolbar.reset_view',
      className: 'ui-toolbar-btn--reset-view',
      onClick: () => this.onResetView(),
    })

    this.sandboxBadge = document.createElement('span')
    this.sandboxBadge.className = 'ui-toolbar-sandbox-badge'
    this.sandboxBadge.dataset.i18nKey = 'toolbar.sandbox_badge'
    this.sandboxBadge.textContent = i18next.t('toolbar.sandbox_badge')
    this.sandboxBadge.style.display = 'none'
    this.container.appendChild(this.sandboxBadge)

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
    if (this.sandboxBadge.dataset.i18nKey) {
      this.sandboxBadge.textContent = i18next.t(this.sandboxBadge.dataset.i18nKey)
    }
  }

  setPaused(paused: boolean): void {
    const key = paused ? 'actions.resume' : 'actions.pause'
    this.pauseBtn.dataset.i18nKey = key
    this.pauseBtn.textContent = i18next.t(key)
    this.pauseBtn.classList.toggle('is-paused', paused)
  }

  setSandboxMode(enabled: boolean): void {
    if (enabled) {
      this.sandboxBadge.textContent = i18next.t('toolbar.sandbox_badge')
      this.sandboxBadge.style.display = 'inline-block'
    } else {
      this.sandboxBadge.style.display = 'none'
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
