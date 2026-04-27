import type { Page } from '@playwright/test'

export class TimingProbe {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async flushAnimationFrame(): Promise<void> {
    await this.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    )
  }

  async settle(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms)
  }
}