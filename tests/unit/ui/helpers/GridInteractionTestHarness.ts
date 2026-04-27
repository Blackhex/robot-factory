import { beforeAll, vi } from 'vitest'
import type { SceneManager } from '../../../../src/rendering/SceneManager'
import * as THREE from 'three'

vi.mock('three', () => {
  class Vector2 { x: number; y: number; constructor(x = 0, y = 0) { this.x = x; this.y = y } }
  class Vector3 {
    x: number; y: number; z: number
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z }
    set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this }
    copy(v: Vector3) { this.x = v.x; this.y = v.y; this.z = v.z; return this }
  }
  class Plane {
    normal: Vector3; constant: number
    constructor(normal?: Vector3, constant?: number) { this.normal = normal ?? new Vector3(); this.constant = constant ?? 0 }
  }
  class Raycaster {
    ray = { intersectPlane: vi.fn().mockReturnValue(null) }
    setFromCamera = vi.fn()
  }
  const pos = () => ({ x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { (this as any).x = x; (this as any).y = y; (this as any).z = z; return this } })
  class Mesh {
    position = pos(); rotation = pos(); scale = pos(); visible = true
    geometry: any; material: any; castShadow = false; receiveShadow = false
    constructor(g?: any, m?: any) { this.geometry = g ?? { dispose: vi.fn() }; this.material = m ?? { dispose: vi.fn() } }
  }
  class Group {
    children: any[] = []; visible = true
    add(c: any) { this.children.push(c) }
    remove(c: any) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1) }
  }
  return {
    Vector2, Vector3, Plane, Raycaster, Mesh, Group,
    Scene: class { children: any[] = []; add(c: any) { this.children.push(c) }; remove() {} },
    PerspectiveCamera: class { position = pos(); lookAt = vi.fn(); updateProjectionMatrix = vi.fn() },
    PlaneGeometry: class { dispose = vi.fn() },
    BoxGeometry: class { dispose = vi.fn() },
    MeshBasicMaterial: class { dispose = vi.fn(); color = { setHex: vi.fn() }; transparent = false; opacity = 0.3 },
    MeshStandardMaterial: class { dispose = vi.fn(); color = { setHex: vi.fn() }; transparent = false; opacity = 0.4 },
    BufferGeometry: class { dispose = vi.fn(); setAttribute = vi.fn(); setIndex = vi.fn() },
    Float32BufferAttribute: class { constructor() {} },
    CanvasTexture: class { needsUpdate = false; dispose = vi.fn(); wrapS = 0; wrapT = 0; repeat = { set: vi.fn() }; offset = { set: vi.fn() }; rotation = 0; center = { set: vi.fn() }; clone() { return new (this as any).constructor() } },
    Color: class { r = 0; g = 0; b = 0; constructor() {} },
    Shape: class { moveTo() { return this }; absarc() { return this }; lineTo() { return this }; closePath() { return this } },
    ExtrudeGeometry: class { dispose = vi.fn(); rotateX() { return this } },
    DoubleSide: 2, PCFSoftShadowMap: 2, RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, NearestFilter: 1003,
    SpriteMaterial: class { dispose = vi.fn(); map: any = null },
    Sprite: class { position = pos(); scale = pos(); material: any; constructor(m?: any) { this.material = m } },
  }
})

vi.mock('../../../../src/rendering/FactoryRenderer', () => ({
  MACHINE_COLORS: {
    part_fabricator: 0x4a90e2,
    assembler: 0x7ed321,
    painter: 0xf5a623,
    recycler: 0xd0021b,
    splitter: 0x9013fe,
    factory_output: 0x50e3c2,
  },
  createCornerBeltGeometry: vi.fn(() => ({ dispose: vi.fn() })),
  getCornerOffset: vi.fn((dx: number, dz: number) => ({
    x: dx > 0 ? 0.5 : -0.5,
    z: dz > 0 ? 0.5 : -0.5,
  })),
  getCornerRotation: vi.fn(() => 0),
}))

beforeAll(() => {
  const mockCtx = {
    clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    arc: vi.fn(), quadraticCurveTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(),
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    scale: vi.fn(), setTransform: vi.fn(),
    strokeStyle: '', fillStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
    globalCompositeOperation: '', font: '', textAlign: '', textBaseline: '',
    measureText: vi.fn().mockReturnValue({ width: 10 }),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as any)
})

export const EMPTY_5x5 = {
  grid: {
    box: [0, 0, 4, 4] as [number, number, number, number],
    expected: [
      '| | | | | |',
      '| | | | | |',
      '| | | | | |',
      '| | | | | |',
      '| | | | | |',
    ].join('\n'),
  },
  machines: [],
  belts: [],
}

export const ASSEMBLER_AT_2_2 = {
  grid: {
    box: [0, 0, 4, 4] as [number, number, number, number],
    expected: [
      '| | | | | |',
      '| | | | | |',
      '| | |A| | |',
      '| | | | | |',
      '| | | | | |',
    ].join('\n'),
  },
  machines: [{ x: 2, z: 2, rotation: 'south' as const }],
  belts: [],
}

export function createMockSceneManager(): SceneManager {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  const domElement = document.createElement('canvas')
  return {
    getCamera: () => camera,
    getRenderer: () => ({ domElement }) as any,
    getScene: () => scene,
    getControls: () => ({ enabled: true }) as any,
  } as unknown as SceneManager
}