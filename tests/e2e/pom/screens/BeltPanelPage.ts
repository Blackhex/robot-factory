import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * The properties panel that appears when a belt segment is selected.
 */
export class BeltPanelPage {
  private readonly page: Page
  private readonly panel: Locator
  private readonly deleteBtn: Locator

  constructor(page: Page) {
    this.page = page
    this.panel = page.locator('.ui-belt-panel')
    this.deleteBtn = this.panel.locator('.ui-belt-panel-delete')
  }

  async expectVisible(timeout = 3000): Promise<void> {
    await expect(this.panel).toBeVisible({ timeout })
  }

  async expectHidden(): Promise<void> {
    await expect(this.panel).toBeHidden()
  }

  async clickDelete(): Promise<void> {
    await this.deleteBtn.click()
  }

  /** Press the global Delete key (deletes the currently selected belt). */
  async pressDelete(): Promise<void> {
    await this.page.keyboard.press('Delete')
  }
}
