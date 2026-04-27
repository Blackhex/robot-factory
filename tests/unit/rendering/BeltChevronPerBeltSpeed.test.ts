/**
 * @vitest-environment jsdom
 *
 * Pins the bug: the chevron texture scroll rate must respect each belt's
 * individual `belt.speed` (mutated by the SET_BELT_SPEED simulation
 * command), not a single hardcoded BELT_SCROLL_SPEED shared across every
 * belt that happens to flow in the same compass direction.
 *
 * Desired contract (introduced by the GREEN step):
 *   - `BeltMeshRenderer.tickChevronScroll(dt, paused, getSpeed?)` accepts an
 *     optional `getSpeed: (beltLogicalId: string) => number` callback.
 *   - When `getSpeed` is provided, each cell mesh advances its chevron UV
 *     offset by `getSpeed(beltLogicalId) * dt` UV units per real second,
 *     where `beltLogicalId` is inferred from `info.flowBelt.id` during
 *     `renderCellBelts` (already tracked internally).
 *   - When `getSpeed` is omitted, behaviour matches the existing default
 *     of 1.0 UV / real second — back-compat.
 *   - `paused === true` always wins: chevrons freeze regardless of
 *     `getSpeed`, mirroring the items-frozen-while-paused contract.
 *   - Two belts that flow in the same direction but have different speeds
 *     MUST advance their chevron offsets independently.
 *
 * Why this currently fails (RED step):
 *   `BeltMeshRenderer` keeps exactly four shared materials in
 *   `beltDirectionMaterials` (one per compass direction). Every east-
 *   flowing cell mesh holds the SAME `beltDirectionMaterials.get('east')`
 *   reference. Calling `tickChevronScroll(dt, paused)` advances all four
 *   shared materials by `BELT_SCROLL_SPEED * dt` and ignores any third
 *   argument. Therefore two east belts with speeds 2.0 and 1.0 read out
 *   the SAME chevron offset (both 1.0 UV/sec), so per-belt speed has no
 *   visual effect. Test A asserts the desired per-belt advance and will
 *   fail until the renderer reads `getSpeed(beltId)` per cell mesh.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { Factory } from '../../../src/game/Factory'
import { BeltMeshRenderer } from '../../../src/rendering/BeltMeshRenderer'
import { installJsdomCanvasMock } from './jsdomCanvasMock'
import { getCellChevronMaterial } from './beltChevronTestHelpers'

beforeAll(installJsdomCanvasMock)

const FRAMES_PER_SECOND = 60
const PER_BELT_TOLERANCE = 0.05      // ±0.05 UV — task spec allows ±0.05
const FROZEN_EPSILON = 1e-9          // paused freeze must be byte-for-byte exact

interface PerBeltHarness {
  factory: Factory
  renderer: BeltMeshRenderer
  scene: THREE.Scene
  beltMeshes: Map<string, THREE.Mesh>
  cellBeltIds: Map<THREE.Mesh, string[]>
  belt1Id: string
  belt2Id: string
  belt1CellPos: { x: number; z: number }
  belt2CellPos: { x: number; z: number }
}

/**
 * Build a Factory with TWO independent east-flowing belts on different
 * rows so neither overlaps. Each belt is one cell long (assemblers placed
 * 3 grid-cells apart along x; their east-output and west-input slots
 * sit at +1/-1 of their own origin, leaving exactly one belt cell each).
 *
 *   row 5: assembler@(2,5) ──belt_1──> assembler@(5,5)   (belt cell at x=3,4 / z=5)
 *   row 8: assembler@(2,8) ──belt_2──> assembler@(5,8)   (belt cell at x=3,4 / z=8)
 *
 * Both belts flow east; both belt-id allocations come from the shared
 * `FactoryBeltRegistry.nextBeltIdNumber` counter, so belt1Id is `belt_1`
 * and belt2Id is `belt_2` (the test reads them dynamically from
 * `factory.getBelts()` for robustness).
 */
function makePerBeltHarness(): PerBeltHarness {
  const factory = new Factory(20, 20)
  factory.placeMachine(2, 5, 'assembler', 'east')
  factory.placeMachine(5, 5, 'assembler', 'east')
  factory.placeMachine(2, 8, 'assembler', 'east')
  factory.placeMachine(5, 8, 'assembler', 'east')

  const src1 = factory.getMachineAt(2, 5)!
  const dst1 = factory.getMachineAt(5, 5)!
  const placed1 = factory.placeBelt(src1, { x: 1, z: 0 }, dst1, { x: -1, z: 0 })
  expect(placed1, 'belt 1 must be placed').toBe(true)

  const src2 = factory.getMachineAt(2, 8)!
  const dst2 = factory.getMachineAt(5, 8)!
  const placed2 = factory.placeBelt(src2, { x: 1, z: 0 }, dst2, { x: -1, z: 0 })
  expect(placed2, 'belt 2 must be placed').toBe(true)

  const belts = factory.getBelts()
  expect(belts.length, 'fixture must produce exactly two belts').toBe(2)
  const belt1Id = belts[0].id
  const belt2Id = belts[1].id
  expect(belt1Id).not.toBe(belt2Id)

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

  // Belt 1's interior cells are (3,5) and (4,5); belt 2's are (3,8) and (4,8).
  // Use one canonical cell per belt for the chevron offset readout.
  return {
    factory,
    renderer,
    scene,
    beltMeshes,
    cellBeltIds,
    belt1Id,
    belt2Id,
    belt1CellPos: { x: 3, z: 5 },
    belt2CellPos: { x: 3, z: 8 },
  }
}

/**
 * Resolve the chevron material attached to the cell mesh that the
 * `cellBeltIds` map associates with `beltId`. Falls back to throwing so
 * the assertion failure is descriptive; this helper exists so the test
 * does not silently pick up the wrong mesh if the fixture ever changes.
 */
function chevronMatForBelt(
  beltMeshes: Map<string, THREE.Mesh>,
  cellBeltIds: Map<THREE.Mesh, string[]>,
  beltId: string,
): THREE.MeshStandardMaterial {
  for (const mesh of beltMeshes.values()) {
    const ids = cellBeltIds.get(mesh)
    if (ids && ids.includes(beltId)) {
      const matRaw = mesh.material
      const chevron = (Array.isArray(matRaw) ? matRaw[0] : matRaw) as THREE.MeshStandardMaterial
      expect(chevron.map, `chevron map must be defined for belt ${beltId}`).toBeDefined()
      return chevron
    }
  }
  throw new Error(`No cell mesh found for belt ${beltId}`)
}

describe('BeltMeshRenderer — chevron scroll respects per-belt speed', () => {
  it('A) advances chevron at per-belt speed when getSpeed is provided', () => {
    // GIVEN — two independent east belts on different rows (belt 1 fast, belt 2 default).
    const { renderer, beltMeshes, cellBeltIds, belt1Id, belt2Id, belt1CellPos, belt2CellPos } =
      makePerBeltHarness()

    const mat1 = chevronMatForBelt(beltMeshes, cellBeltIds, belt1Id)
    const mat2 = chevronMatForBelt(beltMeshes, cellBeltIds, belt2Id)
    // Sanity: helper-by-position resolves to the same material as helper-by-belt
    // for this fixture (belt 1's cell at (3,5), belt 2's at (3,8)).
    expect(getCellChevronMaterial(beltMeshes, belt1CellPos.x, belt1CellPos.z)).toBe(mat1)
    expect(getCellChevronMaterial(beltMeshes, belt2CellPos.x, belt2CellPos.z)).toBe(mat2)

    const before1 = mat1.map!.offset.x
    const before2 = mat2.map!.offset.x

    // WHEN — 60 frames at 1/60 s with per-belt getSpeed: belt1 = 2.0, belt2 = 1.0.
    const getSpeed = (id: string): number => (id === belt1Id ? 2.0 : 1.0)
    for (let f = 0; f < FRAMES_PER_SECOND; f++) {
      renderer.tickChevronScroll(1 / 60, false, getSpeed)
    }

    const delta1 = Math.abs(mat1.map!.offset.x - before1)
    const delta2 = Math.abs(mat2.map!.offset.x - before2)

    const report =
      `Per-belt chevron scroll over 1 simulated second:\n` +
      `  belt 1 (${belt1Id}, getSpeed = 2.0): observed Δ = ${delta1.toFixed(6)} (expected ≈ 2.0 ± ${PER_BELT_TOLERANCE})\n` +
      `  belt 2 (${belt2Id}, getSpeed = 1.0): observed Δ = ${delta2.toFixed(6)} (expected ≈ 1.0 ± ${PER_BELT_TOLERANCE})\n` +
      `If both deltas are ≈ 1.0 AND mat1 === mat2 (same MeshStandardMaterial reference),\n` +
      `the renderer is using ONE shared east material for every east-flowing cell mesh\n` +
      `and ignoring the per-belt getSpeed callback — exactly the bug this test pins.`

    // THEN — belt 1 advanced at 2.0 UV/sec, belt 2 at 1.0 UV/sec.
    // The belt-1 assertion is the one that fails on current code (observed
    // ≈ 1.0 because shared material + ignored getSpeed).
    expect(delta1, report).toBeGreaterThan(2.0 - PER_BELT_TOLERANCE)
    expect(delta1, report).toBeLessThan(2.0 + PER_BELT_TOLERANCE)
    expect(delta2, report).toBeGreaterThan(1.0 - PER_BELT_TOLERANCE)
    expect(delta2, report).toBeLessThan(1.0 + PER_BELT_TOLERANCE)

    renderer.dispose()
  })

  it('B) default behaviour (no getSpeed) advances every belt at 1.0 UV/sec', () => {
    // GIVEN — same two-belt fixture; ticked WITHOUT a getSpeed callback.
    const { renderer, beltMeshes, cellBeltIds, belt1Id, belt2Id } = makePerBeltHarness()
    const mat1 = chevronMatForBelt(beltMeshes, cellBeltIds, belt1Id)
    const mat2 = chevronMatForBelt(beltMeshes, cellBeltIds, belt2Id)
    const before1 = mat1.map!.offset.x
    const before2 = mat2.map!.offset.x

    // WHEN — 60 frames at 1/60 s with the back-compat 2-arg signature.
    for (let f = 0; f < FRAMES_PER_SECOND; f++) {
      renderer.tickChevronScroll(1 / 60, false)
    }

    const delta1 = Math.abs(mat1.map!.offset.x - before1)
    const delta2 = Math.abs(mat2.map!.offset.x - before2)

    // THEN — both belts advance at the default 1.0 UV/sec (back-compat lock).
    expect(
      delta1,
      `Default chevron scroll (no getSpeed) must remain 1.0 UV/sec for belt 1; observed ${delta1.toFixed(6)}.`,
    ).toBeGreaterThan(1.0 - PER_BELT_TOLERANCE)
    expect(delta1).toBeLessThan(1.0 + PER_BELT_TOLERANCE)
    expect(
      delta2,
      `Default chevron scroll (no getSpeed) must remain 1.0 UV/sec for belt 2; observed ${delta2.toFixed(6)}.`,
    ).toBeGreaterThan(1.0 - PER_BELT_TOLERANCE)
    expect(delta2).toBeLessThan(1.0 + PER_BELT_TOLERANCE)

    renderer.dispose()
  })

  it('C) paused freezes per-belt chevrons regardless of getSpeed', () => {
    // GIVEN — same two-belt fixture; ticked with paused = true and a
    // deliberately huge getSpeed (5.0) to prove paused wins.
    const { renderer, beltMeshes, cellBeltIds, belt1Id, belt2Id } = makePerBeltHarness()
    const mat1 = chevronMatForBelt(beltMeshes, cellBeltIds, belt1Id)
    const mat2 = chevronMatForBelt(beltMeshes, cellBeltIds, belt2Id)
    const before1 = mat1.map!.offset.x
    const before2 = mat2.map!.offset.x

    // WHEN — 60 paused frames at 1/60 s with getSpeed = 5.0.
    for (let f = 0; f < FRAMES_PER_SECOND; f++) {
      renderer.tickChevronScroll(1 / 60, true, () => 5.0)
    }

    const delta1 = Math.abs(mat1.map!.offset.x - before1)
    const delta2 = Math.abs(mat2.map!.offset.x - before2)

    // THEN — paused === true overrides any per-belt speed; offsets do not move.
    expect(
      delta1,
      `Paused chevron must not advance for belt 1 even with getSpeed = 5.0; observed Δ = ${delta1.toFixed(6)}.`,
    ).toBeLessThan(FROZEN_EPSILON)
    expect(
      delta2,
      `Paused chevron must not advance for belt 2 even with getSpeed = 5.0; observed Δ = ${delta2.toFixed(6)}.`,
    ).toBeLessThan(FROZEN_EPSILON)

    renderer.dispose()
  })
})
