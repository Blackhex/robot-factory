import { describe, it, expect, beforeEach } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'
import type { SimulationCommand } from '../../../src/game/types'

/**
 * RED-step tests for the planned `loops.wait(ms)` block / `WAIT`
 * simulation command.
 *
 * Contract under test (will be implemented in the upcoming GREEN step):
 *   - `loops.wait(ms)` emits exactly one command:
 *       { type: 'WAIT', ticks: Math.ceil(ms * 10 / 1000) }
 *     where 10 is the simulation's DEFAULT_TICK_RATE.
 *   - 1000ms → 10 ticks. 100ms → 1 tick. 50ms → 1 tick (ceil rounds up).
 *   - 0ms → 0 ticks (no-op pause).
 *   - Negative / NaN / undefined → 0 ticks (defensive clamp, mirrors the
 *     existing `Number(x) || 0` pattern in the interpreter).
 *   - The block participates in `loops.repeatTimes` unrolling like any
 *     other action.
 *   - It is also reachable via the legacy `factory.wait(...)` namespace,
 *     because `factoryNs` spreads `loopsNs`.
 *
 * NOTE: `WAIT` is not currently a member of the `SimulationCommand`
 * union, so the test code casts to `any` when constructing the
 * "expected" wait command shape inline. The assertions check `type`
 * and `ticks` directly so the test still type-checks during RED.
 */

// Local helper to keep assertions readable without polluting the
// SimulationCommand union. The GREEN step will add `WAIT` to the union
// and these casts will become redundant (but still type-correct).
function expectWait(cmd: SimulationCommand | undefined, ticks: number): void {
  expect(cmd).toBeDefined()
  const w = cmd as unknown as { type: string; ticks: number }
  expect(w.type).toBe('WAIT')
  expect(w.ticks).toBe(ticks)
}

describe('BlockInterpreter — loops.wait', () => {
  let interpreter: BlockInterpreter

  beforeEach(() => {
    interpreter = new BlockInterpreter()
  })

  it('emits a single WAIT command for loops.wait(1000) → 10 ticks', () => {
    // WHEN
    const commands = interpreter.interpret('loops.wait(1000)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 10)
  })

  it('emits WAIT(1) for loops.wait(100) — 100ms maps to one tick at 10 ticks/sec', () => {
    // WHEN
    const commands = interpreter.interpret('loops.wait(100)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 1)
  })

  it('rounds up sub-tick durations: loops.wait(50) → WAIT(1) (ceil rule)', () => {
    // Documented: any positive ms must produce at least one tick of delay.
    // WHEN
    const commands = interpreter.interpret('loops.wait(50)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 1)
  })

  it('emits WAIT(0) for loops.wait(0) — no-op pause', () => {
    // WHEN
    const commands = interpreter.interpret('loops.wait(0)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 0)
  })

  it('emits WAIT(25) for loops.wait(2500) — 2.5s at 10 ticks/sec', () => {
    // WHEN
    const commands = interpreter.interpret('loops.wait(2500)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 25)
  })

  it('clamps negative input: loops.wait(-500) → WAIT(0)', () => {
    // WHEN
    const commands = interpreter.interpret('loops.wait(-500)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 0)
  })

  it('treats NaN / undefined defensively: → WAIT(0)', () => {
    // WHEN
    const nanCommands = interpreter.interpret('loops.wait(NaN)')
    const undefinedCommands = interpreter.interpret('loops.wait(undefined)')

    // THEN
    expect(nanCommands).toHaveLength(1)
    expectWait(nanCommands[0], 0)

    expect(undefinedCommands).toHaveLength(1)
    expectWait(undefinedCommands[0], 0)
  })

  it('unrolls correctly inside loops.repeatTimes: 3× (START + wait 500) → 6 commands in order', () => {
    // GIVEN
    const source = `
      loops.repeatTimes(3, function () {
        machines.startMachine(Machine.A)
        loops.wait(500)
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

    // Indices 1, 3, 5 → WAIT(5) (500ms / 100ms per tick).
    for (const i of [1, 3, 5]) {
      expectWait(commands[i], 5)
    }
  })

  it('is reachable via the legacy factory.wait(...) namespace alias', () => {
    // The factoryNs object spreads loopsNs, so adding `wait` to loopsNs
    // must surface it as `factory.wait(...)` automatically.
    // WHEN
    const commands = interpreter.interpret('factory.wait(1000)')

    // THEN
    expect(commands).toHaveLength(1)
    expectWait(commands[0], 10)
  })
})
