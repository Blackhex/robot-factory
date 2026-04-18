import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * The in-game HUD (visible during simulation).
 */
export class HudPage {
  private readonly root: Locator
  private readonly itemsMetric: Locator
  private readonly timeMetric: Locator

  constructor(page: Page) {
    this.root = page.locator('.ui-hud')
    // First metric value = items delivered counter.
    this.itemsMetric = page.locator('.ui-hud-metric-value').first()
    // Third metric value = elapsed time.
    this.timeMetric = page.locator('.ui-hud-metric-value').nth(2)
  }

  async expectVisible(): Promise<void> {
    await expect(this.root).toBeVisible()
  }

  async expectHidden(): Promise<void> {
    await expect(this.root).toBeHidden()
  }

  async getItemsDelivered(): Promise<number> {
    const text = await this.itemsMetric.textContent()
    return parseInt(text ?? '0', 10)
  }

  async expectItemsDeliveredAtLeast(min: number, timeoutMs: number): Promise<void> {
    await expect(async () => {
      const text = await this.itemsMetric.textContent()
      expect(parseInt(text ?? '0', 10)).toBeGreaterThanOrEqual(min)
    }).toPass({ timeout: timeoutMs, intervals: [500] })
  }

  async expectItemsDeliveredGreaterThan(min: number, timeoutMs: number): Promise<void> {
    await expect(async () => {
      const text = await this.itemsMetric.textContent()
      expect(parseInt(text ?? '0', 10)).toBeGreaterThan(min)
    }).toPass({ timeout: timeoutMs, intervals: [500] })
  }

  async expectTimeAdvancing(timeoutMs: number): Promise<void> {
    await expect(async () => {
      const time = await this.timeMetric.textContent()
      expect(time).not.toBe('0:00')
    }).toPass({ timeout: timeoutMs, intervals: [500] })
  }
}
