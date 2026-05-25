import type { GridPosition, MachineType, MachineInfo, BeltInfo, Direction, SlotPosition } from './types'
import type { GridReader } from './GridReader'
import { BeltRouter } from './BeltRouter'
import { slotPositionToOffset } from './SlotUtils'
import { PlacementPlanner } from './PlacementPlanner'
import { FactorySimulationSync } from './FactorySimulationSync'
import { FactoryQueries } from './FactoryQueries'
import { restoreFactoryState } from './FactoryStateRestorer'
import { ConnectedBeltEditOrchestrator } from './ConnectedBeltEditOrchestrator'
import { FactoryBeltPlacement } from './FactoryBeltPlacement'
import { FactoryBeltRegistry } from './FactoryBeltRegistry'
import { FactoryMachineMover } from './FactoryMachineMover'
import { FactoryMachineRegistry } from './FactoryMachineRegistry'
import type { FactorySimulationLike } from './FactorySimulationSync'
import type { FactoryGridCell } from './FactoryQueries'
import type { ComputeBeltFromSlotPathOptions, PlaceBeltChainOptions } from './FactoryBeltPlacement'
import type { MachineNameGenerator } from './FactoryMachineRegistry'

export type { SlotPositions, MachineInfo, BeltInfo } from './types'
export type { GridReader } from './GridReader'
export type { ComputeBeltFromSlotPathOptions, PlaceBeltChainOptions } from './FactoryBeltPlacement'
export type { MachineNameGenerator } from './FactoryMachineRegistry'
export { getSlotPositions, slotPositionToOffset, pickBestSlotOffset, directionToDegrees, degreesToDirection, rotateDirectionCW } from './SlotUtils'
export { hasLShapeAtEndpoints } from './BeltRouter'

export class Factory implements GridReader {
  readonly width: number
  readonly height: number
  private grid: FactoryGridCell[][]
  private machines: Map<string, MachineInfo> = new Map()
  private belts: Map<string, BeltInfo> = new Map()
  private readonly router: BeltRouter
  private readonly planner: PlacementPlanner
  private readonly queries: FactoryQueries
  private readonly connectedBeltEditor: ConnectedBeltEditOrchestrator
  private readonly machineRegistry: FactoryMachineRegistry
  private readonly beltRegistry: FactoryBeltRegistry
  private readonly beltPlacement: FactoryBeltPlacement
  private readonly machineMover: FactoryMachineMover
  private readonly simulationSync = new FactorySimulationSync()
  private _slotBlockingEnabled = true

  constructor(width = 20, height = 20, options?: { nameGenerator?: MachineNameGenerator }) {
    this.width = width
    this.height = height
    this.grid = []
    for (let x = 0; x < width; x++) {
      this.grid[x] = []
      for (let z = 0; z < height; z++) {
        this.grid[x][z] = { x, z, machine: null, beltIds: [] }
      }
    }
    this.queries = new FactoryQueries({ width: this.width, height: this.height, grid: this.grid, machines: this.machines, belts: this.belts })
    this.machineRegistry = new FactoryMachineRegistry(
      { grid: this.grid, machines: this.machines },
      {
        isInBounds: (x, z) => this.isInBounds(x, z),
        isSlotBlockingEnabled: () => this._slotBlockingEnabled,
      },
      this.queries,
      { nameGenerator: options?.nameGenerator },
    )
    this.router = new BeltRouter(this)
    this.planner = new PlacementPlanner(this, this.router)
    this.beltRegistry = new FactoryBeltRegistry(
      { grid: this.grid, belts: this.belts },
      {
        isInBounds: (x, z) => this.isInBounds(x, z),
        beginEdit: () => this.beginEdit(),
        endEdit: () => this.endEdit(),
      },
      this.simulationSync,
    )
    this.beltPlacement = new FactoryBeltPlacement({
      isInBounds: (x, z) => this.isInBounds(x, z),
      hasBeltSegment: (from, to, ignoreBeltIds) => this.hasBeltSegment(from, to, ignoreBeltIds),
      isSlotFree: (machine, slotOffset) => this.isSlotFree(machine, slotOffset),
      getMachineAt: (x, z) => this.getMachineAt(x, z),
      setMachineRotation: (x, z, rotation) => this.setMachineRotation(x, z, rotation),
      nextBeltId: () => this.beltRegistry.nextBeltId(),
      nextBeltName: () => this.beltRegistry.nextBeltName(),
      registerBelt: (belt) => this.beltRegistry.registerBelt(belt),
    }, this.planner, this.queries)
    this.connectedBeltEditor = new ConnectedBeltEditOrchestrator({
      getConnectedBeltInfos: (machineId) => this.queries.getConnectedBeltInfos(machineId),
      removeBeltById: (beltId) => this.removeBeltById(beltId),
      placeBeltChain: (from, to, sourceSlotType, opts) => this.placeBeltChain(from, to, sourceSlotType, opts),
      setMachineRotation: (x, z, rotation) => this.setMachineRotation(x, z, rotation),
      isSlotBlocked: (x, z, type, rotation, excludeId) => this.isSlotBlocked(x, z, type, rotation, excludeId),
      isUnrelatedMachineOutputSlotCell: (cell, sourceMachineId, destinationMachineId) =>
        this.isUnrelatedMachineOutputSlotCell(cell, sourceMachineId, destinationMachineId),
      hasBeltCrossings: () => this.hasBeltCrossings(),
    })
    this.machineMover = new FactoryMachineMover(
      { width: this.width, height: this.height, grid: this.grid, belts: this.belts },
      {
        isInBounds: (x, z) => this.isInBounds(x, z),
        isSlotBlocked: (x, z, type, rotation, excludeId) => this.isSlotBlocked(x, z, type, rotation, excludeId),
        beginEdit: () => this.beginEdit(),
        endEdit: () => this.endEdit(),
        removeBeltById: (beltId) => this.removeBeltById(beltId),
      },
      this.queries,
      this.connectedBeltEditor,
      this.simulationSync,
    )
  }

  // ─── GridReader implementation ──────────────────────────

  isInBounds(x: number, z: number): boolean {
    return this.queries.isInBounds(x, z)
  }

  getMachineAt(x: number, z: number): MachineInfo | null {
    return this.queries.getMachineAt(x, z)
  }

  getBeltsAt(x: number, z: number): ReadonlyArray<BeltInfo> {
    return this.queries.getBeltsAt(x, z)
  }

  private isUnrelatedMachineOutputSlotCell(
    cell: GridPosition,
    sourceMachineId: string,
    destinationMachineId: string,
  ): boolean {
    for (const machine of this.machines.values()) {
      if (machine.id === sourceMachineId || machine.id === destinationMachineId) continue
      for (const slot of machine.slots.outputs) {
        const offset = slotPositionToOffset(slot, machine.rotation)
        if (machine.x + offset.x === cell.x && machine.z + offset.z === cell.z) return true
      }
    }
    return false
  }

  hasBeltSegment(from: GridPosition, to: GridPosition, ignoreBeltIds?: ReadonlySet<string>): boolean {
    return this.queries.hasBeltSegment(from, to, ignoreBeltIds)
  }

  isSlotFree(machine: MachineInfo, slotOffset: GridPosition): boolean {
    return this.queries.isSlotFree(machine, slotOffset)
  }

  getFreeSlotsOfType(machine: MachineInfo, slotType: 'input' | 'output', ignoreBeltIds?: ReadonlySet<string>): GridPosition[] {
    return this.queries.getFreeSlotsOfType(machine, slotType, ignoreBeltIds)
  }

  machineHasAnyBelts(x: number, z: number): boolean {
    return this.queries.machineHasAnyBelts(x, z)
  }

  // ─── Internal helpers ─────────────────────────────────

  /**
   * Attach a {@link Simulation} so subsequent factory edits keep
   * the sim's per-cell belt segments in sync with `BeltInfo.path`s.
   * Idempotent — pass the same sim twice is a no-op. Pass `null` to detach.
   *
  * Items currently on a sim segment whose backing belt is removed during an
  * edit are retained until `endEdit()`, then restored only onto a replacement
  * belt with the same source, destination, and exact slot identity.
   */
  attachSimulation(sim: FactorySimulationLike | null): void {
    this.simulationSync.attachSimulation(sim)
  }

  /**
  * Begin an atomic edit. Multiple belt removals/placements that happen
  * inside `beginEdit() … endEdit()` see the migration as a single boundary;
  * retained belt items are not restored until the OUTERMOST `endEdit()` runs.
   * Public mutating methods (`removeBeltById`, `placeBeltChain`, `placeBelt`,
   * `moveMachine`, `rotateMachine`, `removeMachine`) bracket themselves with
   * these so external callers don't need to.
   */
  private beginEdit(): void {
    this.simulationSync.beginEdit()
  }

  private endEdit(): void {
    this.simulationSync.endEdit(this.belts.values())
  }

  removeBeltById(beltId: string): boolean {
    return this.beltRegistry.removeBeltById(beltId)
  }

  private setMachineRotation(x: number, z: number, rotation: Direction): void {
    this.machineRegistry.setMachineRotation(x, z, rotation)
  }

  renameMachine(x: number, z: number, name: string): boolean {
    return this.machineRegistry.renameMachine(x, z, name)
  }

  relocalizeAutoNames(generator: MachineNameGenerator): void {
    this.machineRegistry.relocalizeAutoNames(generator)
  }

  renameBelt(beltId: string, name: string): boolean {
    return this.beltRegistry.renameBelt(beltId, name)
  }

  // ─── Slot-blocking constraint ──────────────────────────

  private isSlotBlocked(x: number, z: number, type: MachineType, rotation: Direction, excludeId?: string): boolean {
    return this.machineRegistry.isSlotBlocked(x, z, type, rotation, excludeId)
  }

  // ─── Machine CRUD ──────────────────────────────────────

  placeMachine(x: number, z: number, type: MachineType, rotation: Direction): MachineInfo | null {
    return this.machineRegistry.placeMachine(x, z, type, rotation)
  }

  rotateMachine(machine: MachineInfo, rotation: Direction): boolean {
    const { x, z } = machine
    if (this.grid[x]?.[z]?.machine !== machine) return false

    this.beginEdit()
    try {
      return this.connectedBeltEditor.rotateMachine(machine, rotation)
    } finally {
      this.endEdit()
    }
  }

  removeMachine(x: number, z: number): boolean {
    if (!this.isInBounds(x, z)) return false
    const cell = this.grid[x][z]
    if (cell.machine === null) return false

    this.beginEdit()
    try {
      this.connectedBeltEditor.removeConnectedBelts(cell.machine.id)

      this.machines.delete(cell.machine.id)
      cell.machine = null
      return true
    } finally {
      this.endEdit()
    }
  }

  canMoveMachine(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    return this.machineMover.canMoveMachine(fromX, fromZ, toX, toZ)
  }

  moveMachine(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    return this.machineMover.moveMachine(fromX, fromZ, toX, toZ)
  }

  updateMachineType(x: number, z: number, newType: MachineType): boolean {
    return this.machineRegistry.updateMachineType(x, z, newType)
  }

  // ─── Belt CRUD ─────────────────────────────────────────

  /**
   * Place a validated belt between two machines using explicit slot offsets.
   * Validates that slots are valid I/O for their machine, slots are free,
   * and the resulting slot cells are adjacent (or the same cell).
   */
  placeBelt(
    sourceMachine: MachineInfo,
    sourceSlot: GridPosition,
    destinationMachine: MachineInfo,
    destinationSlot: GridPosition,
  ): boolean {
    return this.beltPlacement.placeBelt(sourceMachine, sourceSlot, destinationMachine, destinationSlot)
  }

  // ─── Queries ───────────────────────────────────────────

  getBelts(): ReadonlyArray<BeltInfo> {
    return this.queries.getBelts()
  }

  getMachines(): ReadonlyArray<MachineInfo> {
    return this.queries.getMachines()
  }

  getMachineById(id: string): MachineInfo | null {
    return this.queries.getMachineById(id)
  }

  getConnectedBeltIds(x: number, z: number): Set<string> {
    return this.queries.getConnectedBeltIds(x, z)
  }

  getConnectedMachines(x: number, z: number): Array<{ position: GridPosition, machineIsSource: boolean }> {
    return this.queries.getConnectedMachines(x, z)
  }

  // ─── Belt chain facade ────────────────────────────────

  /**
   * Place a chain of belt segments connecting the `from` machine's slot of
   * type `sourceSlotType` to a complementary slot on the `to` machine.
   *
   * When `opts.tryReverseSlotType` is true, the planner falls back to placing
   * the belt in the opposite direction (source↔target swapped, slot type
   * flipped) ONLY if the target has no free slot of the requested
   * complementary type. Used for explicit-slot drags from the UI. Defaults
   * to `false`.
   */
  placeBeltChain(from: MachineInfo, to: MachineInfo, sourceSlotType: 'input' | 'output' = 'output', opts?: PlaceBeltChainOptions): boolean {
    this.beginEdit()
    try {
      return this.beltPlacement.placeBeltChain(from, to, sourceSlotType, opts)
    } finally {
      this.endEdit()
    }
  }

  /**
   * Compute the belt path (without committing) that `placeBeltChain` would use
   * between two machines. Used for ghost preview during drag.
   *
   * When `opts.tryReverseSlotType` is true, the planner falls back to placing
   * the belt in the opposite direction (source↔target swapped, slot type
   * flipped) ONLY if the target has no free slot of the requested
   * complementary type. Used for explicit-slot drags from the UI. Defaults
   * to `false`.
   */
  computeBeltFromSlotPath(
    from: GridPosition, to: GridPosition,
    sourceSlotType: 'input' | 'output',
    opts?: ComputeBeltFromSlotPathOptions,
  ): { path: GridPosition[], collides: boolean } | null {
    return this.beltPlacement.computeBeltFromSlotPath(from, to, sourceSlotType, opts)
  }

  findBestBeltPath(
    from: GridPosition,
    to: GridPosition,
    ignoreBeltIds?: ReadonlySet<string>,
    requiredFirstDir?: GridPosition,
    requiredLastDir?: GridPosition,
  ): { path: GridPosition[], collides: boolean } {
    return this.router.findBestBeltPath(from, to, ignoreBeltIds, requiredFirstDir, requiredLastDir)
  }

  resolveTargetSlot(sourceMachinePos: GridPosition, targetMachine: MachineInfo, sourceSlotType: 'input' | 'output'): GridPosition | null {
    return this.planner.resolveTargetSlot(sourceMachinePos, targetMachine, sourceSlotType)
  }

  /**
   * Compute the belt path that reconnectChains would use for a given chain,
   * without actually placing anything. Used for ghost preview during drag.
   */
  computeReconnectPath(
    mx: number, mz: number,
    machineType: MachineType, rotation: Direction,
    otherEnd: GridPosition, machineIsSource: boolean,
    ignoreBeltIds?: ReadonlySet<string>,
    extraBlockedCells?: ReadonlySet<string>,
  ): { path: GridPosition[], collides: boolean } | null {
    return this.planner.computeReconnectPath(mx, mz, machineType, rotation, otherEnd, machineIsSource, ignoreBeltIds, extraBlockedCells)
  }

  // ─── Bulk restore (for deserialization) ────────────────

  restoreState(
    machines: ReadonlyArray<{ x: number; z: number; type: MachineType; rotation: Direction; name?: string }>,
    belts: ReadonlyArray<{ sourceSlot: SlotPosition; destinationSlot: SlotPosition; path: GridPosition[]; name?: string }>,
  ): void {
    restoreFactoryState({
      getSlotBlockingEnabled: () => this._slotBlockingEnabled,
      setSlotBlockingEnabled: (enabled) => { this._slotBlockingEnabled = enabled },
      placeMachine: (x, z, type, rotation) => this.placeMachine(x, z, type, rotation),
      renameMachine: (x, z, name) => this.renameMachine(x, z, name),
      getMachineAt: (x, z) => this.getMachineAt(x, z),
      registerRestoredBelt: (restoredBelt) => {
        const belt: BeltInfo = {
          id: this.beltRegistry.nextBeltId(),
          name: restoredBelt.name ?? this.beltRegistry.nextBeltName(),
          sourceMachine: restoredBelt.sourceMachine,
          sourceSlot: restoredBelt.sourceSlot,
          destinationMachine: restoredBelt.destinationMachine,
          destinationSlot: restoredBelt.destinationSlot,
          path: restoredBelt.path,
        }
        this.beltRegistry.registerBelt(belt)
      },
    }, machines, belts)
  }

  clear(): void {
    this.machines.clear()
    this.belts.clear()
    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.height; z++) {
        this.grid[x][z] = { x, z, machine: null, beltIds: [] }
      }
    }
  }

  // ─── Private helpers ───────────────────────────────────

  cellHasBeltsExcluding(x: number, z: number, ignoreBeltIds?: ReadonlySet<string>): boolean {
    return this.queries.cellHasBeltsExcluding(x, z, ignoreBeltIds)
  }

  /** Check whether any two belts share intermediate cells (crossing paths). */
  private hasBeltCrossings(): boolean {
    return this.machineMover.hasBeltCrossings()
  }
}
