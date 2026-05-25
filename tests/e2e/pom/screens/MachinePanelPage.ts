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
  private readonly recipeRow: Locator
  private readonly recipeValue: Locator
  private readonly recipeInputsRow: Locator
  private readonly recipeInputsValue: Locator
  private readonly recipeOutputsRow: Locator
  private readonly recipeOutputsValue: Locator

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
    this.recipeRow = this.panel.locator(
      '.ui-machine-panel-row:has([data-i18n-key="machine_panel.recipe"])',
    )
    this.recipeValue = this.recipeRow.locator('.ui-machine-panel-value')
    this.recipeInputsRow = this.panel.locator(
      '.ui-machine-panel-row:has([data-i18n-key="machine_panel.recipe_inputs"])',
    )
    this.recipeInputsValue = this.recipeInputsRow.locator('.ui-machine-panel-value')
    this.recipeOutputsRow = this.panel.locator(
      '.ui-machine-panel-row:has([data-i18n-key="machine_panel.recipe_outputs"])',
    )
    this.recipeOutputsValue = this.recipeOutputsRow.locator('.ui-machine-panel-value')
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

  /**
   * Assert the runtime "Recipe" row is visible and shows the given value text.
   */
  async expectRecipeValue(text: string | RegExp): Promise<void> {
    await expect(this.recipeRow).toBeVisible()
    await expect(this.recipeValue).toHaveText(text)
  }

  /**
   * Assert the runtime "Recipe" row is hidden (machine has no recipe set).
   * Passes whether the row is absent from the DOM or present with `display: none`.
   */
  async expectRecipeRowHidden(): Promise<void> {
    await expect(this.recipeRow).toBeHidden()
  }

  /**
   * Assert the runtime "Needs" / recipe-inputs row is visible and shows the given text.
   */
  async expectRecipeInputsValue(text: string | RegExp): Promise<void> {
    await expect(this.recipeInputsRow).toBeVisible()
    await expect(this.recipeInputsValue).toHaveText(text)
  }

  async expectRecipeInputsRowHidden(): Promise<void> {
    await expect(this.recipeInputsRow).toBeHidden()
  }

  /**
   * Assert the runtime "Makes" / recipe-outputs row is visible and shows the given text.
   */
  async expectRecipeOutputsValue(text: string | RegExp): Promise<void> {
    await expect(this.recipeOutputsRow).toBeVisible()
    await expect(this.recipeOutputsValue).toHaveText(text)
  }

  async expectRecipeOutputsRowHidden(): Promise<void> {
    await expect(this.recipeOutputsRow).toBeHidden()
  }
}
