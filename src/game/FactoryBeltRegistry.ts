import type { BeltInfo } from './types'
import { offsetToSlotPosition } from './SlotUtils'
import type { FactoryGridCell } from './FactoryQueries'
import type { FactorySimulationSync } from './FactorySimulationSync'

interface FactoryBeltRegistryState {
  readonly grid: FactoryGridCell[][]
  readonly belts: Map<string, BeltInfo>
}

interface FactoryBeltRegistryHost {
  isInBounds(x: number, z: number): boolean
  beginEdit(): void
  endEdit(): void
}

export class FactoryBeltRegistry {
  private nextBeltIdNumber = 1
  private nextBeltNameNumber = 1
  private readonly state: FactoryBeltRegistryState
  private readonly host: FactoryBeltRegistryHost
  private readonly simulationSync: FactorySimulationSync

  constructor(
    state: FactoryBeltRegistryState,
    host: FactoryBeltRegistryHost,
    simulationSync: FactorySimulationSync,
  ) {
    this.state = state
    this.host = host
    this.simulationSync = simulationSync
  }

  nextBeltId(): string {
    return `belt_${this.nextBeltIdNumber++}`
  }

  nextBeltName(): string {
    return `belt ${this.nextBeltNameNumber++}`
  }

  renameBelt(beltId: string, name: string): boolean {
    const belt = this.state.belts.get(beltId)
    if (!belt) return false
      ; (belt as { name: string }).name = name
    return true
  }

  removeBeltById(beltId: string): boolean {
    const belt = this.state.belts.get(beltId)
    if (!belt) return false
    this.host.beginEdit()
    try {
      this.simulationSync.syncRemovedBelt(belt)
      this.state.belts.delete(beltId)
      for (const cell of belt.path) {
        if (this.host.isInBounds(cell.x, cell.z)) {
          this.removeBeltIdFromCell(cell.x, cell.z, beltId)
        }
      }
      return true
    } finally {
      this.host.endEdit()
    }
  }

  registerBelt(belt: BeltInfo): void {
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

    this.state.belts.set(belt.id, belt)
    for (const cell of belt.path) {
      if (this.host.isInBounds(cell.x, cell.z)) {
        this.state.grid[cell.x][cell.z].beltIds.push(belt.id)
      }
    }

    this.simulationSync.syncAddedBelt(belt)
  }

  private removeBeltIdFromCell(x: number, z: number, beltId: string): void {
    const cell = this.state.grid[x][z]
    const idx = cell.beltIds.indexOf(beltId)
    if (idx !== -1) {
      cell.beltIds.splice(idx, 1)
    }
  }
}
