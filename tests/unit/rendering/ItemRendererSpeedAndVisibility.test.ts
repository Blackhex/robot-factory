/**
 * @vitest-environment jsdom
 *
 * Renderer regression guards for two belt-rendering contracts:
 *
 *  S — WITHIN-CELL WORLD-SPACE SPEED IS UNIFORM
 *    `BeltPath` parameterises each cell by arc length, so successive samples
 *    inside a single cell (straight or corner) are evenly spaced in world
 *    units. Cross-cell uniformity is intentionally NOT enforced here — the
 *    current contract is uniform per-cell time with L-scaled world speed,
 *    so corner cells (L ≈ 0.871) animate ~13 % slower than full straights.
 *
 *  V — INSTANCED MESH STAYS VISIBLE REGARDLESS OF CAMERA FRUSTUM
 *    `THREE.InstancedMesh.boundingSphere` defaults to the base geometry's
 *    tiny sphere near the origin. With `frustumCulled = true` (the default),
 *    Three.js culls the entire InstancedMesh whenever that origin-area
 *    sphere is offscreen, even though the actual instances are visible. The
 *    shadow pass uses the directional light's frustum, so shadows still
 *    render — items disappear, shadows linger. Each per-type mesh must
 *    either set `frustumCulled = false` or assign a `boundingSphere` that
 *    covers the grid extent.
 *
 *  Scope: white-box, renderer-only.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  ItemRenderer,
  type BeltRenderData,
} from '../../../src/rendering/ItemRenderer'
import type { ItemType } from '../../../src/game/types'

const GRID_W = 20
const GRID_H = 20
const ITEM_TYPE: ItemType = 'wheel_small'
const ITEM_ID = 'A'
const SPEED = 1.0
const RENDER_DT = 0.0167
const FRAMES_PER_TICK = 6
const TICK_DP = 0.1 // per-tick advance of positionOnBelt (speed=1, tickDt=0.1)

// ---------- Helpers ---------------------------------------------------------

interface ChainCell {
  x: number
  z: number
}

/**
 * Build the BeltRenderData[] view for a single item somewhere along a chain
 * of cells. The chain is `cells[0] → cells[1] → ... → cells[N-1]`, which
 * yields N-1 belt segments. The item occupies segment `segIdx` at parameter
 * `position` ∈ [0,1).
 *
 * Each segment's `prevSegmentFrom` mirrors what
 * `ItemRenderer.cacheBeltTopology` would produce for a real chain so that
 * `buildBeltPath` enters the correct branch (corner / straight).
 */
function buildChainBelts(
  cells: ChainCell[],
  itemSegIdx: number,
  itemPosition: number,
): BeltRenderData[] {
  const segs: BeltRenderData[] = []
  for (let i = 0; i < cells.length - 1; i++) {
    const from = cells[i]
    const to = cells[i + 1]
    const prev = i > 0 ? cells[i - 1] : undefined
    const items =
      i === itemSegIdx
        ? [{ id: ITEM_ID, type: ITEM_TYPE, position: itemPosition }]
        : []
    segs.push({
      from: { x: from.x, z: from.z },
      to: { x: to.x, z: to.z },
      prevSegmentFrom: prev ? { x: prev.x, z: prev.z } : undefined,
      speed: SPEED,
      items,
    })
  }
  return segs
}

/** Read instance 0 world position for ITEM_TYPE. */
function readWorldPos(renderer: ItemRenderer): THREE.Vector3 {
  const meshes = (renderer as unknown as {
    meshes: Map<ItemType, THREE.InstancedMesh>
  }).meshes
  const mesh = meshes.get(ITEM_TYPE)!
  const m = new THREE.Matrix4()
  mesh.getMatrixAt(0, m)
  const p = new THREE.Vector3()
  p.setFromMatrixPosition(m)
  return p
}

/**
 * Run a render-loop simulation:
 *  - `frames` render frames at `RENDER_DT` each.
 *  - Every `FRAMES_PER_TICK` frames a sim tick advances positionOnBelt by
 *    `TICK_DP`; if it reaches 1.0 the item hands off to the next chain
 *    segment (positionOnBelt -= 1).
 *
 * Returns recorded world positions per frame (length = frames).
 */
function runChainLoop(
  renderer: ItemRenderer,
  cells: ChainCell[],
  startSegIdx: number,
  startPosition: number,
  frames: number,
): THREE.Vector3[] {
  let segIdx = startSegIdx
  let pos = startPosition
  // Seed.
  renderer.update(buildChainBelts(cells, segIdx, pos), GRID_W, GRID_H, 0)

  const positions: THREE.Vector3[] = []
  for (let f = 1; f <= frames; f++) {
    if (f % FRAMES_PER_TICK === 0) {
      pos += TICK_DP
      if (pos >= 1 - 1e-9 && segIdx < cells.length - 2) {
        pos -= 1
        segIdx += 1
      } else if (pos > 1) {
        pos = 1 // pin to end if nowhere to hand off
      }
    }
    renderer.update(
      buildChainBelts(cells, segIdx, pos),
      GRID_W,
      GRID_H,
      RENDER_DT,
    )
    positions.push(readWorldPos(renderer).clone())
  }
  return positions
}

/** Compute per-frame world-space delta magnitudes (length = positions.length-1). */
function frameDeltas(positions: THREE.Vector3[]): number[] {
  const deltas: number[] = []
  for (let i = 1; i < positions.length; i++) {
    const dx = positions[i].x - positions[i - 1].x
    const dz = positions[i].z - positions[i - 1].z
    deltas.push(Math.hypot(dx, dz))
  }
  return deltas
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function coefficientOfVariation(xs: number[]): number {
  const m = mean(xs)
  if (m === 0) return Number.POSITIVE_INFINITY
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / xs.length
  return Math.sqrt(variance) / m
}

// ---------- Tests -----------------------------------------------------------

describe('ItemRenderer — constant world-space speed across belt chains (bug S)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  it('S1: per-frame Δworld is uniform across a 5-cell straight horizontal chain', () => {
    // Chain (5,5)→(6,5)→(7,5)→(8,5)→(9,5). 4 segments, each length 1.0
    // for interior cells; chain-endpoint adjustments may shrink the first
    // and last cells. Item starts at the very beginning of seg 0.
    const cells: ChainCell[] = [
      { x: 5, z: 5 },
      { x: 6, z: 5 },
      { x: 7, z: 5 },
      { x: 8, z: 5 },
      { x: 9, z: 5 },
    ]
    const positions = runChainLoop(renderer, cells, 0, 0, 60)
    const deltas = frameDeltas(positions)
    // Steady-state window: skip the first few frames where rendered is
    // still snapping toward truth.
    const steady = deltas.slice(5)
    const cv = coefficientOfVariation(steady)
    expect(
      cv,
      `CV of per-frame Δworld in straight chain = ${cv.toFixed(4)} (expected < 0.10)`,
    ).toBeLessThan(0.1)
  })

  it('S3: per-frame Δworld is uniform within a single corner cell (within-cell baseline)', () => {
    // Single corner cell. (5,5)→(5,6)→(6,6) gives seg0 a corner at (5,6)?
    // We need the ITEM to live on a corner segment. Use a 3-cell chain so
    // segment 0 (the segment we sample) is the corner cell:
    //   prev=(5,5), from=(5,6), to=(6,6) — corner. The item rides seg 0.
    // To make seg 0 itself the corner we need seg 0 to have a prev cell;
    // since `runChainLoop` starts at segIdx=0 and seg 0 has no prev cell
    // by construction, we instead start the item on seg 1, the corner.
    const cells: ChainCell[] = [
      { x: 5, z: 5 },
      { x: 5, z: 6 },
      { x: 6, z: 6 },
      { x: 7, z: 6 },
    ]
    // Seed item on seg 1 (the corner cell at (5,6)) at position 0.
    // Sample 5 contiguous render frames mid-tick — i.e. between sim ticks,
    // when only the renderer's intra-tick interpolation is moving the item.
    renderer.update(buildChainBelts(cells, 1, 0), GRID_W, GRID_H, 0)
    // Advance one sim tick so position is mid-cell, then sample.
    const segs = buildChainBelts(cells, 1, 0.4)
    // Five contiguous render frames at constant truth (no tick fires).
    const samples: THREE.Vector3[] = []
    for (let i = 0; i < 6; i++) {
      renderer.update(segs, GRID_W, GRID_H, RENDER_DT)
      samples.push(readWorldPos(renderer).clone())
    }
    const deltas = frameDeltas(samples)
    const cv = coefficientOfVariation(deltas)
    // BASELINE: should already PASS — `sampleBeltPath` is arc-length
    // parameterized within a single corner cell. If this also fails,
    // the bug is BOTH within-cell AND cross-cell.
    expect(
      cv,
      `CV of per-frame Δworld within a single corner cell = ${cv.toFixed(4)} (expected < 0.05)`,
    ).toBeLessThan(0.05)
  })
})

describe('ItemRenderer — InstancedMesh stays visible regardless of camera frustum (bug V)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  it('V1: every per-type InstancedMesh disables frustum culling OR has a grid-covering boundingSphere', () => {
    // Populate a few belts so the meshes are non-trivial. The check is
    // about mesh configuration, not instance counts.
    const belts: BeltRenderData[] = [
      {
        from: { x: 5, z: 5 },
        to: { x: 6, z: 5 },
        speed: SPEED,
        items: [{ id: 'a', type: 'wheel_small', position: 0.3 }],
      },
      {
        from: { x: 6, z: 5 },
        to: { x: 7, z: 5 },
        prevSegmentFrom: { x: 5, z: 5 },
        speed: SPEED,
        items: [{ id: 'b', type: 'sensor_proximity', position: 0.7 }],
      },
    ]
    renderer.update(belts, GRID_W, GRID_H, 0)

    const meshes = (renderer as unknown as {
      meshes: Map<ItemType, THREE.InstancedMesh>
    }).meshes
    expect(meshes.size).toBeGreaterThan(0)

    const requiredRadius = Math.hypot(GRID_W, GRID_H) / 2 // ≈ 14.14

    for (const [type, mesh] of meshes) {
      const culled = mesh.frustumCulled
      const sphere = mesh.boundingSphere as THREE.Sphere | null
      const sphereOk =
        sphere !== null &&
        sphere !== undefined &&
        sphere.radius >= requiredRadius - 1e-6

      expect(
        culled === false || sphereOk,
        `mesh[${type}]: frustumCulled=${culled}, boundingSphere=${
          sphere ? `radius ${sphere.radius.toFixed(3)}` : 'null'
        } (need frustumCulled=false OR boundingSphere.radius >= ${requiredRadius.toFixed(3)})`,
      ).toBe(true)
    }
  })
})
