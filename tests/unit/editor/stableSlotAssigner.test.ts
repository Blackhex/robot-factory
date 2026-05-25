import { describe, it, expect } from 'vitest'
import { assignStableSlots } from '../../../src/editor/stableSlotAssigner.ts'

const MAX = 4

describe('assignStableSlots', () => {
  it('assigns slots positionally on the first call (no prior state)', () => {
    const out = assignStableSlots(null, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], MAX)
    expect(out).toEqual([
      { slotIndex: 0, id: 'a' },
      { slotIndex: 1, id: 'b' },
      { slotIndex: 2, id: 'c' },
    ])
  })

  it('assigns slots positionally when prev is an empty array', () => {
    const out = assignStableSlots([], [{ id: 'x' }, { id: 'y' }], MAX)
    expect(out.map((e) => e.slotIndex)).toEqual([0, 1])
    expect(out.map((e) => e.id)).toEqual(['x', 'y'])
  })

  it('keeps each surviving id at its previously-assigned slot', () => {
    const prev = assignStableSlots(null, [{ id: 'fab' }, { id: 'asm' }, { id: 'punch' }], MAX)
    // Delete middle entry "asm"
    const next = assignStableSlots(prev, [{ id: 'fab' }, { id: 'punch' }], MAX)
    expect(next).toEqual([
      { slotIndex: 0, id: 'fab' },
      { slotIndex: 2, id: 'punch' },
    ])
  })

  it('does NOT shift other machines when one in the middle is deleted', () => {
    const prev = assignStableSlots(null, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], MAX)
    const next = assignStableSlots(prev, [{ id: 'a' }, { id: 'c' }], MAX)
    const byId = new Map(next.map((e) => [e.id, e.slotIndex]))
    expect(byId.get('a')).toBe(0)
    expect(byId.get('c')).toBe(2)
    expect(byId.has('b')).toBe(false)
  })

  it('fills the lowest freed slot when a new machine is added after a deletion', () => {
    const step1 = assignStableSlots(null, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], MAX)
    const step2 = assignStableSlots(step1, [{ id: 'a' }, { id: 'c' }], MAX) // frees slot 1
    const step3 = assignStableSlots(step2, [{ id: 'a' }, { id: 'c' }, { id: 'd' }], MAX)
    const byId = new Map(step3.map((e) => [e.id, e.slotIndex]))
    expect(byId.get('a')).toBe(0)
    expect(byId.get('c')).toBe(2)
    expect(byId.get('d')).toBe(1) // lowest free slot
  })

  it('places a brand-new machine in the next available slot when no slots are free in the middle', () => {
    const step1 = assignStableSlots(null, [{ id: 'a' }, { id: 'b' }], MAX)
    const step2 = assignStableSlots(step1, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], MAX)
    const byId = new Map(step2.map((e) => [e.id, e.slotIndex]))
    expect(byId.get('a')).toBe(0)
    expect(byId.get('b')).toBe(1)
    expect(byId.get('c')).toBe(2)
  })

  it('is a no-op when current matches prev (stable order, stable slots)', () => {
    const prev = assignStableSlots(null, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], MAX)
    const next = assignStableSlots(prev, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], MAX)
    expect(next).toEqual(prev)
  })

  it('drops items that do not fit in the remaining free slots', () => {
    const prev = assignStableSlots(null, [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], MAX)
    const next = assignStableSlots(prev, [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
      { id: 'e' }, // no room
    ], MAX)
    expect(next.find((e) => e.id === 'e')).toBeUndefined()
    expect(next).toHaveLength(MAX)
  })

  it('preserves item payload fields besides id', () => {
    const prev = assignStableSlots(null, [{ id: 'a', name: 'Alpha' }], MAX)
    expect(prev[0]).toMatchObject({ id: 'a', name: 'Alpha', slotIndex: 0 })
    const next = assignStableSlots(prev, [{ id: 'a', name: 'AlphaRenamed' }], MAX)
    expect(next[0]).toMatchObject({ id: 'a', name: 'AlphaRenamed', slotIndex: 0 })
  })

  it('keeps an id at its slot even when ordering of current changes', () => {
    const prev = assignStableSlots(null, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], MAX)
    const next = assignStableSlots(prev, [{ id: 'c' }, { id: 'a' }, { id: 'b' }], MAX)
    const byId = new Map(next.map((e) => [e.id, e.slotIndex]))
    expect(byId.get('a')).toBe(0)
    expect(byId.get('b')).toBe(1)
    expect(byId.get('c')).toBe(2)
  })

  it('handles full delete + repopulate (all new ids get fresh slots starting at 0)', () => {
    const prev = assignStableSlots(null, [{ id: 'a' }, { id: 'b' }], MAX)
    const empty = assignStableSlots(prev, [], MAX)
    expect(empty).toEqual([])
    const repop = assignStableSlots(empty, [{ id: 'x' }, { id: 'y' }], MAX)
    expect(repop.map((e) => e.slotIndex)).toEqual([0, 1])
  })
})
