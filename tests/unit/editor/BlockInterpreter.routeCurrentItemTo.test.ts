/**
 * RED — `machines.routeCurrentItemTo` block + `ROUTE_CURRENT_ITEM_TO`
 * simulation command.
 *
 * Distinct from the existing `machines.routeItemsTo` (sticky multiplex
 * config): this block is a SYNCHRONOUS, per-item directive bound to
 * the item currently passing through an `on item arrives` handler.
 *
 * Contract pinned by this file:
 *   - Block id (PXT): `factory_route_current_item_to`.
 *   - TS API (interpreter namespace): `machines.routeCurrentItemTo(
 *       machine: Machine, side: SplitterOutputs)`. Argument order
 *     matches the existing `machines.routeItemsTo(machine, sides)`.
 *   - Emits a `ROUTE_CURRENT_ITEM_TO` command carrying the SPECIFIC
 *     `itemId` of the item that triggered the handler invocation —
 *     read from the interpreter's per-trigger ambient context
 *     (`currentArrivingItem`).
 *   - When called OUTSIDE an `on item arrives` handler (e.g. from a
 *     top-level / `pxt-on-start` body) the interpreter sees no
 *     ambient arriving item and DROPS the call (no command emitted).
 *     Silent no-op by design: the block's whole purpose is per-item
 *     routing, and there is no current item outside a handler.
 *   - Does NOT emit `SET_OUTPUT_SIDES`: the splitter's persistent
 *     `outputSidesConfig` must not be touched by this block (that is
 *     the whole point of the new contract — `routeItemsTo` is the
 *     sticky version, `routeCurrentItemTo` is the per-item version).
 *
 * Written BEFORE the implementation lands and MUST FAIL against the
 * current codebase because:
 *   - `machines.routeCurrentItemTo` is not exposed on the interpreter
 *     namespace.
 *   - The `ROUTE_CURRENT_ITEM_TO` command variant is not in the
 *     `SimulationCommand` union.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import {
  SPLITTER_SIDE_BIT,
  type SimulationCommand,
} from '../../../src/game/types'
import type { Item } from '../../../src/game/Item'

// --- Narrow accessors ---------------------------------------------------

interface RouteCurrentItemToCommand {
  readonly type: 'ROUTE_CURRENT_ITEM_TO'
  readonly machineId: string
  readonly itemId: string
  readonly sidesBitmask: number
}

function asRouteCurrentItemTo(command: SimulationCommand): RouteCurrentItemToCommand {
  return command as unknown as RouteCurrentItemToCommand
}

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

describe('BlockInterpreter — machines.routeCurrentItemTo', () => {
  let interpreter: BlockInterpreter

  beforeEach(() => {
    resetItemIdCounter()
    interpreter = new BlockInterpreter()
  })

  // -------------------------------------------------------------------
  // R1 — exposed as a function on the `machines` namespace.
  // -------------------------------------------------------------------
  it('exposes machines.routeCurrentItemTo as a function on the interpreter namespace', () => {
    // The interpreter exposes namespace shapes only via call-site
    // injection. Probe the surface from inside the source itself.
    const commands = interpreter.interpret(`
      if (typeof machines.routeCurrentItemTo === 'function') {
        machines.startMachine(Machine.A)
      } else {
        machines.startMachine(Machine.B)
      }
    `)
    expect(commands).toHaveLength(1)
    expect(commands[0].type).toBe('START_MACHINE')
    // Machine.A → machine_1 when the API is present.
    expect((commands[0] as { machineId: string }).machineId).toBe('machine_1')
  })

  // -------------------------------------------------------------------
  // R2 — emits ROUTE_CURRENT_ITEM_TO carrying the arriving item's id.
  // -------------------------------------------------------------------
  it('inside an on-item-arrives handler, emits ROUTE_CURRENT_ITEM_TO with the arriving item id', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        machines.routeCurrentItemTo(Machine.A, SplitterOutputs.Right)
      })
    `)
    const item = createItem('wheel_small')
    const commands = callTriggerOnItemArrives(interpreter, 'machine_1', item)

    expect(commands).toHaveLength(1)
    const cmd = asRouteCurrentItemTo(commands[0])
    expect(cmd.type).toBe('ROUTE_CURRENT_ITEM_TO')
    expect(cmd.machineId).toBe('machine_1')
    expect(cmd.itemId).toBe(item.id)
    expect(cmd.sidesBitmask).toBe(SPLITTER_SIDE_BIT.right)
  })

  // -------------------------------------------------------------------
  // R3 — does NOT emit SET_OUTPUT_SIDES. The whole point of the new
  // block is that it leaves the sticky config alone.
  // -------------------------------------------------------------------
  it('does NOT emit a SET_OUTPUT_SIDES command (sticky config untouched)', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        machines.routeCurrentItemTo(Machine.A, SplitterOutputs.Left)
      })
    `)
    const item = createItem('wheel_small')
    const commands = callTriggerOnItemArrives(interpreter, 'machine_1', item)

    expect(commands.every((c) => c.type !== 'SET_OUTPUT_SIDES')).toBe(true)
  })

  // -------------------------------------------------------------------
  // R4 — outside a handler (top-level / on-start): silent no-op.
  // -------------------------------------------------------------------
  it('silently drops the call when invoked outside an on-item-arrives handler', () => {
    // Called from top-level source (analogous to a `pxt-on-start`
    // body). No ambient `currentArrivingItem` → no command emitted.
    const commands = interpreter.interpret(
      'machines.routeCurrentItemTo(Machine.A, SplitterOutputs.Right)',
    )
    expect(commands).toEqual([])
  })

  // -------------------------------------------------------------------
  // R5 — per-item routing reflects each arrival's own id (no leak from
  // a previous trigger's item).
  // -------------------------------------------------------------------
  it('binds each emitted command to the arriving item id of its own trigger', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        machines.routeCurrentItemTo(Machine.A, SplitterOutputs.Right)
      })
    `)

    const a = createItem('wheel_small')
    const b = createItem('wheel_small')

    const firstCommands = callTriggerOnItemArrives(interpreter, 'machine_1', a)
    expect(firstCommands).toHaveLength(1)
    expect(asRouteCurrentItemTo(firstCommands[0]).itemId).toBe(a.id)

    const secondCommands = callTriggerOnItemArrives(interpreter, 'machine_1', b)
    expect(secondCommands).toHaveLength(1)
    expect(asRouteCurrentItemTo(secondCommands[0]).itemId).toBe(b.id)
    // The two items have distinct ids — pin that the second trigger
    // did NOT see the first item's id.
    expect(a.id).not.toBe(b.id)
  })

  // -------------------------------------------------------------------
  // R6 — supports defective-vs-clean routing pattern (the canonical
  // user scenario from the bug report).
  // -------------------------------------------------------------------
  it('supports defective→Right / clean→Forward routing inside a handler', () => {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        if (logic.currentItemIsDefective()) {
          machines.routeCurrentItemTo(Machine.A, SplitterOutputs.Right)
        } else {
          machines.routeCurrentItemTo(Machine.A, SplitterOutputs.Forward)
        }
      })
    `)

    const defective = createItem('wheel_small')
    defective.isDefective = true
    const cleanItem = createItem('wheel_small')

    const defCmds = callTriggerOnItemArrives(interpreter, 'machine_1', defective)
    expect(defCmds).toHaveLength(1)
    expect(asRouteCurrentItemTo(defCmds[0]).itemId).toBe(defective.id)
    expect(asRouteCurrentItemTo(defCmds[0]).sidesBitmask).toBe(SPLITTER_SIDE_BIT.right)

    const cleanCmds = callTriggerOnItemArrives(interpreter, 'machine_1', cleanItem)
    expect(cleanCmds).toHaveLength(1)
    expect(asRouteCurrentItemTo(cleanCmds[0]).itemId).toBe(cleanItem.id)
    expect(asRouteCurrentItemTo(cleanCmds[0]).sidesBitmask).toBe(SPLITTER_SIDE_BIT.forward)
  })
})
