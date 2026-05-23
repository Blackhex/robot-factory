/**
 * Task E2 (RED) — BlockInterpreter `machines.routeItemsTo` + `SplitterOutputs` enum.
 *
 * Pins the new editor-side surface that pairs with
 * `tests/unit/game/SimulationCommandDispatcher.SetOutputSides.test.ts`:
 *
 *   - `machines.routeItemsTo(machine, sides)` — emits a
 *     `SET_OUTPUT_SIDES` simulation command. ALWAYS PERSISTENT
 *     semantics: the call updates the splitter's persistent multiplex
 *     config, no per-item routing.
 *   - `SplitterOutputs` enum exposed to interpreter source as a single
 *     dropdown of 7 non-empty side combinations:
 *       Left=1, Forward=2, LeftForward=3, Right=4, LeftRight=5,
 *       ForwardRight=6, LeftForwardRight=7.
 *   - Combination bitfield values are emitted verbatim — the
 *     interpreter does not re-decode/re-encode them.
 *   - Invalid `sides` values (0, 8, …) flow through verbatim. The
 *     editor enum (PXT dropdown) constrains valid values; the
 *     interpreter performs no runtime validation.
 *   - Unknown machine arg matches the existing `resolveMachineId`
 *     fallback (`raw=99` → `machine_100`), same as `startMachine(99)`
 *     and `setRecipe(99, ...)`.
 *
 * These tests are written BEFORE the implementation lands and MUST
 * fail against the current codebase.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'
import type { SimulationCommand } from '../../../src/game/types'

// --- Cast helpers --------------------------------------------------------
//
// Until the GREEN step adds `SET_OUTPUT_SIDES` to the SimulationCommand
// union, the test body refers to the variant via narrow accessors that
// cast through `unknown`.

interface SetOutputSidesCommand {
  type: 'SET_OUTPUT_SIDES'
  machineId: string
  sidesBitmask: number
}

function asSetOutputSides(command: SimulationCommand): SetOutputSidesCommand {
  return command as unknown as SetOutputSidesCommand
}

describe('BlockInterpreter — machines.routeItemsTo + SplitterOutputs', () => {
  let interpreter: BlockInterpreter

  beforeEach(() => {
    interpreter = new BlockInterpreter()
  })

  // -------------------------------------------------------------------
  // Test 7 — `SplitterOutputs` enum exposes the canonical 7 members.
  //
  // Encoding mirrors the bitfield in `src/game/types.ts`:
  //   Left = 1, Forward = 2, Right = 4, with LeftForward / LeftRight /
  //   ForwardRight / LeftForwardRight as the bitwise unions.
  //
  // We pin the encoding indirectly: each member is passed through
  // `routeItemsTo(Machine.A, SplitterOutputs.Xxx)` and the `sides`
  // value of the emitted command is asserted. If the enum is missing
  // or has a different value, the command emits a different `sides`
  // (or fails with a `ReferenceError` at interpret time → no commands
  // emitted), and the assertion below fails.
  // -------------------------------------------------------------------
  it.each([
    ['Left', 1],
    ['Forward', 2],
    ['LeftForward', 3],
    ['Right', 4],
    ['LeftRight', 5],
    ['ForwardRight', 6],
    ['LeftForwardRight', 7],
  ] as const)(
    'SplitterOutputs.%s resolves to bitfield value %i',
    (member, expected) => {
      const commands = interpreter.interpret(
        `machines.routeItemsTo(Machine.A, SplitterOutputs.${member})`,
      )
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_OUTPUT_SIDES')
      expect(asSetOutputSides(commands[0]).sidesBitmask).toBe(expected)
    },
  )

  // -------------------------------------------------------------------
  // Test 8 — `machines.routeItemsTo(machine, sides)` emits a single
  // `SET_OUTPUT_SIDES` command with the resolved machineId.
  // -------------------------------------------------------------------
  it('emits exactly one SET_OUTPUT_SIDES command with the resolved machineId and sides', () => {
    const commands = interpreter.interpret(
      'machines.routeItemsTo(Machine.A, SplitterOutputs.Forward)',
    )
    expect(commands).toHaveLength(1)
    const cmd = asSetOutputSides(commands[0])
    expect(cmd.type).toBe('SET_OUTPUT_SIDES')
    expect(cmd.machineId).toBe('machine_1')
    expect(cmd.sidesBitmask).toBe(2)
  })

  // -------------------------------------------------------------------
  // Test 9 — multiple `routeItemsTo` calls emit multiple commands in
  // source order with correct machineId / sides mapping.
  // -------------------------------------------------------------------
  it('emits multiple SET_OUTPUT_SIDES commands in source order', () => {
    const commands = interpreter.interpret(`
      machines.routeItemsTo(Machine.A, SplitterOutputs.Left)
      machines.routeItemsTo(Machine.B, SplitterOutputs.LeftForwardRight)
    `)
    expect(commands).toHaveLength(2)

    const first = asSetOutputSides(commands[0])
    expect(first.type).toBe('SET_OUTPUT_SIDES')
    expect(first.machineId).toBe('machine_1')
    expect(first.sidesBitmask).toBe(1)

    const second = asSetOutputSides(commands[1])
    expect(second.type).toBe('SET_OUTPUT_SIDES')
    expect(second.machineId).toBe('machine_2')
    expect(second.sidesBitmask).toBe(7)
  })

  // -------------------------------------------------------------------
  // Test 10 — combination bitfield value is preserved verbatim.
  //
  // Pins that the interpreter does not accidentally re-decode the
  // bitfield through some side → bit lookup table that would produce
  // a different value (e.g. interpreting 5 as "the 5th member" rather
  // than "left | right").
  // -------------------------------------------------------------------
  it('preserves the combination bitfield value 5 verbatim (LeftRight)', () => {
    const commands = interpreter.interpret(
      'machines.routeItemsTo(Machine.A, SplitterOutputs.LeftRight)',
    )
    expect(commands).toHaveLength(1)
    expect(asSetOutputSides(commands[0]).sidesBitmask).toBe(5)
  })

  // -------------------------------------------------------------------
  // Test 11 — invalid `sides` value (e.g. 0 or 8) flows through verbatim.
  //
  // CONTRACT DECISION: the interpreter does NOT validate the bitfield.
  // The PXT block's dropdown is the validity gate (it only offers the
  // 7 valid members). Bypassing the dropdown by passing a literal
  // results in the literal being emitted as-is. The dispatcher (test
  // file `SimulationCommandDispatcher.SetOutputSides.test.ts`) also
  // stores the value verbatim — neither layer enforces 1..7.
  // -------------------------------------------------------------------
  it.each([0, 8, -1, 99])(
    'passes invalid sides value %i through verbatim (no runtime validation)',
    (sides) => {
      const commands = interpreter.interpret(
        `machines.routeItemsTo(Machine.A, ${sides})`,
      )
      expect(commands).toHaveLength(1)
      const cmd = asSetOutputSides(commands[0])
      expect(cmd.type).toBe('SET_OUTPUT_SIDES')
      expect(cmd.sidesBitmask).toBe(sides)
    },
  )

  // -------------------------------------------------------------------
  // Test 12 — `routeItemsTo` works inside an `on item arrives` handler.
  //
  // Deferred to E3 (generalized event hat replaces
  // `onItemArrivesAtSplitter`). The persistent semantics already let
  // us pin the non-handler call site in earlier tests; the handler
  // path is wired in E3.
  // -------------------------------------------------------------------
  it.todo(
    'routeItemsTo works inside an on-item-arrives handler context (covered in E3)',
  )

  // -------------------------------------------------------------------
  // Test 13 — `machines.routeItemsTo` is a function on the namespace
  // exposed to interpreter source.
  //
  // The interpreter exposes namespaces (`machines`, `recipes`, `belts`,
  // …) as call args to the executed function. We probe the namespace
  // wiring from inside source by emitting one of two distinct commands
  // depending on whether `routeItemsTo` is callable:
  //   - present + callable → emits SET_OUTPUT_SIDES.
  //   - missing / not a function → catch block emits START_MACHINE.
  // -------------------------------------------------------------------
  it('exposes machines.routeItemsTo as a function on the interpreter namespace', () => {
    const commands = interpreter.interpret(`
      try {
        if (typeof machines.routeItemsTo === 'function') {
          machines.routeItemsTo(Machine.A, SplitterOutputs.Forward)
        } else {
          machines.startMachine(Machine.B)
        }
      } catch (e) {
        machines.startMachine(Machine.C)
      }
    `)
    expect(commands).toHaveLength(1)
    expect(commands[0].type).toBe('SET_OUTPUT_SIDES')
  })

  // -------------------------------------------------------------------
  // Test 14 — unknown machine arg flows through `resolveMachineId`'s
  // fallback (`raw=99` → `machine_100`).
  //
  // PRECEDENT: `BlockInterpreter.resolveMachineId` already returns
  // `MACHINE_IDS[raw] ?? \`machine_${raw + 1}\`` when no dynamic
  // machine entry matches. Existing block handlers (`startMachine`,
  // `setRecipe`, `setMachineSpeed`) emit a command with the synthesized
  // id and let the dispatcher silently no-op (test #4 in the dispatcher
  // file). `routeItemsTo` MUST match this behavior for consistency.
  // -------------------------------------------------------------------
  it('emits a command with the synthesized machineId for an out-of-range machine arg (matches startMachine precedent)', () => {
    const commands = interpreter.interpret(
      'machines.routeItemsTo(99, SplitterOutputs.Left)',
    )
    expect(commands).toHaveLength(1)
    const cmd = asSetOutputSides(commands[0])
    expect(cmd.type).toBe('SET_OUTPUT_SIDES')
    expect(cmd.machineId).toBe('machine_100')
    expect(cmd.sidesBitmask).toBe(1)
  })
})
