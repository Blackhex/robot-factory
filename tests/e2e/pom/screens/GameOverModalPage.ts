import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Page Object for the game-over modal overlay.
 */
export class GameOverModalPage {
  private readonly root: Locator
  private readonly title: Locator
  private readonly message: Locator
  private readonly restartBtn: Locator

  constructor(page: Page) {
    this.root = page.locator('.ui-game-over-modal')
    this.title = page.locator('.ui-game-over-title')
    this.message = page.locator('.ui-game-over-message')
    this.restartBtn = page.locator('.ui-game-over-btn')
  }

  async expectVisible(timeoutMs = 30_000): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: timeoutMs })
  }

  async expectHidden(timeoutMs = 5_000): Promise<void> {
    await expect(this.root).toBeHidden({ timeout: timeoutMs })
  }

  async expectTitleText(text: string): Promise<void> {
    await expect(this.title).toHaveText(text)
  }

  async expectMessageText(text: string): Promise<void> {
    await expect(this.message).toHaveText(text)
  }

  async expectMessageTextMatching(pattern: RegExp): Promise<void> {
    await expect(this.message).toHaveText(pattern)
  }

  async expectRestartButtonVisible(): Promise<void> {
    await expect(this.restartBtn).toBeVisible()
  }

  async clickRestart(): Promise<void> {
    await this.restartBtn.click()
  }
}
