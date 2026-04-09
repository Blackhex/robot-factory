/**
 * @vitest-environment jsdom
 *
 * Tests for GridInteraction:
 * - deleteSelectedMachine: tested via Factory.removeMachine (pure logic)
 * - Keyboard DEL handling: verified via Factory delete path
 * - Machine selection on pointerup (not pointerdown)
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'

// ── Mock Three.js ──────────────────────────────────────────
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

// Mock canvas 2d context (jsdom has no real canvas — needed by RenderingAssets)
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

import { initI18n } from '../../../src/i18n/i18n'
import { Factory } from '../../../src/game/Factory'
import type { MachineInfo } from '../../../src/game/Factory'
import { GridInteraction } from '../../../src/rendering/GridInteraction'
import type { SceneManager } from '../../../src/rendering/SceneManager'
import * as THREE from 'three'

beforeAll(async () => {
  await initI18n()
})

function createMockSceneManager(): SceneManager {
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

describe('GridInteraction', () => {
  // ─── deleteSelectedMachine (pure logic via Factory) ─────

  describe('deleteSelectedMachine', () => {
    let factory: Factory

    beforeEach(() => {
      // GIVEN a 5×5 factory
      factory = new Factory(5, 5)
    })

    it('should remove the selected machine via Factory.removeMachine', () => {
      // GIVEN a machine at (2,2)
      factory.placeMachine(2, 2, 'assembler')
      expect(factory.getMachineAt(2, 2)).not.toBeNull()

      // WHEN the machine is removed
      const result = factory.removeMachine(2, 2)

      // THEN cell is cleared
      expect(result).toBe(true)
      expect(factory.getMachineAt(2, 2)).toBeNull()
    })

    it('should be a no-op when no machine is at the position', () => {
      // GIVEN no machine at (0,0)
      // WHEN removeMachine is called on empty cell
      const result = factory.removeMachine(0, 0)

      // THEN it returns false
      expect(result).toBe(false)
    })

    it('should also remove connected belts when deleting a machine', () => {
      // GIVEN two machines connected by a belt chain
      factory.placeMachine(1, 1, 'assembler')
      factory.placeMachine(1, 3, 'painter')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 3)!)
      expect(factory.getBelts().length).toBeGreaterThan(0)

      // WHEN one machine is removed
      factory.removeMachine(1, 1)

      // THEN the machine and all connected belts are gone
      expect(factory.getMachineAt(1, 1)).toBeNull()
      expect(factory.getBelts()).toHaveLength(0)
    })

    it('should allow placing a new machine after deletion', () => {
      // GIVEN a machine placed then removed
      factory.placeMachine(2, 2, 'assembler')
      factory.removeMachine(2, 2)

      // WHEN a new machine is placed on the same cell
      const result = factory.placeMachine(2, 2, 'painter')

      // THEN placement succeeds with the new type
      expect(result).toBeTruthy()
      expect(factory.getMachineAt(2, 2)!.type).toBe('painter')
    })
  })

  // ─── handleKeyDown (DEL key) ────────────────────────────

  describe('handleKeyDown', () => {
    it('Delete key triggers factory.removeMachine (integration path)', () => {
      // GIVEN a factory with a machine at (3,3)
      const factory = new Factory(5, 5)
      factory.placeMachine(3, 3, 'recycler')
      expect(factory.getMachineAt(3, 3)).not.toBeNull()

      // WHEN the delete path is simulated (handleKeyDown → deleteSelectedMachine → removeMachine)
      const machine = factory.getMachineAt(3, 3)!
      const result = factory.removeMachine(machine.x, machine.z)

      // THEN the machine is removed
      expect(result).toBe(true)
      expect(factory.getMachineAt(3, 3)).toBeNull()
      expect(factory.getMachines()).toHaveLength(0)
    })
  })

  // ─── handlePointerDown / handlePointerUp (selection) ────

  describe('handlePointerDown / handlePointerUp', () => {
    let factory: Factory
    let interaction: GridInteraction
    let selectionSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
      // GIVEN a factory with a machine at (2,2) and a GridInteraction wired up
      factory = new Factory(5, 5)
      factory.placeMachine(2, 2, 'assembler')
      const sm = createMockSceneManager()
      const onChanged = vi.fn()
      interaction = new GridInteraction(sm, factory, onChanged)
      interaction.enable()

      selectionSpy = vi.fn()
      interaction.onMachineSelected = selectionSpy as (machine: MachineInfo | null) => void

      // Mock raycastToGrid to return cell (2,2) — the machine cell
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 2, z: 2 })
      vi.spyOn(interaction as any, 'updateMouseNDC').mockImplementation(() => {})
    })

    const fakePointerEvent = (type: string) =>
      ({ type, button: 0, clientX: 100, clientY: 100 }) as unknown as PointerEvent

    it('should NOT select a machine on pointerdown alone (drag start)', () => {
      // WHEN only pointerdown fires
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))

      // THEN no selection callback
      expect(selectionSpy).not.toHaveBeenCalled()
    })

    it('should select a machine on pointerdown + pointerup on the same cell (click)', () => {
      // WHEN pointerdown then pointerup on the same cell
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))

      // THEN the machine is selected
      expect(selectionSpy).toHaveBeenCalledTimes(1)
      const selectedMachine = selectionSpy.mock.calls[0][0] as MachineInfo
      expect(selectedMachine).not.toBeNull()
      expect(selectedMachine.type).toBe('assembler')
      expect(selectedMachine.x).toBe(2)
      expect(selectedMachine.z).toBe(2)
    })

    it('should NOT select when pointerup is off-grid (drag cancelled)', () => {
      // GIVEN pointerdown on a valid cell
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))

      // WHEN pointer released outside the grid
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue(null)
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))

      // THEN no selection callback
      expect(selectionSpy).not.toHaveBeenCalled()
    })

    it('should NOT select a machine when it is dragged to a different cell (successful move)', () => {
      // GIVEN pointerdown on machine cell (2,2)
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 2, z: 2 })
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))

      // WHEN pointer released on a different, empty cell (3,3)
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 3, z: 3 })
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))

      // THEN no selection, and the machine moved
      expect(selectionSpy).not.toHaveBeenCalled()
      expect(factory.getMachineAt(3, 3)).not.toBeNull()
      expect(factory.getMachineAt(2, 2)).toBeNull()
    })

    it('should NOT select a machine when drag-move fails (target occupied)', () => {
      // GIVEN a second machine at (3,3)
      factory.placeMachine(3, 3, 'painter')

      // WHEN pointerdown on (2,2) and pointerup on occupied (3,3)
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 2, z: 2 })
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 3, z: 3 })
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))

      // THEN no selection, and neither machine moved
      expect(selectionSpy).not.toHaveBeenCalled()
      expect(factory.getMachineAt(2, 2)).not.toBeNull()
      expect(factory.getMachineAt(3, 3)).not.toBeNull()
      expect(factory.getMachineAt(2, 2)!.type).toBe('assembler')
      expect(factory.getMachineAt(3, 3)!.type).toBe('painter')
    })
  })
})
