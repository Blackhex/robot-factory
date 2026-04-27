import { BeltInventoryMigrationCoordinator } from './BeltInventoryMigrationCoordinator'
import { ConveyorBelt } from './ConveyorBelt'
import type { BeltInfo } from './types'

/**
 * Minimal simulation surface needed to keep live factory edits synchronized
 * with per-cell conveyor belt segments.
 */
export interface FactorySimulationLike {
  addBelt(belt: ConveyorBelt): void
  removeBelt(id: string): boolean
  getBelt(id: string): ConveyorBelt | undefined
  setMachineOutputBelt(machineId: string, beltId: string, port?: 'primary' | 'secondary'): void
  setMachinePosition(machineId: string, x: number, z: number): void
}

export class FactorySimulationSync {
  private sim: FactorySimulationLike | null = null
  private editDepth = 0
  private readonly beltInventoryMigration = new BeltInventoryMigrationCoordinator()
  private dryRun = false

  attachSimulation(sim: FactorySimulationLike | null): void {
    this.sim = sim
  }

  beginEdit(): void {
    if (this.editDepth === 0 && !this.dryRun) {
      this.beltInventoryMigration.beginEdit()
    }
    this.editDepth++
  }

  endEdit(belts: Iterable<BeltInfo>): void {
    this.editDepth--
    if (this.editDepth === 0 && !this.dryRun) {
      this.beltInventoryMigration.flush(this.sim, belts)
    }
  }

  withDryRun<T>(callback: () => T): T {
    const wasDryRun = this.dryRun
    this.dryRun = true
    try {
      return callback()
    } finally {
      this.dryRun = wasDryRun
    }
  }

  hasCapturedBeltItemsInCurrentEdit(): boolean {
    return this.beltInventoryMigration.hasCapturedItemsInCurrentEdit()
  }

  discardUnmatchedRemovedBeltItemsInCurrentEdit(): void {
    if (this.dryRun) return
    this.beltInventoryMigration.discardUnmatchedRemovedBeltItemsInCurrentEdit()
  }

  syncRemovedBelt(belt: BeltInfo): void {
    if (!this.sim || this.dryRun) return

    this.beltInventoryMigration.captureRemovedBeltInventory(belt, (segmentId) => this.sim?.getBelt(segmentId))
    for (let i = 0; i < belt.path.length - 1; i++) {
      const segmentId = `${belt.id}_seg${i}`
      if (this.sim.getBelt(segmentId)) {
        this.sim.removeBelt(segmentId)
      }
    }
  }

  syncAddedBelt(belt: BeltInfo): void {
    if (!this.sim || this.dryRun) return

    for (const segment of ConveyorBelt.fromBeltInfo(belt)) {
      if (!this.sim.getBelt(segment.id)) {
        this.sim.addBelt(segment)
      }
    }
    this.sim.setMachineOutputBelt(belt.sourceMachine.id, `${belt.id}_seg0`)
    this.beltInventoryMigration.markBeltAdded()
  }

  syncMachinePosition(machineId: string, x: number, z: number): void {
    this.sim?.setMachinePosition(machineId, x, z)
  }
}
