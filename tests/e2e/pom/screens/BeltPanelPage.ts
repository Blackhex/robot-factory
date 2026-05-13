import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

import { pressEnterAndSnapshot } from '../_helpers/inputEnterSnapshot'

/**
 * The properties panel that appears when a belt segment is selected.
 */
export class BeltPanelPage {
  private readonly page: Page
  private readonly panel: Locator
  private readonly deleteBtn: Locator
  private readonly nameInput: Locator
  private readonly closeBtn: Locator

  constructor(page: Page) {
    this.page = page
    this.panel = page.locator('.ui-belt-panel')
    this.deleteBtn = this.panel.locator('.ui-belt-panel-delete')
    this.nameInput = this.panel.locator('.ui-belt-panel-name-input')
    this.closeBtn = this.panel.locator('.ui-belt-panel-close')
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

  async clickClose(): Promise<void> {
    await this.closeBtn.click()
  }

  async setName(name: string): Promise<void> {
    await this.nameInput.fill(name)
    await expect(this.nameInput).toHaveValue(name)
  }

  async expectNameValue(name: string): Promise<void> {
    await expect(this.nameInput).toHaveValue(name)
  }

  /** Press the global Delete key (deletes the currently selected belt). */
  async pressDelete(): Promise<void> {
    await this.page.keyboard.press('Delete')
  }

  /** Delegates to {@link pressEnterAndSnapshot} on the belt name input. */
  async pressEnterInNameInput(): Promise<{
    wasFocused: boolean
    isStillFocused: boolean
    valueAfter: string
  }> {
    return pressEnterAndSnapshot(this.nameInput)
  }
}
