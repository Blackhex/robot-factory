import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import type { GridCoord, GridSize } from '../types'
import type { SimulationProbe } from './SimulationProbe'

export type CanvasPoint = { x: number; y: number }
export type RaycastInteractionHit = {
  type: 'input' | 'output' | 'machine'
  machineId: string
}

const MACHINE_BODY_HIT_SCAN_OFFSET_PX = 10

export class RaycastInteractionProbe {
  private readonly page: Page
  private readonly canvasLocator: Locator
  private readonly simulation: SimulationProbe

  constructor(page: Page, canvasLocator: Locator, simulation: SimulationProbe) {
    this.page = page
    this.canvasLocator = canvasLocator
    this.simulation = simulation
  }

  async projectMachineBodyToCanvasPoint(
    coord: GridCoord,
    gridSize: GridSize,
  ): Promise<CanvasPoint> {
    await this.installRecorder()

    const targetMachine = (await this.simulation.getMachines())
      .find((machine) => machine.x === coord.x && machine.z === coord.z)
    if (!targetMachine) {
      throw new Error(`No machine exists at (${coord.x}, ${coord.z})`)
    }

    const box = await this.getCanvasBox()
    const offsets = this.machineBodyScanOffsets()

    const gridCenter = await this.simulation.projectGridWorldToScreen(coord.x, coord.z)
    const gridCenterHit = await this.findMachineHitNear(gridCenter, offsets, box, targetMachine.id)
    if (gridCenterHit) return gridCenterHit

    const projected = await this.simulation.projectMachineWorldToScreen(coord.x, coord.z)
    const projectedHit = await this.findMachineHitNear(projected, offsets, box, targetMachine.id)
    if (projectedHit) return projectedHit

    const primaryInteractionCoord = this.factoryCoordToInteractionCoord(coord, gridSize)
    if (this.isInConfiguredGrid(primaryInteractionCoord, gridSize)) {
      const primary = await this.simulation.gridCellToScreenPos(
        primaryInteractionCoord.x,
        primaryInteractionCoord.z,
        gridSize.width,
        gridSize.height,
      )
      const primaryHit = await this.findMachineHitNear(primary, offsets, box, targetMachine.id)
      if (primaryHit) return primaryHit
    }

    for (let z = 0; z < gridSize.height; z++) {
      for (let x = 0; x < gridSize.width; x++) {
        const candidate = await this.simulation.gridCellToScreenPos(x, z, gridSize.width, gridSize.height)
        const hit = await this.findMachineHitNear(candidate, offsets, box, targetMachine.id)
        if (hit) return hit
      }
    }

    throw new Error(`Could not find rendered machine body hit at (${coord.x}, ${coord.z})`)
  }

  async projectMachineSlotToCanvasPoint(
    coord: GridCoord,
    kind: 'input' | 'output',
    slotIndex: number,
  ): Promise<CanvasPoint> {
    await this.installRecorder()

    const targetMachine = (await this.simulation.getMachines())
      .find((machine) => machine.x === coord.x && machine.z === coord.z)
    if (!targetMachine) {
      throw new Error(`No machine exists at (${coord.x}, ${coord.z})`)
    }

    const slotPos = await this.simulation.getMachineSlotScreenPos(coord.x, coord.z, kind, slotIndex)
    if (!slotPos) {
      throw new Error(`No ${kind} slot mesh at (${coord.x}, ${coord.z}) index ${slotIndex}`)
    }

    const machinePos = await this.simulation.projectMachineWorldToScreen(coord.x, coord.z)
    const direction = this.normalizeCanvasVector({
      x: slotPos.x - machinePos.x,
      y: slotPos.y - machinePos.y,
    })
    const perpendicular = { x: -direction.y, y: direction.x }
    const offsets = [
      { x: 0, y: 0 },
      { x: direction.x * 8, y: direction.y * 8 },
      { x: direction.x * 16, y: direction.y * 16 },
      { x: direction.x * 8 + perpendicular.x * 5, y: direction.y * 8 + perpendicular.y * 5 },
      { x: direction.x * 8 - perpendicular.x * 5, y: direction.y * 8 - perpendicular.y * 5 },
      { x: direction.x * 24, y: direction.y * 24 },
    ]

    const hit = await this.findMachineSlotHitNear(slotPos, offsets, await this.getCanvasBox(), targetMachine.id, kind)
    if (hit) return hit

    throw new Error(`Could not find rendered ${kind} slot hit at (${coord.x}, ${coord.z}) index ${slotIndex}`)
  }

  async expectActiveDragStarted(): Promise<void> {
    const controlsEnabled = await this.page.evaluate(() => {
      const controls = (window as any).__sceneManager?.getControls?.()
      return controls?.enabled ?? true
    })
    expect(controlsEnabled, 'Machine drag must start through the renderer pointer path').toBe(false)
  }

  async readRecordedInteraction(): Promise<RaycastInteractionHit | null> {
    return this.page.evaluate(() => {
      const hit = (window as any).__e2eLastRaycastInteraction
      if (!hit) return null
      return { type: hit.type, machineId: hit.machineId }
    })
  }

  private async installRecorder(): Promise<void> {
    await this.page.evaluate(() => {
      const renderer = (window as any).__getFactoryRenderer?.()
      if (!renderer) throw new Error('Cannot inspect machine body hits before the factory renderer is ready')
      if (renderer.__e2eRaycastInteractionRecorderInstalled) return

      const original = renderer.raycastInteraction.bind(renderer)
      renderer.raycastInteraction = (raycaster: unknown) => {
        const hit = original(raycaster)
        ;(window as any).__e2eLastRaycastInteraction = hit
        return hit
      }
      renderer.__e2eRaycastInteractionRecorderInstalled = true
    })
  }

  private async clearRecordedInteraction(): Promise<void> {
    await this.page.evaluate(() => {
      ;(window as any).__e2eLastRaycastInteraction = null
    })
  }

  private async findMachineHitNear(
    candidate: CanvasPoint,
    offsets: CanvasPoint[],
    box: { x: number; y: number; width: number; height: number },
    machineId: string,
  ): Promise<CanvasPoint | null> {
    return this.findHitNear(candidate, offsets, box, (hit) =>
      hit?.type === 'machine' && hit.machineId === machineId,
    )
  }

  private async findMachineSlotHitNear(
    candidate: CanvasPoint,
    offsets: CanvasPoint[],
    box: { x: number; y: number; width: number; height: number },
    machineId: string,
    kind: 'input' | 'output',
  ): Promise<CanvasPoint | null> {
    return this.findHitNear(candidate, offsets, box, (hit) =>
      hit?.type === kind && hit.machineId === machineId,
    )
  }

  private async findHitNear(
    candidate: CanvasPoint,
    offsets: CanvasPoint[],
    box: { x: number; y: number; width: number; height: number },
    isMatch: (hit: RaycastInteractionHit | null) => boolean,
  ): Promise<CanvasPoint | null> {
    for (const offset of offsets) {
      const point = { x: candidate.x + offset.x, y: candidate.y + offset.y }
      if (point.x < 0 || point.y < 0 || point.x > box.width || point.y > box.height) continue

      await this.clearRecordedInteraction()
      await this.page.mouse.move(box.x + point.x, box.y + point.y)
      const hit = await this.readRecordedInteraction()
      if (isMatch(hit)) return point
    }
    return null
  }

  private async getCanvasBox(): Promise<{ x: number; y: number; width: number; height: number }> {
    return (await this.canvasLocator.boundingBox())!
  }

  private machineBodyScanOffsets(): CanvasPoint[] {
    return [
      { x: 0, y: 0 },
      { x: 0, y: -MACHINE_BODY_HIT_SCAN_OFFSET_PX },
      { x: 0, y: MACHINE_BODY_HIT_SCAN_OFFSET_PX },
      { x: -MACHINE_BODY_HIT_SCAN_OFFSET_PX, y: 0 },
      { x: MACHINE_BODY_HIT_SCAN_OFFSET_PX, y: 0 },
    ]
  }

  private normalizeCanvasVector(vector: CanvasPoint): CanvasPoint {
    const length = Math.hypot(vector.x, vector.y)
    if (length < 1e-6) return { x: 1, y: 0 }
    return { x: vector.x / length, y: vector.y / length }
  }

  private factoryCoordToInteractionCoord(coord: GridCoord, gridSize: GridSize): GridCoord {
    return {
      x: gridSize.width - 1 - coord.x,
      z: coord.z + 1,
    }
  }

  private isInConfiguredGrid(coord: GridCoord, gridSize: GridSize): boolean {
    return coord.x >= 0 && coord.x < gridSize.width &&
      coord.z >= 0 && coord.z < gridSize.height
  }
}