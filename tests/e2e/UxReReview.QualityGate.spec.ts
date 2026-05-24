import { test, expect } from './pom'
import type { FactorySaveLike } from './pom/data/saves'

/**
 * QUALITY GATE — UX re-review covering the recipe-badge contract on
 * Projects-menu loads. Drives the THREE scenarios that were broken
 * before the `syncFactoryToEditor()`-before-`populateSimulation()` fix
 * landed in `src/ui/wireProjectsPanel.ts::runDestructiveFactoryReplace`.
 *
 * Captures one screenshot at each of the 5 badge-appearance assertions.
 */

test.use({ viewport: { width: 1920, height: 1080 } })

const WHITE = 0xffffff
const RED = 0xff3333

const FAB_CELL = { x: 10, z: 10 }
const ASM_CELL = { x: 13, z: 10 }

function buildSandboxSave(
  machineType: 'part_fabricator' | 'assembler',
  cell: { x: number; z: number },
  pxtRecipe: string,
): FactorySaveLike {
  const ts = `machines.setRecipe(Machine.A, Recipe.${pxtRecipe})\n`
  return {
    version: 3,
    grid: [{ x: cell.x, z: cell.z, machineType, rotation: 'east' }],
    belts: [],
    pxtWorkspace: JSON.stringify({ ts, blocks: '' }),
  }
}

test.describe('QualityGate — UX re-review: recipe badge across all Projects-menu load paths', () => {
  test('A+B+C: chained loads, same-slot reload, and New-project→load all show correct badge before Start', async ({
    page, mainMenu, toolbar, projectsPanel, recipeIcon, saves, probe,
  }) => {
    test.setTimeout(180_000)

    const slotWheel = 'wheel-slot'
    const slotDrivetrain = 'drivetrain-slot'

    await saves.seedSandboxProjectSlots([
      { name: slotWheel, save: buildSandboxSave('part_fabricator', FAB_CELL, 'WheelPressSmall') },
      { name: slotDrivetrain, save: buildSandboxSave('assembler', ASM_CELL, 'AssembleDrivetrainBasic') },
    ])

    // Capture console errors throughout the entire flow.
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()

    // ====================================================================
    // Scenario A — Step 4: load "wheel-slot" → WHITE badge on Fabricator
    // ====================================================================
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotPresent(slotWheel)
    await projectsPanel.doubleClickSlot(slotWheel)

    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z)?.type ?? null
    }, { timeout: 30_000 }).toBe('part_fabricator')

    await recipeIcon.forceSync()
    const stepA = await recipeIcon.readForMachineAt(FAB_CELL.x, FAB_CELL.z)
    const stepAOut = await recipeIcon.readRecipeOutputTypeAt(FAB_CELL.x, FAB_CELL.z)
    const stepAIconMapSize = await page.evaluate(() => {
      const fr = (window as any).__getFactoryRenderer?.()
      return fr?.recipeIcons?.size ?? -1
    })
    await page.screenshot({
      path: 'test-results/screenshots/qg-step4-A-wheel-slot-WHITE.png',
      fullPage: false,
    })
    expect(stepAOut, 'Scenario A step 4: wheel_press_small badge present').toBe('wheel_small')
    expect(stepA.exists, 'Scenario A step 4: recipe-icon mesh exists').toBe(true)
    expect(stepA.visible).toBe(true)
    expect(stepA.colorHex, 'Scenario A step 4: WHITE badge').toBe(WHITE)
    expect(stepAIconMapSize).toBeGreaterThan(0)

    // ====================================================================
    // Scenario A — Step 5: load "drivetrain-slot" → RED badge on Assembler
    // (the previously broken chained-load path).
    // ====================================================================
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotPresent(slotDrivetrain)
    await projectsPanel.doubleClickSlot(slotDrivetrain)

    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === ASM_CELL.x && m.z === ASM_CELL.z)?.type ?? null
    }, { timeout: 30_000 }).toBe('assembler')

    // Old fabricator gone (destructive replace).
    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z)?.type ?? null
    }, { timeout: 10_000 }).toBeNull()

    await recipeIcon.forceSync()
    const stepB = await recipeIcon.readForMachineAt(ASM_CELL.x, ASM_CELL.z)
    const stepBOut = await recipeIcon.readRecipeOutputTypeAt(ASM_CELL.x, ASM_CELL.z)
    const stepBIconMapSize = await page.evaluate(() => {
      const fr = (window as any).__getFactoryRenderer?.()
      return fr?.recipeIcons?.size ?? -1
    })
    await page.screenshot({
      path: 'test-results/screenshots/qg-step5-A-drivetrain-slot-RED.png',
      fullPage: false,
    })
    expect(stepBOut, 'Scenario A step 5: assemble_drivetrain_basic badge present').toBe('drivetrain_basic')
    expect(stepB.exists).toBe(true)
    expect(stepB.visible).toBe(true)
    expect(stepB.colorHex, 'Scenario A step 5: RED badge (no upstream)').toBe(RED)
    expect(stepBIconMapSize).toBeGreaterThan(0)

    // ====================================================================
    // Scenario B — Step 6: re-load "wheel-slot" → WHITE badge on Fabricator
    // (same-slot reload was broken).
    // ====================================================================
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotPresent(slotWheel)
    await projectsPanel.doubleClickSlot(slotWheel)

    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z)?.type ?? null
    }, { timeout: 30_000 }).toBe('part_fabricator')

    await recipeIcon.forceSync()
    const stepC = await recipeIcon.readForMachineAt(FAB_CELL.x, FAB_CELL.z)
    const stepCOut = await recipeIcon.readRecipeOutputTypeAt(FAB_CELL.x, FAB_CELL.z)
    const stepCIconMapSize = await page.evaluate(() => {
      const fr = (window as any).__getFactoryRenderer?.()
      return fr?.recipeIcons?.size ?? -1
    })
    await page.screenshot({
      path: 'test-results/screenshots/qg-step6-B-wheel-slot-reload-WHITE.png',
      fullPage: false,
    })
    expect(stepCOut, 'Scenario B step 6: badge present after same-slot reload').toBe('wheel_small')
    expect(stepC.exists).toBe(true)
    expect(stepC.visible).toBe(true)
    expect(stepC.colorHex, 'Scenario B step 6: WHITE badge').toBe(WHITE)
    expect(stepCIconMapSize).toBeGreaterThan(0)

    // ====================================================================
    // Scenario C — Step 7: "+ New project" → confirm → factory empties.
    // ====================================================================
    await projectsPanel.expectOpen()
    await projectsPanel.dblClickEmptyPlaceholder()
    await projectsPanel.confirmConfirm()
    await projectsPanel.expectNoModal()

    await expect.poll(() => probe.getMachineCount(), {
      message: '"+ New project" clears the factory',
      timeout: 10_000,
    }).toBe(0)

    await page.screenshot({
      path: 'test-results/screenshots/qg-step7-C-after-new-project-empty.png',
      fullPage: false,
    })

    // ====================================================================
    // Scenario C — Step 8: load "wheel-slot" → WHITE badge on Fabricator
    // (the New-project→load path was broken).
    // ====================================================================
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotPresent(slotWheel)
    await projectsPanel.doubleClickSlot(slotWheel)

    await expect.poll(async () => {
      const ms = await probe.getMachines()
      return ms.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z)?.type ?? null
    }, { timeout: 30_000 }).toBe('part_fabricator')

    await recipeIcon.forceSync()
    const stepD = await recipeIcon.readForMachineAt(FAB_CELL.x, FAB_CELL.z)
    const stepDOut = await recipeIcon.readRecipeOutputTypeAt(FAB_CELL.x, FAB_CELL.z)
    const stepDIconMapSize = await page.evaluate(() => {
      const fr = (window as any).__getFactoryRenderer?.()
      return fr?.recipeIcons?.size ?? -1
    })
    await page.screenshot({
      path: 'test-results/screenshots/qg-step8-C-after-new-project-load-WHITE.png',
      fullPage: false,
    })
    expect(stepDOut, 'Scenario C step 8: badge present after New-project → load').toBe('wheel_small')
    expect(stepD.exists).toBe(true)
    expect(stepD.visible).toBe(true)
    expect(stepD.colorHex, 'Scenario C step 8: WHITE badge').toBe(WHITE)
    expect(stepDIconMapSize).toBeGreaterThan(0)

    // ====================================================================
    // Final console-error gate. Filter benign favicon 404 if any.
    // ====================================================================
    const meaningfulErrors = consoleErrors.filter((e) => !/favicon|404 \(Not Found\)/.test(e))
    expect(
      meaningfulErrors,
      `No console errors expected during the load sequences. Got: ${JSON.stringify(meaningfulErrors, null, 2)}`,
    ).toEqual([])
  })
})
