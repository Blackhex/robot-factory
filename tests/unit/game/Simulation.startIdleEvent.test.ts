import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { getRecipeById } from '../../../src/game/Recipe'
import { Simulation } from '../../../src/game/Simulation'
import type { Recipe } from '../../../src/game/Recipe'
import type { SimulationEvent } from '../../../src/game/types'

function tickN(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) sim.tick()
}

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

describe('Simulation: synthetic machine_cycle_completed for stuck-idle freshly-started machine', () => {
  let sim: Simulation

  beforeEach(() => {
    resetItemIdCounter()
    sim = new Simulation()
  })

  it('emits machine_cycle_completed when an assembler is started with no inputs and stays idle', () => {
    // GIVEN: an assembler with a recipe but zero inputs. tickDefault returns
    // early (hasRequiredInputs is false), so without the synthetic emission
    // an "on machine idle" handler would never fire.
    const cycleEvents: SimulationEvent[] = []
    sim.on('machine_cycle_completed', (e) => cycleEvents.push(e))

    const m = new Machine('asm1', 'assembler')
    m.setRecipe(recipe('assemble_drivetrain_basic'))
    m.start()
    sim.addMachine(m)

    // WHEN: one tick after the explicit start.
    sim.tick()

    // THEN: exactly one synthetic cycle event for this machine, and the
    // machine is still idle.
    expect(cycleEvents).toHaveLength(1)
    expect(cycleEvents[0].data['machineId']).toBe('asm1')
    expect(m.state).toBe('idle')
    expect(m.enabled).toBe(true)
  })

  it('emits even without a recipe set (a quality_checker / splitter / recycler started with no inputs)', () => {
    const cycleEvents: SimulationEvent[] = []
    sim.on('machine_cycle_completed', (e) => cycleEvents.push(e))

    const qc = new Machine('qc1', 'quality_checker')
    qc.start()
    sim.addMachine(qc)

    sim.tick()

    expect(cycleEvents).toHaveLength(1)
    expect(cycleEvents[0].data['machineId']).toBe('qc1')
  })

  it('does NOT re-emit on subsequent ticks while the machine remains stuck idle', () => {
    // Avoids 10×/sec spam to "on machine idle" handlers.
    const cycleEvents: SimulationEvent[] = []
    sim.on('machine_cycle_completed', (e) => cycleEvents.push(e))

    const m = new Machine('asm1', 'assembler')
    m.setRecipe(recipe('assemble_drivetrain_basic'))
    m.start()
    sim.addMachine(m)

    tickN(sim, 50)

    expect(cycleEvents).toHaveLength(1)
  })

  it('does NOT re-emit when start() is called on an already-enabled machine', () => {
    const cycleEvents: SimulationEvent[] = []
    sim.on('machine_cycle_completed', (e) => cycleEvents.push(e))

    const m = new Machine('asm1', 'assembler')
    m.setRecipe(recipe('assemble_drivetrain_basic'))
    m.start()
    sim.addMachine(m)

    sim.tick() // emits the initial synthetic event
    expect(cycleEvents).toHaveLength(1)

    // Calling start() again is a no-op (machine already enabled).
    m.start()
    tickN(sim, 5)

    expect(cycleEvents).toHaveLength(1)
  })

  it('re-arms after stop() then start() (a stop/start cycle fires the event again)', () => {
    const cycleEvents: SimulationEvent[] = []
    sim.on('machine_cycle_completed', (e) => cycleEvents.push(e))

    const m = new Machine('asm1', 'assembler')
    m.setRecipe(recipe('assemble_drivetrain_basic'))
    m.start()
    sim.addMachine(m)

    sim.tick()
    expect(cycleEvents).toHaveLength(1)

    m.stop()
    tickN(sim, 3) // disabled machine ticks a no-op
    expect(cycleEvents).toHaveLength(1)

    m.start()
    sim.tick()

    expect(cycleEvents).toHaveLength(2)
    expect(cycleEvents[1].data['machineId']).toBe('asm1')
  })

  it('does NOT spuriously synth-emit for a fabricator that begins processing in the same tick as start()', () => {
    // Acceptance criterion #5: fabricator with no inputs immediately
    // transitions idle → processing on the first tick after start. The
    // synthetic emission must be suppressed because a real cycle will
    // produce its own machine_cycle_completed when the recipe completes.
    const cycleEvents: SimulationEvent[] = []
    sim.on('machine_cycle_completed', (e) => cycleEvents.push(e))

    const m = new Machine('fab1', 'part_fabricator')
    m.setRecipe(recipe('wheel_press_small')) // 5 ticks, no inputs
    m.start()
    sim.addMachine(m)

    // Tick 1: machine.tick() flips state idle → processing. Synthetic
    // emission must be suppressed.
    sim.tick()

    expect(cycleEvents).toHaveLength(0)
    expect(m.state).toBe('processing')
  })

  it('does NOT double-emit when the machine completes a real cycle later', () => {
    // An assembler that starts with full inputs goes idle → processing on
    // tick 1 (no synthetic emit) and emits a single real cycle event when
    // it finishes.
    const cycleEvents: SimulationEvent[] = []
    sim.on('machine_cycle_completed', (e) => cycleEvents.push(e))

    const m = new Machine('asm1', 'assembler')
    m.setRecipe(recipe('assemble_drivetrain_basic')) // 10 ticks
    m.addInput(createItem('wheel_small'))
    m.addInput(createItem('wheel_small'))
    m.addInput(createItem('circuit_basic'))
    m.start()
    sim.addMachine(m)

    tickN(sim, 11) // 1 tick to start + 10 to complete

    expect(cycleEvents).toHaveLength(1)
    expect(cycleEvents[0].data['itemType']).toBe('drivetrain_basic')
  })

  it('synth event has machineId but no itemId/itemType (no real item produced)', () => {
    const cycleEvents: SimulationEvent[] = []
    sim.on('machine_cycle_completed', (e) => cycleEvents.push(e))

    const m = new Machine('asm1', 'assembler')
    m.setRecipe(recipe('assemble_drivetrain_basic'))
    m.start()
    sim.addMachine(m)

    sim.tick()

    expect(cycleEvents).toHaveLength(1)
    expect(cycleEvents[0].data['machineId']).toBe('asm1')
    expect(cycleEvents[0].data['itemId']).toBeUndefined()
    expect(cycleEvents[0].data['itemType']).toBeUndefined()
  })

  it('also fires when started via the START_MACHINE command pathway', () => {
    // Verifies the fix isn't bypassed when the start originates from the
    // BlockInterpreter's command queue rather than a direct machine.start().
    const cycleEvents: SimulationEvent[] = []
    sim.on('machine_cycle_completed', (e) => cycleEvents.push(e))

    const m = new Machine('asm1', 'assembler')
    m.setRecipe(recipe('assemble_drivetrain_basic'))
    sim.addMachine(m)
    expect(m.enabled).toBe(false)

    sim.enqueueCommand({ type: 'START_MACHINE', machineId: 'asm1' })
    sim.tick() // dispatches START_MACHINE then runs updateMachines

    expect(m.enabled).toBe(true)
    expect(cycleEvents).toHaveLength(1)
    expect(cycleEvents[0].data['machineId']).toBe('asm1')
  })
})
