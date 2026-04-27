/**
 * @vitest-environment jsdom
 *
 * Renderer contract guards for ItemRenderer's per-frame positioning math:
 *   1. Items on belts are interpolated at render rate (~60 Hz) between sim
 *      ticks (10 Hz) instead of stepping per tick.
 *   2. Items are placed on the belt centerline.
 *   3. Items on corner segments follow the actual straight + arc + straight
 *      arc defined by `createCornerBeltGeometry` in `FactoryRenderer`,
 *      not a Catmull-Rom shortcut across cell centers.
 *
 * Maps a belt segment's [0,1] position to a point on the actual belt
 * centerline (straight cell → cell centerline; corner cell → straight +
 * arc + straight per the geometry constants), and advances the rendered
 * position by `belt.speed * dt` per frame between sim ticks, snapping back
 * to truth when fresh sim data arrives.
 *
 * Scope: white-box, renderer-only — simulation code in `src/game/` is not
 * exercised here.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ItemRenderer, type BeltRenderData } from '../../../src/rendering/ItemRenderer'
import {
  CORNER_STRAIGHT_LEN,
  CORNER_INNER_R,
  CORNER_OUTER_R,
} from '../../../src/rendering/FactoryRenderer'
import type { ItemType } from '../../../src/game/types'

const GRID_W = 20
const GRID_H = 20
const HALF_W = GRID_W / 2
const HALF_H = GRID_H / 2

/** Map a cell index to world coordinate (matches FactoryRenderer.gridToWorld). */
function cellToWorldX(x: number): number {
  return x - HALF_W + 0.5
}
function cellToWorldZ(z: number): number {
  return z - HALF_H + 0.5
}

/** Read the world XYZ of an instanced mesh entry. */
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
 * For belt chain (5,5) → (6,5) → (6,6), cell (6,5) is the corner cell.
 * Connecting WEST neighbor (5,5) and SOUTH neighbor (6,6).
 *
 * Per createCornerBeltGeometry:
 *   - The corner mesh is positioned at cellCenter + getCornerOffset(-1,+1)
 *     = (-3.5,-4.5) + (-0.5,+0.5) = (-4.0,-4.0)  (cell SW corner = pivot)
 *   - Local arc center: (S, 0, -S) = (0.2, 0, -0.2) → world (-3.8, -4.2)
 *   - Arc midline radius: (arcInnerR + arcOuterR) / 2
 *     = (CORNER_INNER_R - S + CORNER_OUTER_R - S) / 2 = 0.3
 *   - Belt centerline path through cell (6,5):
 *       WEST-side straight: z = -4.5, x ∈ [-4.0, -3.8]
 *       arc: center (-3.8, -4.2), radius 0.3, sweeping 90°
 *       SOUTH-side straight: x = -3.5, z ∈ [-4.2, -4.0]
 */
const CORNER_CELL = { x: 6, z: 5 }
const CORNER_PIVOT_WORLD = {
  x: cellToWorldX(CORNER_CELL.x) - 0.5, // -4.0
  z: cellToWorldZ(CORNER_CELL.z) + 0.5, //  -4.0
}
const ARC_CENTER_WORLD = {
  x: CORNER_PIVOT_WORLD.x + CORNER_STRAIGHT_LEN, // -3.8
  z: CORNER_PIVOT_WORLD.z - CORNER_STRAIGHT_LEN, // -4.2
}
const ARC_RADIUS = (CORNER_INNER_R - CORNER_STRAIGHT_LEN + CORNER_OUTER_R - CORNER_STRAIGHT_LEN) / 2 // 0.3

/** Distance in the XZ plane. */
function distXZ(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

/**
 * Lateral distance from a world position to the composite belt centerline of
 * corner cell (6,5) (WEST↔SOUTH connector). The centerline has three pieces:
 *   1. WEST straight: z = -4.5, x ∈ [-4.0, -3.8]
 *   2. ARC: center ARC_CENTER_WORLD, radius ARC_RADIUS, x ∈ [-3.8,-3.5], z ∈ [-4.5,-4.2]
 *   3. SOUTH straight: x = -3.5, z ∈ [-4.2, -4.0]
 * Returns the perpendicular distance to the closest piece.
 */
function lateralOffsetFromCornerCenterline(p: { x: number; z: number }): number {
  // West straight (horizontal line z = -4.5, x in [-4.0, -3.8])
  const xClampedW = Math.max(-4.0, Math.min(-3.8, p.x))
  const dW = distXZ(p, { x: xClampedW, z: -4.5 })
  // South straight (vertical line x = -3.5, z in [-4.2, -4.0])
  const zClampedS = Math.max(-4.2, Math.min(-4.0, p.z))
  const dS = distXZ(p, { x: -3.5, z: zClampedS })
  // Arc piece — only the quadrant where x ∈ [-3.8,-3.5] and z ∈ [-4.5,-4.2]
  let dA = Infinity
  const dx = p.x - ARC_CENTER_WORLD.x
  const dz = p.z - ARC_CENTER_WORLD.z
  // Project onto arc only if angle is within the quarter swept.
  if (dx >= 0 && dz <= 0) {
    dA = Math.abs(distXZ(p, ARC_CENTER_WORLD) - ARC_RADIUS)
  }
  return Math.min(dW, dS, dA)
}

describe('ItemRenderer — straight belt centerline (bug #2)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  it('places item on the cell centerline for a middle straight segment at p=0.5', () => {
    // Belt chain: (5,5) → (6,5) → (7,5) — all horizontal, all straight.
    // Test the middle segment (6,5)→(7,5) with prev=(5,5), next undefined.
    const middleSegment: BeltRenderData = {
      from: { x: 6, z: 5 },
      to: { x: 7, z: 5 },
      prevSegmentFrom: { x: 5, z: 5 },
      items: [{ type: 'wheel_small', position: 0.5 }],
    }

    renderer.update([middleSegment], GRID_W, GRID_H)

    const pos = getInstancePosition(renderer, 'wheel_small', 0)
    // New edge-to-edge convention: a straight segment runs from the entry-edge
    // midpoint of the from-cell to its exit-edge midpoint. So p=0.5 lands on
    // the cell center of from-cell (6,5) → world (-3.5, -4.5).
    expect(pos.x).toBeCloseTo(-3.5, 3)
    expect(pos.z).toBeCloseTo(-4.5, 3)
  })

  it('keeps zero lateral offset along a straight segment for all positions', () => {
    const segment: BeltRenderData = {
      from: { x: 6, z: 5 },
      to: { x: 7, z: 5 },
      prevSegmentFrom: { x: 5, z: 5 },
      items: [
        { type: 'wheel_small', position: 0.0 },
        { type: 'wheel_small', position: 0.25 },
        { type: 'wheel_small', position: 0.5 },
        { type: 'wheel_small', position: 0.75 },
        { type: 'wheel_small', position: 1.0 },
      ],
    }

    renderer.update([segment], GRID_W, GRID_H)

    for (let i = 0; i < 5; i++) {
      const pos = getInstancePosition(renderer, 'wheel_small', i)
      // For a straight horizontal segment, the centerline is z = -4.5.
      expect(Math.abs(pos.z - -4.5)).toBeLessThan(1e-3)
    }
  })
})

describe('ItemRenderer — corner belt follows arc (bug #3)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  /**
   * For an L-belt (5,5)→(6,5)→(6,6) where (6,5) is the corner cell, every
   * point on the rendered item path (across both segments) must lie on the
   * composite belt centerline (straight + arc + straight). Catmull-Rom
   * shortcut across cell centers must be gone.
   */
  function buildLBeltSegments(items: ReadonlyArray<{ type: ItemType; position: number }>) {
    // Two segments — items live on whichever segment we put them on. We test
    // both segments' items against the same composite-centerline invariant.
    const segA: BeltRenderData = {
      from: { x: 5, z: 5 },
      to: { x: 6, z: 5 },
      items,
    }
    const segB: BeltRenderData = {
      from: { x: 6, z: 5 },
      to: { x: 6, z: 6 },
      prevSegmentFrom: { x: 5, z: 5 },
      items,
    }
    return { segA, segB }
  }

  it('item at p=0.5 of corner segment (6,5)→(6,6) lies on the arc (radius 0.3 from arc-center pivot)', () => {
    // Pivot here = arc-center world (-3.8, -4.2), the geometric center of the
    // quarter arc per createCornerBeltGeometry. The user's spec calls this
    // "the cell-corner pivot" loosely; the math (radius = 0.5 - S = 0.3) only
    // closes if measured from the arc center.
    const { segB } = buildLBeltSegments([{ type: 'wheel_small', position: 0.5 }])

    renderer.update([segB], GRID_W, GRID_H)

    const pos = getInstancePosition(renderer, 'wheel_small', 0)
    expect(distXZ({ x: pos.x, z: pos.z }, ARC_CENTER_WORLD)).toBeCloseTo(ARC_RADIUS, 3)
  })

  it('item at p=0 of corner segment (6,5)→(6,6) lies on the WEST-edge centerline of cell (6,5)', () => {
    // Cell (6,5) WEST edge midpoint world = (-4.0, -4.5).
    // Item at the start of the corner segment must enter the corner on the
    // belt centerline of the cell it's coming from.
    const { segB } = buildLBeltSegments([{ type: 'wheel_small', position: 0.0 }])

    renderer.update([segB], GRID_W, GRID_H)

    const pos = getInstancePosition(renderer, 'wheel_small', 0)
    expect(pos.x).toBeCloseTo(-4.0, 3)
    expect(pos.z).toBeCloseTo(-4.5, 3)
  })

  it('item at p=1 of corner segment (6,5)→(6,6) lies on the SOUTH-edge centerline of cell (6,5)', () => {
    // Cell (6,5) SOUTH edge midpoint world = (-3.5, -4.0).
    const { segB } = buildLBeltSegments([{ type: 'wheel_small', position: 1.0 }])

    renderer.update([segB], GRID_W, GRID_H)

    const pos = getInstancePosition(renderer, 'wheel_small', 0)
    expect(pos.x).toBeCloseTo(-3.5, 3)
    expect(pos.z).toBeCloseTo(-4.0, 3)
  })

  it('Catmull-Rom shortcut is gone: item at p=0.5 is offset toward the inside of the L', () => {
    // The Catmull-Rom shortcut between cell centers (6,5)=(-3.5,-4.5) and
    // (6,6)=(-3.5,-3.5) at t=0.5 lands very near (~-3.5, -4.0) — straight
    // along the column centerline. The arc midpoint at angle π/4 is
    // (-3.8 + 0.3·cos π/4, -4.2 - 0.3·sin π/4) ≈ (-3.588, -4.412), well
    // OFF that line.
    const { segB } = buildLBeltSegments([{ type: 'wheel_small', position: 0.5 }])

    renderer.update([segB], GRID_W, GRID_H)

    const pos = getInstancePosition(renderer, 'wheel_small', 0)
    // Must NOT be on the column centerline (x = -3.5 was the Catmull-Rom answer).
    expect(Math.abs(pos.x - -3.5)).toBeGreaterThan(0.05)
    // Must be displaced toward the inside of the L (south-west of cell center) —
    // i.e. x more negative than -3.5 and z more negative than -4.0.
    expect(pos.x).toBeLessThan(-3.5)
    expect(pos.z).toBeLessThan(-4.0)
  })

  it('keeps zero lateral offset along the corner centerline for many positions', () => {
    const positions = [0.0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1.0]
    const items = positions.map((p) => ({ type: 'wheel_small' as ItemType, position: p }))
    const { segB } = buildLBeltSegments(items)

    renderer.update([segB], GRID_W, GRID_H)

    for (let i = 0; i < positions.length; i++) {
      const pos = getInstancePosition(renderer, 'wheel_small', i)
      const lateral = lateralOffsetFromCornerCenterline({ x: pos.x, z: pos.z })
      expect(
        lateral,
        `position ${positions[i]} produced lateral offset ${lateral.toFixed(4)} from corner centerline at world (${pos.x.toFixed(3)}, ${pos.z.toFixed(3)})`,
      ).toBeLessThan(1e-3)
    }
  })
})

describe('ItemRenderer — render-time interpolation between sim ticks (bug #1)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  /**
   * Proposed API (renderer-only):
   *   ItemRenderer.update(belts, gridW, gridH, dt?: number)
   *
   * - When `dt` is omitted or 0, items render exactly at simulation truth
   *   (positionOnBelt as supplied).
   * - When `dt` > 0 AND the supplied beltRenderData represents the SAME
   *   simulation tick as the previous call (no item positionOnBelt change),
   *   the renderer advances the visible position by `belt.speed * dt`
   *   along the belt path WITHOUT mutating simulation state.
   * - When `dt` > 0 AND the supplied beltRenderData is fresh (positions
   *   advanced by the simulation), the renderer snaps the visible position
   *   back to truth (then may apply the new dt).
   *
   * To support per-belt speed at render time, BeltRenderData should also
   * gain `speed: number`. Tests below rely on that field.
   */

  it('advances rendered position between calls when only render-time dt elapses', () => {
    // Single straight horizontal segment (5,5)→(6,5)→(7,5), middle item at p=0.5.
    const segment = {
      from: { x: 6, z: 5 },
      to: { x: 7, z: 5 },
      prevSegmentFrom: { x: 5, z: 5 },
      speed: 1.0, // belt fraction per second
      items: [{ type: 'wheel_small', position: 0.5 }],
    } as unknown as BeltRenderData

    // First frame: dt = 0 → snap to truth.
    ;(renderer as any).update([segment], GRID_W, GRID_H, 0)
    const before = getInstancePosition(renderer, 'wheel_small', 0)

    // Second frame: same simulation data, but 50 ms of render time elapsed.
    // Renderer must extrapolate position by speed * dt = 1.0 * 0.05 = 0.05
    // belt fractions, ≈ 0.05 world units along +X.
    ;(renderer as any).update([segment], GRID_W, GRID_H, 0.05)
    const after = getInstancePosition(renderer, 'wheel_small', 0)

    expect(after.x, 'render-time interpolation must advance the item position').not.toBeCloseTo(
      before.x,
      4,
    )
    // Direction of motion along +X should be roughly speed * dt.
    expect(after.x - before.x).toBeGreaterThan(0.02)
    expect(after.x - before.x).toBeLessThan(0.10)
    // Lateral must remain on belt centerline.
    expect(after.z).toBeCloseTo(-4.5, 3)
  })

  it('snaps to simulation truth when fresh tick data arrives (no big jump)', () => {
    const speed = 1.0
    // sim tick = 100 ms; positionOnBelt advances by speed * 0.1 = 0.10 per tick.

    const segmentTick0 = {
      from: { x: 6, z: 5 },
      to: { x: 7, z: 5 },
      prevSegmentFrom: { x: 5, z: 5 },
      speed,
      items: [{ type: 'wheel_small', position: 0.50 }],
    } as unknown as BeltRenderData

    // Render frame 1: snap to truth.
    ;(renderer as any).update([segmentTick0], GRID_W, GRID_H, 0)

    // Render frame 2: 50 ms passes, no new sim data → renderer extrapolates.
    ;(renderer as any).update([segmentTick0], GRID_W, GRID_H, 0.05)
    const beforeTick = getInstancePosition(renderer, 'wheel_small', 0)

    // Sim tick lands: positionOnBelt advances by speed * tickDelta = 0.10.
    const segmentTick1 = {
      ...segmentTick0,
      items: [{ type: 'wheel_small', position: 0.60 }],
    } as unknown as BeltRenderData

    // Render frame 3: fresh sim data + small extra render dt.
    ;(renderer as any).update([segmentTick1], GRID_W, GRID_H, 0.0)
    const afterSnap = getInstancePosition(renderer, 'wheel_small', 0)

    // Truth at p=0.6 on segment (6,5)→(7,5) under the edge-to-edge convention:
    // world x = entry-edge of cell (6,5) + p = -4.0 + 0.6 = -3.4.
    expect(afterSnap.x).toBeCloseTo(-3.4, 3)
    expect(afterSnap.z).toBeCloseTo(-4.5, 3)

    // The snap must not produce a huge backwards jump from the extrapolated
    // position — the extrapolated x and the truth x should be in the same
    // forward region, within one sim tick of motion (speed * tickDelta = 0.1).
    expect(Math.abs(afterSnap.x - beforeTick.x)).toBeLessThan(0.15)
  })

  it('does not extrapolate past p=1 (item should not fly off the end of the belt)', () => {
    const segment = {
      from: { x: 6, z: 5 },
      to: { x: 7, z: 5 },
      prevSegmentFrom: { x: 5, z: 5 },
      speed: 1.0,
      items: [{ type: 'wheel_small', position: 0.99 }],
    } as unknown as BeltRenderData

    ;(renderer as any).update([segment], GRID_W, GRID_H, 0)
    // Pump a long render dt; even if extrapolation says "go", the rendered
    // position must clamp to the end-of-belt world position.
    ;(renderer as any).update([segment], GRID_W, GRID_H, 1.0)
    const pos = getInstancePosition(renderer, 'wheel_small', 0)
    // Edge-to-edge convention: end-of-segment world position at p=1 is the
    // exit-edge midpoint of from-cell (6,5) = (-3.0, -4.5).
    expect(pos.x).toBeLessThanOrEqual(-3.0 + 1e-3)
    // Item started at p=0.99 (world x ≈ -3.01); it must have stayed past
    // the segment midpoint (cell center, x = -3.5) — i.e. not jumped backward.
    expect(pos.x).toBeGreaterThan(-3.5)
    expect(pos.z).toBeCloseTo(-4.5, 3)
  })
})
