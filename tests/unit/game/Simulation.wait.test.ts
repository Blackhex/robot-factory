import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Machine } from '../../../src/game/Machine'
import { Simulation } from '../../../src/game/Simulation'
import { SimulationCommandDispatcher } from '../../../src/game/SimulationCommandDispatcher'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'
import type { SimulationCommand } from '../../../src/game/types'

/**
 * RED-step tests for the planned `WAIT` SimulationCommand.
 *
 * Behavioral contract under test (will be implemented in the upcoming
 * GREEN step):
 *
 *   - `Simulation.processCommands()` becomes wait-aware: when it dequeues
 *     a `WAIT` command with `ticks > 0`, it sets a private
 *     `pendingWaitTicks` counter and STOPS processing further commands
 *     this tick. Subsequent ticks decrement the counter; when the
 *     counter reaches zero, command processing resumes (on the same
 *     tick it reached zero) and any subsequent commands run.
 *
 *   - `WAIT` with `ticks <= 0` is a no-op (the queue continues to
 *     process the next command in the same tick).
 *
 *   - The wait gates only the COMMAND QUEUE. Per-tick simulation work
 *     (machines tick, belts advance, deliveries) continues unaffected.
 *
 *   - `clearInFlight()` resets `pendingWaitTicks` to 0.
 *
 *   - `WAIT` is consumed inside `Simulation.processCommands()` and is
 *     NEVER passed to `SimulationCommandDispatcher.execute()`.
 *
 * NOTE: `WAIT` is not currently a member of the `SimulationCommand`
 * union. The factory below casts to `SimulationCommand` so the tests
 * compile during RED. The GREEN step will widen the union and the
 * cast becomes redundant.
 */

const wait = (ticks: number): SimulationCommand =>
  ({ type: 'WAIT', ticks } as unknown as SimulationCommand)

function wheelPressRecipe(): Recipe {
  const r = getRecipeById('wheel_press_small')
  if (!r) throw new Error('wheel_press_small recipe not found')
  return r
}

describe('Simulation — WAIT command', () => {
  let sim: Simulation

  beforeEach(() => {
    sim = new Simulation()
  })

  it('pauses subsequent command execution for the requested tick count', () => {
    // GIVEN: a machine with a recipe ready to start/stop.
    const m = new Machine('m1', 'part_fabricator')
    m.setRecipe(wheelPressRecipe())
    sim.addMachine(m)

    // WHEN: enqueue [START, WAIT 5, STOP] and tick once.
    sim.enqueueCommands([
      { type: 'START_MACHINE', machineId: 'm1' },
      wait(5),
      { type: 'STOP_MACHINE', machineId: 'm1' },
    ])
    sim.tick() // tick 1

    // THEN: START fired this tick; STOP is held by the WAIT.
    expect(m.enabled).toBe(true)

    // AND: ticks 2..5 must not yet release the STOP.
    for (let t = 2; t <= 5; t++) {
      sim.tick()
      expect(m.enabled).toBe(
        true,
      ) // wait still pending — STOP must not have run yet
    }

    // AND: on tick 6 the wait expires and STOP is dispatched.
    sim.tick() // tick 6
    expect(m.enabled).toBe(false)
  })

  it('treats WAIT(0) as a no-op so START and STOP both execute in one tick', () => {
    // GIVEN
    const m = new Machine('m1', 'part_fabricator')
    m.setRecipe(wheelPressRecipe())
    sim.addMachine(m)

    // Spy: even WAIT(0) must be consumed inside processCommands() and
    // NEVER reach the dispatcher (architecture rule). Today (RED) the
    // dispatcher silently drops unknown command types so this guard is
    // what flips the test from coincidental green to actual red.
    const executeSpy = vi.spyOn(
      SimulationCommandDispatcher.prototype,
      'execute',
    )

    // WHEN
    sim.enqueueCommands([
      { type: 'START_MACHINE', machineId: 'm1' },
      wait(0),
      { type: 'STOP_MACHINE', machineId: 'm1' },
    ])
    sim.tick()

    // THEN: both side-effect commands ran in a single tick...
    expect(m.enabled).toBe(false)

    // ...AND the dispatcher never saw a WAIT command.
    const dispatchedTypes = executeSpy.mock.calls.map(
      (call) => (call[0] as SimulationCommand).type as string,
    )
    expect(dispatchedTypes).not.toContain('WAIT')

    executeSpy.mockRestore()
  })

  it('accumulates consecutive WAITs: [WAIT 3, WAIT 2, START] → START fires on tick 6', () => {
    // GIVEN
    const m = new Machine('m1', 'part_fabricator')
    m.setRecipe(wheelPressRecipe())
    sim.addMachine(m)

    sim.enqueueCommands([
      wait(3),
      wait(2),
      { type: 'START_MACHINE', machineId: 'm1' },
    ])

    // WHEN/THEN: must remain disabled across the 5 wait-blocked ticks.
    for (let t = 1; t <= 5; t++) {
      sim.tick()
      expect(m.enabled).toBe(false) // failing here means wait counter is too short
    }

    // AND: tick 6 dispatches the START.
    sim.tick() // tick 6
    expect(m.enabled).toBe(true)
  })

  it('does not freeze per-tick simulation work while a wait is pending', () => {
    // GIVEN: an already-running fabricator that will produce on its own.
    const m = new Machine('m1', 'part_fabricator')
    m.setRecipe(wheelPressRecipe()) // processingTicks = 5, no inputs
    m.start() // already enabled (avoid relying on START_MACHINE timing)
    sim.addMachine(m)

    // Sanity: capture how many ticks the fabricator needs WITHOUT any
    // wait pressure. We do this in a sibling sim instance so the
    // assertions below are anchored against real physics, not a magic
    // number.
    const baselineSim = new Simulation()
    const baselineMachine = new Machine('b1', 'part_fabricator')
    baselineMachine.setRecipe(wheelPressRecipe())
    baselineMachine.start()
    baselineSim.addMachine(baselineMachine)
    let baselineTicks = 0
    while (baselineMachine.outputSlot === null && baselineTicks < 50) {
      baselineSim.tick()
      baselineTicks++
    }
    expect(baselineMachine.outputSlot).not.toBeNull()

    // Spy on the dispatcher to also assert WAIT is consumed in
    // processCommands(), not dispatched. Today (RED) the dispatcher
    // silently swallows the unknown WAIT type so this guard flips the
    // test from coincidental green to actual red.
    const executeSpy = vi.spyOn(
      SimulationCommandDispatcher.prototype,
      'execute',
    )

    // WHEN: enqueue a long wait; tick the same number of times.
    sim.enqueueCommand(wait(50))
    for (let i = 0; i < baselineTicks; i++) {
      sim.tick()
    }

    // THEN: the fabricator finished its recipe at the normal cadence —
    // the WAIT only gated the command queue, not simulation work.
    expect(m.outputSlot).not.toBeNull()

    // AND: the dispatcher never saw the WAIT — it was consumed inside
    // processCommands().
    const dispatchedTypes = executeSpy.mock.calls.map(
      (call) => (call[0] as SimulationCommand).type as string,
    )
    expect(dispatchedTypes).not.toContain('WAIT')

    executeSpy.mockRestore()
  })

  it('clearInFlight() resets pending wait state', () => {
    // GIVEN: a wait gets parked in pending state.
    const m = new Machine('m1', 'part_fabricator')
    m.setRecipe(wheelPressRecipe())
    sim.addMachine(m)

    sim.enqueueCommands([wait(100), { type: 'START_MACHINE', machineId: 'm1' }])
    sim.tick() // consumes WAIT(100); now blocked for ~100 ticks

    // Sanity: STOP-equivalent — the START did NOT run yet.
    expect(m.enabled).toBe(false)

    // WHEN: a hard reset is performed.
    sim.clearInFlight()

    // AND: a fresh START is enqueued.
    sim.enqueueCommand({ type: 'START_MACHINE', machineId: 'm1' })
    sim.tick()

    // THEN: the prior wait counter must NOT have leaked across the reset.
    expect(m.enabled).toBe(true)
  })

  it('stop() + fresh start does not leak the previous wait counter', () => {
    // GIVEN
    const m = new Machine('m1', 'part_fabricator')
    m.setRecipe(wheelPressRecipe())
    sim.addMachine(m)

    // Spy: assert that WAIT(50) was consumed in processCommands() and
    // never reached the dispatcher. Today (RED) it is dispatched (and
    // silently dropped), which is what flips this test from coincidental
    // green to actual red.
    const executeSpy = vi.spyOn(
      SimulationCommandDispatcher.prototype,
      'execute',
    )

    sim.enqueueCommands([wait(50), { type: 'START_MACHINE', machineId: 'm1' }])
    sim.tick() // park a long wait — START must be held back

    // The first tick MUST have left the START in the queue (because the
    // wait should pause subsequent processing).
    expect(m.enabled).toBe(false)

    // WHEN
    sim.stop()
    sim.clearInFlight()

    sim.enqueueCommand({ type: 'START_MACHINE', machineId: 'm1' })
    sim.tick()

    // THEN
    expect(m.enabled).toBe(true)

    // AND: the WAIT(50) was consumed by processCommands(), not
    // dispatched.
    const dispatchedTypes = executeSpy.mock.calls.map(
      (call) => (call[0] as SimulationCommand).type as string,
    )
    expect(dispatchedTypes).not.toContain('WAIT')

    executeSpy.mockRestore()
  })

  it('never dispatches WAIT through SimulationCommandDispatcher.execute', () => {
    // GIVEN: a spy on the dispatcher so we can record every command it
    // is asked to execute. WAIT is consumed by Simulation itself and
    // must not reach the dispatcher.
    const executeSpy = vi.spyOn(
      SimulationCommandDispatcher.prototype,
      'execute',
    )

    const m = new Machine('m1', 'part_fabricator')
    m.setRecipe(wheelPressRecipe())
    sim.addMachine(m)

    // WHEN
    sim.enqueueCommands([
      { type: 'START_MACHINE', machineId: 'm1' },
      wait(2),
      { type: 'STOP_MACHINE', machineId: 'm1' },
    ])
    // Tick enough times to drain the queue past the wait.
    for (let i = 0; i < 5; i++) sim.tick()

    // THEN: the dispatcher saw START and STOP but never WAIT.
    const dispatchedTypes = executeSpy.mock.calls.map(
      (call) => (call[0] as SimulationCommand).type as string,
    )
    expect(dispatchedTypes).toContain('START_MACHINE')
    expect(dispatchedTypes).toContain('STOP_MACHINE')
    expect(dispatchedTypes).not.toContain('WAIT')

    executeSpy.mockRestore()
  })
})
