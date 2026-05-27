import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * The build-phase Level Brief panel that displays the current level's name,
 * description and goals. Docked to the top-left of the visible game area
 * (respecting the `--rf-canvas-left` inset reserved for any left-side
 * overlay such as the sandbox Projects panel).
 */
export class LevelBriefPage {
  private readonly page: Page
  private readonly root: Locator

  constructor(page: Page) {
    this.page = page
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

  /**
   * Read a curated set of computed-style values from `.ui-level-brief`
   * that the top-left dock contract pins down.
   */
  async readComputedStyle(): Promise<{
    position: string
    backgroundColor: string
    backdropFilter: string
    boxShadow: string
    transform: string
    borderTopWidth: string
    borderTopStyle: string
    borderTopColor: string
    borderRadius: string
  }> {
    await expect(this.root).toBeVisible()
    return this.root.evaluate((el) => {
      const cs = getComputedStyle(el as HTMLElement)
      return {
        position: cs.position,
        backgroundColor: cs.backgroundColor,
        backdropFilter:
          cs.backdropFilter ||
          (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter ||
          'none',
        boxShadow: cs.boxShadow,
        transform: cs.transform,
        borderTopWidth: cs.borderTopWidth,
        borderTopStyle: cs.borderTopStyle,
        borderTopColor: cs.borderTopColor,
        borderRadius: cs.borderTopLeftRadius,
      }
    })
  }

  /**
   * Resolve `var(--rf-surface)` and `var(--rf-border)` to the same
   * serialized `rgb(...)` form that `getComputedStyle` returns for element
   * backgrounds/borders. Mounts a hidden probe element so the spec can
   * compare brief styling against the theme tokens without hardcoding
   * literal colors.
   */
  async resolveSurfaceReference(): Promise<{ surfaceColor: string; borderColor: string }> {
    return this.page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.position = 'absolute'
      probe.style.left = '-9999px'
      probe.style.top = '-9999px'
      probe.style.width = '1px'
      probe.style.height = '1px'
      probe.style.background = 'var(--rf-surface)'
      probe.style.border = '1px solid var(--rf-border)'
      document.body.appendChild(probe)
      const cs = getComputedStyle(probe)
      const surfaceColor = cs.backgroundColor
      const borderColor = cs.borderTopColor
      probe.remove()
      return { surfaceColor, borderColor }
    })
  }

  /**
   * Simulate a left-edge UI panel (such as the sandbox Projects panel)
   * being open by writing the `--rf-canvas-left` CSS variable on `<body>`.
   *
   * In real flows the Projects panel only renders in Sandbox mode while
   * the Level Brief only renders in Level Build/Play phases, so the two
   * never coexist via UI. The contract under test is that the brief's CSS
   * rule reads `--rf-canvas-left`, which we exercise directly here.
   */
  async simulateLeftPanelInset(widthPx: number): Promise<void> {
    await this.page.evaluate((px) => {
      document.body.style.setProperty('--rf-canvas-left', `${px}px`)
    }, widthPx)
  }

  async clearLeftPanelInset(): Promise<void> {
    await this.page.evaluate(() => {
      document.body.style.removeProperty('--rf-canvas-left')
    })
  }
}
