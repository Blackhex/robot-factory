import type { BeltInfo, Direction, MachineInfo, MachineType } from './types'
import type { ConnectedBeltEditOrchestrator } from './ConnectedBeltEditOrchestrator'
import { findCrossingBeltIds, hasBeltCrossings } from './ConnectedBeltEditOrchestrator'
import type { FactoryGridCell, FactoryQueries } from './FactoryQueries'
import type { FactorySimulationSync } from './FactorySimulationSync'

interface FactoryMachineMoveState {
  readonly width: number
  readonly height: number
  readonly grid: FactoryGridCell[][]
  readonly belts: Map<string, BeltInfo>
}

interface FactoryMachineMoveHost {
  isInBounds(x: number, z: number): boolean
  isSlotBlocked(x: number, z: number, type: MachineType, rotation: Direction, excludeId?: string): boolean
  beginEdit(): void
  endEdit(): void
  removeBeltById(beltId: string): boolean
}

export class FactoryMachineMover {
  private readonly state: FactoryMachineMoveState
  private readonly host: FactoryMachineMoveHost
  private readonly queries: FactoryQueries
  private readonly connectedBeltEditor: ConnectedBeltEditOrchestrator
  private readonly simulationSync: FactorySimulationSync

  constructor(
    state: FactoryMachineMoveState,
    host: FactoryMachineMoveHost,
    queries: FactoryQueries,
    connectedBeltEditor: ConnectedBeltEditOrchestrator,
    simulationSync: FactorySimulationSync,
  ) {
    this.state = state
    this.host = host
    this.queries = queries
    this.connectedBeltEditor = connectedBeltEditor
    this.simulationSync = simulationSync
  }

  canMoveMachine(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    if (!this.host.isInBounds(fromX, fromZ) || !this.host.isInBounds(toX, toZ)) return false
    const machine = this.state.grid[fromX]?.[fromZ]?.machine
    if (!machine) return false
    if (fromX === toX && fromZ === toZ) return true
    if (this.state.grid[toX][toZ].machine !== null) return false
    if (this.host.isSlotBlocked(toX, toZ, machine.type, machine.rotation, machine.id)) return false

    const connectedBelts = this.queries.getConnectedBeltInfos(machine.id)
    if (connectedBelts.length === 0) return true

    return this.simulationSync.withDryRun(() =>
      this.canMoveMachineImpl(fromX, fromZ, toX, toZ, machine, connectedBelts),
    )
  }

  moveMachine(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    if (!this.canMoveMachine(fromX, fromZ, toX, toZ)) return false

    this.host.beginEdit()
    try {
      const srcCell = this.state.grid[fromX][fromZ]
      const machine = srcCell.machine!

      const connectedBelts = this.queries.getConnectedBeltInfos(machine.id)
      this.connectedBeltEditor.removeConnectedBelts(machine.id)

      srcCell.machine = null
      machine.x = toX
      machine.z = toZ
      this.state.grid[toX][toZ].machine = machine
      this.simulationSync.syncMachinePosition(machine.id, toX, toZ)

      this.connectedBeltEditor.tryReconnectBelts(machine, connectedBelts, { fixedRotations: true })
      this.simulationSync.discardUnmatchedRemovedBeltItemsInCurrentEdit()
      this.removeCrossingBelts()

      return true
    } finally {
      this.host.endEdit()
    }
  }

  hasBeltCrossings(): boolean {
    return hasBeltCrossings(this.state.belts.values())
  }

  private canMoveMachineImpl(
    fromX: number, fromZ: number, toX: number, toZ: number,
    machine: MachineInfo,
    connectedBelts: BeltInfo[],
  ): boolean {
    const savedBelts = Array.from(this.state.belts.entries())

    this.connectedBeltEditor.removeConnectedBelts(machine.id)

    const srcCell = this.state.grid[fromX][fromZ]
    srcCell.machine = null
    machine.x = toX
    machine.z = toZ
    this.state.grid[toX][toZ].machine = machine

    this.connectedBeltEditor.tryReconnectBelts(machine, connectedBelts, { fixedRotations: true })
    const hasCrossings = this.hasBeltCrossings()
    const dropsRequiredSingletonLane = this.dropsRequiredSingletonLane(connectedBelts)

    machine.x = fromX
    machine.z = fromZ
    this.state.grid[fromX][fromZ].machine = machine
    this.state.grid[toX][toZ].machine = null

    this.state.belts.clear()
    for (const [key, belt] of savedBelts) {
      this.state.belts.set(key, belt)
    }
    this.rebuildGridBeltIds()

    return !hasCrossings && !dropsRequiredSingletonLane
  }

  private dropsRequiredSingletonLane(connectedBelts: ReadonlyArray<BeltInfo>): boolean {
    const endpointCounts = countEndpointPairs(connectedBelts)
    for (const original of connectedBelts) {
      if ((endpointCounts.get(endpointPairKey(original)) ?? 0) > 1) continue
      const reconnected = Array.from(this.state.belts.values()).some((candidate) =>
        beltHasExactTuple(candidate, original),
      )
      if (!reconnected) return true
    }
    return false
  }

  private rebuildGridBeltIds(): void {
    for (let x = 0; x < this.state.width; x++) {
      for (let z = 0; z < this.state.height; z++) {
        this.state.grid[x][z].beltIds = []
      }
    }
    for (const belt of this.state.belts.values()) {
      for (const cell of belt.path) {
        if (this.host.isInBounds(cell.x, cell.z)) {
          this.state.grid[cell.x][cell.z].beltIds.push(belt.id)
        }
      }
    }
  }

  private removeCrossingBelts(): void {
    const toRemove = findCrossingBeltIds(this.state.belts.values())
    for (const id of toRemove) this.host.removeBeltById(id)
  }
}

function beltHasExactTuple(candidate: BeltInfo, original: BeltInfo): boolean {
  return candidate.sourceMachine.id === original.sourceMachine.id &&
    candidate.destinationMachine.id === original.destinationMachine.id &&
    candidate.sourceSlot === original.sourceSlot &&
    candidate.destinationSlot === original.destinationSlot
}

function endpointPairKey(belt: BeltInfo): string {
  return `${belt.sourceMachine.id}\u0000${belt.destinationMachine.id}`
}

function countEndpointPairs(belts: ReadonlyArray<BeltInfo>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const belt of belts) {
    const key = endpointPairKey(belt)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}
