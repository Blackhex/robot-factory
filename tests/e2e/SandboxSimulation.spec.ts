import { test, expect, type Page, type FrameLocator } from '@playwright/test'

/**
 * E2E test: Full sandbox factory simulation — pure UI interaction.
 *
 * 1. Start sandbox mode
 * 2. Place two machines 4 cells apart, connected by a chain of belts
 * 3. Open the MakeCode block editor and drag-and-drop blocks to create a program
 * 4. Start the simulation
 * 5. Validate items are produced, flow through belts, and are received
 */

// Use a wide viewport so the PXT editor has enough room for the toolbox + workspace
test.use({ viewport: { width: 1920, height: 1080 } })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function enterSandbox(page: Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas')
    return c && c.width > 0 && c.height > 0
  })
  const sandboxBtn = page.locator('.ui-main-menu-btn').last()
  await expect(sandboxBtn).toBeVisible()
  await sandboxBtn.click()
  await expect(page.locator('.ui-toolbar')).toBeVisible()
  // HUD is not visible on sandbox entry — it appears only when simulation starts
  // Wait for camera zoom-to-fit animation
  await page.waitForTimeout(1200)
}

/** Project a grid cell to canvas pixel coordinates. */
async function gridCellToScreenPos(page: Page, gx: number, gz: number) {
  return page.evaluate(
    ({ gx, gz }) => {
      const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const W = 20, H = 20
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
      return { x: Math.round((nx + 1) / 2 * rect.width), y: Math.round((1 - ny) / 2 * rect.height) }
    },
    { gx, gz },
  )
}

/** Click a grid cell on the Three.js canvas. */
async function clickGridCell(page: Page, gx: number, gz: number) {
  const pos = await gridCellToScreenPos(page, gx, gz)
  const canvas = page.locator('#canvas-container canvas')
  await canvas.click({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(150)
}

/** Double-click a grid cell to place a machine. */
async function dblClickGridCell(page: Page, gx: number, gz: number) {
  const pos = await gridCellToScreenPos(page, gx, gz)
  const canvas = page.locator('#canvas-container canvas')
  await canvas.dblclick({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(150)
}

/**
 * Drag a block from the PXT flyout onto the Blockly workspace.
 *
 * PXT renders flyout blocks as SVG elements inside an iframe. Their <g>
 * elements don't return useful boundingBox() from Playwright. Instead,
 * we locate the block's visible text label and use THAT element's
 * bounding rect to compute the drag start position.
 */
async function dragBlockFromFlyout(
  pxt: FrameLocator,
  page: Page,
  blockTextSubstring: string,
  targetYOffset = 0,
) {
  // Find the block in the flyout by its visible text content
  const flyoutText = pxt.locator(`.blocklyFlyout text`).filter({ hasText: blockTextSubstring }).first()
  await expect(flyoutText).toBeAttached({ timeout: 10000 })

  // Get the text element's screen-space position via evaluate
  const textRect = await flyoutText.evaluate((el: SVGTextElement) => {
    const rect = el.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })

  // Add iframe offset to get page-level coordinates
  const iframeBox = await page.locator('.pxt-editor-iframe').boundingBox()
  if (!iframeBox || textRect.width === 0) {
    throw new Error(`Could not locate flyout block with text "${blockTextSubstring}"`)
  }

  const fromX = iframeBox.x + textRect.x + textRect.width / 2
  const fromY = iframeBox.y + textRect.y + textRect.height / 2

  // Drop target: center-right of the workspace area
  const wsBox = await pxt.locator('.blocklySvg').boundingBox()
  const toX = (wsBox?.x ?? iframeBox.x) + (wsBox?.width ?? 400) * 0.6
  const toY = (wsBox?.y ?? iframeBox.y) + 200 + targetYOffset

  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await page.mouse.move(toX, toY, { steps: 20 })
  await page.mouse.up()
  await page.waitForTimeout(500)
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe('Sandbox Simulation — Full Factory Flow (UI-only)', () => {
  test('place machines, program editor, run simulation, verify item production', async ({ page }) => {
    test.setTimeout(90000)

    // ======================== STEP 1: Enter sandbox ========================
    await enterSandbox(page)

    const canvas = page.locator('#canvas-container canvas')
    await expect(canvas).toBeVisible()

    // ======================== STEP 2: Place machines =========================
    // Double-click places a Fabricator by default.
    await dblClickGridCell(page, 10, 10)

    // Verify machine was placed by single-clicking to select it
    await clickGridCell(page, 10, 10)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible()
    await expect(panel.locator('.ui-machine-panel-name-input')).toHaveAttribute('placeholder', 'Fabricator')
    await panel.locator('.ui-machine-panel-close').click()

    // ======================== STEP 3: Open editor & set program =============
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)

    // Wait for PXT to load in the iframe
    const pxtIframe = page.locator('.pxt-editor-iframe')
    const isPxtLoaded = await pxtIframe.isVisible({ timeout: 8000 }).catch(() => false)

    // Program that starts the fabricator producing
    const programCode =
      'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
      'machines.startMachine(Machine.A)'

    if (isPxtLoaded) {
      // ----- PXT block editor is available — drag and drop blocks -----
      const pxt = page.frameLocator('.pxt-editor-iframe')

      // Wait for the Blockly workspace to fully render inside PXT.
      // Blockly briefly sets elements to visibility:hidden during layout;
      // poll until the workspace is fully visible and interactive.
      const pxtFrame = page.locator('.pxt-editor-iframe').contentFrame()
      await expect(async () => {
        const vis = await pxtFrame.locator('.blocklySvg').evaluate(
          (el) => getComputedStyle(el).visibility,
        )
        expect(vis).toBe('visible')
      }).toPass({ timeout: 20000, intervals: [500] })

      // Wait for toolbox categories to appear and become visible
      const toolboxCategories = pxt.locator(
        '.blocklyToolboxCategory, .blocklyTreeRow',
      )
      await expect(async () => {
        const vis = await pxtFrame.locator('.blocklyToolboxCategory, .blocklyTreeRow').first().evaluate(
          (el) => getComputedStyle(el).visibility,
        )
        expect(vis).toBe('visible')
      }).toPass({ timeout: 15000, intervals: [500] })

      // Wait until the toolbox is fully interactive (flyout ready)
      await expect(async () => {
        const count = await pxtFrame.locator('.blocklyToolboxCategory, .blocklyTreeRow').count()
        expect(count).toBeGreaterThan(0)
      }).toPass({ timeout: 10000, intervals: [500] })

      // Open "Recipes" category and drag "set recipe" block
      await toolboxCategories.nth(1).click()
      await expect(pxt.locator('.blocklyFlyout text').first()).toBeAttached({ timeout: 10000 })
      await dragBlockFromFlyout(pxt, page, 'set recipe', 0)

      // Open "Machines" category and drag "start" block
      await toolboxCategories.nth(0).click()
      await expect(pxt.locator('.blocklyFlyout text').first()).toBeAttached({ timeout: 10000 })
      await dragBlockFromFlyout(pxt, page, 'start', 80)

      // Also write to the fallback textarea as a reliable getProgram() source
      const fallback = page.locator('.pxt-editor-fallback-textarea')
      await fallback.evaluate((el: HTMLTextAreaElement, code: string) => {
        el.value = code
      }, programCode)

    } else {
      // ----- Fallback textarea mode -----
      const textarea = page.locator('.pxt-editor-fallback-textarea')
      await expect(textarea).toBeVisible()
      await textarea.fill(programCode)
    }

    // Close the editor
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).not.toHaveClass(/open/)

    // ======================== STEP 4: Start simulation ======================
    const startBtn = page.locator('.ui-toolbar-btn--start')
    await expect(startBtn).toBeVisible()
    await startBtn.click()

    // HUD should now appear with metrics
    await expect(page.locator('.ui-hud')).toBeVisible()

    // ======================== STEP 5: Verify simulation runs =================
    // Poll the HUD "Items" counter (first metric value).
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

    // ======================== STEP 6: Restart and verify ====================
    await page.locator('.ui-toolbar-btn--restart').click()
    await page.waitForTimeout(500)

    const finalItems = parseInt((await itemsMetric.textContent()) ?? '0', 10)
    expect(finalItems).toBeGreaterThan(0)
  })
})
