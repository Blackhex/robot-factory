import { test, expect } from '@playwright/test'

test.describe('Navigation — Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for canvas to be rendered by Three.js
    await page.waitForSelector('canvas')
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas')
      return canvas && canvas.width > 0 && canvas.height > 0
    })
  })

  test('app loads without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Re-navigate to capture errors from load
    await page.goto('/')
    await page.waitForSelector('canvas')

    expect(errors).toEqual([])
  })

  test('main menu is visible with title "Robot Factory"', async ({ page }) => {
    const menu = page.locator('.ui-main-menu')
    await expect(menu).toBeVisible()

    const title = page.locator('.ui-main-menu-title')
    await expect(title).toHaveText('Robot Factory')
  })

  test('"Start Game" button is visible and clickable', async ({ page }) => {
    const startBtn = page.locator('.ui-main-menu-btn--primary')
    await expect(startBtn).toBeVisible()
    await expect(startBtn).toHaveText('Start Game')
    await expect(startBtn).toBeEnabled()
  })

  test('clicking "Start Game" hides menu and shows level select', async ({ page }) => {
    const startBtn = page.locator('.ui-main-menu-btn--primary')
    await startBtn.click()

    // Main menu should disappear
    await expect(page.locator('.ui-main-menu')).toBeHidden()

    // Level select should appear
    await expect(page.locator('.ui-level-select')).toBeVisible()
  })

  test('selecting a level shows toolbar and HUD', async ({ page }) => {
    // MainMenu → LevelSelect
    await page.locator('.ui-main-menu-btn--primary').click()
    await expect(page.locator('.ui-level-select')).toBeVisible()

    // Click first unlocked level
    await page.locator('.ui-level-card:not(.ui-level-card--locked)').first().click()

    // Level select should disappear
    await expect(page.locator('.ui-level-select')).toBeHidden()

    // Toolbar should appear; HUD is NOT visible in build phase (only when sim runs)
    await expect(page.locator('.ui-toolbar')).toBeVisible()
    await expect(page.locator('.ui-hud')).toBeHidden()
  })

  test('canvas container has a canvas element', async ({ page }) => {
    const canvas = page.locator('#canvas-container canvas')
    await expect(canvas).toBeAttached()
    // Canvas should have non-zero dimensions (Three.js rendered)
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })

  test('language toggle changes toolbar text to Czech', async ({ page }) => {
    // Navigate: MainMenu → LevelSelect → Build phase
    await page.locator('.ui-main-menu-btn--primary').click()
    await expect(page.locator('.ui-level-select')).toBeVisible()
    await page.locator('.ui-level-card:not(.ui-level-card--locked)').first().click()
    await expect(page.locator('.ui-toolbar')).toBeVisible()

    // Dismiss tutorial overlay if present
    const skipBtn = page.locator('.ui-tutorial-btn--skip')
    if (await skipBtn.isVisible()) await skipBtn.click()

    // Verify initial English labels — editor button
    const editorBtn = page.locator('.ui-toolbar-btn--editor')
    await expect(editorBtn).toHaveText('Open Editor')

    // Click the language toggle (shows "CS" when in English)
    const langBtn = page.locator('.ui-lang-btn')
    await expect(langBtn).toHaveText('CS')
    await langBtn.click()

    // After switching, labels should be in Czech
    await expect(editorBtn).toHaveText('Otevřít editor')
    // Language button now shows "EN"
    await expect(langBtn).toHaveText('EN')
  })

  test('"E" key opens and closes the editor panel', async ({ page }) => {
    // Navigate: MainMenu → LevelSelect → Build phase
    await page.locator('.ui-main-menu-btn--primary').click()
    await expect(page.locator('.ui-level-select')).toBeVisible()
    await page.locator('.ui-level-card:not(.ui-level-card--locked)').first().click()
    await expect(page.locator('.ui-toolbar')).toBeVisible()

    // Dismiss tutorial overlay if present
    const skipBtn = page.locator('.ui-tutorial-btn--skip')
    if (await skipBtn.isVisible()) await skipBtn.click()

    const editor = page.locator('#editor-container')

    // Editor should be hidden initially
    await expect(editor).not.toHaveClass(/open/)

    // Press E to open
    await page.keyboard.press('e')
    await expect(editor).toHaveClass(/open/)

    // Press E again to close
    await page.keyboard.press('e')
    await expect(editor).not.toHaveClass(/open/)
  })

  test('toolbar dropdown is removed — no .ui-toolbar-select exists', async ({ page }) => {
    // Navigate: MainMenu → LevelSelect → Build phase
    await page.locator('.ui-main-menu-btn--primary').click()
    await expect(page.locator('.ui-level-select')).toBeVisible()
    await page.locator('.ui-level-card:not(.ui-level-card--locked)').first().click()
    await expect(page.locator('.ui-toolbar')).toBeVisible()

    // Dismiss tutorial overlay if present
    const skipBtn = page.locator('.ui-tutorial-btn--skip')
    if (await skipBtn.isVisible()) await skipBtn.click()

    // The old machine type dropdown should NOT exist
    await expect(page.locator('.ui-toolbar-select')).toHaveCount(0)
  })
})
