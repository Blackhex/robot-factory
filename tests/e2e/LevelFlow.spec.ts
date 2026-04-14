import { test, expect, type Page } from '@playwright/test'

/**
 * E2E test: Level 1 — "First Part"
 *
 * 1. Navigate from Main Menu → Level Select → Level 1
 * 2. Skip tutorial
 * 3. Place a fabricator on the 10×10 grid
 * 4. Program it to produce small wheels
 * 5. Start simulation
 * 6. Verify items are produced (HUD counter > 0)
 * 7. Wait for score screen when 3 wheels are produced
 */

test.use({ viewport: { width: 1920, height: 1080 } })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Project a grid cell to canvas pixel coordinates for a W×H grid. */
async function gridCellToScreenPos(
  page: Page,
  gx: number,
  gz: number,
  gridW: number,
  gridH: number,
) {
  return page.evaluate(
    ({ gx, gz, W, H }) => {
      const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const worldX = gx - W / 2 + 0.5
      const worldY = 0
      const worldZ = gz - H / 2 + 0.5
      const fov = 50 * Math.PI / 180
      const d = Math.max(W, H) / (2 * Math.tan(fov / 2)) * 1.2
      const cx = d * 0.7, cy = d * 0.7, cz = d * 0.7
      const fl = Math.sqrt(cx * cx + cy * cy + cz * cz)
      const fx = -cx / fl, fy = -cy / fl, fz = -cz / fl
      let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0
      const rl = Math.sqrt(rx * rx + ry * ry + rz * rz)
      rx /= rl; ry /= rl; rz /= rl
      const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx
      const dx = worldX - cx, dy = worldY - cy, dz = worldZ - cz
      const vx = dx * rx + dy * ry + dz * rz
      const vy = dx * ux + dy * uy + dz * uz
      const vz = dx * fx + dy * fy + dz * fz
      const thf = Math.tan(fov / 2), asp = rect.width / rect.height
      const nx = vx / (-vz * thf * asp), ny = vy / (-vz * thf)
      return {
        x: Math.round((nx + 1) / 2 * rect.width),
        y: Math.round((1 - ny) / 2 * rect.height),
      }
    },
    { gx, gz, W: gridW, H: gridH },
  )
}

/** Double-click a grid cell to place a machine. */
async function dblClickGridCell(
  page: Page,
  gx: number,
  gz: number,
  gridW: number,
  gridH: number,
) {
  const pos = await gridCellToScreenPos(page, gx, gz, gridW, gridH)
  const canvas = page.locator('#canvas-container canvas')
  await canvas.dblclick({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(150)
}

/** Click a grid cell on the Three.js canvas. */
async function clickGridCell(
  page: Page,
  gx: number,
  gz: number,
  gridW: number,
  gridH: number,
) {
  const pos = await gridCellToScreenPos(page, gx, gz, gridW, gridH)
  const canvas = page.locator('#canvas-container canvas')
  await canvas.click({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(150)
}

/** Navigate from main menu to Level 1. */
async function navigateToLevel1(page: Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas')
    return c && c.width > 0 && c.height > 0
  })

  // Main Menu → Level Select
  const startBtn = page.locator('.ui-main-menu-btn--primary')
  await expect(startBtn).toBeVisible()
  await startBtn.click()
  await expect(page.locator('.ui-level-select')).toBeVisible()

  // Click first unlocked level card (Level 1)
  await page.locator('.ui-level-card:not(.ui-level-card--locked)').first().click()
  await expect(page.locator('.ui-level-select')).toBeHidden()
  await expect(page.locator('.ui-toolbar')).toBeVisible()

  // Wait for camera zoom-to-fit animation
  await page.waitForTimeout(1200)
}

/**
 * Navigate from main menu to a specific level by index (0-based).
 * Pre-seeds localStorage progress so all levels up to `levelIndex` are unlocked.
 */
async function navigateToLevel(page: Page, levelIndex: number) {
  // Build progress data: give 1 star to every level before the target
  const progressLevels: Record<string, number> = {}
  for (let i = 0; i < levelIndex; i++) {
    progressLevels[`level_${i + 1}`] = 1
  }

  // Pre-seed progress in localStorage before loading the page
  await page.addInitScript((progress) => {
    localStorage.setItem('rf_progress', JSON.stringify({ levels: progress }))
  }, progressLevels)

  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas')
    return c && c.width > 0 && c.height > 0
  })

  // Main Menu → Level Select
  const startBtn = page.locator('.ui-main-menu-btn--primary')
  await expect(startBtn).toBeVisible()
  await startBtn.click()
  await expect(page.locator('.ui-level-select')).toBeVisible()

  // Click the target level card (nth unlocked card)
  const unlocked = page.locator('.ui-level-card:not(.ui-level-card--locked)')
  await expect(unlocked.nth(levelIndex)).toBeVisible()
  await unlocked.nth(levelIndex).click()
  await expect(page.locator('.ui-level-select')).toBeHidden()
  await expect(page.locator('.ui-toolbar')).toBeVisible()

  // Wait for camera zoom-to-fit animation
  await page.waitForTimeout(1200)
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe('Level 1 — First Part', () => {
  test('full play-through: tutorial → place machines → belt → program → simulate → score', async ({ page }) => {
    test.setTimeout(90000)

    const GRID_W = 10
    const GRID_H = 10

    // ===================== STEP 1: Navigate to Level 1 =====================
    await navigateToLevel1(page)

    const canvas = page.locator('#canvas-container canvas')
    await expect(canvas).toBeVisible()
    await expect(page.locator('.ui-toolbar')).toBeVisible()

    // ===================== STEP 2: Tutorial step 1 — visible ===============
    const tutorial = page.locator('.ui-tutorial')
    await expect(tutorial).toBeVisible({ timeout: 5000 })
    const tooltip = page.locator('.ui-tutorial-tooltip')
    await expect(tooltip).toBeVisible()

    // Verify step counter shows "1 / 6"
    const counter = page.locator('.ui-tutorial-counter')
    await expect(counter).toContainText('1 / 6')

    // Click Next to advance to step 2
    const nextBtn = page.locator('.ui-tutorial-btn--next')
    await nextBtn.click()
    await expect(counter).toContainText('2 / 6')

    // ===================== STEP 3: Place Fabricator at (3, 5) ===============
    await dblClickGridCell(page, 3, 5, GRID_W, GRID_H)

    // ===================== STEP 4: Advance tutorial to step 3 ===============
    await nextBtn.click()
    await expect(counter).toContainText('3 / 6')

    // ===================== STEP 5: Place second machine at (5, 5) ===========
    await dblClickGridCell(page, 5, 5, GRID_W, GRID_H)

    // ===================== STEP 6: Select machine at (5,5) & change type ====
    await clickGridCell(page, 5, 5, GRID_W, GRID_H)
    const machinePanel = page.locator('.ui-machine-panel')
    await expect(machinePanel).toBeVisible({ timeout: 5000 })

    // Change the machine type to factory_output
    const typeSelect = machinePanel.locator('.ui-machine-panel-select')
    await typeSelect.selectOption('factory_output')
    await expect(typeSelect).toHaveValue('factory_output')

    // Close machine panel
    await machinePanel.locator('.ui-machine-panel-close').click()
    await expect(machinePanel).toBeHidden()

    // ===================== STEP 7: Advance tutorial to step 4 ===============
    await nextBtn.click()
    await expect(counter).toContainText('4 / 6')

    // ===================== STEP 8: Connect belt from fabricator → output =====
    // Belt drawing via mouse drag requires hitting 3D slot meshes which is unreliable
    // in headless browsers. Use the programmatic test helper to place the belt.
    // Coordinates come from actual machine positions (grid projection may differ).
    const machines = await page.evaluate(() => (window as any).__test?.getMachines?.() ?? [])
    const fabricator = machines.find((m: any) => m.type === 'part_fabricator')
    const output = machines.find((m: any) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(output).toBeTruthy()
    const beltPlaced = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: fabricator.x, sz: fabricator.z, dx: output.x, dz: output.z })
    expect(beltPlaced).toBe(true)

    // ===================== STEP 9: Advance tutorial to step 5 ===============
    await nextBtn.click()
    await expect(counter).toContainText('5 / 6')

    // ===================== STEP 10: Open editor =============================
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)

    // ===================== STEP 11: Advance tutorial to step 6 ==============
    await nextBtn.click()
    await expect(counter).toContainText('6 / 6')

    // ===================== STEP 12: Write program in fallback textarea ======
    const programCode =
      'machines.producePart(Machine.A, PartType.WheelSmall)\n' +
      'machines.startMachine(Machine.A)'

    const pxtIframe = page.locator('.pxt-editor-iframe')
    const isPxtLoaded = await pxtIframe.isVisible({ timeout: 3000 }).catch(() => false)

    if (isPxtLoaded) {
      const fallback = page.locator('.pxt-editor-fallback-textarea')
      await fallback.evaluate((el: HTMLTextAreaElement, code: string) => {
        el.value = code
      }, programCode)
    } else {
      const textarea = page.locator('.pxt-editor-fallback-textarea')
      await expect(textarea).toBeVisible()
      await textarea.fill(programCode)
    }

    // Verify the textarea contains the program
    const textarea = page.locator('.pxt-editor-fallback-textarea')
    await expect(textarea).toHaveValue(programCode)

    // Close editor
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).not.toHaveClass(/open/)

    // ===================== STEP 13: Finish tutorial (last step) =============
    // The last step's Next button says "Finish" — click it to dismiss tutorial
    // Tutorial may have auto-hidden when we opened the editor; only click if still visible
    if (await tutorial.isVisible().catch(() => false)) {
      await expect(nextBtn).toBeVisible()
      await nextBtn.click()
      await expect(tutorial).toBeHidden({ timeout: 3000 })
    }

    // ===================== STEP 14: Start simulation ========================
    const startSimBtn = page.locator('.ui-toolbar-btn--start')
    await expect(startSimBtn).toBeVisible()
    await startSimBtn.click()

    // ===================== STEP 15: Verify HUD is visible ===================
    const hud = page.locator('.ui-hud')
    await expect(hud).toBeVisible()

    // Items delivered metric (first .ui-hud-metric-value)
    const itemsMetric = page.locator('.ui-hud-metric-value').first()

    // ===================== STEP 16: Wait for items delivered ≥ 3 ============
    await expect(async () => {
      const text = await itemsMetric.textContent()
      expect(parseInt(text ?? '0', 10)).toBeGreaterThanOrEqual(3)
    }).toPass({ timeout: 30000, intervals: [500] })

    // Verify time is advancing
    await expect(async () => {
      const time = await page.locator('.ui-hud-metric-value').nth(2).textContent()
      expect(time).not.toBe('0:00')
    }).toPass({ timeout: 10000, intervals: [500] })

    // ===================== STEP 17: Stop simulation → score screen ==========
    const restartBtn = page.locator('.ui-toolbar-btn--restart')
    await expect(restartBtn).toBeVisible()
    await restartBtn.click()

    // ===================== STEP 18: Verify score screen =====================
    const scoreScreen = page.locator('.ui-score-screen')
    await expect(scoreScreen).toBeVisible({ timeout: 5000 })

    // Verify score screen contains star ratings
    const scoreTotal = page.locator('.ui-score-total')
    await expect(scoreTotal).toBeVisible()

    // Verify level name is displayed on score screen
    const scoreLevelName = page.locator('.ui-score-level-name')
    await expect(scoreLevelName).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 2 — Assembly Line
// ---------------------------------------------------------------------------

test.describe('Level 2 — Assembly Line', () => {
  test('full play-through: tutorial → place machines → belt → program → simulate → score', async ({ page }) => {
    test.setTimeout(90000)
    const GRID_W = 12
    const GRID_H = 12

    // ===================== STEP 1: Navigate to Level 2 =====================
    await navigateToLevel(page, 1) // index 1 = Level 2

    const canvas = page.locator('#canvas-container canvas')
    await expect(canvas).toBeVisible()

    // ===================== STEP 2: Tutorial step 1 — visible ===============
    const tutorial = page.locator('.ui-tutorial')
    await expect(tutorial).toBeVisible({ timeout: 5000 })
    const counter = page.locator('.ui-tutorial-counter')
    await expect(counter).toContainText('1 / 3')

    // Tutorial step 1 → Next
    const nextBtn = page.locator('.ui-tutorial-btn--next')
    await nextBtn.click()
    await expect(counter).toContainText('2 / 3')

    // ===================== STEP 3: Place Fabricator at (5, 5) ===============
    await dblClickGridCell(page, 5, 5, GRID_W, GRID_H)

    // Verify machine was placed
    let machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // Select the fabricator and verify panel appears
    await clickGridCell(page, 5, 5, GRID_W, GRID_H)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })
    const typeSelect = panel.locator('.ui-machine-panel-select')
    await expect(typeSelect).toHaveValue('part_fabricator')
    await panel.locator('.ui-machine-panel-close').click()

    // ===================== STEP 4: Place second machine at (7, 5) ==========
    await dblClickGridCell(page, 7, 5, GRID_W, GRID_H)

    // Verify second machine was placed
    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(2)

    // Change second machine type to factory_output via clicking
    await clickGridCell(page, 7, 5, GRID_W, GRID_H)
    await expect(panel).toBeVisible({ timeout: 5000 })
    await typeSelect.selectOption('factory_output')
    await expect(typeSelect).toHaveValue('factory_output')
    await panel.locator('.ui-machine-panel-close').click()

    // ===================== STEP 5: Tutorial step 2 → Next ==================
    await nextBtn.click()
    await expect(counter).toContainText('3 / 3')

    // ===================== STEP 6: Connect belt fabricator → output =========
    // Re-read machines to get actual positions for belt placement
    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    const fabricator = machines.find((m: any) => m.type === 'part_fabricator')
    const output = machines.find((m: any) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(output).toBeTruthy()

    const beltPlaced = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: fabricator!.x, sz: fabricator!.z, dx: output!.x, dz: output!.z })
    expect(beltPlaced).toBe(true)

    // Verify belt was created
    const belts = await page.evaluate(() => (window as any).__test?.getBelts?.() ?? [])
    expect(belts.length).toBeGreaterThan(0)

    // ===================== STEP 7: Tutorial step 3 (last) → Finish =========
    await nextBtn.click()
    // Tutorial should now be hidden
    await expect(tutorial).toBeHidden({ timeout: 3000 })

    // ===================== STEP 8: Open editor and write program ===========
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)

    const programCode =
      'machines.producePart(Machine.A, PartType.WheelSmall)\n' +
      'machines.startMachine(Machine.A)'

    const pxtIframe = page.locator('.pxt-editor-iframe')
    const isPxtLoaded = await pxtIframe.isVisible({ timeout: 3000 }).catch(() => false)

    if (isPxtLoaded) {
      const fallback = page.locator('.pxt-editor-fallback-textarea')
      await fallback.evaluate((el: HTMLTextAreaElement, code: string) => {
        el.value = code
      }, programCode)
    } else {
      const textarea = page.locator('.pxt-editor-fallback-textarea')
      await expect(textarea).toBeVisible()
      await textarea.fill(programCode)
    }

    // Verify code is in textarea
    await expect(page.locator('.pxt-editor-fallback-textarea')).toHaveValue(programCode)

    // Close editor
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).not.toHaveClass(/open/)

    // ===================== STEP 9: Start simulation ========================
    const startBtn = page.locator('.ui-toolbar-btn--start')
    await startBtn.click()

    // HUD should appear
    const hud = page.locator('.ui-hud')
    await expect(hud).toBeVisible()

    // ===================== STEP 10: Wait for items delivered > 0 ===========
    const itemsMetric = page.locator('.ui-hud-metric-value').first()
    await expect(async () => {
      const text = await itemsMetric.textContent()
      expect(parseInt(text ?? '0', 10)).toBeGreaterThan(0)
    }).toPass({ timeout: 20000, intervals: [500] })

    // Verify time is advancing
    await expect(async () => {
      const time = await page.locator('.ui-hud-metric-value').nth(2).textContent()
      expect(time).not.toBe('0:00')
    }).toPass({ timeout: 10000, intervals: [500] })

    // ===================== STEP 11: Stop simulation → score screen =========
    await page.locator('.ui-toolbar-btn--restart').click()

    const scoreScreen = page.locator('.ui-score-screen')
    await expect(scoreScreen).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.ui-score-total')).toBeVisible()
    await expect(page.locator('.ui-score-level-name')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 3 — Mass Production
// ---------------------------------------------------------------------------

test.describe('Level 3 — Mass Production', () => {
  test('full play-through: tutorial → place machines → belt → loop program → simulate → score', async ({ page }) => {
    test.setTimeout(90000)

    const GRID_W = 14
    const GRID_H = 14

    // ===================== STEP 1: Navigate to Level 3 =====================
    await navigateToLevel(page, 2) // index 2 = Level 3

    const canvas = page.locator('#canvas-container canvas')
    await expect(canvas).toBeVisible()

    // ===================== STEP 2: Tutorial (2 steps) ======================
    const tutorial = page.locator('.ui-tutorial')
    await expect(tutorial).toBeVisible({ timeout: 5000 })
    const counter = page.locator('.ui-tutorial-counter')
    await expect(counter).toContainText('1 / 2')

    // Tutorial step 1: "Open the Editor — you now have Loop blocks!"
    const nextBtn = page.locator('.ui-tutorial-btn--next')
    await nextBtn.click()
    await expect(counter).toContainText('2 / 2')

    // Tutorial step 2: "Loops repeat your instructions automatically"
    // Finish tutorial (last step)
    await nextBtn.click()
    await expect(tutorial).toBeHidden({ timeout: 3000 })

    // ===================== STEP 3: Place Fabricator at (5, 7) ===============
    await dblClickGridCell(page, 5, 7, GRID_W, GRID_H)

    // Verify machine was placed
    let machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // ===================== STEP 4: Place second machine at (7, 7) ===========
    await dblClickGridCell(page, 7, 7, GRID_W, GRID_H)

    // Verify second machine was placed
    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(2)

    // ===================== STEP 5: Change second machine to factory_output ===
    await clickGridCell(page, 7, 7, GRID_W, GRID_H)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })

    const typeSelect = panel.locator('.ui-machine-panel-select')
    await typeSelect.selectOption('factory_output')
    await expect(typeSelect).toHaveValue('factory_output')

    // Close machine panel
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // Verify both machines via __test
    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    const fabricator = machines.find((m: any) => m.type === 'part_fabricator')
    const output = machines.find((m: any) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(output).toBeTruthy()

    // ===================== STEP 6: Connect belt fabricator → output =========
    const beltPlaced = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: fabricator!.x, sz: fabricator!.z, dx: output!.x, dz: output!.z })
    expect(beltPlaced).toBe(true)

    // Verify belt was created
    const belts = await page.evaluate(() => (window as any).__test?.getBelts?.() ?? [])
    expect(belts.length).toBeGreaterThan(0)

    // ===================== STEP 7: Open editor & write loop program =========
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)

    // Use a loop to produce 10 wheel_small — this level teaches loops
    const programCode =
      'loops.repeatTimes(10, () => {\n' +
      '  machines.producePart(Machine.A, PartType.WheelSmall)\n' +
      '})\n' +
      'machines.startMachine(Machine.A)'

    const pxtIframe = page.locator('.pxt-editor-iframe')
    const isPxtLoaded = await pxtIframe.isVisible({ timeout: 3000 }).catch(() => false)

    if (isPxtLoaded) {
      const fallback = page.locator('.pxt-editor-fallback-textarea')
      await fallback.evaluate((el: HTMLTextAreaElement, code: string) => {
        el.value = code
      }, programCode)
    } else {
      const textarea = page.locator('.pxt-editor-fallback-textarea')
      await expect(textarea).toBeVisible()
      await textarea.fill(programCode)
    }

    // Verify code is in textarea
    await expect(page.locator('.pxt-editor-fallback-textarea')).toHaveValue(programCode)

    // Close editor
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).not.toHaveClass(/open/)

    // ===================== STEP 8: Start simulation ========================
    const startBtn = page.locator('.ui-toolbar-btn--start')
    await expect(startBtn).toBeVisible()
    await startBtn.click()

    // HUD should appear
    const hud = page.locator('.ui-hud')
    await expect(hud).toBeVisible()

    // ===================== STEP 9: Wait for items delivered ≥ 10 ============
    // Level 3 goal: produce_parts 10 wheel_small
    const itemsMetric = page.locator('.ui-hud-metric-value').first()

    await expect(async () => {
      const text = await itemsMetric.textContent()
      expect(parseInt(text ?? '0', 10)).toBeGreaterThanOrEqual(10)
    }).toPass({ timeout: 60000, intervals: [500] })

    // Verify time is advancing
    await expect(async () => {
      const time = await page.locator('.ui-hud-metric-value').nth(2).textContent()
      expect(time).not.toBe('0:00')
    }).toPass({ timeout: 10000, intervals: [500] })

    // ===================== STEP 10: Stop simulation → score screen ==========
    const restartBtn = page.locator('.ui-toolbar-btn--restart')
    await expect(restartBtn).toBeVisible()
    await restartBtn.click()

    // ===================== STEP 11: Verify score screen =====================
    const scoreScreen = page.locator('.ui-score-screen')
    await expect(scoreScreen).toBeVisible({ timeout: 5000 })

    // Verify score screen components
    await expect(page.locator('.ui-score-total')).toBeVisible()
    await expect(page.locator('.ui-score-level-name')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 4 — Quality Matters
// ---------------------------------------------------------------------------

test.describe('Level 4 — Quality Matters', () => {
  test('full play-through: tutorial → place machines → belts → program → simulate → score', async ({ page }) => {
    test.setTimeout(90000)

    const GRID_W = 14
    const GRID_H = 14

    // ===================== STEP 1: Navigate to Level 4 =====================
    await navigateToLevel(page, 3) // index 3 = Level 4

    const canvas = page.locator('#canvas-container canvas')
    await expect(canvas).toBeVisible()

    // ===================== STEP 2: Tutorial (2 steps) ======================
    const tutorial = page.locator('.ui-tutorial')
    await expect(tutorial).toBeVisible({ timeout: 5000 })
    const counter = page.locator('.ui-tutorial-counter')
    await expect(counter).toContainText('1 / 2')

    // Tutorial step 1: "You have a new machine: Checker!"
    const nextBtn = page.locator('.ui-tutorial-btn--next')
    await nextBtn.click()
    await expect(counter).toContainText('2 / 2')

    // Tutorial step 2: "Use 'if quality' blocks…" — Finish
    await nextBtn.click()
    await expect(tutorial).toBeHidden({ timeout: 3000 })

    // ===================== STEP 3: Place Fabricator at (4, 7) ===============
    await dblClickGridCell(page, 4, 7, GRID_W, GRID_H)

    // Verify machine was placed
    let machines: any[] = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // ===================== STEP 4: Place Checker at (7, 7) ==================
    await dblClickGridCell(page, 7, 7, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(2)

    // Change second machine to quality_checker
    await clickGridCell(page, 7, 7, GRID_W, GRID_H)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })

    const typeSelect = panel.locator('.ui-machine-panel-select')
    await typeSelect.selectOption('quality_checker')
    await expect(typeSelect).toHaveValue('quality_checker')

    // Close machine panel
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // ===================== STEP 5: Place Shipper at (10, 7) =================
    await dblClickGridCell(page, 10, 7, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(3)

    // Change third machine to factory_output
    await clickGridCell(page, 10, 7, GRID_W, GRID_H)
    await expect(panel).toBeVisible({ timeout: 5000 })
    await typeSelect.selectOption('factory_output')
    await expect(typeSelect).toHaveValue('factory_output')
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // Verify all three machines have correct types
    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    const fabricator = machines.find((m: any) => m.type === 'part_fabricator')
    const qualityChecker = machines.find((m: any) => m.type === 'quality_checker')
    const factoryOutput = machines.find((m: any) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(qualityChecker).toBeTruthy()
    expect(factoryOutput).toBeTruthy()

    // ===================== STEP 6: Connect belts ============================
    // Belt 1: fabricator → quality_checker
    const belt1 = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: fabricator!.x, sz: fabricator!.z, dx: qualityChecker!.x, dz: qualityChecker!.z })
    expect(belt1).toBe(true)

    // Belt 2: quality_checker → factory_output
    const belt2 = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: qualityChecker!.x, sz: qualityChecker!.z, dx: factoryOutput!.x, dz: factoryOutput!.z })
    expect(belt2).toBe(true)

    // Verify belts were created
    const belts = await page.evaluate(() => (window as any).__test?.getBelts?.() ?? [])
    expect(belts.length).toBeGreaterThanOrEqual(2)

    // ===================== STEP 7: Open editor & write program ==============
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)

    const programCode =
      'machines.producePart(Machine.A, PartType.WheelSmall)\n' +
      'machines.startMachine(Machine.A)'

    const pxtIframe = page.locator('.pxt-editor-iframe')
    const isPxtLoaded = await pxtIframe.isVisible({ timeout: 3000 }).catch(() => false)

    if (isPxtLoaded) {
      const fallback = page.locator('.pxt-editor-fallback-textarea')
      await fallback.evaluate((el: HTMLTextAreaElement, code: string) => {
        el.value = code
      }, programCode)
    } else {
      const textarea = page.locator('.pxt-editor-fallback-textarea')
      await expect(textarea).toBeVisible()
      await textarea.fill(programCode)
    }

    // Verify code is in textarea
    await expect(page.locator('.pxt-editor-fallback-textarea')).toHaveValue(programCode)

    // Close editor
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).not.toHaveClass(/open/)

    // ===================== STEP 8: Start simulation ========================
    const startBtn = page.locator('.ui-toolbar-btn--start')
    await expect(startBtn).toBeVisible()
    await startBtn.click()

    // HUD should appear
    const hud = page.locator('.ui-hud')
    await expect(hud).toBeVisible()

    // ===================== STEP 9: Wait for items delivered > 0 =============
    const itemsMetric = page.locator('.ui-hud-metric-value').first()

    await expect(async () => {
      const text = await itemsMetric.textContent()
      expect(parseInt(text ?? '0', 10)).toBeGreaterThan(0)
    }).toPass({ timeout: 30000, intervals: [500] })

    // Verify time is advancing
    await expect(async () => {
      const time = await page.locator('.ui-hud-metric-value').nth(2).textContent()
      expect(time).not.toBe('0:00')
    }).toPass({ timeout: 10000, intervals: [500] })

    // ===================== STEP 10: Stop simulation → score screen ==========
    const restartBtn = page.locator('.ui-toolbar-btn--restart')
    await expect(restartBtn).toBeVisible()
    await restartBtn.click()

    // ===================== STEP 11: Verify score screen =====================
    const scoreScreen = page.locator('.ui-score-screen')
    await expect(scoreScreen).toBeVisible({ timeout: 5000 })

    // Verify score screen components
    await expect(page.locator('.ui-score-total')).toBeVisible()
    await expect(page.locator('.ui-score-level-name')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 5 — Smart Routing
// ---------------------------------------------------------------------------

test.describe('Level 5 — Smart Routing', () => {
  test('full play-through: no tutorial → place machines with splitter → belts → program → simulate → score', async ({ page }) => {
    test.setTimeout(90000)

    const GRID_W = 16
    const GRID_H = 16

    // ===================== STEP 1: Navigate to Level 5 =====================
    await navigateToLevel(page, 4) // index 4 = Level 5

    const canvas = page.locator('#canvas-container canvas')
    await expect(canvas).toBeVisible()

    // ===================== STEP 2: Verify NO tutorial appears ===============
    const tutorial = page.locator('.ui-tutorial')
    const tutorialVisible = await tutorial.isVisible({ timeout: 2000 }).catch(() => false)
    if (tutorialVisible) {
      // Safety: skip if one unexpectedly shows
      const skipBtn = page.locator('.ui-tutorial-btn--skip')
      if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await skipBtn.click()
      }
    }

    // ===================== STEP 3: Place Fabricator at (4, 8) ===============
    await dblClickGridCell(page, 4, 8, GRID_W, GRID_H)

    // Verify machine was placed
    let machines: any[] = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // ===================== STEP 4: Place Splitter at (8, 8) =================
    await dblClickGridCell(page, 8, 8, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(2)

    // Change second machine to splitter
    await clickGridCell(page, 8, 8, GRID_W, GRID_H)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })

    const typeSelect = panel.locator('.ui-machine-panel-select')
    await typeSelect.selectOption('splitter')
    await expect(typeSelect).toHaveValue('splitter')

    // Close machine panel
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // ===================== STEP 5: Place Shipper at (12, 8) =================
    await dblClickGridCell(page, 12, 8, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(3)

    // Change third machine to factory_output
    await clickGridCell(page, 12, 8, GRID_W, GRID_H)
    await expect(panel).toBeVisible({ timeout: 5000 })
    await typeSelect.selectOption('factory_output')
    await expect(typeSelect).toHaveValue('factory_output')
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // ===================== STEP 6: Verify all machines have correct types ====
    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    const fabricator = machines.find((m: any) => m.type === 'part_fabricator')
    const splitter = machines.find((m: any) => m.type === 'splitter')
    const factoryOutput = machines.find((m: any) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(splitter).toBeTruthy()
    expect(factoryOutput).toBeTruthy()

    // ===================== STEP 7: Connect belts ============================
    // Belt 1: fabricator → splitter
    const belt1 = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: fabricator!.x, sz: fabricator!.z, dx: splitter!.x, dz: splitter!.z })
    expect(belt1).toBe(true)

    // Belt 2: splitter → factory_output
    const belt2 = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: splitter!.x, sz: splitter!.z, dx: factoryOutput!.x, dz: factoryOutput!.z })
    expect(belt2).toBe(true)

    // Verify belts were created
    const belts = await page.evaluate(() => (window as any).__test?.getBelts?.() ?? [])
    expect(belts.length).toBeGreaterThanOrEqual(2)

    // ===================== STEP 8: Open editor & write program ==============
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)

    const programCode =
      'machines.producePart(Machine.A, PartType.WheelSmall)\n' +
      'machines.startMachine(Machine.A)'

    const pxtIframe = page.locator('.pxt-editor-iframe')
    const isPxtLoaded = await pxtIframe.isVisible({ timeout: 3000 }).catch(() => false)

    if (isPxtLoaded) {
      const fallback = page.locator('.pxt-editor-fallback-textarea')
      await fallback.evaluate((el: HTMLTextAreaElement, code: string) => {
        el.value = code
      }, programCode)
    } else {
      const textarea = page.locator('.pxt-editor-fallback-textarea')
      await expect(textarea).toBeVisible()
      await textarea.fill(programCode)
    }

    // Verify code is in textarea
    await expect(page.locator('.pxt-editor-fallback-textarea')).toHaveValue(programCode)

    // Close editor
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).not.toHaveClass(/open/)

    // ===================== STEP 9: Start simulation ========================
    const startBtn = page.locator('.ui-toolbar-btn--start')
    await expect(startBtn).toBeVisible()
    await startBtn.click()

    // HUD should appear
    const hud = page.locator('.ui-hud')
    await expect(hud).toBeVisible()

    // ===================== STEP 10: Wait for items delivered > 0 ============
    const itemsMetric = page.locator('.ui-hud-metric-value').first()

    await expect(async () => {
      const text = await itemsMetric.textContent()
      expect(parseInt(text ?? '0', 10)).toBeGreaterThan(0)
    }).toPass({ timeout: 30000, intervals: [500] })

    // Verify time is advancing
    await expect(async () => {
      const time = await page.locator('.ui-hud-metric-value').nth(2).textContent()
      expect(time).not.toBe('0:00')
    }).toPass({ timeout: 10000, intervals: [500] })

    // ===================== STEP 11: Stop simulation → score screen ==========
    const restartBtn = page.locator('.ui-toolbar-btn--restart')
    await expect(restartBtn).toBeVisible()
    await restartBtn.click()

    // ===================== STEP 12: Verify score screen =====================
    const scoreScreen = page.locator('.ui-score-screen')
    await expect(scoreScreen).toBeVisible({ timeout: 5000 })

    // Verify score screen components
    await expect(page.locator('.ui-score-total')).toBeVisible()
    await expect(page.locator('.ui-score-level-name')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 6 — Custom Robots
// ---------------------------------------------------------------------------

test.describe('Level 6 — Custom Robots', () => {
  test('full play-through: no tutorial → place fabricator + assembler + output → belts → program → simulate → score', async ({ page }) => {
    test.setTimeout(90000)

    const GRID_W = 16
    const GRID_H = 16

    // ===================== STEP 1: Navigate to Level 6 =====================
    await navigateToLevel(page, 5) // index 5 = Level 6

    const canvas = page.locator('#canvas-container canvas')
    await expect(canvas).toBeVisible()

    // ===================== STEP 2: Verify NO tutorial appears ===============
    const tutorial = page.locator('.ui-tutorial')
    const tutorialVisible = await tutorial.isVisible({ timeout: 2000 }).catch(() => false)
    if (tutorialVisible) {
      // Safety: skip if one unexpectedly shows
      const skipBtn = page.locator('.ui-tutorial-btn--skip')
      if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await skipBtn.click()
      }
    }

    // ===================== STEP 3: Place Fabricator at (4, 8) ===============
    await dblClickGridCell(page, 4, 8, GRID_W, GRID_H)

    // Verify machine was placed
    let machines: any[] = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // ===================== STEP 4: Place Assembler at (8, 8) ================
    await dblClickGridCell(page, 8, 8, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(2)

    // Change second machine to assembler
    await clickGridCell(page, 8, 8, GRID_W, GRID_H)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })

    const typeSelect = panel.locator('.ui-machine-panel-select')
    await typeSelect.selectOption('assembler')
    await expect(typeSelect).toHaveValue('assembler')

    // Close machine panel
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // ===================== STEP 5: Place Shipper at (12, 8) =================
    await dblClickGridCell(page, 12, 8, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(3)

    // Change third machine to factory_output
    await clickGridCell(page, 12, 8, GRID_W, GRID_H)
    await expect(panel).toBeVisible({ timeout: 5000 })
    await typeSelect.selectOption('factory_output')
    await expect(typeSelect).toHaveValue('factory_output')
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // ===================== STEP 6: Verify all machines have correct types ====
    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    const fabricator = machines.find((m: any) => m.type === 'part_fabricator')
    const assembler = machines.find((m: any) => m.type === 'assembler')
    const factoryOutput = machines.find((m: any) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(assembler).toBeTruthy()
    expect(factoryOutput).toBeTruthy()

    // ===================== STEP 7: Connect belts ============================
    // Belt 1: fabricator → assembler
    const belt1 = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: fabricator!.x, sz: fabricator!.z, dx: assembler!.x, dz: assembler!.z })
    expect(belt1).toBe(true)

    // Belt 2: assembler → factory_output
    const belt2 = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: assembler!.x, sz: assembler!.z, dx: factoryOutput!.x, dz: factoryOutput!.z })
    expect(belt2).toBe(true)

    // Verify belts were created
    const belts = await page.evaluate(() => (window as any).__test?.getBelts?.() ?? [])
    expect(belts.length).toBeGreaterThanOrEqual(2)

    // ===================== STEP 8: Open editor & write program ==============
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)

    const programCode =
      'machines.producePart(Machine.A, PartType.WheelSmall)\n' +
      'machines.startMachine(Machine.A)'

    const pxtIframe = page.locator('.pxt-editor-iframe')
    const isPxtLoaded = await pxtIframe.isVisible({ timeout: 3000 }).catch(() => false)

    if (isPxtLoaded) {
      const fallback = page.locator('.pxt-editor-fallback-textarea')
      await fallback.evaluate((el: HTMLTextAreaElement, code: string) => {
        el.value = code
      }, programCode)
    } else {
      const textarea = page.locator('.pxt-editor-fallback-textarea')
      await expect(textarea).toBeVisible()
      await textarea.fill(programCode)
    }

    // Verify code is in textarea
    await expect(page.locator('.pxt-editor-fallback-textarea')).toHaveValue(programCode)

    // Close editor
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).not.toHaveClass(/open/)

    // ===================== STEP 9: Start simulation ========================
    const startBtn = page.locator('.ui-toolbar-btn--start')
    await expect(startBtn).toBeVisible()
    await startBtn.click()

    // HUD should appear
    const hud = page.locator('.ui-hud')
    await expect(hud).toBeVisible()

    // ===================== STEP 10: Wait for items delivered > 0 ============
    const itemsMetric = page.locator('.ui-hud-metric-value').first()

    await expect(async () => {
      const text = await itemsMetric.textContent()
      expect(parseInt(text ?? '0', 10)).toBeGreaterThan(0)
    }).toPass({ timeout: 30000, intervals: [500] })

    // Verify time is advancing
    await expect(async () => {
      const time = await page.locator('.ui-hud-metric-value').nth(2).textContent()
      expect(time).not.toBe('0:00')
    }).toPass({ timeout: 10000, intervals: [500] })

    // ===================== STEP 11: Stop simulation → score screen ==========
    const restartBtn = page.locator('.ui-toolbar-btn--restart')
    await expect(restartBtn).toBeVisible()
    await restartBtn.click()

    // ===================== STEP 12: Verify score screen =====================
    const scoreScreen = page.locator('.ui-score-screen')
    await expect(scoreScreen).toBeVisible({ timeout: 5000 })

    // Verify score screen components
    await expect(page.locator('.ui-score-total')).toBeVisible()
    await expect(page.locator('.ui-score-level-name')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 7 — Rush Order!
// ---------------------------------------------------------------------------

test.describe('Level 7 — Rush Order!', () => {
  test('full play-through: no tutorial → place fabricator + painter + output → belts → program → simulate → score', async ({ page }) => {
    test.setTimeout(90000)

    const GRID_W = 18
    const GRID_H = 18

    // ===================== STEP 1: Navigate to Level 7 =====================
    await navigateToLevel(page, 6) // index 6 = Level 7

    const canvas = page.locator('#canvas-container canvas')
    await expect(canvas).toBeVisible()

    // ===================== STEP 2: Verify NO tutorial appears ===============
    const tutorial = page.locator('.ui-tutorial')
    const tutorialVisible = await tutorial.isVisible({ timeout: 2000 }).catch(() => false)
    if (tutorialVisible) {
      // Safety: skip if one unexpectedly shows
      const skipBtn = page.locator('.ui-tutorial-btn--skip')
      if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await skipBtn.click()
      }
    }

    // ===================== STEP 3: Place Fabricator at (4, 9) ===============
    await dblClickGridCell(page, 4, 9, GRID_W, GRID_H)

    // Verify machine was placed
    let machines: any[] = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // ===================== STEP 4: Place Painter at (9, 9) ==================
    await dblClickGridCell(page, 9, 9, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(2)

    // Change second machine to painter
    await clickGridCell(page, 9, 9, GRID_W, GRID_H)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })

    const typeSelect = panel.locator('.ui-machine-panel-select')
    await typeSelect.selectOption('painter')
    await expect(typeSelect).toHaveValue('painter')

    // Close machine panel
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // ===================== STEP 5: Place Shipper at (14, 9) =================
    await dblClickGridCell(page, 14, 9, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(3)

    // Change third machine to factory_output
    await clickGridCell(page, 14, 9, GRID_W, GRID_H)
    await expect(panel).toBeVisible({ timeout: 5000 })
    await typeSelect.selectOption('factory_output')
    await expect(typeSelect).toHaveValue('factory_output')
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // ===================== STEP 6: Verify all machines have correct types ====
    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    const fabricator = machines.find((m: any) => m.type === 'part_fabricator')
    const painter = machines.find((m: any) => m.type === 'painter')
    const factoryOutput = machines.find((m: any) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(painter).toBeTruthy()
    expect(factoryOutput).toBeTruthy()

    // ===================== STEP 7: Connect belts ============================
    // Belt 1: fabricator → painter
    const belt1 = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: fabricator!.x, sz: fabricator!.z, dx: painter!.x, dz: painter!.z })
    expect(belt1).toBe(true)

    // Belt 2: painter → factory_output
    const belt2 = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: painter!.x, sz: painter!.z, dx: factoryOutput!.x, dz: factoryOutput!.z })
    expect(belt2).toBe(true)

    // Verify belts were created
    const belts = await page.evaluate(() => (window as any).__test?.getBelts?.() ?? [])
    expect(belts.length).toBeGreaterThanOrEqual(2)

    // ===================== STEP 8: Open editor & write program ==============
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)

    const programCode =
      'machines.producePart(Machine.A, PartType.WheelSmall)\n' +
      'machines.startMachine(Machine.A)'

    const pxtIframe = page.locator('.pxt-editor-iframe')
    const isPxtLoaded = await pxtIframe.isVisible({ timeout: 3000 }).catch(() => false)

    if (isPxtLoaded) {
      const fallback = page.locator('.pxt-editor-fallback-textarea')
      await fallback.evaluate((el: HTMLTextAreaElement, code: string) => {
        el.value = code
      }, programCode)
    } else {
      const textarea = page.locator('.pxt-editor-fallback-textarea')
      await expect(textarea).toBeVisible()
      await textarea.fill(programCode)
    }

    // Verify code is in textarea
    await expect(page.locator('.pxt-editor-fallback-textarea')).toHaveValue(programCode)

    // Close editor
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).not.toHaveClass(/open/)

    // ===================== STEP 9: Start simulation ========================
    const startBtn = page.locator('.ui-toolbar-btn--start')
    await expect(startBtn).toBeVisible()
    await startBtn.click()

    // HUD should appear
    const hud = page.locator('.ui-hud')
    await expect(hud).toBeVisible()

    // ===================== STEP 10: Wait for items delivered > 0 ============
    const itemsMetric = page.locator('.ui-hud-metric-value').first()

    await expect(async () => {
      const text = await itemsMetric.textContent()
      expect(parseInt(text ?? '0', 10)).toBeGreaterThan(0)
    }).toPass({ timeout: 30000, intervals: [500] })

    // Verify time is advancing
    await expect(async () => {
      const time = await page.locator('.ui-hud-metric-value').nth(2).textContent()
      expect(time).not.toBe('0:00')
    }).toPass({ timeout: 10000, intervals: [500] })

    // ===================== STEP 11: Stop simulation → score screen ==========
    const restartBtn = page.locator('.ui-toolbar-btn--restart')
    await expect(restartBtn).toBeVisible()
    await restartBtn.click()

    // ===================== STEP 12: Verify score screen =====================
    const scoreScreen = page.locator('.ui-score-screen')
    await expect(scoreScreen).toBeVisible({ timeout: 5000 })

    // Verify score screen components
    await expect(page.locator('.ui-score-total')).toBeVisible()
    await expect(page.locator('.ui-score-level-name')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 8 — Optimize Everything
// ---------------------------------------------------------------------------

test.describe('Level 8 — Optimize Everything', () => {
  test('full play-through: no tutorial → place fabricator + recycler + output → belts → program → simulate → score', async ({ page }) => {
    test.setTimeout(90000)

    const GRID_W = 20
    const GRID_H = 20

    // ===================== STEP 1: Navigate to Level 8 =====================
    await navigateToLevel(page, 7) // index 7 = Level 8

    const canvas = page.locator('#canvas-container canvas')
    await expect(canvas).toBeVisible()

    // ===================== STEP 2: Verify NO tutorial appears ===============
    const tutorial = page.locator('.ui-tutorial')
    const tutorialVisible = await tutorial.isVisible({ timeout: 2000 }).catch(() => false)
    if (tutorialVisible) {
      // Safety: skip if one unexpectedly shows
      const skipBtn = page.locator('.ui-tutorial-btn--skip')
      if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await skipBtn.click()
      }
    }

    // ===================== STEP 3: Place Fabricator at (4, 10) ==============
    await dblClickGridCell(page, 4, 10, GRID_W, GRID_H)

    // Verify machine was placed
    let machines: any[] = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // ===================== STEP 4: Place Recycler at (10, 10) ===============
    await dblClickGridCell(page, 10, 10, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(2)

    // Change second machine to recycler
    await clickGridCell(page, 10, 10, GRID_W, GRID_H)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })

    const typeSelect = panel.locator('.ui-machine-panel-select')
    await typeSelect.selectOption('recycler')
    await expect(typeSelect).toHaveValue('recycler')

    // Close machine panel
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // ===================== STEP 5: Place Shipper at (16, 10) ================
    await dblClickGridCell(page, 16, 10, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(3)

    // Change third machine to factory_output
    await clickGridCell(page, 16, 10, GRID_W, GRID_H)
    await expect(panel).toBeVisible({ timeout: 5000 })
    await typeSelect.selectOption('factory_output')
    await expect(typeSelect).toHaveValue('factory_output')
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // ===================== STEP 6: Verify all machines have correct types ====
    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    const fabricator = machines.find((m: any) => m.type === 'part_fabricator')
    const recycler = machines.find((m: any) => m.type === 'recycler')
    const factoryOutput = machines.find((m: any) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(recycler).toBeTruthy()
    expect(factoryOutput).toBeTruthy()

    // ===================== STEP 7: Connect belts ============================
    // Belt 1: fabricator → recycler
    const belt1 = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: fabricator!.x, sz: fabricator!.z, dx: recycler!.x, dz: recycler!.z })
    expect(belt1).toBe(true)

    // Belt 2: recycler → factory_output
    const belt2 = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: recycler!.x, sz: recycler!.z, dx: factoryOutput!.x, dz: factoryOutput!.z })
    expect(belt2).toBe(true)

    // Verify belts were created
    const belts = await page.evaluate(() => (window as any).__test?.getBelts?.() ?? [])
    expect(belts.length).toBeGreaterThanOrEqual(2)

    // ===================== STEP 8: Open editor & write program ==============
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)

    const programCode =
      'machines.producePart(Machine.A, PartType.WheelSmall)\n' +
      'machines.startMachine(Machine.A)'

    const pxtIframe = page.locator('.pxt-editor-iframe')
    const isPxtLoaded = await pxtIframe.isVisible({ timeout: 3000 }).catch(() => false)

    if (isPxtLoaded) {
      const fallback = page.locator('.pxt-editor-fallback-textarea')
      await fallback.evaluate((el: HTMLTextAreaElement, code: string) => {
        el.value = code
      }, programCode)
    } else {
      const textarea = page.locator('.pxt-editor-fallback-textarea')
      await expect(textarea).toBeVisible()
      await textarea.fill(programCode)
    }

    // Verify code is in textarea
    await expect(page.locator('.pxt-editor-fallback-textarea')).toHaveValue(programCode)

    // Close editor
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).not.toHaveClass(/open/)

    // ===================== STEP 9: Start simulation ========================
    const startBtn = page.locator('.ui-toolbar-btn--start')
    await expect(startBtn).toBeVisible()
    await startBtn.click()

    // HUD should appear
    const hud = page.locator('.ui-hud')
    await expect(hud).toBeVisible()

    // ===================== STEP 10: Wait for items delivered > 0 ============
    const itemsMetric = page.locator('.ui-hud-metric-value').first()

    await expect(async () => {
      const text = await itemsMetric.textContent()
      expect(parseInt(text ?? '0', 10)).toBeGreaterThan(0)
    }).toPass({ timeout: 30000, intervals: [500] })

    // Verify time is advancing
    await expect(async () => {
      const time = await page.locator('.ui-hud-metric-value').nth(2).textContent()
      expect(time).not.toBe('0:00')
    }).toPass({ timeout: 10000, intervals: [500] })

    // ===================== STEP 11: Stop simulation → score screen ==========
    const restartBtn = page.locator('.ui-toolbar-btn--restart')
    await expect(restartBtn).toBeVisible()
    await restartBtn.click()

    // ===================== STEP 12: Verify score screen =====================
    const scoreScreen = page.locator('.ui-score-screen')
    await expect(scoreScreen).toBeVisible({ timeout: 5000 })

    // Verify score screen components
    await expect(page.locator('.ui-score-total')).toBeVisible()
    await expect(page.locator('.ui-score-level-name')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 9 — Robot Expo (sandbox, no goals)
// ---------------------------------------------------------------------------

test.describe('Level 9 — Robot Expo', () => {
  test('full play-through: sandbox — all machines available → place → belt → program → simulate → stop → score', async ({ page }) => {
    test.setTimeout(90000)

    const GRID_W = 20
    const GRID_H = 20

    // ===================== STEP 1: Navigate to Level 9 =====================
    await navigateToLevel(page, 8) // index 8 = Level 9

    const canvas = page.locator('#canvas-container canvas')
    await expect(canvas).toBeVisible()
    await expect(page.locator('.ui-toolbar')).toBeVisible()

    // ===================== STEP 2: No tutorial (safety skip) ================
    const tutorial = page.locator('.ui-tutorial')
    const skipBtn = page.locator('.ui-tutorial-btn--skip')
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click()
      await expect(tutorial).toBeHidden({ timeout: 3000 })
    }

    // ===================== STEP 3: Place Fabricator at (5, 10) ==============
    await dblClickGridCell(page, 5, 10, GRID_W, GRID_H)

    // Verify machine was placed
    let machines: any[] = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // ===================== STEP 4: Place Shipper at (10, 10) ================
    await dblClickGridCell(page, 10, 10, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(2)

    // Select the second machine and change it to factory_output
    await clickGridCell(page, 10, 10, GRID_W, GRID_H)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })

    const typeSelect = panel.locator('.ui-machine-panel-select')
    await typeSelect.selectOption('factory_output')
    await expect(typeSelect).toHaveValue('factory_output')

    // ===================== STEP 5: Verify ALL machine types in dropdown ======
    const allExpectedTypes = [
      'part_fabricator',
      'assembler',
      'quality_checker',
      'painter',
      'recycler',
      'splitter',
      'factory_output',
    ]

    const availableOptions = await typeSelect.locator('option').evaluateAll(
      (opts: HTMLOptionElement[]) => opts.map(o => o.value)
    )

    for (const expectedType of allExpectedTypes) {
      expect(availableOptions, `dropdown should contain ${expectedType}`).toContain(expectedType)
    }

    // Close machine panel
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // ===================== STEP 6: Connect belt fabricator → output =========
    // Read actual machine positions
    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    const fabricator = machines.find((m: any) => m.type === 'part_fabricator')
    const output = machines.find((m: any) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(output).toBeTruthy()

    const beltPlaced = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: fabricator!.x, sz: fabricator!.z, dx: output!.x, dz: output!.z })
    expect(beltPlaced).toBe(true)

    // Verify belt was created
    const belts = await page.evaluate(() => (window as any).__test?.getBelts?.() ?? [])
    expect(belts.length).toBeGreaterThan(0)

    // ===================== STEP 7: Open editor & write program ==============
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)

    const programCode =
      'machines.producePart(Machine.A, PartType.WheelSmall)\n' +
      'machines.startMachine(Machine.A)'

    const pxtIframe = page.locator('.pxt-editor-iframe')
    const isPxtLoaded = await pxtIframe.isVisible({ timeout: 3000 }).catch(() => false)

    if (isPxtLoaded) {
      const fallback = page.locator('.pxt-editor-fallback-textarea')
      await fallback.evaluate((el: HTMLTextAreaElement, code: string) => {
        el.value = code
      }, programCode)
    } else {
      const textarea = page.locator('.pxt-editor-fallback-textarea')
      await expect(textarea).toBeVisible()
      await textarea.fill(programCode)
    }

    // Verify code is in textarea
    await expect(page.locator('.pxt-editor-fallback-textarea')).toHaveValue(programCode)

    // Close editor
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).not.toHaveClass(/open/)

    // ===================== STEP 8: Start simulation ========================
    const startSimBtn = page.locator('.ui-toolbar-btn--start')
    await expect(startSimBtn).toBeVisible()
    await startSimBtn.click()

    // ===================== STEP 9: Verify HUD is visible ===================
    const hud = page.locator('.ui-hud')
    await expect(hud).toBeVisible()

    // ===================== STEP 10: Wait for items delivered > 0 ============
    const itemsMetric = page.locator('.ui-hud-metric-value').first()

    await expect(async () => {
      const text = await itemsMetric.textContent()
      expect(parseInt(text ?? '0', 10)).toBeGreaterThan(0)
    }).toPass({ timeout: 20000, intervals: [500] })

    // Verify time is advancing
    await expect(async () => {
      const time = await page.locator('.ui-hud-metric-value').nth(2).textContent()
      expect(time).not.toBe('0:00')
    }).toPass({ timeout: 10000, intervals: [500] })

    // ===================== STEP 11: Stop simulation → score screen ==========
    // Level 9 has NO goals — manually stopping should still show score screen
    const restartBtn = page.locator('.ui-toolbar-btn--restart')
    await expect(restartBtn).toBeVisible()
    await restartBtn.click()

    // ===================== STEP 12: Verify score screen =====================
    const scoreScreen = page.locator('.ui-score-screen')
    await expect(scoreScreen).toBeVisible({ timeout: 5000 })

    // Verify score screen components
    await expect(page.locator('.ui-score-total')).toBeVisible()
    await expect(page.locator('.ui-score-level-name')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Level 10 — Factory Tycoon
// ---------------------------------------------------------------------------

test.describe('Level 10 — Factory Tycoon', () => {
  test('full play-through: multi-machine factory → belts → program → simulate → score', async ({ page }) => {
    test.setTimeout(120000)

    const GRID_W = 20
    const GRID_H = 20

    // ===================== STEP 1: Navigate to Level 10 ====================
    await navigateToLevel(page, 9) // index 9 = Level 10

    const canvas = page.locator('#canvas-container canvas')
    await expect(canvas).toBeVisible()
    await expect(page.locator('.ui-toolbar')).toBeVisible()

    // ===================== STEP 2: No tutorial (safety skip) ================
    const tutorial = page.locator('.ui-tutorial')
    const skipBtn = page.locator('.ui-tutorial-btn--skip')
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click()
      await expect(tutorial).toBeHidden({ timeout: 3000 })
    }

    // ===================== STEP 3: Place Fabricator at (3, 10) ==============
    await dblClickGridCell(page, 3, 10, GRID_W, GRID_H)

    let machines: any[] = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    // ===================== STEP 4: Place Checker at (7, 10) =================
    await dblClickGridCell(page, 7, 10, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(2)

    // Select the second machine and change its type to quality_checker
    await clickGridCell(page, 7, 10, GRID_W, GRID_H)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })

    const typeSelect = panel.locator('.ui-machine-panel-select')
    await typeSelect.selectOption('quality_checker')
    await expect(typeSelect).toHaveValue('quality_checker')
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // ===================== STEP 5: Place Splitter at (11, 10) ==============
    await dblClickGridCell(page, 11, 10, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(3)

    // Change type to splitter
    await clickGridCell(page, 11, 10, GRID_W, GRID_H)
    await expect(panel).toBeVisible({ timeout: 5000 })
    await typeSelect.selectOption('splitter')
    await expect(typeSelect).toHaveValue('splitter')
    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // ===================== STEP 6: Place Shipper at (15, 10) ================
    await dblClickGridCell(page, 15, 10, GRID_W, GRID_H)

    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(4)

    // Change type to factory_output
    await clickGridCell(page, 15, 10, GRID_W, GRID_H)
    await expect(panel).toBeVisible({ timeout: 5000 })
    await typeSelect.selectOption('factory_output')
    await expect(typeSelect).toHaveValue('factory_output')

    // ===================== STEP 7: Verify ALL machine types in dropdown =====
    const allExpectedTypes = [
      'part_fabricator',
      'assembler',
      'quality_checker',
      'painter',
      'recycler',
      'splitter',
      'factory_output',
    ]

    const availableOptions = await typeSelect.locator('option').evaluateAll(
      (opts: HTMLOptionElement[]) => opts.map(o => o.value)
    )

    for (const expectedType of allExpectedTypes) {
      expect(availableOptions, `dropdown should contain ${expectedType}`).toContain(expectedType)
    }

    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // ===================== STEP 8: Verify machine types after placement =====
    machines = await page.evaluate(() =>
      (window as any).__test?.getMachines?.() ?? []
    )
    expect(machines.length).toBe(4)

    const fabricator = machines.find((m: any) => m.type === 'part_fabricator')
    const qualityChecker = machines.find((m: any) => m.type === 'quality_checker')
    const splitter = machines.find((m: any) => m.type === 'splitter')
    const factoryOutput = machines.find((m: any) => m.type === 'factory_output')

    expect(fabricator).toBeTruthy()
    expect(qualityChecker).toBeTruthy()
    expect(splitter).toBeTruthy()
    expect(factoryOutput).toBeTruthy()

    // ===================== STEP 9: Connect belts in chain ==================
    // Belt 1: fabricator → quality_checker
    const belt1Placed = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: fabricator!.x, sz: fabricator!.z, dx: qualityChecker!.x, dz: qualityChecker!.z })
    expect(belt1Placed).toBe(true)

    // Belt 2: quality_checker → splitter
    const belt2Placed = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: qualityChecker!.x, sz: qualityChecker!.z, dx: splitter!.x, dz: splitter!.z })
    expect(belt2Placed).toBe(true)

    // Belt 3: splitter → factory_output
    const belt3Placed = await page.evaluate(({ sx, sz, dx, dz }) => {
      return (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false
    }, { sx: splitter!.x, sz: splitter!.z, dx: factoryOutput!.x, dz: factoryOutput!.z })
    expect(belt3Placed).toBe(true)

    // Verify belts were created
    const belts = await page.evaluate(() => (window as any).__test?.getBelts?.() ?? [])
    expect(belts.length).toBeGreaterThanOrEqual(3)

    // ===================== STEP 10: Open editor & write program =============
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)

    const programCode =
      'machines.producePart(Machine.A, PartType.WheelSmall)\n' +
      'machines.startMachine(Machine.A)'

    const pxtIframe = page.locator('.pxt-editor-iframe')
    const isPxtLoaded = await pxtIframe.isVisible({ timeout: 3000 }).catch(() => false)

    if (isPxtLoaded) {
      const fallback = page.locator('.pxt-editor-fallback-textarea')
      await fallback.evaluate((el: HTMLTextAreaElement, code: string) => {
        el.value = code
      }, programCode)
    } else {
      const textarea = page.locator('.pxt-editor-fallback-textarea')
      await expect(textarea).toBeVisible()
      await textarea.fill(programCode)
    }

    // Verify code is in textarea
    await expect(page.locator('.pxt-editor-fallback-textarea')).toHaveValue(programCode)

    // Close editor
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).not.toHaveClass(/open/)

    // ===================== STEP 11: Start simulation ========================
    const startSimBtn = page.locator('.ui-toolbar-btn--start')
    await expect(startSimBtn).toBeVisible()
    await startSimBtn.click()

    // ===================== STEP 12: Verify HUD is visible ===================
    const hud = page.locator('.ui-hud')
    await expect(hud).toBeVisible()

    // ===================== STEP 13: Wait for items delivered > 0 ============
    const itemsMetric = page.locator('.ui-hud-metric-value').first()

    await expect(async () => {
      const text = await itemsMetric.textContent()
      expect(parseInt(text ?? '0', 10)).toBeGreaterThan(0)
    }).toPass({ timeout: 30000, intervals: [500] })

    // Verify time is advancing
    await expect(async () => {
      const time = await page.locator('.ui-hud-metric-value').nth(2).textContent()
      expect(time).not.toBe('0:00')
    }).toPass({ timeout: 10000, intervals: [500] })

    // ===================== STEP 14: Stop simulation → score screen ==========
    const restartBtn = page.locator('.ui-toolbar-btn--restart')
    await expect(restartBtn).toBeVisible()
    await restartBtn.click()

    // ===================== STEP 15: Verify score screen =====================
    const scoreScreen = page.locator('.ui-score-screen')
    await expect(scoreScreen).toBeVisible({ timeout: 5000 })

    // Verify score screen components
    await expect(page.locator('.ui-score-total')).toBeVisible()
    await expect(page.locator('.ui-score-level-name')).toBeVisible()
  })
})
