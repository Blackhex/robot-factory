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

async function openEditorAndWaitForPxt(page: import('@playwright/test').Page) {
  await page.locator('.ui-toolbar-btn--editor').click()
  await expect(page.locator('#editor-container')).toHaveClass(/open/)
  const iframe = page.locator('#editor-container .pxt-editor-iframe')
  await expect(iframe).toBeVisible({ timeout: 15000 })
}

test.describe('PXT Editor — Toolbox Category Order', () => {
  test('toolbox shows expected top-level categories in order and no "Advanced"', async ({ page }) => {
    await enterBuildPhase(page)
    await openEditorAndWaitForPxt(page)

    const pxtFrame = page.frameLocator('#editor-container .pxt-editor-iframe')

    // Wait for the toolbox tree to populate.
    const treeRoot = pxtFrame.locator('.blocklyToolboxDiv .blocklyTreeRoot')
    await expect(treeRoot).toBeAttached({ timeout: 15000 })
    const labels = pxtFrame.locator('.blocklyToolboxDiv .blocklyTreeRoot [role="treeitem"] .blocklyTreeLabel')
    await expect(labels.first()).toBeVisible({ timeout: 15000 })

    // Poll until the list stabilizes (PXT renders categories progressively).
    let order: string[] = []
    await expect
      .poll(
        async () => {
          order = (await labels.allTextContents()).map((s) => s.trim()).filter((s) => s.length > 0)
          return order.length
        },
        { timeout: 10000 },
      )
      .toBeGreaterThanOrEqual(7)

    expect(order).toEqual(['Machines', 'Belts', 'Loops', 'Logic', 'Events', 'Variables', 'Functions'])
    expect(order).not.toContain('Advanced')
  })
})
