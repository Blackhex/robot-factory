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
import { expectFactoryState } from '../helpers/factoryAssert'

// ── Shared snapshots used by multiple tests ────────────────
const EMPTY_5x5 = {
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
const ASSEMBLER_AT_2_2 = {
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
      factory.placeMachine(2, 2, 'assembler', 'south')
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      expect(factory.getMachineAt(2, 2)).not.toBeNull()

      // WHEN the machine is removed
      const result = factory.removeMachine(2, 2)
      expectFactoryState(factory, EMPTY_5x5)

      // THEN cell is cleared
      expect(result).toBe(true)
      expect(factory.getMachineAt(2, 2)).toBeNull()
    })

    it('should be a no-op when no machine is at the position', () => {
      // GIVEN no machine at (0,0)
      expectFactoryState(factory, EMPTY_5x5)
      // WHEN removeMachine is called on empty cell
      const result = factory.removeMachine(0, 0)
      expectFactoryState(factory, EMPTY_5x5)

      // THEN it returns false
      expect(result).toBe(false)
    })

    it('should also remove connected belts when deleting a machine', () => {
      // GIVEN two machines connected by a belt chain
      factory.placeMachine(1, 1, 'assembler', 'south')
      factory.placeMachine(1, 3, 'painter', 'south')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 3)!)
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 4],
          expected: [
            '| | | | | |',
            '| |A| | | |',
            '| |\u2502| | | |',
            '| |P| | | |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 1, z: 1, rotation: 'south' },
          { x: 1, z: 3, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 1, z: 1 },
            destination: { x: 1, z: 3 },
            path: [{ x: 1, z: 1 }, { x: 1, z: 2 }, { x: 1, z: 3 }],
          },
        ],
      })
      expect(factory.getBelts().length).toBeGreaterThan(0)

      // WHEN one machine is removed
      factory.removeMachine(1, 1)
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 4],
          expected: [
            '| | | | | |',
            '| | | | | |',
            '| | | | | |',
            '| |P| | | |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [{ x: 1, z: 3, rotation: 'south' }],
        belts: [],
      })

      // THEN the machine and all connected belts are gone
      expect(factory.getMachineAt(1, 1)).toBeNull()
      expect(factory.getBelts()).toHaveLength(0)
    })

    it('should allow placing a new machine after deletion', () => {
      // GIVEN a machine placed then removed
      factory.placeMachine(2, 2, 'assembler', 'south')
      factory.removeMachine(2, 2)
      expectFactoryState(factory, EMPTY_5x5)

      // WHEN a new machine is placed on the same cell
      const result = factory.placeMachine(2, 2, 'painter', 'south')
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 4],
          expected: [
            '| | | | | |',
            '| | | | | |',
            '| | |P| | |',
            '| | | | | |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [{ x: 2, z: 2, rotation: 'south' }],
        belts: [],
      })

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
      factory.placeMachine(3, 3, 'recycler', 'south')
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 4],
          expected: [
            '| | | | | |',
            '| | | | | |',
            '| | | | | |',
            '| | | |R| |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [{ x: 3, z: 3, rotation: 'south' }],
        belts: [],
      })
      expect(factory.getMachineAt(3, 3)).not.toBeNull()

      // WHEN the delete path is simulated (handleKeyDown → deleteSelectedMachine → removeMachine)
      const machine = factory.getMachineAt(3, 3)!
      const result = factory.removeMachine(machine.x, machine.z)
      expectFactoryState(factory, EMPTY_5x5)

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
      factory.placeMachine(2, 2, 'assembler', 'south')
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
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      // WHEN only pointerdown fires
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      // THEN no selection callback
      expect(selectionSpy).not.toHaveBeenCalled()
    })

    it('should select a machine on pointerdown + pointerup on the same cell (click)', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      // WHEN pointerdown then pointerup on the same cell
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      // THEN the machine is selected
      expect(selectionSpy).toHaveBeenCalledTimes(1)
      const selectedMachine = selectionSpy.mock.calls[0][0] as MachineInfo
      expect(selectedMachine).not.toBeNull()
      expect(selectedMachine.type).toBe('assembler')
      expect(selectedMachine.x).toBe(2)
      expect(selectedMachine.z).toBe(2)
    })

    it('should NOT select when pointerup is off-grid (drag cancelled)', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      // GIVEN pointerdown on a valid cell
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))

      // WHEN pointer released outside the grid
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue(null)
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      // THEN no selection callback
      expect(selectionSpy).not.toHaveBeenCalled()
    })

    it('should NOT select a machine when it is dragged to a different cell (successful move)', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      // GIVEN pointerdown on machine cell (2,2)
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 2, z: 2 })
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))

      // WHEN pointer released on a different, empty cell (3,3)
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 3, z: 3 })
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 4],
          expected: [
            '| | | | | |',
            '| | | | | |',
            '| | | | | |',
            '| | | |A| |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [{ x: 3, z: 3, rotation: 'south' }],
        belts: [],
      })

      // THEN no selection, and the machine moved
      expect(selectionSpy).not.toHaveBeenCalled()
      expect(factory.getMachineAt(3, 3)).not.toBeNull()
      expect(factory.getMachineAt(2, 2)).toBeNull()
    })

    it('should NOT select a machine when drag-move fails (target occupied)', () => {
      // GIVEN a second machine at (3,3)
      factory.placeMachine(3, 3, 'painter', 'south')
      const A_AND_P = {
        grid: {
          box: [0, 0, 4, 4] as [number, number, number, number],
          expected: [
            '| | | | | |',
            '| | | | | |',
            '| | |A| | |',
            '| | | |P| |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 2, z: 2, rotation: 'south' as const },
          { x: 3, z: 3, rotation: 'south' as const },
        ],
        belts: [],
      }
      expectFactoryState(factory, A_AND_P)

      // WHEN pointerdown on (2,2) and pointerup on occupied (3,3)
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 2, z: 2 })
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 3, z: 3 })
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))
      expectFactoryState(factory, A_AND_P)

      // THEN no selection, and neither machine moved
      expect(selectionSpy).not.toHaveBeenCalled()
      expect(factory.getMachineAt(2, 2)).not.toBeNull()
      expect(factory.getMachineAt(3, 3)).not.toBeNull()
      expect(factory.getMachineAt(2, 2)!.type).toBe('assembler')
      expect(factory.getMachineAt(3, 3)!.type).toBe('painter')
    })
  })

  // ─── tryPlaceBeltChain: source-slot fallback contract ────
  //
  // Regression: when the user drags from a SPECIFIC source slot of a machine
  // (sourceSlotPosition is set) and routing from that slot fails, the system
  // must NOT silently fall back to the REVERSE slot type (input ↔ output) —
  // doing so creates a belt of the wrong semantic direction (e.g. an "output"
  // drag silently produces an INPUT belt to the same machine).
  //
  // Repro scenario (from issue):
  //   A = part_fabricator at (5,5) rot=south → output 'front' faces +z (5,6),
  //                                            input  'back'  faces -z (5,4)
  //   B = part_fabricator at (5,8) rot=south → input 'back' at (5,7)
  //   Belt A.front → B.back occupies (5,6) and (5,7), so A's OUTPUT slot is taken.
  //   C = part_fabricator at (8,8) rot=south.
  //   User drags from A's OUTPUT slot 'front' toward C.
  //
  // Expected contract: when sourceSlotPosition='front' (output) cannot route,
  // tryPlaceBeltChain must fail rather than fall back to A's INPUT slot 'back'.

  describe('tryPlaceBeltChain — source-slot fallback contract', () => {
    it('does NOT silently switch to the opposite slot type when sourceSlotPosition is set and routing fails', () => {
      // GIVEN A → B already wired through A's OUTPUT slot (A.front = (5,6)),
      //       and a third machine C that would be reachable only via A's input.
      const factory = new Factory(15, 15)
      const A = factory.placeMachine(5, 5, 'part_fabricator', 'south')!
      const B = factory.placeMachine(5, 8, 'part_fabricator', 'south')!
      const C = factory.placeMachine(8, 8, 'part_fabricator', 'south')!

      // Wire A.front (output) → B.back (input). After this A's output slot is occupied.
      const wired = factory.placeBeltChain(A, B, 'output')
      expect(wired).toBe(true)
      const beltsAfterSetup = factory.getBelts().length
      expect(beltsAfterSetup).toBe(1)
      const SOURCE_SLOT_FIXTURE = {
        grid: {
          box: [3, 3, 10, 10] as [number, number, number, number],
          expected: [
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | |F| | | | | |',
            '| | |\u2502| | | | | |',
            '| | |\u2502| | | | | |',
            '| | |F| | |F| | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 5, z: 5, rotation: 'south' as const },
          { x: 5, z: 8, rotation: 'south' as const },
          { x: 8, z: 8, rotation: 'south' as const },
        ],
        belts: [
          {
            source: { x: 5, z: 5 },
            destination: { x: 5, z: 8 },
            path: [{ x: 5, z: 5 }, { x: 5, z: 6 }, { x: 5, z: 7 }, { x: 5, z: 8 }],
          },
        ],
      }
      expectFactoryState(factory, SOURCE_SLOT_FIXTURE)

      const sm = createMockSceneManager()
      const interaction = new GridInteraction(sm, factory, vi.fn())

      // WHEN the user drags from A's specific OUTPUT slot 'front' toward C.
      // sourceSlotPosition='front' tells the system: "I clicked THIS slot — do not pick another."
      const placed = (interaction as any).tryPlaceBeltChain(
        A, C, 'output', /* targetSlotPosition */ undefined, /* sourceSlotPosition */ 'front',
      )
      // tryPlaceBeltChain must fail when source-slot routing is impossible — no new belt.
      expectFactoryState(factory, SOURCE_SLOT_FIXTURE)

      // THEN: routing from the chosen output slot fails (it is occupied), so no belt
      // should be placed using A's INPUT slot 'back'. Either nothing was placed, or
      // any newly placed belt must NOT touch A as an input-side endpoint.
      const beltsAfter = factory.getBelts()
      const newBelts = beltsAfter.slice(beltsAfterSetup)

      // The original A → B belt must still exist and be unchanged.
      const originalStillThere = beltsAfter.some(b =>
        b.sourceMachine.id === A.id && b.sourceSlot === 'front' &&
        b.destinationMachine.id === B.id && b.destinationSlot === 'back',
      )
      expect(originalStillThere).toBe(true)

      // No new belt may use A as the destination via its INPUT slot 'back'
      // (this is the buggy reverse-fallback signature).
      const reverseFallbackBelt = newBelts.find(b =>
        b.destinationMachine.id === A.id && b.destinationSlot === 'back',
      )
      expect(reverseFallbackBelt, 'reverse slot-type fallback should not run when sourceSlotPosition is set').toBeUndefined()

      // And tryPlaceBeltChain should report failure when the user-chosen slot cannot route.
      expect(placed, 'tryPlaceBeltChain must fail when the chosen source slot cannot route — it must not silently flip slot type').toBe(false)
    })

    // Regression: when the user explicitly clicks a source slot on an UNCONNECTED
    // (auto-rotatable) machine and a short, non-looping belt is achievable by
    // rotating the source, tryPlaceBeltChain must NOT prefer a strict-rotation
    // belt that loops the long way around the source machine.
    //
    // Repro:
    //   MF = part_fabricator at (5,5) rot='west' → front (output) faces west at (4,5)
    //   D  = part_fabricator at (8,5) rot='west'  (unconnected; auto-rotatable)
    //   User drags from MF's 'front' slot toward D.
    //
    // With strict rotation the only path goes (5,5)→(4,5)→…→loops around→…→D,
    // ≥7 cells, while a relaxed (auto-rotating) attempt could route a short
    // straight 2-cell belt MF→D once MF rotates to 'east'. The current code
    // commits the first successful attempt, which is the looping one.
    it('does not commit a looping strict-rotation belt when sourceSlotPosition is set and a shorter auto-rotating belt is possible', () => {
      const factory = new Factory(20, 20)
      const MF = factory.placeMachine(5, 5, 'part_fabricator', 'south')!
      const D = factory.placeMachine(8, 5, 'part_fabricator', 'south')!

      // Rotate both to 'west'. They are unconnected so rotation must succeed.
      expect(factory.rotateMachine(MF, 'west')).toBe(true)
      expect(factory.rotateMachine(D, 'west')).toBe(true)
      expect(MF.rotation).toBe('west')
      expect(D.rotation).toBe('west')
      expect(factory.getBelts().length).toBe(0)
      expectFactoryState(factory, {
        grid: {
          box: [3, 3, 10, 10],
          expected: [
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | |F| | |F| | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 5, z: 5, rotation: 'west' },
          { x: 8, z: 5, rotation: 'west' },
        ],
        belts: [],
      })

      const sm = createMockSceneManager()
      const interaction = new GridInteraction(sm, factory, vi.fn())

      // User explicitly clicked MF's 'front' (output) slot — currently facing west.
      const placed = (interaction as any).tryPlaceBeltChain(
        MF, D, 'output', /* targetSlotPosition */ undefined, /* sourceSlotPosition */ 'front',
      )
      expectFactoryState(factory, {
        grid: {
          box: [3, 3, 10, 10],
          expected: [
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | |F| | |F| | |',
            '| | |\u2514|\u2500|\u2500|\u2518| | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 5, z: 5, rotation: 'south' },
          { x: 8, z: 5, rotation: 'north' },
        ],
        belts: [
          {
            source: { x: 5, z: 5 },
            destination: { x: 8, z: 5 },
            path: [{ x: 5, z: 5 }, { x: 5, z: 6 }, { x: 6, z: 6 }, { x: 7, z: 6 }, { x: 8, z: 6 }, { x: 8, z: 5 }],
          },
        ],
      })

      expect(placed, 'a belt should be placed (either by auto-rotating MF or routing through a short alternative)').toBe(true)

      // Primary contract assertion: the user clicked MF's 'front' slot. If the
      // implementation kept MF facing 'west', the only way it could have
      // succeeded was the strict long-loop path — which is exactly the bug.
      expect(MF.rotation, 'MF should not remain facing west — that means a long looping strict-rotation belt was committed').not.toBe('west')

      // Secondary safety net: even if a future implementation finds a different
      // short belt without rotating MF, it must NOT loop around MF (no belt cell
      // strictly west of MF), and the total path must be short.
      const belts = factory.getBelts()
      const beltCells = belts.flatMap(b => b.path.map(c => ({ x: c.x, z: c.z })))
      const wrapsAroundMF = beltCells.some(c => c.x < MF.x)
      expect(wrapsAroundMF, 'belt must not wrap around MF (no cells west of MF at x=5)').toBe(false)
      expect(beltCells.length, `belt path must be short (≤6 cells), got ${beltCells.length}`).toBeLessThanOrEqual(6)
    })
  })

  // ─── RED: explicit-slot drop with no valid same-direction connection ─────
  //
  // The Round-4 fix added an `explicitSlot = !!sourceSlotPosition || !!targetSlotPosition`
  // gate in `tryPlaceBeltChain` and `computeBestBeltPath` that COMPLETELY disables
  // the reverse-slot-type fallback when the user clicked a specific slot. This
  // over-corrected: when the explicit-slot direction is geometrically impossible
  // (the only slot of the chosen type is consumed by another belt and there is
  // no free slot of that type elsewhere on the target), the fallback MUST still
  // fire as a LAST RESORT — otherwise the user gets a silent no-op and an
  // ambiguous WHITE ghost.

  describe('explicit-slot drop with no valid same-direction connection', () => {
    it('reverse-slot fallback fires from tryPlaceBeltChain when planner returns null', () => {
      // GIVEN — F1/F2/F3 fixture from SlotDragRotationFallback. F3.output is
      // already consumed by an F3→F1 belt, so a drag from F2's INPUT slot 'back'
      // toward F3 cannot connect under the explicit (input) direction. The
      // last-resort reverse-slot fallback (F2.output → F3.input) must fire.
      const factory = new Factory(10, 10)
      factory.restoreState(
        [
          { x: 1, z: 1, type: 'part_fabricator', rotation: 'west' },
          { x: 1, z: 2, type: 'part_fabricator', rotation: 'east' },
          { x: 3, z: 2, type: 'part_fabricator', rotation: 'west' },
        ],
        [
          {
            sourceSlot: 'front',
            destinationSlot: 'back',
            path: [
              { x: 3, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 1 }, { x: 1, z: 1 },
            ],
          },
        ],
      )
      const F2 = factory.getMachineAt(1, 2)!
      const F3 = factory.getMachineAt(3, 2)!
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 5, 5],
          expected: [
            '| | | | | | |',
            '| |F|\u2510| | | |',
            '| |F|\u2514|F| | |',
            '| | | | | | |',
            '| | | | | | |',
            '| | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 1, z: 1, rotation: 'west' },
          { x: 1, z: 2, rotation: 'east' },
          { x: 3, z: 2, rotation: 'west' },
        ],
        belts: [
          {
            source: { x: 3, z: 2 },
            destination: { x: 1, z: 1 },
            path: [{ x: 3, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 1 }, { x: 1, z: 1 }],
          },
        ],
      })

      const sm = createMockSceneManager()
      const interaction = new GridInteraction(sm, factory, vi.fn())

      const beltsBefore = factory.getBelts().length

      // WHEN — call tryPlaceBeltChain via bracket access (private)
      const placed = (interaction as any).tryPlaceBeltChain(
        F2, F3, 'input', /* targetSlotPosition */ undefined, /* sourceSlotPosition */ 'back',
      )
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 5, 5],
          expected: [
            '| | | | | | |',
            '| |F|\u2510| | | |',
            '|\u250C|F|\u2514|F|\u2510| |',
            '|\u2514|\u2500|\u2500|\u2500|\u2518| |',
            '| | | | | | |',
            '| | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 1, z: 1, rotation: 'west' },
          { x: 1, z: 2, rotation: 'west' },
          { x: 3, z: 2, rotation: 'west' },
        ],
        belts: [
          {
            source: { x: 3, z: 2 },
            destination: { x: 1, z: 1 },
            path: [{ x: 3, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 1 }, { x: 1, z: 1 }],
          },
          {
            source: { x: 1, z: 2 },
            destination: { x: 3, z: 2 },
            path: [{ x: 1, z: 2 }, { x: 0, z: 2 }, { x: 0, z: 3 }, { x: 1, z: 3 }, { x: 2, z: 3 }, { x: 3, z: 3 }, { x: 4, z: 3 }, { x: 4, z: 2 }, { x: 3, z: 2 }],
          },
        ],
      })

      // THEN — placement succeeds via the reverse-slot fallback, and the
      // resulting belt's flow direction is REVERSED: F2 → F3 (output → input).
      expect(placed, 'reverse-slot fallback must fire as last resort when explicit-slot direction is impossible').toBe(true)
      const belts = factory.getBelts()
      expect(belts.length).toBe(beltsBefore + 1)
      const newBelt = belts.find(b =>
        b.sourceMachine.id === F2.id && b.destinationMachine.id === F3.id,
      )
      expect(newBelt, 'new belt must be F2 (output) → F3 (input)').toBeDefined()
      // F2's rotation may have changed to make the output slot face F3.
      const F2After = factory.getMachineAt(1, 2)!
      expect(['west', 'south', 'north']).toContain(F2After.rotation)
    })

    it('computeBestBeltPath returns red ghost (collides=true) when planner returns null AND reverse fallback also fails', () => {
      // GIVEN — a layout where neither direction can route. A is fully boxed
      // in by recyclers on all 4 sides AND B has no free slots either: B is
      // ringed by belts on every side via dummy connections. We approximate
      // this by surrounding A with recyclers and placing B (target) such that
      // its only input cell is also blocked.
      //
      // Simpler: place A at (5,5) ringed by recyclers (no rotation works
      // for A.front in any direction), and B at (8,5) ALSO ringed so its
      // input slots are all blocked. Then both 'output' and 'input'
      // (reverse) fail.
      const factory = new Factory(15, 15)
      factory.restoreState(
        [
          { x: 5, z: 5, type: 'part_fabricator', rotation: 'south' }, // A
          { x: 5, z: 4, type: 'recycler', rotation: 'south' },
          { x: 5, z: 6, type: 'recycler', rotation: 'south' },
          { x: 4, z: 5, type: 'recycler', rotation: 'south' },
          { x: 6, z: 5, type: 'recycler', rotation: 'south' },
          { x: 8, z: 5, type: 'part_fabricator', rotation: 'east' },  // B
          { x: 8, z: 4, type: 'recycler', rotation: 'south' },
          { x: 8, z: 6, type: 'recycler', rotation: 'south' },
          { x: 7, z: 5, type: 'recycler', rotation: 'south' },
          { x: 9, z: 5, type: 'recycler', rotation: 'south' },
        ],
        [],
      )
      const A = factory.getMachineAt(5, 5)!
      const B = factory.getMachineAt(8, 5)!
      const BOXED_FIXTURE = {
        grid: {
          box: [3, 3, 10, 7] as [number, number, number, number],
          expected: [
            '| | | | | | | | |',
            '| | |R| | |R| | |',
            '| |R|F|R|R|F|R| |',
            '| | |R| | |R| | |',
            '| | | | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 5, z: 5, rotation: 'south' as const },
          { x: 5, z: 4, rotation: 'south' as const },
          { x: 5, z: 6, rotation: 'south' as const },
          { x: 4, z: 5, rotation: 'south' as const },
          { x: 6, z: 5, rotation: 'south' as const },
          { x: 8, z: 5, rotation: 'east' as const },
          { x: 8, z: 4, rotation: 'south' as const },
          { x: 8, z: 6, rotation: 'south' as const },
          { x: 7, z: 5, rotation: 'south' as const },
          { x: 9, z: 5, rotation: 'south' as const },
        ],
        belts: [],
      }
      expectFactoryState(factory, BOXED_FIXTURE)

      const sm = createMockSceneManager()
      const interaction = new GridInteraction(sm, factory, vi.fn())

      // WHEN — compute the best belt path with explicit source slot
      const result = (interaction as any).computeBestBeltPath(
        { x: A.x, z: A.z }, { x: B.x, z: B.z }, 'output',
        /* ignoreBeltIds       */ undefined,
        /* targetSlotPosition  */ undefined,
        /* sourceSlotPosition  */ 'front',
      )
      // computeBestBeltPath does not mutate state.
      expectFactoryState(factory, BOXED_FIXTURE)

      // THEN — the UI must NOT receive a result that it would render as a
      // valid GREEN ghost. Acceptable outcomes:
      //   (a) result === null  → UI shows the red coarse-feasibility ghost.
      //   (b) result !== null AND result.collides === true → UI shows red.
      //
      // Currently the function returns null when planner fails AND the
      // reverse-slot fallback is gated off — but the UI fallback path then
      // renders a WHITE coarse-feasibility ghost, MISTAKING the null for
      // "still feasible". The contract pinned here is: when planning truly
      // fails both ways, a NON-NULL colliding (red) plan must be returned so
      // the UI can render an explicit RED ghost.
      expect(result, 'computeBestBeltPath must return a colliding plan, not null, when both directions fail').not.toBeNull()
      expect(result!.collides, 'returned plan must be marked colliding so UI renders red ghost').toBe(true)
    })
  })
})
