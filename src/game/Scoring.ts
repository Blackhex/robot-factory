import type { Simulation } from './Simulation.ts'
import type { LevelDefinition } from './Level.ts'
import { computeRequiredOutputs } from './LevelGoals.ts'

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
  // CONTRACT (B1): A run that delivered nothing must NOT receive the legacy 1★
  // participation floor. The "no work" trigger is `successfulOutputs === 0`
  // when the level has a production goal — this covers both robot-output
  // levels (Level 5+) and parts-only levels (Level 1) where `robotsProduced`
  // is always 0 even on a successful run. Cost value is pinned to the finite
  // sentinel `0` (never Infinity / NaN). Levels with no production goals
  // (`requiredOutputs === 0`, sandbox-like) bypass the auto-fail and run the
  // normal formula.
  const successfulOutputs = simulation.outputsDelivered ?? simulation.robotsProduced
  const requiredOutputs = computeRequiredOutputs(level)
  if (requiredOutputs > 0 && successfulOutputs === 0) {
    return {
      speed: { value: 0, stars: 0 },
      cost: { value: 0, stars: 0 },
      quality: { value: 0, stars: 0 },
      totalStars: 0,
    }
  }

  const elapsedTicks = simulation.currentTick
  const elapsedMinutes = elapsedTicks / (simulation.tickRate * 60)

  // Speed: successful outputs per minute
  const speedValue = elapsedMinutes > 0
    ? successfulOutputs / elapsedMinutes
    : 0
  const speedStars = elapsedMinutes > 0
    ? computeStars(speedValue, level.parScores.speed, false)
    : 1

  // Cost: raw materials used + idle time energy (idle ticks as proxy)
  const costValue = (simulation.itemsProduced + simulation.totalIdleTicks * 0.1) / successfulOutputs
  const costStars = computeStars(costValue, level.parScores.cost, true)

  // Quality: % of items passing quality check (non-defective)
  const totalItems = successfulOutputs + simulation.defects
  const qualityValue = totalItems > 0 ? (successfulOutputs / totalItems) * 100 : 0
  const qualityStars = computeStars(qualityValue, level.parScores.quality, false)

  return {
    speed: { value: Math.round(speedValue * 100) / 100, stars: speedStars },
    cost: { value: Math.round(costValue * 100) / 100, stars: costStars },
    quality: { value: Math.round(qualityValue * 100) / 100, stars: qualityStars },
    totalStars: speedStars + costStars + qualityStars,
  }
}
