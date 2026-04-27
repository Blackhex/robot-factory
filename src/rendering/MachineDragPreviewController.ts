import type * as THREE from 'three'
import type { Factory } from '../game/Factory'
import type { GridPosition } from '../game/types'
import { MACHINE_COLORS } from './FactoryRenderer'
import type { GridInteractionPreview } from './GridInteractionPreview'

export class MachineDragPreviewController {
  private readonly factory: Factory
  private readonly preview: GridInteractionPreview

  constructor(factory: Factory, preview: GridInteractionPreview) {
    this.factory = factory
    this.preview = preview
  }

  showPreview(options: {
    origin: GridPosition
    cell: GridPosition
    worldPos: THREE.Vector3
    connectedMachines: Array<{ position: GridPosition, machineIsSource: boolean }>
    ignoreBeltIds: ReadonlySet<string>
  }): void {
    const { origin, cell, worldPos, connectedMachines, ignoreBeltIds } = options
    const canMove = this.factory.canMoveMachine(origin.x, origin.z, cell.x, cell.z)
    if (canMove) {
      this.preview.setHighlightStyle(0x00ff88, 0.5)
      const machineType = this.factory.getMachineAt(origin.x, origin.z)?.type
      this.preview.setMachineGhost(worldPos, machineType ? MACHINE_COLORS[machineType] ?? 0xffffff : 0xffffff, 0.7)
    } else {
      this.preview.setHighlightStyle(0xff4444, 0.5)
      this.preview.setMachineGhost(worldPos, 0xff4444, 0.5)
    }

    const draggedMachine = this.factory.getMachineAt(origin.x, origin.z)
    if (draggedMachine) {
      this.preview.updateGhostSlots(worldPos, draggedMachine)
    }

    this.preview.clearGhostBelts()
    const ghostBlockedCells = new Set<string>()
    for (const conn of connectedMachines) {
      if (!draggedMachine) continue
      const result = this.factory.computeReconnectPath(
        cell.x, cell.z,
        draggedMachine.type, draggedMachine.rotation,
        conn.position, conn.machineIsSource,
        ignoreBeltIds,
        ghostBlockedCells.size > 0 ? ghostBlockedCells : undefined,
      )
      if (result) {
        const collides = !canMove || result.collides
        this.preview.showGhostBeltPathFromPoints(result.path, collides, true)
        for (let i = 1; i < result.path.length - 1; i++) {
          ghostBlockedCells.add(`${result.path[i].x},${result.path[i].z}`)
        }
      }
    }
  }
}