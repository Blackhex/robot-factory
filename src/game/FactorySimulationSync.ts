import { beltEndpointKey } from './BeltInventoryMigration'
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

  /**
   * Per-edit map from a stable endpoint key to the speed observed on the
   * belt's seg0 just before removal. Cleared on every `beginEdit`,
   * populated by `syncRemovedBelt`, and consulted by `syncAddedBelt`
   * so player-set belt speeds (via `SET_BELT_SPEED`) survive machine
   * moves that recompute the belt topology. See `beltEndpointKey` for
   * the rationale behind keying on the endpoint quadruple.
   *
   * Belts that were never `SET_BELT_SPEED`'d (still at default 1.0) are
   * intentionally NOT stored — `syncAddedBelt` falls back to the default
   * speed on a map miss, which preserves default-speed behavior (case E).
   */
  private readonly removedBeltSpeeds = new Map<string, number>()

  attachSimulation(sim: FactorySimulationLike | null): void {
    this.sim = sim
  }

  beginEdit(): void {
    if (this.editDepth === 0 && !this.dryRun) {
      this.beltInventoryMigration.beginEdit()
      this.removedBeltSpeeds.clear()
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

    // Capture player-set belt speed BEFORE removing segments, so a
    // matching syncAddedBelt later in the same edit can restore it.
    // Probe seg0 — Simulation.executeCommand keeps every segment of a
    // logical belt at the same speed, so seg0 is representative.
    // Default-speed belts are skipped to keep the map's intent explicit
    // ("did the player change this belt's speed?") and to avoid
    // upcasting belts that should stay at the default.
    const seg0 = this.sim.getBelt(ConveyorBelt.segmentIdFor(belt.id, 0))
    if (seg0 && seg0.speed !== 1) {
      const key = beltEndpointKey(
        belt.sourceMachine.id,
        belt.sourceSlot,
        belt.destinationMachine.id,
        belt.destinationSlot,
      )
      if (key !== null) {
        this.removedBeltSpeeds.set(key, seg0.speed)
      }
    }

    this.beltInventoryMigration.captureRemovedBeltInventory(belt, (segmentId) => this.sim?.getBelt(segmentId))
    for (let i = 0; i < belt.path.length - 1; i++) {
      const segmentId = ConveyorBelt.segmentIdFor(belt.id, i)
      if (this.sim.getBelt(segmentId)) {
        this.sim.removeBelt(segmentId)
      }
    }
  }

  syncAddedBelt(belt: BeltInfo): void {
    if (!this.sim || this.dryRun) return

    const key = beltEndpointKey(
      belt.sourceMachine.id,
      belt.sourceSlot,
      belt.destinationMachine.id,
      belt.destinationSlot,
    )
    const restoredSpeed = (key !== null ? this.removedBeltSpeeds.get(key) : undefined) ?? 1.0
    for (const segment of ConveyorBelt.fromBeltInfo(belt, restoredSpeed)) {
      if (!this.sim.getBelt(segment.id)) {
        this.sim.addBelt(segment)
      }
    }
    this.sim.setMachineOutputBelt(belt.sourceMachine.id, ConveyorBelt.segmentIdFor(belt.id, 0))
    this.beltInventoryMigration.markBeltAdded()
  }

  syncMachinePosition(machineId: string, x: number, z: number): void {
    this.sim?.setMachinePosition(machineId, x, z)
  }
}
