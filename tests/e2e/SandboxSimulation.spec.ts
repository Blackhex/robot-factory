import { test, expect } from './pom'
import type { SimulationProbe } from './pom/canvas/SimulationProbe'
import type { FactoryGridPage } from './pom/canvas/FactoryGridPage'
import type { ToolbarPage } from './pom/screens/ToolbarPage'
import type { MachinePanelPage } from './pom/screens/MachinePanelPage'
import type { EditorPanelPage } from './pom/screens/EditorPanelPage'
import type { MainMenuPage } from './pom/screens/MainMenuPage'

// Use a wide viewport so the PXT editor has enough room for the toolbox + workspace
test.use({ viewport: { width: 1920, height: 1080 } })

async function enterSandbox(mainMenu: MainMenuPage, toolbar: ToolbarPage) {
  await mainMenu.open()
  await mainMenu.clickSandbox()
  await toolbar.expectVisible()
  // Wait for the camera zoom-to-fit animation
  await toolbar.waitForCameraSettle()
}

async function buildAndRunSandboxFactory(
  mainMenu: MainMenuPage,
  toolbar: ToolbarPage,
  grid: FactoryGridPage,
  machinePanel: MachinePanelPage,
  editorPanel: EditorPanelPage,
  probe: SimulationProbe,
) {
  await enterSandbox(mainMenu, toolbar)
  await grid.expectCanvasVisible()

  await grid.dblClickCell({ x: 10, z: 10 })
  await grid.dblClickCell({ x: 13, z: 10 })

  await grid.clickCell({ x: 13, z: 10 })
  await machinePanel.expectVisible()
  await machinePanel.selectType('factory_output')
  await machinePanel.expectTypeValue('factory_output')
  await machinePanel.clickClose()
  await machinePanel.expectHidden()

  const machines = await probe.getMachines()
  const fabricator = machines.find((m) => m.type === 'part_fabricator')
  const output = machines.find((m) => m.type === 'factory_output')
  expect(fabricator).toBeTruthy()
  expect(output).toBeTruthy()

  const beltPlaced = await probe.placeBeltViaTestApi(
    fabricator!.x, fabricator!.z, output!.x, output!.z,
  )
  expect(beltPlaced).toBe(true)

  await toolbar.clickEditor()
  await editorPanel.expectOpen()
  const programCode =
    'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
    'machines.startMachine(Machine.A)'
  await editorPanel.expectFallbackTextareaAttached()
  await editorPanel.setFallbackProgramViaValueAssignment(programCode)
  await toolbar.clickEditor()
  await editorPanel.expectClosed()

  await toolbar.clickStart()
  await expect(async () => {
    const snap = await probe.readSnapshot()
    expect(snap.itemsOnBelts).toBeGreaterThan(0)
  }).toPass({ timeout: 30000, intervals: [250] })
}

test.describe('Sandbox Simulation — Full Factory Flow (UI-only)', () => {
  test('place machines, program editor, run simulation, verify item production', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, hud, pxt, probe,
  }) => {
    test.setTimeout(90000)

    // ======================== STEP 1: Enter sandbox ========================
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()

    await grid.expectCanvasVisible()

    // ======================== STEP 2: Place machines =========================
    await grid.dblClickCell({ x: 10, z: 10 })

    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()
    await machinePanel.expectNamePlaceholder('Fabricator')
    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    // Second machine: convert to factory_output so produced items can be delivered.
    await grid.dblClickCell({ x: 13, z: 10 })
    await grid.clickCell({ x: 13, z: 10 })
    await machinePanel.expectVisible()
    await machinePanel.selectType('factory_output')
    await machinePanel.expectTypeValue('factory_output')
    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    // Connect the two machines with a belt so produced items can travel.
    const placedMachines = await probe.getMachines()
    const fabricator = placedMachines.find((m) => m.type === 'part_fabricator')
    const output = placedMachines.find((m) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(output).toBeTruthy()
    const beltPlaced = await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, output!.x, output!.z,
    )
    expect(beltPlaced).toBe(true)

    // ======================== STEP 3: Open editor & set program =============
    await toolbar.clickEditor()
    await editorPanel.expectOpen()

    const programCode =
      'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
      'machines.startMachine(Machine.A)'

    const isPxtLoaded = await pxt.isPxtIframeVisible(8000)

    if (isPxtLoaded) {
      await pxt.waitForBlocklyWorkspaceVisible()
      await pxt.waitForToolboxInteractive()

      // Open "Actions" category (index 0 — the only category in the sandbox
      // toolbox at level 1) and drag "set recipe" block.
      await pxt.clickToolboxCategoryByIndex(0)
      await pxt.dragBlockFromFlyout('set recipe', 0)

      // Re-open the same "Actions" category and drag "start" block.
      await pxt.clickToolboxCategoryByIndex(0)
      await pxt.dragBlockFromFlyout('start', 80)

      // Also write to the fallback textarea as a reliable getProgram() source
      await pxt.setFallbackProgramViaValueAssignment(programCode)
    } else {
      await editorPanel.expectFallbackTextareaVisible()
      await editorPanel.fillFallbackProgram(programCode)
    }

    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    // ======================== STEP 4: Start simulation ======================
    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()

    await hud.expectVisible()

    // ======================== STEP 5: Verify simulation runs =================
    await hud.expectItemsDeliveredGreaterThan(0, 20000)
    await hud.expectTimeAdvancing(10000)

    // ======================== STEP 6: Restart and verify ====================
    await toolbar.clickRestart()
    await probe.settle(500)

    const finalItems = await hud.getItemsDelivered()
    expect(finalItems).toBeGreaterThan(0)
  })
})

test.describe('Sandbox — Restart clears in-flight items and resets machines', () => {
  test('Restart wipes belts + machine slots while preserving layout', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(90000)

    // ======================== STEP 1: Enter sandbox ========================
    await enterSandbox(mainMenu, toolbar)

    await grid.expectCanvasVisible()

    // ======================== STEP 2: Place two machines ====================
    await grid.dblClickCell({ x: 10, z: 10 })
    await grid.dblClickCell({ x: 13, z: 10 })

    await grid.clickCell({ x: 13, z: 10 })
    await machinePanel.expectVisible()
    await machinePanel.selectType('factory_output')
    await machinePanel.expectTypeValue('factory_output')
    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    // ======================== STEP 3: Connect with belt =====================
    const machines = await probe.getMachines()
    const fabricator = machines.find((m) => m.type === 'part_fabricator')
    const output = machines.find((m) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(output).toBeTruthy()

    const beltPlaced = await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, output!.x, output!.z,
    )
    expect(beltPlaced).toBe(true)

    // ======================== STEP 4: Write program =========================
    await toolbar.clickEditor()
    await editorPanel.expectOpen()

    const programCode =
      'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
      'machines.startMachine(Machine.A)'

    await editorPanel.expectFallbackTextareaAttached()
    await editorPanel.setFallbackProgramViaValueAssignment(programCode)

    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    // ======================== STEP 5: Start simulation ======================
    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()

    const layoutBefore = await probe.readSnapshot()
    expect(layoutBefore.machineCount).toBe(2)
    expect(layoutBefore.beltCount).toBeGreaterThan(0)

    // ======================== STEP 6: Wait until belts have items ===========
    await expect(async () => {
      const snap = await probe.readSnapshot()
      expect(snap.itemsOnBelts).toBeGreaterThan(0)
    }).toPass({ timeout: 30000, intervals: [250] })

    const beforeRestart = await probe.readSnapshot()
    expect(beforeRestart.itemsOnBelts).toBeGreaterThan(0)
    expect(beforeRestart.running).toBe(true)

    // ======================== STEP 7: Click Restart =========================
    await toolbar.clickRestart()
    await probe.settle(300)

    const afterRestart = await probe.readSnapshot()

    expect(afterRestart.running).toBe(false)

    expect(afterRestart.machineCount).toBe(beforeRestart.machineCount)
    expect(afterRestart.beltCount).toBe(beforeRestart.beltCount)

    expect(afterRestart.itemsOnBelts).toBe(0)
    for (const count of afterRestart.beltItemCounts) {
      expect(count).toBe(0)
    }

    for (const m of afterRestart.machineStates) {
      expect(m.state).toBe('idle')
      expect(m.inputSlots).toBe(0)
      expect(m.outputSlot).toBe(false)
      expect(m.consumedItems).toBe(0)
    }

    // ======================== STEP 8: Layout still works ====================
    await toolbar.clickStart()
    await expect(async () => {
      const snap = await probe.readSnapshot()
      expect(snap.itemsOnBelts).toBeGreaterThan(0)
    }).toPass({ timeout: 30000, intervals: [250] })
  })

  test('Restart should clear all item meshes from the rendered scene', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(90000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)

    // Sanity: items must be rendered before Restart
    await expect(async () => {
      const before = await probe.readSceneItemMeshes()
      expect(before.totalCount).toBeGreaterThan(0)
    }).toPass({ timeout: 10000, intervals: [200] })

    const before = await probe.readSceneItemMeshes()
    expect(before.totalCount).toBeGreaterThan(0)

    await toolbar.clickRestart()
    await probe.settle(500)
    await probe.flushAnimationFrame()

    const sim = await probe.readSnapshot()
    expect(sim.itemsOnBelts).toBe(0)

    const after = await probe.readSceneItemMeshes()
    expect(
      after.totalCount,
      `Expected 0 ghost item instances in the scene after Restart, got ${after.totalCount} ` +
        `(per-mesh counts: ${JSON.stringify(after.meshes)})`,
    ).toBe(0)
    for (const m of after.meshes) {
      expect(m.count).toBe(0)
      expect(m.instancesAtItemY).toBe(0)
    }
  })
})
