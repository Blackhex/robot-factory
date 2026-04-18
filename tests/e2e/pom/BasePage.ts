import type { Page, Locator } from '@playwright/test'

/**
 * Common helpers shared by all Page Objects: canvas readiness, screenshot,
 * navigation. Page Objects extend or compose this rather than re-implementing
 * canvas-readiness logic.
 */
export class BasePage {
  protected readonly page: Page
  protected readonly canvas: Locator
  protected readonly canvasInContainer: Locator

  constructor(page: Page) {
    this.page = page
    this.canvas = page.locator('canvas').first()
    this.canvasInContainer = page.locator('#canvas-container canvas')
  }

  /**
   * Navigate to the application root and wait for the Three.js canvas to be
   * sized (width/height > 0).
   */
  async goto(): Promise<void> {
    await this.page.goto('/')
    await this.page.waitForSelector('canvas')
    await this.page.waitForFunction(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement | null
      return !!c && c.width > 0 && c.height > 0
    })
  }

  /**
   * Wait for the canvas to be attached and have non-zero dimensions.
   */
  async waitForCanvasReady(): Promise<void> {
    await this.page.waitForSelector('canvas')
    await this.page.waitForFunction(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement | null
      return !!c && c.width > 0 && c.height > 0
    })
  }
}
