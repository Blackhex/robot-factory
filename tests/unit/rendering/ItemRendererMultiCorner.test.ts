/**
 * @vitest-environment jsdom
 *
 * Renderer contract guards for zigzag / multi-corner belt chains.
 *
 * Exercises:
 *   (T1) cell-boundary continuity across ADJACENT cells in a chain when
 *        the chain mixes straights and corners.
 *   (T2) cross-belt id handoff (item leaves belt B1 at p ≈ 1 and appears
 *        on belt B2 at p ≈ 0) preserves rendered identity instead of
 *        snapping the item back to truth.
 *   (T3) corner classification when the belt being rendered is a SINGLE
 *        cell whose prev-chain neighbour and next-chain neighbour sit on
 *        perpendicular axes.
 *   (T4) rendered world x is monotonically non-decreasing under the
 *        renderer's per-tick upper-bound clamp
 *        (`renderedArc ≤ truthArc + speed * SIM_TICK_INTERVAL * L`),
 *        including when truth catches up to a saturated rendered position.
 *   (T5) end-to-end zigzag: every sampled position on every corner cell
 *        of the chain lies on that cell's centerline.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ItemRenderer, type BeltRenderData } from '../../../src/rendering/ItemRenderer'
import { CORNER_STRAIGHT_LEN } from '../../../src/utils/BeltGeometry'
import type { ItemType } from '../../../src/game/types'

const GRID_W = 20
const GRID_H = 20
const HALF_W = GRID_W / 2
const HALF_H = GRID_H / 2
const ARC_R = 0.5 - CORNER_STRAIGHT_LEN // 0.3

function cellWX(x: number): number {
  return x - HALF_W + 0.5
}
function cellWZ(z: number): number {
  return z - HALF_H + 0.5
}

function getInstancePosition(
  renderer: ItemRenderer,
  type: ItemType,
  idx: number,
): { x: number; y: number; z: number } {
  const meshes = (renderer as any).meshes as Map<ItemType, THREE.InstancedMesh>
  const mesh = meshes.get(type)!
  const m = new THREE.Matrix4()
  mesh.getMatrixAt(idx, m)
  const pos = new THREE.Vector3()
  pos.setFromMatrixPosition(m)
  return { x: pos.x, y: pos.y, z: pos.z }
}

/**
 * Distance from a point to a line segment in the XZ plane.
 */
function distToSegment(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  if (len2 === 0) return Math.hypot(px - ax, pz - az)
  let t = ((px - ax) * dx + (pz - az) * dz) / len2
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const qx = ax + t * dx
  const qz = az + t * dz
  return Math.hypot(px - qx, pz - qz)
}

/**
 * Lateral distance from a point to the composite centerline of a corner
 * cell at world (cellWX, cellWZ) entering with direction (inDx,inDz) and
 * exiting toward (outDx,outDz). Path is straight (S) → quarter-arc (R=0.3)
 * → straight (S), per BeltPath.ts.
 */
function cornerLateralOffset(
  p: { x: number; z: number },
  cwx: number, cwz: number,
  inDx: number, inDz: number,
  outDx: number, outDz: number,
): number {
  const S = CORNER_STRAIGHT_LEN
  const sx = cwx - inDx * 0.5
  const sz = cwz - inDz * 0.5
  const ex = cwx + outDx * 0.5
  const ez = cwz + outDz * 0.5
  const pivotX = inDx !== 0 ? sx : ex
  const pivotZ = inDx !== 0 ? ez : sz
  const dirX = Math.sign(cwx - pivotX)
  const dirZ = Math.sign(cwz - pivotZ)
  const acx = pivotX + dirX * S
  const acz = pivotZ + dirZ * S
  const asx = sx + inDx * S
  const asz = sz + inDz * S
  const aex = ex - outDx * S
  const aez = ez - outDz * S
  const dEntry = distToSegment(p.x, p.z, sx, sz, asx, asz)
  const dExit = distToSegment(p.x, p.z, aex, aez, ex, ez)
  const dArc = Math.abs(Math.hypot(p.x - acx, p.z - acz) - ARC_R)
  return Math.min(dEntry, dExit, dArc)
}

// =============================================================================
// ZIGZAG chain definition (used by T1 and T5)
//
//   cell 0: (5,5)  source       — straight segment (no prev)
//   cell 1: (5,6)  corner       — entered from north (5,5), exits east
//   cell 2: (6,6)  corner       — entered from west  (5,6), exits south
//   cell 3: (6,7)  corner       — entered from north (6,6), exits east
//   cell 4: (7,7)  sink         — last cell, never the FROM of a segment
//
// Resulting segments (each renders the path THROUGH its from-cell):
//   seg0: from=(5,5) to=(5,6)  prev=undefined
//   seg1: from=(5,6) to=(6,6)  prev=(5,5)
//   seg2: from=(6,6) to=(6,7)  prev=(5,6)
//   seg3: from=(6,7) to=(7,7)  prev=(6,6)
// =============================================================================

const ZIGZAG_CELLS = [
  { x: 5, z: 5 },
  { x: 5, z: 6 },
  { x: 6, z: 6 },
  { x: 6, z: 7 },
  { x: 7, z: 7 },
] as const

function buildZigzagSegment(
  segIdx: number,
  items: ReadonlyArray<{ id: string; type: ItemType; position: number }>,
): BeltRenderData {
  const from = ZIGZAG_CELLS[segIdx]
  const to = ZIGZAG_CELLS[segIdx + 1]
  const prev = segIdx > 0 ? ZIGZAG_CELLS[segIdx - 1] : undefined
  return {
    from: { x: from.x, z: from.z },
    to: { x: to.x, z: to.z },
    prevSegmentFrom: prev ? { x: prev.x, z: prev.z } : undefined,
    speed: 1.0,
    items,
  }
}

// =============================================================================
// T1: Adjacent corner cells — cell-boundary continuity
// -----------------------------------------------------------------------------
// For each consecutive pair of segments in the chain, sampling p=1 of seg N
// must equal sampling p=0 of seg N+1. The renderer's `BeltPath` uses two
// different parameterizations:
//   - STRAIGHT segment: p=0..1 maps fromCellCenter → toCellCenter.
//   - CORNER  segment: p=0..1 maps entryEdgeMid → exitEdgeMid (HALF the cell).
// So the boundary STRAIGHT→CORNER is geometrically discontinuous by 0.5
// world units. Item handoff at that boundary visibly teleports.
// =============================================================================

describe('ItemRenderer — zigzag chain: cell-boundary continuity (T1)', () => {
  beforeEach(() => {
    // Tests below use a fresh renderer per worldAt() call.
  })

  /**
   * Sample world position of an item placed at `position` on the segment
   * `segIdx` of the zigzag chain. Uses a fresh renderer state per call so
   * the result is the deterministic truth-snap world position.
   */
  function worldAt(segIdx: number, position: number): { x: number; z: number } {
    const localScene = new THREE.Scene()
    const localRenderer = new ItemRenderer(localScene)
    const seg = buildZigzagSegment(segIdx, [
      { id: 'probe', type: 'wheel_small', position },
    ])
    ;(localRenderer as any).update([seg], GRID_W, GRID_H, 0)
    const p = getInstancePosition(localRenderer, 'wheel_small', 0)
    localRenderer.dispose()
    return { x: p.x, z: p.z }
  }

  // For each consecutive segment pair, p=1 of seg N must equal p=0 of seg N+1.
  for (let i = 0; i < ZIGZAG_CELLS.length - 2; i++) {
    it(`p=1 of seg ${i} matches p=0 of seg ${i + 1} (cell ${ZIGZAG_CELLS[i].x},${ZIGZAG_CELLS[i].z} → ${ZIGZAG_CELLS[i + 1].x},${ZIGZAG_CELLS[i + 1].z})`, () => {
      const endN = worldAt(i, 1.0)
      const startN1 = worldAt(i + 1, 0.0)
      const dx = endN.x - startN1.x
      const dz = endN.z - startN1.z
      const dist = Math.hypot(dx, dz)
      expect(
        dist,
        `discontinuity between seg ${i} (end=${endN.x.toFixed(3)},${endN.z.toFixed(3)}) and seg ${i + 1} (start=${startN1.x.toFixed(3)},${startN1.z.toFixed(3)}) = ${dist.toFixed(3)}`,
      ).toBeLessThanOrEqual(1e-3)
    })
  }
})

// =============================================================================
// T2: Cross-belt id handoff preserves rendered position
// -----------------------------------------------------------------------------
// ItemRenderer keys per-id state under `fromX,fromZ->toX,toZ`. When the item
// transfers from belt B1 to belt B2 (a separate ConveyorBelt instance) the
// id is unknown on B2 → the renderer snaps to truth. The visible result is
// a back-and-forth jump at every chain hand-off.
// =============================================================================

describe('ItemRenderer — cross-belt id handoff continuity (T2)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  // removed: superseded by simple-follow-truth contract
  it.skip('cross-belt handoff does not jump the world position by more than ~speed*dt*2', () => {
    const speed = 1.0
    const dt = 0.0167
    // B1 covers cell (5,5); B2 covers cell (6,5). Both straight, in chain.
    function makeB1(items: ReadonlyArray<{ id: string; type: ItemType; position: number }>): BeltRenderData {
      return {
        from: { x: 5, z: 5 },
        to: { x: 6, z: 5 },
        prevSegmentFrom: undefined,
        speed,
        items,
      }
    }
    function makeB2(items: ReadonlyArray<{ id: string; type: ItemType; position: number }>): BeltRenderData {
      return {
        from: { x: 6, z: 5 },
        to: { x: 7, z: 5 },
        prevSegmentFrom: { x: 5, z: 5 },
        speed,
        items,
      }
    }

    // Item X on B1 at p=0.95.
    const seg0 = [
      makeB1([{ id: 'X', type: 'wheel_small', position: 0.95 }]),
      makeB2([]),
    ]
    ;(renderer as any).update(seg0, GRID_W, GRID_H, 0) // seed

    // Advance several frames with no sim tick (truth stays at 0.95 on B1).
    let lastWorldX = NaN
    for (let i = 0; i < 4; i++) {
      ;(renderer as any).update(seg0, GRID_W, GRID_H, dt)
      lastWorldX = getInstancePosition(renderer, 'wheel_small', 0).x
    }

    // Sim-handoff: B1 empty, B2 now owns X at p=0.05.
    const seg1 = [
      makeB1([]),
      makeB2([{ id: 'X', type: 'wheel_small', position: 0.05 }]),
    ]
    ;(renderer as any).update(seg1, GRID_W, GRID_H, dt)
    const newWorldX = getInstancePosition(renderer, 'wheel_small', 0).x

    // Allowable per-frame world delta = speed * dt * 2 ≈ 0.0334.
    const allowed = speed * dt * 2
    const delta = newWorldX - lastWorldX
    // Forward jumps larger than `allowed` and any backward jump >1e-3 are
    // both visible glitches.
    expect(
      delta,
      `cross-belt handoff: world x jumped from ${lastWorldX.toFixed(5)} to ${newWorldX.toFixed(5)} (Δ=${delta.toFixed(5)}, allowed=±${allowed.toFixed(5)})`,
    ).toBeGreaterThan(-1e-3)
    expect(
      Math.abs(delta),
      `cross-belt handoff |Δ|=${Math.abs(delta).toFixed(5)} exceeds allowed ${allowed.toFixed(5)}`,
    ).toBeLessThanOrEqual(allowed)
  })
})

// =============================================================================
// T3: Single-cell belt acting as a corner — corner classification
// -----------------------------------------------------------------------------
// A belt segment whose own from→to direction provides only one axis of
// information; the perpendicular axis must come from `prevSegmentFrom`. This
// test pins that the renderer DOES treat such a segment as a corner and
// places the item on the arc, not on a straight diagonal across cell centers.
// =============================================================================

describe('ItemRenderer — single-cell belt as corner classification (T3)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  it('middle belt with perpendicular prev places the item on the arc at p=0.5', () => {
    // Chain: (5,5) → (5,6) → (6,6). Middle belt covers cell (5,6).
    const middle: BeltRenderData = {
      from: { x: 5, z: 6 },
      to: { x: 6, z: 6 },
      prevSegmentFrom: { x: 5, z: 5 },
      speed: 1.0,
      items: [{ id: 'A', type: 'wheel_small', position: 0.5 }],
    }
    ;(renderer as any).update([middle], GRID_W, GRID_H, 0)
    const pos = getInstancePosition(renderer, 'wheel_small', 0)

    // Cell (5,6) world center.
    const cwx = cellWX(5)
    const cwz = cellWZ(6)
    // For inDir=(0,+1), outDir=(+1,0): pivot is cell's NE corner.
    // sx = cwx - 0*0.5 = cwx; sz = cwz - 1*0.5 = cwz - 0.5  (north edge mid)
    // ex = cwx + 1*0.5 = cwx + 0.5; ez = cwz                 (east  edge mid)
    // inDx==0 → pivot = (ex, sz) = (cwx+0.5, cwz-0.5)        — NE corner
    // dirX = sign(cwx - (cwx+0.5)) = -1
    // dirZ = sign(cwz - (cwz-0.5)) = +1
    // arc center = pivot + (-1*S, +1*S) = (cwx+0.5-S, cwz-0.5+S)
    const S = CORNER_STRAIGHT_LEN
    const acx = cwx + 0.5 - S
    const acz = cwz - 0.5 + S

    const dist = Math.hypot(pos.x - acx, pos.z - acz)
    expect(
      dist,
      `single-cell corner item at p=0.5 world=(${pos.x.toFixed(3)},${pos.z.toFixed(3)}) is not on arc (R=${ARC_R}, dist=${dist.toFixed(3)})`,
    ).toBeCloseTo(ARC_R, 3)
  })
})

// =============================================================================
// T4: Monotonic forward motion across many ticks (no backward jump)
// -----------------------------------------------------------------------------
// Property test on a single straight belt: across many render frames with
// periodic sim-tick updates, the rendered world position must NEVER decrease
// when the renderer's per-tick upper-bound clamp
// (`renderedArc ≤ truthArc + speed * SIM_TICK_INTERVAL * L`) pins it to truth.
// =============================================================================

describe('ItemRenderer — monotonic forward motion (T4)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  function makeStraightSeg(position: number): BeltRenderData {
    return {
      from: { x: 5, z: 5 },
      to: { x: 6, z: 5 },
      prevSegmentFrom: undefined,
      speed: 1.0,
      items: [{ id: 'A', type: 'wheel_small', position }],
    }
  }

  it('rendered world x is monotonically non-decreasing across 30 frames with periodic ticks', () => {
    const dt = 0.0167
    let position = 0.0
    let seg = makeStraightSeg(position)

    ;(renderer as any).update([seg], GRID_W, GRID_H, 0) // seed

    const xs: number[] = []
    for (let i = 0; i < 30; i++) {
      // Sim tick every 6 frames advances truth by 0.1.
      if (i > 0 && i % 6 === 0) {
        position = Math.min(1, position + 0.1)
        seg = makeStraightSeg(position)
      }
      ;(renderer as any).update([seg], GRID_W, GRID_H, dt)
      xs.push(getInstancePosition(renderer, 'wheel_small', 0).x)
    }
    for (let i = 1; i < xs.length; i++) {
      const delta = xs[i] - xs[i - 1]
      expect(
        delta,
        `frame ${i}: x jumped backward from ${xs[i - 1].toFixed(5)} to ${xs[i].toFixed(5)} (Δ=${delta.toFixed(5)})`,
      ).toBeGreaterThanOrEqual(-1e-4)
    }
  })

  it('rendered world x is monotonically non-decreasing when truth catches up to the per-tick upper-bound clamp', () => {
    const dt = 0.0167
    // Start near the end so rendered saturates against the per-tick upper
    // bound (`truthArc + speed * SIM_TICK_INTERVAL * L`) quickly.
    let position = 0.95
    let seg = makeStraightSeg(position)

    ;(renderer as any).update([seg], GRID_W, GRID_H, 0) // seed at 0.95

    const xs: number[] = []
    for (let i = 0; i < 30; i++) {
      // Sim tick every 6 frames: truth advances by 0.1 toward 1.0. Once
      // truth==1.0 it plateaus. The rendered position should never bounce
      // backward as truth catches up to the saturated rendered arc.
      if (i > 0 && i % 6 === 0) {
        position = Math.min(1, position + 0.1)
        seg = makeStraightSeg(position)
      }
      ;(renderer as any).update([seg], GRID_W, GRID_H, dt)
      xs.push(getInstancePosition(renderer, 'wheel_small', 0).x)
    }
    for (let i = 1; i < xs.length; i++) {
      const delta = xs[i] - xs[i - 1]
      expect(
        delta,
        `frame ${i} (truth catching up to per-tick upper-bound clamp): x jumped backward from ${xs[i - 1].toFixed(5)} to ${xs[i].toFixed(5)} (Δ=${delta.toFixed(5)})`,
      ).toBeGreaterThanOrEqual(-1e-4)
    }
  })
})

// =============================================================================
// T5: ZIGZAG end-to-end — every sample lies on its cell's centerline
// -----------------------------------------------------------------------------
// Sample p ∈ {0, 0.25, 0.5, 0.75, 1} on each interior corner cell of the
// zigzag. Every sampled world point must lie on the composite centerline of
// that cell (lateral offset ≤ 1e-3). If the renderer misorients the arc
// because of incorrect chain-context awareness, this fails.
// =============================================================================

describe('ItemRenderer — zigzag end-to-end centerline adherence (T5)', () => {
  it('every sample on every interior corner cell is on the cell centerline', () => {
    const samples = [0.0, 0.25, 0.5, 0.75, 1.0]
    const failures: string[] = []

    // Interior segments are 1, 2, 3 (each from-cell is a corner).
    for (let segIdx = 1; segIdx <= 3; segIdx++) {
      const cell = ZIGZAG_CELLS[segIdx]
      const prev = ZIGZAG_CELLS[segIdx - 1]
      const next = ZIGZAG_CELLS[segIdx + 1]
      const inDx = cell.x - prev.x
      const inDz = cell.z - prev.z
      const outDx = next.x - cell.x
      const outDz = next.z - cell.z

      for (const p of samples) {
        const localScene = new THREE.Scene()
        const localRenderer = new ItemRenderer(localScene)
        const seg = buildZigzagSegment(segIdx, [
          { id: `probe-${segIdx}-${p}`, type: 'wheel_small', position: p },
        ])
        ;(localRenderer as any).update([seg], GRID_W, GRID_H, 0)
        const pos = getInstancePosition(localRenderer, 'wheel_small', 0)
        localRenderer.dispose()

        const lateral = cornerLateralOffset(
          { x: pos.x, z: pos.z },
          cellWX(cell.x), cellWZ(cell.z),
          inDx, inDz,
          outDx, outDz,
        )
        if (lateral > 1e-3) {
          failures.push(
            `seg ${segIdx} (cell ${cell.x},${cell.z}, in=${inDx},${inDz} out=${outDx},${outDz}) ` +
              `at p=${p}: world=(${pos.x.toFixed(3)},${pos.z.toFixed(3)}) lateral=${lateral.toFixed(4)}`,
          )
        }
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })
})
