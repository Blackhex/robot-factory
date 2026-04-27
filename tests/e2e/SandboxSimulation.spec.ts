import { test, expect } from './pom'
import {
  buildAndRunSandboxFactory,
  enterSandbox,
} from './pom/scenarios/SandboxFactoryScenario'

// Use a wide viewport so the PXT editor has enough room for the toolbox + workspace
test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('Sandbox Simulation — Full Factory Flow (UI-only)', () => {
  test('place machines, program editor, run simulation, verify item production', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, hud, pxt, probe,
  }) => {
    test.setTimeout(90000)

    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()

    await grid.expectCanvasVisible()

    await grid.dblClickCell({ x: 10, z: 10 })

    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()
    await machinePanel.expectNamePlaceholder('Fabricator')
    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    await grid.dblClickCell({ x: 13, z: 10 })
    await grid.clickCell({ x: 13, z: 10 })
    await machinePanel.expectVisible()
    await machinePanel.selectType('factory_output')
    await machinePanel.expectTypeValue('factory_output')
    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    const placedMachines = await probe.getMachines()
    const fabricator = placedMachines.find((m) => m.type === 'part_fabricator')
    const output = placedMachines.find((m) => m.type === 'factory_output')
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

    const isPxtLoaded = await pxt.isPxtIframeVisible(8000)

    if (isPxtLoaded) {
      await pxt.waitForBlocklyWorkspaceVisible()
      await pxt.waitForToolboxInteractive()

      await pxt.clickToolboxCategoryByIndex(0)
      await pxt.dragBlockFromFlyout('set recipe', 0)

      await pxt.clickToolboxCategoryByIndex(0)
      await pxt.dragBlockFromFlyout('start', 80)

      await pxt.setFallbackProgramViaValueAssignment(programCode)
    } else {
      await editorPanel.expectFallbackTextareaVisible()
      await editorPanel.fillFallbackProgram(programCode)
    }

    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()

    await hud.expectVisible()

    await hud.expectItemsDeliveredGreaterThan(0, 20000)
    await hud.expectTimeAdvancing(10000)

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
    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()

    const layoutBefore = await probe.readSnapshot()
    expect(layoutBefore.machineCount).toBe(2)
    expect(layoutBefore.beltCount).toBeGreaterThan(0)

    await expect(async () => {
      const snap = await probe.readSnapshot()
      expect(snap.itemsOnBelts).toBeGreaterThan(0)
    }).toPass({ timeout: 30000, intervals: [250] })

    const beforeRestart = await probe.readSnapshot()
    expect(beforeRestart.itemsOnBelts).toBeGreaterThan(0)
    expect(beforeRestart.running).toBe(true)

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

    for (const machine of afterRestart.machineStates) {
      expect(machine.state).toBe('idle')
      expect(machine.inputSlots).toBe(0)
      expect(machine.outputSlot).toBe(false)
      expect(machine.consumedItems).toBe(0)
    }

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
    for (const mesh of after.meshes) {
      expect(mesh.count).toBe(0)
      expect(mesh.instancesAtItemY).toBe(0)
    }
  })

  test('Pause should freeze rendered belt items in place; Resume advances them again', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(90000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)
    await expect(async () => {
      const snap = await probe.readItemInstancePositions()
      expect(snap.totalCount).toBeGreaterThan(0)
    }).toPass({ timeout: 15000, intervals: [200] })

    const running1 = await probe.readItemInstancePositions()
    await probe.settle(400)
    const running2 = await probe.readItemInstancePositions()
    expect(running2.totalCount).toBeGreaterThan(0)
    const runningDelta =
      Math.abs(running2.sumX - running1.sumX) + Math.abs(running2.sumZ - running1.sumZ)
    expect(
      runningDelta,
      'Sanity check: items must visibly advance while the simulation is running',
    ).toBeGreaterThan(1e-3)

    const noJump = await probe.capturePositionsAcrossPause()
    expect(
      noJump.after.totalCount,
      `Item count changed across pause boundary: ${noJump.before.totalCount} -> ${noJump.after.totalCount}`,
    ).toBe(noJump.before.totalCount)
    let maxPerItemJump = 0
    for (let index = 0; index < noJump.before.positions.length; index++) {
      const before = noJump.before.positions[index]
      const after = noJump.after.positions[index]
      const distance = Math.hypot(after.x - before.x, after.z - before.z)
      if (distance > maxPerItemJump) maxPerItemJump = distance
    }
    expect(
      maxPerItemJump,
      `At least one item jumped on pause by ${maxPerItemJump.toFixed(4)} world units`,
    ).toBeLessThan(1e-3)

    await toolbar.expectPauseButtonText('Resume')
    await expect.poll(() => probe.isPaused(), { timeout: 2000 }).toBe(true)

    await probe.flushAnimationFrame()
    const paused1 = await probe.readItemInstancePositions()
    expect(paused1.totalCount).toBeGreaterThan(0)

    await probe.settle(1000)
    await probe.flushAnimationFrame()
    const paused2 = await probe.readItemInstancePositions()

    expect(
      paused2.totalCount,
      `Items rendered changed while paused: ${paused1.totalCount} -> ${paused2.totalCount}`,
    ).toBe(paused1.totalCount)

    const pauseDelta =
      Math.abs(paused2.sumX - paused1.sumX) + Math.abs(paused2.sumZ - paused1.sumZ)
    expect(
      pauseDelta,
      `Rendered items moved while simulation was paused: ` +
        `delta(sumX)=${(paused2.sumX - paused1.sumX).toFixed(4)}, ` +
        `delta(sumZ)=${(paused2.sumZ - paused1.sumZ).toFixed(4)}`,
    ).toBeLessThan(1e-4)

    await toolbar.clickPause()
    await toolbar.expectPauseButtonText('Pause')
    await expect.poll(() => probe.isPaused(), { timeout: 2000 }).toBe(false)

    await probe.settle(500)
    const resumed = await probe.readItemInstancePositions()
    expect(resumed.totalCount).toBeGreaterThan(0)

    const resumeDelta =
      Math.abs(resumed.sumX - paused2.sumX) + Math.abs(resumed.sumZ - paused2.sumZ)
    expect(
      resumeDelta,
      'Items must advance again after Resume',
    ).toBeGreaterThan(1e-3)
  })
})

test.describe('Sandbox — Live machine drag pause semantics', () => {
  test('holding a live machine drag keeps simulation unpaused and resumes after drop', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(90000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)

    const machinesBefore = await probe.getMachines()
    const output = machinesBefore.find((m) => m.type === 'factory_output')
    expect(output, 'destination machine must exist before live drag').toBeTruthy()

    expect(await probe.isRunning()).toBe(true)
    expect(await probe.isPaused()).toBe(false)

    const occupiedCells = new Set(machinesBefore.map((machine) => `${machine.x},${machine.z}`))
    const destination = [
      { x: output!.x + 3, z: output!.z },
      { x: output!.x - 3, z: output!.z },
      { x: output!.x, z: output!.z + 3 },
      { x: output!.x, z: output!.z - 3 },
    ].find((cell) =>
      cell.x >= 0 && cell.x < 20 &&
      cell.z >= 0 && cell.z < 20 &&
      !occupiedCells.has(`${cell.x},${cell.z}`),
    )
    expect(destination, 'live drag needs a valid empty destination cell').toBeTruthy()
    const pauseSemantics = await grid.dragMachineToCellCapturingPauseSemantics(
      { x: output!.x, z: output!.z },
      destination!,
    )

    expect(pauseSemantics.beforeDrag.running).toBe(true)
    expect(pauseSemantics.beforeDrag.paused).toBe(false)
    expect(pauseSemantics.whilePointerHeldAtDestination.running).toBe(true)
    expect(
      pauseSemantics.whilePointerHeldAtDestination.paused,
      'Starting and holding a live machine drag must not leave the simulation paused before drop',
    ).toBe(false)
    expect(pauseSemantics.afterDrop.running).toBe(true)
    expect(
      pauseSemantics.afterDrop.paused,
      'Simulation must be resumed after the valid machine drop commit completes',
    ).toBe(false)

    const machinesAfter = await probe.getMachines()
    const movedOutput = machinesAfter.find((m) => m.id === output!.id)
    expect(movedOutput, 'same destination machine must still exist after live drag').toBeTruthy()
    expect(movedOutput!.x).toBe(destination!.x)
    expect(movedOutput!.z).toBe(destination!.z)
  })
})

test.describe('Sandbox — Game Over modal', () => {
  test('game-over modal appears when an item reaches a machine that cannot consume it', async ({
    mainMenu, toolbar, grid, editorPanel, probe, gameOverModal,
  }) => {
    test.setTimeout(90000)

    // Enter sandbox mode
    await enterSandbox(mainMenu, toolbar)
    await grid.expectCanvasVisible()

    // Place fabricator A at (10,10) — default type is part_fabricator
    await grid.dblClickCell({ x: 10, z: 10 })

    // Place fabricator B at (13,10) — leave as part_fabricator with NO recipe
    await grid.dblClickCell({ x: 13, z: 10 })

    // Connect A → B via belt
    const machines = await probe.getMachines()
    const machineA = machines.find((m) => m.x === 10 && m.z === 10)
    const machineB = machines.find((m) => m.x === 13 && m.z === 10)
    expect(machineA, 'Machine A must exist at (10,10)').toBeTruthy()
    expect(machineB, 'Machine B must exist at (13,10)').toBeTruthy()

    const beltPlaced = await probe.placeBeltViaTestApi(
      machineA!.x, machineA!.z, machineB!.x, machineB!.z,
    )
    expect(beltPlaced).toBe(true)

    // Program: set recipe on Machine A only, start it
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    const programCode =
      'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
      'machines.startMachine(Machine.A)'
    await editorPanel.expectFallbackTextareaAttached()
    await editorPanel.setFallbackProgramViaValueAssignment(programCode)
    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    // Start simulation
    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()

    // Wait for game-over modal — this MUST timeout now because
    // wireSimulationEffects() is not called in sandbox mode
    await gameOverModal.expectVisible(30_000)
    await gameOverModal.expectTitleText('Game Over')
    await gameOverModal.expectRestartButtonVisible()

    // Click Restart, assert modal hides
    await gameOverModal.clickRestart()
    await gameOverModal.expectHidden()
  })
})