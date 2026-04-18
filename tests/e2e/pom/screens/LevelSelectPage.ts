import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Level select screen.
 */
export class LevelSelectPage {
  private readonly root: Locator
  private readonly unlockedCards: Locator

  constructor(page: Page) {
    this.root = page.locator('.ui-level-select')
    this.unlockedCards = page.locator('.ui-level-card:not(.ui-level-card--locked)')
  }

  async expectVisible(): Promise<void> {
    await expect(this.root).toBeVisible()
  }

  async expectHidden(): Promise<void> {
    await expect(this.root).toBeHidden()
  }

  async clickFirstUnlocked(): Promise<void> {
    await this.unlockedCards.first().click()
  }

  /** Click the unlocked card at the given 0-based index, after asserting it's visible. */
  async clickUnlocked(index: number): Promise<void> {
    await expect(this.unlockedCards.nth(index)).toBeVisible()
    await this.unlockedCards.nth(index).click()
  }
}
