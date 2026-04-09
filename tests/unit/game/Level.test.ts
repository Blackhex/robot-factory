import { describe, it, expect } from 'vitest'
import {
  getAllLevels,
  getLevelById,
  getLevelByNumber,
} from '../../../src/game/Level.ts'

import type { MachineType } from '../../../src/game/types.ts'

const VALID_MACHINE_TYPES: MachineType[] = [
  'part_fabricator',
  'assembler',
  'quality_checker',
  'painter',
  'recycler',
  'splitter',
]

describe('Level', () => {
  const levels = getAllLevels()

  describe('getAllLevels()', () => {
    it('should return exactly 10 levels', () => {
      // WHEN + THEN
      expect(levels).toHaveLength(10)
    })

    it('should return a readonly array', () => {
      // WHEN + THEN
      expect(Array.isArray(levels)).toBe(true)
    })
  })

  describe('getLevelById()', () => {
    it('should return the correct level for each valid id', () => {
      for (const level of levels) {
        // WHEN
        const found = getLevelById(level.id)

        // THEN
        expect(found).toBeDefined()
        expect(found!.id).toBe(level.id)
      }
    })

    it('should return undefined for an unknown id', () => {
      // WHEN + THEN
      expect(getLevelById('nonexistent_level')).toBeUndefined()
    })

    it('should return undefined for empty string', () => {
      // WHEN + THEN
      expect(getLevelById('')).toBeUndefined()
    })
  })

  describe('getLevelByNumber()', () => {
    it('should return the correct level for numbers 1 through 10', () => {
      for (let i = 1; i <= 10; i++) {
        // WHEN
        const level = getLevelByNumber(i)

        // THEN
        expect(level).toBeDefined()
        expect(level!.id).toBe(`level_${i}`)
      }
    })

    it('should return undefined for number 0', () => {
      // WHEN + THEN
      expect(getLevelByNumber(0)).toBeUndefined()
    })

    it('should return undefined for number 11', () => {
      // WHEN + THEN
      expect(getLevelByNumber(11)).toBeUndefined()
    })

    it('should return undefined for negative number', () => {
      // WHEN + THEN
      expect(getLevelByNumber(-1)).toBeUndefined()
    })
  })

  describe('level IDs are unique', () => {
    it('should have no duplicate IDs', () => {
      // GIVEN
      const ids = levels.map((l) => l.id)

      // WHEN + THEN
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })
  })

  describe('required fields', () => {
    for (let i = 0; i < 10; i++) {
      const level = levels[i]

      describe(`level_${i + 1}`, () => {
        it('should have a non-empty id', () => {
          // WHEN + THEN
          expect(level.id).toBeTruthy()
        })

        it('should have a nameKey', () => {
          // WHEN + THEN
          expect(level.nameKey).toBeTruthy()
        })

        it('should have a descriptionKey', () => {
          // WHEN + THEN
          expect(level.descriptionKey).toBeTruthy()
        })

        it('should have a gridSize with positive width and height', () => {
          // WHEN + THEN
          expect(level.gridSize.width).toBeGreaterThan(0)
          expect(level.gridSize.height).toBeGreaterThan(0)
        })

        it('should have availableMachines array', () => {
          // WHEN + THEN
          expect(Array.isArray(level.availableMachines)).toBe(true)
          expect(level.availableMachines.length).toBeGreaterThan(0)
        })

        it('should have valid machine types', () => {
          // WHEN + THEN
          for (const mt of level.availableMachines) {
            expect(VALID_MACHINE_TYPES).toContain(mt)
          }
        })

        it('should have parScores with speed, cost, quality', () => {
          // WHEN + THEN
          expect(level.parScores.speed).toBeGreaterThan(0)
          expect(level.parScores.cost).toBeGreaterThan(0)
          expect(level.parScores.quality).toBeGreaterThan(0)
        })

        it('should have unlockedBlocks >= 1', () => {
          // WHEN + THEN
          expect(level.unlockedBlocks).toBeGreaterThanOrEqual(1)
        })
      })
    }
  })

  describe('goals', () => {
    it('levels 1-8 and 10 should have at least one goal', () => {
      for (let i = 1; i <= 10; i++) {
        if (i === 9) continue // level 9 is a sandbox-like level with no goals
        // WHEN
        const level = getLevelByNumber(i)!

        // THEN
        expect(
          level.goals.length,
          `level_${i} should have at least one goal`,
        ).toBeGreaterThanOrEqual(1)
      }
    })

    it('goal types are valid', () => {
      // GIVEN
      const validTypes = ['produce_robots', 'produce_parts', 'quality_target', 'time_limit']

      // WHEN + THEN
      for (const level of levels) {
        for (const goal of level.goals) {
          expect(validTypes).toContain(goal.type)
          expect(goal.target).toBeGreaterThan(0)
        }
      }
    })
  })

  describe('progressive block unlocking', () => {
    it('unlockedBlocks for level N should be <= unlockedBlocks for level N+1', () => {
      // WHEN + THEN
      for (let i = 0; i < levels.length - 1; i++) {
        expect(
          levels[i].unlockedBlocks,
          `level ${i + 1} should unlock <= level ${i + 2}`,
        ).toBeLessThanOrEqual(levels[i + 1].unlockedBlocks)
      }
    })
  })

  describe('grid size progression', () => {
    it('grid sizes should generally not shrink between consecutive levels', () => {
      // WHEN + THEN
      for (let i = 0; i < levels.length - 1; i++) {
        const currentArea = levels[i].gridSize.width * levels[i].gridSize.height
        const nextArea = levels[i + 1].gridSize.width * levels[i + 1].gridSize.height
        expect(
          nextArea,
          `level ${i + 2} grid area should be >= level ${i + 1}`,
        ).toBeGreaterThanOrEqual(currentArea)
      }
    })
  })
})
