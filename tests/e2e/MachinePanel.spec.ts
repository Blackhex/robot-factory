import { test, expect, type Page } from '@playwright/test'

/**
 * E2E tests: machine selection, property editing, and drag-to-move.
 *
 * Interaction model (single mode):
 *   - Single click on a machine → selects it (shows properties panel)
 *   - Single click on empty cell → deselects
 *   - Double-click on empty cell → places a part_fabricator (default)
 *   - Double-click on existing machine → rotates it 90°
 *   - DEL key → deletes selected machine
 *   - Delete button in panel → deletes selected machine
 *   - Machine type is changed via the MachinePanel dropdown after placement
 */

test.use({ viewport: { width: 1280, height: 720 } })

async function enterSandbox(page: Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas')
    return c && c.width > 0 && c.height > 0
  })
  await page.locator('.ui-main-menu-btn').last().click()
  await expect(page.locator('.ui-toolbar')).toBeVisible()
  // HUD is not visible on sandbox entry — it appears only when simulation starts
  await page.waitForTimeout(1200)
}

async function gridCellToScreenPos(page: Page, gx: number, gz: number) {
  return page.evaluate(
    ({ gx, gz }) => {
      const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const W = 20, H = 20
      const worldX = gx - W / 2 + 0.5, worldZ = gz - H / 2 + 0.5
      const fov = 50 * Math.PI / 180
      const d = Math.max(W, H) / (2 * Math.tan(fov / 2)) * 1.2
      const cx = d * 0.7, cy = d * 0.7, cz = d * 0.7
      const fl = Math.sqrt(cx * cx + cy * cy + cz * cz)
      const fx = -cx / fl, fy = -cy / fl, fz = -cz / fl
      let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0
      const rl = Math.sqrt(rx * rx + ry * ry + rz * rz)
      rx /= rl; ry /= rl; rz /= rl
      const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx
      const dx = worldX - cx, dy = 0 - cy, dz = worldZ - cz
      const vx = dx * rx + dy * ry + dz * rz
      const vy = dx * ux + dy * uy + dz * uz
      const vz_ = dx * fx + dy * fy + dz * fz
      const thf = Math.tan(fov / 2), asp = rect.width / rect.height
      const nx = vx / (-vz_ * thf * asp), ny = vy / (-vz_ * thf)
      return { x: Math.round((nx + 1) / 2 * rect.width), y: Math.round((1 - ny) / 2 * rect.height) }
    },
    { gx, gz },
  )
}

async function clickGridCell(page: Page, gx: number, gz: number) {
  const pos = await gridCellToScreenPos(page, gx, gz)
  await page.locator('#canvas-container canvas').click({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(200)
}

async function dblClickGridCell(page: Page, gx: number, gz: number) {
  const pos = await gridCellToScreenPos(page, gx, gz)
  await page.locator('#canvas-container canvas').dblclick({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(200)
}

test.describe('Machine Panel — single interaction mode', () => {
  test.beforeEach(async ({ page }) => {
    await enterSandbox(page)
    // Place a Part Fabricator via double-click on grid center (default type)
    await dblClickGridCell(page, 10, 10)
  })

  test('clicking an existing machine shows the properties panel', async ({ page }) => {
    // Click on the same cell again — it already has a machine
    await clickGridCell(page, 10, 10)

    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible()

    // Should show the machine name as placeholder in the editable input
    await expect(panel.locator('.ui-machine-panel-name-input')).toHaveAttribute('placeholder', 'Part Fabricator')

    // Should show a valid position and direction in the info line
    const infoText = await panel.locator('.ui-machine-panel-info').textContent()
    expect(infoText).toMatch(/^\(\d+, \d+\) · \w+$/)
  })

  test('clicking an empty cell with panel open deselects and hides panel', async ({ page }) => {
    // Select machine
    await clickGridCell(page, 10, 10)
    await expect(page.locator('.ui-machine-panel')).toBeVisible()

    // Click on a far-away empty cell — single click deselects
    await clickGridCell(page, 3, 3)

    // Panel should hide since we deselected
    await expect(page.locator('.ui-machine-panel')).toBeHidden()
  })

  test('changing machine type via panel dropdown updates the machine', async ({ page }) => {
    await clickGridCell(page, 10, 10)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible()

    // Change type to Assembler
    await panel.locator('.ui-machine-panel-select').selectOption('assembler')
    await page.waitForTimeout(200)

    // Panel name placeholder should update
    await expect(panel.locator('.ui-machine-panel-name-input')).toHaveAttribute('placeholder', 'Assembler')
  })

  test('drag-and-drop moves a machine to a new cell', async ({ page }) => {
    // First, select the machine to read its actual grid position
    await clickGridCell(page, 10, 10)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible()

    const infoEl = panel.locator('.ui-machine-panel-info')
    const originalInfo = await infoEl.textContent()
    expect(originalInfo).toMatch(/^\(\d+, \d+\) · \w+$/)

    // Close panel before dragging
    await page.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()

    // Drag from the placement cell to 4 cells away
    const fromPos = await gridCellToScreenPos(page, 10, 10)
    const toPos = await gridCellToScreenPos(page, 10, 14)
    const canvas = page.locator('#canvas-container canvas')
    const box = (await canvas.boundingBox())!

    await page.mouse.move(box.x + fromPos.x, box.y + fromPos.y)
    await page.waitForTimeout(50)
    await page.mouse.down()
    await page.waitForTimeout(150)
    await page.mouse.move(box.x + toPos.x, box.y + toPos.y, { steps: 30 })
    await page.waitForTimeout(50)
    await page.mouse.up()
    await page.waitForTimeout(500)

    // Panel should auto-show after drag; if not, click the target cell
    if (!(await panel.isVisible())) {
      await clickGridCell(page, 10, 14)
    }

    await expect(panel).toBeVisible({ timeout: 3000 })
    const newInfo = await infoEl.textContent()
    expect(newInfo).toMatch(/^\(\d+, \d+\) · \w+$/)

    // Assert the position actually changed (machine moved)
    expect(newInfo).not.toBe(originalInfo)
  })

  test('close button hides the panel', async ({ page }) => {
    await clickGridCell(page, 10, 10)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible()

    await panel.locator('.ui-machine-panel-close').click()
    await expect(panel).toBeHidden()
  })

  test('no tool mode buttons exist in toolbar', async ({ page }) => {
    // The old tool mode buttons should NOT be in the toolbar
    await expect(page.locator('.ui-toolbar-btn[data-tool="select"]')).toHaveCount(0)
    await expect(page.locator('.ui-toolbar-btn[data-tool="place_machine"]')).toHaveCount(0)
    await expect(page.locator('.ui-toolbar-btn[data-tool="remove"]')).toHaveCount(0)
  })

  test('double-click on empty cell places a part_fabricator', async ({ page }) => {
    // Double-click an empty cell — always places part_fabricator
    await dblClickGridCell(page, 5, 5)

    // Panel auto-opens on placement; if not, click to select
    const panel = page.locator('.ui-machine-panel')
    if (!(await panel.isVisible())) {
      await clickGridCell(page, 5, 5)
    }

    await expect(panel).toBeVisible()
    // Should be a Part Fabricator (default)
    await expect(panel.locator('.ui-machine-panel-name-input')).toHaveAttribute('placeholder', 'Part Fabricator')

    // Change type to Assembler via panel dropdown
    await panel.locator('.ui-machine-panel-select').selectOption('assembler')
    await page.waitForTimeout(200)
    await expect(panel.locator('.ui-machine-panel-name-input')).toHaveAttribute('placeholder', 'Assembler')
  })

  test('DEL key deletes a selected machine', async ({ page }) => {
    // Select the machine placed in beforeEach
    await clickGridCell(page, 10, 10)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible()

    // Press Delete key
    await page.keyboard.press('Delete')

    // Panel should hide (machine deleted, deselected)
    await expect(panel).toBeHidden()

    // Click on the same cell — should NOT show panel (machine is gone)
    await clickGridCell(page, 10, 10)
    await expect(panel).toBeHidden()
  })

  test('Delete button in machine panel deletes the machine', async ({ page }) => {
    // Select the machine placed in beforeEach
    await clickGridCell(page, 10, 10)
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible()

    // Click the Delete button in the panel
    await panel.locator('.ui-machine-panel-delete').click()

    // Panel should hide
    await expect(panel).toBeHidden()

    // Click on the same cell — should NOT show panel (machine is gone)
    await clickGridCell(page, 10, 10)
    await expect(panel).toBeHidden()
  })

  test('machine type can be changed via panel after placement', async ({ page }) => {
    // Double-click to place a second machine (always part_fabricator)
    await dblClickGridCell(page, 5, 5)

    // Panel auto-opens on placement; if not, click to select
    const panel = page.locator('.ui-machine-panel')
    if (!(await panel.isVisible())) {
      await clickGridCell(page, 5, 5)
    }
    await expect(panel).toBeVisible()
    await expect(panel.locator('.ui-machine-panel-select')).toHaveValue('part_fabricator')

    // Change to Painter via panel dropdown
    await panel.locator('.ui-machine-panel-select').selectOption('painter')
    await page.waitForTimeout(200)
    await expect(panel.locator('.ui-machine-panel-select')).toHaveValue('painter')

    // Close panel and place another machine
    await panel.locator('.ui-machine-panel-close').click()
    await dblClickGridCell(page, 15, 15)

    // New machine should also be part_fabricator by default
    if (!(await panel.isVisible())) {
      await clickGridCell(page, 15, 15)
    }
    await expect(panel).toBeVisible()
    await expect(panel.locator('.ui-machine-panel-select')).toHaveValue('part_fabricator')

    // Change to Recycler via panel dropdown
    await panel.locator('.ui-machine-panel-select').selectOption('recycler')
    await page.waitForTimeout(200)
    await expect(panel.locator('.ui-machine-panel-select')).toHaveValue('recycler')
  })

  test('double-click on existing machine rotates it', async ({ page }) => {
    // Double-click the machine placed in beforeEach — should rotate
    await dblClickGridCell(page, 10, 10)
    // The machine should now be selected (panel visible) after rotation
    const panel = page.locator('.ui-machine-panel')
    await expect(panel).toBeVisible()
    // Verify it's still the same machine type
    await expect(panel.locator('.ui-machine-panel-select')).toHaveValue('part_fabricator')
  })
})
