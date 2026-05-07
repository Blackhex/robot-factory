import type { GameState } from '../game/GameManager'

interface ToolbarLike {
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onRestart: () => void
  onToggleEditor: () => void
  onBackToMenu: () => void
  onResetView: () => void
  onSave: () => void
  onLoad: () => void
  onExport: () => void
  setPaused(paused: boolean): void
  setSimulationState(state: 'idle' | 'running' | 'paused' | 'stopped'): void
}

interface OutcomeScreenLike {
  onRetry: () => void
}

interface ScoreScreenLike extends OutcomeScreenLike {
  onNextLevel: () => void
  onBackToMenu: () => void
}

interface LevelFailedScreenLike extends OutcomeScreenLike {
  onBackToLevelSelect: () => void
}

interface GameOverModalLike {
  onRetry: () => void
  hide(): void
}

interface AudioLike {
  playUIClick(): void
  playError(): void
}

interface SimulationLike {
  running: boolean
  paused: boolean
  start(): void
  pause(): void
  resume(): void
  clearInFlight(): void
  enqueueCommands(commands: unknown[]): void
}

interface GameManagerLike {
  simulation: SimulationLike | null
  getCurrentState(): GameState
  startSimulation(): void
  stopSimulation(): void
  retryCurrentLevel(): void
  enterLevelSelect(): void
  enterMainMenu(): void
  startLevel(levelId: string): void
}

interface PxtEditorLike {
  getProgram(): unknown[]
}

interface HUDLike {
  show(): void
  hide(): void
}

interface ItemRendererLike {
  clear(): void
}

interface WireToolbarAndOutcomeCallbacksOptions {
  toolbar: ToolbarLike
  scoreScreen: ScoreScreenLike
  levelFailedScreen: LevelFailedScreenLike
  gameOverModal: GameOverModalLike
  audio: AudioLike
  gameManager: GameManagerLike
  pxtEditor: PxtEditorLike
  populateSimulation: () => void
  wireSimulationEffects: () => void
  hud: HUDLike
  getItemRenderer: () => ItemRendererLike | null
  getNextLevelId: () => string | null
  toggleEditor: () => void
  resetView: () => void
  autoSaveFactory: () => Promise<void>
  importFactory: () => Promise<void>
  exportFactory: () => Promise<void>
}

export interface WiredToolbarAndOutcomeCallbacks {
  restartCurrentSession: () => void
}

export function wireToolbarAndOutcomeCallbacks(
  options: WireToolbarAndOutcomeCallbacksOptions,
): WiredToolbarAndOutcomeCallbacks {
  const click = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A): void => {
    options.audio.playUIClick()
    fn(...args)
  }

  const setRunning = (): void => {
    options.toolbar.setPaused(false)
    options.toolbar.setSimulationState('running')
  }

  const restartCurrentSession = (): void => {
    const state = options.gameManager.getCurrentState()
    if (state === 'play_phase') {
      options.gameManager.stopSimulation()
    } else if (state === 'sandbox') {
      options.gameManager.simulation?.clearInFlight()
      options.getItemRenderer()?.clear()
      options.hud.hide()
    }

    options.toolbar.setPaused(false)
    options.toolbar.setSimulationState('idle')
  }

  options.toolbar.onStart = () => {
    options.audio.playUIClick()
    const state = options.gameManager.getCurrentState()
    const sim = options.gameManager.simulation

    if (state === 'build_phase') {
      options.populateSimulation()
      const commands = options.pxtEditor.getProgram()
      if (commands.length > 0) sim?.enqueueCommands(commands)
      options.gameManager.startSimulation()
      setRunning()
    } else if (state === 'play_phase' && sim?.paused) {
      sim.resume()
      setRunning()
    } else if (state === 'sandbox' && sim) {
      if (sim.paused) {
        sim.resume()
        setRunning()
      } else if (!sim.running) {
        options.populateSimulation()
        const commands = options.pxtEditor.getProgram()
        if (commands.length > 0) sim.enqueueCommands(commands)
        options.wireSimulationEffects()
        sim.start()
        options.hud.show()
        setRunning()
      }
    }
  }

  options.toolbar.onPause = click(() => {
    const sim = options.gameManager.simulation
    if (sim?.running && !sim.paused) {
      sim.pause()
      options.toolbar.setPaused(true)
      options.toolbar.setSimulationState('paused')
    }
  })

  options.toolbar.onResume = click(() => {
    const sim = options.gameManager.simulation
    if (sim?.running && sim.paused) {
      sim.resume()
      setRunning()
    }
  })

  options.toolbar.onRestart = click(restartCurrentSession)

  options.scoreScreen.onNextLevel = click(() => {
    const nextId = options.getNextLevelId()
    if (nextId) options.gameManager.startLevel(nextId)
    else options.gameManager.enterLevelSelect()
  })
  options.scoreScreen.onRetry = click(() => options.gameManager.retryCurrentLevel())
  options.scoreScreen.onBackToMenu = click(() => options.gameManager.enterLevelSelect())
  options.levelFailedScreen.onRetry = click(() => options.gameManager.retryCurrentLevel())
  options.levelFailedScreen.onBackToLevelSelect = click(() => options.gameManager.enterLevelSelect())
  options.gameOverModal.onRetry = () => {
    options.gameOverModal.hide()
    click(restartCurrentSession)()
  }

  options.toolbar.onToggleEditor = click(options.toggleEditor)
  options.toolbar.onBackToMenu = click(() => options.gameManager.enterMainMenu())
  options.toolbar.onResetView = click(options.resetView)
  options.toolbar.onSave = click(() => { void options.autoSaveFactory() })
  options.toolbar.onLoad = click(() => {
    void options.importFactory().catch(() => options.audio.playError())
  })
  options.toolbar.onExport = () => {
    options.audio.playUIClick()
    void options.exportFactory()
  }

  return { restartCurrentSession }
}