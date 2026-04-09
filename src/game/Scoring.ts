import type { Simulation } from './Simulation.ts'
import type { LevelDefinition } from './Level.ts'

export interface MetricScore {
  readonly value: number
  readonly stars: number
}

export interface ScoreResult {
  readonly speed: MetricScore
  readonly cost: MetricScore
  readonly quality: MetricScore
  readonly totalStars: number
}

function computeStars(value: number, par: number, lowerIsBetter: boolean): number {
  if (lowerIsBetter) {
    // For cost: at or below par → 3★, up to 1.5× par → 2★, else 1★
    if (value <= par) return 3
    if (value <= par * 1.5) return 2
    return 1
  }
  // For speed/quality: at or above par → 3★, at least par/1.5 → 2★, else 1★
  if (value >= par) return 3
  if (value >= par / 1.5) return 2
  return 1
}

export function calculateScore(simulation: Simulation, level: LevelDefinition): ScoreResult {
  const elapsedTicks = simulation.currentTick
  const elapsedMinutes = elapsedTicks / (simulation.tickRate * 60)

  // Speed: robots produced per minute
  const speedValue = elapsedMinutes > 0
    ? simulation.robotsProduced / elapsedMinutes
    : 0
  const speedStars = simulation.robotsProduced > 0
    ? computeStars(speedValue, level.parScores.speed, false)
    : 1

  // Cost: raw materials used + idle time energy (idle ticks as proxy)
  const costValue = simulation.robotsProduced > 0
    ? (simulation.itemsProduced + simulation.totalIdleTicks * 0.1) / simulation.robotsProduced
    : Infinity
  const costStars = simulation.robotsProduced > 0
    ? computeStars(costValue, level.parScores.cost, true)
    : 1

  // Quality: % of items passing quality check (non-defective)
  const totalItems = simulation.robotsProduced + simulation.defects
  const qualityValue = totalItems > 0
    ? (simulation.robotsProduced / totalItems) * 100
    : 0
  const qualityStars = totalItems > 0
    ? computeStars(qualityValue, level.parScores.quality, false)
    : 1

  return {
    speed: { value: Math.round(speedValue * 100) / 100, stars: speedStars },
    cost: { value: Math.round(costValue * 100) / 100, stars: costStars },
    quality: { value: Math.round(qualityValue * 100) / 100, stars: qualityStars },
    totalStars: speedStars + costStars + qualityStars,
  }
}
