import type { BeltInfo, Direction, GridPosition, MachineInfo, MachineType, SlotPosition } from './types'
import { rotateDirectionCW } from './SlotUtils'

interface ReconnectOptions {
  fixedRotations?: boolean
  lockedMachinePos?: GridPosition
  sourceSlotPosition?: SlotPosition
  targetSlotPosition?: SlotPosition
  requireTargetSlotPosition?: boolean
}

interface ConnectedBeltEditHost {
  getConnectedBeltInfos(machineId: string): BeltInfo[]
  removeBeltById(beltId: string): boolean
  placeBeltChain(
    from: MachineInfo,
    to: MachineInfo,
    sourceSlotType?: 'input' | 'output',
    opts?: ReconnectOptions,
  ): boolean
  setMachineRotation(x: number, z: number, rotation: Direction): void
  isSlotBlocked(x: number, z: number, type: MachineType, rotation: Direction, excludeId?: string): boolean
  isUnrelatedMachineOutputSlotCell(cell: GridPosition, sourceMachineId: string, destinationMachineId: string): boolean
  hasBeltCrossings(): boolean
}

export class ConnectedBeltEditOrchestrator {
  private readonly host: ConnectedBeltEditHost

  constructor(host: ConnectedBeltEditHost) {
    this.host = host
  }

  removeConnectedBelts(machineId: string): void {
    for (const belt of this.host.getConnectedBeltInfos(machineId)) {
      this.host.removeBeltById(belt.id)
    }
  }

  tryReconnectBelts(
    machine: MachineInfo,
    connectedBelts: ReadonlyArray<BeltInfo>,
    opts?: ReconnectOptions,
  ): number {
    const endpointCounts = countEndpointPairs(connectedBelts)
    let reconnectedCount = 0
    for (const belt of connectedBelts) {
      if (this.reconnectBelt(machine, belt, opts, (endpointCounts.get(endpointPairKey(belt)) ?? 0) > 1)) reconnectedCount++
    }
    return reconnectedCount
  }

  reconnectBeltsFixedFirst(
    machine: MachineInfo,
    connectedBelts: ReadonlyArray<BeltInfo>,
    opts?: Omit<ReconnectOptions, 'fixedRotations'>,
  ): number {
    const endpointCounts = countEndpointPairs(connectedBelts)
    let reconnectedCount = 0
    for (const belt of connectedBelts) {
      const hasSameEndpointSibling = (endpointCounts.get(endpointPairKey(belt)) ?? 0) > 1
      if (this.reconnectBelt(machine, belt, { ...opts, fixedRotations: true }, hasSameEndpointSibling) ||
        this.reconnectBelt(machine, belt, opts, hasSameEndpointSibling)) {
        reconnectedCount++
      }
    }
    return reconnectedCount
  }

  rotateMachine(machine: MachineInfo, rotation: Direction): boolean {
    const { x, z } = machine
    const originalRotation = machine.rotation
    const connectedBelts = this.host.getConnectedBeltInfos(machine.id)

    let candidate = rotation
    for (let attempts = 0; attempts < 4; attempts++) {
      if (this.host.isSlotBlocked(x, z, machine.type, candidate, machine.id)) {
        candidate = rotateDirectionCW(candidate)
        continue
      }

      this.removeConnectedBelts(machine.id)
      this.host.setMachineRotation(x, z, candidate)

      const lockedPos: GridPosition = { x: machine.x, z: machine.z }
      this.reconnectBeltsFixedFirst(machine, connectedBelts, { lockedMachinePos: lockedPos })

      if (!this.host.hasBeltCrossings()) {
        return true
      }

      this.removeConnectedBelts(machine.id)
      this.host.setMachineRotation(x, z, originalRotation)
      this.reconnectBeltsFixedFirst(machine, connectedBelts, { lockedMachinePos: { x, z } })

      candidate = rotateDirectionCW(candidate)
    }

    return false
  }

  private reconnectBelt(
    machine: MachineInfo,
    belt: BeltInfo,
    opts?: ReconnectOptions,
    rejectUnrelatedOutputSlotOverlap = false,
  ): boolean {
    const otherMachine = belt.sourceMachine.id === machine.id ? belt.destinationMachine : belt.sourceMachine
    const machineIsSource = belt.sourceMachine.id === machine.id
    const beforeIds = new Set(this.host.getConnectedBeltInfos(machine.id).map((connectedBelt) => connectedBelt.id))
    const exactSlotOpts: ReconnectOptions = {
      ...opts,
      sourceSlotPosition: belt.sourceSlot,
      targetSlotPosition: belt.destinationSlot,
      requireTargetSlotPosition: true,
    }
    const placed = machineIsSource
      ? this.host.placeBeltChain(machine, otherMachine, 'output', exactSlotOpts)
      : this.host.placeBeltChain(otherMachine, machine, 'output', exactSlotOpts)

    if (!placed) return false

    const placedBelt = this.host.getConnectedBeltInfos(machine.id).find((candidate) =>
      !beforeIds.has(candidate.id) && beltHasExactTuple(candidate, belt)
    )
    if (!placedBelt) {
      for (const candidate of this.host.getConnectedBeltInfos(machine.id)) {
        if (!beforeIds.has(candidate.id)) this.host.removeBeltById(candidate.id)
      }
      return false
    }
    if (rejectUnrelatedOutputSlotOverlap && this.hasUnrelatedOutputSlotOverlap(placedBelt)) {
      this.host.removeBeltById(placedBelt.id)
      return false
    }

    return true
  }

  private hasUnrelatedOutputSlotOverlap(belt: BeltInfo): boolean {
    for (let index = 1; index < belt.path.length - 1; index++) {
      if (this.host.isUnrelatedMachineOutputSlotCell(
        belt.path[index],
        belt.sourceMachine.id,
        belt.destinationMachine.id,
      )) {
        return true
      }
    }
    return false
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

export function hasBeltCrossings(belts: Iterable<BeltInfo>): boolean {
  return scanIntermediateCellCrossings(belts, () => false)
}

export function countConnectedBeltEndpointPairs(belts: ReadonlyArray<BeltInfo>): number {
  return countEndpointPairs(belts).size
}

export function findCrossingBeltIds(belts: Iterable<BeltInfo>): Set<string> {
  const toRemove = new Set<string>()
  scanIntermediateCellCrossings(belts, (_existingBeltId, crossingBeltId) => {
    toRemove.add(crossingBeltId)
    return true
  })
  return toRemove
}

function scanIntermediateCellCrossings(
  belts: Iterable<BeltInfo>,
  onCrossing: (existingBeltId: string, crossingBeltId: string) => boolean,
): boolean {
  const intermediateCells = new Map<string, string>()
  for (const belt of belts) {
    for (let i = 1; i < belt.path.length - 1; i++) {
      const key = `${belt.path[i].x},${belt.path[i].z}`
      const existing = intermediateCells.get(key)
      if (existing && existing !== belt.id) {
        if (!onCrossing(existing, belt.id)) return true
      }
      if (!intermediateCells.has(key)) intermediateCells.set(key, belt.id)
    }
  }
  return false
}
