import type { Page } from '@playwright/test'
import type {
  BeltClearInspection,
  BeltHighlightInspection,
  BeltItemSnapshot,
  BeltMeshInspection,
  BeltPathSegment,
  ItemInstancePositions,
  MachineInfo,
  OutputDeliveryRecorderState,
  OutputDeliverySnapshot,
  SceneItemMeshes,
  SimSnapshot,
} from '../types'
import { BeltItemProbe } from './probes/BeltItemProbe'
import { DirectFactoryProbe } from './probes/DirectFactoryProbe'
import { ItemInstanceProbe } from './probes/ItemInstanceProbe'
import { OutputDeliveryProbe } from './probes/OutputDeliveryProbe'
import { ProjectionProbe } from './probes/ProjectionProbe'
import { RenderingProbe } from './probes/RenderingProbe'
import { SimulationStateProbe } from './probes/SimulationStateProbe'
import { TimingProbe } from './probes/TimingProbe'

/**
 * Stable facade for runtime simulation probing from E2E Page Objects.
 * Focused helper probes own the actual page bridges; this facade preserves
 * the existing public POM API used by specs and canvas objects.
 */
export class SimulationProbe {
  private readonly simulation: SimulationStateProbe
  private readonly beltItems: BeltItemProbe
  private readonly outputDelivery: OutputDeliveryProbe
  private readonly itemInstances: ItemInstanceProbe
  private readonly rendering: RenderingProbe
  private readonly projection: ProjectionProbe
  private readonly directFactory: DirectFactoryProbe
  private readonly timing: TimingProbe

  constructor(page: Page) {
    this.simulation = new SimulationStateProbe(page)
    this.beltItems = new BeltItemProbe(page)
    this.outputDelivery = new OutputDeliveryProbe(page)
    this.itemInstances = new ItemInstanceProbe(page)
    this.rendering = new RenderingProbe(page, this.itemInstances, this.simulation)
    this.projection = new ProjectionProbe(page)
    this.directFactory = new DirectFactoryProbe(page)
    this.timing = new TimingProbe(page)
  }

  async isRunning(): Promise<boolean> { return this.simulation.isRunning() }

  async isPaused(): Promise<boolean> { return this.simulation.isPaused() }

  async getGameState(): Promise<string> { return this.simulation.getGameState() }

  async expectGameState(expected: string, timeoutMs?: number): Promise<void> {
    return this.simulation.expectGameState(expected, timeoutMs)
  }

  async getMachines(): Promise<MachineInfo[]> { return this.simulation.getMachines() }

  async getMachineCount(): Promise<number> { return this.simulation.getMachineCount() }

  async getMachineCountFromFactory(): Promise<number> {
    return this.simulation.getMachineCountFromFactory()
  }

  async getBeltCount(): Promise<number> { return this.simulation.getBeltCount() }

  async getBeltCountFromFactory(): Promise<number> {
    return this.simulation.getBeltCountFromFactory()
  }

  async getFirstMachineDisplayName(): Promise<string> {
    return this.simulation.getFirstMachineDisplayName()
  }

  async readSnapshot(): Promise<SimSnapshot> { return this.simulation.readSnapshot() }

  async readDiagnosticSnapshot(): Promise<any> {
    return (this.simulation as any).readDiagnosticSnapshot()
  }

  async readSimItemIdsPerBelt(): Promise<string[][]> {
    return this.simulation.readSimItemIdsPerBelt()
  }

  async readSimItemsByCellKey(): Promise<
    Array<{ cellKey: string; items: Array<{ id: string; position: number }> }>
  > {
    return this.simulation.readSimItemsByCellKey()
  }

  async readBeltPathSegments(): Promise<BeltPathSegment[]> {
    return this.simulation.readBeltPathSegments()
  }

  async expectCurrentBeltPathHasSegments(message: string): Promise<void> {
    return this.simulation.expectCurrentBeltPathHasSegments(message)
  }

  async readBeltItems(): Promise<BeltItemSnapshot[]> { return this.beltItems.readBeltItems() }

  async waitForBeltItem(options?: {
    itemId?: string
    minPositionOnBelt?: number
    maxPositionOnBelt?: number
    timeoutMs?: number
  }): Promise<BeltItemSnapshot> {
    return this.beltItems.waitForBeltItem(options)
  }

  async startOutputDeliveryRecording(): Promise<void> {
    return this.outputDelivery.startOutputDeliveryRecording()
  }

  async resetOutputDeliveryRecording(): Promise<void> {
    return this.outputDelivery.resetOutputDeliveryRecording()
  }

  async readOutputDeliveryRecorderState(): Promise<OutputDeliveryRecorderState> {
    return this.outputDelivery.readOutputDeliveryRecorderState()
  }

  async readOutputDeliveries(): Promise<OutputDeliverySnapshot[]> {
    return this.outputDelivery.readOutputDeliveries()
  }

  async waitForOutputDelivery(
    itemId: string,
    machineId: string,
    timeoutMs = 30000,
  ): Promise<OutputDeliverySnapshot> {
    return this.outputDelivery.waitForOutputDelivery(itemId, machineId, timeoutMs)
  }

  async inspectBeltMeshes(): Promise<BeltMeshInspection | null> {
    return this.rendering.inspectBeltMeshes()
  }

  async getBeltMeshCounts(): Promise<{ mapSize: number; sceneMeshCount: number } | null> {
    return this.rendering.getBeltMeshCounts()
  }

  async getOverlappingMeshesPerBeltCell(tolerance?: number): Promise<Array<{
    cellKey: string
    cellX: number
    cellZ: number
    worldX: number
    worldZ: number
    visibleMeshCount: number
    invisibleMeshCount: number
  }> | null> {
    return this.rendering.getOverlappingMeshesPerBeltCell(tolerance)
  }

  async inspectCornerHighlights(): Promise<BeltClearInspection[] | null> {
    return this.rendering.inspectCornerHighlights()
  }

  async highlightAllBeltsAndInspectCorners(): Promise<BeltHighlightInspection | null> {
    return this.rendering.highlightAllBeltsAndInspectCorners()
  }

  async clearBeltHighlightAndInspectCorners(): Promise<BeltClearInspection[] | null> {
    return this.rendering.clearBeltHighlightAndInspectCorners()
  }

  async readSceneItemMeshes(): Promise<SceneItemMeshes> {
    return this.rendering.readSceneItemMeshes()
  }

  async readItemInstancePositions(): Promise<ItemInstancePositions> {
    return this.rendering.readItemInstancePositions()
  }

  async capturePositionsAcrossPause(): Promise<{
    before: ItemInstancePositions
    after: ItemInstancePositions
  }> {
    return this.rendering.capturePositionsAcrossPause()
  }

  async expectRenderedItemsOnCurrentBeltPath(options?: {
    context?: string
    tolerance?: number
  }): Promise<void> {
    return this.rendering.expectRenderedItemsOnCurrentBeltPath(options)
  }

  async forceRendererUpdate(): Promise<void> { return this.rendering.forceRendererUpdate() }

  async getHighlightedMachineId(): Promise<string | null> {
    return this.rendering.getHighlightedMachineId()
  }

  async syncRendererToCanvasSize(): Promise<void> {
    return this.rendering.syncRendererToCanvasSize()
  }

  async gridCellToScreenPos(
    gx: number,
    gz: number,
    gridW: number,
    gridH: number,
  ): Promise<{ x: number; y: number }> {
    return this.projection.gridCellToScreenPos(gx, gz, gridW, gridH)
  }

  async projectMachineWorldToScreen(gx: number, gz: number): Promise<{ x: number; y: number }> {
    return this.projection.projectMachineWorldToScreen(gx, gz)
  }

  async projectGridWorldToScreen(gx: number, gz: number): Promise<{ x: number; y: number }> {
    return this.projection.projectGridWorldToScreen(gx, gz)
  }

  async projectMidBeltMeshToScreen(): Promise<{ x: number; y: number }> {
    return this.projection.projectMidBeltMeshToScreen()
  }

  async getMachineSlotScreenPos(
    x: number,
    z: number,
    kind: 'input' | 'output',
    slotIndex = 0,
  ): Promise<{ x: number; y: number } | null> {
    return this.projection.getMachineSlotScreenPos(x, z, kind, slotIndex)
  }

  async getAllMachineScreenPositions(): Promise<Array<{
    id: string
    type: string
    gridX: number
    gridZ: number
    x: number
    y: number
  }>> {
    return this.projection.getAllMachineScreenPositions()
  }

  async flushAnimationFrame(): Promise<void> { return this.timing.flushAnimationFrame() }

  async settle(ms: number): Promise<void> { return this.timing.settle(ms) }

  async placeBeltViaTestApi(
    sx: number,
    sz: number,
    dx: number,
    dz: number,
  ): Promise<boolean> {
    return this.directFactory.placeBeltViaTestApi(sx, sz, dx, dz)
  }

  async placeBeltChainViaFactory(): Promise<{
    placed: boolean
    beltCount: number
    machineA: { x: number; z: number }
    machineB: { x: number; z: number }
  } | null> {
    return this.directFactory.placeBeltChainViaFactory()
  }

  async placeBeltChainViaFactoryUsingMachineRefs(): Promise<{
    placed: boolean
    beltCount: number
    machineA: { x: number; z: number }
    machineB: { x: number; z: number }
  } | null> {
    return this.directFactory.placeBeltChainViaFactoryUsingMachineRefs()
  }

  async placeMachineDirect(x: number, z: number, type: string): Promise<boolean> {
    return this.directFactory.placeMachineDirect(x, z, type)
  }

  async setMachineRotationDirect(x: number, z: number, rotation: string): Promise<boolean> {
    return this.directFactory.setMachineRotationDirect(x, z, rotation)
  }

  async rotateMachineDirect(x: number, z: number, rotation: string): Promise<boolean> {
    return this.directFactory.rotateMachineDirect(x, z, rotation)
  }

  async removeFirstBeltDirect(): Promise<boolean> {
    return this.directFactory.removeFirstBeltDirect()
  }

  async moveMachineDirect(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
  ): Promise<boolean> {
    return this.directFactory.moveMachineDirect(fromX, fromZ, toX, toZ)
  }

  async getMachineRotation(x: number, z: number): Promise<string | null> {
    return this.directFactory.getMachineRotation(x, z)
  }

  async placeBeltChainBetween(
    sx: number,
    sz: number,
    dx: number,
    dz: number,
  ): Promise<boolean> {
    return this.directFactory.placeBeltChainBetween(sx, sz, dx, dz)
  }

  async getBeltsDetailed(): Promise<Array<{
    id: string
    sourceX: number; sourceZ: number; sourceSlot: string
    destX: number; destZ: number; destSlot: string
  }>> {
    return this.directFactory.getBeltsDetailed()
  }
}
