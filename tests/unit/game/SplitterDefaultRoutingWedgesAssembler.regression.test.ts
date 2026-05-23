/**
 * Regression — Splitter's default round-robin routing parks items
 * into UNCONNECTED output sides and permanently wedges, back-pressuring
 * the upstream Assembler.
 *
 * User-reported symptom: "when parts from Fabricators arrive at
 * Assembler, the production stucks." Reproducer mirrors the
 * `projects/Assembly.json` sandbox: fabricators → assembler →
 * splitter → factory_output, with only the splitter's FRONT side
 * connected by a belt (the other two sides are orphan output slots
 * with no downstream belt).
 *
 * Pre-regression behavior (before the Splitter E1-E5 refactor): a
 * splitter with no explicit `splitterCondition` routed every item to
 * `primary` (= front). Items always flowed to the one connected belt
 * and the splitter never wedged.
 *
 * Current HEAD (regression): the splitter's default
 * `outputSidesConfig = SPLITTER_ALL_SIDES_BITS` causes
 * `tickSplitter` to round-robin across LEFT → FORWARD → RIGHT, even
 * though LEFT (tertiary) and RIGHT (secondary) have no downstream
 * belt. After three successful parks the orphan slots are filled.
 * The next attempt to route to LEFT (tertiary) finds the slot
 * occupied, sets `state='blocked'`, and returns WITHOUT advancing
 * `routingCounter`. From this point on the splitter is permanently
 * wedged on the orphan side, its `inputSlots` saturate at the
 * machine's input capacity, and the assembler upstream eventually
 * fills its output and stops producing.
 *
 * The `ItemDeliveryEngine`'s belt-to-belt handover happens to mask
 * the symptom for the *primary* lane (items can skip the splitter
 * when its input is full) but the splitter's own routing is
 * genuinely broken: every item that would have been routed by the
 * splitter is either stranded in an orphan output slot or queued
 * indefinitely in the splitter's input.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Simulation } from '../../../src/game/Simulation'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { resetItemIdCounter } from '../../../src/game/Item'
import { getRecipeById, type Recipe } from '../../../src/game/Recipe'

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

function tickN(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) sim.tick()
}

function setup(sim: Simulation): {
  fabWheel1: Machine
  fabWheel2: Machine
  fabCircuit: Machine
  assembler: Machine
  splitter: Machine
  shipper: Machine
} {
  const fabWheel1 = new Machine('fab_wheel_1', 'part_fabricator')
  fabWheel1.setRecipe(recipe('wheel_press_small'))
  fabWheel1.start()
  const fabWheel2 = new Machine('fab_wheel_2', 'part_fabricator')
  fabWheel2.setRecipe(recipe('wheel_press_small'))
  fabWheel2.start()
  const fabCircuit = new Machine('fab_circuit', 'part_fabricator')
  fabCircuit.setRecipe(recipe('circuit_printer_basic'))
  fabCircuit.start()

  const assembler = new Machine('assembler', 'assembler')
  assembler.setRecipe(recipe('assemble_drivetrain_basic'))
  assembler.start()

  // Splitter with NO routing configuration (default = all sides). Only
  // the FRONT output is wired downstream; LEFT and RIGHT are orphans.
  const splitter = new Machine('splitter', 'splitter')
  splitter.start()

  const shipper = new Machine('shipper', 'factory_output')
  shipper.start()

  for (const m of [fabWheel1, fabWheel2, fabCircuit, assembler, splitter, shipper]) {
    sim.addMachine(m)
  }

  sim.setMachinePosition('fab_wheel_1', 0, 5)
  sim.setMachinePosition('fab_wheel_2', 5, 0)
  sim.setMachinePosition('fab_circuit', 10, 5)
  sim.setMachinePosition('assembler', 5, 5)
  sim.setMachinePosition('splitter', 5, 7)
  sim.setMachinePosition('shipper', 5, 9)

  // Fab1 (wheel) → Assembler along z=5
  for (let x = 0; x < 5; x++) {
    sim.addBelt(new ConveyorBelt(`b_w1_${x}`, x, 5, x + 1, 5, 1.0))
  }
  sim.setMachineOutputBelt('fab_wheel_1', 'b_w1_0')

  // Fab2 (wheel) → Assembler along x=5
  for (let z = 0; z < 5; z++) {
    sim.addBelt(new ConveyorBelt(`b_w2_${z}`, 5, z, 5, z + 1, 1.0))
  }
  sim.setMachineOutputBelt('fab_wheel_2', 'b_w2_0')

  // Fab3 (circuit) → Assembler along z=5 from the right
  for (let i = 0; i < 5; i++) {
    sim.addBelt(new ConveyorBelt(`b_c_${i}`, 10 - i, 5, 9 - i, 5, 1.0))
  }
  sim.setMachineOutputBelt('fab_circuit', 'b_c_0')

  // Assembler → Splitter
  sim.addBelt(new ConveyorBelt('b_as_0', 5, 5, 5, 6, 1.0))
  sim.addBelt(new ConveyorBelt('b_as_1', 5, 6, 5, 7, 1.0))
  sim.setMachineOutputBelt('assembler', 'b_as_0')

  // Splitter → Shipper — ONLY the FRONT (primary) port is wired.
  sim.addBelt(new ConveyorBelt('b_sp_0', 5, 7, 5, 8, 1.0))
  sim.addBelt(new ConveyorBelt('b_sp_1', 5, 8, 5, 9, 1.0))
  sim.setMachineOutputBelt('splitter', 'b_sp_0', 'primary')

  return { fabWheel1, fabWheel2, fabCircuit, assembler, splitter, shipper }
}

describe('Regression: Splitter default routing must not wedge on orphan output sides', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('splitter routing keeps progressing even when only one side has a belt', () => {
    const sim = new Simulation()
    const { splitter } = setup(sim)

    tickN(sim, 600)

    expect(sim.gameOver).toBeNull()

    // The splitter must NOT be permanently blocked. With a healthy
    // routing strategy (skip sides with no downstream belt, or default
    // to the single connected side) the splitter is either `idle` or
    // briefly `processing`, never wedged in `blocked` after 600 ticks
    // of throughput.
    expect(splitter.state).not.toBe('blocked')

    // The splitter must NOT have items piled in its input queue. Any
    // input it receives should be routed within a few ticks. A
    // saturated input is the visible "stuck" symptom.
    expect(splitter.inputSlots.length).toBeLessThanOrEqual(1)

    // Orphan output slots (secondary / tertiary) must never have items
    // parked into them, because no belt can drain those slots. The
    // splitter's routing strategy must skip sides without a connected
    // downstream belt.
    expect(splitter.secondaryOutputSlot).toBeNull()
    expect(splitter.tertiaryOutputSlot).toBeNull()
  })

  it('assembler is not back-pressured into a permanent stall by the splitter', () => {
    const sim = new Simulation()
    const { assembler, shipper } = setup(sim)

    tickN(sim, 600)

    expect(sim.gameOver).toBeNull()

    // The assembler must not be left wedged with a full batch sitting
    // in its inputs — that is the user-visible "production stucks"
    // signature.
    const r = assembler.currentRecipe!
    const tally = new Map<string, number>()
    for (const item of assembler.inputSlots) {
      tally.set(item.type, (tally.get(item.type) ?? 0) + 1)
    }
    const hasFullBatch = r.inputs.every(
      (input) => (tally.get(input.type) ?? 0) >= input.quantity,
    )
    const wedgedIdle = assembler.state === 'idle' && hasFullBatch
    expect(wedgedIdle).toBe(false)

    // End-to-end throughput sanity: at assembler speed=1 over 600
    // ticks the shipper should keep receiving items. The current
    // belt-handover fallback still lets items reach the shipper, but
    // any future change that tightens the splitter contract must not
    // strand all items.
    expect(shipper.consumedItems).toBeGreaterThan(0)
  })
})
