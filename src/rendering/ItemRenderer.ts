import * as THREE from 'three'
import type { ItemType } from '../game/types'

export interface BeltRenderData {
  from: { x: number; z: number }
  to: { x: number; z: number }
  prevSegmentFrom?: { x: number; z: number }
  nextSegmentTo?: { x: number; z: number }
  items: ReadonlyArray<{ type: ItemType; position: number }>
}

/** Minimal belt interface so we don't import ConveyorBelt directly. */
export interface BeltLike {
  readonly id: string
  readonly fromX: number
  readonly fromZ: number
  readonly toX: number
  readonly toZ: number
  getItems(): ReadonlyArray<{ type: ItemType; positionOnBelt: number }>
}

interface CachedSegmentInfo {
  beltId: string
  prevFrom: { x: number; z: number } | undefined
  nextTo: { x: number; z: number } | undefined
}

function catmullRom(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
): number {
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
  )
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
  private cachedSegments: CachedSegmentInfo[] = []

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

  cacheBeltTopology(belts: ReadonlyMap<string, BeltLike>): void {
    const chainMap = new Map<string, { belt: BeltLike; segIndex: number }[]>()
    const standalone: string[] = []

    for (const belt of belts.values()) {
      const match = belt.id.match(/^(.+)_seg(\d+)$/)
      if (match) {
        const chainId = match[1]
        const segIndex = parseInt(match[2], 10)
        if (!chainMap.has(chainId)) chainMap.set(chainId, [])
        chainMap.get(chainId)!.push({ belt, segIndex })
      } else {
        standalone.push(belt.id)
      }
    }

    this.cachedSegments = []

    for (const id of standalone) {
      this.cachedSegments.push({ beltId: id, prevFrom: undefined, nextTo: undefined })
    }

    for (const segs of chainMap.values()) {
      segs.sort((a, b) => a.segIndex - b.segIndex)
      for (let i = 0; i < segs.length; i++) {
        const prev = i > 0 ? segs[i - 1].belt : undefined
        const next = i < segs.length - 1 ? segs[i + 1].belt : undefined
        this.cachedSegments.push({
          beltId: segs[i].belt.id,
          prevFrom: prev ? { x: prev.fromX, z: prev.fromZ } : undefined,
          nextTo: next ? { x: next.toX, z: next.toZ } : undefined,
        })
      }
    }
  }

  buildRenderData(belts: ReadonlyMap<string, BeltLike>): BeltRenderData[] {
    const result: BeltRenderData[] = []
    for (const cached of this.cachedSegments) {
      const belt = belts.get(cached.beltId)
      if (!belt) continue
      result.push({
        from: { x: belt.fromX, z: belt.fromZ },
        to: { x: belt.toX, z: belt.toZ },
        prevSegmentFrom: cached.prevFrom,
        nextSegmentTo: cached.nextTo,
        items: belt.getItems().map((item) => ({
          type: item.type,
          position: item.positionOnBelt,
        })),
      })
    }
    return result
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

      // Build Catmull-Rom control points when prev/next context is available
      const hasPrev = belt.prevSegmentFrom !== undefined
      const hasNext = belt.nextSegmentTo !== undefined
      const useCurve = hasPrev || hasNext

      let p0x: number, p0z: number, p3x: number, p3z: number
      if (useCurve) {
        if (hasPrev) {
          p0x = belt.prevSegmentFrom!.x - halfW + 0.5
          p0z = belt.prevSegmentFrom!.z - halfH + 0.5
        } else {
          // Extrapolate backwards: from - (to - from) = 2*from - to
          p0x = 2 * fromWorldX - toWorldX
          p0z = 2 * fromWorldZ - toWorldZ
        }
        if (hasNext) {
          p3x = belt.nextSegmentTo!.x - halfW + 0.5
          p3z = belt.nextSegmentTo!.z - halfH + 0.5
        } else {
          // Extrapolate forwards: to + (to - from) = 2*to - from
          p3x = 2 * toWorldX - fromWorldX
          p3z = 2 * toWorldZ - fromWorldZ
        }
      }

      for (const item of belt.items) {
        const mesh = this.meshes.get(item.type)
        if (!mesh) continue

        const idx = counts.get(item.type) ?? 0
        if (idx >= MAX_INSTANCES) continue

        let worldX: number
        let worldZ: number

        if (useCurve) {
          worldX = catmullRom(item.position, p0x!, fromWorldX, toWorldX, p3x!)
          worldZ = catmullRom(item.position, p0z!, fromWorldZ, toWorldZ, p3z!)
        } else {
          // Linear interpolation for segments without corner context
          worldX = fromWorldX + (toWorldX - fromWorldX) * item.position
          worldZ = fromWorldZ + (toWorldZ - fromWorldZ) * item.position
        }

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

  clear(): void {
    for (const mesh of this.meshes.values()) {
      mesh.count = 0
      mesh.instanceMatrix.needsUpdate = true
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
