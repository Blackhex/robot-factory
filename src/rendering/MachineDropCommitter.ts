import type { Factory, MachineInfo } from '../game/Factory'
import type { GridPosition } from '../game/types'

type GridRaycast = () => GridPosition | null
type CommitGuard = <T>(commit: () => T) => T

export type MachineDropCommitterOptions = {
  factory: Factory
  raycastToBodyGrid: GridRaycast
  raycastToGroundGrid: GridRaycast
  runCommit: CommitGuard
  selectMachine: (machine: MachineInfo) => void
  onFactoryChanged: () => void
}

export class MachineDropCommitter {
  private readonly factory: Factory
  private readonly raycastToBodyGrid: GridRaycast
  private readonly raycastToGroundGrid: GridRaycast
  private readonly runCommit: CommitGuard
  private readonly selectMachine: (machine: MachineInfo) => void
  private readonly onFactoryChanged: () => void

  constructor(options: MachineDropCommitterOptions) {
    this.factory = options.factory
    this.raycastToBodyGrid = options.raycastToBodyGrid
    this.raycastToGroundGrid = options.raycastToGroundGrid
    this.runCommit = options.runCommit
    this.selectMachine = options.selectMachine
    this.onFactoryChanged = options.onFactoryChanged
  }

  resolveDropCell(origin: GridPosition): GridPosition | null {
    const bodyCell = this.raycastToBodyGrid()
    if (
      bodyCell &&
      (bodyCell.x !== origin.x || bodyCell.z !== origin.z) &&
      !this.factory.getMachineAt(bodyCell.x, bodyCell.z)
    ) {
      return bodyCell
    }

    const groundCell = this.raycastToGroundGrid()
    if (!groundCell) return bodyCell
    if (groundCell.x === origin.x && groundCell.z === origin.z) return groundCell
    if (this.factory.getMachineAt(groundCell.x, groundCell.z)) return groundCell

    const corrected = {
      x: groundCell.x + Math.sign(groundCell.x - origin.x),
      z: groundCell.z + Math.sign(groundCell.z - origin.z),
    }
    if (!this.factory.isInBounds(corrected.x, corrected.z)) return groundCell
    if (this.factory.getMachineAt(corrected.x, corrected.z)) return groundCell
    return corrected
  }

  commitDrop(origin: GridPosition, cell: GridPosition): void {
    const sameCell = cell.x === origin.x && cell.z === origin.z
    if (sameCell) {
      const machine = this.factory.getMachineAt(origin.x, origin.z)
      if (machine) this.selectMachine(machine)
      return
    }

    const target = this.factory.getMachineAt(cell.x, cell.z)
    if (target) return

    const canMove = this.factory.canMoveMachine(origin.x, origin.z, cell.x, cell.z)
    if (!canMove) return

    const moved = this.runCommit(() => this.factory.moveMachine(origin.x, origin.z, cell.x, cell.z))
    if (moved) this.onFactoryChanged()
  }
}