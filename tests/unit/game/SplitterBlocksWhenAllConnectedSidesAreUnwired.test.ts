/**
 * RED — tighten the `tickSplitter` fallback (follow-up #1 to the
 * splitter wedge fix).
 *
 * Current `tickSplitter` (HEAD): when EVERY configured side has no
 * downstream belt (i.e. `connected` is empty), it falls back to the
 * full `configured` set and round-robins into orphan output slots.
 * That fallback was added so legacy isolated unit tests that don't
 * pass a real `MachineTickEnv` keep passing — but in production it
 * silently re-introduces the exact wedge the env was meant to fix:
 * items are parked into output slots no belt will ever drain, and
 * the round-robin counter advances as if those parks were healthy.
 *
 * Pinned contract (new): when ZERO configured sides are connected
 * the splitter MUST `state = 'blocked'`. It MUST NOT park the input
 * item into ANY output slot, and it MUST NOT advance
 * `routingCounter`. The very next tick that brings up a belt on one
 * of the configured sides will route the still-held input normally
 * starting from the unchanged counter position.
 *
 * The test passes a hand-rolled `MachineTickEnv` whose
 * `isOutputConnected(...)` returns `false` for every port — exactly
 * what `Simulation` does when none of the splitter's three sides
 * has had `setMachineOutputBelt` called for it.
 *
 * The second `it` is the positive control: an env that reports
 * connectivity on a single side must still route normally and
 * advance the counter, so the new fallback rule cannot regress into
 * "always block" over-blocking.
 *
 * Must FAIL against current main (no blocking, parks into orphan,
 * advances counter).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Machine } from '../../../src/game/Machine'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import type { MachineTickEnv } from '../../../src/game/MachineBehaviors'
import type { MachineOutputPort } from '../../../src/game/types'
import { SPLITTER_ALL_SIDES_BITS } from '../../../src/game/types'

function noOutputsConnectedEnv(): MachineTickEnv {
  return { isOutputConnected: () => false }
}

function onlyPortConnectedEnv(allowed: MachineOutputPort): MachineTickEnv {
  return { isOutputConnected: (_id, port) => port === allowed }
}

describe('Splitter — block when ZERO configured sides have a connected belt', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('default outputSidesConfig (all 3 sides) + env reporting no connections → blocked, no park, counter unchanged', () => {
    const m = new Machine('s1', 'splitter')
    m.start()
    expect(m.outputSidesConfig).toBe(SPLITTER_ALL_SIDES_BITS)
    expect(m.routingCounter).toBe(0)

    const item = createItem('wheel_small')
    m.addInput(item)
    expect(m.inputSlots).toHaveLength(1)

    m.tick(Math.random, noOutputsConnectedEnv())

    expect(m.state, 'splitter must block when no configured side is connected').toBe('blocked')

    expect(m.outputSlot, 'primary (forward) must NOT be parked into an unconnected side').toBeNull()
    expect(m.secondaryOutputSlot, 'secondary (right) must NOT be parked into an unconnected side').toBeNull()
    expect(m.tertiaryOutputSlot, 'tertiary (left) must NOT be parked into an unconnected side').toBeNull()

    expect(m.routingCounter, 'routingCounter must NOT advance on a fully-unwired tick').toBe(0)

    expect(m.inputSlots, 'input item must be held, not consumed into an orphan slot').toHaveLength(1)
    expect(m.inputSlots[0]).toBe(item)
  })

  it('positive control: same splitter with ONE connected side (primary) routes normally and advances the counter', () => {
    const m = new Machine('s2', 'splitter')
    m.start()
    expect(m.outputSidesConfig).toBe(SPLITTER_ALL_SIDES_BITS)

    const item = createItem('wheel_small')
    m.addInput(item)

    m.tick(Math.random, onlyPortConnectedEnv('primary'))

    expect(m.outputSlot, 'item must route to the only connected side (primary / forward)').toBe(item)
    expect(m.secondaryOutputSlot).toBeNull()
    expect(m.tertiaryOutputSlot).toBeNull()
    expect(m.state).toBe('idle')
    expect(m.routingCounter, 'counter advances by 1 on a successful park').toBe(1)
    expect(m.inputSlots).toHaveLength(0)
  })
})
