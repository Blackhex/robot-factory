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

  // ---- drag-and-drop reordering -----------------------------------------

  /** Locator for a slot row's drag-handle (grip) element. */
  slotGrip(name: string): Locator {
    return this.slotByName(name).locator('.ui-projects-slot-grip')
  }

  /** Locator for any drag-handle (grip) inside the "+ New project" placeholder. */
  placeholderGrip(): Locator {
    return this.emptyPlaceholder.first().locator('.ui-projects-slot-grip')
  }

  /**
   * Return the display names of saved-project rows in DOM order
   * (top → bottom), excluding the "+ New project" placeholder row.
   */
  async getProjectOrder(): Promise<string[]> {
    return this.slots.locator('.ui-projects-slot-name').allInnerTexts()
  }

  /**
   * Return the class lists of every row in the list in DOM order,
   * including the placeholder. Used to assert "placeholder stays last".
   */
  async getRowClassesInOrder(): Promise<string[]> {
    const rows = this.page.locator('#projects-container .ui-projects-slot')
    const count = await rows.count()
    const result: string[] = []
    for (let i = 0; i < count; i++) {
      result.push((await rows.nth(i).getAttribute('class')) ?? '')
    }
    return result
  }

  /** Assert the "+ New project" placeholder is the last row in the list. */
  async expectPlaceholderIsLast(): Promise<void> {
    const classes = await this.getRowClassesInOrder()
    expect(classes.length).toBeGreaterThan(0)
    expect(classes[classes.length - 1]).toContain('ui-projects-slot--empty')
  }

  /**
   * HTML5 drag the source slot's grip onto the target slot row, releasing
   * either in the top half (`'before'`) or the bottom half (`'after'`).
   * Uses Playwright's `dragTo` so the full HTML5 dragstart/dragover/drop/
   * dragend sequence is dispatched the same way a real user mouse-drag
   * would dispatch them.
   */
  async dragSlot(
    sourceName: string,
    targetName: string,
    position: 'before' | 'after',
  ): Promise<void> {
    const grip = this.slotGrip(sourceName)
    await expect(grip).toBeVisible()
    const target = this.slotByName(targetName)
    await expect(target).toBeVisible()
    const box = await target.boundingBox()
    if (!box) throw new Error(`dragSlot: target row "${targetName}" has no bounding box`)
    await grip.dragTo(target, {
      targetPosition: {
        x: box.width / 2,
        y: position === 'before' ? Math.max(2, box.height * 0.2) : Math.max(2, box.height * 0.8),
      },
    })
  }

  /**
   * Drop a slot row onto the "+ New project" placeholder. Used to verify
   * the placeholder stays pinned to the bottom: the dropped row should
   * land as the last real slot, not after the placeholder.
   */
  async dropOnPlaceholder(sourceName: string): Promise<void> {
    const grip = this.slotGrip(sourceName)
    await expect(grip).toBeVisible()
    const placeholder = this.emptyPlaceholder.first()
    await expect(placeholder).toBeVisible()
    const box = await placeholder.boundingBox()
    if (!box) throw new Error('dropOnPlaceholder: placeholder has no bounding box')
    await grip.dragTo(placeholder, {
      targetPosition: { x: box.width / 2, y: box.height - 2 },
    })
  }

  /**
   * Begin an HTML5 drag from `sourceName`'s grip and hover over
   * `targetName`'s row WITHOUT releasing — used to inspect the drop
   * indicator that the production code is expected to render mid-drag.
   * Pair with `endDragOnRow` (or `cancelDrag`) to finish the gesture.
   *
   * Uses synthetic `dispatchEvent` for the HTML5 drag sequence (no raw
   * `page.mouse` events) so the assertion targets the same drag path
   * the unit tests cover.
   */
  async beginDragOverRow(sourceName: string, targetName: string): Promise<void> {
    const grip = this.slotGrip(sourceName)
    await expect(grip).toBeVisible()
    const target = this.slotByName(targetName)
    await expect(target).toBeVisible()
    await grip.dispatchEvent('dragstart')
    await target.dispatchEvent('dragenter')
    await target.dispatchEvent('dragover')
  }

  /**
   * Finish a drag started with `beginDragOverRow` by dropping on the
   * currently-hovered target row. Dispatches the matching HTML5 drop /
   * dragend events on the target.
   */
  async endDragOnRow(targetName: string): Promise<void> {
    const target = this.slotByName(targetName)
    await target.dispatchEvent('drop')
    await target.dispatchEvent('dragend')
  }

  /**
   * Pointer-fallback variant of `beginDragOverRow` that pauses the
   * pointer over either the top or bottom half of the target row WITHOUT
   * releasing. Pair with `endDrag()` (drop in place) or `cancelDrag()`
   * (release outside the panel).
   *
   * Uses the pointer-event path (pointerdown + pointermove on the grip)
   * because synthetic HTML5 dragstart events are not reliably promoted
   * to native drag in headless Chromium. The production controller
   * routes pointer drags through the same insertion math as native
   * HTML5 drags, so assertions against the resulting DOM apply equally
   * to both code paths.
   */
  async beginDragOver(
    sourceName: string,
    targetName: string,
    position: 'top' | 'bottom' = 'top',
  ): Promise<void> {
    const grip = this.slotGrip(sourceName)
    await expect(grip).toBeVisible()
    const target = this.slotByName(targetName)
    await expect(target).toBeVisible()
    const gripBox = await grip.boundingBox()
    if (!gripBox) {
      throw new Error(`beginDragOver: source grip "${sourceName}" has no bounding box`)
    }
    const targetBox = await target.boundingBox()
    if (!targetBox) {
      throw new Error(`beginDragOver: target row "${targetName}" has no bounding box`)
    }
    const startX = gripBox.x + gripBox.width / 2
    const startY = gripBox.y + gripBox.height / 2
    const targetX = targetBox.x + targetBox.width / 2
    const targetY = position === 'top'
      ? targetBox.y + Math.max(2, targetBox.height * 0.2)
      : targetBox.y + Math.max(2, targetBox.height * 0.8)
    await this.page.mouse.move(startX, startY)
    await this.page.mouse.down()
    // Move past the controller's pointer-drag commit threshold (a few
    // pixels) before approaching the target so the controller commits
    // the drag and starts evaluating insertion positions.
    await this.page.mouse.move(startX + 16, startY, { steps: 4 })
    await this.page.mouse.move(targetX, targetY, { steps: 8 })
  }

  /** Release the in-flight pointer at the current cursor location, completing the drop. */
  async endDrag(): Promise<void> {
    await this.page.mouse.up()
  }

  /**
   * Cancel an in-flight pointer drag by moving the pointer well outside
   * the projects panel and releasing — the controller's pointer-up
   * handler hit-tests the element under the pointer; releasing off-panel
   * means no slot row is found and no reorder is applied.
   */
  async cancelDrag(): Promise<void> {
    const box = await this.container.boundingBox()
    if (!box) throw new Error('cancelDrag: projects panel has no bounding box')
    await this.page.mouse.move(box.x - 200, Math.max(10, box.y - 200), { steps: 8 })
    await this.page.mouse.up()
  }

  /**
   * Focus a slot row by name and press a keyboard combination on it.
   * `modifiers` are Playwright keyboard names (e.g. `['Alt']`,
   * `['Shift']`); they are concatenated with `+` and the final `key`.
   */
  async pressKeyOnSlot(name: string, key: string, modifiers: string[] = []): Promise<void> {
    const row = this.slotByName(name)
    await expect(row).toBeVisible()
    await row.focus()
    const combo = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key
    await this.page.keyboard.press(combo)
  }

  /** Move keyboard focus to the named slot row without pressing any key. */
  async focusSlot(name: string): Promise<void> {
    const row = this.slotByName(name)
    await expect(row).toBeVisible()
    await row.focus()
  }

  /**
   * Press a keyboard combination on whatever currently has focus, WITHOUT
   * re-focusing any slot row first. Use after `focusSlot()` to assert
   * that a key handler preserves focus on its own across consecutive
   * presses (the common case where re-focusing between presses would
   * mask a focus-loss bug in the handler).
   */
  async pressKey(key: string, modifiers: string[] = []): Promise<void> {
    const combo = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key
    await this.page.keyboard.press(combo)
  }

  /**
   * Read the display name of the slot row that currently owns
   * `document.activeElement`. Returns `null` when focus is on `<body>`,
   * the panel container, or any non-slot element.
   */
  async getFocusedSlotName(): Promise<string | null> {
    return this.page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      if (!active) return null
      const row = active.closest(
        '.ui-projects-slot:not(.ui-projects-slot--empty)',
      )
      if (!row) return null
      const nameEl = row.querySelector('.ui-projects-slot-name')
      return nameEl?.textContent?.trim() ?? null
    })
  }

  // ---- export / import file flow ---------------------------------------

  /**
   * Assert a prompt-style modal is open and its title equals `text`.
   * Same DOM as `expectConfirmModalTitle` (`.ui-modal-title`); separate
   * helper so spec intent (prompt vs confirm) reads as a domain verb.
   */
  async expectPromptModalTitle(text: string): Promise<void> {
    const title = this.page.locator('.ui-modal .ui-modal-title')
    await expect(title).toBeVisible()
    await expect(title).toHaveText(text)
  }

  /**
   * Click Export, wait for the resulting `download` event, and return
   * its filename plus the parsed JSON content of the file. Used to
   * assert the unified single/multi bundle envelope on disk.
   */
  async exportAndCaptureDownload(): Promise<{ filename: string; json: unknown }> {
    const downloadPromise = this.page.waitForEvent('download')
    await this.clickExport()
    const download = await downloadPromise
    const filename = download.suggestedFilename()
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer)
    }
    const text = Buffer.concat(chunks).toString('utf8')
    return { filename, json: JSON.parse(text) }
  }

  /**
   * Click Import and feed the file picker an in-memory JSON payload
   * named `filename`. Used for round-trip tests where the spec captures
   * a download then re-imports its contents without writing to disk.
   */
  async importBundleFromString(filename: string, content: string): Promise<void> {
    const fcPromise = this.page.waitForEvent('filechooser')
    await this.clickImport()
    const fc = await fcPromise
    await fc.setFiles({
      name: filename,
      mimeType: 'application/json',
      buffer: Buffer.from(content, 'utf8'),
    })
  }

  /**
   * Click Export, wait for the export-name prompt to appear with title
   * `title`, cancel it, and assert that no `download` event fires. Used
   * for the 0-selected-no-loaded-slot prompt-then-cancel flow.
   */
  async expectExportPromptCancelTriggersNoDownload(title: string): Promise<void> {
    let downloaded = false
    const handler = (): void => {
      downloaded = true
    }
    this.page.on('download', handler)
    try {
      await this.clickExport()
      await this.expectPromptModalTitle(title)
      await this.cancelPrompt()
      // Give any pending async download a chance to fire so the negative
      // assertion is meaningful — production aborts synchronously, but a
      // regression that triggered a download would do so asynchronously.
      await this.page.waitForTimeout(200)
      expect(
        downloaded,
        'cancelling the export prompt must not trigger a download',
      ).toBe(false)
    } finally {
      this.page.off('download', handler)
    }
  }

  /**
   * Click Export, fill the export-name prompt with `name`, confirm, and
   * return the filename + parsed JSON of the resulting download.
   */
  async exportViaPromptAndCaptureDownload(
    name: string,
  ): Promise<{ filename: string; json: unknown }> {
    const downloadPromise = this.page.waitForEvent('download')
    await this.clickExport()
    await this.fillPromptAndConfirm(name)
    const download = await downloadPromise
    const filename = download.suggestedFilename()
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer)
    }
    return { filename, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  }
}
