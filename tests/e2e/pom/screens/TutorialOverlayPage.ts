import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * The optional tutorial overlay that appears at the start of certain levels.
 */
export class TutorialOverlayPage {
  private readonly root: Locator
  private readonly tooltip: Locator
  private readonly counter: Locator
  private readonly nextBtn: Locator
  private readonly skipBtn: Locator

  constructor(_page: Page) {
    this.root = _page.locator('.ui-tutorial')
    this.tooltip = _page.locator('.ui-tutorial-tooltip')
    this.counter = _page.locator('.ui-tutorial-counter')
    this.nextBtn = _page.locator('.ui-tutorial-btn--next')
    this.skipBtn = _page.locator('.ui-tutorial-btn--skip')
  }

  async expectVisible(timeout = 5000): Promise<void> {
    await expect(this.root).toBeVisible({ timeout })
  }

  async expectHidden(timeout = 3000): Promise<void> {
    await expect(this.root).toBeHidden({ timeout })
  }

  async expectTooltipVisible(): Promise<void> {
    await expect(this.tooltip).toBeVisible()
  }

  async expectCounter(text: string): Promise<void> {
    await expect(this.counter).toContainText(text)
  }

  async clickNext(): Promise<void> {
    await this.nextBtn.click()
  }

  async expectNextButtonVisible(): Promise<void> {
    await expect(this.nextBtn).toBeVisible()
  }

  async isVisibleNow(timeout = 0): Promise<boolean> {
    if (timeout === 0) return this.root.isVisible().catch(() => false)
    return this.root.isVisible({ timeout }).catch(() => false)
  }

  async isSkipVisibleNow(timeout: number): Promise<boolean> {
    return this.skipBtn.isVisible({ timeout }).catch(() => false)
  }

  async clickSkip(): Promise<void> {
    await this.skipBtn.click()
  }

  /** Skip the tutorial if the skip button is visible within `timeout` ms. */
  async dismissIfPresent(timeout = 1000): Promise<void> {
    if (await this.isSkipVisibleNow(timeout)) {
      await this.skipBtn.click()
    }
  }
}
