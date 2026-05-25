import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ALL_OUTPUTS_CONNECTED_ENV } from '../../../src/game/MachineBehaviors'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'
import { Simulation } from '../../../src/game/Simulation'

/**
 * Forward-declare the future API that this RED test file pins down.
 * The production `Machine` class does NOT yet expose `enabled`, `start()`,
 * or `stop()` — accessing them at runtime yields `undefined` / `TypeError`,
 * which is the intended RED-step failure mode. This module augmentation
 * exists only so the test file type-checks; once the GREEN step adds the
 * real members, the augmentation is structurally compatible and harmless.
 */
declare module '../../../src/game/Machine' {
  interface Machine {
    enabled: boolean
    start(): void
    stop(): void
  }
}

// --- Helpers ---

function wheelPressRecipe(): Recipe {
  const recipe = getRecipeById('wheel_press_small')
  if (!recipe) throw new Error('wheel_press_small recipe not found')
  return recipe // 5 ticks, no inputs, output: wheel_small
}

/**
 * "Many" ticks for a machine to confirm a disabled machine does NOT progress.
 * Far larger than any recipe's processingTicks so a missed gate would
 * definitely have produced output by now.
 */
const DISABLED_TICK_COUNT = 50

// =============================================================================
// 1. Default enabled state
// =============================================================================
describe('Machine.enabled — default value', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('newly constructed Machine has enabled === false', () => {
    // GIVEN
    const m = new Machine('m1', 'part_fabricator')

    // THEN
    expect(m.enabled).toBe(false)
  })

  it('every non-output MachineType defaults to enabled === false', () => {
    // GIVEN / THEN
    expect(new Machine('a', 'part_fabricator').enabled).toBe(false)
    expect(new Machine('b', 'assembler').enabled).toBe(false)
    expect(new Machine('c', 'painter').enabled).toBe(false)
    expect(new Machine('e', 'splitter').enabled).toBe(false)
    expect(new Machine('f', 'recycler').enabled).toBe(false)
    expect(new Machine('g', 'factory_output').enabled).toBe(false)
  })
})

// =============================================================================
// 2. start() / stop() methods toggle the flag without touching recipe
// =============================================================================
describe('Machine.start() / Machine.stop()', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('start() sets enabled to true', () => {
    // GIVEN
    const m = new Machine('m1', 'part_fabricator')
    expect(m.enabled).toBe(false)

    // WHEN
    m.start()

    // THEN
    expect(m.enabled).toBe(true)
  })

  it('stop() sets enabled to false', () => {
    // GIVEN
    const m = new Machine('m1', 'part_fabricator')
    m.start()
    expect(m.enabled).toBe(true)

    // WHEN
    m.stop()

    // THEN
    expect(m.enabled).toBe(false)
  })

  it('start() does NOT mutate currentRecipe', () => {
    // GIVEN
    const m = new Machine('m1', 'part_fabricator')
    const recipe = wheelPressRecipe()
    m.setRecipe(recipe)

    // WHEN
    m.start()

    // THEN
    expect(m.currentRecipe).toBe(recipe)
  })

  it('stop() does NOT mutate currentRecipe', () => {
    // GIVEN
    const m = new Machine('m1', 'part_fabricator')
    const recipe = wheelPressRecipe()
    m.setRecipe(recipe)
    m.start()

    // WHEN
    m.stop()

    // THEN — recipe must still be set (regression guard for current destructive bug)
    expect(m.currentRecipe).toBe(recipe)
  })

  it('start()/stop() on a machine with no recipe does not throw and leaves recipe null', () => {
    // GIVEN
    const m = new Machine('m1', 'part_fabricator')

    // WHEN / THEN
    expect(() => m.start()).not.toThrow()
    expect(m.currentRecipe).toBeNull()
    expect(() => m.stop()).not.toThrow()
    expect(m.currentRecipe).toBeNull()
  })
})

// =============================================================================
// 3. Disabled machine never processes (part_fabricator / assembler / painter)
// =============================================================================
describe('Machine.tick() — disabled machine never processes', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('disabled part_fabricator with a recipe stays idle and produces nothing', () => {
    // GIVEN
    const m = new Machine('pf1', 'part_fabricator')
    const recipe = wheelPressRecipe() // no inputs, would auto-start when enabled
    m.setRecipe(recipe)
    expect(m.enabled).toBe(false)

    // WHEN — tick many more times than processingTicks
    for (let i = 0; i < DISABLED_TICK_COUNT; i++) {
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
    }

    // THEN — no progress whatsoever, recipe preserved
    expect(m.state).toBe('idle')
    expect(m.processingTimer).toBe(0)
    expect(m.outputSlot).toBeNull()
    expect(m.currentRecipe).toBe(recipe)
  })

  it('disabled assembler with full inputs stays idle, does not consume them', () => {
    // GIVEN
    const m = new Machine('asm1', 'assembler')
    const recipe = getRecipeById('assemble_drivetrain_basic')!
    m.setRecipe(recipe)
    m.addInput(createItem('wheel_small'))
    m.addInput(createItem('wheel_small'))
    m.addInput(createItem('circuit_basic'))
    expect(m.enabled).toBe(false)
    const inputCountBefore = m.inputSlots.length

    // WHEN
    for (let i = 0; i < DISABLED_TICK_COUNT; i++) {
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
    }

    // THEN — inputs untouched, no output
    expect(m.state).toBe('idle')
    expect(m.processingTimer).toBe(0)
    expect(m.outputSlot).toBeNull()
    expect(m.inputSlots.length).toBe(inputCountBefore)
  })

  it('disabled painter with required input stays idle and produces nothing', () => {
    // GIVEN
    const m = new Machine('pt1', 'painter')
    // Find any painter recipe with at least one input
    const recipe: Recipe = {
      id: 'test_paint',
      inputs: [{ type: 'chassis_light', quantity: 1 }],
      outputs: [{ type: 'chassis_light', quantity: 1 }],
      processingTicks: 3,
      machineType: 'painter',
    }
    m.setRecipe(recipe)
    m.addInput(createItem('chassis_light'))
    expect(m.enabled).toBe(false)

    // WHEN
    for (let i = 0; i < DISABLED_TICK_COUNT; i++) {
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
    }

    // THEN
    expect(m.state).toBe('idle')
    expect(m.outputSlot).toBeNull()
    expect(m.inputSlots.length).toBe(1)
  })
})

// =============================================================================
// 4. Enabled machine processes as before
// =============================================================================
describe('Machine.tick() — enabled machine processes normally', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('enabled part_fabricator produces output after processingTicks', () => {
    // GIVEN
    const m = new Machine('pf1', 'part_fabricator')
    m.setRecipe(wheelPressRecipe()) // 5 processing ticks, no inputs
    m.start()
    expect(m.enabled).toBe(true)

    // WHEN — 1 tick to start + 5 to process = 6
    for (let i = 0; i < 6; i++) {
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
    }

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.type).toBe('wheel_small')
  })
})

// =============================================================================
// 5. STOP_MACHINE command does NOT clear the recipe (regression)
// =============================================================================
describe('SimulationCommandDispatcher — STOP_MACHINE preserves recipe', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('STOP_MACHINE leaves currentRecipe intact and sets enabled = false', () => {
    // GIVEN
    const sim = new Simulation()
    const m = new Machine('m1', 'part_fabricator')
    const recipe = wheelPressRecipe()
    m.setRecipe(recipe)
    m.start()
    sim.addMachine(m)
    expect(m.enabled).toBe(true)
    expect(m.currentRecipe).toBe(recipe)

    // WHEN
    sim.enqueueCommand({ type: 'STOP_MACHINE', machineId: 'm1' })
    sim.tick()

    // THEN — recipe preserved, enabled flipped off
    expect(m.currentRecipe).toBe(recipe)
    expect(m.enabled).toBe(false)
  })
})

// =============================================================================
// 6. START_MACHINE command sets enabled true
// =============================================================================
describe('SimulationCommandDispatcher — START_MACHINE enables machine', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('START_MACHINE flips enabled from false to true', () => {
    // GIVEN
    const sim = new Simulation()
    const m = new Machine('m1', 'part_fabricator')
    m.setRecipe(wheelPressRecipe())
    sim.addMachine(m)
    expect(m.enabled).toBe(false)

    // WHEN
    sim.enqueueCommand({ type: 'START_MACHINE', machineId: 'm1' })
    sim.tick()

    // THEN
    expect(m.enabled).toBe(true)
  })

  it('START_MACHINE does not modify currentRecipe', () => {
    // GIVEN
    const sim = new Simulation()
    const m = new Machine('m1', 'part_fabricator')
    const recipe = wheelPressRecipe()
    m.setRecipe(recipe)
    sim.addMachine(m)

    // WHEN
    sim.enqueueCommand({ type: 'START_MACHINE', machineId: 'm1' })
    sim.tick()

    // THEN
    expect(m.currentRecipe).toBe(recipe)
  })
})

// =============================================================================
// 7. Round-trip start → stop → start
// =============================================================================
describe('Machine — round-trip start → stop → start', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('STOP mid-processing freezes the machine; START resumes production', () => {
    // GIVEN
    const sim = new Simulation()
    const m = new Machine('m1', 'part_fabricator')
    m.setRecipe(wheelPressRecipe()) // 5 processing ticks, no inputs
    sim.addMachine(m)
    sim.enqueueCommand({ type: 'START_MACHINE', machineId: 'm1' })

    // Tick once to drain the START command and begin processing.
    sim.tick()
    // Tick a couple more times so we are partway through the recipe.
    sim.tick()
    sim.tick()
    expect(m.outputSlot).toBeNull()
    expect(m.enabled).toBe(true)

    const frozenTimer = m.processingTimer
    const frozenState = m.state

    // WHEN — stop the machine.
    sim.enqueueCommand({ type: 'STOP_MACHINE', machineId: 'm1' })
    sim.tick()
    expect(m.enabled).toBe(false)

    // Tick way more than enough to finish the recipe.
    for (let i = 0; i < DISABLED_TICK_COUNT; i++) {
      sim.tick()
    }

    // THEN — processingTimer never decremented, no output produced
    expect(m.processingTimer).toBe(frozenTimer)
    expect(m.state).toBe(frozenState)
    expect(m.outputSlot).toBeNull()

    // WHEN — re-start the machine
    sim.enqueueCommand({ type: 'START_MACHINE', machineId: 'm1' })
    // Enough ticks to definitely finish a 5-tick recipe (with command-tick + restart spin).
    for (let i = 0; i < 20; i++) {
      sim.tick()
    }

    // THEN — output produced after resume
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.type).toBe('wheel_small')
  })
})

// =============================================================================
// 8. clearRuntimeState() resets enabled to false
// =============================================================================
describe('Machine.clearRuntimeState() — enabled flag', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('clearRuntimeState() resets enabled to false while preserving recipe', () => {
    // GIVEN
    const m = new Machine('m1', 'part_fabricator')
    const recipe = wheelPressRecipe()
    m.setRecipe(recipe)
    m.start()
    expect(m.enabled).toBe(true)

    // WHEN
    m.clearRuntimeState()

    // THEN
    expect(m.enabled).toBe(false)
    expect(m.currentRecipe).toBe(recipe)
  })
})

// =============================================================================
// 9. Restart flow disables machines (Simulation.clearInFlight)
// =============================================================================
describe('Simulation.clearInFlight() — disables machines', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('clearInFlight() resets enabled to false on every machine, recipe preserved', () => {
    // GIVEN
    const sim = new Simulation()
    const m1 = new Machine('m1', 'part_fabricator')
    const m2 = new Machine('m2', 'assembler')
    const r1 = wheelPressRecipe()
    const r2 = getRecipeById('assemble_drivetrain_basic')!
    m1.setRecipe(r1)
    m2.setRecipe(r2)
    m1.start()
    m2.start()
    sim.addMachine(m1)
    sim.addMachine(m2)
    expect(m1.enabled).toBe(true)
    expect(m2.enabled).toBe(true)

    // WHEN
    sim.clearInFlight()

    // THEN — both disabled, recipes still set
    expect(m1.enabled).toBe(false)
    expect(m2.enabled).toBe(false)
    expect(m1.currentRecipe).toBe(r1)
    expect(m2.currentRecipe).toBe(r2)
  })
})

// =============================================================================
// 11. Disabled splitter / recycler / factory_output are gated.
// =============================================================================
describe('Machine.tick() — non-default machine types respect enabled', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('disabled splitter does not move input to outputSlot', () => {
    // GIVEN
    const sp = new Machine('sp1', 'splitter')
    sp.addInput(createItem('wheel_small'))
    expect(sp.enabled).toBe(false)

    // WHEN
    for (let i = 0; i < DISABLED_TICK_COUNT; i++) {
      sp.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
    }

    // THEN
    expect(sp.inputSlots.length).toBe(1)
    expect(sp.outputSlot).toBeNull()
    expect(sp.secondaryOutputSlot).toBeNull()
    expect(sp.state).toBe('idle')
  })

  it('disabled factory_output does not consume inputs while enabled is false', () => {
    // GIVEN — Shipper defaults to enabled === false and must no longer act
    // as a passive sink when items are pushed into it directly.
    const shipper = new Machine('out1', 'factory_output')
    expect(shipper.enabled).toBe(false)

    // WHEN — attempt to deliver three items while disabled.
    expect(shipper.addInput(createItem('robot_explorer'))).toBe(false)
    expect(shipper.addInput(createItem('robot_explorer'))).toBe(false)
    expect(shipper.addInput(createItem('robot_explorer'))).toBe(false)

    // Tick a few times — the machine must remain inert while disabled.
    for (let i = 0; i < 5; i++) {
      shipper.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
    }

    // THEN — nothing consumed while disabled.
    expect(shipper.consumedItems).toBe(0)
  })
})
