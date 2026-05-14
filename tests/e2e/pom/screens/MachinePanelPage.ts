import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

import { pressEnterAndSnapshot } from '../_helpers/inputEnterSnapshot'
import { expectPanelStaysOnTopAtCenter } from '../_helpers/panelStacking'

/**
 * The properties panel that appears when a machine is selected.
 */
export class MachinePanelPage {
  private readonly panel: Locator
  private readonly typeSelect: Locator
  private readonly nameInput: Locator
  private readonly info: Locator
  private readonly closeBtn: Locator
  private readonly deleteBtn: Locator
  private readonly typeOptions: Locator

  private readonly page: Page
  constructor(page: Page) {
    this.page = page
    this.panel = page.locator('.ui-machine-panel')
    this.typeSelect = this.panel.locator('.ui-machine-panel-select')
    this.nameInput = this.panel.locator('.ui-machine-panel-name-input')
    this.info = this.panel.locator('.ui-machine-panel-info')
    this.closeBtn = this.panel.locator('.ui-machine-panel-close')
    this.deleteBtn = this.panel.locator('.ui-machine-panel-delete')
    this.typeOptions = this.typeSelect.locator('option')
  }

  async expectVisible(timeout = 5000): Promise<void> {
    await expect(this.panel).toBeVisible({ timeout })
  }

  async expectHidden(): Promise<void> {
    await expect(this.panel).toBeHidden()
  }

  async isVisibleNow(): Promise<boolean> {
    return this.panel.isVisible()
  }

  async selectType(type: string): Promise<void> {
    await this.typeSelect.selectOption(type)
    await this.page.waitForTimeout(200)
  }

  async expectTypeValue(type: string): Promise<void> {
    await expect(this.typeSelect).toHaveValue(type)
  }

  async setName(name: string): Promise<void> {
    await this.nameInput.fill(name)
    await expect(this.nameInput).toHaveValue(name)
  }

  async expectNameValue(name: string): Promise<void> {
    await expect(this.nameInput).toHaveValue(name)
  }

  async expectNamePlaceholder(text: string): Promise<void> {
    await expect(this.nameInput).toHaveAttribute('placeholder', text)
  }

  async expectInfoMatches(regex: RegExp): Promise<void> {
    const text = await this.info.textContent()
    expect(text).toMatch(regex)
  }

  async getInfoText(): Promise<string | null> {
    return this.info.textContent()
  }

  async clickClose(): Promise<void> {
    await this.closeBtn.click()
  }

  async clickDelete(): Promise<void> {
    await this.deleteBtn.click()
  }

  async getTypeOptionValues(): Promise<string[]> {
    return this.typeOptions.evaluateAll(
      (opts: HTMLOptionElement[]) => opts.map((o) => o.value),
    )
  }

  /** Press the global Delete key (deletes the currently selected machine). */
  async pressDelete(): Promise<void> {
    await this.page.keyboard.press('Delete')
  }

  /** Delegates to {@link pressEnterAndSnapshot} on the machine name input. */
  async pressEnterInNameInput(): Promise<{
    wasFocused: boolean
    isStillFocused: boolean
    valueAfter: string
  }> {
    return pressEnterAndSnapshot(this.nameInput)
  }

  async getBoundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return this.panel.boundingBox()
  }

  /**
   * Assert that `document.elementFromPoint` at the Machine panel's
   * geometric centre resolves to a node inside `.ui-machine-panel`.
   */
  async expectStaysOnTopAtCenter(): Promise<void> {
    await expectPanelStaysOnTopAtCenter(this.panel, '.ui-machine-panel')
  }
}
