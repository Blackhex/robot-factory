/**
 * Bug 2 (RED) — First (and every) Assembler output must be a proper
 * assembly: `components` populated with one Item per recipe input, in
 * the order the recipe lists them.
 *
 * Reproduces the regression where an Assembler emits an item with
 * empty (or undefined) `components`, indistinguishable from a basic
 * part. Downstream consumers (Recycler decomposition, Inspector
 * defect routing, scoring) all depend on `components` carrying the
 * actual consumed inputs.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Machine } from '../../../src/game/Machine'
import { ALL_OUTPUTS_CONNECTED_ENV } from '../../../src/game/MachineBehaviors'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { getRecipeById, type Recipe } from '../../../src/game/Recipe'

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

/** Deterministic RNG that never rolls a defect (defect threshold << 0.5). */
const noDefectRng = (): number => 0.99

/** Drive ticks until `outputSlot` is populated, or fail. */
function tickUntilOutput(m: Machine, rng: () => number, maxTicks = 40): void {
  for (let i = 0; i < maxTicks; i++) {
    m.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)
    if (m.outputSlot !== null) return
  }
  throw new Error(`Assembler did not produce output within ${maxTicks} ticks`)
}

describe('Assembler — first output is a proper assembly with components', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('sub-assembly recipe (drivetrain_basic): first output has components matching recipe inputs in order', () => {
    // GIVEN — an assembler primed with the drivetrain_basic recipe and
    // exactly the recipe's required inputs, freshly started.
    const r = recipe('assemble_drivetrain_basic')
    // Sanity: this is the recipe shape we're asserting against.
    expect(r.inputs.map((i) => ({ type: i.type, quantity: i.quantity }))).toEqual([
      { type: 'wheel_small', quantity: 2 },
      { type: 'circuit_basic', quantity: 1 },
    ])

    const asm = new Machine('asm1', 'assembler')
    asm.setRecipe(r)
    asm.start()
    asm.addInput(createItem('wheel_small'))
    asm.addInput(createItem('wheel_small'))
    asm.addInput(createItem('circuit_basic'))

    // WHEN — pump ticks until the FIRST output appears.
    tickUntilOutput(asm, noDefectRng)
    const out = asm.outputSlot!
    expect(out).not.toBeNull()

    // THEN — the output is the recipe's output type ...
    expect(out.type).toBe('drivetrain_basic')

    // ... AND it carries `components` populated with one Item per
    // recipe input (expanded by quantity), in the recipe's order.
    expect(out.components).toBeDefined()
    expect(out.components!.length).toBe(3)
    expect(out.components!.map((c) => c.type)).toEqual([
      'wheel_small',
      'wheel_small',
      'circuit_basic',
    ])
  })

  it('robot recipe (assemble_robot_explorer): first output has components for all three recipe inputs in order', () => {
    // GIVEN — assembler with the robot recipe and exactly its required
    // inputs (sub-assemblies + chassis), freshly started.
    const r = recipe('assemble_robot_explorer')
    expect(r.inputs.map((i) => ({ type: i.type, quantity: i.quantity }))).toEqual([
      { type: 'chassis_light', quantity: 1 },
      { type: 'drivetrain_basic', quantity: 1 },
      { type: 'power_unit_standard', quantity: 1 },
    ])

    const asm = new Machine('asm2', 'assembler')
    asm.setRecipe(r)
    asm.start()
    asm.addInput(createItem('chassis_light'))
    asm.addInput(createItem('drivetrain_basic'))
    asm.addInput(createItem('power_unit_standard'))

    // WHEN
    tickUntilOutput(asm, noDefectRng)
    const out = asm.outputSlot!
    expect(out).not.toBeNull()

    // THEN
    expect(out.type).toBe('robot_explorer')
    expect(out.components).toBeDefined()
    expect(out.components!.length).toBe(3)
    expect(out.components!.map((c) => c.type)).toEqual([
      'chassis_light',
      'drivetrain_basic',
      'power_unit_standard',
    ])
  })

  it('every component on the first output is itself a real Item (has an id and type)', () => {
    // GIVEN
    const asm = new Machine('asm3', 'assembler')
    asm.setRecipe(recipe('assemble_drivetrain_basic'))
    asm.start()
    asm.addInput(createItem('wheel_small'))
    asm.addInput(createItem('wheel_small'))
    asm.addInput(createItem('circuit_basic'))

    // WHEN
    tickUntilOutput(asm, noDefectRng)
    const out = asm.outputSlot!

    // THEN — each component is a populated Item, not a sentinel/empty object.
    expect(out.components).toBeDefined()
    for (const c of out.components!) {
      expect(typeof c.id).toBe('string')
      expect(c.id.length).toBeGreaterThan(0)
      expect(c.type).toBeDefined()
    }
  })
})
