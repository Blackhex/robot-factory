import { test, expect, type Page } from '@playwright/test'

/**
 * E2E test: Sandbox Restart should clear in-flight items and reset machines,
 * but preserve the placed factory layout.
 *
 * RED test for `Simulation.clearInFlight()` — fails because items remain on
 * belts after clicking the toolbar Restart button.
 */

test.use({ viewport: { width: 1920, height: 1080 } })

const GRID_W = 20
const GRID_H = 20

// ---------------------------------------------------------------------------
// Helpers (mirrored from SandboxSimulation.spec.ts / LevelFlow.spec.ts)
// ---------------------------------------------------------------------------

async function gridCellToScreenPos(page: Page, gx: number, gz: number) {
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
    { gx, gz, W: GRID_W, H: GRID_H },
  )
}

async function dblClickGridCell(page: Page, gx: number, gz: number) {
  const pos = await gridCellToScreenPos(page, gx, gz)
  const canvas = page.locator('#canvas-container canvas')
  await canvas.dblclick({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(150)
}

async function clickGridCell(page: Page, gx: number, gz: number) {
  const pos = await gridCellToScreenPos(page, gx, gz)
  const canvas = page.locator('#canvas-container canvas')
  await canvas.click({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(150)
}

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
  // Wait for the camera zoom-to-fit animation
  await page.waitForTimeout(1200)
}

/** Snapshot of layout + simulation state, derived from the live game objects. */
type SimSnapshot = {
  running: boolean
  machineCount: number
  beltCount: number
  itemsOnBelts: number
  beltItemCounts: number[]
  machineStates: Array<{
    id: string
    state: string
    inputSlots: number
    outputSlot: boolean
    consumedItems: number
  }>
}

async function readSimSnapshot(page: Page): Promise<SimSnapshot> {
  return await page.evaluate(() => {
    const gm = (window as any).__gameManager
    const factory = gm?.factory
    const sim = gm?.simulation
    if (!factory || !sim) {
      return {
        running: false,
        machineCount: 0,
        beltCount: 0,
        itemsOnBelts: 0,
        beltItemCounts: [],
        machineStates: [],
      }
    }
    const beltMap = sim.getBelts() as Map<string, any>
    const beltItemCounts: number[] = []
    beltMap.forEach((b: any) => beltItemCounts.push(b.getItems().length))
    const itemsOnBelts = beltItemCounts.reduce((a: number, b: number) => a + b, 0)
    const machineMap = sim.getMachines() as Map<string, any>
    const machineStates: any[] = []
    machineMap.forEach((m: any) => {
      machineStates.push({
        id: m.id,
        state: m.state,
        inputSlots: m.inputSlots.length,
        outputSlot: m.outputSlot != null,
        consumedItems: m.consumedItems,
      })
    })
    return {
      running: !!sim.running,
      machineCount: machineMap.size,
      beltCount: beltMap.size,
      itemsOnBelts,
      beltItemCounts,
      machineStates,
    }
  })
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

/**
 * Build the same minimal sandbox factory the main test uses:
 * fabricator @ (10,10) → belt → factory_output @ (13,10),
 * with a program that runs WheelPressSmall on Machine.A.
 *
 * Returns once items are confirmed to be in flight on the belts.
 */
async function buildAndRunSandboxFactory(page: Page) {
  await enterSandbox(page)
  const canvas = page.locator('#canvas-container canvas')
  await expect(canvas).toBeVisible()

  await dblClickGridCell(page, 10, 10)
  await dblClickGridCell(page, 13, 10)

  await clickGridCell(page, 13, 10)
  const machinePanel = page.locator('.ui-machine-panel')
  await expect(machinePanel).toBeVisible({ timeout: 5000 })
  const typeSelect = machinePanel.locator('.ui-machine-panel-select')
  await typeSelect.selectOption('factory_output')
  await expect(typeSelect).toHaveValue('factory_output')
  await machinePanel.locator('.ui-machine-panel-close').click()
  await expect(machinePanel).toBeHidden()

  const machines = await page.evaluate(
    () => (window as any).__test?.getMachines?.() ?? [],
  )
  const fabricator = machines.find((m: any) => m.type === 'part_fabricator')
  const output = machines.find((m: any) => m.type === 'factory_output')
  expect(fabricator).toBeTruthy()
  expect(output).toBeTruthy()

  const beltPlaced = await page.evaluate(
    ({ sx, sz, dx, dz }) =>
      (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false,
    { sx: fabricator.x, sz: fabricator.z, dx: output.x, dz: output.z },
  )
  expect(beltPlaced).toBe(true)

  await page.locator('.ui-toolbar-btn--editor').click()
  await expect(page.locator('#editor-container')).toHaveClass(/open/)
  const programCode =
    'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
    'machines.startMachine(Machine.A)'
  const fallback = page.locator('.pxt-editor-fallback-textarea')
  await expect(fallback).toBeAttached({ timeout: 8000 })
  await fallback.evaluate((el: HTMLTextAreaElement, code: string) => {
    el.value = code
  }, programCode)
  await page.locator('.ui-toolbar-btn--editor').click()
  await expect(page.locator('#editor-container')).not.toHaveClass(/open/)

  await page.locator('.ui-toolbar-btn--start').click()
  await expect(async () => {
    const snap = await readSimSnapshot(page)
    expect(snap.itemsOnBelts).toBeGreaterThan(0)
  }).toPass({ timeout: 30000, intervals: [250] })
}

/**
 * Read item-instance counts directly from the rendered Three.js scene.
 *
 * Items are rendered by `ItemRenderer` as `THREE.InstancedMesh` objects with a
 * `SphereGeometry(0.1, ...)`. Per-instance positions live in `instanceMatrix`,
 * with item Y baked in as 0.15. `RobotPreview` is the only other consumer of
 * `SphereGeometry(0.1, ...)` but it does NOT use `InstancedMesh`, so filtering
 * on `isInstancedMesh && SphereGeometry@0.1` uniquely identifies item meshes.
 */
async function readSceneItemMeshes(page: Page): Promise<{
  totalCount: number
  meshes: Array<{ count: number; instancesAtItemY: number }>
}> {
  return await page.evaluate(() => {
    const sm = (window as any).__sceneManager
    const scene = sm?.getScene?.()
    if (!scene) return { totalCount: -1, meshes: [] }
    const meshes: Array<{ count: number; instancesAtItemY: number }> = []
    let totalCount = 0
    scene.traverse((obj: any) => {
      if (!obj.isInstancedMesh) return
      const geom = obj.geometry
      const params = geom?.parameters
      const isItemGeometry =
        geom?.type === 'SphereGeometry' &&
        params &&
        Math.abs(params.radius - 0.1) < 1e-6
      if (!isItemGeometry) return
      const count: number = obj.count
      // Inspect actual baked Y in the instance matrices (column-major; Y is element 13).
      const arr: Float32Array | undefined = obj.instanceMatrix?.array
      let instancesAtItemY = 0
      if (arr) {
        for (let i = 0; i < count; i++) {
          if (Math.abs(arr[i * 16 + 13] - 0.15) < 1e-3) instancesAtItemY++
        }
      } else {
        instancesAtItemY = count
      }
      meshes.push({ count, instancesAtItemY })
      totalCount += count
    })
    return { totalCount, meshes }
  })
}

test.describe('Sandbox — Restart clears in-flight items and resets machines', () => {
  test('Restart wipes belts + machine slots while preserving layout', async ({ page }) => {
    test.setTimeout(90000)

    // ======================== STEP 1: Enter sandbox ========================
    await enterSandbox(page)

    const canvas = page.locator('#canvas-container canvas')
    await expect(canvas).toBeVisible()

    // ======================== STEP 2: Place two machines ====================
    // Source fabricator at (10,10); destination at (13,10) so a belt of length 3 fits.
    await dblClickGridCell(page, 10, 10)
    await dblClickGridCell(page, 13, 10)

    // Change the destination to factory_output so produced parts have a sink.
    await clickGridCell(page, 13, 10)
    const machinePanel = page.locator('.ui-machine-panel')
    await expect(machinePanel).toBeVisible({ timeout: 5000 })
    const typeSelect = machinePanel.locator('.ui-machine-panel-select')
    await typeSelect.selectOption('factory_output')
    await expect(typeSelect).toHaveValue('factory_output')
    await machinePanel.locator('.ui-machine-panel-close').click()
    await expect(machinePanel).toBeHidden()

    // ======================== STEP 3: Connect with belt =====================
    const machines = await page.evaluate(
      () => (window as any).__test?.getMachines?.() ?? [],
    )
    const fabricator = machines.find((m: any) => m.type === 'part_fabricator')
    const output = machines.find((m: any) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(output).toBeTruthy()

    const beltPlaced = await page.evaluate(
      ({ sx, sz, dx, dz }) =>
        (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false,
      { sx: fabricator.x, sz: fabricator.z, dx: output.x, dz: output.z },
    )
    expect(beltPlaced).toBe(true)

    // ======================== STEP 4: Write program =========================
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)

    const programCode =
      'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
      'machines.startMachine(Machine.A)'

    const fallback = page.locator('.pxt-editor-fallback-textarea')
    await expect(fallback).toBeAttached({ timeout: 8000 })
    await fallback.evaluate((el: HTMLTextAreaElement, code: string) => {
      el.value = code
    }, programCode)

    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).not.toHaveClass(/open/)

    // ======================== STEP 5: Start simulation ======================
    const startBtn = page.locator('.ui-toolbar-btn--start')
    await expect(startBtn).toBeVisible()
    await startBtn.click()

    // Capture the layout we expect to be preserved across Restart.
    const layoutBefore = await readSimSnapshot(page)
    expect(layoutBefore.machineCount).toBe(2)
    expect(layoutBefore.beltCount).toBeGreaterThan(0)

    // ======================== STEP 6: Wait until belts have items ===========
    // Pre-condition for the restart assertion: items must actually be in flight.
    await expect(async () => {
      const snap = await readSimSnapshot(page)
      expect(snap.itemsOnBelts).toBeGreaterThan(0)
    }).toPass({ timeout: 30000, intervals: [250] })

    const beforeRestart = await readSimSnapshot(page)
    expect(beforeRestart.itemsOnBelts).toBeGreaterThan(0)
    expect(beforeRestart.running).toBe(true)

    // ======================== STEP 7: Click Restart =========================
    await page.locator('.ui-toolbar-btn--restart').click()
    // Allow the click handler + any pending animation frame to settle.
    await page.waitForTimeout(300)

    const afterRestart = await readSimSnapshot(page)

    // (9) simulation no longer running
    expect(afterRestart.running).toBe(false)

    // (8) layout preserved
    expect(afterRestart.machineCount).toBe(beforeRestart.machineCount)
    expect(afterRestart.beltCount).toBe(beforeRestart.beltCount)

    // (6) all belts empty — THIS is the failing assertion today
    expect(afterRestart.itemsOnBelts).toBe(0)
    for (const count of afterRestart.beltItemCounts) {
      expect(count).toBe(0)
    }

    // (7) every machine reset
    for (const m of afterRestart.machineStates) {
      expect(m.state).toBe('idle')
      expect(m.inputSlots).toBe(0)
      expect(m.outputSlot).toBe(false)
      expect(m.consumedItems).toBe(0)
    }

    // ======================== STEP 8: Layout still works ====================
    // Click Start again — items should be produced once more, proving the
    // factory layout is still intact and reusable after Restart.
    await startBtn.click()
    await expect(async () => {
      const snap = await readSimSnapshot(page)
      expect(snap.itemsOnBelts).toBeGreaterThan(0)
    }).toPass({ timeout: 30000, intervals: [250] })
  })

  test('Restart should clear all item meshes from the rendered scene', async ({ page }) => {
    test.setTimeout(90000)

    await buildAndRunSandboxFactory(page)

    // Sanity: items must be rendered before Restart, otherwise the post-Restart
    // assertion would be vacuous.
    await expect(async () => {
      const before = await readSceneItemMeshes(page)
      expect(before.totalCount).toBeGreaterThan(0)
    }).toPass({ timeout: 10000, intervals: [200] })

    const before = await readSceneItemMeshes(page)
    expect(before.totalCount).toBeGreaterThan(0)

    // Click Restart and let the next animation frame run so the renderer has
    // had every chance to react to the cleared simulation state.
    await page.locator('.ui-toolbar-btn--restart').click()
    await page.waitForTimeout(500)
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => r())),
    )

    // Pre-condition: the simulation model itself was cleared. If this fails,
    // the new ghost-mesh assertion below would be testing the wrong thing.
    const sim = await readSimSnapshot(page)
    expect(sim.itemsOnBelts).toBe(0)

    // The actual assertion: NO item-instance must remain in the rendered scene.
    const after = await readSceneItemMeshes(page)
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
