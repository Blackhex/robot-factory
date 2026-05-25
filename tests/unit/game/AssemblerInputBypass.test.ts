import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { ItemDeliveryEngine } from '../../../src/game/ItemDeliveryEngine'
import { getRecipeById } from '../../../src/game/Recipe'

/**
 * RED regression: when an Assembler's input slots are full and the
 * Assembler's OUTPUT belt starts on the SAME cell as one of the input
 * belts' destination cell, an incoming raw part bypasses the machine
 * and gets handed onto the Assembler's output belt via the
 * belt-to-belt handover fallback in `ItemDeliveryEngine`
 * (src/game/ItemDeliveryEngine.ts L200-215).
 *
 * This is the user-visible "basic part coming out of the Assembler"
 * scenario from projects/Assembly.json — the wheel/circuit never
 * entered the Assembler at all, it was punted directly onto the
 * downstream belt by the delivery engine.
 *
 * Minimal repro:
 *   - Assembler at (1,0) with recipe `assemble_drivetrain_basic`
 *     (2× wheel_small + 1× circuit_basic).
 *   - inputBelt: (0,0) → (1,0). A `wheel_small` rides this belt.
 *   - outputBelt: (1,0) → (2,0). The Assembler's output belt, which
 *     STARTS at the Assembler cell — exactly the Assembly.json shape.
 *   - Pre-fill the Assembler's input slots with 2 wheels + 1 circuit
 *     so canAcceptInput() returns false (slots at maxInputSlots=3).
 *
 * Expected: the incoming wheel stays on inputBelt (back-pressure).
 * Actual (bug): the wheel is handed over to outputBelt as a raw part.
 */
describe('Assembler input bypass via output-belt handover (RED)', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('a raw part does not get handed onto the Assembler output belt when input slots are full', () => {
    // --- GIVEN -----------------------------------------------------------
    const recipe = getRecipeById('assemble_drivetrain_basic')!
    expect(recipe).toBeDefined()

    const assembler = new Machine('asm1', 'assembler')
    assembler.setRecipe(recipe)
    assembler.start()
    // Fill the Assembler's input slots so canAcceptInput() === false.
    // (maxInputSlots default = 3; recipe needs 2×wheel + 1×circuit.)
    assembler.addInput(createItem('wheel_small'))
    assembler.addInput(createItem('wheel_small'))
    assembler.addInput(createItem('circuit_basic'))
    expect(assembler.canAcceptInput()).toBe(false)

    const inputBelt = new ConveyorBelt('in', 0, 0, 1, 0, 1.0)
    const outputBelt = new ConveyorBelt('out', 1, 0, 2, 0, 1.0)

    // Place an incoming wheel on inputBelt and advance it to position 1.0
    // so getReadyItems() returns it (same cadence as
    // ItemDeliveryEngineCategories.test.ts).
    const incoming = createItem('wheel_small')
    inputBelt.addItem(incoming)
    for (let i = 0; i < 11; i++) inputBelt.advance(0.1)

    const belts = new Map<string, ConveyorBelt>([
      [inputBelt.id, inputBelt],
      [outputBelt.id, outputBelt],
    ])
    const machines = new Map<string, { machine: Machine; x: number; z: number }>([
      [assembler.id, { machine: assembler, x: 1, z: 0 }],
    ])
    const engine = new ItemDeliveryEngine({
      getBelts: () => belts,
      findMachineAt: (x, z) => {
        for (const { machine, x: mx, z: mz } of machines.values()) {
          if (mx === x && mz === z) return machine
        }
        return undefined
      },
      findBeltStartingAt: (x, z) => {
        for (const b of belts.values()) {
          if (b.fromX === x && b.fromZ === z) return b
        }
        return undefined
      },
    })

    // --- WHEN ------------------------------------------------------------
    const result = engine.deliver(0, null)

    // --- THEN ------------------------------------------------------------
    // No fatal mis-routing should be reported.
    expect(result.newGameOver).toBeNull()

    // The Assembler must NOT have accepted the 4th item (slots full).
    expect(assembler.inputSlots.length).toBe(3)

    // The wheel must still be on inputBelt (back-pressure jam) and must
    // NEVER appear on the Assembler's output belt as a raw part. This
    // is the assertion that catches the bypass bug.
    const outputBeltTypes = outputBelt.getReadyItems().map((i) => i.type)
    const allOutputBeltItemIds = new Set<string>()
    // ConveyorBelt has no public "all items" accessor in the test surface,
    // but acceptHandover puts the item past position 0 and getReadyItems
    // returns items at position >= 1.0; for a fresh handover the item is
    // at overshoot ~0, so use a coarse drain: advance outputBelt fully
    // and re-check whether anything raw rides it.
    for (let i = 0; i < 20; i++) outputBelt.advance(0.1)
    for (const it of outputBelt.getReadyItems()) {
      allOutputBeltItemIds.add(it.id)
      expect(
        it.type,
        `raw part ${it.type} (id=${it.id}) bypassed the Assembler and landed on its output belt`,
      ).not.toBe('wheel_small')
      expect(it.type).not.toBe('circuit_basic')
    }

    // And the incoming wheel must still be tracked somewhere on inputBelt.
    // (If the bug fired, inputBelt would be empty and outputBelt would
    // hold a wheel_small.)
    expect(outputBeltTypes).not.toContain('wheel_small')
  })
})
