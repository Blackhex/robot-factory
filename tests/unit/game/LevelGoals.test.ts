import { describe, it, expect } from 'vitest'
import { computeRequiredOutputs } from '../../../src/game/LevelGoals.ts'
import type { LevelDefinition } from '../../../src/game/Level.ts'

function makeLevel(goals: LevelDefinition['goals']): LevelDefinition {
  return {
    id: 'test',
    nameKey: 'test.name',
    descriptionKey: 'test.desc',
    gridSize: { width: 10, height: 10 },
    availableMachines: ['part_fabricator'],
    unlockedBlocks: 1,
    goals,
    parScores: { speed: 1, cost: 10, quality: 80 },
  }
}

describe('computeRequiredOutputs', () => {
  it('returns 0 for levels with no production goals', () => {
    expect(computeRequiredOutputs(makeLevel([]))).toBe(0)
  })

  it('sums produce_robots target', () => {
    const lvl = makeLevel([{ type: 'produce_robots', target: 5, itemType: 'robot_explorer' }])
    expect(computeRequiredOutputs(lvl)).toBe(5)
  })

  it('sums produce_parts target', () => {
    const lvl = makeLevel([{ type: 'produce_parts', target: 3, itemType: 'wheel_small' }])
    expect(computeRequiredOutputs(lvl)).toBe(3)
  })

  it('sums multiple production goals together', () => {
    const lvl = makeLevel([
      { type: 'produce_robots', target: 4, itemType: 'robot_explorer' },
      { type: 'produce_parts', target: 6, itemType: 'wheel_small' },
    ])
    expect(computeRequiredOutputs(lvl)).toBe(10)
  })
})
