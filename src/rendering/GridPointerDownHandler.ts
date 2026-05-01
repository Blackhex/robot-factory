import type * as THREE from 'three'
import type { BeltInfo, Factory, MachineInfo } from '../game/Factory'
import type { GridPosition, SlotPosition } from '../game/types'
import type { FactoryRenderer } from './FactoryRenderer'

export class GridPointerDownHandler {
  private readonly factory: Factory
  private readonly getFactoryRenderer: () => FactoryRenderer | null
  private readonly updateMouseNDC: (event: PointerEvent) => void
  private readonly raycastToGrid: () => GridPosition | null
  private readonly getRaycaster: () => THREE.Raycaster
  private readonly detectSlot: (cell: GridPosition, machine: MachineInfo) => 'input' | 'output' | null
  private readonly beginMachineDrag: (event: PointerEvent, machine: MachineInfo) => void
  private readonly beginBeltDrag: (
    event: PointerEvent,
    origin: GridPosition,
    slotType: 'input' | 'output',
    sourceSlotPosition?: SlotPosition,
  ) => void
  private readonly selectBelt: (belt: BeltInfo) => void
  private readonly deselectAll: () => void

  constructor(options: {
    factory: Factory
    getFactoryRenderer: () => FactoryRenderer | null
    updateMouseNDC: (event: PointerEvent) => void
    raycastToGrid: () => GridPosition | null
    getRaycaster: () => THREE.Raycaster
    detectSlot: (cell: GridPosition, machine: MachineInfo) => 'input' | 'output' | null
    beginMachineDrag: (event: PointerEvent, machine: MachineInfo) => void
    beginBeltDrag: (
      event: PointerEvent,
      origin: GridPosition,
      slotType: 'input' | 'output',
      sourceSlotPosition?: SlotPosition,
    ) => void
    selectBelt: (belt: BeltInfo) => void
    deselectAll: () => void
  }) {
    this.factory = options.factory
    this.getFactoryRenderer = options.getFactoryRenderer
    this.updateMouseNDC = options.updateMouseNDC
    this.raycastToGrid = options.raycastToGrid
    this.getRaycaster = options.getRaycaster
    this.detectSlot = options.detectSlot
    this.beginMachineDrag = options.beginMachineDrag
    this.beginBeltDrag = options.beginBeltDrag
    this.selectBelt = options.selectBelt
    this.deselectAll = options.deselectAll
  }

  handle(event: PointerEvent): void {
    if (event.button !== 0) return
    this.updateMouseNDC(event)

    // Check renderer hits first (machine body, slots) so a click on a tall
    // machine starts a drag even when the ground-plane raycast misses or
    // resolves to a different cell behind the machine.
    if (this.tryStartDragFromRendererHit(event)) return

    const cell = this.raycastToGrid()
    if (!cell) {
      this.deselectAll()
      return
    }

    if (this.tryStartDragFromMachineCell(event, cell)) return
    if (this.trySelectBelt(cell)) return

    this.deselectAll()
  }

  private tryStartDragFromRendererHit(event: PointerEvent): boolean {
    const factoryRenderer = this.getFactoryRenderer()
    if (!factoryRenderer) return false

    const hit = factoryRenderer.raycastInteraction(this.getRaycaster())
    if (hit && (hit.type === 'input' || hit.type === 'output')) {
      const owner = this.factory.getMachineById(hit.machineId)
      if (owner) {
        const sourceSlotPosition = this.getHitSlotPosition(owner, hit.type, hit.slotIndex)
        this.beginBeltDrag(event, { x: owner.x, z: owner.z }, hit.type, sourceSlotPosition)
        return true
      }
    }

    if (hit && hit.type === 'machine') {
      const machine = this.factory.getMachineById(hit.machineId)
      if (machine) {
        this.beginMachineDrag(event, machine)
        return true
      }
    }
    return false
  }

  private tryStartDragFromMachineCell(event: PointerEvent, cell: GridPosition): boolean {
    const existing = this.factory.getMachineAt(cell.x, cell.z)
    if (!existing) return false

    const factoryRenderer = this.getFactoryRenderer()
    const hitSlot = factoryRenderer ? null : this.detectSlot(cell, existing)
    if (hitSlot === 'output' || hitSlot === 'input') {
      this.beginBeltDrag(event, cell, hitSlot)
    } else {
      this.beginMachineDrag(event, existing)
    }
    return true
  }

  private trySelectBelt(cell: GridPosition): boolean {
    const factoryRenderer = this.getFactoryRenderer()
    if (factoryRenderer) {
      const hitBeltId = factoryRenderer.raycastBelt(this.getRaycaster())
      const beltInfo = this.factory.getBelts().find(b => b.id === hitBeltId)
      if (beltInfo) {
        this.selectBelt(beltInfo)
        return true
      }
    } else {
      const beltsHere = this.factory.getBeltsAt(cell.x, cell.z)
      if (beltsHere.length > 0) {
        this.selectBelt(beltsHere[0])
        return true
      }
    }
    return false
  }

  private getHitSlotPosition(
    owner: MachineInfo,
    slotType: 'input' | 'output',
    slotIndex: number | undefined,
  ): SlotPosition | undefined {
    if (slotIndex === undefined) return undefined
    const slotPositions = slotType === 'input' ? owner.slots.inputs : owner.slots.outputs
    return slotIndex < slotPositions.length ? slotPositions[slotIndex] : undefined
  }
}