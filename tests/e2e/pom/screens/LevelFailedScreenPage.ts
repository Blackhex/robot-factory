import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * "Level Failed" screen shown after a failed campaign run.
 *
 * NOTE: The `'level_failed'` GameManager state and its UI trigger are
 * currently unreachable through any in-game path (see LevelFailed.spec.ts).
 * This page object exists so specs can still assert the screen never appears
 * (e.g. the sandbox regression) and to keep the failure-flow spec compiling.
 */
export class LevelFailedScreenPage {
  private readonly root: Locator
  private readonly title: Locator
  private readonly retryButton: Locator
  private readonly backToLevelSelectButton: Locator

  constructor(_page: Page) {
    this.root = _page.locator('.ui-level-failed')
    this.title = _page.locator('.ui-level-failed-title')
    this.retryButton = _page.locator('.ui-level-failed-retry')
    this.backToLevelSelectButton = _page.locator('.ui-level-failed-back')
  }

  async expectVisible(timeout = 5000): Promise<void> {
    await expect(this.root).toBeVisible({ timeout })
  }

  async expectHidden(timeout = 5000): Promise<void> {
    await expect(this.root).toBeHidden({ timeout })
  }

  async expectTitleVisible(): Promise<void> {
    await expect(this.title).toBeVisible()
  }

  async expectRetryButtonVisible(): Promise<void> {
    await expect(this.retryButton).toBeVisible()
  }

  async expectBackToLevelSelectButtonVisible(): Promise<void> {
    await expect(this.backToLevelSelectButton).toBeVisible()
  }

  async clickBackToLevelSelect(): Promise<void> {
    await this.backToLevelSelectButton.click()
  }
}
