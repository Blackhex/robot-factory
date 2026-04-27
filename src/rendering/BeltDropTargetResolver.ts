import type * as THREE from 'three'
import type { Factory } from '../game/Factory'
import type { GridPosition, SlotPosition } from '../game/types'
import type { FactoryRenderer } from './FactoryRenderer'
import type { BeltSlotType } from './BeltPlacementPlanner'

export class BeltDropTargetResolver {
  private static readonly NEIGHBOR_DIRS: ReadonlyArray<GridPosition> = [
    { x: 0, z: -1 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 1, z: 0 },
  ]

  private readonly factory: Factory
  private readonly getFactoryRenderer: () => FactoryRenderer | null

  constructor(options: {
    factory: Factory
    getFactoryRenderer: () => FactoryRenderer | null
  }) {
    this.factory = options.factory
    this.getFactoryRenderer = options.getFactoryRenderer
  }

  resolveDropTargetFromRaycast(raycaster: THREE.Raycaster, origin: GridPosition): GridPosition | null {
    const factoryRenderer = this.getFactoryRenderer()
    if (!factoryRenderer) return null

    const hit = factoryRenderer.raycastInteraction(raycaster)
    if (!hit || (hit.type !== 'machine' && hit.type !== 'input' && hit.type !== 'output')) return null

    const machine = this.factory.getMachineById(hit.machineId)
    if (!machine || (machine.x === origin.x && machine.z === origin.z)) return null
    return { x: machine.x, z: machine.z }
  }

  resolveTargetSlotFromRaycast(raycaster: THREE.Raycaster, origin: GridPosition): SlotPosition | undefined {
    const factoryRenderer = this.getFactoryRenderer()
    if (!factoryRenderer) return undefined

    const slotHit = factoryRenderer.raycastInteraction(raycaster)
    if (!slotHit || (slotHit.type !== 'input' && slotHit.type !== 'output') || slotHit.slotIndex === undefined) {
      return undefined
    }

    const hitMachine = this.factory.getMachineById(slotHit.machineId)
    if (!hitMachine || (hitMachine.x === origin.x && hitMachine.z === origin.z)) {
      return undefined
    }

    const slotPositions = slotHit.type === 'input' ? hitMachine.slots.inputs : hitMachine.slots.outputs
    if (slotHit.slotIndex < slotPositions.length) {
      return slotPositions[slotHit.slotIndex]
    }
    return undefined
  }

  findSnapTarget(cursorCell: GridPosition, origin: GridPosition, sourceSlotType: BeltSlotType | null): GridPosition | null {
    if (this.factory.getMachineAt(cursorCell.x, cursorCell.z)) return cursorCell
    if (!sourceSlotType) return null

    const targetSlotType: BeltSlotType = sourceSlotType === 'output' ? 'input' : 'output'

    for (const dir of BeltDropTargetResolver.NEIGHBOR_DIRS) {
      const nx = cursorCell.x + dir.x
      const nz = cursorCell.z + dir.z
      if (nx === origin.x && nz === origin.z) continue

      const machine = this.factory.getMachineAt(nx, nz)
      if (!machine) continue

      if (!this.factory.machineHasAnyBelts(nx, nz)) return { x: nx, z: nz }

      const freeSlots = this.factory.getFreeSlotsOfType(machine, targetSlotType)
      for (const slot of freeSlots) {
        if (machine.x + slot.x === cursorCell.x && machine.z + slot.z === cursorCell.z) {
          return { x: nx, z: nz }
        }
      }
    }
    return null
  }
}