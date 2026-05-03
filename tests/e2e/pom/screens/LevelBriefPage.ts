import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * The build-phase Level Brief panel that displays the current level's name,
 * description and goals. Centered horizontally near the top of the screen.
 */
export class LevelBriefPage {
  private readonly root: Locator

  constructor(page: Page) {
    this.root = page.locator('.ui-level-brief')
  }

  async expectVisible(): Promise<void> {
    await expect(this.root).toBeVisible()
  }

  async getBoundingBox(): Promise<{ x: number; y: number; width: number; height: number }> {
    await expect(this.root).toBeVisible()
    const box = await this.root.boundingBox()
    expect(box, 'level brief has a bounding box').not.toBeNull()
    return box!
  }
}
