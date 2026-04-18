import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'
import type { GridCoord, GridSize } from '../types'
import { DEFAULT_GRID_SIZE } from '../types'
import type { SimulationProbe } from './SimulationProbe'

/**
 * Owns the grid↔pixel projection and exposes domain actions on the
 * Three.js `<canvas>` keyed by grid coordinate. The only place in the POM
 * library that knows about pixel positions for grid cells.
 */
export class FactoryGridPage {
  private readonly page: Page
  private readonly probe: SimulationProbe
  private readonly canvasLocator: Locator
  private gridSize: GridSize = DEFAULT_GRID_SIZE

  constructor(page: Page, probe: SimulationProbe) {
    this.page = page
    this.probe = probe
    this.canvasLocator = page.locator('#canvas-container canvas')
  }

  /** Configure the grid size used for pixel projection. */
  useGrid(size: GridSize): void {
    this.gridSize = size
  }

  async waitReady(): Promise<void> {
    await this.canvasLocator.waitFor()
    await this.page.waitForFunction(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement | null
      return !!c && c.width > 0 && c.height > 0
    })
  }

  async clickCell(coord: GridCoord): Promise<void> {
    const pos = await this.probe.gridCellToScreenPos(
      coord.x,
      coord.z,
      this.gridSize.width,
      this.gridSize.height,
    )
    await this.canvasLocator.click({ position: { x: pos.x, y: pos.y } })
    await this.page.waitForTimeout(200)
  }

  async dblClickCell(coord: GridCoord): Promise<void> {
    const pos = await this.probe.gridCellToScreenPos(
      coord.x,
      coord.z,
      this.gridSize.width,
      this.gridSize.height,
    )
    await this.canvasLocator.dblclick({ position: { x: pos.x, y: pos.y } })
    await this.page.waitForTimeout(200)
  }

  /** Drag a machine from one cell to another. */
  async dragCell(from: GridCoord, to: GridCoord): Promise<void> {
    const fromPos = await this.probe.gridCellToScreenPos(
      from.x,
      from.z,
      this.gridSize.width,
      this.gridSize.height,
    )
    const toPos = await this.probe.gridCellToScreenPos(
      to.x,
      to.z,
      this.gridSize.width,
      this.gridSize.height,
    )
    const box = (await this.canvasLocator.boundingBox())!
    await this.page.mouse.move(box.x + fromPos.x, box.y + fromPos.y)
    await this.page.waitForTimeout(50)
    await this.page.mouse.down()
    await this.page.waitForTimeout(150)
    await this.page.mouse.move(box.x + toPos.x, box.y + toPos.y, { steps: 30 })
    await this.page.waitForTimeout(50)
    await this.page.mouse.up()
    await this.page.waitForTimeout(500)
  }

  /** Click on an existing machine using its actual world position. */
  async clickMachineAt(coord: GridCoord): Promise<void> {
    const pos = await this.probe.projectMachineWorldToScreen(coord.x, coord.z)
    await this.canvasLocator.click({ position: { x: pos.x, y: pos.y } })
    await this.page.waitForTimeout(200)
  }

  /**
   * Drag from a specific input/output slot mesh of the machine at `from` and
   * drop on the machine body at `to`. Used to test the pointer-event path that
   * draws a belt by grabbing a slot indicator and dropping on another machine.
   */
  async dragFromMachineSlotToMachine(
    from: GridCoord,
    kind: 'input' | 'output',
    to: GridCoord,
    slotIndex = 0,
  ): Promise<void> {
    const fromPos = await this.probe.getMachineSlotScreenPos(from.x, from.z, kind, slotIndex)
    if (!fromPos) {
      throw new Error(`No ${kind} slot mesh at (${from.x}, ${from.z}) index ${slotIndex}`)
    }
    const toPos = await this.probe.projectMachineWorldToScreen(to.x, to.z)
    const box = (await this.canvasLocator.boundingBox())!
    await this.page.mouse.move(box.x + fromPos.x, box.y + fromPos.y)
    await this.page.waitForTimeout(50)
    await this.page.mouse.down()
    await this.page.waitForTimeout(150)
    await this.page.mouse.move(box.x + toPos.x, box.y + toPos.y, { steps: 30 })
    await this.page.waitForTimeout(50)
    await this.page.mouse.up()
    await this.page.waitForTimeout(500)
  }

  /** Get the canvas bounding box (for visibility / dimension assertions). */
  canvasLocatorRef(): Locator {
    return this.canvasLocator
  }

  async expectCanvasVisible(): Promise<void> {
    await expect(this.canvasLocator).toBeVisible()
  }

  async expectCanvasAttached(): Promise<void> {
    await expect(this.canvasLocator).toBeAttached()
  }

  async getCanvasBoundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return this.canvasLocator.boundingBox()
  }
}
