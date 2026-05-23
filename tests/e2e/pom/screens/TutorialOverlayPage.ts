import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * The optional tutorial overlay that appears at the start of certain levels.
 */
export class TutorialOverlayPage {
  private readonly page: Page
  private readonly root: Locator
  private readonly tooltip: Locator
  private readonly counter: Locator
  private readonly nextBtn: Locator
  private readonly skipBtn: Locator
  private readonly arrow: Locator

  constructor(_page: Page) {
    this.page = _page
    this.root = _page.locator('.ui-tutorial')
    this.tooltip = _page.locator('.ui-tutorial-tooltip')
    this.counter = _page.locator('.ui-tutorial-counter')
    this.nextBtn = _page.locator('.ui-tutorial-btn--next')
    this.skipBtn = _page.locator('.ui-tutorial-btn--skip')
    this.arrow = _page.locator('.ui-tutorial-arrow')
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

  // Default timeout is 0 (instant DOM check) since the tutorial is shown
  // synchronously on level setup; callers that genuinely need to wait for it
  // to mount must pass an explicit timeout. Burns no wall time when absent.
  async dismissIfPresent(timeout = 0): Promise<void> {
    if (await this.skipBtn.isVisible().catch(() => false)) {
      await this.skipBtn.click()
      return
    }
    if (timeout > 0 && await this.skipBtn.isVisible({ timeout }).catch(() => false)) {
      await this.skipBtn.click()
    }
  }

  /**
   * Center X (in CSS pixels) of the `.ui-tutorial-arrow` element. Returns
   * `null` when the arrow has no bounding box (hidden / detached).
   */
  async getArrowCenterX(): Promise<number | null> {
    const box = await this.arrow.boundingBox()
    if (!box) return null
    return box.x + box.width / 2
  }

  /**
   * Whether the tutorial arrow is currently visually hidden (no box, or
   * `display:none`/`visibility:hidden`). Used as the alternative path when an
   * informational tutorial step has no anchored target.
   */
  async isArrowHidden(): Promise<boolean> {
    const box = await this.arrow.boundingBox().catch(() => null)
    if (!box) return true
    if (box.width === 0 && box.height === 0) return true
    return this.page.evaluate(() => {
      const el = document.querySelector('.ui-tutorial-arrow') as HTMLElement | null
      if (!el) return true
      const cs = getComputedStyle(el)
      return cs.display === 'none' || cs.visibility === 'hidden'
    })
  }

  /**
   * Center X (in CSS pixels) of the DOM element matched by the given CSS
   * selector — typically the `highlightSelector` of the active tutorial
   * step. Returns `null` if the element is not in the DOM or has no bounds.
   */
  async getStepTargetCenterX(selector: string): Promise<number | null> {
    const target = this.page.locator(selector).first()
    const box = await target.boundingBox().catch(() => null)
    if (!box) return null
    return box.x + box.width / 2
  }

  /** Read the active tutorial step's `1 / N` counter as a 0-based index. */
  async getCurrentStepIndex(): Promise<number> {
    const text = (await this.counter.innerText()).trim()
    const match = text.match(/^(\d+)\s*\/\s*\d+$/)
    if (!match) {
      throw new Error(`Tutorial counter has unexpected format: '${text}'`)
    }
    return Number(match[1]) - 1
  }
}
