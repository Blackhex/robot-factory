/**
 * Task E2 — End-to-end coverage for `machines.routeItemsTo`.
 *
 * Replaces the C1 positive-routing case from the deleted
 * `SplitterHandlerBridge.test.ts`: the OLD contract drove routing
 * via a per-item event-handler bridge (now removed entirely in E4h);
 * the NEW contract drives routing via a persistent multiplex config
 * (`Machine.outputSidesConfig` bitfield + `SET_OUTPUT_SIDES`
 * simulation command + `machines.routeItemsTo` block).
 *
 * Companion unit-level coverage:
 *   - Interpreter command emission:
 *     `tests/unit/editor/BlockInterpreter.routeItemsTo.test.ts`
 *   - Dispatcher application of `SET_OUTPUT_SIDES`:
 *     `tests/unit/game/SimulationCommandDispatcher.SetOutputSides.test.ts`
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'
import { Simulation } from '../../../src/game/Simulation'
import { Machine } from '../../../src/game/Machine'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { SPLITTER_SIDE_BIT } from '../../../src/game/types'

describe('machines.routeItemsTo — end-to-end (interpreter → command → dispatcher → splitter)', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('routes the splitter input item to secondary (Right) after one tick', () => {
    // GIVEN — the player program targets Machine.A with SplitterOutputs.Right.
    // The interpreter resolves Machine.A to id `machine_1`, matching the
    // splitter we register in the simulation.
    const interpreter = new BlockInterpreter()
    const commands = interpreter.interpret(
      'machines.routeItemsTo(Machine.A, SplitterOutputs.Right)',
    )

    // Sanity-check the interpreter contract relied on below.
    expect(commands).toHaveLength(1)
    expect(commands[0].type).toBe('SET_OUTPUT_SIDES')

    const sim = new Simulation()
    const splitter = new Machine('machine_1', 'splitter')
    sim.addMachine(splitter)
    // Mark `secondary` as connected (registry write only — no real belt
    // is registered, so `transferMachineOutputs` won't drain the slot
    // before the assertion below reads `splitter.secondaryOutputSlot`).
    sim.setMachineOutputBelt('machine_1', 'machine_1_bs', 'secondary')
    splitter.start()
    splitter.addInput(createItem('wheel_small'))

    // WHEN — feed the player-program commands into the simulation queue
    // and advance one tick. `tick()` first dispatches enqueued commands
    // (applying `SET_OUTPUT_SIDES` to `outputSidesConfig`), then ticks
    // each machine — so the splitter sees the new config in the same tick.
    sim.enqueueCommands(commands)
    sim.tick()

    // THEN — the persistent config is now Right-only, and the input item
    // landed in the secondary output (Right → secondary).
    expect(splitter.outputSidesConfig).toBe(SPLITTER_SIDE_BIT.right)
    expect(splitter.secondaryOutputSlot).not.toBeNull()
    expect(splitter.secondaryOutputSlot!.type).toBe('wheel_small')
    expect(splitter.outputSlot).toBeNull()
    expect(splitter.tertiaryOutputSlot).toBeNull()
    expect(splitter.inputSlots).toHaveLength(0)
  })
})
