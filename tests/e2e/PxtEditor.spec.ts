import { test, expect } from '@playwright/test'

/**
 * Helper: navigate from main menu through level select into build phase.
 * Dismisses the tutorial overlay.
 */
async function enterBuildPhase(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.locator('.ui-main-menu-btn--primary').click()
  await expect(page.locator('.ui-level-select')).toBeVisible()
  await page.locator('.ui-level-card:not(.ui-level-card--locked)').first().click()
  await expect(page.locator('.ui-toolbar')).toBeVisible()
  const skipBtn = page.locator('.ui-tutorial-btn--skip')
  if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipBtn.click()
  }
}

/**
 * Helper: open the editor panel and wait for PXT MakeCode to load.
 */
async function openEditorAndWaitForPxt(page: import('@playwright/test').Page) {
  await page.locator('.ui-toolbar-btn--editor').click()
  await expect(page.locator('#editor-container')).toHaveClass(/open/)
  // Wait for PXT iframe to become visible (PxtEditor hides fallback and shows iframe on workspacesync)
  const iframe = page.locator('#editor-container .pxt-editor-iframe')
  await expect(iframe).toBeVisible({ timeout: 15000 })
}

test.describe('PXT Editor — MakeCode Block Editor', () => {
  test.beforeEach(async ({ page }) => {
    await enterBuildPhase(page)
  })

  // --- Editor Panel Visibility ---

  test('"Open Editor" button is visible in toolbar', async ({ page }) => {
    const editorBtn = page.locator('.ui-toolbar-btn--editor')
    await expect(editorBtn).toBeVisible()
    await expect(editorBtn).toHaveText('Open Editor')
  })

  test('clicking "Open Editor" opens the editor panel', async ({ page }) => {
    const editorContainer = page.locator('#editor-container')
    await expect(editorContainer).not.toHaveClass(/open/)
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(editorContainer).toHaveClass(/open/)
  })

  test('clicking "Open Editor" again closes the editor panel', async ({ page }) => {
    const editorBtn = page.locator('.ui-toolbar-btn--editor')
    const editorContainer = page.locator('#editor-container')
    await editorBtn.click()
    await expect(editorContainer).toHaveClass(/open/)
    await editorBtn.click()
    await expect(editorContainer).not.toHaveClass(/open/)
  })

  test('"E" key toggles the editor', async ({ page }) => {
    const editorContainer = page.locator('#editor-container')
    await expect(editorContainer).not.toHaveClass(/open/)
    await page.keyboard.press('e')
    await expect(editorContainer).toHaveClass(/open/)
    await page.keyboard.press('e')
    await expect(editorContainer).not.toHaveClass(/open/)
  })

  // --- MakeCode PXT Editor loads in iframe ---

  test('PXT MakeCode editor loads in the iframe', async ({ page }) => {
    await openEditorAndWaitForPxt(page)

    // The PXT iframe should be visible and the fallback should be hidden
    const iframe = page.locator('#editor-container .pxt-editor-iframe')
    await expect(iframe).toBeVisible()

    const fallback = page.locator('#editor-container .pxt-editor-fallback')
    await expect(fallback).toBeHidden()
  })

  test('PXT editor iframe has non-zero dimensions', async ({ page }) => {
    await openEditorAndWaitForPxt(page)

    const iframe = page.locator('#editor-container .pxt-editor-iframe')
    const box = await iframe.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(100)
    expect(box!.height).toBeGreaterThan(100)
  })

  test('editor panel is approximately 40% of viewport width', async ({ page }) => {
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)

    const viewport = page.viewportSize()!
    const editorBox = await page.locator('#editor-container').boundingBox()
    expect(editorBox).not.toBeNull()

    const expectedWidth = viewport.width * 0.4
    expect(editorBox!.width).toBeGreaterThan(expectedWidth * 0.85)
    expect(editorBox!.width).toBeLessThan(expectedWidth * 1.15)
  })

  test('PXT editor contains Blockly workspace inside iframe', async ({ page }) => {
    await openEditorAndWaitForPxt(page)

    // Access the PXT iframe content
    const pxtFrame = page.frameLocator('#editor-container .pxt-editor-iframe')

    // MakeCode renders a Blockly SVG workspace
    const blocklySvg = pxtFrame.locator('.blocklySvg')
    await expect(blocklySvg).toBeAttached({ timeout: 10000 })
  })

  test('PXT editor shows block categories in toolbox', async ({ page }) => {
    await openEditorAndWaitForPxt(page)

    const pxtFrame = page.frameLocator('#editor-container .pxt-editor-iframe')

    // Look for toolbox category elements
    const toolbox = pxtFrame.locator('.blocklyToolboxDiv, .blocklyToolbox')
    await expect(toolbox.first()).toBeAttached({ timeout: 10000 })
  })

  // --- Language Toggle ---

  test('language toggle updates editor button text to Czech', async ({ page }) => {
    await expect(page.locator('.ui-toolbar-btn--editor')).toHaveText('Open Editor')
    await page.locator('.ui-lang-btn').click()
    await expect(page.locator('.ui-toolbar-btn--editor')).toHaveText('Otevřít editor')
  })

  // --- PXT iframe exists ---

  test('PXT iframe element is present in editor container', async ({ page }) => {
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(page.locator('#editor-container')).toHaveClass(/open/)
    const iframe = page.locator('#editor-container .pxt-editor-iframe')
    await expect(iframe).toBeAttached()
  })
})
