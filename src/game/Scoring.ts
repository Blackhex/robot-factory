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
  /** Campaign outcome: present on scores produced for a real level run. */
  readonly outcome?: 'success' | 'failed'
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
  // CONTRACT (B1): A run that produced nothing must NOT receive the legacy 1★
  // participation floor. Zero outputs → 0 stars per axis, totalStars 0. Cost
  // value is pinned to the finite sentinel `0` (never Infinity / NaN).
  if (simulation.robotsProduced === 0) {
    return {
      speed: { value: 0, stars: 0 },
      cost: { value: 0, stars: 0 },
      quality: { value: 0, stars: 0 },
      totalStars: 0,
    }
  }

  const elapsedTicks = simulation.currentTick
  const elapsedMinutes = elapsedTicks / (simulation.tickRate * 60)

  // Speed: robots produced per minute
  const speedValue = elapsedMinutes > 0
    ? simulation.robotsProduced / elapsedMinutes
    : 0
  const speedStars = elapsedMinutes > 0
    ? computeStars(speedValue, level.parScores.speed, false)
    : 1

  // Cost: raw materials used + idle time energy (idle ticks as proxy)
  const costValue = (simulation.itemsProduced + simulation.totalIdleTicks * 0.1) / simulation.robotsProduced
  const costStars = computeStars(costValue, level.parScores.cost, true)

  // Quality: % of items passing quality check (non-defective)
  const totalItems = simulation.robotsProduced + simulation.defects
  const qualityValue = (simulation.robotsProduced / totalItems) * 100
  const qualityStars = computeStars(qualityValue, level.parScores.quality, false)

  return {
    speed: { value: Math.round(speedValue * 100) / 100, stars: speedStars },
    cost: { value: Math.round(costValue * 100) / 100, stars: costStars },
    quality: { value: Math.round(qualityValue * 100) / 100, stars: qualityStars },
    totalStars: speedStars + costStars + qualityStars,
  }
}
