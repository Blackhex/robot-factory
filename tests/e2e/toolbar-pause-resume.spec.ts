import { test, expect, type Page } from '@playwright/test'

/**
 * E2E test: Toolbar Pause button toggles to "Resume" while pausing the
 * simulation, and back to "Pause" on second click while resuming.
 *
 * This test is written FIRST (RED step). It is expected to fail until
 * Toolbar.ts and main.ts implement the toggle behavior and the
 * `actions.resume` translation key is added.
 */

test.use({ viewport: { width: 1600, height: 900 } })

async function enterSandbox(page: Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas')
    return !!c && c.width > 0 && c.height > 0
  })
  // Sandbox is the last button in the main menu (mirrors SandboxSimulation.spec.ts)
  const sandboxBtn = page.locator('.ui-main-menu-btn').last()
  await expect(sandboxBtn).toBeVisible()
  await sandboxBtn.click()
  await expect(page.locator('.ui-toolbar')).toBeVisible()
  await page.waitForTimeout(800)
}

function isPaused(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const gm = (window as any).__gameManager
    return !!gm?.simulation?.paused
  })
}

function isRunning(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const gm = (window as any).__gameManager
    return !!gm?.simulation?.running
  })
}

test('Pause button toggles to Resume and pauses the simulation, then back', async ({ page }) => {
  await enterSandbox(page)

  // Start the simulation from the toolbar
  const startBtn = page.locator('.ui-toolbar-btn--start')
  await expect(startBtn).toBeVisible()
  await startBtn.click()

  // Wait for simulation to actually be running
  await expect.poll(() => isRunning(page), { timeout: 5000 }).toBe(true)

  const pauseBtn = page.locator('.ui-toolbar-btn--pause')
  await expect(pauseBtn).toBeVisible()
  await expect(pauseBtn).toHaveText('Pause')
  expect(await isPaused(page)).toBe(false)

  // Click pause -> should toggle label to "Resume" and pause the simulation
  await pauseBtn.click()

  await expect(pauseBtn).toHaveText('Resume')
  await expect.poll(() => isPaused(page), { timeout: 2000 }).toBe(true)

  // Click again -> should toggle back to "Pause" and resume the simulation
  await pauseBtn.click()

  await expect(pauseBtn).toHaveText('Pause')
  await expect.poll(() => isPaused(page), { timeout: 2000 }).toBe(false)
  expect(await isRunning(page)).toBe(true)
})

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await page.screenshot({
      path: `tests/e2e/screenshots/${testInfo.title.replace(/\s+/g, '-')}.png`,
      fullPage: true,
    })
  }
})
