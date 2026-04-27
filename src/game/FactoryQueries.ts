import type { BeltInfo, GridPosition, MachineInfo } from './types'
import { slotPositionToOffset } from './SlotUtils'

export interface FactoryGridCell {
  x: number
  z: number
  machine: MachineInfo | null
  beltIds: string[]
}

export interface FactoryQueryState {
  readonly width: number
  readonly height: number
  readonly grid: FactoryGridCell[][]
  readonly machines: Map<string, MachineInfo>
  readonly belts: Map<string, BeltInfo>
}

/** Read-model helpers for Factory grid, machine, and belt state. */
export class FactoryQueries {
  private readonly state: FactoryQueryState

  constructor(state: FactoryQueryState) {
    this.state = state
  }

  isInBounds(x: number, z: number): boolean {
    return x >= 0 && x < this.state.width && z >= 0 && z < this.state.height
  }

  getMachineAt(x: number, z: number): MachineInfo | null {
    if (!this.isInBounds(x, z)) return null
    return this.state.grid[x][z].machine
  }

  getBeltsAt(x: number, z: number): ReadonlyArray<BeltInfo> {
    if (!this.isInBounds(x, z)) return []
    return this.state.grid[x][z].beltIds
      .map((id) => this.state.belts.get(id))
      .filter((belt): belt is BeltInfo => belt !== undefined)
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

  isSlotFreeExcluding(machine: MachineInfo, slotOffset: GridPosition, ignoreBeltIds?: ReadonlySet<string>): boolean {
    for (const belt of this.state.belts.values()) {
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

  getFreeSlotsOfType(machine: MachineInfo, slotType: 'input' | 'output', ignoreBeltIds?: ReadonlySet<string>): GridPosition[] {
    const positions = slotType === 'input' ? machine.slots.inputs : machine.slots.outputs
    const offsets = positions.map(p => slotPositionToOffset(p, machine.rotation))
    return offsets.filter(offset => this.isSlotFreeExcluding(machine, offset, ignoreBeltIds))
  }

  machineHasAnyBelts(x: number, z: number): boolean {
    if (!this.isInBounds(x, z)) return false
    const machine = this.getMachineAt(x, z)
    if (!machine) return false
    for (const beltId of this.state.grid[x][z].beltIds) {
      const belt = this.state.belts.get(beltId)
      if (belt && (belt.sourceMachine.id === machine.id || belt.destinationMachine.id === machine.id)) return true
    }
    return false
  }

  getBelts(): ReadonlyArray<BeltInfo> {
    return Array.from(this.state.belts.values())
  }

  getMachines(): ReadonlyArray<MachineInfo> {
    return Array.from(this.state.machines.values())
  }

  getMachineById(id: string): MachineInfo | null {
    return this.state.machines.get(id) ?? null
  }

  getConnectedBeltIds(x: number, z: number): Set<string> {
    const machine = this.getMachineAt(x, z)
    if (!machine) return new Set()
    const ids = new Set<string>()
    for (const belt of this.state.belts.values()) {
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
    for (const belt of this.state.belts.values()) {
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

  cellHasBeltsExcluding(x: number, z: number, ignoreBeltIds?: ReadonlySet<string>): boolean {
    if (!this.isInBounds(x, z)) return false
    const beltIds = this.state.grid[x][z].beltIds
    if (!ignoreBeltIds) return beltIds.length > 0
    return beltIds.some(id => !ignoreBeltIds.has(id))
  }

  getConnectedBeltInfos(machineId: string): BeltInfo[] {
    const result: BeltInfo[] = []
    for (const belt of this.state.belts.values()) {
      if (belt.sourceMachine.id === machineId || belt.destinationMachine.id === machineId) {
        result.push(belt)
      }
    }
    return result
  }
}