/**
 * @vitest-environment jsdom
 *
 * RED end-to-end test (Vitest + JSDOM) for the PoC slice that lets a
 * `factory_pick_machine` reporter fill the `factory_set_recipe`
 * machine slot.
 *
 * Mirrors the structure of `PxtEditorMachineDropdownCollapse.test.ts`:
 * exercise the public PxtEditor API at the workspacesync /
 * workspacesave seam. We do NOT compile blocks XML through PXT here
 * (PXT runs in an iframe we don't load in JSDOM); instead we hand
 * the editor the TS PXT WOULD produce after the GREEN refactor and
 * assert that `getProgram()` dispatches `SET_RECIPE` to the user's
 * chosen machine (Fab2, slot index 1) — proving the historical
 * "every Machine.X collapses to Machine.A" symptom is gone.
 *
 * EXPECTED FAILURE NOTE: this assertion will already PASS today
 * because the BlockInterpreter accepts the compiled TS shape PXT
 * WOULD produce after GREEN. It is included as the system-level
 * regression net for the PoC: GREEN must keep this passing while
 * the API change rolls through.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PxtEditor } from '../../../src/editor/PxtEditor'

function dispatchPxtMessage(data: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', { data }))
}

function flushAsync(): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, 80))
}

describe('PxtEditor — factory_set_recipe + factory_pick_machine reporter end-to-end (PoC)', () => {
  let editor: PxtEditor
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)

    editor = new PxtEditor()
    editor.mount(container)

    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const doc = iframe.contentWindow!.document
    doc.open()
    doc.write('<!doctype html><html><head></head><body></body></html>')
    doc.close()

    dispatchPxtMessage({ type: 'pxthost', action: 'workspacesync', id: 'sync-1' })
  })

  afterEach(() => {
    editor.dispose()
    if (container.parentNode) container.parentNode.removeChild(container)
    vi.restoreAllMocks()
  })

  it('getProgram() dispatches SET_RECIPE to Fab2 when the compiled TS uses pickMachine(Machine.B)', async () => {
    // GIVEN — slot mapping: Fab1@0, Fab2@1, Assembler@2.
    editor.interpreter.setMachineList([
      { slotIndex: 0, id: 'fab_1', name: 'Fab1' },
      { slotIndex: 1, id: 'fab_2', name: 'Fab2' },
      { slotIndex: 2, id: 'assembler_1', name: 'Assembler' },
    ])

    // GIVEN — the TS PXT produces after the API change for a
    // factory_set_recipe block whose machine slot holds a
    // factory_pick_machine reporter selecting Machine.B.
    const compiledTs =
      'machines.setRecipe(machines.pickMachine(Machine.B), Recipe.WheelPressLarge)\n'

    // WHEN — PXT echoes the compile result back via workspacesave.
    dispatchPxtMessage({
      type: 'pxthost',
      action: 'workspacesave',
      project: { text: { 'main.ts': compiledTs, 'main.blocks': '' } },
    })
    await flushAsync()

    // THEN — getProgram() dispatches SET_RECIPE to Fab2, NOT Fab1.
    const commands = editor.getProgram()
    const setRecipe = commands.find((c) => c.type === 'SET_RECIPE')
    expect(
      setRecipe,
      'getProgram() emitted no SET_RECIPE command — workspacesave plumbing ' +
        'or interpreter wiring broke.',
    ).toBeDefined()
    expect(
      (setRecipe as { machineId: string }).machineId,
      'SET_RECIPE landed on Fab1 (slot 0). The PoC requires that a ' +
        'pickMachine(Machine.B) reporter in the slot dispatches to Fab2 ' +
        '(slot 1). If this fails, the interpreter is collapsing the ' +
        'reporter call to its default — re-creating the historical bug.',
    ).toBe('fab_2')
    expect((setRecipe as { recipeId: string }).recipeId).toBe('wheel_press_large')
  })

  it('getProgram() dispatches each SET_RECIPE to the matching machine when a variable carries the reporter value', async () => {
    // GIVEN
    editor.interpreter.setMachineList([
      { slotIndex: 0, id: 'fab_1', name: 'Fab1' },
      { slotIndex: 1, id: 'fab_2', name: 'Fab2' },
    ])

    const compiledTs =
      'let m1 = machines.pickMachine(Machine.A)\n' +
      'let m2 = machines.pickMachine(Machine.B)\n' +
      'machines.setRecipe(m1, Recipe.WheelPressSmall)\n' +
      'machines.setRecipe(m2, Recipe.WheelPressLarge)\n'

    // WHEN
    dispatchPxtMessage({
      type: 'pxthost',
      action: 'workspacesave',
      project: { text: { 'main.ts': compiledTs, 'main.blocks': '' } },
    })
    await flushAsync()

    // THEN
    const setRecipes = editor.getProgram().filter((c) => c.type === 'SET_RECIPE') as Array<{
      machineId: string
      recipeId: string
    }>
    expect(setRecipes).toHaveLength(2)
    expect(setRecipes.map((c) => c.machineId)).toEqual(['fab_1', 'fab_2'])
    expect(setRecipes.map((c) => c.recipeId)).toEqual([
      'wheel_press_small',
      'wheel_press_large',
    ])
  })
})
