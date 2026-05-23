import { test, expect } from './pom'
import { enterSandbox } from './pom/scenarios/SandboxFactoryScenario'

const PROGRAM = [
  'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)',
  'machines.setRecipe(Machine.B, Recipe.WheelPressSmall)',
  'machines.setRecipe(Machine.C, Recipe.AssembleDrivetrainBasic)',
  'machines.startMachine(Machine.A)',
  'machines.startMachine(Machine.B)',
  'machines.startMachine(Machine.C)',
  'machines.startMachine(Machine.D)',
].join('\n')

test.describe('Starvation diagnostic', () => {
  test('reports live machine state with 2 fabs + assembler + splitter', async ({
    page,
    mainMenu,
    toolbar,
    grid,
    editorPanel,
    probe,
  }) => {
    test.setTimeout(120_000)

    await enterSandbox(mainMenu, toolbar)
    await grid.expectCanvasVisible()

    // Place machines via direct factory API in the order:
    // A=fab1, B=fab2, C=assembler, D=splitter
    expect(await probe.placeMachineDirect(8, 9, 'part_fabricator')).toBe(true)
    expect(await probe.placeMachineDirect(8, 11, 'part_fabricator')).toBe(true)
    expect(await probe.placeMachineDirect(11, 10, 'assembler')).toBe(true)
    expect(await probe.placeMachineDirect(14, 10, 'splitter')).toBe(true)

    // Belts: fab1 → assembler, fab2 → assembler, assembler → QC
    expect(await probe.placeBeltViaTestApi(8, 9, 11, 10)).toBe(true)
    expect(await probe.placeBeltViaTestApi(8, 11, 11, 10)).toBe(true)
    expect(await probe.placeBeltViaTestApi(11, 10, 14, 10)).toBe(true)

    // Program editor.
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectFallbackTextareaAttached()
    await editorPanel.setFallbackProgramViaValueAssignment(PROGRAM)
    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    const beforeStart = await probe.readDiagnosticSnapshot()
    console.log('=== BEFORE START ===')
    console.log(JSON.stringify(beforeStart, null, 2))

    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()

    // Settle for ~3 seconds of wall time.
    await page.waitForTimeout(3000)

    const after = await probe.readDiagnosticSnapshot()
    console.log('=== AFTER ~3s ===')
    console.log(JSON.stringify(after, null, 2))

    await page.screenshot({ path: 'test-results/starvation-diagnostic.png', fullPage: true })

    // Always pass — diagnostic only.
    expect(after).toBeTruthy()
  })
})
