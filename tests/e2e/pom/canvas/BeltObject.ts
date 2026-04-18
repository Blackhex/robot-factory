import type { Page, Locator } from '@playwright/test'
import type { SimulationProbe } from './SimulationProbe'

/**
 * Interact with belts that are rendered as Three.js meshes on the canvas.
 * Picks the middle belt mesh as the canonical click target (matches the
 * legacy specs).
 */
export class BeltObject {
  private readonly page: Page
  private readonly probe: SimulationProbe
  private readonly canvasLocator: Locator

  constructor(page: Page, probe: SimulationProbe) {
    this.page = page
    this.probe = probe
    this.canvasLocator = page.locator('#canvas-container canvas')
  }

  async click(): Promise<void> {
    const pos = await this.probe.projectMidBeltMeshToScreen()
    await this.canvasLocator.click({ position: { x: pos.x, y: pos.y } })
    await this.page.waitForTimeout(300)
  }

  async dblClick(): Promise<void> {
    const pos = await this.probe.projectMidBeltMeshToScreen()
    await this.canvasLocator.dblclick({ position: { x: pos.x, y: pos.y } })
    await this.page.waitForTimeout(300)
  }
}
