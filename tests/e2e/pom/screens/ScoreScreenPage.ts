import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Score screen shown after the simulation ends.
 */
export class ScoreScreenPage {
  private readonly root: Locator
  private readonly total: Locator
  private readonly levelName: Locator

  constructor(_page: Page) {
    this.root = _page.locator('.ui-score-screen')
    this.total = _page.locator('.ui-score-total')
    this.levelName = _page.locator('.ui-score-level-name')
  }

  async expectVisible(timeout = 5000): Promise<void> {
    await expect(this.root).toBeVisible({ timeout })
  }

  async expectTotalVisible(): Promise<void> {
    await expect(this.total).toBeVisible()
  }

  async expectLevelNameVisible(): Promise<void> {
    await expect(this.levelName).toBeVisible()
  }
}
