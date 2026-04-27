import * as THREE from 'three'
import type { Factory, MachineInfo } from '../game/Factory'
import { slotPositionToOffset } from '../game/Factory'
import type { GridPosition } from '../game/types'

export class GridRaycastProjector {
  readonly machineDragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.45)

  private readonly camera: THREE.PerspectiveCamera
  private readonly rendererDom: HTMLElement
  private readonly factory: Factory
  private readonly mouse = new THREE.Vector2()
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly intersectPoint = new THREE.Vector3()
  private readonly raycaster = new THREE.Raycaster()

  constructor(camera: THREE.PerspectiveCamera, rendererDom: HTMLElement, factory: Factory) {
    this.camera = camera
    this.rendererDom = rendererDom
    this.factory = factory
  }

  updateMouseNDC(event: PointerEvent | MouseEvent): void {
    const rect = this.rendererDom.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  raycastToGrid(plane = this.groundPlane): GridPosition | null {
    this.refreshRaycaster()
    if (!this.raycaster.ray.intersectPlane(plane, this.intersectPoint)) return null
    const gx = Math.floor(this.intersectPoint.x + this.factory.width / 2)
    const gz = Math.floor(this.intersectPoint.z + this.factory.height / 2)
    if (!this.factory.isInBounds(gx, gz)) return null
    return { x: gx, z: gz }
  }

  raycastToDragGrid(): GridPosition | null {
    return this.raycastToGrid()
  }

  gridToWorld(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x - this.factory.width / 2 + 0.5, 0, z - this.factory.height / 2 + 0.5)
  }

  detectSlot(cell: GridPosition, machine: MachineInfo): 'input' | 'output' | null {
    const cellWorld = this.gridToWorld(cell.x, cell.z)
    const localX = this.intersectPoint.x - cellWorld.x
    const localZ = this.intersectPoint.z - cellWorld.z
    const outputOffsets = machine.slots.outputs.map(p => slotPositionToOffset(p, machine.rotation))
    const inputOffsets = machine.slots.inputs.map(p => slotPositionToOffset(p, machine.rotation))
    let bestSlot: 'input' | 'output' | null = null
    let bestDot = 0.25
    for (const off of outputOffsets) {
      const dot = localX * off.x + localZ * off.z
      if (dot > bestDot) { bestDot = dot; bestSlot = 'output' }
    }
    for (const off of inputOffsets) {
      const dot = localX * off.x + localZ * off.z
      if (dot > bestDot) { bestDot = dot; bestSlot = 'input' }
    }
    return bestSlot
  }

  getRaycaster(): THREE.Raycaster {
    this.refreshRaycaster()
    return this.raycaster
  }

  private refreshRaycaster(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera)
  }
}