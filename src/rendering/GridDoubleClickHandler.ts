import type { Factory, MachineInfo } from '../game/Factory'
import { rotateDirectionCW } from '../game/Factory'
import type { Direction, GridPosition } from '../game/types'

export class GridDoubleClickHandler {
  private readonly factory: Factory
  private readonly updateMouseNDC: (event: MouseEvent) => void
  private readonly raycastToGrid: () => GridPosition | null
  private readonly selectMachine: (machine: MachineInfo) => void
  private readonly onFactoryChanged: () => void

  constructor(options: {
    factory: Factory
    updateMouseNDC: (event: MouseEvent) => void
    raycastToGrid: () => GridPosition | null
    selectMachine: (machine: MachineInfo) => void
    onFactoryChanged: () => void
  }) {
    this.factory = options.factory
    this.updateMouseNDC = options.updateMouseNDC
    this.raycastToGrid = options.raycastToGrid
    this.selectMachine = options.selectMachine
    this.onFactoryChanged = options.onFactoryChanged
  }

  handle(event: MouseEvent): void {
    this.updateMouseNDC(event)
    const cell = this.raycastToGrid()
    if (!cell) return

    const beltsHere = this.factory.getBeltsAt(cell.x, cell.z)
    if (beltsHere.length > 0 && !this.factory.getMachineAt(cell.x, cell.z)) return

    const machine = this.factory.getMachineAt(cell.x, cell.z)
    if (machine) {
      this.factory.rotateMachine(machine, rotateDirectionCW(machine.rotation))
      this.selectMachine(machine)
      this.onFactoryChanged()
      return
    }

    this.placeFabricator(cell)
  }

  private placeFabricator(cell: GridPosition): void {
    let rotation: Direction = 'south'
    for (let i = 0; i < 4; i++) {
      const placed = this.factory.placeMachine(cell.x, cell.z, 'part_fabricator', rotation)
      if (placed) {
        this.selectMachine(placed)
        this.onFactoryChanged()
        break
      }
      rotation = rotateDirectionCW(rotation)
    }
  }
}