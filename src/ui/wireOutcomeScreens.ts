import { GameOverModal } from './GameOverModal'
import { ScoreScreen } from './ScoreScreen'

interface WireOutcomeScreensOptions {
  scoreScreen: ScoreScreen
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
  options.gameOverModal.onRetry = () => {
    options.gameOverModal.hide()
    options.onRestartSession()
  }
}