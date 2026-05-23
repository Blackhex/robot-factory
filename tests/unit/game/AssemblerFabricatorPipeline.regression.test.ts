/**
 * Regression — Fabricator(s) → Assembler stalls after a small number
 * of cycles, even though every machine is enabled, every belt has
 * room, and every consumed input has an upstream producer.
 *
 * Pure-simulation reproduction (no PXT editor, no item-arrival bridge):
 * three fabricators each producing a part the assembler needs, and a
 * shipper draining the assembler's output. The expectation is that
 * the assembler should continue to consume inputs and produce
 * drivetrains tick after tick. The bug manifests as a wedged
 * pipeline — production halts even though all the inputs continue
 * to be produced upstream.
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

/**
 * Build a Fabricator → Assembler → Shipper pipeline with NO grid-cell
 * collisions between machines and intermediate belt cells.
 *
 *   x:   0  1  2  3  4  5  6  7  8  9 10
 *   z=0:                   W2
 *   z=1:                   ↓
 *   z=2:                   ↓
 *   z=3:                   ↓
 *   z=4:                   ↓
 *   z=5: W1 →→→→→→→→→→→→  ASM ←←←←←←←  C
 *   z=6:                   ↓
 *   z=7:                   SHIP
 *
 * Where:
 *  - W1  = part_fabricator producing wheel_small at (0,5)
 *  - W2  = part_fabricator producing wheel_small at (5,0)
 *  - C   = part_fabricator producing circuit_basic at (10,5)
 *  - ASM = assembler with assemble_drivetrain_basic at (5,5)
 *  - SHIP = factory_output at (5,7)
 *
 * Every belt cell is distinct from every machine cell, so
 * `findMachineAt(beltCell)` resolves to `undefined` on intermediate
 * cells and to the correct machine only at the chain ends.
 */
function setup(sim: Simulation): {
  fabWheel1: Machine
  fabWheel2: Machine
  fabCircuit: Machine
  assembler: Machine
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

  const shipper = new Machine('shipper', 'factory_output')
  shipper.start()

  for (const m of [fabWheel1, fabWheel2, fabCircuit, assembler, shipper]) {
    sim.addMachine(m)
  }
  sim.setMachinePosition('fab_wheel_1', 0, 5)
  sim.setMachinePosition('fab_wheel_2', 5, 0)
  sim.setMachinePosition('fab_circuit', 10, 5)
  sim.setMachinePosition('assembler', 5, 5)
  sim.setMachinePosition('shipper', 5, 7)

  // W1 → ASM: (0,5)→(1,5)→(2,5)→(3,5)→(4,5)→(5,5)
  for (let x = 0; x < 5; x++) {
    sim.addBelt(new ConveyorBelt(`b_w1_${x}`, x, 5, x + 1, 5, 1.0))
  }
  sim.setMachineOutputBelt('fab_wheel_1', 'b_w1_0')

  // W2 → ASM: (5,0)→(5,1)→...→(5,5)
  for (let z = 0; z < 5; z++) {
    sim.addBelt(new ConveyorBelt(`b_w2_${z}`, 5, z, 5, z + 1, 1.0))
  }
  sim.setMachineOutputBelt('fab_wheel_2', 'b_w2_0')

  // C → ASM: (10,5)→(9,5)→...→(5,5)
  for (let i = 0; i < 5; i++) {
    sim.addBelt(new ConveyorBelt(`b_c_${i}`, 10 - i, 5, 9 - i, 5, 1.0))
  }
  sim.setMachineOutputBelt('fab_circuit', 'b_c_0')

  // ASM → SHIP: (5,5)→(5,6)→(5,7)
  sim.addBelt(new ConveyorBelt('b_a_0', 5, 5, 5, 6, 1.0))
  sim.addBelt(new ConveyorBelt('b_a_1', 5, 6, 5, 7, 1.0))
  sim.setMachineOutputBelt('assembler', 'b_a_0')

  return { fabWheel1, fabWheel2, fabCircuit, assembler, shipper }
}

describe('Regression: Fabricator → Assembler pipeline continues to flow', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('assembler keeps producing drivetrains over a long run', () => {
    const sim = new Simulation()
    const { assembler, shipper } = setup(sim)

    // Long enough for many full cycles:
    //  - fab cycle:          ~6 ticks/part
    //  - assembler cycle:   ~11 ticks/drivetrain
    //  - belt traversal:    ~10 ticks/cell at speed 1
    // 600 ticks is enough for many drivetrain cycles.
    tickN(sim, 600)

    expect(sim.gameOver).toBeNull()

    // The assembler must complete at least 5 full production cycles.
    expect(assembler.itemsProduced).toBeGreaterThanOrEqual(5)

    // The shipper must have observed at least one delivered drivetrain.
    expect(shipper.consumedItems).toBeGreaterThan(0)
  })

  it('after enough time the assembler is not wedged with a full input batch', () => {
    const sim = new Simulation()
    const { assembler } = setup(sim)

    tickN(sim, 600)

    // The assembler must NOT be idle while a full batch of inputs is
    // already sitting in its slots. The idle branch of tickDefault is
    // supposed to call tryStartProcessing every tick, so this is the
    // "wedged" signature we want to pin.
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
  })
})
