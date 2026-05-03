import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * The right-side editor panel that hosts the PXT iframe + fallback textarea.
 * The PXT-specific Blockly interactions live in `editor/PxtEditorPage.ts`.
 */
export class EditorPanelPage {
  private readonly page: Page
  private readonly container: Locator
  private readonly iframe: Locator
  private readonly fallback: Locator
  private readonly fallbackTextarea: Locator

  constructor(page: Page) {
    this.page = page
    this.container = page.locator('#editor-container')
    this.iframe = page.locator('#editor-container .pxt-editor-iframe')
    this.fallback = page.locator('#editor-container .pxt-editor-fallback')
    this.fallbackTextarea = page.locator('.pxt-editor-fallback-textarea')
  }

  async expectOpen(): Promise<void> {
    await expect(this.container).toHaveClass(/open/)
  }

  async expectClosed(): Promise<void> {
    await expect(this.container).not.toHaveClass(/open/)
  }

  async expectIframeVisible(timeout = 15_000): Promise<void> {
    await expect(this.iframe).toBeVisible({ timeout })
  }

  async expectIframeAttached(): Promise<void> {
    await expect(this.iframe).toBeAttached()
  }

  async expectFallbackHidden(): Promise<void> {
    await expect(this.fallback).toBeHidden()
  }

  async getIframeBoundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return this.iframe.boundingBox()
  }

  async getContainerBoundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return this.container.boundingBox()
  }

  /** Compare the editor container width to a fraction of the viewport width. */
  async expectContainerWidthAroundFractionOfViewport(
    fraction: number,
    tolerance: number,
  ): Promise<void> {
    const viewport = this.page.viewportSize()!
    const box = await this.container.boundingBox()
    expect(box).not.toBeNull()
    const expectedWidth = viewport.width * fraction
    expect(box!.width).toBeGreaterThan(expectedWidth * (1 - tolerance))
    expect(box!.width).toBeLessThan(expectedWidth * (1 + tolerance))
  }

  /** Whether the panel is currently in the open state (read DOM, no wait). */
  async isOpen(): Promise<boolean> {
    return this.container.evaluate((el) => el.classList.contains('open'))
  }

  /** Whether the PXT iframe is visible. */
  async isPxtIframeVisible(timeoutMs = 3_000): Promise<boolean> {
    return this.iframe.isVisible({ timeout: timeoutMs }).catch(() => false)
  }

  async expectFallbackTextareaVisible(): Promise<void> {
    await expect(this.fallbackTextarea).toBeVisible()
  }

  async expectFallbackTextareaAttached(timeout = 8_000): Promise<void> {
    await expect(this.fallbackTextarea).toBeAttached({ timeout })
  }

  async setFallbackProgramViaValueAssignment(code: string): Promise<void> {
    await this.fallbackTextarea.evaluate((el: HTMLTextAreaElement, c: string) => {
      el.value = c
    }, code)
  }

  async fillFallbackProgram(code: string): Promise<void> {
    await this.fallbackTextarea.fill(code)
  }

  async expectFallbackValue(code: string): Promise<void> {
    await expect(this.fallbackTextarea).toHaveValue(code)
  }

  /**
   * Assert the editor container's bounding box does NOT intersect the given
   * rect. Used for responsive-layout overlap checks (UX requirement B3).
   */
  async expectDoesNotOverlapRect(
    other: { x: number; y: number; width: number; height: number },
    label = 'rect',
  ): Promise<void> {
    await this.expectOpen()
    const box = await this.container.boundingBox()
    expect(box, 'editor container has a bounding box').not.toBeNull()
    const a = box!
    const b = other
    const overlapsX = a.x < b.x + b.width && b.x < a.x + a.width
    const overlapsY = a.y < b.y + b.height && b.y < a.y + a.height
    const overlaps = overlapsX && overlapsY
    expect(
      overlaps,
      `editor container ${JSON.stringify(a)} must not overlap ${label} ${JSON.stringify(b)}`,
    ).toBe(false)
  }
}
