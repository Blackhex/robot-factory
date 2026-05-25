import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ALL_OUTPUTS_CONNECTED_ENV, MACHINE_BEHAVIORS } from '../../../src/game/MachineBehaviors'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'

// USER-REPORTED BUG (verbatim, this turn):
//   "This still do not work reliably. After a while the middle Fabricator
//    stopped accepting recycled parts. Also, it started stuttering the
//    pipeline."
//
// Root cause: the prefer-consume drain branch is gated on `state === 'idle'`.
// In steady state the Fabricator is almost always `processing` (a fresh
// production cycle is restarted on the same tick it produces output, since
// part_fabricator recipes have zero inputs). The drain never fires while
// processing, queued matching items accumulate to `maxInputSlots`, and the
// belt back-pressures permanently.
//
// Desired fix: the drain must preempt an in-progress production cycle.
// Whenever `outputSlot === null` and a matching item sits in `inputSlots`,
// move the queued item to `outputSlot`, reset `state` to 'idle', and reset
// `processingTimer` to 0 — regardless of the current state.

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

function makeFab(): Machine {
  const m = new Machine('pf', 'part_fabricator')
  m.setRecipe(recipe('wheel_press_small'))
  m.start()
  return m
}

const rng = Math.random

describe('part_fabricator: prefer-consume rule preempts an in-progress production cycle', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('preempts in-progress processing: queued matching item drains to output, state resets to idle, timer resets to 0', () => {
    const m = makeFab()
    // Force the fabricator mid-cycle.
    m.state = 'processing'
    m.processingTimer = 5
    m.outputSlot = null
    const queued = createItem('wheel_small')
    m.inputSlots.push(queued)

    MACHINE_BEHAVIORS.part_fabricator.tick(m, rng, ALL_OUTPUTS_CONNECTED_ENV)

    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.id).toBe(queued.id)
    expect(m.inputSlots).toHaveLength(0)
    expect(m.state).toBe('idle')
    expect(m.processingTimer).toBe(0)
  })

  it('preempts in-progress blocked: queued matching item still drains and state resets to idle', () => {
    const m = makeFab()
    // Defensive: blocked normally implies outputSlot occupied, but state
    // can be `blocked` transiently after a previous mutation; the new
    // rule should still drain.
    m.state = 'blocked'
    m.processingTimer = 3
    m.outputSlot = null
    const queued = createItem('wheel_small')
    m.inputSlots.push(queued)

    MACHINE_BEHAVIORS.part_fabricator.tick(m, rng, ALL_OUTPUTS_CONNECTED_ENV)

    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.id).toBe(queued.id)
    expect(m.inputSlots).toHaveLength(0)
    expect(m.state).toBe('idle')
    expect(m.processingTimer).toBe(0)
  })

  it('preserves item identity (id + isDefective) when preempting processing', () => {
    const m = makeFab()
    m.state = 'processing'
    m.processingTimer = 4
    m.outputSlot = null
    const queued = createItem('wheel_small')
    queued.isDefective = true
    m.inputSlots.push(queued)

    MACHINE_BEHAVIORS.part_fabricator.tick(m, rng, ALL_OUTPUTS_CONNECTED_ENV)

    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.id).toBe(queued.id)
    expect(m.outputSlot!.isDefective).toBe(true)
  })

  it('steady-state regression: 50 cycles of (addInput → tick → takeOutput) keep accepting and never let the input queue permanently saturate', () => {
    // Reproduces the user-reported bug. Each iteration delivers a matching
    // item, ticks the machine (which under the fix preempts any in-progress
    // fresh production and drains the queued item to outputSlot), then
    // observes that the queue is empty and the machine is accepting again.
    // Under the buggy implementation the drain never fires while
    // `state === 'processing'`, the queue saturates within `maxInputSlots`
    // iterations, and `canAcceptItemType` starts returning false.
    const m = makeFab()

    interface Snapshot {
      iter: number
      acceptedAdd: boolean
      inputLenAfterAdd: number
      stateAfterTick: string
      inputLenAfterTick: number
      canAcceptAfterTick: boolean
      tookId: string | null
      tookType: string | null
    }
    const snapshots: Snapshot[] = []

    for (let i = 0; i < 50; i++) {
      // Force the machine mid-cycle so each iteration exercises the preempt.
      m.state = 'processing'
      m.processingTimer = 3

      const delivered = createItem('wheel_small')
      const acceptedAdd = m.addInput(delivered)
      const inputLenAfterAdd = m.inputSlots.length

      // Tick: preempt must drain the queued item even though state was
      // 'processing'. Observe `canAcceptItemType` AFTER the tick — the
      // snapshot semantics of canAcceptItemType is "right now", with no
      // lookahead, so we only assert it once the preempt has freed a slot.
      m.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)
      const stateAfterTick = m.state
      const inputLenAfterTick = m.inputSlots.length
      const canAcceptAfterTick = m.canAcceptItemType('wheel_small')

      const took = m.takeOutput()

      snapshots.push({
        iter: i,
        acceptedAdd,
        inputLenAfterAdd,
        stateAfterTick,
        inputLenAfterTick,
        canAcceptAfterTick,
        tookId: took?.id ?? null,
        tookType: took?.type ?? null,
      })
    }

    const refusedAdd = snapshots.filter((s) => !s.acceptedAdd)
    const refusedAcceptAfterTick = snapshots.filter((s) => !s.canAcceptAfterTick)
    const queueOversize = snapshots.filter(
      (s) => s.inputLenAfterAdd > 1 || s.inputLenAfterTick > 0,
    )
    const wrongTypeTakes = snapshots.filter(
      (s) => s.tookType !== null && s.tookType !== 'wheel_small',
    )

    expect(
      refusedAdd,
      `addInput refused on iters ${refusedAdd.map((s) => s.iter).join(', ')}`,
    ).toEqual([])
    expect(
      refusedAcceptAfterTick,
      `canAcceptItemType returned false after preempt-tick on iters ${refusedAcceptAfterTick.map((s) => s.iter).join(', ')}`,
    ).toEqual([])
    expect(
      queueOversize,
      `inputSlots grew past expected size; offending iters: ${queueOversize.map((s) => `${s.iter}(add=${s.inputLenAfterAdd},afterTick=${s.inputLenAfterTick})`).join(', ')}`,
    ).toEqual([])
    expect(wrongTypeTakes).toEqual([])
  })

  it('capacity-saturation regression: pre-filled input queue fully drains in FIFO order; queue strictly shrinks each tick', () => {
    const m = makeFab()
    // Pre-fill input queue to capacity with matching items.
    const seeded: string[] = []
    for (let i = 0; i < m.maxInputSlots; i++) {
      const it = createItem('wheel_small')
      m.inputSlots.push(it)
      seeded.push(it.id)
    }
    m.state = 'processing'
    m.processingTimer = 3
    m.outputSlot = null

    const drained: string[] = []
    const queueShrinkObservations: boolean[] = []

    // Tick exactly maxInputSlots times: the preempt drains one matching
    // item per tick (output is emptied at the end of each iteration), so
    // the queue must strictly shrink each tick and be empty by the end.
    for (let t = 0; t < m.maxInputSlots; t++) {
      const lenBefore = m.inputSlots.length
      m.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)
      queueShrinkObservations.push(m.inputSlots.length < lenBefore)
      const took = m.takeOutput()
      if (took !== null) drained.push(took.id)
    }

    // All seeded items must have come out of the primary output (FIFO).
    expect(drained).toEqual(seeded)
    expect(m.inputSlots).toHaveLength(0)
    expect(
      queueShrinkObservations.every((v) => v === true),
      `queueShrinkObservations: ${queueShrinkObservations.join(', ')}`,
    ).toBe(true)
  })
})
