import { GameOverModal } from './GameOverModal'
import { LevelFailedScreen } from './LevelFailedScreen'
import { ScoreScreen } from './ScoreScreen'

interface WireOutcomeScreensOptions {
  scoreScreen: ScoreScreen
  levelFailedScreen: LevelFailedScreen
  gameOverModal: GameOverModal
  onNextLevel: () => void
  onRetryLevel: () => void
  onBackToLevelSelect: () => void
  onRestartSession: () => void
}

export function wireOutcomeScreens(options: WireOutcomeScreensOptions): void {
  options.scoreScreen.onNextLevel = options.onNextLevel
  options.scoreScreen.onRetry = options.onRetryLevel
  options.scoreScreen.onBackToMenu = options.onBackToLevelSelect
  options.levelFailedScreen.onRetry = options.onRetryLevel
  options.levelFailedScreen.onBackToLevelSelect = options.onBackToLevelSelect
  options.gameOverModal.onRetry = () => {
    options.gameOverModal.hide()
    options.onRestartSession()
  }
}