import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ALL_OUTPUTS_CONNECTED_ENV } from '../../../src/game/MachineBehaviors'
import { Simulation } from '../../../src/game/Simulation'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'

// ---------------------------------------------------------------------------
// Helpers
//
// These tests lock contracts that are not yet implemented in production code:
//   - Simulation constructor takes an optional second arg `rng: () => number`
//   - Machine.tick(rng) forwards the rng to the per-type behavior
//   - produceOutput applies a defect roll for part_fabricator, assembler,
//     and painter (all three roll based on `defectProbability(speed)`)
//   - assembler/painter propagate isDefective from inputs to outputs AND
//     additionally roll for new defects when all inputs are clean
//   - recycler/splitter never invent new defects
//
// The casts below allow the test to compile against the *current* (narrower)
// TypeScript signatures while still exercising the *future* runtime behavior.
// ---------------------------------------------------------------------------

/** Tiny seeded PRNG (mulberry32). Pure, deterministic. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** RNG that always returns the same value. */
const constRng = (v: number): (() => number) => () => v

/** Call `machine.tick(rng)` against the future signature. */
function tickWithRng(m: Machine, rng: () => number): void {
  ;(m.tick as unknown as (this: Machine, r: () => number, e: typeof ALL_OUTPUTS_CONNECTED_ENV) => void).call(
    m,
    rng,
    ALL_OUTPUTS_CONNECTED_ENV,
  )
}

/** Construct a Simulation with an injected rng (future ctor signature). */
function createSimulation(tickRate: number, rng: () => number): Simulation {
  const Ctor = Simulation as unknown as new (
    tickRate: number,
    rng: () => number,
  ) => Simulation
  return new Ctor(tickRate, rng)
}

/**
 * Tick the machine until either it has an output or `maxTicks` is reached.
 * Returns the produced item (machine.outputSlot) — caller asserts on flag.
 */
function tickUntilOutput(
  machine: Machine,
  rng: () => number,
  maxTicks = 100,
): void {
  for (let i = 0; i < maxTicks; i++) {
    if (machine.outputSlot !== null) return
    tickWithRng(machine, rng)
  }
}

/** Drive a Simulation and capture isDefective of each new fabricator output. */
function collectDefectSequence(
  sim: Simulation,
  machine: Machine,
  count: number,
  maxTicks = 1000,
): boolean[] {
  const seq: boolean[] = []
  for (let i = 0; i < maxTicks && seq.length < count; i++) {
    sim.tick()
    if (machine.outputSlot !== null) {
      seq.push(machine.outputSlot.isDefective)
      machine.takeOutput()
    }
  }
  return seq
}

// Hand-rolled recipes for behaviors that have no production recipe yet.

/** Assembler recipe: 2× wheel_small → 1× chassis_light. */
const assemblerWheelToChassis: Recipe = {
  id: 'test_assemble_chassis_from_wheels',
  inputs: [{ type: 'wheel_small', quantity: 2 }],
  outputs: [{ type: 'chassis_light', quantity: 1 }],
  processingTicks: 4,
  machineType: 'assembler',
}

/** Painter recipe: 1× chassis_light → 1× chassis_light. */
const painterChassisRecipe: Recipe = {
  id: 'test_paint_chassis_light',
  inputs: [{ type: 'chassis_light', quantity: 1 }],
  outputs: [{ type: 'chassis_light', quantity: 1 }],
  processingTicks: 3,
  machineType: 'painter',
}

// ---------------------------------------------------------------------------
// 1. Simulation accepts an injected RNG
// ---------------------------------------------------------------------------

describe('Simulation accepts an injected RNG', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('constructs with (tickRate, rng) and ticks without throwing', () => {
    // GIVEN
    const rng = constRng(0.5)

    // WHEN
    const sim = createSimulation(10, rng)
    sim.tick()

    // THEN
    expect(sim.currentTick).toBe(1)
  })

  it('forwards the injected rng to machine ticks (rng=0 → fabricator output is defective)', () => {
    // GIVEN
    const sim = createSimulation(10, constRng(0))
    const m = new Machine('fab', 'part_fabricator')
    m.setRecipe(getRecipeById('wheel_press_small')!)
    m.speed = 1
    m.start()
    sim.addMachine(m)

    // WHEN: tick enough times for the first output to appear
    for (let i = 0; i < 20 && m.outputSlot === null; i++) sim.tick()

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(true)
  })

  it('forwards the injected rng to machine ticks (rng=0.99 → fabricator output is clean)', () => {
    // GIVEN
    const sim = createSimulation(10, constRng(0.99))
    const m = new Machine('fab', 'part_fabricator')
    m.setRecipe(getRecipeById('wheel_press_small')!)
    m.speed = 1
    m.start()
    sim.addMachine(m)

    // WHEN
    for (let i = 0; i < 20 && m.outputSlot === null; i++) sim.tick()

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. Fabricator defect roll (no inputs)
// ---------------------------------------------------------------------------

describe('part_fabricator defect roll', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  function buildFabricator(speed: number): Machine {
    const m = new Machine('fab', 'part_fabricator')
    m.setRecipe(getRecipeById('wheel_press_small')!) // 5 ticks, no inputs
    m.speed = speed
    m.start()
    return m
  }

  it('speed=1, rng=0 → first output is defective (0 < 0.02)', () => {
    // GIVEN
    const m = buildFabricator(1)

    // WHEN
    tickUntilOutput(m, constRng(0))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(true)
  })

  it('speed=1, rng=0.99 → first output is clean (0.99 > 0.02)', () => {
    // GIVEN
    const m = buildFabricator(1)

    // WHEN
    tickUntilOutput(m, constRng(0.99))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(false)
  })

  it('speed=10, rng=0.30 → output is defective (0.30 < 0.35)', () => {
    // GIVEN
    const m = buildFabricator(10)

    // WHEN
    tickUntilOutput(m, constRng(0.3))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(true)
  })

  it('speed=10, rng=0.40 → output is clean (0.40 > 0.35)', () => {
    // GIVEN
    const m = buildFabricator(10)

    // WHEN
    tickUntilOutput(m, constRng(0.4))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(false)
  })

  it('speed=1, rng=0.025 → output is clean (0.025 > 0.02)', () => {
    // GIVEN
    const m = buildFabricator(1)

    // WHEN
    tickUntilOutput(m, constRng(0.025))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. Assembler defect roll on output
// ---------------------------------------------------------------------------

describe('assembler defect roll on output (clean inputs)', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  function buildAssembler(speed: number): Machine {
    const m = new Machine('asm', 'assembler', 4)
    m.setRecipe(assemblerWheelToChassis)
    m.speed = speed
    m.start()
    return m
  }

  it('speed=1, rng=0, two clean inputs → output is defective (roll-induced)', () => {
    // GIVEN
    const m = buildAssembler(1)
    m.addInput(createItem('wheel_small'))
    m.addInput(createItem('wheel_small'))

    // WHEN
    tickUntilOutput(m, constRng(0))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(true)
  })

  it('speed=1, rng=0.99, two clean inputs → output is clean', () => {
    // GIVEN
    const m = buildAssembler(1)
    m.addInput(createItem('wheel_small'))
    m.addInput(createItem('wheel_small'))

    // WHEN
    tickUntilOutput(m, constRng(0.99))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. Defect propagation through assembler (input → output)
// ---------------------------------------------------------------------------

describe('assembler propagates input defects', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  function buildAssembler(): Machine {
    const m = new Machine('asm', 'assembler', 4)
    m.setRecipe(assemblerWheelToChassis)
    m.speed = 1
    m.start()
    return m
  }

  it('one defective input + clean input, rng=0.99 → output is defective (propagated)', () => {
    // GIVEN
    const m = buildAssembler()
    const dirty = createItem('wheel_small')
    dirty.isDefective = true
    m.addInput(dirty)
    m.addInput(createItem('wheel_small'))

    // WHEN: rng=0.99 means no roll-induced defect; only propagation can flag it
    tickUntilOutput(m, constRng(0.99))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(true)
  })

  it('both inputs clean, rng=0.99 → output is clean (nothing to propagate, no roll)', () => {
    // GIVEN
    const m = buildAssembler()
    m.addInput(createItem('wheel_small'))
    m.addInput(createItem('wheel_small'))

    // WHEN
    tickUntilOutput(m, constRng(0.99))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 5. Painter rolls for defects by speed AND propagates input defects
//
// Requirement change (per explicit user instruction): the Painter now follows
// the SAME defect logic as Fabricator and Assembler:
//   1. If ANY consumed input was defective → output is defective (propagation;
//      no rng call needed).
//   2. Otherwise → defect iff `rng() < defectProbability(painter.speed)`.
// This supersedes the prior "painter does not roll" contract — the old
// `clean input, rng=0 → output is clean` test was intentionally removed.
// ---------------------------------------------------------------------------

describe('painter rolls for defects by speed and propagates input defects', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  function buildPainter(speed: number): Machine {
    const m = new Machine('paint', 'painter')
    m.setRecipe(painterChassisRecipe)
    m.speed = speed
    m.start()
    return m
  }

  it('defective input, rng=0.99 → output is defective (propagation wins; no roll needed)', () => {
    // GIVEN
    const m = buildPainter(1)
    const dirty = createItem('chassis_light')
    dirty.isDefective = true
    m.addInput(dirty)

    // WHEN: rng=0.99 means a roll alone could not produce a defect; only
    // propagation can flag the output.
    tickUntilOutput(m, constRng(0.99))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(true)
  })

  it('clean input at speed=1, rng=0 → output is defective (roll fires below 0.02)', () => {
    // GIVEN
    const m = buildPainter(1)
    m.addInput(createItem('chassis_light'))

    // WHEN: 0 < 0.02 → defect
    tickUntilOutput(m, constRng(0))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(true)
  })

  it('clean input at speed=1, rng=0.5 → output is clean (0.5 > 0.02)', () => {
    // GIVEN
    const m = buildPainter(1)
    m.addInput(createItem('chassis_light'))

    // WHEN
    tickUntilOutput(m, constRng(0.5))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(false)
  })

  it('clean input at speed=10, rng=0.34 → output is defective (0.34 < 0.35)', () => {
    // GIVEN
    const m = buildPainter(10)
    m.addInput(createItem('chassis_light'))

    // WHEN
    tickUntilOutput(m, constRng(0.34))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(true)
  })

  it('clean input at speed=10, rng=0.36 → output is clean (0.36 > 0.35)', () => {
    // GIVEN
    const m = buildPainter(10)
    m.addInput(createItem('chassis_light'))

    // WHEN
    tickUntilOutput(m, constRng(0.36))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 6. Recycler does NOT produce defective items
// ---------------------------------------------------------------------------

describe('recycler always produces clean raw_material', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('defective input, rng=0 → recycler output (raw_material) is clean', () => {
    // GIVEN
    const m = new Machine('rec', 'recycler')
    m.speed = 1
    m.start()
    const dirty = createItem('wheel_small')
    dirty.isDefective = true
    m.addInput(dirty)

    // WHEN: rng=0 would force a defect if recycler rolled. It must not.
    tickUntilOutput(m, constRng(0))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.type).toBe('raw_material')
    expect(m.outputSlot!.isDefective).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 7. Splitter passes items through unchanged
// ---------------------------------------------------------------------------

describe('pass-through machines preserve isDefective', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('splitter forwards a defective item with isDefective intact', () => {
    // GIVEN — Step 1 of the splitter migration: routing is decided by
    //         the persistent `outputSidesConfig` bitfield, not by an
    //         event-handler bridge. Forward-only (bit 2) routes the
    //         item deterministically to the primary output slot so
    //         `tickUntilOutput` (which polls `outputSlot`) terminates.
    const m = new Machine('sp', 'splitter')
    m.outputSidesConfig = 2 // Forward only → primary
    m.start()
    const dirty = createItem('wheel_small')
    dirty.isDefective = true
    m.addInput(dirty)

    // WHEN
    tickUntilOutput(m, constRng(0))

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.isDefective).toBe(true)
    expect(m.outputSlot!.id).toBe(dirty.id)
  })
})

// ---------------------------------------------------------------------------
// 8. Determinism across two Simulation instances with the same seeded RNG
// ---------------------------------------------------------------------------

describe('determinism with seeded RNG', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  function buildSeededSim(seed: number): { sim: Simulation; m: Machine } {
    const sim = createSimulation(10, mulberry32(seed))
    const m = new Machine('fab', 'part_fabricator')
    m.setRecipe(getRecipeById('wheel_press_small')!)
    m.speed = 5 // mid-range so p ≈ 0.18 → mix of clean and defective expected
    m.start()
    sim.addMachine(m)
    return { sim, m }
  }

  it('two simulations with the same seed produce identical defect sequences', () => {
    // GIVEN
    const a = buildSeededSim(42)
    const b = buildSeededSim(42)

    // WHEN
    const seqA = collectDefectSequence(a.sim, a.m, 20)
    const seqB = collectDefectSequence(b.sim, b.m, 20)

    // THEN
    expect(seqA).toHaveLength(20)
    expect(seqB).toHaveLength(20)
    expect(seqA).toEqual(seqB)

    // Sanity: the sequence must be non-trivial. If isDefective were never set
    // (current behavior), every entry would be `false` and the sequence
    // wouldn't exercise the rng — making the equality assertion vacuous.
    // We require at least one defect to confirm the rng is actually consulted.
    expect(seqA.some((d) => d === true)).toBe(true)
  })
})
