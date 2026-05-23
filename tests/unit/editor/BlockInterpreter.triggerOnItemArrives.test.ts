/**
 * Task E3 (RED) — `BlockInterpreter.triggerOnItemArrives` + generalized
 * `events.onItemArrives` event hat.
 *
 * Pins the new editor-side surface that pairs with
 * `tests/unit/game/Simulation.itemArrivalBridge.test.ts`:
 *
 *   - `triggerOnItemArrives(machineId, item): SimulationCommand[]` —
 *     new public method. Looks up the registered handler for the
 *     given machine id, runs it with `item` as ambient context, and
 *     returns the SimulationCommand[] emitted by the body.
 *   - Returns `[]` when no handler is registered for the machineId.
 *   - Handler can call `machines.routeItemsTo(target, sides)` inside
 *     the body — emits a `SET_OUTPUT_SIDES` command.
 *   - Predicates `currentItemIsDefective()` / `currentItemIs(partType)`
 *     evaluated inside the handler body see the arriving item.
 *   - Per-trigger ambient context: invoking trigger for item A then
 *     item B → predicates inside B's handler see B's properties (no
 *     leak from the previous trigger).
 *   - Handler registration accepts the spelling
 *     `events.onItemArrives(machine, body)` and registers the body
 *     keyed by the resolved machine id.
 *
 * These tests are written BEFORE the implementation lands and MUST
 * FAIL against the current codebase because:
 *   - `BlockInterpreter.triggerOnItemArrives` does not exist.
 *   - The interpreter does not register `events.onItemArrives` as a
 *     general per-machine handler keyed for use by
 *     `triggerOnItemArrives`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import {
  SPLITTER_SIDE_BIT,
  type SimulationCommand,
} from '../../../src/game/types'
import type { Item } from '../../../src/game/Item'

// --- Cast helpers --------------------------------------------------------

interface SetOutputSidesCommand {
  readonly type: 'SET_OUTPUT_SIDES'
  readonly machineId: string
  readonly sidesBitmask: number
}

function asSetOutputSides(command: SimulationCommand): SetOutputSidesCommand {
  return command as unknown as SetOutputSidesCommand
}

/**
 * Narrow accessor for the new public method. Until the GREEN step
 * adds it to the BlockInterpreter class, the cast lets the test body
 * read uniformly without polluting every call site with `as any`.
 */
function callTriggerOnItemArrives(
  interpreter: BlockInterpreter,
  machineId: string,
  item: Item,
): SimulationCommand[] {
  const fn = (
    interpreter as unknown as {
      triggerOnItemArrives?: (machineId: string, item: Item) => SimulationCommand[]
    }
  ).triggerOnItemArrives
  if (typeof fn !== 'function') {
    throw new TypeError('BlockInterpreter.triggerOnItemArrives is not a function')
  }
  return fn.call(interpreter, machineId, item)
}

describe('BlockInterpreter — triggerOnItemArrives + generalized event hat', () => {
  let interpreter: BlockInterpreter

  beforeEach(() => {
    resetItemIdCounter()
    interpreter = new BlockInterpreter()
  })

  // -------------------------------------------------------------------
  // Item 9 — `triggerOnItemArrives` is a public method.
  // -------------------------------------------------------------------
  it('exposes triggerOnItemArrives as a public method', () => {
    const probe = (
      interpreter as unknown as { triggerOnItemArrives?: unknown }
    ).triggerOnItemArrives
    expect(typeof probe).toBe('function')
  })

  // -------------------------------------------------------------------
  // Item 10a — returns `[]` when no handler is registered for the id.
  // -------------------------------------------------------------------
  it('returns an empty command list when no handler is registered for the machine id', () => {
    const item = createItem('wheel_small')
    const commands = callTriggerOnItemArrives(interpreter, 'machine_99', item)
    expect(commands).toEqual([])
  })

  // -------------------------------------------------------------------
  // Item 10b/11 — body that calls `machines.routeItemsTo` returns a
  // SET_OUTPUT_SIDES command in the trigger's command list.
  //
  // Also satisfies: "convert the E2 `it.todo` (`routeItemsTo works
  // inside an on-item-arrives handler context (covered in E3)`)".
  // The original `it.todo` line in
  // `tests/unit/editor/BlockInterpreter.routeItemsTo.test.ts` is
  // intentionally left in place — this test in the E3 file replaces it.
  // -------------------------------------------------------------------
  it('returns commands emitted by the handler body (routeItemsTo → SET_OUTPUT_SIDES)', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        machines.routeItemsTo(Machine.B, SplitterOutputs.Right)
      })
    `)
    const item = createItem('wheel_small')
    const commands = callTriggerOnItemArrives(interpreter, 'machine_1', item)

    expect(commands).toHaveLength(1)
    const cmd = asSetOutputSides(commands[0])
    expect(cmd.type).toBe('SET_OUTPUT_SIDES')
    expect(cmd.machineId).toBe('machine_2')
    expect(cmd.sidesBitmask).toBe(SPLITTER_SIDE_BIT.right)
  })

  // -------------------------------------------------------------------
  // Item 12a — `currentItemIsDefective()` predicate sees the arriving
  // item's `isDefective` flag (true case).
  // -------------------------------------------------------------------
  it('currentItemIsDefective predicate returns true for a defective arriving item', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        if (logic.currentItemIsDefective()) {
          machines.routeItemsTo(Machine.A, SplitterOutputs.Left)
        } else {
          machines.routeItemsTo(Machine.A, SplitterOutputs.Forward)
        }
      })
    `)
    const item = createItem('wheel_small')
    item.isDefective = true
    const commands = callTriggerOnItemArrives(interpreter, 'machine_1', item)

    expect(commands).toHaveLength(1)
    expect(asSetOutputSides(commands[0]).sidesBitmask).toBe(SPLITTER_SIDE_BIT.left)
  })

  // -------------------------------------------------------------------
  // Item 12b — `currentItemIsDefective()` returns false for a clean item.
  // -------------------------------------------------------------------
  it('currentItemIsDefective predicate returns false for a non-defective item', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        if (logic.currentItemIsDefective()) {
          machines.routeItemsTo(Machine.A, SplitterOutputs.Left)
        } else {
          machines.routeItemsTo(Machine.A, SplitterOutputs.Forward)
        }
      })
    `)
    const item = createItem('wheel_small') // isDefective defaults to false
    const commands = callTriggerOnItemArrives(interpreter, 'machine_1', item)

    expect(commands).toHaveLength(1)
    expect(asSetOutputSides(commands[0]).sidesBitmask).toBe(SPLITTER_SIDE_BIT.forward)
  })

  // -------------------------------------------------------------------
  // Item 12c — `currentItemIs(partType)` matches the arriving item's
  // type (true and false cases).
  // -------------------------------------------------------------------
  it('currentItemIs predicate matches the arriving item type', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        if (logic.currentItemIs(PartType.WheelSmall)) {
          machines.routeItemsTo(Machine.A, SplitterOutputs.Right)
        }
        if (logic.currentItemIs(PartType.CircuitBasic)) {
          machines.routeItemsTo(Machine.A, SplitterOutputs.Left)
        }
      })
    `)

    const wheel = createItem('wheel_small')
    const wheelCommands = callTriggerOnItemArrives(interpreter, 'machine_1', wheel)
    expect(wheelCommands).toHaveLength(1)
    expect(asSetOutputSides(wheelCommands[0]).sidesBitmask).toBe(SPLITTER_SIDE_BIT.right)

    const circuit = createItem('circuit_basic')
    const circuitCommands = callTriggerOnItemArrives(interpreter, 'machine_1', circuit)
    expect(circuitCommands).toHaveLength(1)
    expect(asSetOutputSides(circuitCommands[0]).sidesBitmask).toBe(SPLITTER_SIDE_BIT.left)
  })

  // -------------------------------------------------------------------
  // Item 13 — predicate ambient context is properly per-trigger:
  // calling trigger for item A then item B → predicates inside B's
  // invocation see B's properties (no leak from A's prior call).
  // -------------------------------------------------------------------
  it('per-trigger context is isolated: predicates see the current trigger\'s item, not the previous one', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        if (logic.currentItemIsDefective()) {
          machines.routeItemsTo(Machine.A, SplitterOutputs.Left)
        } else {
          machines.routeItemsTo(Machine.A, SplitterOutputs.Right)
        }
      })
    `)

    const defective = createItem('wheel_small')
    defective.isDefective = true
    const firstCommands = callTriggerOnItemArrives(interpreter, 'machine_1', defective)
    expect(firstCommands).toHaveLength(1)
    expect(asSetOutputSides(firstCommands[0]).sidesBitmask).toBe(SPLITTER_SIDE_BIT.left)

    const clean = createItem('wheel_small') // isDefective = false
    const secondCommands = callTriggerOnItemArrives(interpreter, 'machine_1', clean)
    expect(secondCommands).toHaveLength(1)
    // If the previous trigger's `currentItem` had leaked, the predicate
    // would still see `isDefective=true` and route Left. We require Right.
    expect(asSetOutputSides(secondCommands[0]).sidesBitmask).toBe(SPLITTER_SIDE_BIT.right)
  })

  // -------------------------------------------------------------------
  // Item 14 — `events.onItemArrives(Machine.A, body)` registers the
  // body keyed by the resolved machine id. A subsequent trigger for
  // `machine_1` (Machine.A → machine_1) runs that body.
  // -------------------------------------------------------------------
  it('registers handlers via the new events.onItemArrives spelling, keyed by machine id', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        machines.routeItemsTo(Machine.A, SplitterOutputs.Forward)
      })
    `)

    const item = createItem('wheel_small')

    // Trigger for the registered machine id → runs the body.
    const commandsForA = callTriggerOnItemArrives(interpreter, 'machine_1', item)
    expect(commandsForA).toHaveLength(1)
    expect(asSetOutputSides(commandsForA[0]).type).toBe('SET_OUTPUT_SIDES')

    // Trigger for a DIFFERENT machine id → no handler registered → empty.
    const commandsForB = callTriggerOnItemArrives(interpreter, 'machine_2', item)
    expect(commandsForB).toEqual([])
  })

  it('logs handler errors via console.error and returns commands collected before the throw', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        machines.routeItemsTo(Machine.A, SplitterOutputs.Forward)
        throw new Error('boom')
      })
    `)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const item = createItem('wheel_small')
      const commands = callTriggerOnItemArrives(interpreter, 'machine_1', item)
      expect(commands).toHaveLength(1)
      expect(asSetOutputSides(commands[0]).type).toBe('SET_OUTPUT_SIDES')
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy.mock.calls[0][0]).toBe('on item arrives handler threw:')
      expect((errorSpy.mock.calls[0][1] as Error).message).toBe('boom')
    } finally {
      errorSpy.mockRestore()
    }
  })
})
