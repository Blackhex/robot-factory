import { planBeltInventoryMigration } from './BeltInventoryMigration'
import type { ConveyorBelt } from './ConveyorBelt'
import type { BeltInfo } from './types'
import type { CapturedBeltItem, RemovedBeltInventory } from './BeltInventoryMigration'

type SegmentLookup = (segmentId: string) => ConveyorBelt | undefined

interface BeltInventoryMigrationSimulation {
  getBelt(id: string): ConveyorBelt | undefined
}

export class BeltInventoryMigrationCoordinator {
  private removedBeltInventories: RemovedBeltInventory[] = []
  private editAddedBelt = false

  beginEdit(): void {
    this.editAddedBelt = false
  }

  markBeltAdded(): void {
    this.editAddedBelt = true
  }

  hasCapturedItemsInCurrentEdit(): boolean {
    return this.removedBeltInventories.some((inventory) => inventory.items.length > 0)
  }

  discardUnmatchedRemovedBeltItemsInCurrentEdit(): void {
    this.editAddedBelt = true
  }

  captureRemovedBeltInventory(belt: BeltInfo, getSegment: SegmentLookup): void {
    const removedInventory: CapturedBeltItem[] = []
    for (let i = 0; i < belt.path.length - 1; i++) {
      const segment = getSegment(`${belt.id}_seg${i}`)
      if (!segment) continue

      // Under the discrete one-item-per-cell contract each segment holds at
      // most one item, but tolerate any incidental ordering by sorting.
      const segmentItems = [...segment.getItems()].sort(
        (a, b) => a.positionOnBelt - b.positionOnBelt,
      )
      for (const item of segmentItems) {
        const captured: CapturedBeltItem = {
          segmentIndex: i,
          positionOnCell: item.positionOnBelt,
          item,
        }
        removedInventory.push(captured)
      }
    }

    this.removedBeltInventories.push({
      sourceMachineId: belt.sourceMachine.id,
      destinationMachineId: belt.destinationMachine.id,
      sourceSlot: belt.sourceSlot,
      destinationSlot: belt.destinationSlot,
      sourceCellX: belt.path[0].x,
      sourceCellZ: belt.path[0].z,
      destinationCellX: belt.path[belt.path.length - 1].x,
      destinationCellZ: belt.path[belt.path.length - 1].z,
      segmentCount: Math.max(0, belt.path.length - 1),
      items: removedInventory,
    })
  }

  flush(sim: BeltInventoryMigrationSimulation | null, belts: Iterable<BeltInfo>): void {
    if (this.removedBeltInventories.length === 0) return
    if (!sim) {
      this.clear()
      return
    }

    const currentBelts = Array.from(belts)
    this.flushRemovedBeltInventories(sim, currentBelts)
  }

  private clear(): void {
    this.removedBeltInventories = []
  }

  private flushRemovedBeltInventories(
    sim: BeltInventoryMigrationSimulation,
    belts: readonly BeltInfo[],
  ): void {
    const plan = planBeltInventoryMigration(
      this.removedBeltInventories,
      belts,
      this.editAddedBelt,
    )

    for (const placement of plan.placements) {
      const segment = sim.getBelt(`${placement.beltId}_seg${placement.newSegmentIndex}`)
      if (!segment) {
        throw new Error(
          `BeltInventoryMigrationCoordinator: missing destination segment ` +
          `${placement.beltId}_seg${placement.newSegmentIndex} for item ${placement.item.id}`,
        )
      }
      const inserted = segment.insertItemAt(placement.item, placement.newPositionOnCell)
      if (!inserted) {
        throw new Error(
          `BeltInventoryMigrationCoordinator: insertItemAt returned false for ` +
          `${placement.beltId}_seg${placement.newSegmentIndex} (item ${placement.item.id}) — ` +
          `planner produced a colliding placement`,
        )
      }
    }

    this.removedBeltInventories = plan.remainingInventories
  }
}
