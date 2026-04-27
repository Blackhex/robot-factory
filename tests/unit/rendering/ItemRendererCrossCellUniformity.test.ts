/**
 * @vitest-environment jsdom
 *
 * RED-step iter 4c — pin world-space velocity uniformity across a chain
 * that mixes full straights and corners. (Half-cells no longer exist:
 * every straight cell now has L = 1.0 regardless of corner adjacency.)
 *
 *  Bug summary (UX reviewer measurements, iter 4b shipped):
 *   Items render with persistent velocity plateaus along a chain even
 *   though the simulation truth speed is constant 1.0 m/s:
 *     - ~0.87 m/s on a corner cell (L = 2*S + (π/2)*R ≈ 0.871)
 *     - ~1.50 m/s for several cells AFTER the corner (predictive lead
 *       accumulated mid-chain because the horizon cap is suppressed
 *       on every cell that has a `nextSegmentTo`).
 *   CV of measured Δworld ≈ 36 %.
 *
 *  Root causes (renderer-only):
 *   1. The per-frame advance is `speed * activeL * dt` and the cap is
 *      `(EXTRAP_FRACTION_HORIZON / 5) * speed * activeL`. Both scale
 *      with the active cell's arc length L. World-space Δworld therefore
 *      varies with L: corner at ~87 %, full straight at full speed.
 *   2. Predictive cross-belt advance is uncapped on chain-MID belts
 *      (the `!predictive && activeNextKey === undefined` guard disables
 *      the horizon cap). The lead grows monotonically until it reaches
 *      a chain-end belt, where the half-speed close-loop branch finally
 *      fires.
 *   3. The half-speed close-loop branch only fires at chain-end; mid-
 *      chain leads never close.
 *
 *  Scope: white-box, renderer-only — no production source changes in RED.
 *
 *  Expected GREEN outcome (renderer fix in src/rendering/ItemRenderer.ts):
 *   - Per-frame Δworld stays within ±15 % of `speed * dt` independent
 *     of which cell (straight / corner) the item is on.
 *   - Predictive lead is horizon-capped on every belt (mid-chain too)
 *     so the post-corner ~1.5 m/s plateau cannot persist.
 *   - The chain-end clamp (W4 / iter 4b H4) keeps holding.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ItemRenderer } from '../../../src/rendering/ItemRenderer'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { Simulation } from '../../../src/game/Simulation'
import { createItem } from '../../../src/game/Item'
import { buildBeltPath } from '../../../src/rendering/BeltPath'
import type { ItemType } from '../../../src/game/types'

const GRID_W = 20
const GRID_H = 20
const HALF_W = GRID_W / 2
const HALF_H = GRID_H / 2
const ITEM_TYPE: ItemType = 'wheel_small'
const SPEED = 1.0
const TICK_INTERVAL = 0.1
const TOL = 0.15 // ±15 % tolerance band

interface Cell {
  x: number
  z: number
}

interface ChainHarness {
  sim: Simulation
  belts: ConveyorBelt[]
  itemId: string
  cellLengths: number[]
}

function buildChain(cells: Cell[]): ChainHarness {
  const sim = new Simulation()
  const belts: ConveyorBelt[] = []
  for (let i = 0; i < cells.length - 1; i++) {
    const a = cells[i]
    const b = cells[i + 1]
    const belt = new ConveyorBelt(`chain_seg${i}`, a.x, a.z, b.x, b.z, SPEED)
    sim.addBelt(belt)
    belts.push(belt)
  }
  const item = createItem(ITEM_TYPE)
  belts[0].addItem(item)

  // Pre-compute each segment's arc length using the same builder the
  // renderer uses, so test arithmetic on rendered_arc_from_chain_start
  // stays consistent with what the renderer actually integrates.
  const cellLengths: number[] = []
  for (let i = 0; i < belts.length; i++) {
    const b = belts[i]
    const prev = i > 0
      ? { x: belts[i - 1].fromX, z: belts[i - 1].fromZ }
      : undefined
    const path = buildBeltPath(
      { x: b.fromX, z: b.fromZ },
      { x: b.toX, z: b.toZ },
      prev,
      HALF_W,
      HALF_H,
    )
    cellLengths.push(path.length)
  }
  return { sim, belts, itemId: item.id, cellLengths }
}

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

function readMeshCount(renderer: ItemRenderer): number {
  const meshes = (renderer as unknown as {
    meshes: Map<ItemType, THREE.InstancedMesh>
  }).meshes
  return meshes.get(ITEM_TYPE)?.count ?? 0
}

function readItemState(
  renderer: ItemRenderer,
  id: string,
): { renderedArc: number; beltKey: string; pathLength: number } | undefined {
  const states = (renderer as unknown as {
    itemStates: Map<
      string,
      { renderedArc: number; beltKey: string; pathLength: number }
    >
  }).itemStates
  return states.get(id)
}

function beltKey(b: ConveyorBelt): string {
  return `${b.fromX},${b.fromZ}->${b.toX},${b.toZ}`
}

interface FrameRecord {
  pos: THREE.Vector3
  truthArcFromChainStart: number
  renderedArcFromChainStart: number
}

/**
 * Deterministic wall-clock loop:
 *  - Each frame advances `wallTime` by `dt`.
 *  - At each frame we consume any due 100 ms sim ticks before rendering.
 *  - Recording stops once the item is no longer rendered (delivered).
 *
 * Records, per frame:
 *  - rendered world position (XZ)
 *  - sim truth arc-length-from-chain-start
 *  - renderer arc-length-from-chain-start (uses itemStates beltKey to
 *    locate the active segment, then sums preceding cellLengths)
 */
function runChainLoop(
  renderer: ItemRenderer,
  harness: ChainHarness,
  dt: number,
  totalSeconds: number,
): FrameRecord[] {
  const { sim, belts, itemId, cellLengths } = harness
  renderer.cacheBeltTopology(sim.getBelts())
  // Seed (dt=0): ren snaps to truth.
  renderer.update(
    renderer.buildRenderData(sim.getBelts()),
    GRID_W,
    GRID_H,
    0,
  )

  let wallTime = 0
  let lastTick = 0
  const frames = Math.round(totalSeconds / dt)
  const records: FrameRecord[] = []

  for (let f = 1; f <= frames; f++) {
    wallTime += dt
    while (wallTime - lastTick >= TICK_INTERVAL - 1e-9) {
      sim.tick()
      lastTick += TICK_INTERVAL
    }
    renderer.update(
      renderer.buildRenderData(sim.getBelts()),
      GRID_W,
      GRID_H,
      dt,
    )
    if (readMeshCount(renderer) === 0) break

    const pos = readWorldPos(renderer).clone()

    // Truth arc from chain start.
    let truthArc = Number.NaN
    for (let i = 0; i < belts.length; i++) {
      const it = belts[i].getItems().find((x) => x.id === itemId)
      if (it) {
        truthArc = 0
        for (let k = 0; k < i; k++) truthArc += cellLengths[k]
        truthArc += it.positionOnBelt * cellLengths[i]
        break
      }
    }

    // Rendered arc from chain start (resolve active belt by key).
    const st = readItemState(renderer, itemId)
    let renderedArc = Number.NaN
    if (st) {
      let beltIdx = -1
      for (let i = 0; i < belts.length; i++) {
        if (beltKey(belts[i]) === st.beltKey) {
          beltIdx = i
          break
        }
      }
      if (beltIdx >= 0) {
        renderedArc = 0
        for (let k = 0; k < beltIdx; k++) renderedArc += cellLengths[k]
        renderedArc += st.renderedArc
      }
    }

    records.push({
      pos,
      truthArcFromChainStart: truthArc,
      renderedArcFromChainStart: renderedArc,
    })
  }
  return records
}

function deltasOf(records: FrameRecord[]): number[] {
  const out: number[] = []
  for (let i = 1; i < records.length; i++) {
    const dx = records[i].pos.x - records[i - 1].pos.x
    const dz = records[i].pos.z - records[i - 1].pos.z
    out.push(Math.hypot(dx, dz))
  }
  return out
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

describe('ItemRenderer — world-space velocity uniformity across mixed chain (iter 4c)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  // removed: superseded by simple-follow-truth contract
  it.skip('W1: 60 FPS — per-frame Δworld within ±15 % of speed*dt across straights + corner', () => {
    // Chain (4,5) → (5,5) → (6,5) → (6,6) → (7,6) → (8,6).
    // From-cells of the 5 segments: (4,5) straight (L=1),
    // (5,5) straight (L=1), (6,5) corner +X→+Z (L≈0.871),
    // (6,6) corner +Z→+X (L≈0.871), (7,6) straight (L=1).
    const harness = buildChain([
      { x: 4, z: 5 },
      { x: 5, z: 5 },
      { x: 6, z: 5 },
      { x: 6, z: 6 },
      { x: 7, z: 6 },
      { x: 8, z: 6 },
    ])
    const dt = 0.0167
    const records = runChainLoop(renderer, harness, dt, 1.5)
    const deltas = deltasOf(records)

    const target = SPEED * dt
    const lo = target * (1 - TOL)
    const hi = target * (1 + TOL)
    // Skip the first 6 frames (seed-snap + first sim tick window).
    const steady = deltas.slice(6)

    const violations = steady.filter((d) => d < lo || d > hi)
    const minD = Math.min(...steady)
    const maxD = Math.max(...steady)
    const cv = coefficientOfVariation(steady)

    // EXPECTED FAIL — corner plateau ~0.0145, full straight ~0.0167.
    // Worst-low ~0.0145 < lo (0.0142). Any post-corner predictive lead
    // (~0.025+) further breaks the band.
    expect(
      violations.length,
      `Δworld out of [${lo.toFixed(5)}, ${hi.toFixed(5)}] (target=${target.toFixed(
        5,
      )}); min=${minD.toFixed(5)} max=${maxD.toFixed(5)}; ${violations.length}/${steady.length} frames violate. ` +
        `L-dependent advance produces world-space plateaus: corner ≈ ${(SPEED * 0.871 * dt).toFixed(5)}, straight ≈ ${target.toFixed(5)}.`,
    ).toBe(0)

    expect(
      cv,
      `CV(Δworld) at 60 FPS = ${cv.toFixed(4)} (target < 0.10) — variance dominated by L-dependent per-frame advance.`,
    ).toBeLessThan(0.1)
  })

  // removed: superseded by simple-follow-truth contract
  it.skip('W2: 30 FPS — per-frame Δworld within ±15 % of speed*dt across the same chain', () => {
    // Same chain as W1 but rendered at 30 FPS. The per-frame cap
    // 0.03 * activeL binds harder at 30 FPS (naturalAdvance > cap on
    // every full straight cell), exposing the L-dependency more.
    const harness = buildChain([
      { x: 4, z: 5 },
      { x: 5, z: 5 },
      { x: 6, z: 5 },
      { x: 6, z: 6 },
      { x: 7, z: 6 },
      { x: 8, z: 6 },
    ])
    const dt = 0.0333
    const records = runChainLoop(renderer, harness, dt, 1.5)
    const deltas = deltasOf(records)

    const target = SPEED * dt
    const lo = target * (1 - TOL)
    const hi = target * (1 + TOL)
    // At 30 FPS only 1 sim tick fits per ~3 frames; skip first 3 seed
    // frames.
    const steady = deltas.slice(3)

    const violations = steady.filter((d) => d < lo || d > hi)
    const minD = Math.min(...steady)
    const maxD = Math.max(...steady)
    const cv = coefficientOfVariation(steady)

    // EXPECTED FAIL — at 30 FPS the cap binds: full straight clamps at
    // 0.03 (cap) instead of natural 0.0333; corner clamps at 0.0261.
    // Neither matches the target band [0.0283, 0.0383].
    expect(
      violations.length,
      `Δworld out of [${lo.toFixed(5)}, ${hi.toFixed(5)}] (target=${target.toFixed(
        5,
      )}); min=${minD.toFixed(5)} max=${maxD.toFixed(5)}; ${violations.length}/${steady.length} frames violate. ` +
        `Per-frame cap (~0.03 * L) binds at 30 FPS: corner ≈ 0.0261, straight ≈ 0.0300 — corner below the 0.0283 lower bound.`,
    ).toBe(0)

    expect(
      cv,
      `CV(Δworld) at 30 FPS = ${cv.toFixed(4)} (target < 0.10) — cap-bound advance is L-proportional.`,
    ).toBeLessThan(0.1)
  })

  it('W3: predictive lead does not persist for more than 1 cell', () => {
    // 6 cells / 5 belts, all full-straight. Speed=1, 60 FPS, 4 s.
    // Run beyond a few sim ticks so any mid-chain predictive carry-over
    // has time to accumulate into a multi-cell lead.
    const harness = buildChain([
      { x: 1, z: 5 },
      { x: 2, z: 5 },
      { x: 3, z: 5 },
      { x: 4, z: 5 },
      { x: 5, z: 5 },
      { x: 6, z: 5 },
    ])
    const dt = 0.0167
    const records = runChainLoop(renderer, harness, dt, 4.0)

    // Lead = renderedArcFromChainStart - truthArcFromChainStart.
    // Allowed band: |lead| < 0.30 (~3 sim-ticks at speed*0.1 — twice
    // the EXTRAP_FRACTION_HORIZON margin so transient first-tick lag
    // is tolerated, sustained mid-chain leads are not).
    const leads = records.map(
      (r) => r.renderedArcFromChainStart - r.truthArcFromChainStart,
    )
    const cap = 0.30
    const violators: { frame: number; lead: number }[] = []
    leads.forEach((lead, i) => {
      if (Number.isFinite(lead) && Math.abs(lead) > cap) {
        violators.push({ frame: i + 1, lead })
      }
    })
    const maxLead = leads.reduce(
      (m, l) => (Number.isFinite(l) && Math.abs(l) > Math.abs(m) ? l : m),
      0,
    )

    // EXPECTED FAIL — predictive carry-over has no horizon on chain-mid
    // belts; lead grows past 1 full cell (~1.0+) and stays there for
    // many frames before any chain-end clamp can close it.
    expect(
      violators.length,
      `${violators.length} frames have |rendered − truth| > ${cap}; worst lead = ${maxLead.toFixed(
        5,
      )}. Predictive carry-over on chain-mid belts is uncapped — ` +
        `the post-corner ~1.5 m/s plateau the UX reviewer measured corresponds to a lead of ~1.5 cells.`,
    ).toBe(0)
  })

  it('W4: chain-end horizon must NOT be exceeded — renderedArc ≤ L on a single belt with no nextSegmentTo', () => {
    // Iter 4b H4 — pinned green here too. Single belt, item at
    // positionOnBelt=0.95. Before delivery the renderer must keep
    // renderedArc ≤ L (no predictive overshoot when there is no next
    // segment). This test should remain green; documenting it together
    // with W1..W3 ensures any GREEN-step renderer changes do not
    // regress the chain-end clamp.
    const sim = new Simulation()
    const belt = new ConveyorBelt('solo', 5, 5, 6, 5, SPEED)
    sim.addBelt(belt)
    const item = createItem(ITEM_TYPE)
    belt.addItem(item)
    item.positionOnBelt = 0.95

    renderer.cacheBeltTopology(sim.getBelts())
    renderer.update(
      renderer.buildRenderData(sim.getBelts()),
      GRID_W,
      GRID_H,
      0,
    )

    let wallTime = 0
    let lastTick = 0
    let observed = 0
    for (let f = 1; f <= 30; f++) {
      wallTime += 0.0167
      while (wallTime - lastTick >= TICK_INTERVAL - 1e-9) {
        sim.tick()
        lastTick += TICK_INTERVAL
      }
      renderer.update(
        renderer.buildRenderData(sim.getBelts()),
        GRID_W,
        GRID_H,
        0.0167,
      )
      const st = readItemState(renderer, item.id)
      if (!st) break
      observed++
      expect(
        st.renderedArc,
        `frame ${f}: renderedArc=${st.renderedArc.toFixed(5)} exceeds L=${st.pathLength.toFixed(
          5,
        )} on chain-end segment.`,
      ).toBeLessThanOrEqual(st.pathLength + 1e-9)
    }
    expect(observed).toBeGreaterThan(0)
  })
})
