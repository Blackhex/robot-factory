import { describe, it, expect } from 'vitest'
import {
  pickValidMachineEnumValue,
  pickValidBeltEnumValue,
} from '../../../src/editor/slotEnumAutoReset.ts'

const MACHINE_MEMBERS = ['A', 'B', 'C', 'D'] as const
const BELT_MEMBERS = ['A', 'B', 'C', 'D'] as const

describe('pickValidMachineEnumValue', () => {
  it('returns the current value unchanged when its slot still contains a machine', () => {
    const items = [
      { slotIndex: 0, id: 'fab' },
      { slotIndex: 1, id: 'asm' },
    ]
    expect(pickValidMachineEnumValue('Machine.B', items, MACHINE_MEMBERS)).toBe('Machine.B')
  })

  it('returns the lowest-slot present machine when the referenced slot is now empty', () => {
    // Slot 1 (B) was deleted; slot 0 (A) and slot 2 (C) remain.
    const items = [
      { slotIndex: 0, id: 'fab' },
      { slotIndex: 2, id: 'punch' },
    ]
    expect(pickValidMachineEnumValue('Machine.B', items, MACHINE_MEMBERS)).toBe('Machine.A')
  })

  it('picks the lowest present slot even when current value refers to slot 0 deleted', () => {
    // Slot 0 deleted; only slot 2 remains.
    const items = [{ slotIndex: 2, id: 'punch' }]
    expect(pickValidMachineEnumValue('Machine.A', items, MACHINE_MEMBERS)).toBe('Machine.C')
  })

  it('returns null when no machines remain (leave value alone, block shows empty label)', () => {
    expect(pickValidMachineEnumValue('Machine.B', [], MACHINE_MEMBERS)).toBeNull()
  })

  it('treats null current value as needing a replacement and picks first available', () => {
    const items = [{ slotIndex: 1, id: 'asm' }]
    expect(pickValidMachineEnumValue(null, items, MACHINE_MEMBERS)).toBe('Machine.B')
  })

  it('treats undefined current value as needing a replacement', () => {
    const items = [{ slotIndex: 0, id: 'fab' }]
    expect(pickValidMachineEnumValue(undefined, items, MACHINE_MEMBERS)).toBe('Machine.A')
  })

  it('treats a malformed current value (missing prefix) as needing replacement', () => {
    const items = [{ slotIndex: 0, id: 'fab' }]
    expect(pickValidMachineEnumValue('A', items, MACHINE_MEMBERS)).toBe('Machine.A')
  })

  it('treats a current value referring to an unknown enum member as needing replacement', () => {
    const items = [{ slotIndex: 0, id: 'fab' }]
    expect(pickValidMachineEnumValue('Machine.ZZZ', items, MACHINE_MEMBERS)).toBe('Machine.A')
  })

  it('returns null if current is malformed AND no machines remain', () => {
    expect(pickValidMachineEnumValue('garbage', [], MACHINE_MEMBERS)).toBeNull()
  })
})

describe('pickValidBeltEnumValue', () => {
  it('returns the current value unchanged when its slot still contains a belt', () => {
    const items = [
      { slotIndex: 0, id: 'belt-1' },
      { slotIndex: 2, id: 'belt-2' },
    ]
    expect(pickValidBeltEnumValue('Belt.C', items, BELT_MEMBERS)).toBe('Belt.C')
  })

  it('returns the lowest-slot present belt when the referenced slot is empty', () => {
    const items = [
      { slotIndex: 1, id: 'belt-1' },
      { slotIndex: 3, id: 'belt-2' },
    ]
    expect(pickValidBeltEnumValue('Belt.A', items, BELT_MEMBERS)).toBe('Belt.B')
  })

  it('returns null when no belts remain', () => {
    expect(pickValidBeltEnumValue('Belt.A', [], BELT_MEMBERS)).toBeNull()
  })

  it('treats malformed value with wrong prefix as needing replacement', () => {
    const items = [{ slotIndex: 0, id: 'belt-1' }]
    expect(pickValidBeltEnumValue('Machine.A', items, BELT_MEMBERS)).toBe('Belt.A')
  })

  it('treats null current value as needing replacement', () => {
    const items = [{ slotIndex: 2, id: 'belt-1' }]
    expect(pickValidBeltEnumValue(null, items, BELT_MEMBERS)).toBe('Belt.C')
  })
})
