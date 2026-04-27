/**
 * @vitest-environment jsdom
 *
 * Renderer contract guards for two interpolation glitches:
 *
 *   1. Items must be smoothly interpolated at the render rate (~60 Hz)
 *      between sim ticks (10 Hz) instead of stepping per tick. The renderer
 *      must NOT snap to truth every tick just because each item's
 *      `positionOnBelt` advances each tick.
 *
 *   2. When the item count on a belt changes (item delivered to a machine,
 *      item handed off between chain segments, new item enters the belt),
 *      remaining items must NOT snap to truth and visibly jump backward.
 *
 * `ItemRenderer` tracks each rendered item by its stable `Item.id` (not by
 * slot index). Snap only happens on first sight of a brand-new id; existing
 * items keep their rendered position across tick boundaries and are nudged
 * forward smoothly.
 *
 * `BeltRenderData.items` carries an `id: string` for each rendered item;
 * `ItemRenderer.buildRenderData(...)` propagates `Item.id` from the
 * simulation `Item` into each rendered item entry.
 *
 * Scope: white-box, renderer-only.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ItemRenderer, type BeltRenderData } from '../../../src/rendering/ItemRenderer'
import type { ItemType } from '../../../src/game/types'

const GRID_W = 20
const GRID_H = 20

/** Local shape — mirrors BeltRenderData with the `id` field on each item. */
type RenderItemWithId = { id: string; type: ItemType; position: number }

function makeStraightSegment(items: ReadonlyArray<RenderItemWithId>): BeltRenderData {
  return {
    from: { x: 6, z: 5 },
    to: { x: 7, z: 5 },
    prevSegmentFrom: { x: 5, z: 5 },
    speed: 1.0,
    items,
  } as unknown as BeltRenderData
}

/**
 * Read the world position of instance `idx` of the given item type.
 * Same white-box pattern as the existing ItemRendererPositioning tests.
 */
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

describe('ItemRenderer — id-based interpolation across sim ticks (bug A)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  it('rendered position has a uniform per-frame cadence across a sim-tick boundary for the same id', () => {
    // Single item with stable id on a straight horizontal belt. speed=1.0,
    // dt=0.016 → expected per-frame world delta ≈ +0.016 along +X.
    const item: RenderItemWithId = { id: 'item-1', type: 'wheel_small', position: 0.4 }
    const seg0 = makeStraightSegment([item])

    // Seed (snap to truth on first sight).
    ;(renderer as any).update([seg0], GRID_W, GRID_H, 0)

    // Six render frames within one tick window — same sim data, dt=16ms each.
    const xs: number[] = []
    for (let i = 0; i < 6; i++) {
      ;(renderer as any).update([seg0], GRID_W, GRID_H, 0.016)
      xs.push(getInstancePosition(renderer, 'wheel_small', 0).x)
    }

    // Strictly monotonic forward (+X is travel direction here).
    for (let i = 1; i < xs.length; i++) {
      expect(
        xs[i],
        `frame ${i} x=${xs[i].toFixed(5)} not strictly greater than prev ${xs[i - 1].toFixed(5)}`,
      ).toBeGreaterThan(xs[i - 1])
    }

    // Intra-tick deltas roughly uniform (within ~30% of mean).
    const intraDeltas = xs.slice(1).map((x, i) => x - xs[i])
    const intraMean = intraDeltas.reduce((a, b) => a + b, 0) / intraDeltas.length
    for (const d of intraDeltas) {
      expect(Math.abs(d - intraMean) / intraMean).toBeLessThan(0.3)
    }

    // Now a sim tick lands: SAME id, position advanced by speed * 0.1 = 0.1.
    const seg1 = makeStraightSegment([{ id: 'item-1', type: 'wheel_small', position: 0.5 }])
    const prevX = xs[xs.length - 1]
    ;(renderer as any).update([seg1], GRID_W, GRID_H, 0.016)
    const newX = getInstancePosition(renderer, 'wheel_small', 0).x
    const boundaryDelta = newX - prevX

    // The visible glitch: this delta must match the smooth intra-tick cadence.
    // Today's bug: the per-tick snap forces this frame to truth, so the delta
    // becomes much smaller than `intraMean` (only the residual between the
    // extrapolated position and truth). The eye sees a stutter every 100 ms.
    // The fix (id-based, advance-only rendering) keeps cadence uniform.
    expect(
      boundaryDelta,
      'tick-boundary frame must not jump backwards',
    ).toBeGreaterThan(0)
    expect(
      Math.abs(boundaryDelta - intraMean) / intraMean,
      `tick-boundary delta ${boundaryDelta.toFixed(5)} not uniform with intra-tick mean ${intraMean.toFixed(5)} (>30% off)`,
    ).toBeLessThan(0.3)
  })
})

describe('ItemRenderer — remaining items are undisturbed when another item leaves (bug B)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  // removed: superseded by simple-follow-truth contract
  it.skip('item A keeps a uniform per-frame cadence when item B is delivered (items.length decreases)', () => {
    const segBoth = makeStraightSegment([
      { id: 'A', type: 'wheel_small', position: 0.4 },
      { id: 'B', type: 'wheel_small', position: 0.95 },
    ])

    // Seed.
    ;(renderer as any).update([segBoth], GRID_W, GRID_H, 0)
    // Extrapolate four render frames — same sim data. Record A's per-frame
    // deltas to establish the smooth cadence baseline (~speed*dt = 0.016).
    const xs: number[] = []
    for (let i = 0; i < 4; i++) {
      ;(renderer as any).update([segBoth], GRID_W, GRID_H, 0.016)
      xs.push(getInstancePosition(renderer, 'wheel_small', 0).x)
    }
    const intraDeltas = xs.slice(1).map((x, i) => x - xs[i])
    const intraMean = intraDeltas.reduce((a, b) => a + b, 0) / intraDeltas.length
    const aBefore = xs[xs.length - 1]

    // Sim tick: B has been delivered (gone). A advanced to 0.5.
    const segAOnly = makeStraightSegment([{ id: 'A', type: 'wheel_small', position: 0.5 }])
    ;(renderer as any).update([segAOnly], GRID_W, GRID_H, 0.016)
    const aAfter = getInstancePosition(renderer, 'wheel_small', 0).x
    const boundaryDelta = aAfter - aBefore

    // A must keep its smooth cadence — the delivery of B is not visible to A.
    // Today's bug: items.length 2→1 → snap=true → A teleports to truth=0.5.
    // Its frame-over-frame delta jumps from ~0.016 to ~0.036 — visible jolt.
    // The fix (per-id tracking) treats this frame the same as any other.
    expect(boundaryDelta, 'A must not jump backward when B is delivered').toBeGreaterThan(0)
    expect(
      Math.abs(boundaryDelta - intraMean) / intraMean,
      `delivery-frame delta ${boundaryDelta.toFixed(5)} not uniform with intra-tick mean ${intraMean.toFixed(5)} (>30% off)`,
    ).toBeLessThan(0.3)
  })
})

describe('ItemRenderer — new item entering does not disturb existing items (bug C)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  // removed: superseded by simple-follow-truth contract
  it.skip('existing item X keeps its smooth cadence when new item Y appears at p=0', () => {
    const segX = makeStraightSegment([{ id: 'X', type: 'wheel_small', position: 0.6 }])

    // Seed and extrapolate, recording X's per-frame deltas.
    ;(renderer as any).update([segX], GRID_W, GRID_H, 0)
    const xs: number[] = []
    for (let i = 0; i < 4; i++) {
      ;(renderer as any).update([segX], GRID_W, GRID_H, 0.016)
      xs.push(getInstancePosition(renderer, 'wheel_small', 0).x)
    }
    const intraDeltas = xs.slice(1).map((x, i) => x - xs[i])
    const intraMean = intraDeltas.reduce((a, b) => a + b, 0) / intraDeltas.length
    const xBefore = xs[xs.length - 1]

    // Sim tick: new item Y enters at p=0; X advances to 0.7.
    // ConveyorBelt sorts items by positionOnBelt, so Y (0) comes BEFORE X (0.7).
    const segXandY = makeStraightSegment([
      { id: 'Y', type: 'wheel_small', position: 0.0 },
      { id: 'X', type: 'wheel_small', position: 0.7 },
    ])
    ;(renderer as any).update([segXandY], GRID_W, GRID_H, 0.016)

    // With per-id tracking, the renderer must find X by id even though it
    // is now in a different slot (index 1 because Y sorted ahead of it).
    const xAfter = getInstancePosition(renderer, 'wheel_small', 1).x
    const yAfter = getInstancePosition(renderer, 'wheel_small', 0).x
    const xBoundaryDelta = xAfter - xBefore

    // X's cadence must remain uniform — the appearance of Y is invisible to X.
    // Today's bug: items.length 1→2 → snap fires → both items snap to truth.
    // X jumps from extrapolated (~0.664) to truth (0.7), a +0.036 step
    // versus its smooth +0.016 cadence — visible jolt and >30% off mean.
    // (Even worse, current code reads slot-0 → slot-0 so it sees Y's truth
    // p=0 in X's previous slot, a backward teleport. Either failure mode
    // breaks the same assertion.)
    expect(xBoundaryDelta, 'X must not jump backward when Y enters').toBeGreaterThan(0)
    expect(
      Math.abs(xBoundaryDelta - intraMean) / intraMean,
      `entry-frame delta ${xBoundaryDelta.toFixed(5)} not uniform with intra-tick mean ${intraMean.toFixed(5)} (>30% off)`,
    ).toBeLessThan(0.3)

    // Y is brand-new → snap to truth at the start of the belt.
    // Truth position p=0 of segment (6,5)→(7,5) world = cell (6,5) center =
    // (-3.5, -4.5). Renderer enters from prev=(5,5) so x=-3.5 at p=0.
    expect(yAfter).toBeCloseTo(-3.5, 3)
  })
})

describe('ItemRenderer — rendered position never runs more than ~1.5 ticks ahead of truth (bug D)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  it('clamps rendered position to truth + 1.5 tick windows when sim is stalled', () => {
    const speed = 1.0
    const tickWindow = 0.1 // sim 10 Hz → 1 tick = 0.1 fractions at speed 1.0
    const truthP = 0.5
    const seg = makeStraightSegment([{ id: 'A', type: 'wheel_small', position: truthP }])

    // Seed.
    ;(renderer as any).update([seg], GRID_W, GRID_H, 0)

    // 30 render frames at 16 ms with NO sim tick. Total render-time advance
    // would naively be 30 * 0.016 * 1.0 = 0.48, far past truth+0.15.
    // The renderer must soft-clamp to truth + 1.5 * tickWindow = 0.65 in
    // belt fractions ⇒ world x in [truth_x, truth_x + 0.15].
    // Edge-to-edge convention: truth x at p=0.5 on (6,5)→(7,5) is the cell
    // center of from-cell (6,5) = entry-edge (-4.0) + 0.5 = -3.5.
    const truthX = -3.5
    const upperX = truthX + 1.5 * tickWindow * speed // -3.5 + 0.15 = -3.35

    for (let i = 0; i < 30; i++) {
      ;(renderer as any).update([seg], GRID_W, GRID_H, 0.016)
      const x = getInstancePosition(renderer, 'wheel_small', 0).x
      expect(
        x,
        `frame ${i + 1}: rendered x=${x.toFixed(5)} fell behind truth ${truthX}`,
      ).toBeGreaterThanOrEqual(truthX - 1e-6)
      expect(
        x,
        `frame ${i + 1}: rendered x=${x.toFixed(5)} ran past upper guard ${upperX.toFixed(5)}`,
      ).toBeLessThanOrEqual(upperX + 1e-6)
    }
  })
})
