import { describe, it, expect, beforeEach } from 'vitest'
import { resetItemIdCounter, createItem } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { getRecipeById, type Recipe } from '../../../src/game/Recipe'
import { Simulation } from '../../../src/game/Simulation'

// These tests pin the contract of the static recipe-dependency
// satisfiability analyzer. It answers: "Will this machine's currently-
// set recipe receive all of its required input types from somewhere
// upstream, based on the program's recipe assignments and the current
// belt topology — independent of runtime inventory and runtime enabled
// state?"
//
// Exposed as sim.areRecipeDependenciesSatisfied(machineId): boolean,
// delegating to a pure analyzer module under src/game/. Tests reach it
// through the simulation accessor because the simulation already holds
// Machine instances (with their configured recipes), belts, and
// machine positions in one place — the same setup pattern used by
// SimulationStarvation.test.ts.

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

function isSatisfied(sim: Simulation, machineId: string): boolean {
  return sim.areRecipeDependenciesSatisfied(machineId)
}

describe('areRecipeDependenciesSatisfied (static recipe-dependency analyzer)', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('returns true (vacuously) when the target machine has no recipe set', () => {
    // GIVEN — an assembler exists but no recipe assigned
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 1, 1)

    // THEN
    expect(assembler.currentRecipe).toBeNull()
    expect(isSatisfied(sim, 'assembler')).toBe(true)
  })

  it('returns true when the recipe has no inputs (fabricator with any recipe)', () => {
    // GIVEN — a fabricator alone on the grid with a recipe whose inputs: []
    const sim = new Simulation()
    const fab = new Machine('fab', 'part_fabricator')
    fab.setRecipe(recipe('wheel_press_small'))
    sim.addMachine(fab)
    sim.setMachinePosition('fab', 0, 0)

    // THEN — no belts at all; still satisfied because inputs is empty
    expect(fab.currentRecipe!.inputs).toHaveLength(0)
    expect(isSatisfied(sim, 'fab')).toBe(true)
  })

  it('returns false when a required input type has no upstream producer reachable', () => {
    // GIVEN — an assembler with recipe needing wheel_small + circuit_basic, alone
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 1, 1)

    // THEN
    expect(isSatisfied(sim, 'assembler')).toBe(false)
  })

  it('returns false when an upstream machine exists and is belt-connected but has no recipe set', () => {
    // GIVEN — fabricator upstream, belt-connected, but no recipe
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 1, 1)

    const fab = new Machine('fab', 'part_fabricator')
    // intentionally no setRecipe()
    sim.addMachine(fab)
    sim.setMachinePosition('fab', 0, 1)

    sim.addBelt(new ConveyorBelt('b1', 0, 1, 1, 1, 1.0))
    sim.setMachineOutputBelt('fab', 'b1')

    // THEN
    expect(fab.currentRecipe).toBeNull()
    expect(isSatisfied(sim, 'assembler')).toBe(false)
  })

  it("returns false when only one of two required input types has an upstream producer", () => {
    // GIVEN — only a wheel producer; circuit_basic remains unproduced
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 1, 1)

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    sim.addMachine(wheelFab)
    sim.setMachinePosition('wheelFab', 0, 1)

    sim.addBelt(new ConveyorBelt('b1', 0, 1, 1, 1, 1.0))
    sim.setMachineOutputBelt('wheelFab', 'b1')

    // THEN — wheel_small satisfied, circuit_basic not → overall false
    expect(isSatisfied(sim, 'assembler')).toBe(false)
  })

  it('returns true when every required input type has at least one upstream producer with the correct recipe', () => {
    // GIVEN — two fabricators (wheels + circuits) both belt-connected to the assembler
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 1, 1)

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    sim.addMachine(wheelFab)
    sim.setMachinePosition('wheelFab', 0, 1)

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    circuitFab.setRecipe(recipe('circuit_printer_basic'))
    sim.addMachine(circuitFab)
    sim.setMachinePosition('circuitFab', 2, 1)

    sim.addBelt(new ConveyorBelt('b1', 0, 1, 1, 1, 1.0))
    sim.addBelt(new ConveyorBelt('b2', 2, 1, 1, 1, 1.0))
    sim.setMachineOutputBelt('wheelFab', 'b1')
    sim.setMachineOutputBelt('circuitFab', 'b2')

    // THEN
    expect(isSatisfied(sim, 'assembler')).toBe(true)
  })

  it('traverses through a splitter (fab → splitter → assembler)', () => {
    // GIVEN — single fabricator routed through a splitter to a fabricator-only
    // recipe with one required type. Use assemble_sensor_array_basic? — it
    // needs 2 sensor types. Instead use a single-required-input setup: build
    // wheel_small + circuit_basic for assemble_drivetrain_basic, with the
    // wheel feed going through a splitter.
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 2, 1)

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    sim.addMachine(wheelFab)
    sim.setMachinePosition('wheelFab', 0, 1)

    const splitter = new Machine('split', 'splitter')
    sim.addMachine(splitter)
    sim.setMachinePosition('split', 1, 1)

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    circuitFab.setRecipe(recipe('circuit_printer_basic'))
    sim.addMachine(circuitFab)
    sim.setMachinePosition('circuitFab', 2, 0)

    // wheelFab → splitter → assembler
    sim.addBelt(new ConveyorBelt('b1', 0, 1, 1, 1, 1.0))
    sim.addBelt(new ConveyorBelt('b2', 1, 1, 2, 1, 1.0))
    sim.setMachineOutputBelt('wheelFab', 'b1')
    sim.setMachineOutputBelt('split', 'b2')

    // circuitFab → assembler direct
    sim.addBelt(new ConveyorBelt('b3', 2, 0, 2, 1, 1.0))
    sim.setMachineOutputBelt('circuitFab', 'b3')

    // THEN — splitter is transparent for reachability
    expect(isSatisfied(sim, 'assembler')).toBe(true)
  })

  it('traverses multi-hop chains through multiple splitters', () => {
    // GIVEN — wheelFab → splitterA → splitterB → assembler (with circuitFab direct)
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 3, 1)

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    sim.addMachine(wheelFab)
    sim.setMachinePosition('wheelFab', 0, 1)

    const splitA = new Machine('splitA', 'splitter')
    sim.addMachine(splitA)
    sim.setMachinePosition('splitA', 1, 1)

    const splitB = new Machine('splitB', 'splitter')
    sim.addMachine(splitB)
    sim.setMachinePosition('splitB', 2, 1)

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    circuitFab.setRecipe(recipe('circuit_printer_basic'))
    sim.addMachine(circuitFab)
    sim.setMachinePosition('circuitFab', 3, 0)

    sim.addBelt(new ConveyorBelt('b1', 0, 1, 1, 1, 1.0))
    sim.addBelt(new ConveyorBelt('b2', 1, 1, 2, 1, 1.0))
    sim.addBelt(new ConveyorBelt('b3', 2, 1, 3, 1, 1.0))
    sim.setMachineOutputBelt('wheelFab', 'b1')
    sim.setMachineOutputBelt('splitA', 'b2')
    sim.setMachineOutputBelt('splitB', 'b3')

    sim.addBelt(new ConveyorBelt('b4', 3, 0, 3, 1, 1.0))
    sim.setMachineOutputBelt('circuitFab', 'b4')

    // THEN
    expect(isSatisfied(sim, 'assembler')).toBe(true)
  })

  it('does NOT consider runtime inventory state (full input slots do not change the verdict)', () => {
    // GIVEN — assembler alone with no upstream producers but inputSlots pre-stuffed
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 1, 1)

    // Pre-stuff runtime inventory with everything the recipe needs.
    assembler.addInput(createItem('wheel_small'))
    assembler.addInput(createItem('wheel_small'))
    assembler.addInput(createItem('circuit_basic'))

    // THEN — analyzer ignores inventory; topology has zero producers
    expect(isSatisfied(sim, 'assembler')).toBe(false)
  })

  it('does NOT consider machine enabled state (a stopped producer still counts)', () => {
    // GIVEN — both upstream fabricators have recipes but neither is started
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 1, 1)

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    sim.addMachine(wheelFab)
    sim.setMachinePosition('wheelFab', 0, 1)

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    circuitFab.setRecipe(recipe('circuit_printer_basic'))
    sim.addMachine(circuitFab)
    sim.setMachinePosition('circuitFab', 2, 1)

    sim.addBelt(new ConveyorBelt('b1', 0, 1, 1, 1, 1.0))
    sim.addBelt(new ConveyorBelt('b2', 2, 1, 1, 1, 1.0))
    sim.setMachineOutputBelt('wheelFab', 'b1')
    sim.setMachineOutputBelt('circuitFab', 'b2')

    // ASSERT — neither producer is enabled
    expect(wheelFab.enabled).toBe(false)
    expect(circuitFab.enabled).toBe(false)

    // THEN — enabled state is irrelevant; the configured recipes are what matter
    expect(isSatisfied(sim, 'assembler')).toBe(true)
  })

  it('returns false for a belt cycle with no actual producer (cycle does not satisfy itself)', () => {
    // GIVEN — two splitters in a belt cycle feeding an assembler. No fabricator.
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 2, 1)

    const splitA = new Machine('splitA', 'splitter')
    sim.addMachine(splitA)
    sim.setMachinePosition('splitA', 0, 1)

    const splitB = new Machine('splitB', 'splitter')
    sim.addMachine(splitB)
    sim.setMachinePosition('splitB', 1, 1)

    // splitA ↔ splitB cycle, and splitB → assembler
    sim.addBelt(new ConveyorBelt('b1', 0, 1, 1, 1, 1.0)) // A → B
    sim.addBelt(new ConveyorBelt('b2', 1, 1, 0, 1, 1.0)) // B → A
    sim.addBelt(new ConveyorBelt('b3', 1, 1, 2, 1, 1.0)) // B → assembler
    sim.setMachineOutputBelt('splitA', 'b1')
    sim.setMachineOutputBelt('splitB', 'b3')
    sim.setMachineOutputBelt('splitB', 'b2', 'secondary')

    // THEN — visited-set must prevent infinite recursion AND return false
    expect(isSatisfied(sim, 'assembler')).toBe(false)
  })

  it.todo('treats a Recycler as a producer of raw_material when an upstream Recycler is belt-connected (no current recipe requires raw_material; revisit if one is added)')

  it('traverses through a multi-cell belt chain (no intermediate machines)', () => {
    // GIVEN — producers placed 3 cells away from the assembler, connected
    // through belt chains whose intermediate cells contain ONLY belt
    // segments (no machines). This pins the regression where the
    // analyzer dead-ended at the first belt-only cell because it looked
    // up `(belt.fromX, belt.fromZ)` in the machine-by-cell index and
    // found nothing.
    const sim = new Simulation()
    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    sim.addMachine(assembler)
    sim.setMachinePosition('assembler', 13, 10)

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    sim.addMachine(wheelFab)
    sim.setMachinePosition('wheelFab', 10, 10)

    // wheelFab(10,10) → (11,10) → (12,10) → assembler(13,10)
    sim.addBelt(new ConveyorBelt('w1', 10, 10, 11, 10, 1.0))
    sim.addBelt(new ConveyorBelt('w2', 11, 10, 12, 10, 1.0))
    sim.addBelt(new ConveyorBelt('w3', 12, 10, 13, 10, 1.0))
    sim.setMachineOutputBelt('wheelFab', 'w1')

    const circuitFab = new Machine('circuitFab', 'part_fabricator')
    circuitFab.setRecipe(recipe('circuit_printer_basic'))
    sim.addMachine(circuitFab)
    sim.setMachinePosition('circuitFab', 13, 7)

    // circuitFab(13,7) → (13,8) → (13,9) → assembler(13,10)
    sim.addBelt(new ConveyorBelt('c1', 13, 7, 13, 8, 1.0))
    sim.addBelt(new ConveyorBelt('c2', 13, 8, 13, 9, 1.0))
    sim.addBelt(new ConveyorBelt('c3', 13, 9, 13, 10, 1.0))
    sim.setMachineOutputBelt('circuitFab', 'c1')

    // THEN
    expect(isSatisfied(sim, 'assembler')).toBe(true)
  })
})
