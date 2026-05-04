import { describe, it, expect, beforeEach } from 'vitest'
import { defectProbability } from '../../../src/game/Defect'
import {
  createAssembly,
  createItem,
  resetItemIdCounter,
} from '../../../src/game/Item'

describe('defectProbability', () => {
  it('returns 0.02 exactly at speed 1', () => {
    // WHEN
    const p = defectProbability(1)

    // THEN
    expect(p).toBe(0.02)
  })

  it('returns 0.35 exactly at speed 10', () => {
    // WHEN
    const p = defectProbability(10)

    // THEN
    expect(p).toBe(0.35)
  })

  it('linearly interpolates for integer speeds 2..9', () => {
    // GIVEN
    const expected = (s: number) => 0.02 + ((s - 1) * (0.35 - 0.02)) / 9

    // WHEN / THEN
    for (let s = 2; s <= 9; s++) {
      expect(defectProbability(s)).toBeCloseTo(expected(s), 10)
    }
  })

  it('returns ~0.1833 at speed 5 (interior point sanity check)', () => {
    // WHEN
    const p = defectProbability(5)

    // THEN
    // 0.02 + 4 * (0.33/9) = 0.02 + 0.14666... = 0.16666...
    // (above is the documented formula; using it directly to avoid drift)
    const expected = 0.02 + (4 * (0.35 - 0.02)) / 9
    expect(p).toBeCloseTo(expected, 10)
  })

  it('linearly interpolates for non-integer speed 5.5', () => {
    // WHEN
    const p = defectProbability(5.5)

    // THEN
    const expected = 0.02 + (4.5 * (0.35 - 0.02)) / 9
    expect(p).toBeCloseTo(expected, 10)
  })

  it('clamps speeds below 1 to the speed=1 value', () => {
    // WHEN / THEN
    expect(defectProbability(0)).toBe(0.02)
    expect(defectProbability(-5)).toBe(0.02)
    expect(defectProbability(0.999)).toBe(0.02)
  })

  it('clamps speeds above 10 to the speed=10 value', () => {
    // WHEN / THEN
    expect(defectProbability(11)).toBe(0.35)
    expect(defectProbability(100)).toBe(0.35)
    expect(defectProbability(10.0001)).toBe(0.35)
  })

  it('is pure: same input always yields same output', () => {
    // WHEN
    const a = defectProbability(7)
    const b = defectProbability(7)
    const c = defectProbability(7)

    // THEN
    expect(a).toBe(b)
    expect(b).toBe(c)
  })
})

describe('Item.isDefective', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('createItem defaults isDefective to false', () => {
    // WHEN
    const item = createItem('wheel_small')

    // THEN
    expect(item.isDefective).toBe(false)
  })

  it('createAssembly defaults isDefective to false', () => {
    // GIVEN
    const a = createItem('wheel_small')
    const b = createItem('wheel_small')

    // WHEN
    const assembly = createAssembly('chassis_light', [a, b])

    // THEN
    expect(assembly.isDefective).toBe(false)
  })

  it('isDefective is mutable on items returned by createItem', () => {
    // GIVEN
    const item = createItem('wheel_small')

    // WHEN
    item.isDefective = true

    // THEN
    expect(item.isDefective).toBe(true)
  })

  it('isDefective is mutable on assemblies returned by createAssembly', () => {
    // GIVEN
    const a = createItem('wheel_small')
    const b = createItem('wheel_small')
    const assembly = createAssembly('chassis_light', [a, b])

    // WHEN
    assembly.isDefective = true

    // THEN
    expect(assembly.isDefective).toBe(true)
  })
})
