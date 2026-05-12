import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { resetItemIdCounter, createItem } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'
import type { GameOverInfo } from '../../../src/game/types'

// Design notes for these tests
// ----------------------------
// Pinned signature for the new pure guard:
//
//   detectStarvation(
//     machines: Iterable<Machine>,
//     context: StarvationContext,
//     currentTick: number,
//   ): GameOverInfo | null
//
//   interface StarvationContext {
//     getOutputBelt(machineId: string, port: 'primary' | 'secondary'): string | undefined
//     getBelt(beltId: string): ConveyorBelt | undefined
//     findMachineAt(x: number, z: number): Machine | undefined
//     findBeltStartingAt(x: number, z: number): ConveyorBelt | undefined
//   }
//
// `findBeltStartingAt` mirrors the same-named method already exposed by
// `Simulation` to `ItemDeliveryEngine`. The starvation guard needs it so
// it can walk a multi-segment logical belt the same way the delivery
// engine does — `setMachineOutputBelt` always points at segment 0, and
// only the LAST segment's `toX/toZ` is the consumer machine cell.
//
// This mirrors the adapter shape `Simulation` already passes to
// `ItemDeliveryEngine` and keeps the guard pure / Three.js-free.
//
// The module is loaded via dynamic `import()` with a runtime string
// path so this file type-checks BEFORE the implementation exists.
// While the file is missing, every test fails at the
// `requireGuard()` call with a clear "module not found" message —
// which is exactly the expected failure mode at this stage.

interface StarvationContext {
  getOutputBelt(machineId: string, port: 'primary' | 'secondary'): string | undefined
  getBelt(beltId: string): ConveyorBelt | undefined
  findMachineAt(x: number, z: number): Machine | undefined
  findBeltStartingAt(x: number, z: number): ConveyorBelt | undefined
}

type DetectStarvation = (
  machines: Iterable<Machine>,
  context: StarvationContext,
  currentTick: number,
) => GameOverInfo | null

let detectStarvation: DetectStarvation | null = null
let importError: unknown = null

beforeAll(async () => {
  // Runtime string path defeats TS module resolution → keeps tsc clean
  // when the implementation file does not yet exist.
  const path = '../../../src/game/StarvationGuard.ts'
  try {
    const mod = (await import(/* @vite-ignore */ path)) as {
      detectStarvation?: DetectStarvation
    }
    if (typeof mod.detectStarvation !== 'function') {
      importError = new Error(
        `StarvationGuard.ts loaded but does not export a 'detectStarvation' function`,
      )
    } else {
      detectStarvation = mod.detectStarvation
    }
  } catch (err) {
    importError = err
  }
})

function requireGuard(): DetectStarvation {
  if (detectStarvation === null) {
    throw new Error(
      `detectStarvation is not available — the StarvationGuard module is missing or malformed. ` +
        `Underlying error: ${String(importError)}`,
    )
  }
  return detectStarvation
}

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

// --- Tiny in-memory belt graph fixture --------------------------

interface Fixture {
  machines: Map<string, Machine>
  belts: Map<string, ConveyorBelt>
  positions: Map<string, { x: number; z: number }>
  outputBelts: Map<string, { primary?: string; secondary?: string }>
  context: StarvationContext
}

function newFixture(): Fixture {
  const machines = new Map<string, Machine>()
  const belts = new Map<string, ConveyorBelt>()
  const positions = new Map<string, { x: number; z: number }>()
  const outputBelts = new Map<string, { primary?: string; secondary?: string }>()

  const context: StarvationContext = {
    getOutputBelt(machineId, port) {
      return outputBelts.get(machineId)?.[port]
    },
    getBelt(beltId) {
      return belts.get(beltId)
    },
    findMachineAt(x, z) {
      for (const [id, p] of positions) {
        if (p.x === x && p.z === z) return machines.get(id)
      }
      return undefined
    },
    findBeltStartingAt(x, z) {
      for (const belt of belts.values()) {
        if (belt.fromX === x && belt.fromZ === z) return belt
      }
      return undefined
    },
  }
  return { machines, belts, positions, outputBelts, context }
}

/**
 * Wire a multi-segment logical belt. `path` is the ordered list of
 * cells the belt traverses, [from0, ..., fromN, toN]. Produces N
 * `ConveyorBelt` segments named via `ConveyorBelt.segmentIdFor`, and
 * registers segment 0 as the producer's output belt — matching how
 * `GameManager` and `FactorySimulationSync` wire real belts in prod.
 */
function wireMultiSegmentBelt(
  f: Fixture,
  logicalId: string,
  fromMachineId: string,
  path: ReadonlyArray<{ x: number; z: number }>,
  port: 'primary' | 'secondary' = 'primary',
): ConveyorBelt[] {
  if (path.length < 2) {
    throw new Error('multi-segment belt path needs at least 2 cells')
  }
  const segments: ConveyorBelt[] = []
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]
    const b = path[i + 1]
    const segId = ConveyorBelt.segmentIdFor(logicalId, i)
    const seg = new ConveyorBelt(segId, a.x, a.z, b.x, b.z, 1.0)
    f.belts.set(segId, seg)
    segments.push(seg)
  }
  const slot = f.outputBelts.get(fromMachineId) ?? {}
  slot[port] = ConveyorBelt.segmentIdFor(logicalId, 0)
  f.outputBelts.set(fromMachineId, slot)
  return segments
}

function place(f: Fixture, m: Machine, x: number, z: number): void {
  f.machines.set(m.id, m)
  f.positions.set(m.id, { x, z })
}

function wireBelt(
  f: Fixture,
  beltId: string,
  fromMachineId: string,
  toMachineId: string,
  port: 'primary' | 'secondary' = 'primary',
): ConveyorBelt {
  const from = f.positions.get(fromMachineId)!
  const to = f.positions.get(toMachineId)!
  const belt = new ConveyorBelt(beltId, from.x, from.z, to.x, to.z, 1.0)
  f.belts.set(beltId, belt)
  const slot = f.outputBelts.get(fromMachineId) ?? {}
  slot[port] = beltId
  f.outputBelts.set(fromMachineId, slot)
  return belt
}

// ----------------------------------------------------------------

describe('detectStarvation (pure guard)', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('returns null when no machines are present', () => {
    const guard = requireGuard()
    const f = newFixture()
    expect(guard(f.machines.values(), f.context, 0)).toBeNull()
  })

  it('returns null when machine has no inputs delivered yet', () => {
    const guard = requireGuard()
    const f = newFixture()
    const a = new Machine('a', 'assembler')
    a.setRecipe(recipe('assemble_drivetrain_basic'))
    a.start()
    place(f, a, 0, 0)
    expect(guard(f.machines.values(), f.context, 0)).toBeNull()
  })

  it('returns null when machine is disabled', () => {
    const guard = requireGuard()
    const f = newFixture()
    const a = new Machine('a', 'assembler')
    a.setRecipe(recipe('assemble_drivetrain_basic'))
    a.addInput(createItem('wheel_small'))
    place(f, a, 0, 0)
    expect(guard(f.machines.values(), f.context, 7)).toBeNull()
  })

  it('returns null when machine has no recipe set', () => {
    const guard = requireGuard()
    const f = newFixture()
    const a = new Machine('a', 'assembler')
    a.start()
    a.addInput(createItem('wheel_small'))
    place(f, a, 0, 0)
    expect(guard(f.machines.values(), f.context, 7)).toBeNull()
  })

  it('returns null when all required inputs are present', () => {
    const guard = requireGuard()
    const f = newFixture()
    const a = new Machine('a', 'assembler')
    a.setRecipe(recipe('assemble_drivetrain_basic'))
    a.start()
    a.addInput(createItem('wheel_small'))
    a.addInput(createItem('wheel_small'))
    a.addInput(createItem('circuit_basic'))
    place(f, a, 0, 0)
    expect(guard(f.machines.values(), f.context, 7)).toBeNull()
  })

  it('returns starvation when a required type is missing AND no upstream produces it', () => {
    const guard = requireGuard()
    const f = newFixture()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    assembler.addInput(createItem('wheel_small')) // one wheel arrived

    const fab = new Machine('fab', 'part_fabricator')
    fab.setRecipe(recipe('wheel_press_small'))
    fab.start()

    place(f, assembler, 1, 0)
    place(f, fab, 0, 0)
    wireBelt(f, 'b1', 'fab', 'assembler')

    const info = guard(f.machines.values(), f.context, 42)
    expect(info).not.toBeNull()
    expect(String(info!.reason)).toBe('starvation')
    expect(info!.machineId).toBe('assembler')
    expect(info!.itemType).toBe('circuit_basic')
    expect(info!.tick).toBe(42)
  })

  it('returns null when a multi-hop upstream chain CAN produce the missing type', () => {
    const guard = requireGuard()
    const f = newFixture()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    assembler.addInput(createItem('wheel_small'))

    // Splitter has no recipe but should be transparent for closure traversal.
    const splitter = new Machine('splitter', 'splitter')
    splitter.start()

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    wheelFab.start()

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    circuitFab.setRecipe(recipe('circuit_printer_basic'))
    circuitFab.start()

    place(f, assembler, 2, 0)
    place(f, splitter, 1, 0)
    place(f, wheelFab, 0, 0)
    place(f, circuitFab, 1, 1)

    wireBelt(f, 'b_split_to_asm', 'splitter', 'assembler')
    wireBelt(f, 'b_wheel_to_split', 'wheelFab', 'splitter')
    wireBelt(f, 'b_circ_to_split', 'circuitFab', 'splitter')

    expect(guard(f.machines.values(), f.context, 1)).toBeNull()
  })

  it('treats stopped (disabled) upstream producers as NOT reachable, so the assembler starves', () => {
    // New rule: a producer must be BOTH enabled AND have a producing
    // recipe configured to count as a reachable producer for the
    // starvation check. A configured-but-stopped producer (recipe set,
    // never started) does NOT rescue the downstream consumer.
    const guard = requireGuard()
    const f = newFixture()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    assembler.addInput(createItem('wheel_small'))

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    wheelFab.start()

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    circuitFab.setRecipe(recipe('circuit_printer_basic'))
    // intentionally NOT started → enabled === false, recipe !== null

    place(f, assembler, 1, 1)
    place(f, wheelFab, 0, 1)
    place(f, circuitFab, 2, 1)
    wireBelt(f, 'b_w', 'wheelFab', 'assembler')
    wireBelt(f, 'b_c', 'circuitFab', 'assembler')

    const info = guard(f.machines.values(), f.context, 5)
    expect(info).not.toBeNull()
    expect(String(info!.reason)).toBe('starvation')
    expect(info!.machineId).toBe('assembler')
    expect(info!.itemType).toBe('circuit_basic')
    expect(info!.tick).toBe(5)
  })

  it('positive control: same fixture but with circuitFab.start() → no starvation (proves enabled flag is the trigger)', () => {
    // Identical wiring to the test above, EXCEPT circuitFab is started.
    // Pinning that the only behavioural difference is the `enabled`
    // flag — not some unrelated artefact of the fixture.
    const guard = requireGuard()
    const f = newFixture()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    assembler.addInput(createItem('wheel_small'))

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    wheelFab.start()

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    circuitFab.setRecipe(recipe('circuit_printer_basic'))
    circuitFab.start()

    place(f, assembler, 1, 1)
    place(f, wheelFab, 0, 1)
    place(f, circuitFab, 2, 1)
    wireBelt(f, 'b_w', 'wheelFab', 'assembler')
    wireBelt(f, 'b_c', 'circuitFab', 'assembler')

    expect(guard(f.machines.values(), f.context, 5)).toBeNull()
  })

  it('edge: an enabled upstream producer with currentRecipe === null is NOT a reachable producer', () => {
    // The new rule has TWO conjuncts: enabled AND recipe configured.
    // Pin the recipe-side: a started machine with no recipe set must
    // not rescue the downstream consumer.
    const guard = requireGuard()
    const f = newFixture()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    assembler.addInput(createItem('wheel_small'))

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    wheelFab.start()

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    // No recipe set, but started.
    circuitFab.start()

    place(f, assembler, 1, 1)
    place(f, wheelFab, 0, 1)
    place(f, circuitFab, 2, 1)
    wireBelt(f, 'b_w', 'wheelFab', 'assembler')
    wireBelt(f, 'b_c', 'circuitFab', 'assembler')

    const info = guard(f.machines.values(), f.context, 6)
    expect(info).not.toBeNull()
    expect(String(info!.reason)).toBe('starvation')
    expect(info!.machineId).toBe('assembler')
    expect(info!.itemType).toBe('circuit_basic')
  })

  it('transition: producer.start() then producer.stop() → starvation fires (live program-toggle case)', () => {
    // Pin the live-edit / runtime case: a producer that was once
    // started but has since been stopped (e.g. by a STOP_MACHINE
    // command) must drop out of the reachable-producer set
    // immediately, even though its recipe is still configured.
    const guard = requireGuard()
    const f = newFixture()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    assembler.addInput(createItem('wheel_small'))

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    wheelFab.start()

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    circuitFab.setRecipe(recipe('circuit_printer_basic'))
    circuitFab.start()
    circuitFab.stop()
    // Sanity-check the precondition: recipe still set, just disabled.
    expect(circuitFab.enabled).toBe(false)
    expect(circuitFab.currentRecipe).not.toBeNull()

    place(f, assembler, 1, 1)
    place(f, wheelFab, 0, 1)
    place(f, circuitFab, 2, 1)
    wireBelt(f, 'b_w', 'wheelFab', 'assembler')
    wireBelt(f, 'b_c', 'circuitFab', 'assembler')

    const info = guard(f.machines.values(), f.context, 8)
    expect(info).not.toBeNull()
    expect(String(info!.reason)).toBe('starvation')
    expect(info!.machineId).toBe('assembler')
    expect(info!.itemType).toBe('circuit_basic')
    expect(info!.tick).toBe(8)
  })

  it('is cycle-safe: belt loop without a producer of the missing type still yields starvation (no infinite loop)', () => {
    const guard = requireGuard()
    const f = newFixture()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    assembler.addInput(createItem('wheel_small'))

    // M2 is a part_fabricator that produces something irrelevant
    // (wheel_small) — cycle, but no circuit_basic anywhere.
    const m2 = new Machine('m2', 'part_fabricator')
    m2.setRecipe(recipe('wheel_press_small'))
    m2.start()

    place(f, assembler, 0, 0)
    place(f, m2, 1, 0)
    wireBelt(f, 'b_m2_to_asm', 'm2', 'assembler')
    wireBelt(f, 'b_asm_to_m2', 'assembler', 'm2')

    const info = guard(f.machines.values(), f.context, 9)
    expect(info).not.toBeNull()
    expect(String(info!.reason)).toBe('starvation')
    expect(info!.machineId).toBe('assembler')
    expect(info!.itemType).toBe('circuit_basic')
  })

  it('is cycle-safe: belt loop containing a producer of the missing type yields null', () => {
    const guard = requireGuard()
    const f = newFixture()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    assembler.addInput(createItem('wheel_small'))

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    circuitFab.setRecipe(recipe('circuit_printer_basic'))
    circuitFab.start()

    place(f, assembler, 0, 0)
    place(f, circuitFab, 1, 0)
    wireBelt(f, 'b_circ_to_asm', 'circuitFab', 'assembler')
    wireBelt(f, 'b_asm_to_circ', 'assembler', 'circuitFab')

    expect(guard(f.machines.values(), f.context, 9)).toBeNull()
  })

  // --- Multi-segment belt traversal ----------------------------
  // In production, both `GameManager` and `FactorySimulationSync`
  // register a producer's output via
  // `setMachineOutputBelt(producerId, ConveyorBelt.segmentIdFor(logicalId, 0))`
  // — always segment 0. For a logical belt longer than one cell, the
  // graph walker MUST chain through `findBeltStartingAt(belt.toX, belt.toZ)`
  // to reach the consumer cell. `ItemDeliveryEngine` already does this;
  // the starvation guard does not — that is the bug these tests pin.

  it('multi-segment belt: upstream wheel chain IS reachable; only the truly missing input starves', () => {
    const guard = requireGuard()
    const f = newFixture()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    // One wheel has arrived; circuit_basic has not — and there is NO
    // circuit producer anywhere → starvation is expected ONLY for
    // circuit_basic. The wheel chain reachable through the multi-
    // segment belt must NOT be flagged.
    assembler.addInput(createItem('wheel_small'))

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    wheelFab.start()

    // Producer parked off-grid; only the assembler must be findable
    // via findMachineAt because the guard looks up consumers by belt
    // endpoint. The producer is identified by id via getOutputBelt.
    place(f, wheelFab, -1, 0)
    place(f, assembler, 3, 0)

    wireMultiSegmentBelt(f, 'wheel_chain', 'wheelFab', [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
    ])

    // Sanity-check the seam shape the guard must use.
    expect(f.context.getOutputBelt('wheelFab', 'primary')).toBe(
      ConveyorBelt.segmentIdFor('wheel_chain', 0),
    )
    expect(f.context.findMachineAt(1, 0)).toBeUndefined()
    expect(f.context.findMachineAt(2, 0)).toBeUndefined()
    expect(f.context.findMachineAt(3, 0)?.id).toBe('assembler')
    expect(f.context.findBeltStartingAt(1, 0)?.id).toBe(
      ConveyorBelt.segmentIdFor('wheel_chain', 1),
    )
    expect(f.context.findBeltStartingAt(2, 0)?.id).toBe(
      ConveyorBelt.segmentIdFor('wheel_chain', 2),
    )
    expect(f.context.findBeltStartingAt(3, 0)).toBeUndefined()

    const info = guard(f.machines.values(), f.context, 11)
    // The bug currently makes the guard report wheel_small as starved
    // because the producer→consumer edge was never recorded — the
    // walker stopped at seg0.toX/toZ which has no machine.
    expect(info).not.toBeNull()
    expect(info!.machineId).toBe('assembler')
    expect(info!.itemType).toBe('circuit_basic')
    expect(info!.tick).toBe(11)
  })

  it('multi-segment belt: all inputs reachable through long belts → no starvation', () => {
    const guard = requireGuard()
    const f = newFixture()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    // Both inputs already delivered, so the only thing that could
    // produce a false positive here is a future addition to the guard
    // — but per design, present inputs are skipped. We still set up
    // full reachability so the test stays meaningful if that rule
    // ever changes.
    assembler.addInput(createItem('wheel_small'))
    assembler.addInput(createItem('circuit_basic'))

    const wheelFabA = new Machine('wheelFabA', 'part_fabricator')
    wheelFabA.setRecipe(recipe('wheel_press_small'))
    wheelFabA.start()

    const wheelFabB = new Machine('wheelFabB', 'part_fabricator')
    wheelFabB.setRecipe(recipe('wheel_press_small'))
    wheelFabB.start()

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    circuitFab.setRecipe(recipe('circuit_printer_basic'))
    circuitFab.start()

    place(f, wheelFabA, -1, 0)
    place(f, wheelFabB, -1, 1)
    place(f, circuitFab, -1, 2)
    place(f, assembler, 3, 0)

    // Three independent multi-segment chains, all terminating at the
    // assembler cell. Each chain is wired through segment 0 only,
    // exactly as production code does.
    wireMultiSegmentBelt(f, 'chain_wheelA', 'wheelFabA', [
      { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 },
    ])
    wireMultiSegmentBelt(f, 'chain_wheelB', 'wheelFabB', [
      { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 3, z: 0 },
    ])
    wireMultiSegmentBelt(f, 'chain_circ', 'circuitFab', [
      { x: 0, z: 2 }, { x: 1, z: 2 }, { x: 2, z: 2 }, { x: 3, z: 2 }, { x: 3, z: 1 }, { x: 3, z: 0 },
    ])

    expect(guard(f.machines.values(), f.context, 3)).toBeNull()
  })

  it('multi-segment belt: missing input whose producer IS reachable through multi-segment belt must NOT starve (bug exposure)', () => {
    // This is the core regression: with the current implementation,
    // `setMachineOutputBelt` always points at segment 0, and the guard
    // reads `belt.toX/toZ` of seg0 (a mid-chain belt cell with no
    // machine) → no producer→consumer edge is recorded → the missing
    // input is reported as starved even though the upstream chain CAN
    // produce it. Expected behavior after fix: walk the segment chain
    // via `findBeltStartingAt` until a machine cell is found.
    const guard = requireGuard()
    const f = newFixture()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    // Circuit delivered, wheel NOT delivered. Missing type = wheel_small.
    assembler.addInput(createItem('circuit_basic'))

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    wheelFab.start()

    place(f, wheelFab, -1, 0)
    place(f, assembler, 3, 0)

    wireMultiSegmentBelt(f, 'wheel_chain', 'wheelFab', [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
    ])

    // Producer wheel_press_small produces wheel_small, and the
    // multi-segment belt physically connects wheelFab → assembler.
    // The guard MUST treat wheel_small as reachable and return null.
    const info = guard(f.machines.values(), f.context, 13)
    expect(
      info,
      `expected null (wheel chain reachable through 3 belt segments) ` +
        `but got starvation for ${info?.itemType ?? '<none>'} ` +
        `on machine ${info?.machineId ?? '<none>'} — the guard is ` +
        `stopping at segment 0's toX/toZ instead of walking the ` +
        `chain via findBeltStartingAt`,
    ).toBeNull()
  })

  it('multi-segment belt: dangling chain that never reaches the consumer → starvation fires', () => {
    const guard = requireGuard()
    const f = newFixture()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    // No wheel delivered yet — and the chain below ends in mid-air
    // before reaching the assembler, so wheel_small should starve.
    assembler.addInput(createItem('circuit_basic'))

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    wheelFab.start()

    place(f, wheelFab, -1, 0)
    place(f, assembler, 3, 0)

    // Chain stops at (2,0) — no segment starts there, no machine
    // there. The assembler at (3,0) is unreachable.
    wireMultiSegmentBelt(f, 'dangling', 'wheelFab', [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
    ])

    expect(f.context.findBeltStartingAt(2, 0)).toBeUndefined()
    expect(f.context.findMachineAt(2, 0)).toBeUndefined()

    const info = guard(f.machines.values(), f.context, 4)
    expect(info).not.toBeNull()
    expect(info!.machineId).toBe('assembler')
    expect(info!.itemType).toBe('wheel_small')
    expect(info!.tick).toBe(4)
  })
})
