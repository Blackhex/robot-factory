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

  async getMessageText(): Promise<string> {
    return (await this.message.textContent()) ?? ''
  }

  async getTitleText(): Promise<string> {
    return (await this.title.textContent()) ?? ''
  }

  async clickRestart(): Promise<void> {
    await this.restartBtn.click()
  }

  /**
   * Assert that the modal is the topmost element at multiple sample points
   * across its bounding box (center + four quarter-region centers).
   *
   * The modal is rendered as a full-viewport overlay, so its geometric
   * center sits in the canvas region and is rarely covered. The right-side
   * sample points fall inside the open PXT editor panel's region — those
   * are the points that catch stacking-context bugs where a sibling
   * overlay (e.g. `#editor-container`) visually covers the modal even
   * though the modal itself is technically `visible`.
   *
   * For each sample point, asks the browser which element occupies that
   * pixel via `document.elementFromPoint`, then checks
   * `el.closest('.ui-game-over-modal') !== null`.
   */
  async expectTopmostAtSampledPoints(): Promise<void> {
    const box = await this.root.boundingBox()
    expect(box, 'Game-over modal must have a bounding box').not.toBeNull()

    const samples: Array<{ name: string; x: number; y: number }> = [
      { name: 'center', x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
      { name: 'right-center', x: box!.x + box!.width * 0.75, y: box!.y + box!.height / 2 },
      { name: 'left-center', x: box!.x + box!.width * 0.25, y: box!.y + box!.height / 2 },
      { name: 'top-center', x: box!.x + box!.width / 2, y: box!.y + box!.height * 0.25 },
      { name: 'bottom-center', x: box!.x + box!.width / 2, y: box!.y + box!.height * 0.75 },
    ]

    const probes = await this.root.page().evaluate(
      (points) => {
        return points.map((p) => {
          const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null
          return {
            name: p.name,
            x: p.x,
            y: p.y,
            inModal: el !== null && el.closest('.ui-game-over-modal') !== null,
            tag: el?.tagName ?? null,
            id: el?.id ?? null,
            className: typeof el?.className === 'string' ? el.className : null,
          }
        })
      },
      samples,
    )

    for (const probe of probes) {
      expect(
        probe.inModal,
        `Game-over modal must be the topmost element at ${probe.name} (${probe.x}, ${probe.y}); ` +
          `got <${probe.tag}> id="${probe.id}" class="${probe.className}"`,
      ).toBe(true)
    }
  }
}
