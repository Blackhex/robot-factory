import type { LevelDefinition } from './Level.ts'

/**
 * Sum the production targets across a level's `produce_robots` and
 * `produce_parts` goals to derive the minimum `outputsDelivered` required
 * for a successful campaign run. Levels with no production goals return 0.
 */
export function computeRequiredOutputs(level: LevelDefinition): number {
  let required = 0
  for (const goal of level.goals) {
    if (goal.type === 'produce_robots' || goal.type === 'produce_parts') {
      required += goal.target
    }
  }
  return required
}
