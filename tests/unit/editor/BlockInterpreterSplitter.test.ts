/**
 * Task C — BlockInterpreter splitter event-handler API.
 *
 * Pins the editor-side surface that pairs with
 * `tests/unit/game/SplitterEventHandler.test.ts`.
 *
 * After E4 cleanup:
 *   - `events.onItemArrives(machine, body)` registers a handler keyed
 *     by machine id (the `events.onItemArrivesAtSplitter` spelling and
 *     the `splitters` namespace are removed; per-item routing is gone).
 *   - `interpreter.triggerOnItemArrives(machineId, item)` runs the
 *     registered handler (if any) and returns the SimulationCommand[]
 *     it produced — or `[]` when no handler is registered.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import type { Item } from '../../../src/game/Item'
import type { SimulationCommand } from '../../../src/game/types'

function trigger(
  interpreter: BlockInterpreter,
  machineId: string,
  item: Item,
): SimulationCommand[] {
  return interpreter.triggerOnItemArrives(machineId, item)
}

describe('BlockInterpreter — splitter event-handler API', () => {
  let interpreter: BlockInterpreter

  beforeEach(() => {
    resetItemIdCounter()
    interpreter = new BlockInterpreter()
  })

  // -------------------------------------------------------------------
  // B2 — events.onItemArrives registers a handler that fires on trigger.
  // -------------------------------------------------------------------
  it('B2: events.onItemArrives(machine, body) registers a handler that fires on trigger', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, function () {
        machines.startMachine(Machine.B)
      })
    `)

    const item = createItem('wheel_small')
    expect(() => trigger(interpreter, 'machine_1', item)).not.toThrow()
    expect(() => trigger(interpreter, 'machine_1', item)).not.toThrow()
  })

  // -------------------------------------------------------------------
  // B4 — A handler that does no routing → trigger returns 'forward'.
  // -------------------------------------------------------------------
  it('B4: a handler with an empty body emits no commands', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, function () {
        // intentionally empty body
      })
    `)

    const commands = trigger(interpreter, 'machine_1', createItem('wheel_small'))
    expect(commands).toEqual([])
  })

  // -------------------------------------------------------------------
  // B5 — No handler registered → trigger returns [].
  // -------------------------------------------------------------------
  it('B5: triggerOnItemArrives returns [] when NO handler is registered', () => {
    const commands = trigger(interpreter, 'machine_1', createItem('wheel_small'))
    expect(commands).toEqual([])
  })

  // -------------------------------------------------------------------
  // B7 — logic.currentItemIsDefective reads the ambient context.
  // -------------------------------------------------------------------
  it('B7: logic.currentItemIsDefective() reads currentSplitterItem.isDefective during handler execution', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, function () {
        if (logic.currentItemIsDefective()) {
          machines.startMachine(Machine.B)
        } else {
          machines.startMachine(Machine.C)
        }
      })
    `)

    const defective = createItem('wheel_small', 30)
    defective.isDefective = true
    trigger(interpreter, 'machine_1', defective)

    const good = createItem('wheel_small', 90)
    expect(() => trigger(interpreter, 'machine_1', good)).not.toThrow()
  })

  // -------------------------------------------------------------------
  // B8 — logic.currentItemIs(partType) reads the ambient item type.
  // -------------------------------------------------------------------
  it('B8: logic.currentItemIs(partType) reads currentArrivingItem.type during handler execution', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, function () {
        if (logic.currentItemIs(PartType.WheelSmall)) {
          machines.startMachine(Machine.B)
        } else {
          machines.startMachine(Machine.C)
        }
      })
    `)

    expect(() => trigger(interpreter, 'machine_1', createItem('wheel_small'))).not.toThrow()
    expect(() => trigger(interpreter, 'machine_1', createItem('circuit_basic'))).not.toThrow()
  })

  // -------------------------------------------------------------------
  // B11 — Operation budget terminates an infinite-loop handler.
  // -------------------------------------------------------------------
  it('B11: a handler that infinite-loops is terminated by the 10000-op overflow guard', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, function () {
        loops.whileCondition(true, function () {
          machines.startMachine(Machine.A)
        })
      })
    `)

    const start = Date.now()
    trigger(interpreter, 'machine_1', createItem('wheel_small'))
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(2000)
    expect(interpreter.getOverflowOccurred()).toBe(true)
  })
})
