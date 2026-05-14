import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

import { expectPanelStaysOnTopAtCenter } from '../_helpers/panelStacking'

export type HudMetricLabel = 'Parts' | 'Assemblies' | 'Robots' | 'Time' | 'Quality'

/**
 * The in-game HUD (visible during simulation).
 */
export class HudPage {
  private readonly root: Locator
  private readonly metricLabels: Locator
  private readonly metricValues: Locator

  constructor(page: Page) {
    this.root = page.locator('.ui-hud')
    this.metricLabels = page.locator('.ui-hud .ui-hud-metric-label')
    this.metricValues = page.locator('.ui-hud .ui-hud-metric-value')
  }

  async getBoundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return this.root.boundingBox()
  }

  /**
   * Assert that `document.elementFromPoint` at the HUD's geometric
   * centre resolves to a node inside `.ui-hud` — i.e. no overlay is
   * stacked above the HUD at that point.
   */
  async expectStaysOnTopAtCenter(): Promise<void> {
    await expectPanelStaysOnTopAtCenter(this.root, '.ui-hud')
  }

  async getMetricLabels(): Promise<string[]> {
    const texts = await this.metricLabels.allTextContents()
    return texts.map((t) => t.trim())
  }

  async getMetricValue(label: HudMetricLabel): Promise<string> {
    const labels = await this.getMetricLabels()
    const index = labels.indexOf(label)
    if (index < 0) {
      throw new Error(
        `HUD metric labelled "${label}" not found. Visible labels: [${labels.join(', ')}]`,
      )
    }
    const text = await this.metricValues.nth(index).textContent()
    return (text ?? '').trim()
  }

  async expectMetricLabelsInOrder(expected: HudMetricLabel[], timeoutMs = 5000): Promise<void> {
    await expect(async () => {
      const labels = await this.getMetricLabels()
      expect(labels).toEqual(expected)
    }).toPass({ timeout: timeoutMs, intervals: [200] })
  }

  async expectMetricValue(
    label: HudMetricLabel,
    predicate: (value: string) => boolean,
    timeoutMs = 30000,
  ): Promise<void> {
    await expect(async () => {
      const value = await this.getMetricValue(label)
      expect(predicate(value), `HUD ${label} value "${value}" did not satisfy predicate`).toBe(true)
    }).toPass({ timeout: timeoutMs, intervals: [500] })
  }

  async expectVisible(): Promise<void> {
    await expect(this.root).toBeVisible()
  }

  async expectHidden(): Promise<void> {
    await expect(this.root).toBeHidden()
  }

  async getItemsDelivered(): Promise<number> {
    const parts = parseInt((await this.getMetricValue('Parts')) || '0', 10)
    const assemblies = parseInt((await this.getMetricValue('Assemblies')) || '0', 10)
    const robots = parseInt((await this.getMetricValue('Robots')) || '0', 10)
    return parts + assemblies + robots
  }

  async expectItemsDeliveredAtLeast(min: number, timeoutMs: number): Promise<void> {
    await expect(async () => {
      const total = await this.getItemsDelivered()
      expect(total).toBeGreaterThanOrEqual(min)
    }).toPass({ timeout: timeoutMs, intervals: [500] })
  }

  async expectItemsDeliveredGreaterThan(min: number, timeoutMs: number): Promise<void> {
    await expect(async () => {
      const total = await this.getItemsDelivered()
      expect(total).toBeGreaterThan(min)
    }).toPass({ timeout: timeoutMs, intervals: [500] })
  }

  async expectTimeAdvancing(timeoutMs: number): Promise<void> {
    await expect(async () => {
      const time = await this.getMetricValue('Time')
      expect(time).not.toBe('0:00')
    }).toPass({ timeout: timeoutMs, intervals: [500] })
  }
}
