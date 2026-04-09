import { test, expect, type Page } from '@playwright/test'

/**
 * E2E tests: belt selection, deselection, mutual exclusion, and deletion.
 *
 * Interaction model:
 *   - Click on a belt segment → selects the chain, shows belt panel
 *   - Click on empty cell → deselects belt, hides belt panel
 *   - Selecting a machine hides the belt panel; selecting a belt hides the machine panel
 *   - Double-click on a belt → no action (no machine placed, no rotation)
 *   - DEL key with belt selected → removes the belt chain
 *   - Delete button in belt panel → removes the belt chain
 */

test.use({ viewport: { width: 1280, height: 720 } })

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
  await page.locator('.ui-main-menu-btn').last().click()
  await expect(page.locator('.ui-toolbar')).toBeVisible()
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

/**
 * Click on a machine at a given grid position by projecting its world position
 * through the actual Three.js camera. This ensures accurate 3D raycasting.
 */
async function clickOnMachineAt(page: Page, gx: number, gz: number) {
  const pos = await page.evaluate(({ gx, gz }) => {
    const sm = (window as any).__sceneManager
    const camera = sm.getCamera()
    const gm = (window as any).__gameManager
    const factory = gm.factory
    // Machine world position: center of grid cell
    const worldX = gx - factory.width / 2 + 0.5
    const worldZ = gz - factory.height / 2 + 0.5

    // Use THREE.Vector3 from the scene manager's module
    // We can access it through the camera's type prototype
    const vec = camera.position.clone()
    vec.set(worldX, 0.45, worldZ) // machine center height

    vec.project(camera)

    const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.round((vec.x + 1) / 2 * rect.width),
      y: Math.round((1 - vec.y) / 2 * rect.height),
    }
  }, { gx, gz })

  await page.locator('#canvas-container canvas').click({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(200)
}
async function clickOnBelt(page: Page) {
  const pos = await page.evaluate(() => {
    const getRenderer = (window as any).__getFactoryRenderer
    const renderer = getRenderer?.()
    if (!renderer) throw new Error('No factory renderer')

    const beltMeshes: Map<string, any> = (renderer as any).beltMeshes
    if (!beltMeshes || beltMeshes.size === 0) throw new Error('No belt meshes')

    // Pick a middle belt segment for best hit probability
    const entries = Array.from(beltMeshes.values())
    const midIdx = Math.floor(entries.length / 2)
    const targetMesh = entries[midIdx]

    // Get world position of belt mesh
    const worldPos = targetMesh.position.clone()

    // Project through the camera
    const sm = (window as any).__sceneManager
    const camera = sm.getCamera()
    worldPos.project(camera)

    const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.round((worldPos.x + 1) / 2 * rect.width),
      y: Math.round((1 - worldPos.y) / 2 * rect.height),
    }
  })

  await page.locator('#canvas-container canvas').click({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(300)
}

/**
 * Double-click directly on a belt's 3D mesh position.
 */
async function dblClickOnBelt(page: Page) {
  const pos = await page.evaluate(() => {
    const getRenderer = (window as any).__getFactoryRenderer
    const renderer = getRenderer?.()
    if (!renderer) throw new Error('No factory renderer')

    const beltMeshes: Map<string, any> = (renderer as any).beltMeshes
    if (!beltMeshes || beltMeshes.size === 0) throw new Error('No belt meshes')

    const entries = Array.from(beltMeshes.values())
    const midIdx = Math.floor(entries.length / 2)
    const targetMesh = entries[midIdx]
    const worldPos = targetMesh.position.clone()

    const sm = (window as any).__sceneManager
    const camera = sm.getCamera()
    worldPos.project(camera)

    const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.round((worldPos.x + 1) / 2 * rect.width),
      y: Math.round((1 - worldPos.y) / 2 * rect.height),
    }
  })

  await page.locator('#canvas-container canvas').dblclick({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(300)
}

/**
 * Place two machines and connect them with a belt chain via the game API.
 * Returns the actual machine grid positions.
 */
async function placeMachinesAndBelt(page: Page) {
  // Place two machines via double-click
  await dblClickGridCell(page, 8, 10)
  await page.waitForTimeout(100)
  await clickGridCell(page, 1, 1) // deselect
  await page.waitForTimeout(100)

  await dblClickGridCell(page, 12, 10)
  await page.waitForTimeout(100)
  await clickGridCell(page, 1, 1) // deselect
  await page.waitForTimeout(100)

  // Use the game API with actual machine positions
  const result = await page.evaluate(() => {
    const gm = (window as any).__gameManager
    if (!gm?.factory) return null
    const f = gm.factory
    const machines = f.getMachines()
    if (machines.length < 2) return null
    const [mA, mB] = machines
    const placed = f.placeBeltChain(mA, mB, 'output')
    const belts = f.getBelts()
    return {
      placed,
      beltCount: belts.length,
      machineA: { x: mA.x, z: mA.z },
      machineB: { x: mB.x, z: mB.z },
    }
  })

  if (!result || !result.placed || result.beltCount === 0) {
    throw new Error(`Belt placement failed: ${JSON.stringify(result)}`)
  }

  // Force renderer update so belt meshes are created
  await page.evaluate(() => {
    const getRenderer = (window as any).__getFactoryRenderer
    if (typeof getRenderer === 'function') {
      const renderer = getRenderer()
      if (renderer) renderer.update()
    }
  })
  await page.waitForTimeout(500)

  return {
    machineA: result.machineA,
    machineB: result.machineB,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Belt Selection — selection, deselection, deletion', () => {
  test.beforeEach(async ({ page }) => {
    await enterSandbox(page)
  })

  test('clicking on a belt segment selects it and shows belt panel', async ({ page }) => {
    await placeMachinesAndBelt(page)

    // Verify belt panel is initially hidden
    const beltPanel = page.locator('.ui-belt-panel')
    await expect(beltPanel).toBeHidden()

    // Click directly on the belt mesh
    await clickOnBelt(page)

    // Belt panel should now be visible
    await expect(beltPanel).toBeVisible({ timeout: 3000 })
  })

  test('clicking on empty cell deselects belt and hides belt panel', async ({ page }) => {
    await placeMachinesAndBelt(page)

    // Select belt
    await clickOnBelt(page)
    const beltPanel = page.locator('.ui-belt-panel')
    await expect(beltPanel).toBeVisible({ timeout: 3000 })

    // Click on a far-away empty cell to deselect
    await clickGridCell(page, 2, 2)

    // Belt panel should now be hidden
    await expect(beltPanel).toBeHidden()
  })

  test('selecting a machine hides the belt panel', async ({ page }) => {
    const { machineA } = await placeMachinesAndBelt(page)

    // Select belt first
    await clickOnBelt(page)
    const beltPanel = page.locator('.ui-belt-panel')
    await expect(beltPanel).toBeVisible({ timeout: 3000 })

    // Click on machine A to select it
    await clickOnMachineAt(page, machineA.x, machineA.z)

    // Belt panel should be hidden; machine panel should be visible
    await expect(beltPanel).toBeHidden()
    await expect(page.locator('.ui-machine-panel')).toBeVisible()
  })

  test('selecting a belt hides the machine panel', async ({ page }) => {
    const { machineA } = await placeMachinesAndBelt(page)

    // Select machine A first
    await clickOnMachineAt(page, machineA.x, machineA.z)
    const machinePanel = page.locator('.ui-machine-panel')
    await expect(machinePanel).toBeVisible()

    // Now click on belt to select it
    await clickOnBelt(page)

    // Machine panel should be hidden; belt panel should be visible
    await expect(machinePanel).toBeHidden()
    await expect(page.locator('.ui-belt-panel')).toBeVisible({ timeout: 3000 })
  })

  test('double-clicking on a belt does NOT place a machine or rotate', async ({ page }) => {
    await placeMachinesAndBelt(page)

    // Count machines before double-click
    const machineCountBefore = await page.evaluate(() => {
      const gm = (window as any).__gameManager
      return gm?.factory?.getMachines().length ?? 0
    })

    // Double-click on the belt
    await dblClickOnBelt(page)

    // Machine count should be unchanged (no machine placed)
    const machineCountAfter = await page.evaluate(() => {
      const gm = (window as any).__gameManager
      return gm?.factory?.getMachines().length ?? 0
    })

    expect(machineCountAfter).toBe(machineCountBefore)

    // Machine panel should NOT be visible (no machine was selected/placed)
    await expect(page.locator('.ui-machine-panel')).toBeHidden()
  })

  test('DEL key when belt is selected removes the belt', async ({ page }) => {
    await placeMachinesAndBelt(page)

    // Count belts before deletion
    const beltCountBefore = await page.evaluate(() => {
      const gm = (window as any).__gameManager
      return gm?.factory?.getBelts().length ?? 0
    })
    expect(beltCountBefore).toBeGreaterThan(0)

    // Select the belt
    await clickOnBelt(page)
    const beltPanel = page.locator('.ui-belt-panel')
    await expect(beltPanel).toBeVisible({ timeout: 3000 })

    // Press Delete key
    await page.keyboard.press('Delete')

    // Belt panel should be hidden
    await expect(beltPanel).toBeHidden()

    // Verify belts were actually removed
    const beltCountAfter = await page.evaluate(() => {
      const gm = (window as any).__gameManager
      return gm?.factory?.getBelts().length ?? 0
    })
    expect(beltCountAfter).toBeLessThan(beltCountBefore)
  })

  test('belt panel delete button removes the belt', async ({ page }) => {
    await placeMachinesAndBelt(page)

    // Count belts before deletion
    const beltCountBefore = await page.evaluate(() => {
      const gm = (window as any).__gameManager
      return gm?.factory?.getBelts().length ?? 0
    })
    expect(beltCountBefore).toBeGreaterThan(0)

    // Select the belt
    await clickOnBelt(page)
    const beltPanel = page.locator('.ui-belt-panel')
    await expect(beltPanel).toBeVisible({ timeout: 3000 })

    // Click the Delete button in the belt panel
    await beltPanel.locator('.ui-belt-panel-delete').click()

    // Belt panel should be hidden
    await expect(beltPanel).toBeHidden()

    // Verify belts were actually removed
    const beltCountAfter = await page.evaluate(() => {
      const gm = (window as any).__gameManager
      return gm?.factory?.getBelts().length ?? 0
    })
    expect(beltCountAfter).toBeLessThan(beltCountBefore)
  })
})
