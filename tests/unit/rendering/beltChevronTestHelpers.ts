import * as THREE from 'three'
import { expect } from 'vitest'
import { Factory } from '../../../src/game/Factory'
import {
  BeltMeshRenderer,
  type BeltDirection,
} from '../../../src/rendering/BeltMeshRenderer'

/**
 * Build a Factory containing a single straight east-flowing belt at default
 * speed (1.0). Suitable as the minimal fixture for chevron-scroll tests.
 *
 * Two assemblers facing east, connected by a single-cell belt from the
 * source's east-output slot to the destination's west-input slot.
 */
export function makeFactoryWithEastBelt(): Factory {
  const factory = new Factory(20, 20)
  factory.placeMachine(2, 5, 'assembler', 'east')
  factory.placeMachine(5, 5, 'assembler', 'east')
  const src = factory.getMachineAt(2, 5)!
  const dst = factory.getMachineAt(5, 5)!
  // Slot offsets are in machine-local coordinates relative to the machine
  // origin: +x = right of the machine. With both machines facing 'east',
  // the source's output slot points east (+x) and the destination's
  // input slot points west (-x).
  const placed = factory.placeBelt(src, { x: 1, z: 0 }, dst, { x: -1, z: 0 })
  expect(placed).toBe(true)
  expect(factory.getBelts().length).toBeGreaterThan(0)
  return factory
}

export interface ChevronTestHarness {
  renderer: BeltMeshRenderer
  scene: THREE.Scene
  beltMeshes: Map<string, THREE.Mesh>
  cellBeltIds: Map<THREE.Mesh, string[]>
  eastMat: THREE.MeshStandardMaterial
  cellMat: THREE.MeshStandardMaterial
}

/**
 * Build a fresh Factory + BeltMeshRenderer pair, call `update()` once so
 * materials exist, then return handles to:
 *   - `eastMat`: the shared `beltDirectionMaterials.get('east')` template
 *     (kept exposed for any future tests that want to assert on the
 *     clone-source material directly).
 *   - `cellMat`: the per-(belt, direction) chevron material attached to
 *     the cell mesh at (3, 5) — one of the two interior cells of the
 *     east-flowing belt built by `makeFactoryWithEastBelt()`. This is
 *     what production cell meshes carry, and what `tickChevronScroll`
 *     advances at the per-belt rate.
 */
export function makeChevronHarness(): ChevronTestHarness {
  const factory = makeFactoryWithEastBelt()
  const scene = new THREE.Scene()
  const beltMeshes = new Map<string, THREE.Mesh>()
  const cellBeltIds = new Map<THREE.Mesh, string[]>()
  const renderer = new BeltMeshRenderer({
    factory,
    scene,
    beltMeshes,
    cellBeltIds,
    gridToWorld: (x, z) => new THREE.Vector3(x, 0, z),
  })
  renderer.update()
  const dirMats = (renderer as unknown as {
    beltDirectionMaterials: Map<BeltDirection, THREE.MeshStandardMaterial>
  }).beltDirectionMaterials
  const eastMat = dirMats.get('east')
  expect(eastMat, 'east direction material must exist after update()').toBeDefined()
  expect(eastMat!.map, 'east material must have a chevron map').toBeDefined()
  const cellMat = getCellChevronMaterial(beltMeshes, 3, 5)
  return { renderer, scene, beltMeshes, cellBeltIds, eastMat: eastMat!, cellMat }
}

/**
 * Resolve the chevron (top-face) MeshStandardMaterial of the belt cell
 * mesh at grid position `(x, z)`.
 *
 * The cell mesh is keyed `cell_${x}_${z}` per `BeltMeshRenderer.renderCellBelts`.
 * Cell meshes use a multi-material BoxGeometry where slot 0 is the chevron
 * (top/bottom faces) and slot 1 is the side material — see the geometry
 * group setup and `restoreBeltMaterial` in BeltMeshRenderer. This helper
 * handles BOTH:
 *   - current production code, where every east-flowing cell mesh shares
 *     the SAME `beltDirectionMaterials.get('east')` reference, and
 *   - any future per-mesh / per-belt material implementation, where each
 *     cell mesh may carry its own MeshStandardMaterial instance.
 *
 * If a future change replaces the array form with a single material, the
 * helper transparently unwraps that as well.
 */
export function getCellChevronMaterial(
  beltMeshes: Map<string, THREE.Mesh>,
  x: number,
  z: number,
): THREE.MeshStandardMaterial {
  const mesh = beltMeshes.get(`cell_${x}_${z}`)
  expect(mesh, `cell mesh at (${x},${z}) must exist (key cell_${x}_${z})`).toBeDefined()
  const matRaw = mesh!.material
  const chevron = (Array.isArray(matRaw) ? matRaw[0] : matRaw) as THREE.MeshStandardMaterial
  expect(
    chevron,
    `chevron material must be present on cell mesh at (${x},${z})`,
  ).toBeDefined()
  expect(
    chevron.map,
    `chevron material at (${x},${z}) must carry a texture map`,
  ).toBeDefined()
  return chevron
}
