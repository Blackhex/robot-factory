/**
 * Per-tier display scale for items rendered by `ItemRenderer`. Items
 * fall into three strictly-increasing visual size tiers based on
 * their `ItemType`:
 *   - small  : raw materials and basic parts
 *   - medium : sub-assemblies
 *   - large  : finished robots
 *
 * RED — these tests are intentionally failing until
 * `src/rendering/ItemScales.ts` exports `getItemScale(type) => number`
 * and `ItemRenderer` applies that scale per-instance.
 */
import { describe, it, expect } from 'vitest'
import { getItemScale } from '../../../src/rendering/ItemScales'
import type { ItemType } from '../../../src/game/types'

const SMALL_TYPES: readonly ItemType[] = [
  'wheel_small',
  'wheel_medium',
  'wheel_large',
  'battery_standard',
  'battery_high_capacity',
  'chassis_light',
  'chassis_heavy',
  'circuit_basic',
  'circuit_advanced',
]

const MEDIUM_TYPES: readonly ItemType[] = [
  'drivetrain_basic',
  'drivetrain_advanced',
  'power_unit_standard',
  'power_unit_high',
]

const LARGE_TYPES: readonly ItemType[] = [
  'robot_explorer',
  'robot_worker',
]

const ALL_TYPES: readonly ItemType[] = [
  ...SMALL_TYPES,
  ...MEDIUM_TYPES,
  ...LARGE_TYPES,
]

describe('getItemScale', () => {
  it('returns a strictly increasing scale across small < medium < large representatives', () => {
    const small = getItemScale('wheel_small')
    const medium = getItemScale('drivetrain_basic')
    const large = getItemScale('robot_explorer')
    expect(small).toBeLessThan(medium)
    expect(medium).toBeLessThan(large)
  })

  it('returns a positive finite number for every known ItemType (15 total)', () => {
    expect(ALL_TYPES.length).toBe(15)
    for (const type of ALL_TYPES) {
      const scale = getItemScale(type)
      expect(Number.isFinite(scale)).toBe(true)
      expect(scale).toBeGreaterThan(0)
    }
  })

  it('returns the same scale for every "small" (parts/raw) ItemType', () => {
    const expected = getItemScale(SMALL_TYPES[0])
    for (const type of SMALL_TYPES) {
      expect(getItemScale(type)).toBe(expected)
    }
  })

  it('returns the same scale for every "medium" (sub-assembly) ItemType', () => {
    const expected = getItemScale(MEDIUM_TYPES[0])
    for (const type of MEDIUM_TYPES) {
      expect(getItemScale(type)).toBe(expected)
    }
  })

  it('returns the same scale for every "large" (robot) ItemType', () => {
    const expected = getItemScale(LARGE_TYPES[0])
    for (const type of LARGE_TYPES) {
      expect(getItemScale(type)).toBe(expected)
    }
  })

  it('keeps tiers strictly ordered: every small < every medium < every large', () => {
    const small = getItemScale(SMALL_TYPES[0])
    const medium = getItemScale(MEDIUM_TYPES[0])
    const large = getItemScale(LARGE_TYPES[0])
    expect(small).toBeLessThan(medium)
    expect(medium).toBeLessThan(large)
  })
})
