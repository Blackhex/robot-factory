import { describe, it, expect } from 'vitest'
import {
  ALL_ITEM_TYPES,
  PART_ITEM_TYPES,
  ASSEMBLY_ITEM_TYPES,
  ROBOT_ITEM_TYPES,
  getItemCategory,
} from '../../../src/game/types'
import type { ItemType } from '../../../src/game/types'

/**
 * RED-state spec for the per-category breakdown of `ItemType`.
 *
 * The implementation must export:
 *   - `PART_ITEM_TYPES`     — readonly tuple of part-class ItemTypes
 *                             (wheels, batteries, chassis, circuits).
 *   - `ASSEMBLY_ITEM_TYPES` — readonly tuple of assembly-class ItemTypes
 *                             (drivetrains, power units).
 *   - `getItemCategory(t)`  — returns 'part' | 'assembly' | 'robot'.
 *
 * Each constant must have a compile-time exhaustiveness guard analogous
 * to the existing `_RobotItemTypeExhaustive` sentinel so that any new
 * `ItemType` either lands in exactly one of the three sets or breaks
 * `tsc --noEmit`.
 */

describe('ItemType categorisation', () => {
  describe('getItemCategory()', () => {
    const partExpectations: ItemType[] = [
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

    const assemblyExpectations: ItemType[] = [
      'drivetrain_basic',
      'drivetrain_advanced',
      'power_unit_standard',
      'power_unit_high',
    ]

    const robotExpectations: ItemType[] = [
      'robot_explorer',
      'robot_worker',
    ]

    for (const t of partExpectations) {
      it(`classifies ${t} as 'part'`, () => {
        expect(getItemCategory(t)).toBe('part')
      })
    }

    for (const t of assemblyExpectations) {
      it(`classifies ${t} as 'assembly'`, () => {
        expect(getItemCategory(t)).toBe('assembly')
      })
    }

    for (const t of robotExpectations) {
      it(`classifies ${t} as 'robot'`, () => {
        expect(getItemCategory(t)).toBe('robot')
      })
    }
  })

  describe('category set partitioning', () => {
    it('PART_ITEM_TYPES, ASSEMBLY_ITEM_TYPES, ROBOT_ITEM_TYPES are pairwise disjoint', () => {
      // GIVEN
      const parts = new Set<ItemType>(PART_ITEM_TYPES)
      const assemblies = new Set<ItemType>(ASSEMBLY_ITEM_TYPES)
      const robots = new Set<ItemType>(ROBOT_ITEM_TYPES)

      // THEN — no overlap between any pair
      for (const t of parts) {
        expect(assemblies.has(t)).toBe(false)
        expect(robots.has(t)).toBe(false)
      }
      for (const t of assemblies) {
        expect(parts.has(t)).toBe(false)
        expect(robots.has(t)).toBe(false)
      }
      for (const t of robots) {
        expect(parts.has(t)).toBe(false)
        expect(assemblies.has(t)).toBe(false)
      }
    })

    it('union of the three category sets covers every value in ALL_ITEM_TYPES', () => {
      // GIVEN
      const union = new Set<ItemType>([
        ...PART_ITEM_TYPES,
        ...ASSEMBLY_ITEM_TYPES,
        ...ROBOT_ITEM_TYPES,
      ])

      // THEN — every ItemType lands in exactly one category
      for (const t of ALL_ITEM_TYPES) {
        expect(union.has(t)).toBe(true)
      }
      // AND — the union has no extras beyond ALL_ITEM_TYPES
      expect(union.size).toBe(ALL_ITEM_TYPES.length)
    })
  })
})
