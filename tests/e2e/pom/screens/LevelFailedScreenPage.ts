import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Page Object for the "Level Failed" screen.
 *
 * Shown in CAMPAIGN levels when the player ends a run without meeting the
 * objective (e.g. presses Restart with 0 outputs, or fewer outputs than
 * required). Replaces the regular Score screen for the failure path.
 *
 * NOTE: This screen does not exist in production yet — the selectors below
 * describe the EXPECTED contract for the new UI (UX requirement B1).
 */
export class LevelFailedScreenPage {
  private readonly root: Locator
  private readonly title: Locator
  private readonly retryBtn: Locator
  private readonly backBtn: Locator

  constructor(page: Page) {
    this.root = page.locator('.ui-level-failed-screen')
    this.title = page.locator('.ui-level-failed-title')
    // Semantic button queries — English locale.
    this.retryBtn = page.getByRole('button', { name: /retry|try again/i })
    this.backBtn = page.getByRole('button', { name: /back to level select|back to levels/i })
  }

  async expectVisible(timeoutMs = 10_000): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: timeoutMs })
  }

  async expectHidden(timeoutMs = 5_000): Promise<void> {
    await expect(this.root).toBeHidden({ timeout: timeoutMs })
  }

  async expectTitleVisible(): Promise<void> {
    await expect(this.title).toBeVisible()
  }

  async expectRetryButtonVisible(): Promise<void> {
    await expect(this.retryBtn).toBeVisible()
  }

  async expectBackToLevelSelectButtonVisible(): Promise<void> {
    await expect(this.backBtn).toBeVisible()
  }

  async clickRetry(): Promise<void> {
    await expect(this.retryBtn).toBeVisible()
    await this.retryBtn.click()
  }

  async clickBackToLevelSelect(): Promise<void> {
    await expect(this.backBtn).toBeVisible()
    await this.backBtn.click()
  }
}
