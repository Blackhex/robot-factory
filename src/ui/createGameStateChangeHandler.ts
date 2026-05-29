import type { GameState } from '../game/GameManager'
import type { LevelDefinition } from '../game/Level'
import { i18next } from '../i18n/i18n'

interface Hideable {
  show(): void
  hide(): void
}

interface LevelSelectLike extends Hideable {
  updateProgress(progress: Map<string, number>): void
}

interface ToolbarLike extends Hideable {
  setSandboxMode(enabled: boolean): void
  setSimulationState(state: 'idle' | 'running' | 'paused' | 'stopped'): void
}

interface LevelBriefLike extends Hideable {
  setLevel(level: LevelDefinition): void
}

interface ScoreScreenLike extends Hideable {
  setScore(levelName: string, score: unknown): void
}

interface AudioLike {
  stopBeltRolling(): void
  playSuccess(): void
}

interface CameraControllerLike {
  resetView(): void
}

interface GridInteractionLike {
  disable(): void
}

interface GameManagerStateLike {
  currentLevel: LevelDefinition | null
  lastScore: unknown
  getProgress(): Map<string, number>
}

interface StateChangedEvent {
  data: Record<string, unknown>
}

interface CreateGameStateChangeHandlerOptions {
  gameManager: GameManagerStateLike
  hideAllUI: () => void
  cleanupLevelRendering: () => void
  closeEditor: () => void
  mainMenu: Hideable
  levelSelect: LevelSelectLike
  toolbar: ToolbarLike
  hud: Hideable
  levelBrief: LevelBriefLike
  scoreScreen: ScoreScreenLike
  cameraController: CameraControllerLike
  setupBuildPhase: (level: LevelDefinition) => void
  setupSandbox: () => void
  autoSaveFactory: () => Promise<void> | void
  getGridInteraction: () => GridInteractionLike | null
  wireSimulationEffects: () => void
  saveProgress: () => void
  audio: AudioLike
}

export function createGameStateChangeHandler(
  options: CreateGameStateChangeHandlerOptions,
): (event: StateChangedEvent) => void {
  return (event: StateChangedEvent): void => {
    const newState = event.data.to as GameState

    options.hideAllUI()

    switch (newState) {
      case 'main_menu':
        options.cleanupLevelRendering()
        options.closeEditor()
        options.mainMenu.show()
        options.cameraController.resetView()
        break

      case 'level_select':
        options.cleanupLevelRendering()
        options.closeEditor()
        options.levelSelect.updateProgress(options.gameManager.getProgress())
        options.levelSelect.show()
        break

      case 'build_phase': {
        const level = options.gameManager.currentLevel
        if (level) {
          options.toolbar.show()
          options.toolbar.setSandboxMode(false)
          options.toolbar.setSimulationState('idle')
          options.setupBuildPhase(level)
          options.levelBrief.setLevel(level)
          options.levelBrief.show()
        }
        break
      }

      case 'play_phase':
        void options.autoSaveFactory()
        options.toolbar.show()
        options.toolbar.setSandboxMode(false)
        options.toolbar.setSimulationState('running')
        options.hud.show()
        if (options.gameManager.currentLevel) options.levelBrief.show()
        options.getGridInteraction()?.disable()
        options.wireSimulationEffects()
        break

      case 'score_screen': {
        options.closeEditor()
        options.audio.stopBeltRolling()
        options.toolbar.setSimulationState('stopped')
        const score = options.gameManager.lastScore
        const level = options.gameManager.currentLevel
        if (score && level) {
          options.scoreScreen.setScore(i18next.t(level.nameKey), score)
          options.scoreScreen.show()
          options.saveProgress()
          options.audio.playSuccess()
        }
        break
      }

      case 'sandbox':
        options.toolbar.show()
        options.toolbar.setSandboxMode(true)
        options.toolbar.setSimulationState('idle')
        options.setupSandbox()
        break
    }
  }
}