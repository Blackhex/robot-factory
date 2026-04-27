import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'
import type { DragMachinePauseSemantics, GridCoord, GridSize, SimulationRunState } from '../types'
import { DEFAULT_GRID_SIZE } from '../types'
import { FactoryInteractionRecorder } from './FactoryInteractionRecorder'
import { type CanvasPoint, RaycastInteractionProbe } from './RaycastInteractionProbe'
import type { SimulationProbe } from './SimulationProbe'

type DragTiming = {
  preDownMs: number
  holdMs: number
  moveSteps: number
  preUpMs: number
  settleMs: number
}

const DRAG_PRE_DOWN_WAIT_MS = 50
const DRAG_HOLD_WAIT_MS = 150
const DRAG_MOVE_STEPS = 30
const DRAG_PRE_UP_WAIT_MS = 50
const DRAG_SETTLE_WAIT_MS = 500
const DEFAULT_DRAG_TIMING: DragTiming = {
  preDownMs: DRAG_PRE_DOWN_WAIT_MS,
  holdMs: DRAG_HOLD_WAIT_MS,
  moveSteps: DRAG_MOVE_STEPS,
  preUpMs: DRAG_PRE_UP_WAIT_MS,
  settleMs: DRAG_SETTLE_WAIT_MS,
}
const QUICK_MACHINE_DRAG_TIMING: DragTiming = {
  preDownMs: 10,
  holdMs: 20,
  moveSteps: 8,
  preUpMs: 10,
  settleMs: DRAG_SETTLE_WAIT_MS,
}

/**
 * Owns the grid↔pixel projection and exposes domain actions on the
 * Three.js `<canvas>` keyed by grid coordinate. The only place in the POM
 * library that knows about pixel positions for grid cells.
 */
export class FactoryGridPage {
  private readonly page: Page
  private readonly probe: SimulationProbe
  private readonly canvasLocator: Locator
  private readonly raycast: RaycastInteractionProbe
  private readonly recorder: FactoryInteractionRecorder
  private gridSize: GridSize = DEFAULT_GRID_SIZE

  constructor(page: Page, probe: SimulationProbe) {
    this.page = page
    this.probe = probe
    this.canvasLocator = page.locator('#canvas-container canvas')
    this.raycast = new RaycastInteractionProbe(page, this.canvasLocator, probe)
    this.recorder = new FactoryInteractionRecorder(page, this.raycast)
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
    const machines = await this.probe.getMachines()
    const machine = machines
      .find((candidate) => candidate.x === coord.x && candidate.z === coord.z)
    const pos = machine
      ? await this.projectMachineBodyToCanvasPoint(coord)
      : await this.probe.projectGridWorldToScreen(coord.x, coord.z)
    await this.canvasLocator.click({ position: { x: pos.x, y: pos.y } })
    await this.page.waitForTimeout(200)
  }

  async dblClickCell(coord: GridCoord): Promise<void> {
    const pos = await this.probe.projectGridWorldToScreen(coord.x, coord.z)
    await this.canvasLocator.dblclick({ position: { x: pos.x, y: pos.y } })
    await this.page.waitForTimeout(200)
  }

  /** Drag a machine from one cell to another. */
  async dragCell(from: GridCoord, to: GridCoord): Promise<void> {
    await this.dragMachineToCell(from, to)
  }

  /** Drag a machine using the live Three.js camera projection for both endpoints. */
  async dragMachineToCell(from: GridCoord, to: GridCoord): Promise<void> {
    const fromPos = await this.projectMachineBodyToCanvasPoint(from)
    const toPos = await this.probe.projectMachineWorldToScreen(to.x, to.z)
    await this.recorder.startMoveMachineRecording()
    await this.dragBetweenCanvasPoints(fromPos, toPos, QUICK_MACHINE_DRAG_TIMING)
    await this.recorder.expectMoveMachineAttempt(from, to)
  }

  /**
   * Drag a machine to a valid destination and sample simulation pause state
   * while the pointer is still held down at the drop target.
   */
  async dragMachineToCellCapturingPauseSemantics(
    from: GridCoord,
    to: GridCoord,
  ): Promise<DragMachinePauseSemantics> {
    const fromPos = await this.projectMachineBodyToCanvasPoint(from)
    const toPos = await this.probe.projectMachineWorldToScreen(to.x, to.z)
    const box = (await this.canvasLocator.boundingBox())!
    await this.recorder.startMoveMachineRecording()

    await this.page.mouse.move(box.x + fromPos.x, box.y + fromPos.y)
    await this.page.waitForTimeout(DRAG_PRE_DOWN_WAIT_MS)
    const beforeDrag = await this.readSimulationRunState()

    await this.page.mouse.down()
    await this.page.waitForTimeout(DRAG_HOLD_WAIT_MS)
    await this.raycast.expectActiveDragStarted()
    await this.page.mouse.move(box.x + toPos.x, box.y + toPos.y, { steps: DRAG_MOVE_STEPS })
    await this.page.waitForTimeout(DRAG_PRE_UP_WAIT_MS)
    await this.raycast.expectActiveDragStarted()
    const whilePointerHeldAtDestination = await this.readSimulationRunState()

    await this.page.mouse.up()
    await this.page.waitForTimeout(DRAG_SETTLE_WAIT_MS)
    await this.recorder.expectMoveMachineAttempt(from, to)
    const afterDrop = await this.readSimulationRunState()

    return { beforeDrag, whilePointerHeldAtDestination, afterDrop }
  }

  /** Click on an existing machine using its actual world position. */
  async clickMachineAt(coord: GridCoord): Promise<void> {
    const pos = await this.projectMachineBodyToCanvasPoint(coord)
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
    const fromPos = await this.projectMachineSlotToCanvasPoint(from, kind, slotIndex)
    const toPos = await this.projectMachineBodyToCanvasPoint(to)
    await this.recorder.startBeltPlacementRecording()
    await this.dragBetweenCanvasPoints(fromPos, toPos)
    await this.recorder.expectBeltPlacementAttempt(from, to)
  }

  private async dragBetweenCanvasPoints(
    fromPos: CanvasPoint,
    toPos: CanvasPoint,
    timing = DEFAULT_DRAG_TIMING,
  ): Promise<void> {
    const box = (await this.canvasLocator.boundingBox())!
    await this.page.mouse.move(box.x + fromPos.x, box.y + fromPos.y)
    await this.page.waitForTimeout(timing.preDownMs)
    await this.page.mouse.down()
    await this.page.waitForTimeout(timing.holdMs)
    await this.raycast.expectActiveDragStarted()
    await this.page.mouse.move(box.x + toPos.x, box.y + toPos.y, { steps: timing.moveSteps })
    await this.page.waitForTimeout(timing.preUpMs)
    await this.raycast.expectActiveDragStarted()
    await this.page.mouse.up()
    await this.page.waitForTimeout(timing.settleMs)
  }

  private async projectMachineBodyToCanvasPoint(coord: GridCoord): Promise<CanvasPoint> {
    return this.raycast.projectMachineBodyToCanvasPoint(coord, this.gridSize)
  }

  private async projectMachineSlotToCanvasPoint(
    coord: GridCoord,
    kind: 'input' | 'output',
    slotIndex: number,
  ): Promise<CanvasPoint> {
    return this.raycast.projectMachineSlotToCanvasPoint(coord, kind, slotIndex)
  }

  private async readSimulationRunState(): Promise<SimulationRunState> {
    return {
      running: await this.probe.isRunning(),
      paused: await this.probe.isPaused(),
    }
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
