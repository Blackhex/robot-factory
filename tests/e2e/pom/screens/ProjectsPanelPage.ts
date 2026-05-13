import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * The Projects panel — a sandbox-only overlay that lists saved factory
 * "projects" (slots), with Save / Import / Export controls. Opened from
 * the toolbar's Projects button.
 */
export class ProjectsPanelPage {
  private readonly page: Page
  private readonly container: Locator
  private readonly importBtn: Locator
  private readonly exportBtn: Locator
  private readonly slots: Locator
  private readonly emptyPlaceholder: Locator

  constructor(page: Page) {
    this.page = page
    this.container = page.locator('#projects-container')
    this.importBtn = page.locator('.ui-projects-btn--import')
    this.exportBtn = page.locator('.ui-projects-btn--export')
    this.slots = page.locator('.ui-projects-slot:not(.ui-projects-slot--empty)')
    this.emptyPlaceholder = page.locator('.ui-projects-slot--empty')
  }

  async expectOpen(): Promise<void> {
    await expect(this.container).toHaveClass(/open/)
  }

  async expectClosed(): Promise<void> {
    await expect(this.container).not.toHaveClass(/open/)
  }

  /** True when the panel currently has the `open` class. */
  async isOpen(): Promise<boolean> {
    const classes = (await this.container.getAttribute('class')) ?? ''
    return classes.split(/\s+/).includes('open')
  }

  /**
   * Pointer-down + small horizontal drag + pointer-up on the
   * `#projects-resize-handle` element. Used to verify that interacting
   * with the resize handle does NOT trigger the panel's outside-click
   * dismiss behavior.
   */
  async dragResizeHandle(deltaX = 30): Promise<void> {
    const handle = this.page.locator('#projects-resize-handle')
    await expect(handle).toBeVisible()
    const box = await handle.boundingBox()
    if (!box) throw new Error('dragResizeHandle: resize handle has no bounding box')
    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2
    await this.page.mouse.move(startX, startY)
    await this.page.mouse.down()
    await this.page.mouse.move(startX + deltaX, startY, { steps: 10 })
    await this.page.mouse.up()
  }

  async expectAttached(): Promise<void> {
    await expect(this.container).toBeAttached()
  }

  async expectImportButtonVisible(): Promise<void> {
    await expect(this.importBtn).toBeVisible()
  }

  async expectExportButtonVisible(): Promise<void> {
    await expect(this.exportBtn).toBeVisible()
  }

  async expectSlotCount(count: number): Promise<void> {
    await expect(this.slots).toHaveCount(count)
  }

  async expectEmptyPlaceholderCount(count: number): Promise<void> {
    await expect(this.emptyPlaceholder).toHaveCount(count)
  }

  /** Locator for a slot row by its display name. */
  slotByName(name: string): Locator {
    return this.slots.filter({ hasText: name })
  }

  async expectSlotPresent(name: string): Promise<void> {
    await expect(this.slotByName(name)).toHaveCount(1)
  }

  async expectSlotAbsent(name: string): Promise<void> {
    await expect(this.slotByName(name)).toHaveCount(0)
  }

  async expectSlotSelected(name: string): Promise<void> {
    await expect(this.slotByName(name)).toHaveClass(/is-selected/)
  }

  async clickEmptyPlaceholder(): Promise<void> {
    await expect(this.emptyPlaceholder.first()).toBeVisible()
    await this.emptyPlaceholder.first().click()
  }

  /** Double-click the "+ New project" placeholder row to open the
   * "start a new project" confirmation flow. */
  async dblClickEmptyPlaceholder(): Promise<void> {
    await expect(this.emptyPlaceholder.first()).toBeVisible()
    await this.emptyPlaceholder.first().dblclick()
  }

  /** Assert a confirm modal is open and its title equals `text`. */
  async expectConfirmModalTitle(text: string): Promise<void> {
    const title = this.page.locator('.ui-modal .ui-modal-title')
    await expect(title).toBeVisible()
    await expect(title).toHaveText(text)
  }

  /** Assert no modal is currently mounted. */
  async expectNoModal(): Promise<void> {
    await expect(this.page.locator('.ui-modal')).toHaveCount(0)
  }

  async clickSlot(name: string): Promise<void> {
    const row = this.slotByName(name)
    await expect(row).toBeVisible()
    await row.click()
  }

  /** Ctrl/Cmd+click a slot row to toggle multi-selection. */
  async ctrlClickSlot(name: string): Promise<void> {
    const row = this.slotByName(name)
    await expect(row).toBeVisible()
    await row.click({ modifiers: ['ControlOrMeta'] })
  }

  /** Assert each row in `names` has the `is-selected` class. */
  async expectSlotsSelected(names: string[]): Promise<void> {
    for (const name of names) {
      await expect(this.slotByName(name)).toHaveClass(/is-selected/)
    }
  }

  async doubleClickSlot(name: string): Promise<void> {
    const row = this.slotByName(name)
    await expect(row).toBeVisible()
    await row.dblclick()
  }

  async deleteSlot(name: string): Promise<void> {
    const row = this.slotByName(name)
    await expect(row).toBeVisible()
    await row.locator('.ui-projects-slot-delete').click()
  }

  /**
   * Fill the currently-open prompt modal with `text` and click Confirm.
   * Replaces the legacy `stubPromptResponse(text)` helper that stubbed
   * `window.prompt` — saves now open an in-game modal instead.
   */
  async fillPromptAndConfirm(text: string): Promise<void> {
    const input = this.page.locator('.ui-modal-input')
    await expect(input).toBeVisible()
    await input.fill(text)
    await this.page.locator('.ui-modal-confirm').click()
    await expect(this.page.locator('.ui-modal')).toHaveCount(0)
  }

  /** Cancel the currently-open prompt modal (Cancel button). */
  async cancelPrompt(): Promise<void> {
    const cancel = this.page.locator('.ui-modal-cancel')
    await expect(cancel).toBeVisible()
    await cancel.click()
    await expect(this.page.locator('.ui-modal')).toHaveCount(0)
  }

  /** Click Confirm on the currently-open confirm modal. */
  async confirmConfirm(): Promise<void> {
    const btn = this.page.locator('.ui-modal-confirm')
    await expect(btn).toBeVisible()
    await btn.click()
    await expect(this.page.locator('.ui-modal')).toHaveCount(0)
  }

  /** Click Cancel on the currently-open confirm modal. */
  async cancelConfirm(): Promise<void> {
    const btn = this.page.locator('.ui-modal-cancel')
    await expect(btn).toBeVisible()
    await btn.click()
    await expect(this.page.locator('.ui-modal')).toHaveCount(0)
  }

  /** Locator for the inline Save button inside a named slot's row. */
  slotSaveButton(name: string): Locator {
    return this.slotByName(name).locator('.ui-projects-slot-save')
  }

  async expectSlotSaveButtonVisible(name: string): Promise<void> {
    await expect(this.slotSaveButton(name)).toBeVisible()
  }

  async expectEmptyPlaceholderSaveButtonVisible(): Promise<void> {
    await expect(
      this.emptyPlaceholder.first().locator('.ui-projects-slot-save'),
    ).toBeVisible()
  }

  async clickSlotSave(name: string): Promise<void> {
    const btn = this.slotSaveButton(name)
    await expect(btn).toBeVisible()
    await btn.click()
  }

  async clickEmptyPlaceholderSave(): Promise<void> {
    const btn = this.emptyPlaceholder.first().locator('.ui-projects-slot-save')
    await expect(btn).toBeVisible()
    await btn.click()
  }

  async clickImport(): Promise<void> {
    await expect(this.importBtn).toBeVisible()
    await this.importBtn.click()
  }

  async clickExport(): Promise<void> {
    await expect(this.exportBtn).toBeVisible()
    await this.exportBtn.click()
  }
}
