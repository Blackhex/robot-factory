import * as THREE from 'three'
import type { ItemType } from '../game/types'

export interface BeltRenderData {
  from: { x: number; z: number }
  to: { x: number; z: number }
  items: ReadonlyArray<{ type: ItemType; position: number }>
}

const MAX_INSTANCES = 512

const ITEM_COLORS: Record<ItemType, number> = {
  wheel_small: 0xbbbbbb,
  wheel_medium: 0x999999,
  wheel_large: 0x777777,
  sensor_proximity: 0x44cc44,
  sensor_camera: 0x339933,
  sensor_lidar: 0x66ee66,
  battery_standard: 0xddaa22,
  battery_high_capacity: 0xff8833,
  chassis_light: 0x5588dd,
  chassis_heavy: 0x334488,
  circuit_basic: 0x22cccc,
  circuit_advanced: 0x118888,
  drivetrain_basic: 0xcc8844,
  drivetrain_advanced: 0x886633,
  sensor_array_basic: 0x88ee88,
  sensor_array_advanced: 0x44aa44,
  power_unit_standard: 0xcccc22,
  power_unit_high: 0xeeee44,
  robot_explorer: 0xffcc00,
  robot_worker: 0xff8800,
  robot_guardian: 0xcc4400,
  raw_material: 0xaa8866,
}

export class ItemRenderer {
  private scene: THREE.Scene
  private meshes: Map<ItemType, THREE.InstancedMesh> = new Map()
  private geometry: THREE.SphereGeometry
  private materials: Map<ItemType, THREE.MeshStandardMaterial> = new Map()
  private tempMatrix = new THREE.Matrix4()
  private tempPosition = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.geometry = new THREE.SphereGeometry(0.1, 8, 6)

    for (const [type, color] of Object.entries(ITEM_COLORS) as Array<
      [ItemType, number]
    >) {
      const material = new THREE.MeshStandardMaterial({ color })
      this.materials.set(type, material)

      const mesh = new THREE.InstancedMesh(this.geometry, material, MAX_INSTANCES)
      mesh.count = 0
      mesh.castShadow = true
      this.scene.add(mesh)
      this.meshes.set(type, mesh)
    }
  }

  update(
    belts: ReadonlyArray<BeltRenderData>,
    gridWidth: number,
    gridHeight: number,
  ): void {
    const counts = new Map<ItemType, number>()
    for (const type of this.meshes.keys()) {
      counts.set(type, 0)
    }

    const halfW = gridWidth / 2
    const halfH = gridHeight / 2

    for (const belt of belts) {
      const fromWorldX = belt.from.x - halfW + 0.5
      const fromWorldZ = belt.from.z - halfH + 0.5
      const toWorldX = belt.to.x - halfW + 0.5
      const toWorldZ = belt.to.z - halfH + 0.5

      for (const item of belt.items) {
        const mesh = this.meshes.get(item.type)
        if (!mesh) continue

        const idx = counts.get(item.type) ?? 0
        if (idx >= MAX_INSTANCES) continue

        // Interpolate position along belt
        const worldX = fromWorldX + (toWorldX - fromWorldX) * item.position
        const worldZ = fromWorldZ + (toWorldZ - fromWorldZ) * item.position

        this.tempPosition.set(worldX, 0.15, worldZ)
        this.tempMatrix.setPosition(this.tempPosition)
        mesh.setMatrixAt(idx, this.tempMatrix)

        counts.set(item.type, idx + 1)
      }
    }

    // Update mesh counts and mark instance matrices dirty
    for (const [type, mesh] of this.meshes) {
      const count = counts.get(type) ?? 0
      mesh.count = count
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true
      }
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh)
      mesh.dispose()
    }
    this.meshes.clear()

    this.geometry.dispose()

    for (const material of this.materials.values()) {
      material.dispose()
    }
    this.materials.clear()
  }
}
