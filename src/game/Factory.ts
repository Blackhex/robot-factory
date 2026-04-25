import type { GridPosition, MachineType, MachineInfo, BeltInfo, Direction, SlotPosition } from './types'
import { getSlotPositions, slotPositionToOffset, offsetToSlotPosition, rotateDirectionCW } from './SlotUtils'
import { machineSlotPointsAtNeighbor } from './SlotBlocking'
import { BeltRouter } from './BeltRouter'
import { PlacementPlanner } from './PlacementPlanner'

/**
 * Options bag for {@link Factory.placeBeltChain}. All fields optional.
 */
export interface PlaceBeltChainOptions {
  fixedRotations?: boolean
  lockedMachinePos?: GridPosition
  ignoreBeltIds?: ReadonlySet<string>
  targetSlotPosition?: SlotPosition
  sourceSlotPosition?: SlotPosition
  /**
   * When true, the planner falls back to placing the belt in the opposite
   * direction (source↔target swapped, slot type flipped) ONLY if the target
   * has no free slot of the requested complementary type. Used for
   * explicit-slot drags from the UI. Defaults to `false`.
   */
  tryReverseSlotType?: boolean
}

/**
 * Options bag for {@link Factory.computeBeltFromSlotPath}. All fields optional.
 */
export interface ComputeBeltFromSlotPathOptions {
  ignoreBeltIds?: ReadonlySet<string>
  fixedRotations?: boolean
  targetSlotPosition?: SlotPosition
  sourceSlotPosition?: SlotPosition
  /**
   * When true, the planner falls back to placing the belt in the opposite
   * direction (source↔target swapped, slot type flipped) ONLY if the target
   * has no free slot of the requested complementary type. Used for
   * explicit-slot drags from the UI. Defaults to `false`.
   */
  tryReverseSlotType?: boolean
}

// Re-export for backward compatibility
export type { SlotPositions, MachineInfo, BeltInfo } from './types'
export { getSlotPositions, slotPositionToOffset, pickBestSlotOffset, directionToDegrees, degreesToDirection, rotateDirectionCW } from './SlotUtils'
export { hasLShapeAtEndpoints } from './BeltRouter'

/** Read-only interface for querying factory grid state. */
export interface GridReader {
  readonly width: number
  readonly height: number
  isInBounds(x: number, z: number): boolean
  getMachineAt(x: number, z: number): MachineInfo | null
  getBeltsAt(x: number, z: number): ReadonlyArray<BeltInfo>
  hasBeltSegment(from: GridPosition, to: GridPosition, ignoreBeltIds?: ReadonlySet<string>): boolean
  isSlotFree(machine: MachineInfo, slotOffset: GridPosition): boolean
  getFreeSlotsOfType(machine: MachineInfo, slotType: 'input' | 'output', ignoreBeltIds?: ReadonlySet<string>): GridPosition[]
  cellHasBeltsExcluding(x: number, z: number, ignoreBeltIds?: ReadonlySet<string>): boolean
  machineHasAnyBelts(x: number, z: number): boolean
}

interface GridCell {
  x: number
  z: number
  machine: MachineInfo | null
  beltIds: string[]
}

export class Factory implements GridReader {
  readonly width: number
  readonly height: number
  private grid: GridCell[][]
  private machines: Map<string, MachineInfo> = new Map()
  private belts: Map<string, BeltInfo> = new Map()
  private nextMachineId = 1
  private nextBeltId = 1
  private nextBeltNameNumber = 1
  private machineNameCounters: Map<MachineType, number> = new Map()
  private readonly router: BeltRouter
  private readonly planner: PlacementPlanner
  private _slotBlockingEnabled = true

  constructor(width = 20, height = 20) {
    this.width = width
    this.height = height
    this.grid = []
    for (let x = 0; x < width; x++) {
      this.grid[x] = []
      for (let z = 0; z < height; z++) {
        this.grid[x][z] = { x, z, machine: null, beltIds: [] }
      }
    }
    this.router = new BeltRouter(this)
    this.planner = new PlacementPlanner(this, this.router)
  }

  // ─── GridReader implementation ──────────────────────────

  isInBounds(x: number, z: number): boolean {
    return x >= 0 && x < this.width && z >= 0 && z < this.height
  }

  getMachineAt(x: number, z: number): MachineInfo | null {
    if (!this.isInBounds(x, z)) return null
    return this.grid[x][z].machine
  }

  getBeltsAt(x: number, z: number): ReadonlyArray<BeltInfo> {
    if (!this.isInBounds(x, z)) return []
    return this.grid[x][z].beltIds
      .map((id) => this.belts.get(id))
      .filter((b): b is BeltInfo => b !== undefined)
  }

  hasBeltSegment(from: GridPosition, to: GridPosition, ignoreBeltIds?: ReadonlySet<string>): boolean {
    const belts = this.getBeltsAt(from.x, from.z)
    for (const belt of belts) {
      if (ignoreBeltIds?.has(belt.id)) continue
      for (let i = 0; i < belt.path.length - 1; i++) {
        if (belt.path[i].x === from.x && belt.path[i].z === from.z &&
          belt.path[i + 1].x === to.x && belt.path[i + 1].z === to.z) return true
      }
    }
    return false
  }

  isSlotFree(machine: MachineInfo, slotOffset: GridPosition): boolean {
    return this.isSlotFreeExcluding(machine, slotOffset)
  }

  getFreeSlotsOfType(machine: MachineInfo, slotType: 'input' | 'output', ignoreBeltIds?: ReadonlySet<string>): GridPosition[] {
    return this.getFreeSlotsOfTypeExcluding(machine, slotType, ignoreBeltIds)
  }

  machineHasAnyBelts(x: number, z: number): boolean {
    if (!this.isInBounds(x, z)) return false
    const machine = this.getMachineAt(x, z)
    if (!machine) return false
    for (const beltId of this.grid[x][z].beltIds) {
      const belt = this.belts.get(beltId)
      if (belt && (belt.sourceMachine.id === machine.id || belt.destinationMachine.id === machine.id)) return true
    }
    return false
  }

  // ─── Internal helpers ─────────────────────────────────

  removeBeltById(beltId: string): boolean {
    const belt = this.belts.get(beltId)
    if (!belt) return false
    this.belts.delete(beltId)
    for (const cell of belt.path) {
      if (this.isInBounds(cell.x, cell.z)) {
        this.removeBeltIdFromCell(cell.x, cell.z, beltId)
      }
    }
    return true
  }

  private setMachineRotation(x: number, z: number, rotation: Direction): void {
    const machine = this.grid[x]?.[z]?.machine
    if (machine) {
      ; (machine as { rotation: Direction }).rotation = rotation
    }
  }

  renameMachine(x: number, z: number, name: string): boolean {
    const machine = this.grid[x]?.[z]?.machine
    if (!machine) return false
      ; (machine as { name: string }).name = name
    return true
  }

  renameBelt(beltId: string, name: string): boolean {
    const belt = this.belts.get(beltId)
    if (!belt) return false
      ; (belt as { name: string }).name = name
    return true
  }

  // ─── Slot-blocking constraint ──────────────────────────

  /**
   * Check whether placing a machine at (x, z) of given type/rotation would
   * violate the slot-blocking constraint:
   * 1. (x,z) is directly in front of a slot of an existing neighbor
   * 2. The new machine's own slots would point at an existing neighbor
   */
  private isSlotBlocked(x: number, z: number, type: MachineType, rotation: Direction, excludeId?: string): boolean {

    // Direction 1: check if (x,z) is in any slot position of nearby machines
    const neighbors: GridPosition[] = [
      { x: x - 1, z }, { x: x + 1, z },
      { x, z: z - 1 }, { x, z: z + 1 },
    ]
    for (const nPos of neighbors) {
      const neighbor = this.getMachineAt(nPos.x, nPos.z)
      if (!neighbor || neighbor.id === excludeId) continue
      const nSlots = neighbor.slots
      const allSlotPositions = [...nSlots.inputs, ...nSlots.outputs]
      for (const sp of allSlotPositions) {
        const offset = slotPositionToOffset(sp, neighbor.rotation)
        if (nPos.x + offset.x === x && nPos.z + offset.z === z) return true
      }
    }

    // Direction 2: check if the new machine's own slots point at existing
    // machines. Delegated to the shared `machineSlotPointsAtNeighbor` helper
    // so this enforcement and the planner's candidate-rotation filter in
    // `PlacementPlanner.computePlacementPlan` cannot drift apart.
    if (machineSlotPointsAtNeighbor(
      { x, z, rotation, slots: getSlotPositions(type), id: excludeId },
      (gx, gz) => this.getMachineAt(gx, gz),
    )) return true

    return false
  }

  // ─── Machine CRUD ──────────────────────────────────────

  placeMachine(x: number, z: number, type: MachineType, rotation: Direction): MachineInfo | null {
    if (!this.isInBounds(x, z)) return null
    if (this.grid[x][z].machine !== null) return null
    if (this._slotBlockingEnabled && this.isSlotBlocked(x, z, type, rotation)) return null

    const id = `machine_${this.nextMachineId++}`
    const name = this.generateMachineName(type)
    const machine: MachineInfo = { id, name, type, x, z, rotation, slots: getSlotPositions(type) }
    this.grid[x][z].machine = machine
    this.machines.set(id, machine)
    return machine
  }

  rotateMachine(machine: MachineInfo, rotation: Direction): boolean {
    const { x, z } = machine
    if (this.grid[x]?.[z]?.machine !== machine) return false

    const originalRotation = machine.rotation
    const connectedBelts = this.getConnectedBeltInfos(machine.id)

    // Try requested rotation, then CW iterations
    let candidate = rotation
    for (let attempts = 0; attempts < 4; attempts++) {
      if (this.isSlotBlocked(x, z, machine.type, candidate, machine.id)) {
        candidate = rotateDirectionCW(candidate)
        continue
      }

      // Remove all belts, apply rotation, reconnect
      for (const belt of this.getConnectedBeltInfos(machine.id)) {
        this.removeBeltById(belt.id)
      }
      ; (machine as { rotation: Direction }).rotation = candidate

      const lockedPos: GridPosition = { x: machine.x, z: machine.z }
      for (const belt of connectedBelts) {
        const otherMachine = belt.sourceMachine.id === machine.id ? belt.destinationMachine : belt.sourceMachine
        const machineIsSource = belt.sourceMachine.id === machine.id
        if (machineIsSource) {
          if (!this.placeBeltChain(machine, otherMachine, 'output', { fixedRotations: true, lockedMachinePos: lockedPos })) {
            this.placeBeltChain(machine, otherMachine, 'output', { lockedMachinePos: lockedPos })
          }
        } else {
          if (!this.placeBeltChain(otherMachine, machine, 'output', { fixedRotations: true, lockedMachinePos: lockedPos })) {
            this.placeBeltChain(otherMachine, machine, 'output', { lockedMachinePos: lockedPos })
          }
        }
      }

      // Validate: no intermediate cell crossings between any pair of belts
      if (!this.hasBeltCrossings()) {
        return true // Rotation succeeded without crossings
      }

      // Crossings detected — undo this rotation attempt
      for (const belt of this.getConnectedBeltInfos(machine.id)) {
        this.removeBeltById(belt.id)
      }
      ; (machine as { rotation: Direction }).rotation = originalRotation

      // Re-place original belts
      for (const belt of connectedBelts) {
        const otherMachine = belt.sourceMachine.id === machine.id ? belt.destinationMachine : belt.sourceMachine
        const machineIsSource = belt.sourceMachine.id === machine.id
        if (machineIsSource) {
          if (!this.placeBeltChain(machine, otherMachine, 'output', { fixedRotations: true, lockedMachinePos: { x, z } })) {
            this.placeBeltChain(machine, otherMachine, 'output', { lockedMachinePos: { x, z } })
          }
        } else {
          if (!this.placeBeltChain(otherMachine, machine, 'output', { fixedRotations: true, lockedMachinePos: { x, z } })) {
            this.placeBeltChain(otherMachine, machine, 'output', { lockedMachinePos: { x, z } })
          }
        }
      }

      candidate = rotateDirectionCW(candidate)
    }

    return false // No valid rotation found
  }

  removeMachine(x: number, z: number): boolean {
    if (!this.isInBounds(x, z)) return false
    const cell = this.grid[x][z]
    if (cell.machine === null) return false

    const connectedBelts = this.getConnectedBeltInfos(cell.machine.id)
    for (const belt of connectedBelts) {
      this.removeBeltById(belt.id)
    }

    this.machines.delete(cell.machine.id)
    cell.machine = null
    return true
  }

  canMoveMachine(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    if (!this.isInBounds(fromX, fromZ) || !this.isInBounds(toX, toZ)) return false
    const machine = this.grid[fromX]?.[fromZ]?.machine
    if (!machine) return false
    if (fromX === toX && fromZ === toZ) return true
    if (this.grid[toX][toZ].machine !== null) return false
    if (this.isSlotBlocked(toX, toZ, machine.type, machine.rotation, machine.id)) return false

    // NEW: Simulate the move to check if reconnected belts would cause crossings
    const connectedBelts = this.getConnectedBeltInfos(machine.id)
    if (connectedBelts.length === 0) {
      // No belts, move is safe
      return true
    }

    // Save current belt state and temporarily move the machine
    const savedBelts = Array.from(this.belts.entries())
    
    // Remove all connected belts
    for (const belt of connectedBelts) {
      this.removeBeltById(belt.id)
    }

    // Temporarily move the machine in the grid
    const srcCell = this.grid[fromX][fromZ]
    srcCell.machine = null
    machine.x = toX
    machine.z = toZ
    this.grid[toX][toZ].machine = machine

    // Try to reconnect belts
    let canReconnectAll = true
    for (const belt of connectedBelts) {
      const otherMachine = belt.sourceMachine.id === machine.id ? belt.destinationMachine : belt.sourceMachine
      const machineIsSource = belt.sourceMachine.id === machine.id
      if (machineIsSource) {
        if (!this.placeBeltChain(machine, otherMachine, 'output', { fixedRotations: true })) {
          canReconnectAll = false
          break
        }
      } else {
        if (!this.placeBeltChain(otherMachine, machine, 'output', { fixedRotations: true })) {
          canReconnectAll = false
          break
        }
      }
    }

    // Check if reconnected belts would cause crossings
    const hasCrossings = this.hasBeltCrossings()

    // Undo: restore machine position and all belts to their original state
    machine.x = fromX
    machine.z = fromZ
    this.grid[fromX][fromZ].machine = machine
    this.grid[toX][toZ].machine = null

    // Clear current belts and restore saved belts
    this.belts.clear()
    for (const [key, belt] of savedBelts) {
      this.belts.set(key, belt)
    }

    // Restore grid belt IDs
    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.height; z++) {
        this.grid[x][z].beltIds = []
      }
    }
    for (const belt of this.belts.values()) {
      for (const cell of belt.path) {
        if (this.isInBounds(cell.x, cell.z)) {
          this.grid[cell.x][cell.z].beltIds.push(belt.id)
        }
      }
    }

    // Move is valid if: all belts can reconnect and no crossings occur
    return canReconnectAll && !hasCrossings
  }

  moveMachine(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    // NEW: Validate move upfront before making any changes
    if (!this.canMoveMachine(fromX, fromZ, toX, toZ)) return false

    const srcCell = this.grid[fromX][fromZ]
    const machine = srcCell.machine!

    const connectedBelts = this.getConnectedBeltInfos(machine.id)
    for (const belt of connectedBelts) {
      this.removeBeltById(belt.id)
    }

    srcCell.machine = null
    machine.x = toX
    machine.z = toZ
    this.grid[toX][toZ].machine = machine

    for (const belt of connectedBelts) {
      const otherMachine = belt.sourceMachine.id === machine.id ? belt.destinationMachine : belt.sourceMachine
      const machineIsSource = belt.sourceMachine.id === machine.id
      if (machineIsSource) {
        if (!this.placeBeltChain(machine, otherMachine, 'output', { fixedRotations: true })) {
          this.placeBeltChain(machine, otherMachine, 'output')
        }
      } else {
        if (!this.placeBeltChain(otherMachine, machine, 'output', { fixedRotations: true })) {
          this.placeBeltChain(otherMachine, machine, 'output')
        }
      }
    }

    // Remove belts that create crossings by sharing intermediate cells.
    this.removeCrossingBelts()

    return true
  }

  updateMachineType(x: number, z: number, newType: MachineType): boolean {
    if (!this.isInBounds(x, z)) return false
    const machine = this.grid[x][z].machine
    if (!machine) return false
      ; (machine as { type: MachineType }).type = newType
    machine.slots = getSlotPositions(newType)
    return true
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
    const srcOutputOffsets = sourceMachine.slots.outputs.map(p => slotPositionToOffset(p, sourceMachine.rotation))
    const isValidOutput = srcOutputOffsets.some(o => o.x === sourceSlot.x && o.z === sourceSlot.z)
    if (!isValidOutput) return false

    const dstInputOffsets = destinationMachine.slots.inputs.map(p => slotPositionToOffset(p, destinationMachine.rotation))
    const isValidInput = dstInputOffsets.some(i => i.x === destinationSlot.x && i.z === destinationSlot.z)
    if (!isValidInput) return false

    if (!this.isSlotFree(sourceMachine, sourceSlot)) return false
    if (!this.isSlotFree(destinationMachine, destinationSlot)) return false

    const srcSlotCell = { x: sourceMachine.x + sourceSlot.x, z: sourceMachine.z + sourceSlot.z }
    const dstSlotCell = { x: destinationMachine.x + destinationSlot.x, z: destinationMachine.z + destinationSlot.z }

    if (!this.isInBounds(srcSlotCell.x, srcSlotCell.z)) return false
    if (!this.isInBounds(dstSlotCell.x, dstSlotCell.z)) return false

    const sameCell = srcSlotCell.x === dstSlotCell.x && srcSlotCell.z === dstSlotCell.z
    if (!sameCell && !this.areAdjacent(srcSlotCell, dstSlotCell)) return false

    const srcMachinePos = { x: sourceMachine.x, z: sourceMachine.z }
    const dstMachinePos = { x: destinationMachine.x, z: destinationMachine.z }

    const path: GridPosition[] = [srcMachinePos, srcSlotCell]
    if (!sameCell) {
      path.push(dstSlotCell)
    }
    path.push(dstMachinePos)

    // Check for segment collisions
    for (let i = 0; i < path.length - 1; i++) {
      if (this.hasBeltSegment(path[i], path[i + 1])) return false
    }

    const srcSlotPos = offsetToSlotPosition(sourceSlot, sourceMachine.rotation)
    const dstSlotPos = offsetToSlotPosition(destinationSlot, destinationMachine.rotation)
    if (!srcSlotPos || !dstSlotPos) return false

    const id = `belt_${this.nextBeltId++}`
    const belt: BeltInfo = {
      id,
      name: this.generateBeltName(),
      sourceMachine,
      sourceSlot: srcSlotPos,
      destinationMachine,
      destinationSlot: dstSlotPos,
      path,
    }
    this.registerBelt(belt)
    return true
  }

  // ─── Queries ───────────────────────────────────────────

  getBelts(): ReadonlyArray<BeltInfo> {
    return Array.from(this.belts.values())
  }

  getMachines(): ReadonlyArray<MachineInfo> {
    return Array.from(this.machines.values())
  }

  getMachineById(id: string): MachineInfo | null {
    return this.machines.get(id) ?? null
  }

  getConnectedBeltIds(x: number, z: number): Set<string> {
    const machine = this.getMachineAt(x, z)
    if (!machine) return new Set()
    const ids = new Set<string>()
    for (const belt of this.belts.values()) {
      if (belt.sourceMachine.id === machine.id || belt.destinationMachine.id === machine.id) {
        ids.add(belt.id)
      }
    }
    return ids
  }

  getConnectedMachines(x: number, z: number): Array<{ position: GridPosition, machineIsSource: boolean }> {
    const machine = this.getMachineAt(x, z)
    if (!machine) return []
    const result: Array<{ position: GridPosition, machineIsSource: boolean }> = []
    for (const belt of this.belts.values()) {
      if (belt.sourceMachine.id === machine.id) {
        const other = belt.destinationMachine
        result.push({ position: { x: other.x, z: other.z }, machineIsSource: true })
      } else if (belt.destinationMachine.id === machine.id) {
        const other = belt.sourceMachine
        result.push({ position: { x: other.x, z: other.z }, machineIsSource: false })
      }
    }
    return result
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
    const { fixedRotations, lockedMachinePos, ignoreBeltIds, targetSlotPosition, sourceSlotPosition, tryReverseSlotType = false } = opts ?? {}
    // Try without ignoring any existing belts first (matches ghost preview behavior).
    // This avoids crossings with existing belts when a clean path exists.
    const savedFromRot = from.rotation
    const savedToRot = to.rotation
    const baseOpts = { fixedRotations, lockedMachinePos, ignoreBeltIds, targetSlotPosition, sourceSlotPosition, tryReverseSlotType }
    if (this.tryPlaceBeltWithIgnore(from, to, sourceSlotType, baseOpts)) {
      return true
    }
    // Restore rotations that the failed attempt may have changed
    this.setMachineRotation(from.x, from.z, savedFromRot)
    this.setMachineRotation(to.x, to.z, savedToRot)

    return false
  }

  private tryPlaceBeltWithIgnore(
    from: MachineInfo, to: MachineInfo,
    sourceSlotType: 'input' | 'output',
    opts?: PlaceBeltChainOptions,
  ): boolean {
    const { fixedRotations, lockedMachinePos, ignoreBeltIds, targetSlotPosition, sourceSlotPosition, tryReverseSlotType } = opts ?? {}
    const fromPos: GridPosition = { x: from.x, z: from.z }
    const toPos: GridPosition = { x: to.x, z: to.z }
    // When a specific machine's rotation is locked, use forcedHasBelts to prevent
    // auto-rotation for that machine while allowing the other to auto-rotate
    const forcedHasBelts = lockedMachinePos
      ? new Set([`${lockedMachinePos.x},${lockedMachinePos.z}`]) as ReadonlySet<string>
      : undefined
    const plan = this.planner.computePlacementPlan(fromPos, toPos, sourceSlotType, {
      ignoreBeltIds, fixedRotations, forcedHasBelts,
      targetSlotPosition, sourceSlotPosition, tryReverseSlotType,
    })

    if (!plan || plan.collides) return false

    // When the planner internally fell back to the reverse slot type, the
    // returned plan represents the OPPOSITE flow: the effective sourceSlotType
    // is flipped, which swaps which machine maps to path start/end.
    const effectiveSourceSlotType: 'input' | 'output' = plan.reversed
      ? (sourceSlotType === 'output' ? 'input' : 'output')
      : sourceSlotType

    const isFromLocked = lockedMachinePos && fromPos.x === lockedMachinePos.x && fromPos.z === lockedMachinePos.z

    if (!fixedRotations && !isFromLocked && plan.srcRotation !== undefined) {
      this.setMachineRotation(from.x, from.z, plan.srcRotation)
    }

    const path = plan.path
    // When sourceSlotType='input', the path flows from the target (output provider)
    // to the source (input receiver), so we swap which machine maps to path start/end
    const srcMachine = effectiveSourceSlotType === 'output' ? from : to
    const dstMachine = effectiveSourceSlotType === 'output' ? to : from

    const srcSlotOffset = { x: path[1].x - path[0].x, z: path[1].z - path[0].z }
    const dstSlotOffset = { x: path[path.length - 2].x - path[path.length - 1].x, z: path[path.length - 2].z - path[path.length - 1].z }
    const srcSlot = offsetToSlotPosition(srcSlotOffset, srcMachine.rotation)
    const dstSlot = offsetToSlotPosition(dstSlotOffset, dstMachine.rotation)
    if (!srcSlot || !dstSlot) return false
    // Ensure the resolved slots match the correct I/O type:
    // source machine must use an output slot, destination machine must use an input slot
    if (!srcMachine.slots.outputs.includes(srcSlot) || !dstMachine.slots.inputs.includes(dstSlot)) return false

    // Reject if either slot is already occupied by another belt
    if (!this.isSlotFreeExcluding(srcMachine, srcSlotOffset, ignoreBeltIds) ||
        !this.isSlotFreeExcluding(dstMachine, dstSlotOffset, ignoreBeltIds)) return false

    const id = `belt_${this.nextBeltId++}`
    const belt: BeltInfo = {
      id,
      name: this.generateBeltName(),
      sourceMachine: srcMachine,
      sourceSlot: srcSlot,
      destinationMachine: dstMachine,
      destinationSlot: dstSlot,
      path: path.map(p => ({ x: p.x, z: p.z })),
    }
    this.registerBelt(belt)
    return true
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
    const { ignoreBeltIds, fixedRotations, targetSlotPosition, sourceSlotPosition, tryReverseSlotType = false } = opts ?? {}
    const plannerOpts = { ignoreBeltIds, fixedRotations, targetSlotPosition, sourceSlotPosition, tryReverseSlotType }
    const plan = this.planner.computePlacementPlan(from, to, sourceSlotType, plannerOpts)
    if (plan && !plan.collides && this.isValidSlotPath(plan.path, this.effectiveSourceSlotType(sourceSlotType, plan.reversed))) {
      return { path: plan.path, collides: false }
    }

    // Return colliding result for ghost preview
    if (plan) return { path: plan.path, collides: plan.collides }
    return null
  }

  private effectiveSourceSlotType(sourceSlotType: 'input' | 'output', reversed: boolean | undefined): 'input' | 'output' {
    if (!reversed) return sourceSlotType
    return sourceSlotType === 'output' ? 'input' : 'output'
  }

  /**
   * Validate that a path's endpoints map to valid I/O slots on the source/destination machines.
   * Mirrors the slot validation in placeBeltChain to ensure ghost/final parity.
   */
  private isValidSlotPath(path: GridPosition[], sourceSlotType: 'input' | 'output'): boolean {
    if (path.length < 2) return false
    const srcMachine = sourceSlotType === 'output'
      ? this.getMachineAt(path[0].x, path[0].z)
      : this.getMachineAt(path[path.length - 1].x, path[path.length - 1].z)
    const dstMachine = sourceSlotType === 'output'
      ? this.getMachineAt(path[path.length - 1].x, path[path.length - 1].z)
      : this.getMachineAt(path[0].x, path[0].z)
    if (!srcMachine || !dstMachine) return false

    const srcSlotOffset = { x: path[1].x - path[0].x, z: path[1].z - path[0].z }
    const dstSlotOffset = { x: path[path.length - 2].x - path[path.length - 1].x, z: path[path.length - 2].z - path[path.length - 1].z }
    const srcSlot = offsetToSlotPosition(srcSlotOffset, srcMachine.rotation)
    const dstSlot = offsetToSlotPosition(dstSlotOffset, dstMachine.rotation)
    if (!srcSlot || !dstSlot) return false
    if (!srcMachine.slots.outputs.includes(srcSlot) || !dstMachine.slots.inputs.includes(dstSlot)) return false
    return true
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
    const wasEnabled = this._slotBlockingEnabled
    this._slotBlockingEnabled = false
    for (const m of machines) {
      this.placeMachine(m.x, m.z, m.type, m.rotation)
      if (m.name) this.renameMachine(m.x, m.z, m.name)
    }
    this._slotBlockingEnabled = wasEnabled
    for (const b of belts) {
      if (b.path.length < 2) continue
      const srcPos = b.path[0]
      const dstPos = b.path[b.path.length - 1]
      const srcMachine = this.getMachineAt(srcPos.x, srcPos.z)
      const dstMachine = this.getMachineAt(dstPos.x, dstPos.z)
      if (!srcMachine || !dstMachine) continue

      const id = `belt_${this.nextBeltId++}`
      const belt: BeltInfo = {
        id,
        name: b.name ?? this.generateBeltName(),
        sourceMachine: srcMachine,
        sourceSlot: b.sourceSlot,
        destinationMachine: dstMachine,
        destinationSlot: b.destinationSlot,
        path: b.path.map(p => ({ x: p.x, z: p.z })),
      }
      this.registerBelt(belt)
    }
  }

  // ─── Utility ───────────────────────────────────────────

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

  private generateMachineName(type: MachineType): string {
    const label = type.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
    const count = (this.machineNameCounters.get(type) ?? 0) + 1
    this.machineNameCounters.set(type, count)
    return `${label} ${count}`
  }

  private generateBeltName(): string {
    return `belt ${this.nextBeltNameNumber++}`
  }

  private areAdjacent(a: GridPosition, b: GridPosition): boolean {
    const dx = Math.abs(a.x - b.x)
    const dz = Math.abs(a.z - b.z)
    return (dx === 1 && dz === 0) || (dx === 0 && dz === 1)
  }

  private removeBeltIdFromCell(x: number, z: number, beltId: string): void {
    const cell = this.grid[x][z]
    const idx = cell.beltIds.indexOf(beltId)
    if (idx !== -1) {
      cell.beltIds.splice(idx, 1)
    }
  }

  cellHasBeltsExcluding(x: number, z: number, ignoreBeltIds?: ReadonlySet<string>): boolean {
    if (!this.isInBounds(x, z)) return false
    const beltIds = this.grid[x][z].beltIds
    if (!ignoreBeltIds) return beltIds.length > 0
    return beltIds.some(id => !ignoreBeltIds.has(id))
  }

  private isSlotFreeExcluding(machine: MachineInfo, slotOffset: GridPosition, ignoreBeltIds?: ReadonlySet<string>): boolean {
    for (const belt of this.belts.values()) {
      if (ignoreBeltIds?.has(belt.id)) continue
      if (belt.sourceMachine.id === machine.id && belt.path.length >= 2) {
        const srcOff = { x: belt.path[1].x - belt.path[0].x, z: belt.path[1].z - belt.path[0].z }
        if (srcOff.x === slotOffset.x && srcOff.z === slotOffset.z) return false
      }
      if (belt.destinationMachine.id === machine.id && belt.path.length >= 2) {
        const n = belt.path.length
        const dstOff = { x: belt.path[n - 2].x - belt.path[n - 1].x, z: belt.path[n - 2].z - belt.path[n - 1].z }
        if (dstOff.x === slotOffset.x && dstOff.z === slotOffset.z) return false
      }
    }
    return true
  }

  private getFreeSlotsOfTypeExcluding(machine: MachineInfo, slotType: 'input' | 'output', ignoreBeltIds?: ReadonlySet<string>): GridPosition[] {
    const positions = slotType === 'input' ? machine.slots.inputs : machine.slots.outputs
    const offsets = positions.map(p => slotPositionToOffset(p, machine.rotation))
    return offsets.filter(offset => this.isSlotFreeExcluding(machine, offset, ignoreBeltIds))
  }

  private registerBelt(belt: BeltInfo): void {
    // Invariant: belt path must connect to valid machine slots
    if (belt.path.length >= 2) {
      const srcOff = { x: belt.path[1].x - belt.path[0].x, z: belt.path[1].z - belt.path[0].z }
      const srcSlot = offsetToSlotPosition(srcOff, belt.sourceMachine.rotation)
      if (!srcSlot) {
        console.error(`[Factory] INVARIANT VIOLATION: Belt ${belt.id} source path direction (${srcOff.x},${srcOff.z}) does not match any slot of ${belt.sourceMachine.type} at (${belt.sourceMachine.x},${belt.sourceMachine.z}) rotation=${belt.sourceMachine.rotation}`)
        return
      }
      const n = belt.path.length
      const dstOff = { x: belt.path[n - 2].x - belt.path[n - 1].x, z: belt.path[n - 2].z - belt.path[n - 1].z }
      const dstSlot = offsetToSlotPosition(dstOff, belt.destinationMachine.rotation)
      if (!dstSlot) {
        console.error(`[Factory] INVARIANT VIOLATION: Belt ${belt.id} destination path direction (${dstOff.x},${dstOff.z}) does not match any slot of ${belt.destinationMachine.type} at (${belt.destinationMachine.x},${belt.destinationMachine.z}) rotation=${belt.destinationMachine.rotation}`)
        return
      }
    }

    this.belts.set(belt.id, belt)
    for (const cell of belt.path) {
      if (this.isInBounds(cell.x, cell.z)) {
        this.grid[cell.x][cell.z].beltIds.push(belt.id)
      }
    }
  }

  private getConnectedBeltInfos(machineId: string): BeltInfo[] {
    const result: BeltInfo[] = []
    for (const belt of this.belts.values()) {
      if (belt.sourceMachine.id === machineId || belt.destinationMachine.id === machineId) {
        result.push(belt)
      }
    }
    return result
  }

  /** Check whether any two belts share intermediate cells (crossing paths). */
  private hasBeltCrossings(): boolean {
    const intermediateCells = new Map<string, string>()
    for (const belt of this.belts.values()) {
      for (let i = 1; i < belt.path.length - 1; i++) {
        const key = `${belt.path[i].x},${belt.path[i].z}`
        const existing = intermediateCells.get(key)
        if (existing && existing !== belt.id) return true
        if (!intermediateCells.has(key)) intermediateCells.set(key, belt.id)
      }
    }
    return false
  }

  /** Remove later-placed belts that share intermediate cells with earlier belts. */
  private removeCrossingBelts(): void {
    const intermediateCells = new Map<string, string>()
    const toRemove = new Set<string>()
    for (const belt of this.belts.values()) {
      for (let i = 1; i < belt.path.length - 1; i++) {
        const key = `${belt.path[i].x},${belt.path[i].z}`
        const existing = intermediateCells.get(key)
        if (existing && existing !== belt.id) {
          toRemove.add(belt.id)
        }
        if (!intermediateCells.has(key)) intermediateCells.set(key, belt.id)
      }
    }
    for (const id of toRemove) this.removeBeltById(id)
  }
}
