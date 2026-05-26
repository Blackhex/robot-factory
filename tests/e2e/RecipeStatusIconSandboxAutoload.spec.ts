import { test, expect } from './pom'
import type { FactorySaveLike } from './pom/data/saves'

/**
 * Bug pin: when sandbox is loaded with an existing saved scene whose
 * PXT program already contains a `set recipe` block, the per-machine
 * recipe-status badge is NOT visible until the player presses Start.
 *
 * The autoload code path (`setupLevelRendering` → `autoRestoreFactory`)
 * restores machines + belts into the Factory and loads the saved PXT
 * workspace XML into the editor, but never runs `populateSimulation()`
 * / `applyBuildPhaseProgramPreview()`. As a result the live `Machine`
 * instances have no `currentRecipe` and the renderer's runtime accessor
 * returns `hasRecipe: false`, so the recipe-icon mesh is never created.
 *
 * These tests pin that contract by SEEDING a sandbox project save
 * directly into `localStorage` via `SaveManager.seedSandboxProjectAsActive`
 * BEFORE the page boots. That is the cleanest available seam: the same
 * data shape the in-app save flow writes, with no flake from autosave
 * debounce timers. After `mainMenu.clickSandbox()` the app must run the
 * autoload path and produce a visible badge — without the user pressing
 * Start.
 */
test.use({ viewport: { width: 1920, height: 1080 } })

const WHITE = 0xffffff
const RED = 0xff3333

const FAB_CELL = { x: 10, z: 10 }
const ASSEMBLER_CELL = { x: 13, z: 10 }

/** Build a sandbox FactorySave whose PXT program sets a recipe on `Machine.A`. */
function buildSandboxSave(
  machineType: 'part_fabricator' | 'assembler',
  cell: { x: number; z: number },
  pxtRecipe: string,
): FactorySaveLike {
  // `Machine.A` resolves to the first dynamic machine (slotIndex 0),
  // which is the single machine we seed below.
  const ts = `machines.setRecipe(Machine.A, Recipe.${pxtRecipe})\n`
  return {
    version: 3,
    grid: [{ x: cell.x, z: cell.z, machineType, rotation: 'east' }],
    belts: [],
    pxtWorkspace: JSON.stringify({ ts, blocks: '' }),
  }
}

test.describe('Group D — Sandbox autoload restores badges before Start', () => {
  test('D1: sandbox autoload — saved scene with set_recipe in the program shows the recipe badge BEFORE pressing Start', async ({
    mainMenu, toolbar, recipeIcon, saves, probe,
  }) => {
    test.setTimeout(60000)

    // Seed BEFORE app boot (init script fires on `mainMenu.open()` → `page.goto('/')`).
    await saves.seedSandboxProjectAsActive(
      'autoload-fabricator',
      buildSandboxSave('part_fabricator', FAB_CELL, 'WheelPressSmall'),
    )

    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()

    // Sanity precondition: the autoload path must have restored the
    // fabricator. If this fails the bug under test is not what's
    // breaking — investigate `autoRestoreFactory` separately.
    const machines = await probe.getMachines()
    const fab = machines.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z)
    expect(
      fab,
      'precondition: autoRestoreFactory must restore the seeded fabricator at FAB_CELL',
    ).toBeTruthy()
    expect(fab!.type).toBe('part_fabricator')

    await recipeIcon.forceSync()

    // The core bug assertions — must hold WITHOUT pressing Start.
    const outputType = await recipeIcon.readRecipeOutputTypeAt(FAB_CELL.x, FAB_CELL.z)
    expect(
      outputType,
      'GREEN: after autoloading a saved sandbox whose program sets a recipe, the recipe-status ' +
        'badge MUST be present BEFORE the player presses Start. Expected recipe output type ' +
        `'wheel_small' for wheel_press_small, got ${outputType === null ? 'null (no badge — autoload skipped applyBuildPhaseProgramPreview)' : `'${outputType}'`}.`,
    ).toBe('wheel_small')

    const state = await recipeIcon.readForMachineAt(FAB_CELL.x, FAB_CELL.z)
    expect(
      state.exists,
      'GREEN: factoryRenderer.recipeIcons must contain a mesh for the autoloaded fabricator ' +
        'before Start is pressed.',
    ).toBe(true)
    expect(state.visible).toBe(true)
    expect(
      state.worldY,
      `recipe badge must float above the machine body; got worldY=${state.worldY}`,
    ).toBeGreaterThanOrEqual(1.5)

    const satisfied = await recipeIcon.getDependenciesSatisfiedAt(FAB_CELL.x, FAB_CELL.z)
    expect(
      satisfied,
      'GREEN: a fabricator with `wheel_press_small` (no required inputs) must have ' +
        `dependenciesSatisfied=true after autoload. Got ${satisfied}.`,
    ).toBe(true)
    expect(
      state.colorHex,
      `GREEN: a fully-satisfied recipe must render a WHITE badge after autoload. ` +
        `Got 0x${state.colorHex.toString(16)}.`,
    ).toBe(WHITE)
  })

  test('D2: sandbox autoload — saved scene with an unsatisfiable Assembler recipe shows a RED badge immediately', async ({
    mainMenu, toolbar, recipeIcon, saves, probe,
  }) => {
    test.setTimeout(60000)

    await saves.seedSandboxProjectAsActive(
      'autoload-assembler-no-upstream',
      buildSandboxSave('assembler', ASSEMBLER_CELL, 'AssembleDrivetrainBasic'),
    )

    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()

    const machines = await probe.getMachines()
    const asm = machines.find((m) => m.x === ASSEMBLER_CELL.x && m.z === ASSEMBLER_CELL.z)
    expect(
      asm,
      'precondition: autoRestoreFactory must restore the seeded assembler at ASSEMBLER_CELL',
    ).toBeTruthy()
    expect(asm!.type).toBe('assembler')

    await recipeIcon.forceSync()

    const outputType = await recipeIcon.readRecipeOutputTypeAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)
    expect(
      outputType,
      'GREEN: assembler with `assemble_drivetrain_basic` must have its badge present after ' +
        `autoload — expected output type 'drivetrain_basic', got ${outputType === null ? 'null (no badge)' : `'${outputType}'`}.`,
    ).toBe('drivetrain_basic')

    const state = await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)
    expect(state.exists, 'GREEN: assembler recipe-icon mesh must exist after autoload').toBe(true)
    expect(state.visible).toBe(true)

    const satisfied = await recipeIcon.getDependenciesSatisfiedAt(
      ASSEMBLER_CELL.x, ASSEMBLER_CELL.z,
    )
    expect(
      satisfied,
      'GREEN: an assembler with NO upstream producers must have dependenciesSatisfied=false ' +
        `after autoload. Got ${satisfied}.`,
    ).toBe(false)
    expect(
      state.colorHex,
      'GREEN: unsatisfied assembler recipe must render a RED badge after autoload. ' +
        `Got 0x${state.colorHex.toString(16)}.`,
    ).toBe(RED)
  })
})

/**
 * Group E pins a DIFFERENT load path than Group D: instead of refreshing
 * the page (which goes through `setupLevelRendering` →
 * `autoRestoreFactory`), the player enters Sandbox with empty state and
 * THEN actively loads a saved project from the in-app Projects menu.
 *
 * That path lives in `src/ui/wireProjectsPanel.ts`:
 * `projectsPanel.onLoadSlot` → `runDestructiveFactoryReplace` calls
 * `importFactoryWithProgram(save, factory, pxtEditor)` and
 * `factoryRenderer.syncMeshes()`, but never `populateSimulation()` /
 * `applyBuildPhaseProgramPreview()`. So the new live `Machine` instances
 * have no `currentRecipe` and no recipe-status badges render — even
 * though the saved PXT program contains `setRecipe`.
 *
 * The fix to `setupLevelRendering` did NOT cover this path. The tests
 * below seed the slot as a NON-active project (`lastLoadedId: null`)
 * so the sandbox-entry autoload does not pick it up — the user must
 * click the slot in the Projects panel to trigger the bug.
 */
test.describe('Group E — Projects menu load restores badges immediately', () => {
  test('E1: loading a saved sandbox project via the Projects menu shows recipe badges immediately', async ({
    mainMenu, toolbar, projectsPanel, recipeIcon, saves, probe,
  }) => {
    test.setTimeout(60000)

    const slotName = 'menu-load-fabricator'
    await saves.seedSandboxProjectSlot(
      slotName,
      buildSandboxSave('part_fabricator', FAB_CELL, 'WheelPressSmall'),
    )

    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()

    // Precondition: sandbox enters empty (no autoload because lastLoadedId=null).
    const initial = await probe.getMachines()
    expect(
      initial.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z),
      'precondition: sandbox must enter EMPTY at FAB_CELL — the slot is seeded as non-active so the menu load path is exercised, not autoload',
    ).toBeUndefined()

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotPresent(slotName)
    await projectsPanel.doubleClickSlot(slotName)

    // Precondition: the menu load restored the fabricator. If this fails
    // the bug under test is not what's breaking — investigate
    // `runDestructiveFactoryReplace` / `importFactoryWithProgram`.
    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z)?.type ?? null
    }, { timeout: 30_000 }).toBe('part_fabricator')

    await recipeIcon.forceSync()

    // The core bug assertions — must hold WITHOUT pressing Start.
    const outputType = await recipeIcon.readRecipeOutputTypeAt(FAB_CELL.x, FAB_CELL.z)
    expect(
      outputType,
      'GREEN: after loading a saved sandbox project from the Projects menu, the recipe-status ' +
        'badge MUST be present BEFORE the player presses Start. Expected recipe output type ' +
        `'wheel_small' for wheel_press_small, got ${outputType === null ? 'null (no badge — Projects-menu load skipped populateSimulation/applyBuildPhaseProgramPreview)' : `'${outputType}'`}.`,
    ).toBe('wheel_small')

    const state = await recipeIcon.readForMachineAt(FAB_CELL.x, FAB_CELL.z)
    expect(
      state.exists,
      'GREEN: factoryRenderer.recipeIcons must contain a mesh for the menu-loaded fabricator ' +
        'before Start is pressed.',
    ).toBe(true)
    expect(state.visible).toBe(true)
    expect(
      state.worldY,
      `recipe badge must float above the machine body; got worldY=${state.worldY}`,
    ).toBeGreaterThanOrEqual(1.5)

    const satisfied = await recipeIcon.getDependenciesSatisfiedAt(FAB_CELL.x, FAB_CELL.z)
    expect(
      satisfied,
      'GREEN: a fabricator with `wheel_press_small` (no required inputs) must have ' +
        `dependenciesSatisfied=true after menu load. Got ${satisfied}.`,
    ).toBe(true)
    expect(
      state.colorHex,
      `GREEN: a fully-satisfied recipe must render a WHITE badge after menu load. ` +
        `Got 0x${state.colorHex.toString(16)}.`,
    ).toBe(WHITE)
  })

  test('E2: loading a saved project with an unsatisfiable Assembler recipe via the Projects menu shows a RED badge immediately', async ({
    mainMenu, toolbar, projectsPanel, recipeIcon, saves, probe,
  }) => {
    test.setTimeout(60000)

    const slotName = 'menu-load-assembler-no-upstream'
    await saves.seedSandboxProjectSlot(
      slotName,
      buildSandboxSave('assembler', ASSEMBLER_CELL, 'AssembleDrivetrainBasic'),
    )

    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()

    const initial = await probe.getMachines()
    expect(
      initial.find((m) => m.x === ASSEMBLER_CELL.x && m.z === ASSEMBLER_CELL.z),
      'precondition: sandbox must enter EMPTY at ASSEMBLER_CELL',
    ).toBeUndefined()

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotPresent(slotName)
    await projectsPanel.doubleClickSlot(slotName)

    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === ASSEMBLER_CELL.x && m.z === ASSEMBLER_CELL.z)?.type ?? null
    }, { timeout: 30_000 }).toBe('assembler')

    await recipeIcon.forceSync()

    const outputType = await recipeIcon.readRecipeOutputTypeAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)
    expect(
      outputType,
      'GREEN: assembler with `assemble_drivetrain_basic` must have its badge present after ' +
        `menu load — expected output type 'drivetrain_basic', got ${outputType === null ? 'null (no badge)' : `'${outputType}'`}.`,
    ).toBe('drivetrain_basic')

    const state = await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)
    expect(state.exists, 'GREEN: assembler recipe-icon mesh must exist after menu load').toBe(true)
    expect(state.visible).toBe(true)

    const satisfied = await recipeIcon.getDependenciesSatisfiedAt(
      ASSEMBLER_CELL.x, ASSEMBLER_CELL.z,
    )
    expect(
      satisfied,
      'GREEN: an assembler with NO upstream producers must have dependenciesSatisfied=false ' +
        `after menu load. Got ${satisfied}.`,
    ).toBe(false)
    expect(
      state.colorHex,
      'GREEN: unsatisfied assembler recipe must render a RED badge after menu load. ' +
        `Got 0x${state.colorHex.toString(16)}.`,
    ).toBe(RED)
  })
})

/**
 * Group F pins a bug in CHAINED Projects-menu loads. Group E proves the
 * FIRST menu load applies the recipe badge correctly. But loading a
 * second slot (or even the same slot again) through the Projects panel
 * silently drops `machine.currentRecipe` — the renderer's accessor
 * reports `simRecipe: null, iconMapSize: 0` and no badge is drawn.
 *
 * Probe captured by UX review after the second load:
 *   { machineType: 'part_fabricator', machineRecipe: null,
 *     simRecipe: null, iconMapSize: 0, icon: null }
 *
 * Suspected cause: `PxtEditor.loadWorkspaceXml` is async (Blockly
 * re-injection + watchdog). The second `runDestructiveFactoryReplace`
 * call in `wireProjectsPanel.ts` does not await the new XML actually
 * landing in the workspace before `populateSimulation()` runs, so the
 * interpreter sees stale `lastPxtSource` and emits no `set recipe`
 * command.
 */
test.describe('Group F — Chained Projects-menu loads keep the badge in sync', () => {
  test('F1: loading slot A, then loading slot B via Projects menu shows slot B\'s badge', async ({
    mainMenu, toolbar, projectsPanel, recipeIcon, saves, probe,
  }) => {
    test.setTimeout(90_000)

    const slotA = 'menu-load-chain-fabricator'
    const slotB = 'menu-load-chain-assembler'
    await saves.seedSandboxProjectSlots([
      { name: slotA, save: buildSandboxSave('part_fabricator', FAB_CELL, 'WheelPressSmall') },
      { name: slotB, save: buildSandboxSave('assembler', ASSEMBLER_CELL, 'AssembleDrivetrainBasic') },
    ])

    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()

    // Load slot A — sanity (same as E1).
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotPresent(slotA)
    await projectsPanel.doubleClickSlot(slotA)

    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z)?.type ?? null
    }, { timeout: 30_000 }).toBe('part_fabricator')

    await recipeIcon.forceSync()
    expect(
      await recipeIcon.readRecipeOutputTypeAt(FAB_CELL.x, FAB_CELL.z),
      'sanity: first Projects-menu load (slot A) must show the wheel_small badge — this is the Group E1 contract',
    ).toBe('wheel_small')

    // The panel stays open after doubleClickSlot; load slot B from it directly.
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotPresent(slotB)
    await projectsPanel.doubleClickSlot(slotB)

    // Wait for slot B's machine to be restored.
    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === ASSEMBLER_CELL.x && m.z === ASSEMBLER_CELL.z)?.type ?? null
    }, { timeout: 30_000 }).toBe('assembler')

    // The previous fabricator must be gone (destructive replace).
    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z)?.type ?? null
    }, { timeout: 10_000 }).toBeNull()

    await recipeIcon.forceSync()

    // Core bug assertion: badge for slot B's recipe must appear WITHOUT pressing Start.
    const outputType = await recipeIcon.readRecipeOutputTypeAt(
      ASSEMBLER_CELL.x, ASSEMBLER_CELL.z,
    )
    expect(
      outputType,
      'GREEN: after loading slot B through the Projects menu (following a prior menu load of ' +
        'slot A), the assembler\'s recipe-status badge MUST be present before Start. Expected ' +
        `'drivetrain_basic', got ${outputType === null ? 'null (chained menu load silently dropped machine.currentRecipe — PxtEditor.loadWorkspaceXml race)' : `'${outputType}'`}.`,
    ).toBe('drivetrain_basic')

    const state = await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)
    expect(
      state.exists,
      'GREEN: factoryRenderer.recipeIcons must contain a mesh for slot B\'s assembler after a chained menu load',
    ).toBe(true)
    expect(state.visible).toBe(true)
    expect(
      state.colorHex,
      `GREEN: assembler with no upstream must render RED after chained menu load. Got 0x${state.colorHex.toString(16)}.`,
    ).toBe(RED)
  })

  test('F2: loading the same slot twice via Projects menu still shows the badge on the second load', async ({
    mainMenu, toolbar, projectsPanel, recipeIcon, saves, probe,
  }) => {
    test.setTimeout(90_000)

    const slotName = 'menu-load-same-twice'
    await saves.seedSandboxProjectSlot(
      slotName,
      buildSandboxSave('part_fabricator', FAB_CELL, 'WheelPressSmall'),
    )

    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()

    // First load — sanity.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.doubleClickSlot(slotName)
    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z)?.type ?? null
    }, { timeout: 30_000 }).toBe('part_fabricator')
    await recipeIcon.forceSync()
    expect(
      await recipeIcon.readRecipeOutputTypeAt(FAB_CELL.x, FAB_CELL.z),
      'sanity: first menu load shows wheel_small badge',
    ).toBe('wheel_small')

    // Panel stays open after doubleClickSlot; re-load the SAME slot from it.
    await projectsPanel.expectOpen()
    await projectsPanel.doubleClickSlot(slotName)
    // Machine is still present after destructive replace (same data).
    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z)?.type ?? null
    }, { timeout: 30_000 }).toBe('part_fabricator')

    await recipeIcon.forceSync()

    const outputType = await recipeIcon.readRecipeOutputTypeAt(FAB_CELL.x, FAB_CELL.z)
    expect(
      outputType,
      'GREEN: loading the SAME slot twice via the Projects menu must keep the badge visible on ' +
        `the second load. Expected 'wheel_small', got ${outputType === null ? 'null (badge dropped on second load — recipe state did not refresh)' : `'${outputType}'`}.`,
    ).toBe('wheel_small')

    const state = await recipeIcon.readForMachineAt(FAB_CELL.x, FAB_CELL.z)
    expect(state.exists, 'GREEN: recipe-icon mesh must persist across same-slot reloads').toBe(true)
    expect(state.visible).toBe(true)
    expect(
      state.colorHex,
      `GREEN: badge must be WHITE on second load of the satisfied wheel_press_small recipe. Got 0x${state.colorHex.toString(16)}.`,
    ).toBe(WHITE)
  })
})

/**
 * Group G pins the same kind of state-stickiness bug, but on the
 * "+ New project" → load path. After `pxtEditor.loadBlankProjectAsync()`
 * (called by `runDestructiveFactoryReplace` when the user chooses
 * "+ New project"), loading a saved slot through the Projects menu must
 * still apply the recipe to the live `Machine` so the badge renders.
 */
test.describe('Group G — Projects menu load AFTER "+ New project" restores the badge', () => {
  test('G1: "+ New project" followed by loading a saved slot shows the badge', async ({
    mainMenu, toolbar, projectsPanel, recipeIcon, saves, probe,
  }) => {
    test.setTimeout(90_000)

    const slotName = 'menu-load-after-new-project'
    await saves.seedSandboxProjectSlot(
      slotName,
      buildSandboxSave('part_fabricator', FAB_CELL, 'WheelPressSmall'),
    )

    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()

    // First, load the slot (sanity — matches E1).
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.doubleClickSlot(slotName)
    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z)?.type ?? null
    }, { timeout: 30_000 }).toBe('part_fabricator')
    await recipeIcon.forceSync()
    expect(
      await recipeIcon.readRecipeOutputTypeAt(FAB_CELL.x, FAB_CELL.z),
      'sanity: initial menu load shows wheel_small badge',
    ).toBe('wheel_small')

    // Panel stays open after doubleClickSlot; click "+ New project" directly.
    await projectsPanel.expectOpen()
    await projectsPanel.dblClickEmptyPlaceholder()
    await projectsPanel.confirmConfirm()
    await projectsPanel.expectNoModal()

    await expect.poll(() => probe.getMachineCount(), {
      message: '"+ New project" clears the factory',
      timeout: 10_000,
    }).toBe(0)

    // Re-load the saved slot. Panel may still be open after the confirm flow.
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotPresent(slotName)
    await projectsPanel.doubleClickSlot(slotName)
    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z)?.type ?? null
    }, { timeout: 30_000 }).toBe('part_fabricator')

    await recipeIcon.forceSync()

    const outputType = await recipeIcon.readRecipeOutputTypeAt(FAB_CELL.x, FAB_CELL.z)
    expect(
      outputType,
      'GREEN: loading a saved slot via the Projects menu AFTER "+ New project" must restore the ' +
        `recipe-status badge before Start. Expected 'wheel_small', got ${outputType === null ? 'null (badge dropped — loadBlankProjectAsync state leaked into the subsequent load)' : `'${outputType}'`}.`,
    ).toBe('wheel_small')

    const state = await recipeIcon.readForMachineAt(FAB_CELL.x, FAB_CELL.z)
    expect(state.exists, 'GREEN: recipe-icon mesh must exist after New-project → load sequence').toBe(true)
    expect(state.visible).toBe(true)
    expect(
      state.colorHex,
      `GREEN: badge must be WHITE after New-project → load. Got 0x${state.colorHex.toString(16)}.`,
    ).toBe(WHITE)
  })
})
