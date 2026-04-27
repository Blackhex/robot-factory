import * as THREE from 'three'
import type { MachineInfo } from '../game/Factory'
import { slotPositionToOffset } from '../game/Factory'
import type { GridPosition } from '../game/types'
import { createCornerBeltGeometry, getCornerOffset, getCornerRotation } from './BeltMeshRenderer'

export type GridToWorld = (x: number, z: number) => THREE.Vector3
export type MachineCellLookup = (x: number, z: number) => boolean

export class GridInteractionPreview {
  readonly highlightMesh: THREE.Mesh
  readonly ghostMesh: THREE.Mesh

  private readonly scene: THREE.Scene
  private readonly gridToWorld: GridToWorld
  private readonly hasMachineAt: MachineCellLookup

  private readonly highlightMaterial: THREE.MeshBasicMaterial
  private readonly ghostMaterial: THREE.MeshStandardMaterial
  private readonly ghostSlotInputMaterial: THREE.MeshStandardMaterial
  private readonly ghostSlotOutputMaterial: THREE.MeshStandardMaterial
  private readonly ghostSlotGeometry: THREE.BoxGeometry
  private ghostSlotMeshes: THREE.Mesh[] = []

  private readonly ghostBeltGroup = new THREE.Group()
  private ghostBeltSegments: THREE.Mesh[] = []
  private ghostCornerGeometry: THREE.BufferGeometry | null = null
  private readonly ghostBeltOkMaterial: THREE.MeshBasicMaterial
  private readonly ghostBeltBadMaterial: THREE.MeshBasicMaterial

  constructor(scene: THREE.Scene, gridToWorld: GridToWorld, hasMachineAt: MachineCellLookup) {
    this.scene = scene
    this.gridToWorld = gridToWorld
    this.hasMachineAt = hasMachineAt

    this.highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.3, depthWrite: false,
    })
    this.highlightMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.highlightMaterial)
    this.highlightMesh.rotation.x = -Math.PI / 2
    this.highlightMesh.position.y = 0.01
    this.highlightMesh.visible = false
    this.scene.add(this.highlightMesh)

    this.ghostMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false,
    })
    this.ghostMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), this.ghostMaterial)
    this.ghostMesh.position.y = 0.45
    this.ghostMesh.visible = false
    this.scene.add(this.ghostMesh)

    this.ghostSlotGeometry = new THREE.BoxGeometry(0.5, 0.12, 0.3)
    this.ghostSlotInputMaterial = new THREE.MeshStandardMaterial({
      color: 0x44ff44, emissive: 0x226622, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.5, depthWrite: false,
    })
    this.ghostSlotOutputMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8844, emissive: 0x663311, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.5, depthWrite: false,
    })

    this.ghostBeltOkMaterial = new THREE.MeshBasicMaterial({
      color: 0xaaaacc, transparent: true, opacity: 0.5, depthWrite: false,
    })
    this.ghostBeltBadMaterial = new THREE.MeshBasicMaterial({
      color: 0xff2222, transparent: true, opacity: 0.5, depthWrite: false,
    })
    this.ghostBeltGroup.visible = false
    this.scene.add(this.ghostBeltGroup)
  }

  hideHighlight(): void {
    this.highlightMesh.visible = false
  }

  moveHighlight(worldPos: THREE.Vector3): void {
    this.highlightMesh.position.set(worldPos.x, 0.01, worldPos.z)
    this.highlightMesh.visible = true
  }

  setHighlightStyle(color: number, opacity: number): void {
    this.highlightMaterial.color.setHex(color)
    this.highlightMaterial.opacity = opacity
  }

  resetHighlightStyle(): void {
    this.setHighlightStyle(0x00ff88, 0.3)
  }

  setMachineGhost(worldPos: THREE.Vector3, color: number, opacity: number): void {
    this.ghostMaterial.color.setHex(color)
    this.ghostMaterial.opacity = opacity
    this.ghostMesh.position.set(worldPos.x, 0.45, worldPos.z)
    this.ghostMesh.visible = true
  }

  hideMachineGhost(): void {
    this.ghostMesh.visible = false
  }

  setMachineGhostColor(color: number): void {
    this.ghostMaterial.color.setHex(color)
  }

  updateGhostSlots(worldPos: THREE.Vector3, machine: MachineInfo): void {
    this.clearGhostSlots()

    const inputOffsets = machine.slots.inputs.map(p => slotPositionToOffset(p, machine.rotation))
    const outputOffsets = machine.slots.outputs.map(p => slotPositionToOffset(p, machine.rotation))

    for (const offset of inputOffsets) {
      this.addGhostSlot(worldPos, offset, this.ghostSlotInputMaterial)
    }
    for (const offset of outputOffsets) {
      this.addGhostSlot(worldPos, offset, this.ghostSlotOutputMaterial)
    }
  }

  clearGhostSlots(): void {
    for (const mesh of this.ghostSlotMeshes) {
      this.scene.remove(mesh)
    }
    this.ghostSlotMeshes = []
  }

  clearGhostBelts(): void {
    for (const segment of this.ghostBeltSegments) {
      this.ghostBeltGroup.remove(segment)
      if (segment.geometry !== this.ghostCornerGeometry) {
        segment.geometry.dispose()
      }
    }
    this.ghostBeltSegments = []
    this.ghostBeltGroup.visible = false
  }

  showGhostBeltPathFromPoints(path: GridPosition[], collides: boolean, append = false): void {
    if (!append) this.clearGhostBelts()
    if (path.length < 2) return

    const material = collides ? this.ghostBeltBadMaterial : this.ghostBeltOkMaterial
    const beltWidth = 0.35
    const cellDirs = new Map<string, Set<string>>()
    const addDir = (x: number, z: number, dx: number, dz: number) => {
      const key = `${x},${z}`
      if (!cellDirs.has(key)) cellDirs.set(key, new Set())
      cellDirs.get(key)!.add(`${dx},${dz}`)
    }

    for (let index = 0; index < path.length - 1; index++) {
      const dx = path[index + 1].x - path[index].x
      const dz = path[index + 1].z - path[index].z
      addDir(path[index].x, path[index].z, dx, dz)
      addDir(path[index + 1].x, path[index + 1].z, -dx, -dz)
    }

    const machineCells = new Set<string>()
    const first = path[0]
    const last = path[path.length - 1]
    if (this.hasMachineAt(first.x, first.z)) machineCells.add(`${first.x},${first.z}`)
    if (this.hasMachineAt(last.x, last.z)) machineCells.add(`${last.x},${last.z}`)

    for (const [key, dirs] of cellDirs) {
      if (machineCells.has(key)) continue

      const [x, z] = key.split(',').map(Number)
      const worldPos = this.gridToWorld(x, z)
      const dirArray = [...dirs].map(dir => {
        const [dx, dz] = dir.split(',').map(Number)
        return { dx, dz }
      })

      if (dirArray.length === 2) {
        const [firstDir, secondDir] = dirArray
        const isCollinear = firstDir.dx + secondDir.dx === 0 && firstDir.dz + secondDir.dz === 0
        if (isCollinear) {
          this.addStraightGhostBelt(worldPos, firstDir.dx !== 0, beltWidth, material)
        } else {
          const horizontal = firstDir.dx !== 0 ? firstDir : secondDir
          const vertical = firstDir.dz !== 0 ? firstDir : secondDir
          this.addCornerGhostBelt(worldPos, horizontal.dx, vertical.dz, material)
        }
      } else if (dirArray.length === 1) {
        const dir = dirArray[0]
        this.addEndpointGhostBelt(worldPos, dir.dx, dir.dz, beltWidth, material)
      }
    }

    this.ghostBeltGroup.visible = true
  }

  resetDragPreview(): void {
    this.hideMachineGhost()
    this.clearGhostSlots()
    this.clearGhostBelts()
    this.resetHighlightStyle()
  }

  dispose(): void {
    this.highlightMesh.geometry.dispose()
    this.highlightMaterial.dispose()
    this.scene.remove(this.highlightMesh)
    this.ghostMesh.geometry.dispose()
    this.ghostMaterial.dispose()
    this.scene.remove(this.ghostMesh)
    this.clearGhostSlots()
    this.ghostSlotGeometry.dispose()
    this.ghostSlotInputMaterial.dispose()
    this.ghostSlotOutputMaterial.dispose()
    this.clearGhostBelts()
    if (this.ghostCornerGeometry) {
      this.ghostCornerGeometry.dispose()
      this.ghostCornerGeometry = null
    }
    this.ghostBeltOkMaterial.dispose()
    this.ghostBeltBadMaterial.dispose()
    this.scene.remove(this.ghostBeltGroup)
  }

  private addGhostSlot(worldPos: THREE.Vector3, offset: { x: number, z: number }, material: THREE.Material): void {
    const mesh = new THREE.Mesh(this.ghostSlotGeometry, material)
    mesh.position.set(worldPos.x + offset.x * 0.55, 0.06, worldPos.z + offset.z * 0.55)
    mesh.rotation.y = Math.atan2(offset.x, offset.z)
    this.scene.add(mesh)
    this.ghostSlotMeshes.push(mesh)
  }

  private addStraightGhostBelt(worldPos: THREE.Vector3, isHorizontal: boolean, beltWidth: number, material: THREE.Material): void {
    const geometry = new THREE.BoxGeometry(
      isHorizontal ? 1.0 : beltWidth,
      0.06,
      isHorizontal ? beltWidth : 1.0,
    )
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(worldPos.x, 0.04, worldPos.z)
    this.addGhostBeltSegment(mesh)
  }

  private addCornerGhostBelt(worldPos: THREE.Vector3, dx: number, dz: number, material: THREE.Material): void {
    const offset = getCornerOffset(dx, dz)
    const rotationY = getCornerRotation(dx, dz)
    if (!this.ghostCornerGeometry) {
      this.ghostCornerGeometry = createCornerBeltGeometry()
    }
    const mesh = new THREE.Mesh(this.ghostCornerGeometry, material)
    mesh.position.set(worldPos.x + offset.x, 0.011, worldPos.z + offset.z)
    mesh.rotation.y = rotationY
    this.addGhostBeltSegment(mesh)
  }

  private addEndpointGhostBelt(worldPos: THREE.Vector3, dx: number, dz: number, beltWidth: number, material: THREE.Material): void {
    const isHorizontal = dx !== 0
    const geometry = new THREE.BoxGeometry(
      isHorizontal ? 0.5 : beltWidth,
      0.06,
      isHorizontal ? beltWidth : 0.5,
    )
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(worldPos.x + dx * 0.25, 0.04, worldPos.z + dz * 0.25)
    this.addGhostBeltSegment(mesh)
  }

  private addGhostBeltSegment(mesh: THREE.Mesh): void {
    this.ghostBeltGroup.add(mesh)
    this.ghostBeltSegments.push(mesh)
  }

}
