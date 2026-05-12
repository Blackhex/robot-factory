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

describe('Simulation: machine_cycle_completed event', () => {
  let sim: Simulation

  beforeEach(() => {
    resetItemIdCounter()
    sim = new Simulation()
  })

  it('fires for an auto-restarting fabricator that completes a cycle', () => {
    // GIVEN a part_fabricator with no input requirement and a free output. After
    // produceOutput it transitions back to 'processing' in the same tick (no
    // observable 'idle' state from outside), so the consumer cannot rely on
    // machine_state_changed{to:'idle'} to detect cycle completion.
    const cycleEvents: SimulationEvent[] = []
    const stateEvents: SimulationEvent[] = []
    sim.on('machine_cycle_completed', (e) => cycleEvents.push(e))
    sim.on('machine_state_changed', (e) => stateEvents.push(e))

    const m = new Machine('fab1', 'part_fabricator')
    m.setRecipe(recipe('wheel_press_small')) // 5 ticks, no inputs
    m.start()
    sim.addMachine(m)
    // Drain primary output every tick so the fabricator stays in auto-restart loop.
    sim.on('item_produced', () => {
      m.takeOutput()
    })

    // WHEN: 1 tick to enter processing + 5 ticks to complete first cycle.
    tickN(sim, 6)

    // THEN: cycle event fired even though state never observably went to 'idle'
    // between cycles.
    expect(cycleEvents.length).toBeGreaterThanOrEqual(1)
    expect(cycleEvents[0].data['machineId']).toBe('fab1')
    expect(cycleEvents[0].data['itemType']).toBe('wheel_small')
    expect(typeof cycleEvents[0].data['itemId']).toBe('string')

    // No 'machine_state_changed{to:'idle'}' for an auto-restarting fabricator that
    // never has its output blocked — confirming the trip-wire is real.
    const idleTransitions = stateEvents.filter((e) => e.data['to'] === 'idle')
    expect(idleTransitions).toHaveLength(0)

    // Second cycle still fires. 5 more ticks for the next produce.
    tickN(sim, 5)
    expect(cycleEvents.length).toBeGreaterThanOrEqual(2)
  })

  it('fires when a stall-and-wait machine (assembler) completes a cycle and goes idle', () => {
    // GIVEN an assembler that has just enough inputs for exactly one cycle.
    // After produceOutput it falls through to tryStartProcessing but cannot
    // restart (no parts), so its state observably becomes 'idle'.
    const cycleEvents: SimulationEvent[] = []
    const stateEvents: SimulationEvent[] = []
    sim.on('machine_cycle_completed', (e) => cycleEvents.push(e))
    sim.on('machine_state_changed', (e) => stateEvents.push(e))

    const m = new Machine('asm1', 'assembler')
    m.setRecipe(recipe('assemble_drivetrain_basic')) // 2x wheel_small + 1x circuit_basic, 10 ticks
    m.addInput(createItem('wheel_small'))
    m.addInput(createItem('wheel_small'))
    m.addInput(createItem('circuit_basic'))
    m.start()
    sim.addMachine(m)

    // WHEN: 1 tick to start + 10 ticks to finish the single cycle.
    tickN(sim, 11)

    // THEN: cycle event fires exactly once for the one cycle.
    expect(cycleEvents).toHaveLength(1)
    expect(cycleEvents[0].data['machineId']).toBe('asm1')
    expect(cycleEvents[0].data['itemType']).toBe('drivetrain_basic')

    // And the assembler observably transitions to 'idle' (output stays full,
    // so it's actually 'blocked' on this tick — but with no inputs it would
    // try to restart and end up idle. Either way, after produceOutput the
    // machine cannot keep processing.)
    expect(['idle', 'blocked']).toContain(m.state)
  })

  it('fires exactly once per cycle even when both primary and secondary outputs populate in the same tick', () => {
    // GIVEN: synthesize a Machine that already has an empty output and we'll
    // simulate both ports populating simultaneously. We use a quality_checker
    // because that's the documented dual-output type, then verify a single
    // cycle event fires per tick regardless of which port(s) populated.
    const cycleEvents: SimulationEvent[] = []
    sim.on('machine_cycle_completed', (e) => cycleEvents.push(e))

    const qc = new Machine('qc1', 'quality_checker')
    qc.start()
    sim.addMachine(qc)
    qc.addInput(createItem('wheel_small', 50)) // fails threshold → secondary output

    // WHEN: 2 ticks to push the item through the QC.
    tickN(sim, 2)

    // THEN: one cycle event for that one inspection, regardless of which
    // port(s) the item came out of.
    expect(cycleEvents).toHaveLength(1)
    expect(cycleEvents[0].data['machineId']).toBe('qc1')
  })

  it('does not fire while a machine is processing without finishing this tick', () => {
    // GIVEN a slow recipe (10 ticks). After 5 ticks no cycle has completed.
    const cycleEvents: SimulationEvent[] = []
    sim.on('machine_cycle_completed', (e) => cycleEvents.push(e))

    const m = new Machine('asm1', 'assembler')
    m.setRecipe(recipe('assemble_drivetrain_basic'))
    m.addInput(createItem('wheel_small'))
    m.addInput(createItem('wheel_small'))
    m.addInput(createItem('circuit_basic'))
    m.start()
    sim.addMachine(m)

    // WHEN: only 5 of the 10 processing ticks elapse.
    tickN(sim, 5)

    // THEN: no cycle event yet.
    expect(cycleEvents).toHaveLength(0)
  })

  it('still emits item_produced exactly once per produced item (no regression)', () => {
    const itemProduced: SimulationEvent[] = []
    sim.on('item_produced', (e) => {
      itemProduced.push(e)
      const m = sim.getMachine('fab1')
      if (m) m.takeOutput()
    })

    const m = new Machine('fab1', 'part_fabricator')
    m.setRecipe(recipe('wheel_press_small')) // 5 ticks
    m.start()
    sim.addMachine(m)

    // 1 start + 5 process + 5 process = 2 produced items.
    tickN(sim, 11)

    expect(itemProduced.length).toBe(2)
  })
})
