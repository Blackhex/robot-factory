/**
 * @vitest-environment jsdom
 *
 * RED-step pin for the missing `PxtEditor.triggerOnItemArrives`
 * delegation that breaks the production `on item arrives` →
 * `route items to` flow.
 *
 * Today (before fix):
 *   - `PxtEditor` exposes `triggerEvent(eventType)` but NOT
 *     `triggerOnItemArrives(machineId, item)`.
 *   - `wireSimulationEffects` checks `typeof
 *     editor.triggerOnItemArrives !== 'function'` and short-circuits
 *     to `[]`, so the bridge never fires and the splitter never
 *     receives `SET_OUTPUT_SIDES`.
 *
 * After fix (these tests turn green):
 *   - `PxtEditor.triggerOnItemArrives(machineId, item)` exists and
 *     delegates straight to `this.interpreter.triggerOnItemArrives`,
 *     forwarding the same arguments and returning the same value.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PxtEditor } from '../../../src/editor/PxtEditor'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import type { Item } from '../../../src/game/Item'
import type { SimulationCommand } from '../../../src/game/types'

/**
 * Narrow accessor for the not-yet-present public method. The cast is
 * scoped to a single helper so the test bodies stay readable; once
 * the GREEN step lands the method on PxtEditor, the helper becomes a
 * trivial passthrough.
 */
function callTriggerOnItemArrives(
  editor: PxtEditor,
  machineId: string,
  item: Item,
): SimulationCommand[] {
  const fn = (
    editor as unknown as {
      triggerOnItemArrives?: (machineId: string, item: Item) => SimulationCommand[]
    }
  ).triggerOnItemArrives
  if (typeof fn !== 'function') {
    throw new TypeError('PxtEditor.triggerOnItemArrives is not a function')
  }
  return fn.call(editor, machineId, item)
}

describe('PxtEditor — triggerOnItemArrives delegation', () => {
  let editor: PxtEditor

  beforeEach(() => {
    resetItemIdCounter()
    editor = new PxtEditor()
  })

  it('exposes triggerOnItemArrives as a public method', () => {
    const probe = (editor as unknown as { triggerOnItemArrives?: unknown })
      .triggerOnItemArrives
    expect(typeof probe).toBe('function')
  })

  it('forwards (machineId, item) to interpreter.triggerOnItemArrives unchanged', () => {
    const item = createItem('wheel_small')
    const expected: SimulationCommand[] = [
      { type: 'START_MACHINE', machineId: 'machine_X' } as SimulationCommand,
    ]
    const spy = vi
      .spyOn(editor.interpreter, 'triggerOnItemArrives')
      .mockReturnValue(expected)

    const result = callTriggerOnItemArrives(editor, 'machine_42', item)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('machine_42', item)
    // Return value must be the SAME reference produced by the interpreter,
    // not a defensive copy or a re-wrapped array.
    expect(result).toBe(expected)
  })

  it('returns the SimulationCommand[] from the underlying interpreter (real interpreter, registered handler)', () => {
    // Drive the real interpreter so we exercise the actual delegation
    // path end-to-end. With Machine.A → machine_1 in the default slot
    // mapping, an `events.onItemArrives(Machine.A, ...)` handler should
    // fire when triggered by id `machine_1`.
    editor.interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        machines.routeItemsTo(Machine.B, SplitterOutputs.Right)
      })
    `)

    const item = createItem('wheel_small')
    const commands = callTriggerOnItemArrives(editor, 'machine_1', item)

    expect(commands).toHaveLength(1)
    const cmd = commands[0] as { type: string; machineId: string; sidesBitmask: number }
    expect(cmd.type).toBe('SET_OUTPUT_SIDES')
    expect(cmd.machineId).toBe('machine_2')
    // SPLITTER_SIDE_BIT.right === 4 — pinned without re-importing the
    // constant so this test fails cleanly even if SPLITTER_SIDE_BIT is
    // refactored.
    expect(cmd.sidesBitmask).toBe(4)
  })

  it('returns [] when no handler is registered for the machine id', () => {
    const item = createItem('wheel_small')
    const commands = callTriggerOnItemArrives(editor, 'machine_99', item)
    expect(commands).toEqual([])
  })

  it('uses the same BlockInterpreter instance that owns registered handlers', () => {
    // Sanity check: the public surface must delegate to the *internal*
    // interpreter that processed `interpret(...)`. If a future refactor
    // accidentally creates a fresh interpreter inside the method, the
    // handler would not be found and this test would fail.
    expect(editor.interpreter).toBeInstanceOf(BlockInterpreter)

    editor.interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        machines.routeItemsTo(Machine.A, SplitterOutputs.Left)
      })
    `)

    const item = createItem('circuit_basic')
    const commands = callTriggerOnItemArrives(editor, 'machine_1', item)

    expect(commands).toHaveLength(1)
    expect((commands[0] as { type: string }).type).toBe('SET_OUTPUT_SIDES')
  })
})
