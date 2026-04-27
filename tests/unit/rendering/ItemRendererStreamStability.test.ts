/**
 * @vitest-environment jsdom
 *
 * Regression / invariant tests for the long-running stream stability fix.
 *
 *  Bug summary (user-visible symptom):
 *    With the NEW simulation contract (overshoot preserved across
 *    handovers; every tick advances each item by exactly `speed * dt`
 *    regardless of cell boundaries), the renderer's elaborate per-frame
 *    extrapolation machinery — predictive cross-belt advance, lead-close
 *    debounce, chain-arc horizon clamping, MAX_ADVANCE_PER_FRAME_SECONDS
 *    cap — is now actively counter-productive. Items render with
 *    popping, gaps, weird patterns and (under back-pressure) wrong-cell
 *    rendering during long-running simulation, especially after many
 *    parts have been produced.
 *
 *    The renderer was tuned against the OLD simulation that:
 *     - Clamped `positionOnBelt` at 1.0 (overshoot lost).
 *     - Reset `positionOnBelt = 0` on belt-to-belt handover.
 *
 *    Under the new contract, the renderer's predictive extrapolation
 *    races ahead onto downstream belts; back-pressure then leaves items
 *    stuck on the upstream belt at `position > 1` (handover blocked)
 *    while the renderer keeps drifting forward on the wrong belt —
 *    producing visible pops, gaps, and wrong-position rendering.
 *
 *  Invariants verified:
 *     - No mid-chain blink: once an item is rendered, it stays rendered
 *       every frame until the sim consumes it.
 *     - Per-item rendered chain-arc is monotonic across the item's life.
 *     - Rendered chain-arc tracks sim truth within ±1 sim-tick lead.
 *     - Stream spacing is uniform across long runs (10 % tolerance).
 *     - Under back-pressure the rendered position matches sim truth
 *       (not the speculative renderer-only advance) on every cell.
 *
 *  Scope: white-box, real `Simulation` + real `ConveyorBelt` chain.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ItemRenderer } from '../../../src/rendering/ItemRenderer'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { Simulation } from '../../../src/game/Simulation'
import { Machine } from '../../../src/game/Machine'
import { resetItemIdCounter } from '../../../src/game/Item'
import { buildBeltPath } from '../../../src/rendering/BeltPath'
import {
  GRID_W, GRID_H, HALF_W, HALF_H,
  SPEED, TICK_INTERVAL, RENDER_DT,
  FRAMES_PER_TICK, INPUT_CADENCE_TICKS,
  readItemStates, simChainArc, chainOffsetsByKey, injectItem,
  type BeltChainHarness,
} from './itemRendererTestHelpers'

const CHAIN_ID = 'chain1'
const CHAIN_CELLS = 5 // 5 ConveyorBelt segments
// Cells: belt i goes from (i, 0) → (i+1, 0). 5 belts → 5 cells.
const STUB_CAPACITY = 3

interface ChainHarness extends BeltChainHarness {
  sim: Simulation
  outputMachine: Machine
}

/**
 * Build a real Simulation with:
 *   - a chain of 5 ConveyorBelt segments laid along (0,0) → (5,0)
 *   - an output machine at (5,0) (terminal of belt[4])
 * Belt ids follow `<CHAIN_ID>_seg<N>` so the renderer's
 * `cacheBeltTopology` recognises the chain and populates prev/next/
 * prevPrev links.
 */
function buildHarness(outputType: 'sink' | 'stub'): ChainHarness {
  const sim = new Simulation()
  const belts: ConveyorBelt[] = []
  for (let i = 0; i < CHAIN_CELLS; i++) {
    const belt = new ConveyorBelt(
      `${CHAIN_ID}_seg${i}`,
      i,
      0,
      i + 1,
      0,
      SPEED,
    )
    sim.addBelt(belt)
    belts.push(belt)
  }

  // Output machine at end of chain.
  // - 'sink':   factory_output, always accepts (test 1-4).
  // - 'stub':   assembler with maxInputSlots=STUB_CAPACITY and NO recipe;
  //             accepts inputs until full, then blocks deliveries (test 5).
  const outputMachine =
    outputType === 'sink'
      ? new Machine('output', 'factory_output')
      : new Machine('output', 'assembler', STUB_CAPACITY)
  sim.addMachine(outputMachine)
  sim.setMachinePosition(outputMachine.id, CHAIN_CELLS, 0)

  // Pre-compute path arc length for each belt using the same builder
  // the renderer uses, so chain-arc arithmetic in assertions matches
  // exactly what ItemRenderer integrates internally.
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
  const chainOffsets: number[] = []
  let acc = 0
  for (const L of cellLengths) {
    chainOffsets.push(acc)
    acc += L
  }
  return { sim, belts, outputMachine, cellLengths, chainOffsets }
}

/**
 * Run the sim+render loop for `totalTicks` sim ticks. Every
 * INPUT_CADENCE_TICKS ticks (starting at tick 0) injects one item onto
 * belts[0]. Renders FRAMES_PER_TICK frames between each tick.
 *
 * `onFrame(frameIdx)` is invoked AFTER each render `update`.
 */
function runStream(
  renderer: ItemRenderer,
  harness: ChainHarness,
  totalTicks: number,
  onFrame: (frameIdx: number) => void,
): void {
  renderer.cacheBeltTopology(harness.sim.getBelts())
  // Seed (dt=0): renderer snaps to truth.
  renderer.update(
    renderer.buildRenderData(harness.sim.getBelts()),
    GRID_W,
    GRID_H,
    0,
  )

  let frameIdx = 0
  for (let t = 0; t < totalTicks; t++) {
    if (t % INPUT_CADENCE_TICKS === 0) injectItem(harness)
    harness.sim.tick()
    for (let f = 0; f < FRAMES_PER_TICK; f++) {
      renderer.update(
        renderer.buildRenderData(harness.sim.getBelts()),
        GRID_W,
        GRID_H,
        RENDER_DT,
      )
      onFrame(frameIdx++)
    }
  }
}

describe('ItemRenderer — stream stability under new sim contract', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    resetItemIdCounter()
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  it('no item disappears mid-chain over 200 ticks under back-pressure', () => {
    // GIVEN: long-running sim with a STALLED stub output at the chain
    // end; one item injected every 10 ticks (200 ticks → ~20 items
    // attempted). The user's reported symptom occurs precisely after
    // back-pressure builds: items pile at the back of the chain while
    // the renderer's predictive cross-belt advance speculatively shifts
    // them forward. Any frame where a still-alive id (still in some
    // belt) is NOT rendered is a blink — the user-reported "popping".
    const harness = buildHarness('stub')

    // Per-id, the index of the FIRST and LAST frame on which the id
    // was rendered (i.e. present in itemStates after update). Any id
    // that "blinks" mid-life — a frame in [first, last] where it was
    // missing — is a violation.
    const firstFrame = new Map<string, number>()
    const lastFrame = new Map<string, number>()
    const presence = new Map<string, Set<number>>()

    // Track the SET of ids alive in the simulation each frame so
    // "disappeared mid-chain" can be defined precisely as: id was
    // alive in sim at frame f, but not present in itemStates at f.
    const aliveByFrame: Set<string>[] = []
    runStream(renderer, harness, 200, (f) => {
      const states = readItemStates(renderer)
      for (const id of states.keys()) {
        if (!firstFrame.has(id)) firstFrame.set(id, f)
        lastFrame.set(id, f)
        let s = presence.get(id)
        if (!s) {
          s = new Set<number>()
          presence.set(id, s)
        }
        s.add(f)
      }
      const alive = new Set<string>()
      for (const belt of harness.belts) {
        for (const it of belt.getItems()) alive.add(it.id)
      }
      aliveByFrame[f] = alive
    })

    // THEN (a): every id must have been rendered on every frame
    // between its first and last appearance.
    const blinks: Array<{ id: string; missing: number[] }> = []
    for (const [id, first] of firstFrame) {
      const last = lastFrame.get(id)!
      const seen = presence.get(id)!
      const missing: number[] = []
      for (let f = first; f <= last; f++) {
        if (!seen.has(f)) missing.push(f)
      }
      if (missing.length > 0) blinks.push({ id, missing })
    }
    expect(blinks).toEqual([])

    // THEN (b): every sim-alive id must be rendered on its frame.
    // Catches the scenario where an item is in the simulation but the
    // renderer drops it (e.g. predictive switch onto a non-existent
    // downstream belt, then prune).
    const ghosts: Array<{ frame: number; id: string }> = []
    for (let f = 0; f < aliveByFrame.length; f++) {
      const alive = aliveByFrame[f] ?? new Set<string>()
      const rendered = presence
      for (const id of alive) {
        const seen = rendered.get(id)
        if (!seen || !seen.has(f)) ghosts.push({ frame: f, id })
      }
    }
    expect(ghosts).toEqual([])
  })

  it('rendered chain-arc is monotonic per item across its lifetime', () => {
    // GIVEN: same back-pressure setup. Capture per-frame chain-arc
    // trajectory for every rendered id. Under back-pressure the
    // current renderer's predictive cross-belt advance pushes items
    // forward speculatively, then — when sim disagrees — the various
    // soft-clamp and lead-close branches can pull rendered backward,
    // producing a visible "pop back".
    const harness = buildHarness('stub')
    const offsets = chainOffsetsByKey(harness)
    const trajectories = new Map<string, number[]>()

    runStream(renderer, harness, 200, () => {
      const states = readItemStates(renderer)
      for (const [id, st] of states) {
        const off = offsets.get(st.beltKey)
        if (off === undefined) continue
        const arc = off + st.renderedArc
        let arr = trajectories.get(id)
        if (!arr) {
          arr = []
          trajectories.set(id, arr)
        }
        arr.push(arc)
      }
    })

    // THEN: each trajectory must be non-decreasing within ε.
    const EPS = 1e-6
    const violations: Array<{
      id: string
      frame: number
      prev: number
      curr: number
    }> = []
    for (const [id, arr] of trajectories) {
      for (let i = 1; i < arr.length; i++) {
        if (arr[i] < arr[i - 1] - EPS) {
          violations.push({ id, frame: i, prev: arr[i - 1], curr: arr[i] })
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('rendered chain-arc never overshoots sim truth by more than one tick', () => {
    // GIVEN: long-running back-pressure stream. For each frame compute,
    // per item:
    //   truthChainArc    — from sim's belt + positionOnBelt
    //   renderedChainArc — from renderer's beltKey + renderedArc
    // The renderer must satisfy:
    //   |renderedChainArc - truthChainArc| <= speed * tickInterval
    // i.e. at most one sim tick of lead in either direction. This
    // explicitly forbids the unbounded predictive lead that breaks
    // under back-pressure (item rendered on the wrong cell).
    const harness = buildHarness('stub')
    const offsets = chainOffsetsByKey(harness)
    const TICK_LEAD = SPEED * TICK_INTERVAL // = 0.1 chain-arc units

    const overLeads: Array<{
      id: string
      frame: number
      diff: number
      truth: number
      rendered: number
    }> = []

    let frameCounter = 0
    runStream(renderer, harness, 200, () => {
      const states = readItemStates(renderer)
      for (const [id, st] of states) {
        const off = offsets.get(st.beltKey)
        if (off === undefined) continue
        const rendered = off + st.renderedArc
        const truth = simChainArc(harness, id)
        if (Number.isNaN(truth)) continue
        const diff = rendered - truth
        if (diff > TICK_LEAD || diff < -TICK_LEAD) {
          overLeads.push({
            id,
            frame: frameCounter,
            diff,
            truth,
            rendered,
          })
        }
      }
      frameCounter++
    })

    expect(overLeads).toEqual([])
  })

  it('stream spacing remains uniform across a long warmup', () => {
    // GIVEN: 200 ticks of warmup with one item every 10 ticks at
    // speed 1.0. Expected chain-arc spacing between consecutive items
    // is `INPUT_CADENCE_TICKS * SPEED * TICK_INTERVAL` = 1.0
    // (one full cell apart).
    const harness = buildHarness('sink')
    const offsets = chainOffsetsByKey(harness)
    const EXPECTED_SPACING = INPUT_CADENCE_TICKS * SPEED * TICK_INTERVAL
    const TOL = 0.10 // ±10 % for sub-tick render jitter

    // Capture only the FINAL frame's spacings.
    let finalArcs: number[] = []
    runStream(renderer, harness, 200, () => {
      const states = readItemStates(renderer)
      const arcs: number[] = []
      for (const st of states.values()) {
        const off = offsets.get(st.beltKey)
        if (off === undefined) continue
        arcs.push(off + st.renderedArc)
      }
      finalArcs = arcs
    })

    // THEN: with at least 2 items in flight, all consecutive deltas
    // must lie within EXPECTED_SPACING ± TOL.
    expect(finalArcs.length).toBeGreaterThanOrEqual(2)
    const sorted = [...finalArcs].sort((a, b) => a - b)
    const diffs: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      diffs.push(sorted[i] - sorted[i - 1])
    }
    const offenders = diffs.filter(
      (d) => Math.abs(d - EXPECTED_SPACING) > EXPECTED_SPACING * TOL,
    )
    expect(offenders).toEqual([])
  })

  it('back-pressure: rendered position matches sim truth on every stuck cell', () => {
    // GIVEN: stub output machine with capacity STUB_CAPACITY (3).
    // After it has consumed 3 items, deliveries stall and items pile
    // up at the back of the chain. After 100 ticks the stream is in
    // back-pressure steady state.
    //
    // This is the EXACT scenario the user reports as broken: the
    // renderer's predictive cross-belt advance pulls rendered ahead of
    // sim, then back-pressure pins sim items at `position > 1` on the
    // upstream belt while the renderer keeps drifting forward on the
    // downstream belt — producing wrong-cell rendering.
    const harness = buildHarness('stub')
    const offsets = chainOffsetsByKey(harness)
    const TOL = 0.05 // ±0.05 cell tolerance

    let finalRendered: Map<string, number> = new Map()
    let finalTruth: Map<string, number> = new Map()
    runStream(renderer, harness, 100, () => {
      const states = readItemStates(renderer)
      const r = new Map<string, number>()
      const t = new Map<string, number>()
      for (const [id, st] of states) {
        const off = offsets.get(st.beltKey)
        if (off === undefined) continue
        r.set(id, off + st.renderedArc)
        const truth = simChainArc(harness, id)
        if (!Number.isNaN(truth)) t.set(id, truth)
      }
      finalRendered = r
      finalTruth = t
    })

    // SANITY: back-pressure should produce a non-trivial pile-up
    // (more than just the 3 consumed items in flight).
    expect(finalRendered.size).toBeGreaterThanOrEqual(4)

    // THEN: every still-rendered, still-on-belt item has rendered
    // chain-arc within ±TOL of its sim truth chain-arc.
    const offenders: Array<{
      id: string
      rendered: number
      truth: number
      diff: number
    }> = []
    for (const [id, rendered] of finalRendered) {
      const truth = finalTruth.get(id)
      if (truth === undefined) continue
      const diff = rendered - truth
      if (Math.abs(diff) > TOL) {
        offenders.push({ id, rendered, truth, diff })
      }
    }
    expect(offenders).toEqual([])
  })
})
