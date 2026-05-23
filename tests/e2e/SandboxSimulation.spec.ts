import { test, expect } from './pom'
import {
  FABRICATOR_TO_SHIPPER_PROGRAM,
  buildFabricatorToDestinationLayout,
  buildAndRunSandboxFactory,
  enterSandbox,
  setProgramAndStart,
  setupSingleFabricatorNoRecipeProgram,
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

    const programCode = FABRICATOR_TO_SHIPPER_PROGRAM

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

    const programCode = FABRICATOR_TO_SHIPPER_PROGRAM

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
    await gameOverModal.expectMessageText(
      "The Fabricator can't use Small Wheel. Check its recipe or where the belt leads.",
    )
    await gameOverModal.expectRestartButtonVisible()

    // Click Restart, assert modal hides
    await gameOverModal.clickRestart()
    await gameOverModal.expectHidden()
  })

  test('game-over modal appears immediately when a recipe-required machine is started without a recipe', async ({
    mainMenu, toolbar, grid, editorPanel, probe, gameOverModal,
  }) => {
    test.setTimeout(90000)

    await setupSingleFabricatorNoRecipeProgram(
      { mainMenu, toolbar, grid, editorPanel, probe },
      { closeEditorBeforeStart: true },
    )

    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()

    // Game-over modal MUST become visible within a few ticks. This will
    // FAIL today because the simulation does not yet emit a no_recipe
    // game-over reason.
    await gameOverModal.expectVisible(15_000)
    await gameOverModal.expectTitleText('Game Over')

    const messageText = await gameOverModal.getMessageText()
    const unconsumableInputMessage =
      "The Fabricator can't use Small Wheel. Check its recipe or where the belt leads."

    expect(messageText.length, 'Game-over message must be non-empty').toBeGreaterThan(0)
    expect(
      messageText,
      'no_recipe game-over message must differ from the unconsumable_input message',
    ).not.toBe(unconsumableInputMessage)
    expect(
      messageText,
      'Game-over message must reference the machine name (Fabricator)',
    ).toContain('Fabricator')
  })

  test('game-over modal renders above the open editor panel', async ({
    mainMenu, toolbar, grid, editorPanel, probe, gameOverModal,
  }) => {
    test.setTimeout(90000)

    await setupSingleFabricatorNoRecipeProgram(
      { mainMenu, toolbar, grid, editorPanel, probe },
      { closeEditorBeforeStart: false },
    )

    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()

    await gameOverModal.expectVisible(15_000)
    await gameOverModal.expectTitleText('Game Over')

    // Regression guard: previously the modal was trapped beneath
    // #editor-container (z=20) because #ui-overlay (z=10) created a
    // stacking context. Fixed by mounting the modal on document.body.
    await gameOverModal.expectTopmostAtSampledPoints()
  })

})

// ----------------------------------------------------------------------------
// Explicit machine start contract
// ----------------------------------------------------------------------------
//
// Regression coverage for the new "machines must be explicitly started"
// behavior: a Fabricator with a recipe but NO `startMachine(...)` call MUST
// remain idle and produce zero items. Today the Fabricator auto-runs as soon
// as a recipe is set; this describe block pins the desired contract and the
// negative-control test is expected to FAIL until production code is updated
// (Machine / MachineBehaviors / SimulationCommandDispatcher).
//
// Setup mirrors the canonical sandbox flow used by `buildAndRunSandboxFactory`
// — single Fabricator at (10,10) wired to a Shipper (factory_output) at
// (13,10) — but the program text is varied per test instead of using the
// shared scenario helper.
// ----------------------------------------------------------------------------

test.describe('Sandbox — Explicit machine start contract', () => {
  test('Fabricator with a recipe but NO startMachine call produces zero items', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(90000)

    await buildFabricatorToDestinationLayout(
      mainMenu,
      toolbar,
      grid,
      machinePanel,
      probe,
      'factory_output',
    )

    // Program contains ONLY a recipe assignment — no `startMachine` call.
    // Under the new contract, the Fabricator must remain idle and produce
    // nothing. Today the Fabricator auto-runs on a recipe alone, so this
    // assertion block is expected to FAIL until the production code is
    // updated.
    const recipeOnlyProgram = 'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)'

    await probe.resetOutputDeliveryRecording()
    await probe.startOutputDeliveryRecording()

    await setProgramAndStart(toolbar, editorPanel, recipeOnlyProgram)

    // Confirm simulation actually started (the recorder needs the sim to exist
    // for output_delivered events to be wired up, and starting the sim is
    // also a precondition for the negative assertion to be meaningful).
    await expect.poll(() => probe.isRunning(), { timeout: 5000 }).toBe(true)

    // Let the simulation run for several real seconds. With the recipe alone
    // and no `startMachine` call, no items should ever be produced.
    await probe.settle(6000)

    const snapshot = await probe.readSnapshot()
    const deliveries = await probe.readOutputDeliveries()

    expect(
      deliveries.length,
      'Shipper must receive ZERO deliveries when no startMachine() command was issued',
    ).toBe(0)
    expect(
      snapshot.itemsOnBelts,
      'No items must appear on belts when no startMachine() command was issued',
    ).toBe(0)
    for (const machine of snapshot.machineStates) {
      expect(
        machine.consumedItems,
        `Machine ${machine.id} must not have consumed any items without startMachine()`,
      ).toBe(0)
    }
  })

  test('Sanity check: same setup WITH startMachine produces items (positive control)', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(90000)

    await buildFabricatorToDestinationLayout(
      mainMenu,
      toolbar,
      grid,
      machinePanel,
      probe,
      'factory_output',
    )

    const recipeAndStartProgram = FABRICATOR_TO_SHIPPER_PROGRAM

    await probe.resetOutputDeliveryRecording()
    await probe.startOutputDeliveryRecording()

    await setProgramAndStart(toolbar, editorPanel, recipeAndStartProgram)

    await expect.poll(() => probe.isRunning(), { timeout: 5000 }).toBe(true)

    await expect(async () => {
      const snap = await probe.readSnapshot()
      expect(snap.itemsOnBelts).toBeGreaterThan(0)
    }).toPass({ timeout: 30000, intervals: [250] })

    await expect(async () => {
      const deliveries = await probe.readOutputDeliveries()
      expect(deliveries.length).toBeGreaterThan(0)
    }).toPass({ timeout: 30000, intervals: [250] })
  })
})

// ----------------------------------------------------------------------------
// Wait block contract
// ----------------------------------------------------------------------------
//
// Pins behavior of a new `loops.wait(ms)` PXT block / interpreter handler:
//
//   * The wait pauses ONLY the command queue — it must delay any subsequent
//     command (e.g. stopMachine) by `ms` milliseconds (interpreter converts
//     to ticks at 10 ticks/sec, ceil rounding).
//   * Machines that are already enabled MUST keep ticking during the wait.
//
// All three tests are expected to FAIL today because:
//   - `loops.wait` is not defined on the namespace object passed to
//     `new Function(...)` inside BlockInterpreter, so the program throws at
//     the wait call.
//   - The interpreter swallows the throw, which silently skips every command
//     issued AFTER the wait (including the stopMachine in the wait+stop
//     scenario). That means today the Fabricator is NEVER stopped → deliveries
//     keep growing across the whole run, breaking the "count is frozen after
//     wait expires" assertions.
// ----------------------------------------------------------------------------

test.describe('Sandbox — wait block', () => {
  test('wait(2000) pauses a subsequent stopMachine until 2s have elapsed', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(120000)

    await buildFabricatorToDestinationLayout(
      mainMenu,
      toolbar,
      grid,
      machinePanel,
      probe,
      'factory_output',
    )

    // setRecipe + startMachine fire immediately (tick 0).
    // wait(2000) blocks the command queue for ~2s.
    // stopMachine fires AFTER the wait expires (~tick 20).
    const waitThenStopProgram =
      'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
      'machines.startMachine(Machine.A)\n' +
      'machines.startMachine(Machine.B)\n' +
      'loops.wait(2000)\n' +
      'machines.stopMachine(Machine.A)'

    await probe.resetOutputDeliveryRecording()
    await probe.startOutputDeliveryRecording()

    await setProgramAndStart(toolbar, editorPanel, waitThenStopProgram)

    await expect.poll(() => probe.isRunning(), { timeout: 5000 }).toBe(true)
    const startTick = await probe.getCurrentTick()

    // Sanity: the machine started immediately (tick 0), so it MUST have
    // produced at least one delivery within a generous window. We poll
    // rather than time-pin because belt traversal time depends on belt
    // length and speed.
    await expect(async () => {
      const deliveries = await probe.readOutputDeliveries()
      expect(deliveries.length).toBeGreaterThan(0)
    }).toPass({ timeout: 15000, intervals: [250] })

    // ~50 sim-ticks after start (≈ 5s at 10 Hz nominal): wait expires at
    // tick 20, stopMachine fires, in-flight items have ~30 ticks to drain
    // to the Shipper. Polling on `currentTick` keeps the contract
    // deterministic under parallel-worker host throttling (where wall-
    // clock seconds can yield far fewer simulation ticks than nominal).
    await expect
      .poll(() => probe.getCurrentTick(), { timeout: 60000, intervals: [250] })
      .toBeGreaterThanOrEqual(startTick + 50)
    const postStopDeliveries = (await probe.readOutputDeliveries()).length
    expect(
      postStopDeliveries,
      'Machine produced for ~2s before stop; some deliveries must have arrived by tick 50',
    ).toBeGreaterThan(0)

    // 20 more sim-ticks past the first sample. Because the machine is
    // stopped (drain already complete by tick 50), no additional deliveries
    // may occur. A short post-drain window is enough to pin the contract.
    await expect
      .poll(() => probe.getCurrentTick(), { timeout: 60000, intervals: [250] })
      .toBeGreaterThanOrEqual(startTick + 70)
    const finalDeliveries = (await probe.readOutputDeliveries()).length
    expect(
      finalDeliveries,
      'After stopMachine fires (post-wait), no further deliveries may be recorded',
    ).toBe(postStopDeliveries)
  })

  test('wait does not block already-running machines (Fabricator keeps producing during wait)', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(90000)

    await buildFabricatorToDestinationLayout(
      mainMenu,
      toolbar,
      grid,
      machinePanel,
      probe,
      'factory_output',
    )

    // Same wait+stop program — but here we sample DURING the 2s wait window
    // to prove the simulation keeps ticking (the wait only gates the command
    // queue, not the simulation itself).
    const waitThenStopProgram =
      'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
      'machines.startMachine(Machine.A)\n' +
      'machines.startMachine(Machine.B)\n' +
      'loops.wait(2000)\n' +
      'machines.stopMachine(Machine.A)'

    await probe.resetOutputDeliveryRecording()
    await probe.startOutputDeliveryRecording()

    await setProgramAndStart(toolbar, editorPanel, waitThenStopProgram)

    await expect.poll(() => probe.isRunning(), { timeout: 5000 }).toBe(true)
    const startTick = await probe.getCurrentTick()

    // Sample 1: 5 sim-ticks (~0.5s nominal) into the wait window. The
    // `wait(2000)` command queues 20 ticks of pause for the command
    // queue, so both samples land BEFORE the stopMachine fires at tick 20.
    // Using `currentTick` instead of wall-clock keeps the assertion
    // deterministic under parallel-worker host throttling where
    // wall-clock seconds may yield far fewer ticks than nominal.
    await expect
      .poll(() => probe.getCurrentTick(), { timeout: 30000, intervals: [100] })
      .toBeGreaterThanOrEqual(startTick + 5)
    const snapEarly = await probe.readSnapshot()
    const earlyOnBelt = snapEarly.itemsOnBelts
    const earlyConsumed = snapEarly.machineStates.reduce(
      (sum, m) => sum + (m.consumedItems ?? 0), 0,
    )

    // Sample 2: 15 sim-ticks (~1.5s nominal) into the wait window (still
    // BEFORE the wait expires at tick 20 and the stopMachine fires).
    await expect
      .poll(() => probe.getCurrentTick(), { timeout: 30000, intervals: [100] })
      .toBeGreaterThanOrEqual(startTick + 15)
    const snapMid = await probe.readSnapshot()
    const midOnBelt = snapMid.itemsOnBelts
    const midConsumed = snapMid.machineStates.reduce(
      (sum, m) => sum + (m.consumedItems ?? 0), 0,
    )

    // The simulation must have advanced between the two samples — either new
    // items were placed on the belt OR the Fabricator consumed input. (We
    // accept either signal because in a steady-state pipeline the belt may
    // already be full at sample 1, and the only observable progress is on
    // the consumed-input counter.)
    const beltGrew = midOnBelt > earlyOnBelt
    const consumedGrew = midConsumed > earlyConsumed
    expect(
      beltGrew || consumedGrew,
      `Simulation must keep ticking during loops.wait — itemsOnBelts ${earlyOnBelt}->${midOnBelt}, consumed ${earlyConsumed}->${midConsumed}`,
    ).toBe(true)
  })

  test('positive control: same setup WITHOUT wait+stop produces noticeably more deliveries over 7s', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(90000)

    await buildFabricatorToDestinationLayout(
      mainMenu,
      toolbar,
      grid,
      machinePanel,
      probe,
      'factory_output',
    )

    // Plain setRecipe + startMachine — Fabricator runs uninterrupted.
    const recipeAndStartProgram = FABRICATOR_TO_SHIPPER_PROGRAM

    await probe.resetOutputDeliveryRecording()
    await probe.startOutputDeliveryRecording()

    await setProgramAndStart(toolbar, editorPanel, recipeAndStartProgram)

    await expect.poll(() => probe.isRunning(), { timeout: 5000 }).toBe(true)

    // Mirror the wait+stop scenario's observation window as a SIMULATION-
    // TICK budget instead of wall-clock seconds: 7s × 10 Hz nominal tick
    // rate ≈ 70 ticks. Polling on `currentTick` keeps the contract
    // deterministic under parallel-worker host throttling (where the
    // browser may produce noticeably fewer ticks per real second than
    // nominal). The wall-clock `timeout` is a generous upper bound only.
    const startTick = await probe.getCurrentTick()
    const targetTick = startTick + 70

    await expect
      .poll(
        async () => {
          const ticks = await probe.getCurrentTick()
          const deliveries = (await probe.readOutputDeliveries()).length
          return ticks >= targetTick && deliveries >= 4
        },
        {
          timeout: 60000,
          intervals: [250],
          message:
            'Simulation must advance ~70 ticks AND Fabricator must deliver ≥ 4 items unstopped',
        },
      )
      .toBe(true)

    const finalTick = await probe.getCurrentTick()
    const deliveries = (await probe.readOutputDeliveries()).length

    expect(
      finalTick - startTick,
      'Simulation must have advanced at least ~70 ticks during the observation window',
    ).toBeGreaterThanOrEqual(70)

    // The wait+stop variant freezes deliveries at whatever was in-flight
    // when stopMachine fired (~2s of production). Without the stop, the
    // Fabricator runs the full ~70-tick window — that must produce
    // strictly MORE deliveries. We assert a threshold (>= 4) that's
    // comfortably higher than what 2s of production yields.
    expect(
      deliveries,
      'Without wait+stop, the Fabricator runs the full ~70-tick window and must deliver more items than the wait+stop scenario',
    ).toBeGreaterThanOrEqual(4)
  })

  test('waitTicks(20) pauses a subsequent stopMachine until ~2s have elapsed', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(120000)

    await buildFabricatorToDestinationLayout(
      mainMenu,
      toolbar,
      grid,
      machinePanel,
      probe,
      'factory_output',
    )

    // setRecipe + startMachine fire immediately (tick 0).
    // waitTicks(20) blocks the command queue for 20 simulation ticks
    // (~2s at the default 10 Hz tick rate).
    // stopMachine fires AFTER the wait expires (~tick 20).
    const waitTicksThenStopProgram =
      'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
      'machines.startMachine(Machine.A)\n' +
      'machines.startMachine(Machine.B)\n' +
      'loops.waitTicks(20)\n' +
      'machines.stopMachine(Machine.A)'

    await probe.resetOutputDeliveryRecording()
    await probe.startOutputDeliveryRecording()

    await setProgramAndStart(toolbar, editorPanel, waitTicksThenStopProgram)

    await expect.poll(() => probe.isRunning(), { timeout: 5000 }).toBe(true)
    const startTick = await probe.getCurrentTick()

    // Sanity: the machine started immediately (tick 0), so it MUST have
    // produced at least one delivery within a generous window.
    await expect(async () => {
      const deliveries = await probe.readOutputDeliveries()
      expect(deliveries.length).toBeGreaterThan(0)
    }).toPass({ timeout: 15000, intervals: [250] })

    // ~50 sim-ticks after start (≈ 5s at 10 Hz nominal): waitTicks(20)
    // has expired at tick 20, stopMachine has fired, in-flight items
    // have had ~30 ticks to drain to the Shipper. Polling on
    // `currentTick` keeps the contract deterministic under parallel-
    // worker host throttling.
    await expect
      .poll(() => probe.getCurrentTick(), { timeout: 60000, intervals: [250] })
      .toBeGreaterThanOrEqual(startTick + 50)
    const postStopDeliveries = (await probe.readOutputDeliveries()).length
    expect(
      postStopDeliveries,
      'Machine produced for ~2s before stop; some deliveries must have arrived by tick 50',
    ).toBeGreaterThan(0)

    // 20 more sim-ticks past the first sample. Because the machine is
    // stopped (drain already complete by tick 50), no additional deliveries
    // may occur. A short post-drain window is enough to pin the contract.
    await expect
      .poll(() => probe.getCurrentTick(), { timeout: 60000, intervals: [250] })
      .toBeGreaterThanOrEqual(startTick + 70)
    const finalDeliveries = (await probe.readOutputDeliveries()).length
    expect(
      finalDeliveries,
      'After stopMachine fires (post-waitTicks), no further deliveries may be recorded',
    ).toBe(postStopDeliveries)
  })
})