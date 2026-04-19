/**
 * @vitest-environment jsdom
 *
 * Tests for FactoryRenderer icon sprites and arrow indicator meshes:
 * - Icon sprites created when machines are added
 * - Arrow meshes (input/output) created when machines are added
 * - Icons and arrows removed when machines are deleted
 * - Shared icon materials are created per machine type, not per instance
 */
import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'

// ── Mock canvas 2d context (jsdom has no real canvas) ──────

beforeAll(() => {
  const mockCtx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    quadraticCurveTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    globalCompositeOperation: '',
    font: '',
    textAlign: '',
    textBaseline: '',
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as any)
})

// ── Mock Three.js ──────────────────────────────────────────

vi.mock('three', () => {
  class Vector3 {
    x: number; y: number; z: number
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z }
    set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this }
  }

  class Group {
    children: any[] = []
    add(child: any) { this.children.push(child) }
    remove(child: any) {
      const idx = this.children.indexOf(child)
      if (idx >= 0) this.children.splice(idx, 1)
    }
  }

  class Mesh {
    position = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z } }
    rotation = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z } }
    scale = { x: 1, y: 1, z: 1, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z } }
    castShadow = false
    receiveShadow = false
    material: any
    geometry: any
    constructor(geometry?: any, material?: any) {
      this.geometry = geometry ?? { dispose: vi.fn() }
      this.material = material ?? { dispose: vi.fn() }
    }
  }

  class Sprite {
    position = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z } }
    rotation = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z } }
    scale = { x: 1, y: 1, z: 1, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z } }
    material: any
    constructor(material?: any) {
      this.material = material
    }
  }

  return {
    Vector3,
    Group,
    Mesh,
    Sprite,
    Scene: class {
      children: any[] = []
      add(child: any) { this.children.push(child) }
      remove(child: any) {
        const idx = this.children.indexOf(child)
        if (idx >= 0) this.children.splice(idx, 1)
      }
    },
    BoxGeometry: class { dispose = vi.fn(); groups: any[] = []; clearGroups() { this.groups = [] }; addGroup(start: number, count: number, materialIndex: number) { this.groups.push({start, count, materialIndex}) } },
    PlaneGeometry: class { dispose = vi.fn() },
    Color: class { value = 0; constructor(v?: number) { if (v !== undefined) this.value = v } },
    MeshStandardMaterial: class {
      dispose = vi.fn()
      map: any = null
      color: number
      constructor(opts?: any) { this.color = opts?.color ?? 0 }
    },
    MeshBasicMaterial: class {
      dispose = vi.fn()
      map: any = null
      constructor(opts?: any) { this.map = opts?.map ?? null }
    },
    SpriteMaterial: class {
      dispose = vi.fn()
      map: any = null
      constructor(opts?: any) { this.map = opts?.map ?? null }
    },
    CanvasTexture: class {
      needsUpdate = false
      dispose = vi.fn()
      wrapS = 0
      wrapT = 0
      repeat = { x: 1, y: 1, set(x: number, y: number) { this.x = x; this.y = y } }
      offset = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y } }
      rotation = 0
      center = { x: 0.5, y: 0.5, set(x: number, y: number) { this.x = x; this.y = y } }
      clone() {
        const c = new (this.constructor as any)()
        c.needsUpdate = this.needsUpdate
        c.wrapS = this.wrapS
        c.wrapT = this.wrapT
        return c
      }
    },
    GridHelper: class {
      constructor() {}
    },
    Shape: class {
      moveTo() { return this }
      absarc() { return this }
      lineTo() { return this }
      closePath() { return this }
    },
    ExtrudeGeometry: class {
      dispose = vi.fn()
      rotateX() { return this }
    },
    DoubleSide: 2,
    PCFSoftShadowMap: 2,
    RepeatWrapping: 1000,
    ClampToEdgeWrapping: 1001,
    NearestFilter: 1003,
  }
})

// ── Imports (after mock) ───────────────────────────────────

import * as THREE from 'three'
import { FactoryRenderer } from '../../../src/rendering/FactoryRenderer'
import { Factory } from '../../../src/game/Factory'
import type { MachineType } from '../../../src/game/types'
import { expectFactoryState } from '../helpers/factoryAssert'

function createMockSceneManager() {
  const scene = new THREE.Scene()
  return {
    getScene: () => scene,
    scene,
  }
}

// ── Tests ──────────────────────────────────────────────────

describe('FactoryRenderer', () => {
  let factory: Factory
  let renderer: FactoryRenderer
  let scene: any

  beforeEach(() => {
    factory = new Factory(8, 8)
    const sm = createMockSceneManager()
    scene = sm.scene
    renderer = new FactoryRenderer(factory, sm as any)
  })

  // Helper to access private maps
  const icons = (r: FactoryRenderer) => (r as any).machineIcons as Map<string, any>
  const arrows = (r: FactoryRenderer) => (r as any).machineArrows as Map<string, { inputs: any[]; outputs: any[] }>
  const iconMats = (r: FactoryRenderer) => (r as any).iconMaterials as Map<MachineType, any>

  // ── Creation ──────────────────────────────────────────

  it('creates an icon mesh when a machine is added', () => {
    // GIVEN
    factory.placeMachine(1, 1, 'assembler', 'south')
    expectFactoryState(factory, {
      grid: { box: [0, 0, 2, 2], expected: [
          '| | | |',
          '| |A| |',
          '| | | |',
        ].join('\n') },
      machines: [{ x: 1, z: 1, rotation: 'south' }],
      belts: [],
    })

    // WHEN
    renderer.updateMachines()

    // THEN
    const machine = factory.getMachineAt(1, 1)!
    expect(icons(renderer).has(machine.id)).toBe(true)
  })

  it('creates input and output arrow meshes when a machine is added', () => {
    // GIVEN
    factory.placeMachine(2, 2, 'part_fabricator', 'south')
    expectFactoryState(factory, {
      grid: { box: [1, 1, 3, 3], expected: [
          '| | | |',
          '| |F| |',
          '| | | |',
        ].join('\n') },
      machines: [{ x: 2, z: 2, rotation: 'south' }],
      belts: [],
    })

    // WHEN
    renderer.updateMachines()

    // THEN
    const machine = factory.getMachineAt(2, 2)!
    const arrowPair = arrows(renderer).get(machine.id)
    expect(arrowPair).toBeDefined()
    expect(arrowPair!.inputs.length).toBeGreaterThan(0)
    expect(arrowPair!.outputs.length).toBeGreaterThan(0)
  })

  it('adds icon mesh and arrow meshes to the scene', () => {
    // GIVEN
    factory.placeMachine(1, 1, 'recycler', 'south')
    expectFactoryState(factory, {
      grid: { box: [0, 0, 2, 2], expected: [
          '| | | |',
          '| |R| |',
          '| | | |',
        ].join('\n') },
      machines: [{ x: 1, z: 1, rotation: 'south' }],
      belts: [],
    })

    // WHEN
    renderer.updateMachines()

    // THEN
    const machine = factory.getMachineAt(1, 1)!
    const icon = icons(renderer).get(machine.id)
    const arrowPair = arrows(renderer).get(machine.id)
    expect(scene.children).toContain(icon)
    for (const m of arrowPair!.inputs) expect(scene.children).toContain(m)
    for (const m of arrowPair!.outputs) expect(scene.children).toContain(m)
  })

  it('creates icons and arrows for every machine type', () => {
    // GIVEN — use a wider grid to avoid slot-blocking between splitter/assembler and neighbors
    const wideFactory = new Factory(15, 8)
    const sm = createMockSceneManager()
    const wideRenderer = new FactoryRenderer(wideFactory, sm as any)
    const types: MachineType[] = [
      'part_fabricator', 'assembler', 'quality_checker',
      'painter', 'recycler', 'splitter',
    ]
    types.forEach((type, i) => {
      wideFactory.placeMachine(i * 2, 0, type, 'south')
    })
    expectFactoryState(wideFactory, {
      grid: { box: [0, 0, 11, 1], expected: [
          '|F| |A| |Q| |P| |R| |S| |',
          '| | | | | | | | | | | | |',
        ].join('\n') },
      machines: [
        { x: 0,  z: 0, rotation: 'south' },
        { x: 2,  z: 0, rotation: 'south' },
        { x: 4,  z: 0, rotation: 'south' },
        { x: 6,  z: 0, rotation: 'south' },
        { x: 8,  z: 0, rotation: 'south' },
        { x: 10, z: 0, rotation: 'south' },
      ],
      belts: [],
    })

    // WHEN
    wideRenderer.updateMachines()

    // THEN
    for (const type of types) {
      const machines = wideFactory.getMachines().filter((m) => m.type === type)
      expect(machines.length).toBe(1)
      const m = machines[0]
      expect(icons(wideRenderer).has(m.id)).toBe(true)
      expect(arrows(wideRenderer).has(m.id)).toBe(true)
    }
  })

  // ── Cleanup on deletion ───────────────────────────────

  it('removes icon mesh when a machine is deleted', () => {
    // GIVEN
    factory.placeMachine(1, 1, 'painter', 'south')
    expectFactoryState(factory, {
      grid: { box: [0, 0, 2, 2], expected: [
          '| | | |',
          '| |P| |',
          '| | | |',
        ].join('\n') },
      machines: [{ x: 1, z: 1, rotation: 'south' }],
      belts: [],
    })
    renderer.updateMachines()
    const machine = factory.getMachineAt(1, 1)!
    const icon = icons(renderer).get(machine.id)
    expect(icon).toBeDefined()

    // WHEN
    factory.removeMachine(1, 1)
    expectFactoryState(factory, {
      grid: { box: [0, 0, 2, 2], expected: [
          '| | | |',
          '| | | |',
          '| | | |',
        ].join('\n') },
      machines: [],
      belts: [],
    })
    renderer.updateMachines()

    // THEN
    expect(icons(renderer).has(machine.id)).toBe(false)
    expect(scene.children).not.toContain(icon)
  })

  it('removes arrow meshes when a machine is deleted', () => {
    // GIVEN
    factory.placeMachine(3, 3, 'quality_checker', 'south')
    expectFactoryState(factory, {
      grid: { box: [2, 2, 4, 4], expected: [
          '| | | |',
          '| |Q| |',
          '| | | |',
        ].join('\n') },
      machines: [{ x: 3, z: 3, rotation: 'south' }],
      belts: [],
    })
    renderer.updateMachines()
    const machine = factory.getMachineAt(3, 3)!
    const arrowPair = arrows(renderer).get(machine.id)!
    const inputArrows = [...arrowPair.inputs]
    const outputArrows = [...arrowPair.outputs]

    // WHEN
    factory.removeMachine(3, 3)
    expectFactoryState(factory, {
      grid: { box: [2, 2, 4, 4], expected: [
          '| | | |',
          '| | | |',
          '| | | |',
        ].join('\n') },
      machines: [],
      belts: [],
    })
    renderer.updateMachines()

    // THEN
    expect(arrows(renderer).has(machine.id)).toBe(false)
    for (const m of inputArrows) expect(scene.children).not.toContain(m)
    for (const m of outputArrows) expect(scene.children).not.toContain(m)
  })

  it('cleans up icons and arrows for multiple machines independently', () => {
    // GIVEN
    factory.placeMachine(0, 0, 'assembler', 'south')
    factory.placeMachine(2, 2, 'splitter', 'south')
    expectFactoryState(factory, {
      grid: { box: [0, 0, 3, 3], expected: [
          '|A| | | |',
          '| | | | |',
          '| | |S| |',
          '| | | | |',
        ].join('\n') },
      machines: [
        { x: 0, z: 0, rotation: 'south' },
        { x: 2, z: 2, rotation: 'south' },
      ],
      belts: [],
    })
    renderer.updateMachines()
    const m1 = factory.getMachineAt(0, 0)!
    const m2 = factory.getMachineAt(2, 2)!
    expect(icons(renderer).size).toBe(2)
    expect(arrows(renderer).size).toBe(2)

    // WHEN — remove only first machine
    factory.removeMachine(0, 0)
    expectFactoryState(factory, {
      grid: { box: [0, 0, 3, 3], expected: [
          '| | | | |',
          '| | | | |',
          '| | |S| |',
          '| | | | |',
        ].join('\n') },
      machines: [{ x: 2, z: 2, rotation: 'south' }],
      belts: [],
    })
    renderer.updateMachines()

    // THEN
    expect(icons(renderer).has(m1.id)).toBe(false)
    expect(icons(renderer).has(m2.id)).toBe(true)
    expect(arrows(renderer).has(m1.id)).toBe(false)
    expect(arrows(renderer).has(m2.id)).toBe(true)
  })

  // ── Shared materials ──────────────────────────────────

  it('creates shared icon materials per machine type (not per instance)', () => {
    // GIVEN — place two machines of the same type
    factory.placeMachine(0, 0, 'painter', 'south')
    factory.placeMachine(1, 0, 'painter', 'south')
    expectFactoryState(factory, {
      grid: { box: [0, 0, 2, 1], expected: [
          '|P|P| |',
          '| | | |',
        ].join('\n') },
      machines: [
        { x: 0, z: 0, rotation: 'south' },
        { x: 1, z: 0, rotation: 'south' },
      ],
      belts: [],
    })

    // WHEN
    renderer.updateMachines()

    // THEN — both meshes should reference the same shared MeshBasicMaterial
    const m1 = factory.getMachineAt(0, 0)!
    const m2 = factory.getMachineAt(1, 0)!
    const icon1 = icons(renderer).get(m1.id)
    const icon2 = icons(renderer).get(m2.id)
    expect(icon1.material).toBe(icon2.material)
    expect(icon1.material).toBe(iconMats(renderer).get('painter'))
  })

  it('has exactly one icon material per machine type', () => {
    // WHEN + THEN
    const materials = iconMats(renderer)
    const types: MachineType[] = [
      'part_fabricator', 'assembler', 'quality_checker',
      'painter', 'recycler', 'splitter', 'factory_output',
    ]
    expect(materials.size).toBe(types.length)
    for (const type of types) {
      expect(materials.has(type)).toBe(true)
    }
  })

  it('uses shared arrow materials for input and output across machines', () => {
    // GIVEN
    factory.placeMachine(0, 0, 'part_fabricator', 'south')
    factory.placeMachine(2, 0, 'assembler', 'south')
    expectFactoryState(factory, {
      grid: { box: [0, 0, 3, 1], expected: [
          '|F| |A| |',
          '| | | | |',
        ].join('\n') },
      machines: [
        { x: 0, z: 0, rotation: 'south' },
        { x: 2, z: 0, rotation: 'south' },
      ],
      belts: [],
    })

    // WHEN
    renderer.updateMachines()

    // THEN — input arrow meshes for different machines share the same material
    const m1 = factory.getMachineAt(0, 0)!
    const m2 = factory.getMachineAt(2, 0)!
    const a1 = arrows(renderer).get(m1.id)!
    const a2 = arrows(renderer).get(m2.id)!
    expect(a1.inputs[0].material).toBe(a2.inputs[0].material)
    expect(a1.outputs[0].material).toBe(a2.outputs[0].material)
    expect(a1.inputs[0].material).not.toBe(a1.outputs[0].material)
  })

  // ── dispose() ─────────────────────────────────────────

  it('dispose() removes all icons and arrows from scene', () => {
    // GIVEN
    factory.placeMachine(1, 1, 'recycler', 'south')
    factory.placeMachine(3, 3, 'splitter', 'south')
    expectFactoryState(factory, {
      grid: { box: [0, 0, 4, 4], expected: [
          '| | | | | |',
          '| |R| | | |',
          '| | | | | |',
          '| | | |S| |',
          '| | | | | |',
        ].join('\n') },
      machines: [
        { x: 1, z: 1, rotation: 'south' },
        { x: 3, z: 3, rotation: 'south' },
      ],
      belts: [],
    })
    renderer.updateMachines()
    const allIcons = [...icons(renderer).values()]
    const allArrows = [...arrows(renderer).values()]
    expect(allIcons.length).toBe(2)
    expect(allArrows.length).toBe(2)

    // WHEN
    renderer.dispose()

    // THEN
    expect(icons(renderer).size).toBe(0)
    expect(arrows(renderer).size).toBe(0)
    for (const icon of allIcons) {
      expect(scene.children).not.toContain(icon)
    }
    for (const arrowPair of allArrows) {
      for (const m of arrowPair.inputs) expect(scene.children).not.toContain(m)
      for (const m of arrowPair.outputs) expect(scene.children).not.toContain(m)
    }
  })

  // ── Machine body highlight (machine selection) ─────────────────

  describe('highlightMachine()', () => {
    it('swaps machine mesh material to highlight material', () => {
      // GIVEN a machine at (2, 2)
      factory.placeMachine(2, 2, 'assembler', 'south')
      expectFactoryState(factory, {
        grid: { box: [1, 1, 3, 3], expected: [
            '| | | |',
            '| |A| |',
            '| | | |',
          ].join('\n') },
        machines: [{ x: 2, z: 2, rotation: 'south' }],
        belts: [],
      })
      renderer.updateMachines()
      const machine = factory.getMachineAt(2, 2)!
      const meshBefore = (renderer as any).machineMeshes.get(machine.id)
      const baseMat = meshBefore.material

      // WHEN highlighting the machine
      renderer.highlightMachine(machine.id)

      // THEN material is swapped to highlight version
      expect(meshBefore.material).not.toBe(baseMat)
      expect((renderer as any).highlightedMachineId).toBe(machine.id)
    })

    it('restores previous machine material when switching highlight', () => {
      // GIVEN two machines
      factory.placeMachine(1, 1, 'assembler', 'south')
      factory.placeMachine(3, 3, 'painter', 'south')
      expectFactoryState(factory, {
        grid: { box: [0, 0, 4, 4], expected: [
            '| | | | | |',
            '| |A| | | |',
            '| | | | | |',
            '| | | |P| |',
            '| | | | | |',
          ].join('\n') },
        machines: [
          { x: 1, z: 1, rotation: 'south' },
          { x: 3, z: 3, rotation: 'south' },
        ],
        belts: [],
      })
      renderer.updateMachines()
      const m1 = factory.getMachineAt(1, 1)!
      const m2 = factory.getMachineAt(3, 3)!
      const mesh1 = (renderer as any).machineMeshes.get(m1.id)
      const baseMat1 = (renderer as any).machineMaterials.get('assembler')

      // WHEN highlighting first then second
      renderer.highlightMachine(m1.id)
      renderer.highlightMachine(m2.id)

      // THEN first machine is restored to base material
      expect(mesh1.material).toBe(baseMat1)
    })

    it('does nothing when machineId is not found', () => {
      // WHEN highlighting a non-existent machine
      renderer.highlightMachine('nonexistent_id')

      // THEN highlightedMachineId is set but no crash
      expect((renderer as any).highlightedMachineId).toBe('nonexistent_id')
    })
  })

  describe('clearMachineHighlight()', () => {
    it('restores machine mesh to base material', () => {
      // GIVEN a highlighted machine
      factory.placeMachine(2, 2, 'assembler', 'south')
      expectFactoryState(factory, {
        grid: { box: [1, 1, 3, 3], expected: [
            '| | | |',
            '| |A| |',
            '| | | |',
          ].join('\n') },
        machines: [{ x: 2, z: 2, rotation: 'south' }],
        belts: [],
      })
      renderer.updateMachines()
      const machine = factory.getMachineAt(2, 2)!
      const mesh = (renderer as any).machineMeshes.get(machine.id)
      const baseMat = (renderer as any).machineMaterials.get('assembler')
      renderer.highlightMachine(machine.id)
      expect(mesh.material).not.toBe(baseMat)

      // WHEN clearing the highlight
      renderer.clearMachineHighlight()

      // THEN material is restored
      expect(mesh.material).toBe(baseMat)
    })

    it('does not throw when no machine is highlighted', () => {
      expect(() => renderer.clearMachineHighlight()).not.toThrow()
    })

    it('resets highlightedMachineId to null', () => {
      factory.placeMachine(2, 2, 'assembler', 'south')
      expectFactoryState(factory, {
        grid: { box: [1, 1, 3, 3], expected: [
            '| | | |',
            '| |A| |',
            '| | | |',
          ].join('\n') },
        machines: [{ x: 2, z: 2, rotation: 'south' }],
        belts: [],
      })
      renderer.updateMachines()
      renderer.highlightMachine(factory.getMachineAt(2, 2)!.id)
      expect((renderer as any).highlightedMachineId).not.toBeNull()

      renderer.clearMachineHighlight()

      expect((renderer as any).highlightedMachineId).toBeNull()
    })
  })

  describe('dispose() highlight material cleanup', () => {
    it('disposes highlight materials on dispose()', () => {
      const hlMaterials = (renderer as any).machineHighlightMaterials as Map<string, any>
      const disposeFns = Array.from(hlMaterials.values()).map((m: any) => m.dispose)

      renderer.dispose()

      for (const fn of disposeFns) {
        expect(fn).toHaveBeenCalled()
      }
    })
  })
})

// ── Pure-math corner helpers (no Three.js needed) ─────────

import { getCornerRotation, getCornerOffset, BELT_WIDTH, CORNER_OUTER_R, CORNER_INNER_R } from '../../../src/rendering/FactoryRenderer'

describe('getCornerRotation()', () => {
  it('returns 0 for West+South (hx<0, vz>0)', () => {
    // WHEN + THEN
    expect(getCornerRotation(-1, 1)).toBe(0)
  })

  it('returns -PI/2 for West+North (hx<0, vz<0)', () => {
    // WHEN + THEN
    expect(getCornerRotation(-1, -1)).toBe(-Math.PI / 2)
  })

  it('returns PI/2 for East+South (hx>0, vz>0)', () => {
    // WHEN + THEN
    expect(getCornerRotation(1, 1)).toBe(Math.PI / 2)
  })

  it('returns PI for East+North (hx>0, vz<0)', () => {
    // WHEN + THEN
    expect(getCornerRotation(1, -1)).toBe(Math.PI)
  })
})

describe('getCornerOffset()', () => {
  it('returns (+0.5, +0.5) for East+South', () => {
    // WHEN + THEN
    expect(getCornerOffset(1, 1)).toEqual({ x: 0.5, z: 0.5 })
  })

  it('returns (+0.5, -0.5) for East+North', () => {
    // WHEN + THEN
    expect(getCornerOffset(1, -1)).toEqual({ x: 0.5, z: -0.5 })
  })

  it('returns (-0.5, +0.5) for West+South', () => {
    // WHEN + THEN
    expect(getCornerOffset(-1, 1)).toEqual({ x: -0.5, z: 0.5 })
  })

  it('returns (-0.5, -0.5) for West+North', () => {
    // WHEN + THEN
    expect(getCornerOffset(-1, -1)).toEqual({ x: -0.5, z: -0.5 })
  })
})

describe('Belt geometry constants', () => {
  it('BELT_WIDTH is 0.35', () => {
    // WHEN + THEN
    expect(BELT_WIDTH).toBe(0.35)
  })

  it('CORNER_OUTER_R equals 0.5 + BELT_WIDTH/2', () => {
    // WHEN + THEN
    expect(CORNER_OUTER_R).toBeCloseTo(0.675)
  })

  it('CORNER_INNER_R equals 0.5 - BELT_WIDTH/2', () => {
    // WHEN + THEN
    expect(CORNER_INNER_R).toBeCloseTo(0.325)
  })

  it('ring width matches belt width', () => {
    // WHEN + THEN
    expect(CORNER_OUTER_R - CORNER_INNER_R).toBeCloseTo(BELT_WIDTH)
  })
})
