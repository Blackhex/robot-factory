/**
 * @vitest-environment jsdom
 *
 * Pause/render contract guard for ItemRenderer.
 *
 * When the caller signals pause via the explicit 5th argument
 * `paused = true` to `ItemRenderer.update(belts, gridW, gridH, dt,
 * paused)`, the renderer MUST NOT advance any item arc and MUST NOT snap
 * to simulator truth. It must HOLD the previously rendered `renderedArc`
 * / `beltKey` for items that already have prior render state. The `dt`
 * value passed alongside `paused = true` is ignored.
 *
 * When `paused` is `false` (default) the renderer behaves normally,
 * including the legacy `dt = 0` first-sight snap-to-truth resync path used
 * by `ItemRendererPositioning`.
 *
 * `main.ts` forwards `sim.paused` (or `sim?.paused ?? false`) as the 5th
 * argument and passes the regular per-frame `dt` unchanged.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ItemRenderer,
  type BeltRenderData,
} from '../../../src/rendering/ItemRenderer'
import {
  buildBeltPath,
  sampleBeltPath,
} from '../../../src/rendering/BeltPath'
import type { ItemType } from '../../../src/game/types'

const GRID_W = 20
const GRID_H = 20
const ITEM_TYPE: ItemType = 'wheel_small'
const SPEED = 1.0

type RenderItemWithId = { id: string; type: ItemType; position: number }

/**
 * Read instance `idx` world position out of the InstancedMesh matrix —
 * the same white-box pattern used by sibling tests
 * (e.g. `ItemRendererInterpolation.test.ts`).
 */
function getInstancePosition(
  renderer: ItemRenderer,
  type: ItemType,
  idx: number,
): { x: number; y: number; z: number } {
  const meshes = (renderer as unknown as {
    meshes: Map<ItemType, THREE.InstancedMesh>
  }).meshes
  const mesh = meshes.get(type)!
  const m = new THREE.Matrix4()
  mesh.getMatrixAt(idx, m)
  const pos = new THREE.Vector3()
  pos.setFromMatrixPosition(m)
  return { x: pos.x, y: pos.y, z: pos.z }
}

/**
 * Build a straight horizontal chain of `n` cells starting at (x0, z0)
 * along +X. Returns one BeltRenderData per segment with prev/next wired
 * so `buildBeltPath` produces the mid-chain full-cell geometry.
 */
function buildStraightChain(
  n: number,
  x0: number,
  z0: number,
  items: ReadonlyArray<RenderItemWithId>,
  itemBeltIndex: number,
): BeltRenderData[] {
  const segs: BeltRenderData[] = []
  for (let i = 0; i < n; i++) {
    const fromX = x0 + i
    const toX = x0 + i + 1
    segs.push({
      from: { x: fromX, z: z0 },
      to: { x: toX, z: z0 },
      prevSegmentFrom: i > 0 ? { x: x0 + i - 1, z: z0 } : undefined,
      speed: SPEED,
      items: i === itemBeltIndex ? items : [],
    } as unknown as BeltRenderData)
  }
  return segs
}

/**
 * Build an L-shaped chain: 3 horizontal cells (+X), then a corner, then
 * 3 vertical cells (+Z). 6 segments total connecting 7 cells.
 */
function buildLChain(
  items: ReadonlyArray<RenderItemWithId>,
  itemBeltIndex: number,
): BeltRenderData[] {
  // Cells: (2,5)→(3,5)→(4,5)→(5,5)→(5,6)→(5,7)→(5,8)
  const cells = [
    { x: 2, z: 5 },
    { x: 3, z: 5 },
    { x: 4, z: 5 },
    { x: 5, z: 5 },
    { x: 5, z: 6 },
    { x: 5, z: 7 },
    { x: 5, z: 8 },
  ]
  const segs: BeltRenderData[] = []
  for (let i = 0; i < cells.length - 1; i++) {
    segs.push({
      from: cells[i],
      to: cells[i + 1],
      prevSegmentFrom: i > 0 ? cells[i - 1] : undefined,
      speed: SPEED,
      items: i === itemBeltIndex ? items : [],
    } as unknown as BeltRenderData)
  }
  return segs
}

describe('ItemRenderer — pause contract (regression guards)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  it('P1: dt=0 frames do not advance an item on a straight belt', () => {
    // GIVEN: a 4-cell straight chain, one item seated at slot 0.5 of the
    // second cell (interior arc — not slot 0).
    const item: RenderItemWithId = {
      id: 'item-P1',
      type: ITEM_TYPE,
      position: 0.5,
    }
    const segs = buildStraightChain(4, 4, 5, [item], 1)

    // Seed with dt=0 so the renderer snaps to truth on first sight.
    renderer.update(segs, GRID_W, GRID_H, 0)

    // Advance several render frames at dt=0.1 so the per-item state is
    // populated and rendered position is at an interior arc (not zero).
    for (let i = 0; i < 5; i++) {
      renderer.update(segs, GRID_W, GRID_H, 0.1)
    }
    const seedPos = getInstancePosition(renderer, ITEM_TYPE, 0)
    // Sanity: must be on the second cell (interior arc, not slot 0).
    expect(Math.hypot(seedPos.x, seedPos.z)).toBeGreaterThan(0)

    // WHEN: 30 frames with paused=true and IDENTICAL belt state. A real
    // dt is passed to prove the pause signal — not dt=0 — is what
    // causes the hold.
    const positions: { x: number; y: number; z: number }[] = []
    for (let i = 0; i < 30; i++) {
      renderer.update(segs, GRID_W, GRID_H, 0.016, true)
      positions.push(getInstancePosition(renderer, ITEM_TYPE, 0))
    }

    // THEN: every recorded position is exactly equal — no drift across
    // 30 paused frames.
    for (let i = 0; i < positions.length; i++) {
      expect(
        positions[i].x,
        `frame ${i} x drifted from frame 0`,
      ).toBe(positions[0].x)
      expect(
        positions[i].y,
        `frame ${i} y drifted from frame 0`,
      ).toBe(positions[0].y)
      expect(
        positions[i].z,
        `frame ${i} z drifted from frame 0`,
      ).toBe(positions[0].z)
    }
  })

  it('P2: dt=0 frames do not advance an item across a corner / multi-cell chain', () => {
    // GIVEN: an L-shaped 6-segment chain, one item on the 3rd segment
    // (just before the corner) at slot 0.4.
    const item: RenderItemWithId = {
      id: 'item-P2',
      type: ITEM_TYPE,
      position: 0.4,
    }
    const segs = buildLChain([item], 2)

    // Seed + a few advancing frames so renderedArc is in an interior
    // arc and (potentially) has been predictively switched onto the
    // corner cell.
    renderer.update(segs, GRID_W, GRID_H, 0)
    for (let i = 0; i < 5; i++) {
      renderer.update(segs, GRID_W, GRID_H, 0.1)
    }

    // WHEN: 60 frames with paused=true and identical belt state. A real
    // dt is passed to prove the pause signal causes the hold.
    const positions: { x: number; y: number; z: number }[] = []
    for (let i = 0; i < 60; i++) {
      renderer.update(segs, GRID_W, GRID_H, 0.016, true)
      positions.push(getInstancePosition(renderer, ITEM_TYPE, 0))
    }

    // THEN: every recorded position is exactly equal.
    for (let i = 0; i < positions.length; i++) {
      expect(positions[i].x).toBe(positions[0].x)
      expect(positions[i].y).toBe(positions[0].y)
      expect(positions[i].z).toBe(positions[0].z)
    }
  })

  // removed: superseded by simple-follow-truth contract
  it.skip('P3: after a paused window, items resume advancing at the pre-pause cadence', () => {
    // GIVEN: a 4-cell straight chain with a single item at slot 0.5 of
    // the second cell.
    const item: RenderItemWithId = {
      id: 'item-P3',
      type: ITEM_TYPE,
      position: 0.5,
    }
    const segs = buildStraightChain(4, 4, 5, [item], 1)

    // Seed.
    renderer.update(segs, GRID_W, GRID_H, 0)

    // Phase A: 10 frames at dt=0.1 (running). Record per-frame Δworld.
    const dt = 0.1
    const xsBefore: number[] = []
    for (let i = 0; i < 10; i++) {
      renderer.update(segs, GRID_W, GRID_H, dt)
      xsBefore.push(getInstancePosition(renderer, ITEM_TYPE, 0).x)
    }
    const beforeDeltas = xsBefore
      .slice(1)
      .map((x, i) => x - xsBefore[i])
    const beforeMean =
      beforeDeltas.reduce((a, b) => a + b, 0) / beforeDeltas.length
    expect(beforeMean).toBeGreaterThan(0)

    // Phase B: 30 frames with paused=true (real dt; pause signal must
    // cause the hold).
    const pausedXs: number[] = []
    for (let i = 0; i < 30; i++) {
      renderer.update(segs, GRID_W, GRID_H, dt, true)
      pausedXs.push(getInstancePosition(renderer, ITEM_TYPE, 0).x)
    }
    // Pause invariant: no drift across the paused window.
    for (let i = 1; i < pausedXs.length; i++) {
      expect(pausedXs[i]).toBe(pausedXs[0])
    }

    // Phase C: 10 frames at dt=0.1 (resumed). Record per-frame Δworld.
    const xsAfter: number[] = [pausedXs[pausedXs.length - 1]]
    for (let i = 0; i < 10; i++) {
      renderer.update(segs, GRID_W, GRID_H, dt)
      xsAfter.push(getInstancePosition(renderer, ITEM_TYPE, 0).x)
    }
    const afterDeltas = xsAfter
      .slice(1)
      .map((x, i) => x - xsAfter[i])

    // THEN: monotonically advancing across the resume window.
    for (let i = 0; i < afterDeltas.length; i++) {
      expect(
        afterDeltas[i],
        `resume frame ${i} did not advance forward`,
      ).toBeGreaterThan(0)
    }

    // AND: the resume cadence's average per-frame Δworld is within ±15%
    // of the pre-pause cadence (locks the contract that pausing is a
    // pure stop, not a speed change).
    const afterMean =
      afterDeltas.reduce((a, b) => a + b, 0) / afterDeltas.length
    expect(
      Math.abs(afterMean - beforeMean) / beforeMean,
      `resume mean Δworld ${afterMean.toExponential(3)} differs from pre-pause ${beforeMean.toExponential(3)} by more than 15%`,
    ).toBeLessThan(0.15)
  })
})

describe('main.ts — pause/render integration contract', () => {
  it('forwards sim.paused as the 5th argument to itemRenderer.update', () => {
    // CONTRACT: the animation loop in `src/main.ts` must forward
    // `sim.paused` (or an equivalent boolean) as the 5th argument to
    // `itemRenderer.update`. The `dt` argument must remain the regular
    // per-frame delta — the previous `sim.paused ? 0 : dt` ternary is
    // no longer accepted, because the renderer now distinguishes pause
    // (hold prev render state) from a `dt = 0` resync.
    //
    // Acceptable shapes (any one suffices):
    //   itemRenderer.update(<args>, dt, sim.paused)
    //   itemRenderer.update(<args>, dt, sim?.paused ?? false)
    //   itemRenderer.update(<args>, dt, !!sim?.paused)
    //
    // This test grep-asserts the source so it stays a unit-level guard
    // (the user-visible behaviour will be re-verified by an E2E spec).
    const mainSource = readFileSync(
      join(__dirname, '../../../src/main.ts'),
      'utf-8',
    )

    // Locate the itemRenderer.update(...) call site. Allow nested
    // parens inside the call by being non-greedy on the outer match.
    const callMatch = mainSource.match(/itemRenderer\.update\(([\s\S]*?)\)\s*;?/)
    expect(
      callMatch,
      'expected an itemRenderer.update(...) call in src/main.ts',
    ).not.toBeNull()
    const callArgs = callMatch![1]

    // Reject the previous `sim.paused ? 0 : dt` (or inverse) gating
    // pattern — it must not appear anywhere near the call site.
    const callIdx = mainSource.indexOf(callMatch![0])
    const windowStart = Math.max(0, callIdx - 800)
    const windowEnd = Math.min(
      mainSource.length,
      callIdx + callMatch![0].length + 200,
    )
    const windowSrc = mainSource.slice(windowStart, windowEnd)

    const legacyTernary =
      /sim\??\.paused\s*\?\s*0\s*:\s*dt/.test(windowSrc) ||
      /!\s*sim\??\.paused\s*\?\s*dt\s*:\s*0/.test(windowSrc)
    expect(
      legacyTernary,
      'main.ts must not gate dt via `sim.paused ? 0 : dt`; pass the regular `dt` and forward `sim.paused` as the 5th argument instead.',
    ).toBe(false)

    // Require a 5th argument that references sim.paused. Acceptable:
    //   ..., dt, sim.paused
    //   ..., dt, sim?.paused ?? false
    //   ..., dt, !!sim?.paused
    //   ..., dt, Boolean(sim?.paused)
    const pausedArgPattern =
      /,\s*(?:[A-Za-z_$][\w$]*\s*=\s*)?(?:!\s*!?\s*)?(?:Boolean\(\s*)?sim\??\.paused(?:\s*\)\s*)?(?:\s*\?\?\s*false)?\s*\)?\s*$/
    const hasPausedArg = pausedArgPattern.test(callArgs.trim()) ||
      // Also allow a boolean variable like `paused` if it is plainly
      // assigned from sim.paused in the same window.
      (/,\s*paused\s*\)?\s*$/.test(callArgs.trim()) &&
        /(?:const|let|var)\s+paused\s*=\s*(?:!?!?\s*)?sim\??\.paused/.test(
          windowSrc,
        ))

    expect(
      hasPausedArg,
      `src/main.ts must pass sim.paused (or sim?.paused ?? false / !!sim?.paused) as the 5th argument to itemRenderer.update. ` +
        `Inspected call args:\n---\n${callArgs}\n---\nWindow:\n---\n${windowSrc}\n---`,
    ).toBe(true)
  })
})

describe('ItemRenderer — pause must hold rendered position (no truth-snap)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  /**
   * Compute the world position the simulator's "truth" arc maps to:
   * the exact mid-cell point for an item at slot 0.5 on the chosen
   * mid-chain straight segment. Used to assert that a paused frame's
   * rendered position is NOT a snap-back to truth.
   */
  function getTruthWorldPosition(
    segs: BeltRenderData[],
    itemBeltIndex: number,
    slot: number,
  ): { x: number; z: number } {
    const seg = segs[itemBeltIndex]
    const path = buildBeltPath(
      seg.from,
      seg.to,
      seg.prevSegmentFrom,
      GRID_W / 2,
      GRID_H / 2,
    )
    const out = { x: 0, y: 0, z: 0 }
    sampleBeltPath(path, slot, out)
    return { x: out.x, z: out.z }
  }

  // removed: superseded by simple-follow-truth contract
  it.skip('P4: dt=0 holds rendered position; does NOT snap to simulator truth', () => {
    // GIVEN: 4-cell straight chain, item at slot 0.5 of the second cell.
    const item: RenderItemWithId = {
      id: 'item-P4',
      type: ITEM_TYPE,
      position: 0.5,
    }
    const segs = buildStraightChain(4, 4, 5, [item], 1)

    // Seed (dt=0 first sight snaps to truth).
    renderer.update(segs, GRID_W, GRID_H, 0)
    const truthWorld = getTruthWorldPosition(segs, 1, 0.5)
    const seededPos = getInstancePosition(renderer, ITEM_TYPE, 0)
    // Sanity: seed position equals truth world position.
    expect(seededPos.x).toBeCloseTo(truthWorld.x, 6)
    expect(seededPos.z).toBeCloseTo(truthWorld.z, 6)

    // Advance 5 frames at dt=0.05 (speed=1 ⇒ +0.05/frame ⇒ +0.25 arc),
    // pushing renderedArc from 0.5 → 0.75 — clearly ahead of truth.
    for (let i = 0; i < 5; i++) {
      renderer.update(segs, GRID_W, GRID_H, 0.05)
    }
    const P1 = getInstancePosition(renderer, ITEM_TYPE, 0)

    // Sanity: rendered has built up a measurable lead vs truth.
    const leadDist = Math.hypot(P1.x - truthWorld.x, P1.z - truthWorld.z)
    expect(
      leadDist,
      `pre-pause sanity: rendered must lead truth by a measurable amount`,
    ).toBeGreaterThan(0.15)

    // WHEN: a single paused=true frame (real dt; the pause signal must
    // cause the hold, not dt=0).
    renderer.update(segs, GRID_W, GRID_H, 0.016, true)
    const P2 = getInstancePosition(renderer, ITEM_TYPE, 0)

    // THEN: P2 must equal P1 (held), NOT snap to truth.
    expect(
      P2.x,
      `dt=0 must HOLD rendered x at P1.x=${P1.x} (truth.x=${truthWorld.x}); got ${P2.x}`,
    ).toBeCloseTo(P1.x, 6)
    expect(
      P2.z,
      `dt=0 must HOLD rendered z at P1.z=${P1.z} (truth.z=${truthWorld.z}); got ${P2.z}`,
    ).toBeCloseTo(P1.z, 6)

    // AND: P2 must be measurably distant from truth (i.e. did not snap).
    const distP2ToTruth = Math.hypot(
      P2.x - truthWorld.x,
      P2.z - truthWorld.z,
    )
    expect(
      distP2ToTruth,
      `paused=true must not snap rendered onto truth; ` +
        `expected distance ≥ pre-pause lead ${leadDist.toExponential(3)}, ` +
        `got ${distP2ToTruth.toExponential(3)}`,
    ).toBeGreaterThanOrEqual(leadDist - 1e-9)
  })

  // removed: superseded by simple-follow-truth contract
  it.skip('P5: pause-then-resume continues from held position, not from truth', () => {
    // GIVEN: 4-cell straight chain, item at slot 0.5 of the second cell.
    const item: RenderItemWithId = {
      id: 'item-P5',
      type: ITEM_TYPE,
      position: 0.5,
    }
    const segs = buildStraightChain(4, 4, 5, [item], 1)
    const truthWorld = getTruthWorldPosition(segs, 1, 0.5)

    renderer.update(segs, GRID_W, GRID_H, 0)

    // Phase A: 10 frames at dt=0.05 ⇒ +0.5 advance from arc 0.5 toward L.
    // (Use 5 frames to stay safely within L=1.0 and avoid predictive
    // cross-belt switches.)
    for (let i = 0; i < 5; i++) {
      renderer.update(segs, GRID_W, GRID_H, 0.05)
    }
    const W_a = getInstancePosition(renderer, ITEM_TYPE, 0)

    // Phase A sanity: rendered is meaningfully ahead of truth.
    const leadA = Math.hypot(W_a.x - truthWorld.x, W_a.z - truthWorld.z)
    expect(leadA).toBeGreaterThan(0.15)

    // Phase B: 30 frames with paused=true (real dt).
    for (let i = 0; i < 30; i++) {
      renderer.update(segs, GRID_W, GRID_H, 0.016, true)
    }
    const W_b = getInstancePosition(renderer, ITEM_TYPE, 0)

    // THEN (pause invariant): W_b held identical to W_a.
    expect(
      W_b.x,
      `paused frame must HOLD x at W_a.x=${W_a.x}; got ${W_b.x} (truth.x=${truthWorld.x})`,
    ).toBeCloseTo(W_a.x, 6)
    expect(W_b.z).toBeCloseTo(W_a.z, 6)

    // Phase C: 1 frame at dt=0.05.
    renderer.update(segs, GRID_W, GRID_H, 0.05)
    const W_c = getInstancePosition(renderer, ITEM_TYPE, 0)

    // THEN (resume invariant): W_c is just slightly ahead of W_b.
    const stepC = Math.hypot(W_c.x - W_b.x, W_c.z - W_b.z)
    // One normal frame at speed=1, dt=0.05 should advance ≈ 0.05 world
    // units. Allow generous bounds (lead-close half-step would still be
    // ~0.025) — but a snap-back-to-truth then forward step would be
    // |W_a - truth| + 0.05 ≈ leadA + 0.05 (way larger).
    expect(
      stepC,
      `resume step must be a small forward advance from held W_b, ` +
        `not a recovery from a paused-frame truth-snap. ` +
        `Got step=${stepC.toExponential(3)}, leadA=${leadA.toExponential(3)}`,
    ).toBeLessThan(leadA * 0.5)
    expect(stepC).toBeGreaterThan(0)
  })
})

