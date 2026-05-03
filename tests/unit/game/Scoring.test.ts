import { describe, it, expect } from 'vitest'
import { calculateScore } from '../../../src/game/Scoring.ts'
import type { LevelDefinition } from '../../../src/game/Level.ts'
import type { Simulation } from '../../../src/game/Simulation.ts'

/** Create a minimal mock simulation with scoring accumulators. */
function mockSimulation(overrides: Partial<{
  currentTick: number
  tickRate: number
  robotsProduced: number
  itemsProduced: number
  defects: number
  totalIdleTicks: number
}>): Simulation {
  return {
    currentTick: 600,
    tickRate: 10,
    robotsProduced: 10,
    itemsProduced: 50,
    defects: 0,
    totalIdleTicks: 0,
    ...overrides,
  } as unknown as Simulation
}

const baseLevel: LevelDefinition = {
  id: 'test_level',
  nameKey: 'test.name',
  descriptionKey: 'test.desc',
  gridSize: { width: 10, height: 10 },
  availableMachines: ['part_fabricator', 'assembler'],
  unlockedBlocks: 1,
  goals: [{ type: 'produce_robots', target: 5, itemType: 'robot_explorer' }],
  parScores: { speed: 5, cost: 10, quality: 80 },
}

describe('Scoring', () => {
  describe('3 stars (at or better than par)', () => {
    it('should award 3 stars for speed when robots/min >= par', () => {
      // GIVEN — 600 ticks at 10 tps = 1 minute, 10 robots → 10 rpm, par = 5
      const sim = mockSimulation({ currentTick: 600, robotsProduced: 10 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.speed.stars).toBe(3)
    })

    it('should award 3 stars for cost when cost <= par', () => {
      // GIVEN — costValue = (50 + 0) / 10 = 5, par = 10
      const sim = mockSimulation({ itemsProduced: 50, totalIdleTicks: 0, robotsProduced: 10 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.cost.stars).toBe(3)
    })

    it('should award 3 stars for quality when quality >= par', () => {
      // GIVEN — quality = 10/10 * 100 = 100%, par = 80
      const sim = mockSimulation({ robotsProduced: 10, defects: 0 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.quality.stars).toBe(3)
    })

    it('should give totalStars = 9 when all metrics are perfect', () => {
      // GIVEN
      const sim = mockSimulation({ currentTick: 600, robotsProduced: 10, itemsProduced: 50, defects: 0, totalIdleTicks: 0 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.totalStars).toBe(9)
    })
  })

  describe('2 stars (within threshold)', () => {
    it('should award 2 stars for speed when rpm is between par/1.5 and par', () => {
      // GIVEN — par = 5, par/1.5 = 3.33. 600 ticks / 10 tps = 1 min, 4 robots → 4 rpm
      const sim = mockSimulation({ currentTick: 600, robotsProduced: 4 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.speed.stars).toBe(2)
    })

    it('should award 2 stars for cost when cost is between par and 1.5*par', () => {
      // GIVEN — par = 10, costValue = (120 + 0) / 10 = 12
      const sim = mockSimulation({ itemsProduced: 120, totalIdleTicks: 0, robotsProduced: 10 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.cost.stars).toBe(2)
    })

    it('should award 2 stars for quality when quality is between par/1.5 and par', () => {
      // GIVEN — par = 80, par/1.5 ≈ 53.3. quality = 7/(7+3) = 70%
      const sim = mockSimulation({ robotsProduced: 7, defects: 3 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.quality.stars).toBe(2)
    })
  })

  describe('1 star (below threshold)', () => {
    it('should award 1 star for speed when rpm < par/1.5', () => {
      // GIVEN — par = 5, par/1.5 ≈ 3.33. 6000 ticks / 10 tps = 10 min, 10 robots → 1 rpm
      const sim = mockSimulation({ currentTick: 6000, robotsProduced: 10 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.speed.stars).toBe(1)
    })

    it('should award 1 star for cost when cost > 1.5 * par', () => {
      // GIVEN — par = 10, 1.5*par = 15. costValue = (200 + 0) / 10 = 20
      const sim = mockSimulation({ itemsProduced: 200, totalIdleTicks: 0, robotsProduced: 10 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.cost.stars).toBe(1)
    })

    it('should award 1 star for quality when quality < par/1.5', () => {
      // GIVEN — par = 80, par/1.5 ≈ 53.3. quality = 5/(5+5)*100 = 50%
      const sim = mockSimulation({ robotsProduced: 5, defects: 5 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.quality.stars).toBe(1)
    })
  })

  describe('mixed scoring', () => {
    it('should compute different star counts per metric', () => {
      // GIVEN
      // speed: 5 robots / 1 min = 5 = par → 3★
      // cost: (75 + 0) / 5 = 15 = 1.5*par → 2★
      // quality: 5/(5+5)*100 = 50% < 53.3 → 1★
      const sim = mockSimulation({
        currentTick: 600,
        robotsProduced: 5,
        itemsProduced: 75,
        defects: 5,
        totalIdleTicks: 0,
      })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.speed.stars).toBe(3)
      expect(result.cost.stars).toBe(2)
      expect(result.quality.stars).toBe(1)
      expect(result.totalStars).toBe(6)
    })
  })

  describe('totalStars', () => {
    it('should be the sum of speed + cost + quality stars', () => {
      // GIVEN
      const sim = mockSimulation({ currentTick: 600, robotsProduced: 10, itemsProduced: 50, defects: 0, totalIdleTicks: 0 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.totalStars).toBe(
        result.speed.stars + result.cost.stars + result.quality.stars,
      )
    })

    it('minimum totalStars is 3 when at least one output was delivered', () => {
      // CONTRACT (B1): The 1★-per-axis floor only applies when the player
      // delivered at least one output. Sims with zero outputs are scored as 0★
      // (see the 'zero outputs delivered (no work done)' suite below).
      // GIVEN — robotsProduced: 1 satisfies the precondition
      const sim = mockSimulation({
        currentTick: 60000,
        robotsProduced: 1,
        itemsProduced: 500,
        defects: 10,
        totalIdleTicks: 10000,
      })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.totalStars).toBeGreaterThanOrEqual(3)
    })

    it('maximum totalStars is 9 (3+3+3)', () => {
      // GIVEN
      const sim = mockSimulation({ currentTick: 600, robotsProduced: 10, itemsProduced: 50, defects: 0, totalIdleTicks: 0 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.totalStars).toBeLessThanOrEqual(9)
    })
  })

  describe('edge cases', () => {
    it('should give 0 stars across the board when zero robots produced', () => {
      // CONTRACT (B1): A run that produced nothing must NOT receive the legacy
      // 1★ participation floor. 0 outputs → 0 stars per axis, totalStars === 0.
      // This is the gate that drives the Level-Failed screen for campaign runs.
      // GIVEN
      const sim = mockSimulation({ currentTick: 600, robotsProduced: 0, defects: 0 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.speed.stars).toBe(0)
      expect(result.cost.stars).toBe(0)
      expect(result.quality.stars).toBe(0)
      expect(result.totalStars).toBe(0)
    })

    it('should compute speed as 0 when zero ticks elapsed', () => {
      // GIVEN
      const sim = mockSimulation({ currentTick: 0, robotsProduced: 10 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.speed.value).toBe(0)
      expect(result.speed.stars).toBe(1)
    })

    it('should give quality 100% when no defects', () => {
      // GIVEN
      const sim = mockSimulation({ robotsProduced: 10, defects: 0 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.quality.value).toBe(100)
    })

    it('should give quality 0% when zero robots produced but no defects either', () => {
      // GIVEN
      const sim = mockSimulation({ robotsProduced: 0, defects: 0, currentTick: 100 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.quality.value).toBe(0)
    })

    it('should handle Infinity cost gracefully when zero robots produced', () => {
      // CONTRACT (B1): When zero outputs were delivered the cost ratio would
      // mathematically be Infinity. The score function must instead emit the
      // pinned sentinel value `0` (a finite number) and 0 cost stars — never
      // Infinity, never NaN, never the legacy 1★ floor.
      // GIVEN
      const sim = mockSimulation({ robotsProduced: 0, itemsProduced: 50, totalIdleTicks: 100, currentTick: 600 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.cost.stars).toBe(0)
      expect(result.cost.value).toBe(0)
      expect(Number.isFinite(result.cost.value)).toBe(true)
    })

    it('should include idle ticks in cost calculation', () => {
      // GIVEN — costValue = (50 + 1000*0.1) / 10 = 15 → 1.5*par → 2★
      const sim = mockSimulation({ itemsProduced: 50, totalIdleTicks: 1000, robotsProduced: 10 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.cost.value).toBe(15)
      expect(result.cost.stars).toBe(2)
    })
  })

  describe('zero outputs delivered (no work done)', () => {
    // CONTRACT: When the player produces nothing (no robots, no outputs delivered),
    // the score must reflect that no work was done — 0 stars per axis, totalStars 0,
    // and a finite cost (never Infinity / NaN). A "no work" run must NOT receive the
    // 1-star participation floor — that would let players unlock the next level by
    // simply pressing Start then Stop.

    it('returns 0 stars per axis when no outputs were delivered', () => {
      // GIVEN — sim ran but produced nothing
      const sim = mockSimulation({
        currentTick: 600,
        robotsProduced: 0,
        itemsProduced: 0,
        defects: 0,
        totalIdleTicks: 600,
      })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.speed.stars).toBe(0)
      expect(result.cost.stars).toBe(0)
      expect(result.quality.stars).toBe(0)
    })

    it('returns totalStars === 0 when no outputs were delivered', () => {
      // GIVEN
      const sim = mockSimulation({
        currentTick: 600,
        robotsProduced: 0,
        itemsProduced: 0,
        defects: 0,
        totalIdleTicks: 600,
      })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.totalStars).toBe(0)
    })

    it('cost is finite (not Infinity) when no outputs were delivered', () => {
      // GIVEN
      const sim = mockSimulation({
        currentTick: 600,
        robotsProduced: 0,
        itemsProduced: 0,
        totalIdleTicks: 600,
      })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(Number.isFinite(result.cost.value)).toBe(true)
    })

    it('cost is not NaN when no outputs were delivered', () => {
      // GIVEN
      const sim = mockSimulation({
        currentTick: 600,
        robotsProduced: 0,
        itemsProduced: 0,
        totalIdleTicks: 600,
      })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(Number.isNaN(result.cost.value)).toBe(false)
    })

    it('returns 0 stars when sim ran for many ticks but produced nothing (give-up path)', () => {
      // GIVEN — long idle run with materials consumed but no robot output
      const sim = mockSimulation({
        currentTick: 6000,
        robotsProduced: 0,
        itemsProduced: 25,
        defects: 0,
        totalIdleTicks: 5000,
      })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      expect(result.totalStars).toBe(0)
    })
  })

  describe('score values are rounded', () => {
    it('should round speed value to 2 decimal places', () => {
      // GIVEN — 1000 ticks / 10 tps = 100s = 1.667 min, 10 robots → 6.00 rpm
      const sim = mockSimulation({ currentTick: 1000, robotsProduced: 10 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      const decimalPlaces = (result.speed.value.toString().split('.')[1] || '').length
      expect(decimalPlaces).toBeLessThanOrEqual(2)
    })

    it('should round cost value to 2 decimal places', () => {
      // GIVEN
      const sim = mockSimulation({ itemsProduced: 33, robotsProduced: 7, totalIdleTicks: 13 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      const decimalPlaces = (result.cost.value.toString().split('.')[1] || '').length
      expect(decimalPlaces).toBeLessThanOrEqual(2)
    })

    it('should round quality value to 2 decimal places', () => {
      // GIVEN
      const sim = mockSimulation({ robotsProduced: 7, defects: 3 })

      // WHEN
      const result = calculateScore(sim, baseLevel)

      // THEN
      const decimalPlaces = (result.quality.value.toString().split('.')[1] || '').length
      expect(decimalPlaces).toBeLessThanOrEqual(2)
    })
  })
})
