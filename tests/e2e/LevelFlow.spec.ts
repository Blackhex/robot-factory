import { test, expect } from './pom'
import type { MainMenuPage } from './pom/screens/MainMenuPage'
import type { LevelSelectPage } from './pom/screens/LevelSelectPage'
import type { ToolbarPage } from './pom/screens/ToolbarPage'
import type { EditorPanelPage } from './pom/screens/EditorPanelPage'
import type { MachinePanelPage } from './pom/screens/MachinePanelPage'
import type { PxtEditorPage } from './pom/editor/PxtEditorPage'
import type { SaveManager } from './pom/data/saves'
import type { FactoryGridPage } from './pom/canvas/FactoryGridPage'
import type { GridSize } from './pom/types'

/**
 * E2E test: Level 1 — "First Part"
 */

test.use({ viewport: { width: 1920, height: 1080 } })

const PROGRAM_BASIC =
  'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
  'machines.startMachine(Machine.A)'

// Level 1 starts with a pre-placed factory_output (the Shipper) declared by
// `LevelDefinition.startingMachines`. Because the Shipper is added to the
// factory before the player places anything, it occupies dropdown slot
// `Machine.A` — the first user-placed fabricator becomes `Machine.B`.
const PROGRAM_BASIC_LEVEL_1 =
  'machines.setRecipe(Machine.B, Recipe.WheelPressSmall)\n' +
  'machines.startMachine(Machine.B)'

// Same as PROGRAM_BASIC, but also configures Machine.B with a recipe that
// consumes wheel_small. Used in chains where Machine.B is an intermediate
// recipe-driven machine (e.g. assembler) that would otherwise trigger the
// `unconsumable_input` game-over rule on the first incoming wheel.
const PROGRAM_BASIC_WITH_DRIVETRAIN =
  'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
  'machines.setRecipe(Machine.B, Recipe.AssembleDrivetrainBasic)\n' +
  'machines.startMachine(Machine.A)'

const PROGRAM_LOOP =
  'loops.repeatTimes(10, () => {\n' +
  '  machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
  '  machines.startMachine(Machine.A)\n' +
  '})'

const LOADED_CHROMIUM_TEST_TIMEOUT_MS = 120000
const LOADED_CHROMIUM_DELIVERY_TIMEOUT_MS = 60000

async function navigateToLevel1(
  mainMenu: MainMenuPage,
  levelSelect: LevelSelectPage,
  toolbar: ToolbarPage,
  grid: FactoryGridPage,
  size: GridSize,
) {
  await mainMenu.open()
  await mainMenu.expectStartButtonVisible()
  await mainMenu.clickStartGame()
  await levelSelect.expectVisible()

  await levelSelect.clickFirstUnlocked()
  await levelSelect.expectHidden()
  await toolbar.expectVisible()

  await toolbar.waitForCameraSettle()
  grid.useGrid(size)
}

async function navigateToLevel(
  saves: SaveManager,
  mainMenu: MainMenuPage,
  levelSelect: LevelSelectPage,
  toolbar: ToolbarPage,
  grid: FactoryGridPage,
  size: GridSize,
  levelIndex: number,
) {
  await saves.seedProgressUpTo(levelIndex)

  await mainMenu.open()
  await mainMenu.expectStartButtonVisible()
  await mainMenu.clickStartGame()
  await levelSelect.expectVisible()

  await levelSelect.clickUnlocked(levelIndex)
  await levelSelect.expectHidden()
  await toolbar.expectVisible()

  await toolbar.waitForCameraSettle()
  grid.useGrid(size)
}

async function setProgramInEditor(
  editorPanel: EditorPanelPage,
  pxt: PxtEditorPage,
  code: string,
) {
  const isPxtLoaded = await pxt.isPxtIframeVisible(3000)
  if (isPxtLoaded) {
    await pxt.setFallbackProgramViaValueAssignment(code)
  } else {
    await editorPanel.expectFallbackTextareaVisible()
    await editorPanel.fillFallbackProgram(code)
  }
}

test.describe('Level 1 — First Part', () => {
  test('full play-through: tutorial → place machines → belt → program → simulate → score', async ({
    mainMenu, levelSelect, toolbar, grid, machinePanel, tutorial, editorPanel, pxt,
    hud, scoreScreen, probe,
  }) => {
    test.setTimeout(90000)

    await navigateToLevel1(mainMenu, levelSelect, toolbar, grid, { width: 10, height: 10 })

    await grid.expectCanvasVisible()
    await toolbar.expectVisible()

    // ===================== STEP 2: Tutorial step 1 — visible ===============
    await tutorial.expectVisible(5000)
    await tutorial.expectTooltipVisible()

    await tutorial.expectCounter('1 / 6')

    await tutorial.clickNext()
    await tutorial.expectCounter('2 / 6')

    // ===================== STEP 3: Place Fabricator at (3, 5) ===============
    await grid.dblClickCell({ x: 3, z: 5 })

    // ===================== STEP 4: Advance tutorial to step 3 ===============
    await tutorial.clickNext()
    await tutorial.expectCounter('3 / 6')

    // ===================== STEP 5: Place second machine at (5, 5) ===========
    await grid.dblClickCell({ x: 5, z: 5 })

    // ===================== STEP 6: Select machine at (5,5) & change type ====
    await grid.clickCell({ x: 5, z: 5 })
    await machinePanel.expectVisible()

    await machinePanel.selectType('factory_output')
    await machinePanel.expectTypeValue('factory_output')

    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    // ===================== STEP 7: Advance tutorial to step 4 ===============
    await tutorial.clickNext()
    await tutorial.expectCounter('4 / 6')

    // ===================== STEP 8: Connect belt =====
    // Level 1 starts with a pre-placed factory_output (the Shipper) declared
    // by `LevelDefinition.startingMachines`, so we must explicitly target the
    // user-placed machine at (5, 5) rather than picking the first match.
    const machines = await probe.getMachines()
    const fabricator = machines.find((m) => m.type === 'part_fabricator' && m.x === 3 && m.z === 5)
    const output = machines.find((m) => m.type === 'factory_output' && m.x === 5 && m.z === 5)
    expect(fabricator).toBeTruthy()
    expect(output).toBeTruthy()
    const beltPlaced = await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, output!.x, output!.z,
    )
    expect(beltPlaced).toBe(true)

    // ===================== STEP 9: Advance tutorial to step 5 ===============
    await tutorial.clickNext()
    await tutorial.expectCounter('5 / 6')

    // ===================== STEP 10: Open editor =============================
    await toolbar.clickEditor()
    await editorPanel.expectOpen()

    // ===================== STEP 11: Advance tutorial to step 6 ==============
    await tutorial.clickNext()
    await tutorial.expectCounter('6 / 6')

    // ===================== STEP 12: Write program in fallback textarea ======
    await setProgramInEditor(editorPanel, pxt, PROGRAM_BASIC_LEVEL_1)
    await editorPanel.expectFallbackValue(PROGRAM_BASIC_LEVEL_1)

    // Close editor
    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    // ===================== STEP 13: Finish tutorial (last step) =============
    if (await tutorial.isVisibleNow()) {
      await tutorial.expectNextButtonVisible()
      await tutorial.clickNext()
      await tutorial.expectHidden()
    }

    // ===================== STEP 14: Start simulation ========================
    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()

    // ===================== STEP 15: Verify HUD is visible ===================
    await hud.expectVisible()

    // ===================== STEP 16: Wait for items delivered ≥ 3 ============
    await hud.expectItemsDeliveredAtLeast(3, 30000)

    await hud.expectTimeAdvancing(10000)

    // ===================== STEP 17: Stop simulation → score screen ==========
    await toolbar.expectRestartButtonVisible()
    await toolbar.clickRestart()

    // ===================== STEP 18: Verify score screen =====================
    await scoreScreen.expectVisible()
    await scoreScreen.expectTotalVisible()
    await scoreScreen.expectLevelNameVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 2 — Assembly Line
// ---------------------------------------------------------------------------

test.describe('Level 2 — Assembly Line', () => {
  test('full play-through: tutorial → place machines → belt → program → simulate → score', async ({
    saves, mainMenu, levelSelect, toolbar, grid, machinePanel, tutorial, editorPanel, pxt,
    hud, scoreScreen, probe,
  }) => {
    test.setTimeout(90000)
    const SIZE: GridSize = { width: 12, height: 12 }

    await navigateToLevel(saves, mainMenu, levelSelect, toolbar, grid, SIZE, 1)
    await grid.expectCanvasVisible()

    // ===================== STEP 2: Tutorial step 1 — visible ===============
    await tutorial.expectVisible(5000)
    await tutorial.expectCounter('1 / 3')

    await tutorial.clickNext()
    await tutorial.expectCounter('2 / 3')

    // ===================== STEP 3: Place Fabricator at (5, 5) ===============
    await grid.dblClickCell({ x: 5, z: 5 })

    let machines = await probe.getMachines()
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    await grid.clickCell({ x: 5, z: 5 })
    await machinePanel.expectVisible()
    await machinePanel.expectTypeValue('part_fabricator')
    await machinePanel.clickClose()

    // ===================== STEP 4: Place second machine at (7, 5) ==========
    await grid.dblClickCell({ x: 7, z: 5 })

    machines = await probe.getMachines()
    expect(machines.length).toBe(2)

    await grid.clickCell({ x: 7, z: 5 })
    await machinePanel.expectVisible()
    await machinePanel.selectType('factory_output')
    await machinePanel.expectTypeValue('factory_output')
    await machinePanel.clickClose()

    // ===================== STEP 5: Tutorial step 2 → Next ==================
    await tutorial.clickNext()
    await tutorial.expectCounter('3 / 3')

    // ===================== STEP 6: Connect belt fabricator → output =========
    machines = await probe.getMachines()
    const fabricator = machines.find((m) => m.type === 'part_fabricator')
    const output = machines.find((m) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(output).toBeTruthy()

    const beltPlaced = await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, output!.x, output!.z,
    )
    expect(beltPlaced).toBe(true)

    expect(await probe.getBeltCount()).toBeGreaterThan(0)

    // ===================== STEP 7: Tutorial step 3 (last) → Finish =========
    await tutorial.clickNext()
    await tutorial.expectHidden()

    // ===================== STEP 8: Open editor and write program ===========
    await toolbar.clickEditor()
    await editorPanel.expectOpen()

    await setProgramInEditor(editorPanel, pxt, PROGRAM_BASIC)
    await editorPanel.expectFallbackValue(PROGRAM_BASIC)

    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    // ===================== STEP 9: Start simulation ========================
    await toolbar.clickStart()

    await hud.expectVisible()

    // ===================== STEP 10: Wait for items delivered ≥ 3 ===========
    // Level 2 requires 3 robot_explorer outputs. Restarting before the goal
    // is met routes to the Level Failed screen (B1 contract), so we wait
    // for the full target before stopping.
    await hud.expectItemsDeliveredAtLeast(3, 60000)

    await hud.expectTimeAdvancing(10000)

    // ===================== STEP 11: Stop simulation → score screen =========
    await toolbar.clickRestart()

    await scoreScreen.expectVisible()
    await scoreScreen.expectTotalVisible()
    await scoreScreen.expectLevelNameVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 3 — Mass Production
// ---------------------------------------------------------------------------

test.describe('Level 3 — Mass Production', () => {
  test('full play-through: tutorial → place machines → belt → loop program → simulate → score', async ({
    saves, mainMenu, levelSelect, toolbar, grid, machinePanel, tutorial, editorPanel, pxt,
    hud, scoreScreen, probe,
  }) => {
    test.setTimeout(90000)
    const SIZE: GridSize = { width: 14, height: 14 }

    await navigateToLevel(saves, mainMenu, levelSelect, toolbar, grid, SIZE, 2)
    await grid.expectCanvasVisible()

    // ===================== STEP 2: Tutorial (2 steps) ======================
    await tutorial.expectVisible(5000)
    await tutorial.expectCounter('1 / 2')

    await tutorial.clickNext()
    await tutorial.expectCounter('2 / 2')

    await tutorial.clickNext()
    await tutorial.expectHidden()

    // ===================== STEP 3: Place Fabricator at (5, 7) ===============
    await grid.dblClickCell({ x: 5, z: 7 })

    let machines = await probe.getMachines()
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // ===================== STEP 4: Place second machine at (7, 7) ===========
    await grid.dblClickCell({ x: 7, z: 7 })

    machines = await probe.getMachines()
    expect(machines.length).toBe(2)

    // ===================== STEP 5: Change second machine to factory_output ===
    await grid.clickCell({ x: 7, z: 7 })
    await machinePanel.expectVisible()

    await machinePanel.selectType('factory_output')
    await machinePanel.expectTypeValue('factory_output')

    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    machines = await probe.getMachines()
    const fabricator = machines.find((m) => m.type === 'part_fabricator')
    const output = machines.find((m) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(output).toBeTruthy()

    // ===================== STEP 6: Connect belt =============================
    const beltPlaced = await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, output!.x, output!.z,
    )
    expect(beltPlaced).toBe(true)
    expect(await probe.getBeltCount()).toBeGreaterThan(0)

    // ===================== STEP 7: Open editor & write loop program =========
    await toolbar.clickEditor()
    await editorPanel.expectOpen()

    await setProgramInEditor(editorPanel, pxt, PROGRAM_LOOP)
    await editorPanel.expectFallbackValue(PROGRAM_LOOP)

    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    // ===================== STEP 8: Start simulation ========================
    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()
    await hud.expectVisible()

    // ===================== STEP 9: Wait for items delivered ≥ 10 ============
    await hud.expectItemsDeliveredAtLeast(10, 60000)
    await hud.expectTimeAdvancing(10000)

    // ===================== STEP 10: Stop simulation → score screen ==========
    await toolbar.expectRestartButtonVisible()
    await toolbar.clickRestart()

    await scoreScreen.expectVisible()
    await scoreScreen.expectTotalVisible()
    await scoreScreen.expectLevelNameVisible()
  })
})

// ---------------------------------------------------------------------------
// Generic helper for Level 4–8 (single-tutorial / no-tutorial 3-machine flow)
// ---------------------------------------------------------------------------

async function placeAndChangeType(
  grid: FactoryGridPage,
  machinePanel: MachinePanelPage,
  coord: { x: number; z: number },
  newType: string,
) {
  await grid.dblClickCell(coord)
  await grid.clickCell(coord)
  await machinePanel.expectVisible()
  await machinePanel.selectType(newType)
  await machinePanel.expectTypeValue(newType)
  await machinePanel.clickClose()
  await machinePanel.expectHidden()
}

// ---------------------------------------------------------------------------
// Level 4 — Quality Matters
// ---------------------------------------------------------------------------

test.describe('Level 4 — Quality Matters', () => {
  test('full play-through: tutorial → place machines → belts → program → simulate → score', async ({
    saves, mainMenu, levelSelect, toolbar, grid, machinePanel, tutorial, editorPanel, pxt,
    hud, scoreScreen, probe,
  }) => {
    test.setTimeout(LOADED_CHROMIUM_TEST_TIMEOUT_MS)
    const SIZE: GridSize = { width: 14, height: 14 }

    await navigateToLevel(saves, mainMenu, levelSelect, toolbar, grid, SIZE, 3)
    await grid.expectCanvasVisible()

    // ===================== STEP 2: Tutorial (2 steps) ======================
    await tutorial.expectVisible(5000)
    await tutorial.expectCounter('1 / 2')
    await tutorial.clickNext()
    await tutorial.expectCounter('2 / 2')
    await tutorial.clickNext()
    await tutorial.expectHidden()

    // ===================== STEP 3: Place Fabricator at (4, 7) ===============
    await grid.dblClickCell({ x: 4, z: 7 })
    let machines = await probe.getMachines()
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // ===================== STEP 4: Place Checker at (7, 7) ==================
    await grid.dblClickCell({ x: 7, z: 7 })
    machines = await probe.getMachines()
    expect(machines.length).toBe(2)
    await grid.clickCell({ x: 7, z: 7 })
    await machinePanel.expectVisible()
    await machinePanel.selectType('quality_checker')
    await machinePanel.expectTypeValue('quality_checker')
    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    // ===================== STEP 5: Place Shipper at (10, 7) =================
    await grid.dblClickCell({ x: 10, z: 7 })
    machines = await probe.getMachines()
    expect(machines.length).toBe(3)
    await grid.clickCell({ x: 10, z: 7 })
    await machinePanel.expectVisible()
    await machinePanel.selectType('factory_output')
    await machinePanel.expectTypeValue('factory_output')
    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    machines = await probe.getMachines()
    const fabricator = machines.find((m) => m.type === 'part_fabricator')
    const qualityChecker = machines.find((m) => m.type === 'quality_checker')
    const factoryOutput = machines.find((m) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(qualityChecker).toBeTruthy()
    expect(factoryOutput).toBeTruthy()

    // ===================== STEP 6: Connect belts ============================
    const belt1 = await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, qualityChecker!.x, qualityChecker!.z,
    )
    expect(belt1).toBe(true)
    const belt2 = await probe.placeBeltViaTestApi(
      qualityChecker!.x, qualityChecker!.z, factoryOutput!.x, factoryOutput!.z,
    )
    expect(belt2).toBe(true)

    expect(await probe.getBeltCount()).toBeGreaterThanOrEqual(2)

    // ===================== STEP 7: Open editor & write program ==============
    await toolbar.clickEditor()
    await editorPanel.expectOpen()

    await setProgramInEditor(editorPanel, pxt, PROGRAM_BASIC)
    await editorPanel.expectFallbackValue(PROGRAM_BASIC)

    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    // ===================== STEP 8: Start simulation ========================
    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()
    await hud.expectVisible()

    // ===================== STEP 9: Wait for items delivered ≥ goal ==========
    // Level 4 requires 5 robot_explorer outputs. Restarting before the goal
    // is met routes to Level Failed (B1 contract).
    await hud.expectItemsDeliveredAtLeast(5, LOADED_CHROMIUM_DELIVERY_TIMEOUT_MS)
    await hud.expectTimeAdvancing(10000)

    // ===================== STEP 10: Stop simulation → score screen ==========
    await toolbar.expectRestartButtonVisible()
    await toolbar.clickRestart()

    await scoreScreen.expectVisible()
    await scoreScreen.expectTotalVisible()
    await scoreScreen.expectLevelNameVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 5 — Smart Routing
// ---------------------------------------------------------------------------

test.describe('Level 5 — Smart Routing', () => {
  test('full play-through: no tutorial → place machines with splitter → belts → program → simulate → score', async ({
    saves, mainMenu, levelSelect, toolbar, grid, machinePanel, tutorial, editorPanel, pxt,
    hud, scoreScreen, probe,
  }) => {
    test.setTimeout(LOADED_CHROMIUM_TEST_TIMEOUT_MS)
    const SIZE: GridSize = { width: 16, height: 16 }

    await navigateToLevel(saves, mainMenu, levelSelect, toolbar, grid, SIZE, 4)
    await grid.expectCanvasVisible()

    // ===================== STEP 2: Verify NO tutorial appears ===============
    if (await tutorial.isVisibleNow(2000)) {
      await tutorial.dismissIfPresent(1000)
    }

    // ===================== STEP 3: Place Fabricator at (4, 8) ===============
    await grid.dblClickCell({ x: 4, z: 8 })
    let machines = await probe.getMachines()
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // ===================== STEP 4: Place Splitter at (8, 8) =================
    await placeAndChangeType(grid, machinePanel, { x: 8, z: 8 }, 'splitter')
    machines = await probe.getMachines()
    expect(machines.length).toBe(2)

    // ===================== STEP 5: Place Shipper at (12, 8) =================
    await placeAndChangeType(grid, machinePanel, { x: 12, z: 8 }, 'factory_output')
    machines = await probe.getMachines()
    expect(machines.length).toBe(3)

    // ===================== STEP 6: Verify all machines have correct types ====
    const fabricator = machines.find((m) => m.type === 'part_fabricator')
    const splitter = machines.find((m) => m.type === 'splitter')
    const factoryOutput = machines.find((m) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(splitter).toBeTruthy()
    expect(factoryOutput).toBeTruthy()

    // ===================== STEP 7: Connect belts ============================
    expect(await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, splitter!.x, splitter!.z,
    )).toBe(true)
    expect(await probe.placeBeltViaTestApi(
      splitter!.x, splitter!.z, factoryOutput!.x, factoryOutput!.z,
    )).toBe(true)
    expect(await probe.getBeltCount()).toBeGreaterThanOrEqual(2)

    // ===================== STEP 8: Open editor & write program ==============
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await setProgramInEditor(editorPanel, pxt, PROGRAM_BASIC)
    await editorPanel.expectFallbackValue(PROGRAM_BASIC)
    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    // ===================== STEP 9: Start simulation ========================
    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()
    await hud.expectVisible()

    // ===================== STEP 10: Wait for items delivered ≥ goal =========
    // Level 5 requires 6 outputs total (3 explorer + 3 worker robots).
    // Restarting before the goal is met routes to Level Failed (B1 contract).
    await hud.expectItemsDeliveredAtLeast(6, LOADED_CHROMIUM_DELIVERY_TIMEOUT_MS)
    await hud.expectTimeAdvancing(10000)

    // ===================== STEP 11: Stop simulation → score screen ==========
    await toolbar.expectRestartButtonVisible()
    await toolbar.clickRestart()

    await scoreScreen.expectVisible()
    await scoreScreen.expectTotalVisible()
    await scoreScreen.expectLevelNameVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 6 — Custom Robots
// ---------------------------------------------------------------------------

test.describe('Level 6 — Custom Robots', () => {
  test('full play-through: no tutorial → place fabricator + assembler + output → belts → program → simulate → score', async ({
    saves, mainMenu, levelSelect, toolbar, grid, machinePanel, tutorial, editorPanel, pxt,
    hud, scoreScreen, probe,
  }) => {
    test.setTimeout(LOADED_CHROMIUM_TEST_TIMEOUT_MS)
    const SIZE: GridSize = { width: 16, height: 16 }

    await navigateToLevel(saves, mainMenu, levelSelect, toolbar, grid, SIZE, 5)
    await grid.expectCanvasVisible()

    if (await tutorial.isVisibleNow(2000)) {
      await tutorial.dismissIfPresent(1000)
    }

    await grid.dblClickCell({ x: 4, z: 8 })
    let machines = await probe.getMachines()
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    await placeAndChangeType(grid, machinePanel, { x: 8, z: 8 }, 'assembler')
    machines = await probe.getMachines()
    expect(machines.length).toBe(2)

    await placeAndChangeType(grid, machinePanel, { x: 12, z: 8 }, 'factory_output')
    machines = await probe.getMachines()
    expect(machines.length).toBe(3)

    const fabricator = machines.find((m) => m.type === 'part_fabricator')
    const assembler = machines.find((m) => m.type === 'assembler')
    const factoryOutput = machines.find((m) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(assembler).toBeTruthy()
    expect(factoryOutput).toBeTruthy()

    expect(await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, assembler!.x, assembler!.z,
    )).toBe(true)
    expect(await probe.placeBeltViaTestApi(
      assembler!.x, assembler!.z, factoryOutput!.x, factoryOutput!.z,
    )).toBe(true)
    expect(await probe.getBeltCount()).toBeGreaterThanOrEqual(2)

    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    // The assembler in this chain would receive wheel_small with no recipe set
    // and trigger the `unconsumable_input` game-over rule. Configure Machine.B
    // with AssembleDrivetrainBasic, which lists wheel_small as an input, so
    // the wheel is a legal (consumable) input and items keep flowing.
    await setProgramInEditor(editorPanel, pxt, PROGRAM_BASIC_WITH_DRIVETRAIN)
    await editorPanel.expectFallbackValue(PROGRAM_BASIC_WITH_DRIVETRAIN)
    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()
    await hud.expectVisible()

    // Level 6 requires 6 outputs total (2 explorer + 2 worker + 2 guardian
    // robots). Restarting before the goal is met routes to Level Failed
    // (B1 contract).
    await hud.expectItemsDeliveredAtLeast(6, LOADED_CHROMIUM_DELIVERY_TIMEOUT_MS)
    await hud.expectTimeAdvancing(10000)

    await toolbar.expectRestartButtonVisible()
    await toolbar.clickRestart()

    await scoreScreen.expectVisible()
    await scoreScreen.expectTotalVisible()
    await scoreScreen.expectLevelNameVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 7 — Rush Order!
// ---------------------------------------------------------------------------

test.describe('Level 7 — Rush Order!', () => {
  // NOTE: This level was originally written with `painter` as the intermediate
  // machine. Under the Phase B `unconsumable_input` game-over rule, a painter
  // in the chain would game-over on the first wheel because no painter recipe
  // exists in the production recipe registry (painter is recipe-driven but has
  // zero defined recipes). The chain has been changed to use `quality_checker`
  // — a pass-through machine that accepts any item type — so the full
  // play-through (items delivered → score screen) intent is preserved.
  test('full play-through: no tutorial → place fabricator + quality_checker + output → belts → program → simulate → score', async ({
    saves, mainMenu, levelSelect, toolbar, grid, machinePanel, tutorial, editorPanel, pxt,
    hud, scoreScreen, probe,
  }) => {
    test.setTimeout(LOADED_CHROMIUM_TEST_TIMEOUT_MS)
    const SIZE: GridSize = { width: 18, height: 18 }

    await navigateToLevel(saves, mainMenu, levelSelect, toolbar, grid, SIZE, 6)
    await grid.expectCanvasVisible()

    if (await tutorial.isVisibleNow(2000)) {
      await tutorial.dismissIfPresent(1000)
    }

    await grid.dblClickCell({ x: 4, z: 9 })
    let machines = await probe.getMachines()
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    await placeAndChangeType(grid, machinePanel, { x: 9, z: 9 }, 'quality_checker')
    machines = await probe.getMachines()
    expect(machines.length).toBe(2)

    await placeAndChangeType(grid, machinePanel, { x: 14, z: 9 }, 'factory_output')
    machines = await probe.getMachines()
    expect(machines.length).toBe(3)

    const fabricator = machines.find((m) => m.type === 'part_fabricator')
    const qualityChecker = machines.find((m) => m.type === 'quality_checker')
    const factoryOutput = machines.find((m) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(qualityChecker).toBeTruthy()
    expect(factoryOutput).toBeTruthy()

    expect(await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, qualityChecker!.x, qualityChecker!.z,
    )).toBe(true)
    expect(await probe.placeBeltViaTestApi(
      qualityChecker!.x, qualityChecker!.z, factoryOutput!.x, factoryOutput!.z,
    )).toBe(true)
    expect(await probe.getBeltCount()).toBeGreaterThanOrEqual(2)

    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await setProgramInEditor(editorPanel, pxt, PROGRAM_BASIC)
    await editorPanel.expectFallbackValue(PROGRAM_BASIC)
    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()
    await hud.expectVisible()

    // Level 7 requires 10 robot_worker outputs. Restarting before the goal
    // is met routes to Level Failed (B1 contract). PROGRAM_BASIC produces
    // wheel_small but `outputsDelivered` (the GameManager fail check input)
    // counts every delivered item, so wait for the raw threshold.
    await hud.expectItemsDeliveredAtLeast(10, LOADED_CHROMIUM_DELIVERY_TIMEOUT_MS)
    await hud.expectTimeAdvancing(10000)

    await toolbar.expectRestartButtonVisible()
    await toolbar.clickRestart()

    await scoreScreen.expectVisible()
    await scoreScreen.expectTotalVisible()
    await scoreScreen.expectLevelNameVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 8 — Optimize Everything
// ---------------------------------------------------------------------------

test.describe('Level 8 — Optimize Everything', () => {
  test('full play-through: no tutorial → place fabricator + recycler + output → belts → program → simulate → score', async ({
    saves, mainMenu, levelSelect, toolbar, grid, machinePanel, tutorial, editorPanel, pxt,
    hud, scoreScreen, probe,
  }) => {
    test.setTimeout(LOADED_CHROMIUM_TEST_TIMEOUT_MS)
    const SIZE: GridSize = { width: 20, height: 20 }

    await navigateToLevel(saves, mainMenu, levelSelect, toolbar, grid, SIZE, 7)
    await grid.expectCanvasVisible()

    if (await tutorial.isVisibleNow(2000)) {
      await tutorial.dismissIfPresent(1000)
    }

    await grid.dblClickCell({ x: 4, z: 10 })
    let machines = await probe.getMachines()
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    await placeAndChangeType(grid, machinePanel, { x: 10, z: 10 }, 'recycler')
    machines = await probe.getMachines()
    expect(machines.length).toBe(2)

    await placeAndChangeType(grid, machinePanel, { x: 16, z: 10 }, 'factory_output')
    machines = await probe.getMachines()
    expect(machines.length).toBe(3)

    const fabricator = machines.find((m) => m.type === 'part_fabricator')
    const recycler = machines.find((m) => m.type === 'recycler')
    const factoryOutput = machines.find((m) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(recycler).toBeTruthy()
    expect(factoryOutput).toBeTruthy()

    expect(await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, recycler!.x, recycler!.z,
    )).toBe(true)
    expect(await probe.placeBeltViaTestApi(
      recycler!.x, recycler!.z, factoryOutput!.x, factoryOutput!.z,
    )).toBe(true)
    expect(await probe.getBeltCount()).toBeGreaterThanOrEqual(2)

    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await setProgramInEditor(editorPanel, pxt, PROGRAM_BASIC)
    await editorPanel.expectFallbackValue(PROGRAM_BASIC)
    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()
    await hud.expectVisible()

    // Level 8 requires 10 robot_explorer outputs. Restarting before the goal
    // is met routes to Level Failed (B1 contract). `outputsDelivered` counts
    // every delivered item regardless of recipe.
    await hud.expectItemsDeliveredAtLeast(10, LOADED_CHROMIUM_DELIVERY_TIMEOUT_MS)
    await hud.expectTimeAdvancing(10000)

    await toolbar.expectRestartButtonVisible()
    await toolbar.clickRestart()

    await scoreScreen.expectVisible()
    await scoreScreen.expectTotalVisible()
    await scoreScreen.expectLevelNameVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 9 — Robot Expo (sandbox, no goals)
// ---------------------------------------------------------------------------

const ALL_MACHINE_TYPES = [
  'part_fabricator',
  'assembler',
  'quality_checker',
  'painter',
  'recycler',
  'splitter',
  'factory_output',
]

test.describe('Level 9 — Robot Expo', () => {
  test('full play-through: sandbox — all machines available → place → belt → program → simulate → stop → score', async ({
    saves, mainMenu, levelSelect, toolbar, grid, machinePanel, tutorial, editorPanel, pxt,
    hud, scoreScreen, probe,
  }) => {
    test.setTimeout(90000)
    const SIZE: GridSize = { width: 20, height: 20 }

    await navigateToLevel(saves, mainMenu, levelSelect, toolbar, grid, SIZE, 8)

    await grid.expectCanvasVisible()
    await toolbar.expectVisible()

    // ===================== STEP 2: No tutorial (safety skip) ================
    if (await tutorial.isSkipVisibleNow(2000)) {
      await tutorial.clickSkip()
      await tutorial.expectHidden()
    }

    // ===================== STEP 3: Place Fabricator at (5, 10) ==============
    await grid.dblClickCell({ x: 5, z: 10 })
    let machines = await probe.getMachines()
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // ===================== STEP 4: Place Shipper at (10, 10) ================
    await grid.dblClickCell({ x: 10, z: 10 })
    machines = await probe.getMachines()
    expect(machines.length).toBe(2)

    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()

    await machinePanel.selectType('factory_output')
    await machinePanel.expectTypeValue('factory_output')

    // ===================== STEP 5: Verify ALL machine types in dropdown ======
    const availableOptions = await machinePanel.getTypeOptionValues()
    for (const expectedType of ALL_MACHINE_TYPES) {
      expect(availableOptions, `dropdown should contain ${expectedType}`).toContain(expectedType)
    }

    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    // ===================== STEP 6: Connect belt fabricator → output =========
    machines = await probe.getMachines()
    const fabricator = machines.find((m) => m.type === 'part_fabricator')
    const output = machines.find((m) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(output).toBeTruthy()

    const beltPlaced = await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, output!.x, output!.z,
    )
    expect(beltPlaced).toBe(true)
    expect(await probe.getBeltCount()).toBeGreaterThan(0)

    // ===================== STEP 7: Open editor & write program ==============
    await toolbar.clickEditor()
    await editorPanel.expectOpen()

    await setProgramInEditor(editorPanel, pxt, PROGRAM_BASIC)
    await editorPanel.expectFallbackValue(PROGRAM_BASIC)

    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    // ===================== STEP 8: Start simulation ========================
    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()

    await hud.expectVisible()

    await hud.expectItemsDeliveredGreaterThan(0, 20000)
    await hud.expectTimeAdvancing(10000)

    await toolbar.expectRestartButtonVisible()
    await toolbar.clickRestart()

    await scoreScreen.expectVisible()
    await scoreScreen.expectTotalVisible()
    await scoreScreen.expectLevelNameVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 10 — Factory Tycoon
// ---------------------------------------------------------------------------

test.describe('Level 10 — Factory Tycoon', () => {
  test('full play-through: multi-machine factory → belts → program → simulate → score', async ({
    saves, mainMenu, levelSelect, toolbar, grid, machinePanel, tutorial, editorPanel, pxt,
    hud, scoreScreen, probe,
  }) => {
    test.setTimeout(120000)
    const SIZE: GridSize = { width: 20, height: 20 }

    await navigateToLevel(saves, mainMenu, levelSelect, toolbar, grid, SIZE, 9)

    await grid.expectCanvasVisible()
    await toolbar.expectVisible()

    if (await tutorial.isSkipVisibleNow(2000)) {
      await tutorial.clickSkip()
      await tutorial.expectHidden()
    }

    // ===================== STEP 3: Place Fabricator at (3, 10) ==============
    await grid.dblClickCell({ x: 3, z: 10 })
    let machines = await probe.getMachines()
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // ===================== STEP 4: Place Checker at (7, 10) =================
    await grid.dblClickCell({ x: 7, z: 10 })
    machines = await probe.getMachines()
    expect(machines.length).toBe(2)

    await grid.clickCell({ x: 7, z: 10 })
    await machinePanel.expectVisible()
    await machinePanel.selectType('quality_checker')
    await machinePanel.expectTypeValue('quality_checker')
    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    // ===================== STEP 5: Place Splitter at (11, 10) ==============
    await grid.dblClickCell({ x: 11, z: 10 })
    machines = await probe.getMachines()
    expect(machines.length).toBe(3)

    await grid.clickCell({ x: 11, z: 10 })
    await machinePanel.expectVisible()
    await machinePanel.selectType('splitter')
    await machinePanel.expectTypeValue('splitter')
    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    // ===================== STEP 6: Place Shipper at (15, 10) ================
    await grid.dblClickCell({ x: 15, z: 10 })
    machines = await probe.getMachines()
    expect(machines.length).toBe(4)

    await grid.clickCell({ x: 15, z: 10 })
    await machinePanel.expectVisible()
    await machinePanel.selectType('factory_output')
    await machinePanel.expectTypeValue('factory_output')

    // ===================== STEP 7: Verify ALL machine types in dropdown =====
    const availableOptions = await machinePanel.getTypeOptionValues()
    for (const expectedType of ALL_MACHINE_TYPES) {
      expect(availableOptions, `dropdown should contain ${expectedType}`).toContain(expectedType)
    }

    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    // ===================== STEP 8: Verify machine types after placement =====
    machines = await probe.getMachines()
    expect(machines.length).toBe(4)

    const fabricator = machines.find((m) => m.type === 'part_fabricator')
    const qualityChecker = machines.find((m) => m.type === 'quality_checker')
    const splitter = machines.find((m) => m.type === 'splitter')
    const factoryOutput = machines.find((m) => m.type === 'factory_output')

    expect(fabricator).toBeTruthy()
    expect(qualityChecker).toBeTruthy()
    expect(splitter).toBeTruthy()
    expect(factoryOutput).toBeTruthy()

    // ===================== STEP 9: Connect belts in chain ==================
    expect(await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, qualityChecker!.x, qualityChecker!.z,
    )).toBe(true)
    expect(await probe.placeBeltViaTestApi(
      qualityChecker!.x, qualityChecker!.z, splitter!.x, splitter!.z,
    )).toBe(true)
    expect(await probe.placeBeltViaTestApi(
      splitter!.x, splitter!.z, factoryOutput!.x, factoryOutput!.z,
    )).toBe(true)

    expect(await probe.getBeltCount()).toBeGreaterThanOrEqual(3)

    // ===================== STEP 10: Open editor & write program =============
    await toolbar.clickEditor()
    await editorPanel.expectOpen()

    await setProgramInEditor(editorPanel, pxt, PROGRAM_BASIC)
    await editorPanel.expectFallbackValue(PROGRAM_BASIC)

    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    // ===================== STEP 11: Start simulation ========================
    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()

    await hud.expectVisible()

    // Level 10 requires 15 robot outputs total (5 explorer + 5 worker +
    // 5 guardian). Restarting before the goal is met routes to Level
    // Failed (B1 contract). `outputsDelivered` counts every delivered
    // item regardless of recipe.
    await hud.expectItemsDeliveredAtLeast(15, LOADED_CHROMIUM_DELIVERY_TIMEOUT_MS)
    await hud.expectTimeAdvancing(10000)

    await toolbar.expectRestartButtonVisible()
    await toolbar.clickRestart()

    await scoreScreen.expectVisible()
    await scoreScreen.expectTotalVisible()
    await scoreScreen.expectLevelNameVisible()
  })
})
