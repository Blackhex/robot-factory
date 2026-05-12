import { describe, it, expect, beforeEach } from 'vitest'
import { resetItemIdCounter, createItem } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'
import { Simulation } from '../../../src/game/Simulation'
import type { ItemType } from '../../../src/game/types'

// Design notes for these tests
// ----------------------------
// Field choice: we reuse the EXISTING `GameOverInfo.itemType` field
// rather than introducing a new `missingItemType` field. Same name,
// same `ItemType` type — minimal surface change.
//
// We compare `sim.gameOver?.reason` against the literal 'starvation'
// via `String(...)` so the test file type-checks even before the union
// `GameOverReason` is widened. The runtime comparison still fails
// loudly while the new reason is not yet emitted.
//
// Seam: integration-style. Drive through `sim.tick()` and read
// `sim.gameOver`. The pure-function guard is exercised in
// StarvationGuard.test.ts.

function tickN(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) sim.tick()
}

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

function gameOverReason(sim: Simulation): string | undefined {
  return sim.gameOver === null ? undefined : String(sim.gameOver.reason)
}

describe('Simulation starvation game-over (integration)', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  // --------------------------------------------------------------
  // EXPECTED-TO-FIRE cases
  // --------------------------------------------------------------

  it('fires starvation: 2 wheel fabs feed an assembler that also needs circuit_basic', () => {
    // GIVEN — two part_fabricators producing wheel_small via short belts
    // into an assembler whose recipe needs 2× wheel_small + 1× circuit_basic.
    const sim = new Simulation()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()

    const fab1 = new Machine('fab1', 'part_fabricator')
    fab1.setRecipe(recipe('wheel_press_small'))
    fab1.start()

    const fab2 = new Machine('fab2', 'part_fabricator')
    fab2.setRecipe(recipe('wheel_press_small'))
    fab2.start()

    sim.addMachine(assembler)
    sim.addMachine(fab1)
    sim.addMachine(fab2)
    sim.setMachinePosition('assembler', 1, 1)
    sim.setMachinePosition('fab1', 0, 1)
    sim.setMachinePosition('fab2', 2, 1)

    sim.addBelt(new ConveyorBelt('b1', 0, 1, 1, 1, 1.0))
    sim.addBelt(new ConveyorBelt('b2', 2, 1, 1, 1, 1.0))
    sim.setMachineOutputBelt('fab1', 'b1')
    sim.setMachineOutputBelt('fab2', 'b2')

    // WHEN — run long enough for at least one wheel to reach the
    // assembler (5 process ticks + ~10 belt ticks).
    tickN(sim, 60)

    // THEN
    expect(sim.gameOver).not.toBeNull()
    expect(gameOverReason(sim)).toBe('starvation')
    expect(sim.gameOver!.machineId).toBe(assembler.id)
    expect(sim.gameOver!.itemType).toBe<ItemType>('circuit_basic')
    expect(sim.gameOver!.tick).toBeTypeOf('number')
    expect(sim.paused).toBe(true)
  })

  it('fires starvation: single wheel fab + assembler missing two required types', () => {
    // GIVEN — only ONE wheel fabricator. Assembler still needs
    // circuit_basic AND eventually a 2nd wheel_small. After the first
    // wheel arrives, the missing required type is determinable.
    const sim = new Simulation()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()

    const fab1 = new Machine('fab1', 'part_fabricator')
    fab1.setRecipe(recipe('wheel_press_small'))
    fab1.start()

    sim.addMachine(assembler)
    sim.addMachine(fab1)
    sim.setMachinePosition('assembler', 1, 1)
    sim.setMachinePosition('fab1', 0, 1)

    sim.addBelt(new ConveyorBelt('b1', 0, 1, 1, 1, 1.0))
    sim.setMachineOutputBelt('fab1', 'b1')

    // WHEN
    tickN(sim, 30)

    // THEN — game over fires; itemType is one of the structurally
    // unproducible required types. (`wheel_small` IS producible
    // upstream — only `circuit_basic` is unreachable. The guard MUST
    // pick the unreachable one, not the merely-currently-short one.)
    expect(sim.gameOver).not.toBeNull()
    expect(gameOverReason(sim)).toBe('starvation')
    expect(sim.gameOver!.machineId).toBe(assembler.id)
    expect(sim.gameOver!.itemType).toBe<ItemType>('circuit_basic')
  })

  it('fires starvation in an extended chain (fab → splitter → assembler) when no circuit producer exists', () => {
    // GIVEN — wheel fab → belt → splitter → belt → assembler.
    // Splitter has no recipe; the upstream closure traverses it through
    // to the wheel fab, which only produces `wheel_small`. The
    // assembler still needs `circuit_basic` → starvation.
    const sim = new Simulation()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()

    const splitter = new Machine('splitter', 'splitter')
    splitter.start()

    const fab = new Machine('fab', 'part_fabricator')
    fab.setRecipe(recipe('wheel_press_small'))
    fab.start()

    sim.addMachine(assembler)
    sim.addMachine(splitter)
    sim.addMachine(fab)
    sim.setMachinePosition('fab', 0, 0)
    sim.setMachinePosition('splitter', 1, 0)
    sim.setMachinePosition('assembler', 2, 0)

    sim.addBelt(new ConveyorBelt('b_in', 0, 0, 1, 0, 1.0))   // fab → splitter
    sim.addBelt(new ConveyorBelt('b_out', 1, 0, 2, 0, 1.0))  // splitter → assembler
    sim.setMachineOutputBelt('fab', 'b_in')
    sim.setMachineOutputBelt('splitter', 'b_out')

    // WHEN — long enough for a wheel to traverse fab→splitter→assembler.
    tickN(sim, 80)

    // THEN
    expect(sim.gameOver).not.toBeNull()
    expect(gameOverReason(sim)).toBe('starvation')
    expect(sim.gameOver!.machineId).toBe(assembler.id)
    expect(sim.gameOver!.itemType).toBe<ItemType>('circuit_basic')
  })

  // --------------------------------------------------------------
  // EXPECTED-NOT-TO-FIRE cases (regression guards)
  // --------------------------------------------------------------

  it('does NOT fire starvation when a circuit_printer is present upstream (even before circuits arrive)', () => {
    // GIVEN — wheel fab AND a circuit_printer fab feeding the assembler.
    // Circuit fab is on a deliberately long path so that, within the
    // tested window, only wheels have arrived.
    const sim = new Simulation()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    wheelFab.start()

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    circuitFab.setRecipe(recipe('circuit_printer_basic'))
    circuitFab.start()

    sim.addMachine(assembler)
    sim.addMachine(wheelFab)
    sim.addMachine(circuitFab)
    sim.setMachinePosition('assembler', 1, 1)
    sim.setMachinePosition('wheelFab', 0, 1)
    sim.setMachinePosition('circuitFab', 2, 1)

    sim.addBelt(new ConveyorBelt('b_w', 0, 1, 1, 1, 1.0))
    sim.addBelt(new ConveyorBelt('b_c', 2, 1, 1, 1, 1.0))
    sim.setMachineOutputBelt('wheelFab', 'b_w')
    sim.setMachineOutputBelt('circuitFab', 'b_c')

    tickN(sim, 60)

    // THEN — must not have fired starvation. Some wheels may have
    // arrived; the upstream chain CAN produce circuit_basic, so the
    // guard must hold off.
    expect(gameOverReason(sim)).not.toBe('starvation')
  })

  it('does NOT fire starvation when no items have been delivered yet (empty input slots)', () => {
    // GIVEN — assembler with recipe and started, but with NO source
    // upstream and no belts. inputSlots stays empty → detection
    // condition (inputSlots.length >= 1) never holds.
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 0, 0)

    tickN(sim, 50)

    expect(gameOverReason(sim)).not.toBe('starvation')
  })

  it('does NOT fire starvation when the assembler is disabled', () => {
    // GIVEN — assembler with recipe but never started. A disabled
    // destination triggers `unconsumable_input`, which is fine; the
    // critical assertion is that we do NOT mis-classify it as
    // 'starvation'.
    const sim = new Simulation()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    // intentionally NOT started → assembler.enabled === false

    const fab = new Machine('fab', 'part_fabricator')
    fab.setRecipe(recipe('wheel_press_small'))
    fab.start()

    sim.addMachine(assembler)
    sim.addMachine(fab)
    sim.setMachinePosition('assembler', 1, 0)
    sim.setMachinePosition('fab', 0, 0)
    sim.addBelt(new ConveyorBelt('b1', 0, 0, 1, 0, 1.0))
    sim.setMachineOutputBelt('fab', 'b1')

    tickN(sim, 60)

    expect(gameOverReason(sim)).not.toBe('starvation')
  })

  it('does NOT fire starvation when the assembler has no recipe set (no_recipe handles it)', () => {
    // GIVEN — assembler started without a recipe → no_recipe game over.
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    assembler.start()
    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 0, 0)

    tickN(sim, 5)

    expect(gameOverReason(sim)).not.toBe('starvation')
    expect(gameOverReason(sim)).toBe('no_recipe')
  })

  it('FIRES starvation when an upstream producer is disabled even though its recipe is set', () => {
    // GIVEN — circuit fab is configured (recipe set) but never started.
    // New rule: a producer must be BOTH enabled AND have a producing
    // recipe configured to count as a reachable producer. Configuration
    // alone is no longer sufficient — the program must also have
    // started the machine.
    const sim = new Simulation()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    wheelFab.start()

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    circuitFab.setRecipe(recipe('circuit_printer_basic'))
    // intentionally NOT started → enabled === false

    sim.addMachine(assembler)
    sim.addMachine(wheelFab)
    sim.addMachine(circuitFab)
    sim.setMachinePosition('assembler', 1, 1)
    sim.setMachinePosition('wheelFab', 0, 1)
    sim.setMachinePosition('circuitFab', 2, 1)

    sim.addBelt(new ConveyorBelt('b_w', 0, 1, 1, 1, 1.0))
    sim.addBelt(new ConveyorBelt('b_c', 2, 1, 1, 1, 1.0))
    sim.setMachineOutputBelt('wheelFab', 'b_w')
    sim.setMachineOutputBelt('circuitFab', 'b_c')

    tickN(sim, 60)

    expect(sim.gameOver).not.toBeNull()
    expect(gameOverReason(sim)).toBe('starvation')
    expect(sim.gameOver!.machineId).toBe('assembler')
    expect(sim.gameOver!.itemType).toBe<ItemType>('circuit_basic')
  })

  it('does NOT fire starvation when sufficient inputs are already in the assembler', () => {
    // GIVEN — pre-load the assembler with a complete set of inputs.
    // It will start processing; starvation detection must remain quiet.
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    // Pre-load: 2× wheel_small + 1× circuit_basic.
    assembler.addInput(createItem('wheel_small'))
    assembler.addInput(createItem('wheel_small'))
    assembler.addInput(createItem('circuit_basic'))

    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 0, 0)

    tickN(sim, 5)

    expect(gameOverReason(sim)).not.toBe('starvation')
  })
})
