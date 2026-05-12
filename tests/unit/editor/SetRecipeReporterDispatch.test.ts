import { describe, it, expect, beforeEach } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'

/**
 * RED tests for the BlockInterpreter dispatch behaviour after PXT
 * compiles `factory_set_recipe` with a Machine-typed value input
 * (PoC slice).
 *
 * Once the GREEN agent flips `setRecipe(machine: Machine, …)` to
 * `setRecipe(machine: number, …)` in `pxt-target/libs/core/factory.ts`,
 * PXT's blocks→TS compiler will accept arbitrary expressions in the
 * machine slot. Three new compiled-TS shapes appear:
 *
 *   B1. The `factory_pick_machine` reporter inlined directly in the
 *       slot:
 *           machines.setRecipe(machines.pickMachine(Machine.B), Recipe.X)
 *
 *   B2. A Blockly variable getter pre-assigned with the reporter:
 *           let m = machines.pickMachine(Machine.B)
 *           machines.setRecipe(m, Recipe.X)
 *
 *   B3. The legacy literal still works (backward compat for old
 *       saves and other consumer blocks that stay enum-typed):
 *           machines.setRecipe(Machine.B, Recipe.X)
 *
 * EXPECTED FAILURE NOTE: most of these tests will already PASS today
 * because the interpreter is general-purpose (`pickMachine` returns
 * its argument unchanged; the resolver accepts numbers, enum names,
 * and dynamic-list slot indices). They serve as the acceptance
 * criteria the GREEN agent must NOT regress when the API is
 * reshaped.
 *
 * The negative tests (`undefined` machine arg → no dispatch to a
 * real machine) pin the historical bug: PXT used to emit
 * `setRecipe(undefined, …)` for non-literal slots when the param was
 * enum-typed, and the interpreter silently dispatched to whatever
 * `resolveMachineId(undefined)` returned. After the API change PXT
 * stops emitting `undefined`; if a corruption ever does reach the
 * interpreter, the dispatch must NOT silently land on a real machine.
 */

describe('BlockInterpreter — factory_set_recipe with reporter / variable in the machine slot (PoC)', () => {
  let interpreter: BlockInterpreter

  beforeEach(() => {
    interpreter = new BlockInterpreter()
    // Slot 0 -> Fab1, slot 1 -> Fab2, slot 2 -> Assembler
    interpreter.setMachineList([
      { slotIndex: 0, id: 'fab_1', name: 'Fab1' },
      { slotIndex: 1, id: 'fab_2', name: 'Fab2' },
      { slotIndex: 2, id: 'assembler_1', name: 'Assembler' },
    ])
  })

  // ── B1 ──────────────────────────────────────────────────────────

  it('B1: setRecipe(pickMachine(Machine.A), Recipe.WheelPressSmall) dispatches to Fab1', () => {
    // GIVEN — the compiled TS PXT produces when the user drops a
    // factory_pick_machine reporter into the machine slot of a
    // factory_set_recipe block.
    const source =
      'machines.setRecipe(machines.pickMachine(Machine.A), Recipe.WheelPressSmall)'

    // WHEN
    const commands = interpreter.interpret(source)

    // THEN
    expect(commands).toHaveLength(1)
    expect(commands[0].type).toBe('SET_RECIPE')
    expect((commands[0] as { machineId: string }).machineId).toBe('fab_1')
    expect((commands[0] as { recipeId: string }).recipeId).toBe('wheel_press_small')
  })

  it('B1: setRecipe(pickMachine(Machine.B), Recipe.WheelPressLarge) dispatches to Fab2 (proves Machine.B is not collapsed to Machine.A)', () => {
    // GIVEN — the historical PXT enum-shadow bug always emitted
    // Machine.A regardless of the user's selection. This test pins
    // that B/C/D values reach the interpreter intact after GREEN.
    const source =
      'machines.setRecipe(machines.pickMachine(Machine.B), Recipe.WheelPressLarge)'

    // WHEN
    const commands = interpreter.interpret(source)

    // THEN
    expect(commands).toHaveLength(1)
    expect((commands[0] as { machineId: string }).machineId).toBe('fab_2')
    expect((commands[0] as { recipeId: string }).recipeId).toBe('wheel_press_large')
  })

  it('B1: namespaced `recipes.setRecipe(pickMachine(...), ...)` backward-compat alias works', () => {
    // GIVEN — `recipes.setRecipe` is the legacy mirror of
    // `machines.setRecipe` retained for older saves.
    const source =
      'recipes.setRecipe(machines.pickMachine(Machine.C), Recipe.WheelPressSmall)'

    // WHEN
    const commands = interpreter.interpret(source)

    // THEN
    expect(commands).toHaveLength(1)
    expect(commands[0].type).toBe('SET_RECIPE')
    expect((commands[0] as { machineId: string }).machineId).toBe('assembler_1')
  })

  // ── B2 ──────────────────────────────────────────────────────────

  it('B2: variable assigned from pickMachine, then used in setRecipe, dispatches to the chosen machine', () => {
    // GIVEN — the compiled TS PXT produces when the user wires a
    // Blockly variable getter (initialised by a pickMachine
    // reporter) into the machine slot.
    const source = `
      let m = machines.pickMachine(Machine.B)
      machines.setRecipe(m, Recipe.WheelPressLarge)
    `

    // WHEN
    const commands = interpreter.interpret(source)

    // THEN
    expect(commands).toHaveLength(1)
    expect(commands[0].type).toBe('SET_RECIPE')
    expect((commands[0] as { machineId: string }).machineId).toBe('fab_2')
    expect((commands[0] as { recipeId: string }).recipeId).toBe('wheel_press_large')
  })

  it('B2: variable reused across setRecipe and startMachine targets the same physical machine', () => {
    // GIVEN — value-input typing means `m` is a Machine value the
    // user can plug into multiple consumer slots in any order.
    const source = `
      let m = machines.pickMachine(Machine.C)
      machines.setRecipe(m, Recipe.WheelPressSmall)
      machines.startMachine(m)
    `

    // WHEN
    const commands = interpreter.interpret(source)

    // THEN
    expect(commands).toHaveLength(2)
    expect((commands[0] as { machineId: string }).machineId).toBe('assembler_1')
    expect((commands[1] as { machineId: string }).machineId).toBe('assembler_1')
  })

  // ── B3 ──────────────────────────────────────────────────────────

  it('B3: legacy literal `setRecipe(Machine.A, Recipe.X)` still dispatches correctly (backward compat)', () => {
    // GIVEN
    const source = 'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)'

    // WHEN
    const commands = interpreter.interpret(source)

    // THEN
    expect(commands).toHaveLength(1)
    expect(commands[0].type).toBe('SET_RECIPE')
    expect((commands[0] as { machineId: string }).machineId).toBe('fab_1')
  })

  it('B3: legacy literal Machine.B is NOT collapsed to Machine.A (interpreter-level invariant)', () => {
    // GIVEN — defensive pin so the dynamic-list resolver continues
    // to honour the literal slot index after the GREEN refactor.
    const source = 'machines.setRecipe(Machine.B, Recipe.WheelPressLarge)'

    // WHEN
    const commands = interpreter.interpret(source)

    // THEN
    expect((commands[0] as { machineId: string }).machineId).toBe('fab_2')
  })

  // ── Negative pins ───────────────────────────────────────────────

  it('NEGATIVE: setRecipe(undefined, Recipe.X) does NOT silently dispatch to Fab1', () => {
    // GIVEN — this is what PXT used to emit when an enum-typed
    // parameter was filled by a non-literal expression. After GREEN
    // PXT stops emitting `undefined` for setRecipe, but the
    // interpreter must not silently coerce `undefined` into Fab1
    // (which would mask further regressions).
    const source = 'machines.setRecipe(undefined, Recipe.WheelPressSmall)'

    // WHEN
    const commands = interpreter.interpret(source)

    // THEN — at most we accept "no command dispatched" or a
    // distinct sentinel id; landing on `fab_1` (Machine.A) would
    // re-create the original silent-failure mode.
    if (commands.length === 0) return // acceptable: dispatch was suppressed
    const machineId = (commands[0] as { machineId: string }).machineId
    expect(
      machineId,
      'Interpreter silently dispatched an undefined machine arg to Fab1 ' +
        '(slot 0). This is the exact failure mode the PoC is meant to ' +
        'eliminate — every Machine.X collapsed to Machine.A.',
    ).not.toBe('fab_1')
  })

  it('NEGATIVE: nested pickMachine inside another pickMachine still resolves the inner literal (composability)', () => {
    // GIVEN — defensive: pickMachine is identity, so a nested
    // call should be transparent. Catches accidental wrapping
    // (e.g. an interpreter implementation that boxes the value).
    const source =
      'machines.setRecipe(machines.pickMachine(machines.pickMachine(Machine.B)), Recipe.WheelPressLarge)'

    // WHEN
    const commands = interpreter.interpret(source)

    // THEN
    expect(commands).toHaveLength(1)
    expect((commands[0] as { machineId: string }).machineId).toBe('fab_2')
  })
})
