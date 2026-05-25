import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, createAssembly, resetItemIdCounter } from '../../../src/game/Item'

describe('Item', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('should create an item with unique ID', () => {
    // GIVEN
    const a = createItem('wheel_small')

    // WHEN
    const b = createItem('wheel_small')

    // THEN
    expect(a.id).not.toBe(b.id)
  })

  it('should create an item with the specified type', () => {
    // WHEN
    const item = createItem('wheel_small')

    // THEN
    expect(item.type).toBe('wheel_small')
  })

  it('should use default quality of 80', () => {
    // WHEN
    const item = createItem('wheel_small')

    // THEN
    expect(item.quality).toBe(80)
  })

  it('should accept custom quality', () => {
    // WHEN
    const item = createItem('wheel_small', 95)

    // THEN
    expect(item.quality).toBe(95)
  })

  it('should start with positionOnBelt = 0', () => {
    // WHEN
    const item = createItem('wheel_small')

    // THEN
    expect(item.positionOnBelt).toBe(0)
  })

  it('should create assembly with averaged quality', () => {
    // GIVEN
    const a = createItem('wheel_small', 90)
    const b = createItem('circuit_basic', 70)

    // WHEN
    const assembly = createAssembly('drivetrain_basic', [a, b])

    // THEN
    expect(assembly.quality).toBe(80) // (90 + 70) / 2 = 80
    expect(assembly.components).toHaveLength(2)
  })

  it('should create assembly with explicit quality override', () => {
    // GIVEN
    const a = createItem('wheel_small', 90)

    // WHEN
    const assembly = createAssembly('drivetrain_basic', [a], 100)

    // THEN
    expect(assembly.quality).toBe(100)
  })

  it('should create sequential IDs after reset', () => {
    // WHEN
    const first = createItem('wheel_small')
    const second = createItem('wheel_small')

    // THEN
    expect(first.id).toBe('item_1')
    expect(second.id).toBe('item_2')
  })
})
