/**
 * Tests for static segment-id helpers on `ConveyorBelt`.
 *
 * The `${logicalId}_seg${N}` convention for naming per-cell belt segments
 * is currently spread across `Simulation.ts` and `ItemRenderer.ts` as ad-hoc
 * regex / template literals. These tests pin the contract for two static
 * helpers that centralize that convention so callers stop reinventing it.
 *
 * These tests MUST fail today (helpers do not exist yet) and pass after
 * `ConveyorBelt.segmentIdFor` and `ConveyorBelt.parseSegmentId` are added.
 */
import { describe, it, expect } from 'vitest'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt.ts'

describe('ConveyorBelt.segmentIdFor', () => {
  it('builds the segment id correctly', () => {
    expect(ConveyorBelt.segmentIdFor('belt_a', 3)).toBe('belt_a_seg3')
  })

  it('handles logical ids that already contain underscores', () => {
    expect(
      ConveyorBelt.segmentIdFor('weird_id_with_underscores', 0),
    ).toBe('weird_id_with_underscores_seg0')
  })

  it('produces stable ids across a range of indices', () => {
    expect(ConveyorBelt.segmentIdFor('b', 0)).toBe('b_seg0')
    expect(ConveyorBelt.segmentIdFor('b', 12)).toBe('b_seg12')
    expect(ConveyorBelt.segmentIdFor('b', 99)).toBe('b_seg99')
  })
})

describe('ConveyorBelt.parseSegmentId', () => {
  it('parses a well-formed id', () => {
    expect(ConveyorBelt.parseSegmentId('belt_a_seg3')).toEqual({
      logicalId: 'belt_a',
      segmentIndex: 3,
    })
  })

  it('handles logical ids that themselves contain underscores (greedy match)', () => {
    expect(
      ConveyorBelt.parseSegmentId('weird_id_with_underscores_seg7'),
    ).toEqual({
      logicalId: 'weird_id_with_underscores',
      segmentIndex: 7,
    })
  })

  it('returns null for an id with no _seg suffix', () => {
    expect(ConveyorBelt.parseSegmentId('belt_a')).toBeNull()
  })

  it('returns null for an id with _seg but no number', () => {
    expect(ConveyorBelt.parseSegmentId('belt_a_seg')).toBeNull()
  })

  it('returns null for a negative segment index', () => {
    expect(ConveyorBelt.parseSegmentId('belt_a_seg-1')).toBeNull()
  })

  it('returns null for a decimal segment index', () => {
    expect(ConveyorBelt.parseSegmentId('belt_a_seg1.5')).toBeNull()
  })
})

describe('ConveyorBelt segment-id round-trip', () => {
  const cases: Array<{ id: string; n: number }> = [
    { id: 'belt_a', n: 0 },
    { id: 'belt_a', n: 1 },
    { id: 'belt_a', n: 42 },
    { id: 'b', n: 7 },
    { id: 'weird_id_with_underscores', n: 3 },
    { id: 'a_b_c_d_e', n: 100 },
  ]

  for (const { id, n } of cases) {
    it(`parseSegmentId(segmentIdFor(${JSON.stringify(id)}, ${n})) reconstitutes the inputs`, () => {
      const built = ConveyorBelt.segmentIdFor(id, n)
      expect(ConveyorBelt.parseSegmentId(built)).toEqual({
        logicalId: id,
        segmentIndex: n,
      })
    })
  }
})
