/**
 * @vitest-environment jsdom
 *
 * Renderer regression guards for the cell-handoff stall on chain transit.
 *
 *  Sim ticks at 10 Hz; renderer at ~60 Hz. Drive a deterministic wall-clock
 *  loop with a real `Simulation` plus a chain of `ConveyorBelt` segments
 *  using the `<chainId>_seg<N>` id pattern so `cacheBeltTopology` reads
 *  them as a single chain. An injected stutter frame models RAF jitter /
 *  tab-throttle resume — one big-dt frame fires while sim tick catch-up is
 *  deferred to the next frame.
 *
 *  Contract:
 *    H1 — No per-frame stalls (Δworld < 0.5*mean) on a straight chain after
 *         a stutter, and no two consecutive sub-25 % frames.
 *    H3 — No per-frame stalls (Δworld < 0.25*mean) on a mixed straight +
 *         corner chain after a stutter.
 *    H4 — On a chain-end / single-cell belt `renderedArc` stays ≤ L for
 *         every frame the item is present — the renderer must not overshoot
 *         the cell boundary.
 *
 *  Scope: white-box, renderer-only.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ItemRenderer } from '../../../src/rendering/ItemRenderer'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { Simulation } from '../../../src/game/Simulation'
import { createItem } from '../../../src/game/Item'
import type { ItemType } from '../../../src/game/types'

const GRID_W = 20
const GRID_H = 20
const ITEM_TYPE: ItemType = 'wheel_small'
const SPEED = 1.0
const RENDER_DT = 0.0167
const TICK_INTERVAL = 0.1 // sim ticks every 100 ms wall time
const STUTTER_DT = 0.05 // one slow render frame (~3 normal frames)
const STUTTER_FRAME = 30 // mid-cell, well inside transit window

interface ChainCell {
  x: number
  z: number
}

interface ChainHarness {
  sim: Simulation
  belts: ConveyorBelt[]
  itemId: string
}

/**
 * Build a chain of `ConveyorBelt`s connecting the supplied cells in order.
 * Belt ids follow `chain_seg<N>` so `ItemRenderer.cacheBeltTopology` reads
 * them as a single chain (with prev/prevPrev/next links populated).
 */
function buildChainHarness(cells: ChainCell[]): ChainHarness {
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
  return { sim, belts, itemId: item.id }
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

function readItemRenderedArc(
  renderer: ItemRenderer,
  itemId: string,
): number {
  const states = (renderer as unknown as {
    itemStates: Map<string, { renderedArc: number; pathLength: number }>
  }).itemStates
  return states.get(itemId)?.renderedArc ?? Number.NaN
}

function readItemPathLength(
  renderer: ItemRenderer,
  itemId: string,
): number {
  const states = (renderer as unknown as {
    itemStates: Map<string, { renderedArc: number; pathLength: number }>
  }).itemStates
  return states.get(itemId)?.pathLength ?? Number.NaN
}

function readMeshCount(renderer: ItemRenderer): number {
  const meshes = (renderer as unknown as {
    meshes: Map<ItemType, THREE.InstancedMesh>
  }).meshes
  return meshes.get(ITEM_TYPE)?.count ?? 0
}

/**
 * Drive the simulation + renderer with a deterministic wall-clock loop.
 *  - Each frame advances `wallTime` by `dt`.
 *  - At each frame, while `wallTime - lastTick >= TICK_INTERVAL`, fire a
 *    real `sim.tick()` and bump `lastTick` by `TICK_INTERVAL`.
 *
 * If `stutterFrame` is set, that single frame uses `stutterDt` BUT sim
 * tick catch-up for that frame is DEFERRED (models the RAF/setInterval
 * desync after a tab pause: render fires with a big dt before the sim
 * has had a chance to catch up). On the very next frame the sim runs
 * any deferred ticks before the render call.
 *
 * Recording stops as soon as the item is no longer rendered (delivered
 * or queue-full at end of chain), so callers don't read stale matrices.
 */
function runChainLoop(
  renderer: ItemRenderer,
  harness: ChainHarness,
  frames: number,
  opts: { stutterFrame?: number; stutterDt?: number } = {},
): { positions: THREE.Vector3[]; deltas: number[] } {
  const { sim } = harness
  renderer.cacheBeltTopology(sim.getBelts())
  // Seed: dt=0 → ren snaps to truth.
  renderer.update(
    renderer.buildRenderData(sim.getBelts()),
    GRID_W,
    GRID_H,
    0,
  )

  let wallTime = 0
  let lastTick = 0
  let deferredTickCatchup = false

  const positions: THREE.Vector3[] = []
  for (let f = 1; f <= frames; f++) {
    const isStutter = opts.stutterFrame === f
    const dt = isStutter ? (opts.stutterDt ?? STUTTER_DT) : RENDER_DT
    wallTime += dt

    if (deferredTickCatchup) {
      while (wallTime - lastTick >= TICK_INTERVAL) {
        sim.tick()
        lastTick += TICK_INTERVAL
      }
      deferredTickCatchup = false
    } else if (isStutter) {
      // Stutter: defer tick catch-up to the NEXT frame.
      deferredTickCatchup = true
    } else {
      while (wallTime - lastTick >= TICK_INTERVAL) {
        sim.tick()
        lastTick += TICK_INTERVAL
      }
    }

    renderer.update(
      renderer.buildRenderData(sim.getBelts()),
      GRID_W,
      GRID_H,
      dt,
    )
    if (readMeshCount(renderer) > 0) {
      positions.push(readWorldPos(renderer).clone())
    } else {
      break
    }
  }

  const deltas: number[] = []
  for (let i = 1; i < positions.length; i++) {
    const dx = positions[i].x - positions[i - 1].x
    const dz = positions[i].z - positions[i - 1].z
    deltas.push(Math.hypot(dx, dz))
  }
  return { positions, deltas }
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function findStalls(
  deltas: number[],
  threshold: number,
): { idx: number; d: number; mean: number }[] {
  const m = mean(deltas)
  const out: { idx: number; d: number; mean: number }[] = []
  for (let i = 0; i < deltas.length; i++) {
    if (deltas[i] < threshold * m) {
      out.push({ idx: i, d: deltas[i], mean: m })
    }
  }
  return out
}

describe('ItemRenderer — no per-frame stall at cell-handoff under realistic timing', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  it('H1: 5-cell straight chain — no zero-Δworld frames after RAF stutter pushes ren over the soft horizon', () => {
    // Chain (5,5)..(9,5). 4 segments × 1.0 s = 4.0 s wall time. We run 200
    // frames (~3.34 s) with one stutter at frame 30. The stutter pushes
    // renderedArc ahead of truth by ~0.05 fraction; combined with the
    // pre-existing ~0.0–0.02 lead this exceeds the soft horizon, so the
    // cap at `truthArc + horizonArc` pins renderedArc for 1–2 frames
    // until the next sim tick advances truth. End-of-chain pinning at
    // ~frame 240 is OUTSIDE the analysis window, so this test isolates
    // the in-transit handoff stall.
    const harness = buildChainHarness([
      { x: 5, z: 5 },
      { x: 6, z: 5 },
      { x: 7, z: 5 },
      { x: 8, z: 5 },
      { x: 9, z: 5 },
    ])
    const { deltas } = runChainLoop(renderer, harness, 200, {
      stutterFrame: STUTTER_FRAME,
      stutterDt: STUTTER_DT,
    })

    // Skip first 6 seed-snap frames AND the stutter frame itself plus its
    // immediate neighbour (a single big-dt frame is legitimately a larger
    // Δworld and is not the regression we are testing).
    const steady = deltas.slice(6).filter(
      (_, i) => i + 7 !== STUTTER_FRAME && i + 7 !== STUTTER_FRAME + 1,
    )
    const m = mean(steady)

    // (a) No frame may drop below 50% of mean Δworld.
    const halfStalls = findStalls(steady, 0.5)
    expect(
      halfStalls.length,
      `Δworld < 0.5*mean (${m.toFixed(5)}): ${halfStalls
        .map((s) => `Δ=${s.d.toFixed(5)}`)
        .join(', ')} — the renderer follows truth within ±1 sim-tick on the current cell and never overshoots the cell boundary L; consecutive sub-mean frames indicate a stall at cell handoff.`,
    ).toBe(0)

    // (b) No two consecutive sub-25% frames (UX observed 1–2 frame stalls).
    let consecutive = 0
    let worstRun = 0
    for (const d of steady) {
      if (d < 0.25 * m) {
        consecutive++
        if (consecutive > worstRun) worstRun = consecutive
      } else {
        consecutive = 0
      }
    }
    expect(
      worstRun,
      `Worst consecutive run of frames with Δworld < 0.25*mean = ${worstRun} (must be ≤ 1).`,
    ).toBeLessThanOrEqual(1)
  })

  it('H3: mixed straight + corner chain — no stall at corner→straight or straight→corner handoff after stutter', () => {
    // (5,5) → (6,5) → (7,5) → (8,5) → (8,6) → (8,7)
    // 5 segments with two direction changes — straight→corner (seg 2→3)
    // and corner→straight (seg 3→4) are exercised within the analysis
    // window.
    const harness = buildChainHarness([
      { x: 5, z: 5 },
      { x: 6, z: 5 },
      { x: 7, z: 5 },
      { x: 8, z: 5 },
      { x: 8, z: 6 },
      { x: 8, z: 7 },
    ])
    const { deltas } = runChainLoop(renderer, harness, 240, {
      stutterFrame: STUTTER_FRAME,
      stutterDt: STUTTER_DT,
    })
    const steady = deltas.slice(6).filter(
      (_, i) => i + 7 !== STUTTER_FRAME && i + 7 !== STUTTER_FRAME + 1,
    )
    const m = mean(steady)

    const stalls = findStalls(steady, 0.25)
    expect(
      stalls.length,
      `Δworld < 0.25*mean (${m.toFixed(5)}): ${stalls
        .map((s) => `Δ=${s.d.toFixed(5)}`)
        .join(', ')} — no frame may stall at a cell handoff regardless of straight/corner geometry; the renderer follows truth within ±1 sim-tick on the current cell.`,
    ).toBe(0)
  })

  it('H4: renderedArc stays ≤ L on a chain-end / single-cell belt — the renderer must not overshoot the cell boundary', () => {
    // Single belt, no next chain segment. Place the item near the end and
    // run the loop until the simulation pins / delivers it. The renderer
    // follows truth within ±1 sim-tick on the current cell and must keep
    // `renderedArc ≤ L` for every frame the item is present — no
    // extrapolation may carry it past the final cell boundary.
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
    const seedL = readItemPathLength(renderer, item.id)
    expect(Number.isFinite(seedL) && seedL > 0).toBe(true)

    let wallTime = 0
    let lastTick = 0
    let observedFrames = 0
    for (let f = 1; f <= 30; f++) {
      wallTime += RENDER_DT
      while (wallTime - lastTick >= TICK_INTERVAL) {
        sim.tick()
        lastTick += TICK_INTERVAL
      }
      // Update must never throw, even after delivery (item state pruned).
      expect(() =>
        renderer.update(
          renderer.buildRenderData(sim.getBelts()),
          GRID_W,
          GRID_H,
          RENDER_DT,
        ),
      ).not.toThrow()

      const states = (renderer as unknown as {
        itemStates: Map<string, unknown>
      }).itemStates
      if (!states.has(item.id)) break // delivered / pruned
      observedFrames++

      const arc = readItemRenderedArc(renderer, item.id)
      const L = readItemPathLength(renderer, item.id)
      expect(
        arc,
        `frame ${f}: renderedArc=${arc.toFixed(5)} exceeds L=${L.toFixed(
          5,
        )} on a chain-end segment — the renderer must not overshoot the cell boundary L on the final cell of a chain.`,
      ).toBeLessThanOrEqual(L + 1e-9)
    }

    expect(observedFrames).toBeGreaterThan(0)
  })
})
