import { describe, it, expect, beforeEach } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'
import type { SimulationCommand } from '../../../src/game/types'

/**
 * RED-step tests for the planned sibling `loops.waitTicks(ticks)` block /
 * interpreter method.
 *
 * Contract under test (will be implemented in the upcoming GREEN step):
 *   - `loops.waitTicks(ticks)` emits exactly one command:
 *       { type: 'WAIT', ticks: <integer ≥ 0> }
 *     where the input is taken DIRECTLY in ticks (no ms → ticks
 *     conversion, unlike the existing `loops.wait(ms)` sibling).
 *   - Positive integer input passes through verbatim
 *     (e.g. `waitTicks(5)` → ticks: 5).
 *   - Non-integer positive input is `Math.floor`'d
 *     (e.g. `waitTicks(3.7)` → ticks: 3).
 *   - 0 / negative / NaN / undefined → 0 ticks (defensive clamp,
 *     mirrors the existing `Number(x) || 0` pattern in the
 *     interpreter).
 *   - Participates in `loops.repeatTimes` unrolling like any other
 *     action.
 *   - Reachable via the legacy `factory.waitTicks(...)` namespace
 *     because `factoryNs` spreads `loopsNs`.
 *   - Counts as a single op for the `MAX_OPERATIONS` guard
 *     (mirrors the existing `wait` method) — covered indirectly by
 *     the `repeatTimes` unrolling test (3 iterations, 6 commands,
 *     well under the 10k cap).
 *
 * NOTE: `WAIT` is not a member of the `SimulationCommand` union, so
 * the local helper casts to a structural shape. Assertions check
 * `type` and `ticks` directly so the test still type-checks during
 * RED.
 */

// Local helper to keep assertions readable without polluting the
// SimulationCommand union (mirrors the helper in the sibling
// BlockInterpreter.wait.test.ts file).
function expectWait(cmd: SimulationCommand | undefined, ticks: number): void {
  expect(cmd).toBeDefined()
  const w = cmd as unknown as { type: string; ticks: number }
  expect(w.type).toBe('WAIT')
  expect(w.ticks).toBe(ticks)
}

describe('BlockInterpreter — loops.waitTicks', () => {
  let interpreter: BlockInterpreter

  beforeEach(() => {
    interpreter = new BlockInterpreter()
  })

  it('emits a single WAIT command for loops.waitTicks(5) → 5 ticks (no ms conversion)', () => {
    // WHEN
    const commands = interpreter.interpret('loops.waitTicks(5)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 5)
  })

  it('emits WAIT(1) for loops.waitTicks(1) — minimum positive tick', () => {
    // WHEN
    const commands = interpreter.interpret('loops.waitTicks(1)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 1)
  })

  it('emits WAIT(0) for loops.waitTicks(0) — no-op pause', () => {
    // WHEN
    const commands = interpreter.interpret('loops.waitTicks(0)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 0)
  })

  it('passes large integers through verbatim: loops.waitTicks(100) → WAIT(100)', () => {
    // WHEN
    const commands = interpreter.interpret('loops.waitTicks(100)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 100)
  })

  it('floors non-integer positive input: loops.waitTicks(3.7) → WAIT(3)', () => {
    // Documented: tick counts are integers; fractional input is rounded
    // DOWN (Math.floor) — distinct from the ms variant which uses ceil.
    // WHEN
    const commands = interpreter.interpret('loops.waitTicks(3.7)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 3)
  })

  it('clamps negative input: loops.waitTicks(-5) → WAIT(0)', () => {
    // WHEN
    const commands = interpreter.interpret('loops.waitTicks(-5)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 0)
  })

  it('treats NaN / undefined defensively: → WAIT(0)', () => {
    // WHEN
    const nanCommands = interpreter.interpret('loops.waitTicks(NaN)')
    const undefinedCommands = interpreter.interpret('loops.waitTicks(undefined)')

    // THEN
    expect(nanCommands).toHaveLength(1)
    expectWait(nanCommands[0], 0)

    expect(undefinedCommands).toHaveLength(1)
    expectWait(undefinedCommands[0], 0)
  })

  it('unrolls correctly inside loops.repeatTimes: 3× (START + waitTicks 5) → 6 commands in order', () => {
    // GIVEN
    const source = `
      loops.repeatTimes(3, function () {
        machines.startMachine(Machine.A)
        loops.waitTicks(5)
      })
    `

    // WHEN
    const commands = interpreter.interpret(source)

    // THEN
    expect(commands).toHaveLength(6)

    // Indices 0, 2, 4 → START_MACHINE on machine_1 (Machine.A).
    for (const i of [0, 2, 4]) {
      expect(commands[i].type).toBe('START_MACHINE')
      expect((commands[i] as { machineId: string }).machineId).toBe('machine_1')
    }

    // Indices 1, 3, 5 → WAIT(5) — passed through verbatim, no ms conversion.
    for (const i of [1, 3, 5]) {
      expectWait(commands[i], 5)
    }
  })

  it('is reachable via the legacy factory.waitTicks(...) namespace alias', () => {
    // The factoryNs object spreads loopsNs, so adding `waitTicks` to
    // loopsNs must surface it as `factory.waitTicks(...)` automatically.
    // WHEN
    const commands = interpreter.interpret('factory.waitTicks(7)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 7)
  })

  it('mixes with the ms variant: loops.wait(1000); loops.waitTicks(3) → [WAIT(10), WAIT(3)]', () => {
    // The two methods are siblings: `wait` converts ms → ticks at 10 Hz
    // (1000ms → 10 ticks), `waitTicks` passes the value through verbatim.
    // WHEN
    const commands = interpreter.interpret(`
      loops.wait(1000)
      loops.waitTicks(3)
    `)

    // THEN
    expect(commands).toHaveLength(2)
    expectWait(commands[0], 10)
    expectWait(commands[1], 3)
  })
})
