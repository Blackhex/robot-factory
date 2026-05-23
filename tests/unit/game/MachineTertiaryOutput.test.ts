/**
 * Task B (RED): Splitter tertiary output slot — Machine API
 *
 * Pins the new `Machine.tertiaryOutputSlot` field, the
 * `Machine.takeTertiaryOutput()` helper, and the contract that
 * `clearRuntimeState()` clears the new slot alongside `outputSlot` and
 * `secondaryOutputSlot`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Machine } from '../../../src/game/Machine'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'

describe('Machine — tertiary output slot (Splitter 3-port)', () => {
  let splitter: Machine

  beforeEach(() => {
    resetItemIdCounter()
    splitter = new Machine('s1', 'splitter')
  })

  it('initializes tertiaryOutputSlot to null on a freshly constructed splitter', () => {
    expect(
      'tertiaryOutputSlot' in splitter,
      'Machine should declare a tertiaryOutputSlot field',
    ).toBe(true)
    expect(splitter.tertiaryOutputSlot).toBeNull()
  })

  it('takeTertiaryOutput() returns the parked item AND clears the slot to null', () => {
    const item = createItem('wheel_small')
    splitter.tertiaryOutputSlot = item

    expect(typeof splitter.takeTertiaryOutput).toBe('function')
    const taken = splitter.takeTertiaryOutput()
    expect(taken).toBe(item)
    expect(splitter.tertiaryOutputSlot).toBeNull()
  })

  it('takeTertiaryOutput() on an empty slot returns null and leaves slot null', () => {
    expect(splitter.tertiaryOutputSlot).toBeNull()

    expect(typeof splitter.takeTertiaryOutput).toBe('function')
    const taken = splitter.takeTertiaryOutput()
    expect(taken).toBeNull()
    expect(splitter.tertiaryOutputSlot).toBeNull()
  })

  it('takeTertiaryOutput() transitions state from blocked → idle (mirrors takeOutput / takeSecondaryOutput)', () => {
    splitter.tertiaryOutputSlot = createItem('wheel_small')
    splitter.state = 'blocked'

    expect(typeof splitter.takeTertiaryOutput).toBe('function')
    splitter.takeTertiaryOutput()
    expect(splitter.state).toBe('idle')
  })

  it('clearRuntimeState() clears tertiaryOutputSlot alongside outputSlot and secondaryOutputSlot', () => {
    splitter.outputSlot = createItem('wheel_small')
    splitter.secondaryOutputSlot = createItem('wheel_small')
    splitter.tertiaryOutputSlot = createItem('wheel_small')

    splitter.clearRuntimeState()

    expect(splitter.outputSlot).toBeNull()
    expect(splitter.secondaryOutputSlot).toBeNull()
    expect(splitter.tertiaryOutputSlot).toBeNull()
  })
})
