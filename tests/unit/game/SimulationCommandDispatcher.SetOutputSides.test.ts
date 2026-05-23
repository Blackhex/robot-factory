/**
 * Task E2 (RED) — `SET_OUTPUT_SIDES` simulation command + dispatcher case.
 *
 * Pins the new dispatcher contract that pairs with the editor-side
 * `machines.routeItemsTo(machine, sides)` block:
 *
 *   - `SimulationCommand` union must include the variant
 *     `{ type: 'SET_OUTPUT_SIDES', machineId, sides }`.
 *   - `SimulationCommandDispatcher` (reached via `Simulation.tick()`)
 *     applies the command verbatim to `machine.outputSidesConfig`.
 *   - No clamping, no validation: every value 1..7 is stored as-is.
 *   - Unknown machineId is a silent no-op (matches the precedent of
 *     `SET_MACHINE_SPEED` / `START_MACHINE` on unknown ids — see
 *     `Simulation.test.ts > "SET_MACHINE_SPEED on unknown machine
 *     is a no-op"`).
 *   - Non-splitter machines store the value verbatim but do NOT
 *     consult it during their tick (only `tickSplitter` reads
 *     `outputSidesConfig`).
 *   - The persistent round-robin counter (`routingCounter`) is NOT
 *     reset by a `SET_OUTPUT_SIDES` dispatch.
 *
 * These tests are written BEFORE the implementation lands and MUST
 * fail against the current codebase. The runtime-asserting tests use
 * `as unknown as SimulationCommand` casts to compile against today's
 * narrower union; one top-level type-only declaration pins the union
 * itself (and intentionally fails `tsc --noEmit` until the GREEN step
 * adds the variant).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Machine } from '../../../src/game/Machine'
import { Simulation } from '../../../src/game/Simulation'
import {
  SPLITTER_ALL_SIDES_BITS,
  type SimulationCommand,
} from '../../../src/game/types'

// --- Compile-time pin: SET_OUTPUT_SIDES must be in SimulationCommand -----
//
// If this file fails to type-check, the GREEN step has not yet added
// the `SET_OUTPUT_SIDES` variant to the `SimulationCommand` union in
// `src/game/types.ts`. `npx tsc --noEmit` failure here is the RED
// signal for test #1 in the task brief.
//
// Vitest uses esbuild for transpilation (not full type-checking), so
// the tests below still run at runtime and assert the dispatcher /
// machine-state contract. Both signals are required for GREEN.
const _setOutputSidesTypeCheck: SimulationCommand = {
  type: 'SET_OUTPUT_SIDES',
  machineId: 'splitter_1',
  sidesBitmask: 5,
}
void _setOutputSidesTypeCheck

// --- Runtime helpers -----------------------------------------------------

/**
 * Build a `SET_OUTPUT_SIDES` command literal cast through `unknown` so
 * the test body remains compilable against today's narrower union.
 */
function setOutputSides(machineId: string, sides: number): SimulationCommand {
  return {
    type: 'SET_OUTPUT_SIDES',
    machineId,
    sidesBitmask: sides,
  } as unknown as SimulationCommand
}

describe('SimulationCommandDispatcher — SET_OUTPUT_SIDES', () => {
  let sim: Simulation
  let splitter: Machine

  beforeEach(() => {
    sim = new Simulation()
    splitter = new Machine('splitter_1', 'splitter')
    sim.addMachine(splitter)
  })

  // -------------------------------------------------------------------
  // Test 2 — dispatcher updates `machine.outputSidesConfig`.
  // -------------------------------------------------------------------
  it('updates the target splitter\'s outputSidesConfig from the default (ALL=7) to the requested value', () => {
    // GIVEN — fresh splitter starts with the default ALL=7 config.
    expect(splitter.outputSidesConfig).toBe(SPLITTER_ALL_SIDES_BITS)

    // WHEN — a SET_OUTPUT_SIDES command with sides=5 is enqueued and dispatched.
    sim.enqueueCommand(setOutputSides('splitter_1', 5))
    sim.tick()

    // THEN — the splitter's persistent config now reflects sides=5.
    expect(splitter.outputSidesConfig).toBe(5)
  })

  // -------------------------------------------------------------------
  // Test 3 — every valid bitfield value (1..7) is stored verbatim.
  // -------------------------------------------------------------------
  it.each([1, 2, 3, 4, 5, 6, 7])(
    'stores sides=%i verbatim (no clamping or validation in the dispatcher)',
    (sides) => {
      // Seed a marker value distinct from BOTH the default (7) and the
      // target so the test is non-tautological for every parameter,
      // including `sides=7` (which equals the default).
      splitter.outputSidesConfig = 0
      sim.enqueueCommand(setOutputSides('splitter_1', sides))
      sim.tick()
      expect(splitter.outputSidesConfig).toBe(sides)
    },
  )

  // -------------------------------------------------------------------
  // Test 4 — unknown machineId is a silent no-op (matches existing
  // precedent for SET_MACHINE_SPEED / START_MACHINE on unknown ids).
  // -------------------------------------------------------------------
  it('is a silent no-op when the machineId does not exist (matches SET_MACHINE_SPEED precedent)', () => {
    // GIVEN — a second machine in the sim that we use as a witness for
    // "no other machine is touched" + the splitter at default config.
    const other = new Machine('other_1', 'part_fabricator')
    sim.addMachine(other)
    const splitterBefore = splitter.outputSidesConfig
    const otherBefore = other.outputSidesConfig

    // WHEN / THEN — must not throw, must not mutate any machine.
    expect(() => {
      sim.enqueueCommand(setOutputSides('does_not_exist', 4))
      sim.tick()
    }).not.toThrow()

    expect(splitter.outputSidesConfig).toBe(splitterBefore)
    expect(other.outputSidesConfig).toBe(otherBefore)
  })

  // -------------------------------------------------------------------
  // Test 5 — non-splitter machine: SET_OUTPUT_SIDES is a no-op
  // (guard matches the sibling ROUTE_CURRENT_ITEM_TO case). It must
  // neither mutate `outputSidesConfig` nor seed `perItemRouteOverrides`,
  // and the machine's tick behavior must be identical to a control sim.
  // -------------------------------------------------------------------
  it('is a no-op on a non-splitter machine (does not mutate outputSidesConfig, perItemRouteOverrides, or tick behavior)', () => {
    const fabSimA = new Simulation()
    const fabA = new Machine('fab_a', 'part_fabricator')
    fabSimA.addMachine(fabA)

    const fabSimB = new Simulation()
    const fabB = new Machine('fab_b', 'part_fabricator')
    fabSimB.addMachine(fabB)

    // WHEN — sim A receives a SET_OUTPUT_SIDES (both with and without
    // an itemId). Sim B receives nothing.
    fabSimA.enqueueCommand(setOutputSides('fab_a', 1))
    fabSimA.enqueueCommand({
      type: 'SET_OUTPUT_SIDES',
      machineId: 'fab_a',
      sidesBitmask: 1,
      itemId: 'gear',
    } as unknown as SimulationCommand)
    fabSimA.tick()
    fabSimB.tick()

    // THEN (a) — guard held: bitfield untouched on both sims.
    expect(fabA.outputSidesConfig).toBe(SPLITTER_ALL_SIDES_BITS)
    expect(fabB.outputSidesConfig).toBe(SPLITTER_ALL_SIDES_BITS)
    // THEN (b) — per-item overrides were NOT seeded.
    expect(fabA.perItemRouteOverrides.size).toBe(0)

    // THEN (c) — tickDefault parity across several ticks.
    for (let i = 0; i < 5; i++) {
      fabSimA.tick()
      fabSimB.tick()
      expect(fabA.state).toBe(fabB.state)
      expect(fabA.inputSlots.length).toBe(fabB.inputSlots.length)
      expect(fabA.outputSlot).toBe(fabB.outputSlot)
      expect(fabA.processingTimer).toBe(fabB.processingTimer)
    }
  })

  // -------------------------------------------------------------------
  // Test 6 — round-robin counter is NOT reset by SET_OUTPUT_SIDES.
  //
  // Persistent semantics: changing the multiplex config mid-stream
  // must not snap the round-robin walk back to "left". The counter
  // continues from its current position, indexed into the new
  // enabled list.
  // -------------------------------------------------------------------
  it('does NOT reset routingCounter when the splitter\'s outputSidesConfig is changed', () => {
    // GIVEN — splitter with routingCounter manually advanced to 5 AND
    // outputSidesConfig pre-set to a non-target marker (0) so we can
    // observe that the dispatch BOTH changed the bitfield AND left the
    // counter alone. Without the marker, the bitfield assertion would
    // be tautological (default 7 == target 7).
    splitter.outputSidesConfig = 0
    splitter.routingCounter = 5

    // WHEN — config is changed mid-stream to 5 (Left+Right). The
    // counter must not be touched.
    sim.enqueueCommand(setOutputSides('splitter_1', 5))
    sim.tick()

    // THEN — bitfield updated; counter preserved verbatim.
    expect(splitter.outputSidesConfig).toBe(5)
    expect(splitter.routingCounter).toBe(5)
  })
})
