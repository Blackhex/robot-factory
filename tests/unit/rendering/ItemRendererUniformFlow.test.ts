/**
 * @vitest-environment jsdom
 *
 * Regression tests pinning the contract:
 *
 *   "Under normal high-throughput flow at capacity-2 packing (back items
 *    spaced at MIN_ITEM_SPACING = 0.5 cells, but no genuine
 *    back-pressure), the renderer's per-frame world-space advance MUST
 *    remain UNIFORM. There must be no half-speed stutter at cell
 *    boundaries, and inter-item spacing along the chain MUST stay
 *    uniform across all (machine speed, belt speed) combinations."
 *
 * Historical user-visible symptom (pre-fix):
 *   With machine speed = 5 and belt speed = 5 (steady-state cap-2
 *   packing), items animated unevenly along belts. They moved at full
 *   speed for some frames, then slowed to ~half speed for ~6 frames
 *   after each cell crossing, then resumed full speed. The user saw a
 *   stutter at every cell boundary, plus alternating gap patterns
 *   along the chain (ux-review measured Δ ≈ 0.32 at speed 5).
 *
 * Root cause (white-box, two-sided):
 *   1. SIM SIDE — `src/game/ConveyorBelt.ts::canFitAt` accumulated
 *      floating-point drift as items advanced, so consecutive
 *      sim-truth gaps alternated between 0.500 and 0.600 instead of
 *      staying at the contractual 0.5. The fix introduced an FP
 *      tolerance in `canFitAt` so handovers respect MIN_ITEM_SPACING
 *      exactly even after long runs.
 *   2. RENDERER SIDE — `src/rendering/ItemArcResolver.ts` previously
 *      halved the per-frame advance (`advanceFactor = 0.5`) using a
 *      naive single-cell `isDownstreamBlocked` predicate that fired
 *      constantly during healthy cap-2 flow. The fix replaces it with
 *      a cascade-blocked predicate (`isBeltSelfBlocked` recursively
 *      walks downstream looking for a genuinely parked chain) plus a
 *      post-carry stretch and a cascade-stalled regime in
 *      `resolveSameBeltAdvance`, so the slowdown fires ONLY when the
 *      downstream cells are truly stuck and the renderer otherwise
 *      tracks sim truth at full speed.
 *
 * Contract pinned by these tests:
 *   The slowdown fires ONLY when the downstream chain is GENUINELY
 *   stuck — at least `CELL_CAPACITY` items downstream with the front
 *   parked at a cell end. When the downstream cell has only one item,
 *   or two items but the front is mid-cell (still flowing), the
 *   slowdown must NOT fire and the renderer must advance uniformly.
 *
 * Test design:
 *   - Test A is a macro / black-box flow check: it runs a real Sim +
 *     real ItemRenderer with a `factory_output` SINK (deliveries always
 *     succeed → no back-pressure) and a tight injection cadence that
 *     produces cap-2 packing. It captures per-frame world-space
 *     chain-arc deltas and asserts uniformity.
 *   - Tests B1 / B2 are micro / white-box predicate checks: they
 *     construct synthetic `BeltRenderData[]` directly and step the
 *     renderer's `update()` once with `timeSinceCarry` mutated into the
 *     post-carry stretch, isolating the `isDownstreamBlocked` decision
 *     boundary.
 *
 * Scope: WHITE-BOX. The companion test
 * `ItemRendererStreamStability "back-pressure: rendered position
 * matches sim truth on every stuck cell"` continues to pass under the
 * shipped fix — its scenario (stub recycler at capacity 3 fully
 * drained → every belt cell at capacity 2 with parked fronts at pos
 * 1.0) still satisfies the cascade-blocked predicate.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  ItemRenderer,
  type BeltRenderData,
} from '../../../src/rendering/ItemRenderer'
import { resetItemIdCounter } from '../../../src/game/Item'
import {
  SIM_TICK_INTERVAL,
} from '../../../src/rendering/ItemArcResolver'
import {
  GRID_W, GRID_H,
  SPEED, RENDER_DT, FRAMES_PER_TICK,
  ITEM_TYPE,
  readItemStates, chainOffsetsByKey,
  buildSinkChainHarness, runChainStream,
  simChainArc,
  type ItemStateView,
} from './itemRendererTestHelpers'
import type { ItemType } from '../../../src/game/types'

const CHAIN_ID = 'chain1'
const CHAIN_CELLS = 5
/**
 * Tight injection cadence that creates cap-2 packing in steady state at
 * `SPEED = 1.0`. With one item every 5 sim ticks each cell carries two
 * items spaced 0.5 cells apart (= `ConveyorBelt.MIN_ITEM_SPACING`).
 * Compare with the existing `INPUT_CADENCE_TICKS = 10` helper, which
 * produces 1.0-cell spacing (one-item-per-cell flow).
 */
const TIGHT_CADENCE_TICKS = 5

/* ------------------------------------------------------------------ */
/*  Micro harness: synthetic BeltRenderData fed straight to update()   */
/* ------------------------------------------------------------------ */

function makeBelt(
  fromX: number, fromZ: number,
  toX: number, toZ: number,
  items: ReadonlyArray<{ id: string; type: ItemType; position: number }>,
): BeltRenderData {
  return {
    from: { x: fromX, z: fromZ },
    to: { x: toX, z: toZ },
    speed: SPEED,
    items,
  }
}

/* ================================================================== */
/*  Test suite                                                         */
/* ================================================================== */

describe('ItemRenderer — uniform flow at cap-2 packing (no back-pressure)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    resetItemIdCounter()
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  /* ---------- A. Macro flow check ---------- */

  it(
    'per-frame chain-arc advance is uniform in normal cap-2 flow with no back-pressure',
    () => {
      // GIVEN: 200 ticks of cap-2 stream (one item every 5 ticks at
      // SPEED 1.0 along a 5-cell chain) terminating in a `factory_output`
      // sink. Sink always accepts → deliveries never stall → no
      // back-pressure ever. Steady-state per-cell occupancy is 2 items
      // spaced 0.5 cells apart, with the front item still flowing
      // (positions slide from ~0.5 → 1.0 over 5 ticks before handover).
      // Under the desired contract, every chain belt's downstream is
      // either empty, has 1 item, or has 2 items with the front
      // mid-cell — NEVER cap-2 with the front parked. The slowdown
      // gate must NOT fire on any frame.
      const harness = buildSinkChainHarness(CHAIN_ID, CHAIN_CELLS)
      const offsets = chainOffsetsByKey(harness)

      // Per-id chain-arc trajectory across the run.
      const trajectories = new Map<string, number[]>()
      // Per-id entry frame so we can scope the steady-state window.
      const entryFrame = new Map<string, number>()

      const TOTAL_TICKS = 200
      const TOTAL_FRAMES = TOTAL_TICKS * FRAMES_PER_TICK
      const WARMUP_FRAMES = 30 * FRAMES_PER_TICK // skip 30 ticks of warmup

      runChainStream(renderer, harness, TOTAL_TICKS, TIGHT_CADENCE_TICKS, (f) => {
        const states = readItemStates(renderer)
        for (const [id, st] of states) {
          const off = offsets.get(st.beltKey)
          if (off === undefined) continue
          const arc = off + st.renderedArc
          if (!entryFrame.has(id)) entryFrame.set(id, f)
          let arr = trajectories.get(id)
          if (!arr) {
            arr = []
            trajectories.set(id, arr)
          }
          arr.push(arc)
        }
      })

      // Mean cell arc length (= path length per belt segment).
      let meanCellL = 0
      for (const L of harness.cellLengths) meanCellL += L
      meanCellL /= harness.cellLengths.length

      const EXPECTED_DELTA = SPEED * RENDER_DT * meanCellL

      // SANITY: cap-2 packing must actually be reached. With cadence 5
      // ticks and 5 belts, after warmup at least 5 items must coexist
      // in flight at the final frame (one per belt cell at minimum).
      let finalLiveIds = 0
      for (const arr of trajectories.values()) {
        if (arr.length > 0 && arr[arr.length - 1] !== undefined) finalLiveIds++
      }
      expect(finalLiveIds).toBeGreaterThanOrEqual(5)

      // Build per-id, per-frame Δ-world-arc samples in the steady-state
      // window (after WARMUP_FRAMES). For each id we walk consecutive
      // frames; trajectories are pre-aligned (one entry per rendered
      // frame), so we can subtract index i from i-1.
      interface DeltaSample {
        id: string
        frameIdx: number // global frame index in [WARMUP_FRAMES, TOTAL_FRAMES)
        delta: number
      }
      const samples: DeltaSample[] = []
      for (const [id, arr] of trajectories) {
        const entry = entryFrame.get(id)!
        for (let i = 1; i < arr.length; i++) {
          const globalFrame = entry + i
          if (globalFrame < WARMUP_FRAMES) continue
          if (globalFrame >= TOTAL_FRAMES) break
          samples.push({
            id,
            frameIdx: globalFrame,
            delta: arr[i] - arr[i - 1],
          })
        }
      }
      // SANITY: we must have collected enough steady-state samples to
      // make the assertion meaningful (a few thousand frames × items).
      expect(samples.length).toBeGreaterThanOrEqual(500)

      // ASSERTION (A1): no frame stutters below half mean Δworld within
      // the steady-state phase. The slowdown bug halves Δworld for the
      // ~6 post-carry frames of every cell traversal; the resulting
      // sub-half-mean frames (combined with subsequent lower-clamp /
      // monotonic-guard interactions on the next sim tick) violate this
      // invariant.
      const stutterFloor = 0.5 * EXPECTED_DELTA - 1e-9
      const stutters = samples.filter((s) => s.delta < stutterFloor)
      expect(stutters).toEqual([])

      // ASSERTION (A2): mean Δworld across the steady-state window is
      // within 5 % of the expected per-frame advance. Halving 6 frames
      // out of every ~30-frame cell-traversal cycle pulls the mean
      // down by ~10 %, well outside this tolerance — this is the
      // direct cumulative measurement of the user-reported stutter.
      let sum = 0
      for (const s of samples) sum += s.delta
      const meanDelta = sum / samples.length
      const meanRatio = meanDelta / EXPECTED_DELTA
      expect(meanRatio).toBeGreaterThanOrEqual(0.95)
      expect(meanRatio).toBeLessThanOrEqual(1.05)
    },
  )

  /* ---------- B. Predicate boundary checks ---------- */
  //
  // White-box: feed the renderer synthetic `BeltRenderData[]` and step
  // `update()` exactly once with `timeSinceCarry` placed inside the
  // post-carry stretch (< SIM_TICK_INTERVAL), so the only remaining
  // variable is `isDownstreamBlocked`. The Δ-renderedArc on the
  // upstream item exposes the predicate decision:
  //   advanceFactor = 0.5 → Δ ≈ 0.5 * EXPECTED
  //   advanceFactor = 1.0 → Δ ≈ 1.0 * EXPECTED
  // No real Simulation, no real ConveyorBelt — these tests pin the
  // predicate itself, not the surrounding plumbing.

  /**
   * Common scaffold for B1/B2: seed an item on the upstream belt, mutate
   * its `timeSinceCarry` into the post-carry stretch, then step
   * `update()` once with the supplied downstream items. Returns the
   * actual Δ-renderedArc-per-frame ratio (relative to full-speed
   * `speed * dt * L`) and the absolute Δ for diagnostics.
   */
  function measurePostCarryAdvance(
    downstreamItems: ReadonlyArray<{ id: string; type: ItemType; position: number }>,
  ): { ratio: number; deltaArc: number; expectedDelta: number } {
    const TEST_ID = 'upstreamItem'
    const upstreamItems = [
      { id: TEST_ID, type: ITEM_TYPE, position: 0.5 },
    ]
    // Two synthetic belts laid along (0,0) → (1,0) → (2,0). Both have
    // SPEED = 1, both straight (cellLengths = 1.0 each).
    const belts: BeltRenderData[] = [
      makeBelt(0, 0, 1, 0, upstreamItems),
      makeBelt(1, 0, 2, 0, downstreamItems),
    ]
    // Seed (dt = 0) so the renderer initialises every visible item to
    // truth. We don't call `cacheBeltTopology`: `update()` consumes the
    // `belts` array directly; topology is only needed by `buildRenderData`.
    renderer.update(belts, GRID_W, GRID_H, 0)
    const states = readItemStates(renderer) as Map<
      string,
      ItemStateView & { timeSinceCarry: number }
    >
    const seeded = states.get(TEST_ID)
    if (!seeded) throw new Error('seed failed: upstream item not in itemStates')
    const beforeArc = seeded.renderedArc
    const L = seeded.pathLength
    // Mutate timeSinceCarry into the post-carry stretch so the
    // `isPostCarryStretch` half of `resolveSameBeltAdvance`'s gate is
    // TRUE — the only remaining variable in the gate is
    // `isDownstreamBlocked`.
    states.set(TEST_ID, {
      renderedArc: seeded.renderedArc,
      beltKey: seeded.beltKey,
      pathLength: seeded.pathLength,
      timeSinceCarry: 0.05, // 0 < 0.05 < SIM_TICK_INTERVAL (= 0.1)
    })
    expect(0.05).toBeLessThan(SIM_TICK_INTERVAL) // pin the constant invariant
    // Step one render frame at the standard 60 Hz dt.
    renderer.update(belts, GRID_W, GRID_H, RENDER_DT)
    const after = states.get(TEST_ID)!
    const deltaArc = after.renderedArc - beforeArc
    const expectedDelta = SPEED * RENDER_DT * L
    return { ratio: deltaArc / expectedDelta, deltaArc, expectedDelta }
  }

  it(
    'B1: does NOT slow rendering when the downstream cell has only 1 item still flowing',
    () => {
      // Downstream has 1 item mid-cell (position 0.2). Cell occupancy
      // is 1 < CELL_CAPACITY (2), so a fresh handover would succeed
      // next tick — there is no back-pressure. The slowdown gate must
      // NOT fire; the renderer must advance by the full per-frame step.
      //
      // Today's predicate: backPos = 0.2 < 0.5 - 1e-9 → blocked → factor
      // = 0.5 → renderer halves Δ. This assertion would fail under the
      // pre-fix predicate (backPos < 0.5 - 1e-9).
      const { ratio } = measurePostCarryAdvance([
        { id: 'd1', type: ITEM_TYPE, position: 0.2 },
      ])
      // Full speed expected: ratio ≈ 1.0. Use a 5 % tolerance to absorb
      // FP noise (no clamp ever fires here — truthArc moves with the
      // full-speed advance only when sim ticks, and we only step one
      // render frame).
      expect(ratio).toBeGreaterThanOrEqual(0.95)
      expect(ratio).toBeLessThanOrEqual(1.05)
    },
  )

  it(
    'B2: DOES slow rendering when the downstream cell is at capacity AND front item is parked',
    () => {
      // Downstream has 2 items (= CELL_CAPACITY) with the front item
      // parked at the cell end. The simulator genuinely cannot hand
      // over a fresh item next tick — this is true back-pressure. The
      // slowdown gate MUST fire so the renderer doesn't extrapolate
      // forward while sim sits still.
      //
      // Today's predicate: backPos = 0.5 NOT < 0.5 - 1e-9 → NOT blocked
      // → factor = 1.0 → renderer advances at full speed. This
      // assertion would fail under the pre-fix predicate
      // (backPos < 0.5 - 1e-9).
      const { ratio } = measurePostCarryAdvance([
        { id: 'd1', type: ITEM_TYPE, position: 0.5 },
        { id: 'd2', type: ITEM_TYPE, position: 1.0 - 1e-10 },
      ])
      // Half speed expected: ratio ≈ 0.5. Use a 10 % tolerance around
      // 0.5 (i.e. ±0.05) to absorb FP noise.
      expect(ratio).toBeGreaterThanOrEqual(0.45)
      expect(ratio).toBeLessThanOrEqual(0.55)
    },
  )
})

/* ================================================================== */
/*  Cap-2 saturated stream — uniform inter-item spacing                */
/* ================================================================== */
//
// These tests pin the contract that, in steady-state cap-2 saturation
// at any (machine speed, belt speed) combination, the renderer must
// preserve the simulator's UNIFORM inter-item spacing of exactly
// `MIN_ITEM_SPACING = 0.5` cells. The renderer must not introduce
// alternating gap patterns.
//
// Pre-fix user-visible symptom (measured by ux-review at speed=5,
// belt-speed=5 on a 15-cell chain in the real app):
//   - Sim truth at every tick: every inter-item gap = exactly 0.5.
//   - Renderer at speed 5+5 cap-2 saturated: gaps alternated
//     0.33 / 0.65 (Δ ≈ 0.32) along the chain.
//   - The "bad zone" of alternation moved downstream WITH the items at
//     belt speed (tracking specific items, not chain positions).
//   - Persistent kink in the last ~3 cells before the sink:
//     `0.62 / 0.50 / 0.353 / 0.647 / 0.498`.
//   - At lower speeds (1+1, 1+5, 5+1) the alternation was much smaller
//     (Δ ≤ 0.17) and visually negligible.
//
// The fix shipped on two sides (see file header docblock above):
//   - SIM: FP tolerance in `src/game/ConveyorBelt.ts::canFitAt` so
//     handovers respect MIN_ITEM_SPACING exactly under long runs.
//   - RENDERER: cascade-blocked predicate (`isBeltSelfBlocked`) plus
//     post-carry stretch / cascade-stalled regime in
//     `src/rendering/ItemArcResolver.ts::resolveSameBeltAdvance`.
//
// Cases A, B, E exercise the speed-5 macro flow. Note: this synthetic
// harness uses unit-length cells, so it never reproduced the full
// speed-5 amplification the user reported in the real app — A/B/E
// passed even pre-fix in this harness. They remain here as regression
// locks against any renderer-introduced alternating-gap pattern at
// high speed. C is the baseline that DID fail pre-fix (sim-side FP
// drift was reproducible in this harness at speed 1). D locks the
// well-behaved cap-1 regime.

describe('ItemRenderer — cap-2 saturated stream — uniform inter-item spacing', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    resetItemIdCounter()
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  /**
   * Snapshot every visible item's world chain-arc and the consecutive
   * inter-item gaps along the chain (in chain-arc / world units; for
   * straight unit-length cells this matches "cells").
   */
  function captureGaps(
    rndr: ItemRenderer,
    harness: ReturnType<typeof buildSinkChainHarness>,
  ): { worldArcs: number[]; gaps: number[] } {
    const offsets = chainOffsetsByKey(harness)
    const states = readItemStates(rndr)
    const arcs: number[] = []
    for (const [, st] of states) {
      const off = offsets.get(st.beltKey)
      if (off === undefined) continue
      arcs.push(off + st.renderedArc)
    }
    arcs.sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 1; i < arcs.length; i++) gaps.push(arcs[i] - arcs[i - 1])
    return { worldArcs: arcs, gaps }
  }

  /**
   * Min/max/spread of an array, with a stable formatter for assertion
   * messages — we want the actual measured Δ in the failure output so
   * a regression in either direction is easy to diagnose.
   */
  function gapStats(gaps: number[]): {
    min: number
    max: number
    spread: number
    summary: string
  } {
    let min = Infinity
    let max = -Infinity
    for (const g of gaps) {
      if (g < min) min = g
      if (g > max) max = g
    }
    const spread = max - min
    const summary =
      `n=${gaps.length} min=${min.toFixed(4)} max=${max.toFixed(4)} ` +
      `spread=${spread.toFixed(4)} gaps=[${gaps
        .map((g) => g.toFixed(3))
        .join(', ')}]`
    return { min, max, spread, summary }
  }

  /* ---------- A. speed 5 + cadence 1, single steady-state sample ---------- */

  it(
    'A: gap variance is small at belt speed 5 + cadence 1 (cap-2 saturated)',
    () => {
      // NOTE: this synthetic harness uses unit-length cells and did
      // NOT reproduce the speed-5 amplification the user reported in
      // the real app (Δ ≈ 0.32) — this case passed even pre-fix here.
      // It is retained as a regression lock so any future
      // renderer-introduced alternating-gap pattern at speed 5 in the
      // synthetic harness fails loudly. The same bug at smaller
      // magnitude DID reproduce here at speed 1 (see case C).
      //
      // GIVEN: 10-cell straight chain at belt speed = 5 (matches the
      // ux-review scenario at half the chain length so the run is
      // still cheap). Cadence = 1 tick → at 0.5 cells/tick belt
      // advance, items emerge spaced exactly MIN_ITEM_SPACING = 0.5
      // cells apart → cap-2 saturated (2 items per cell).
      //
      // Sim truth places every consecutive item at exactly 0.5 chain-
      // arc apart in steady state. The renderer MUST preserve this
      // uniform spacing.
      const CHAIN_LEN = 10
      const harness = buildSinkChainHarness('A_chain', CHAIN_LEN, 5)

      let lastFrameSeen = -1
      runChainStream(renderer, harness, /* totalTicks */ 200, /* cadenceTicks */ 1, (f) => {
        lastFrameSeen = f
      })
      // Sanity: we ran the loop and have steady-state items in flight.
      expect(lastFrameSeen).toBeGreaterThan(0)
      const { gaps } = captureGaps(renderer, harness)
      // Cap-2 saturated, 10 cells: ~20 items in flight → ~19 gaps.
      // Require at least 10 to make the assertion meaningful.
      expect(gaps.length).toBeGreaterThanOrEqual(10)

      const stats = gapStats(gaps)
      expect(
        stats.spread,
        `inter-item gap spread too large at belt speed 5 cap-2 saturated: ${stats.summary}`,
      ).toBeLessThan(0.1)
    },
  )

  /* ---------- B. speed 5 + cadence 1, multi-sample (traveling wave) ---------- */

  it(
    'B: gap variance is small at belt speed 5 + cadence 1 across 5 mid-flow samples',
    () => {
      // Same setup as A, but capture 5 samples spaced 12 render frames
      // apart (≈ 200 ms at 60 fps) deep into steady state. The ux-
      // review found the (pre-fix) alternation pattern travelled
      // downstream WITH the items at belt speed, so a single snapshot
      // might catch a momentarily-uniform frame; sampling across
      // multiple frames catches both the static and traveling-wave
      // variants of the bug. Like case A, this case passed even
      // pre-fix in the synthetic harness (unit-length cells did not
      // amplify the bug at speed 5); it is retained as a regression
      // lock against any future renderer-introduced alternation at
      // high speed.
      const CHAIN_LEN = 10
      const harness = buildSinkChainHarness('B_chain', CHAIN_LEN, 5)

      const TOTAL_TICKS = 200
      const TOTAL_FRAMES = TOTAL_TICKS * FRAMES_PER_TICK
      // 5 samples spaced 12 frames apart, ending at the final frame.
      const SAMPLE_STRIDE = 12
      const SAMPLE_COUNT = 5
      const lastSampleFrame = TOTAL_FRAMES - 1
      const sampleFrames = new Set<number>()
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        sampleFrames.add(lastSampleFrame - i * SAMPLE_STRIDE)
      }

      const samples: { frame: number; spread: number; summary: string }[] = []
      runChainStream(renderer, harness, TOTAL_TICKS, /* cadenceTicks */ 1, (f) => {
        if (!sampleFrames.has(f)) return
        const { gaps } = captureGaps(renderer, harness)
        if (gaps.length < 10) return
        const stats = gapStats(gaps)
        samples.push({ frame: f, spread: stats.spread, summary: stats.summary })
      })

      expect(samples.length).toBe(SAMPLE_COUNT)
      const violations = samples.filter((s) => s.spread >= 0.1)
      expect(
        violations,
        `${violations.length}/${samples.length} mid-flow samples had ` +
          `inter-item gap spread ≥ 0.1 at belt speed 5 cap-2 saturated:\n` +
          violations.map((v) => `  frame=${v.frame} ${v.summary}`).join('\n'),
      ).toEqual([])
    },
  )

  /* ---------- C. speed 1 baseline (regression lock) ---------- */

  it(
    'C: gap variance stays under 0.05 at speed 1 + cadence 1 (cap-2 saturated)',
    () => {
      // Belt speed = 1 (default), cadence = 1. Source-side back-pressure
      // throttles injection so items emerge spaced MIN_ITEM_SPACING =
      // 0.5 cells apart → cap-2 saturated, same packing as case A but
      // at 1/5 the belt speed.
      //
      // Sim truth at cap-2 saturation is uniform 0.5 spacing; this
      // asserts the renderer does not introduce alternating gap
      // patterns. Pre-fix this assertion failed at spread ≈ 0.100
      // (alternating 0.500/0.600 sim-truth gaps from FP drift in
      // ConveyorBelt.canFitAt). The fix landed in
      // src/game/ConveyorBelt.ts.
      const CHAIN_LEN = 10
      const harness = buildSinkChainHarness('C_chain', CHAIN_LEN, 1)

      runChainStream(renderer, harness, /* totalTicks */ 200, /* cadenceTicks */ 1, () => {})

      const { gaps } = captureGaps(renderer, harness)
      expect(gaps.length).toBeGreaterThanOrEqual(10)
      const stats = gapStats(gaps)
      expect(
        stats.spread,
        `renderer introduced alternating gap pattern at belt speed 1: ${stats.summary}`,
      ).toBeLessThan(0.05)
    },
  )

  /* ---------- D. speed 5 + cadence 2 (cap-1 effective) ---------- */

  it(
    'D: gap variance is tiny at belt speed 5 + cadence 2 (cap-1 effective, no carry-over interaction)',
    () => {
      // Belt speed = 5, cadence = 2 ticks. Items emerge 1.0 cells apart
      // → only 1 item per cell in steady state, no cap-2 packing and
      // no MIN_ITEM_SPACING-distance neighbour interactions on the
      // same belt cell. Isolates whether the bug is specific to cap-2
      // saturation: at cap-1 the renderer should produce uniform
      // 1.0-cell spacing with negligible variance.
      const CHAIN_LEN = 10
      const harness = buildSinkChainHarness('D_chain', CHAIN_LEN, 5)

      runChainStream(renderer, harness, /* totalTicks */ 200, /* cadenceTicks */ 2, () => {})

      const { gaps } = captureGaps(renderer, harness)
      // ~10 items in flight at cap-1 over 10 cells → ~9 gaps.
      expect(gaps.length).toBeGreaterThanOrEqual(5)
      const stats = gapStats(gaps)
      expect(
        stats.spread,
        `cap-1 stream should have near-zero gap variance: ${stats.summary}`,
      ).toBeLessThan(0.05)
    },
  )

  /* ---------- E. shipper-adjacent kink ---------- */

  it(
    'E: spacing is uniform on the last 5 items before the sink at belt speed 5 cap-2 saturated',
    () => {
      // Same setup as A (10-cell chain at belt speed 5, cadence 1
      // cap-2 saturated). The ux-review found a persistent (pre-fix)
      // kink in the last ~3 cells before the sink with measured gaps
      // `0.62 / 0.50 / 0.353 / 0.647 / 0.498` — Δ ≈ 0.29 in the real
      // app.
      //
      // This test isolates that kink: examine ONLY the 5 items
      // furthest along the chain (just before the sink) and require
      // their inter-item gaps to be uniform within Δ < 0.1. Like cases
      // A and B, this case passed even pre-fix in the synthetic
      // harness (unit-length cells did not amplify the kink); it is
      // retained as a regression lock on the shipper-adjacent region.
      const CHAIN_LEN = 10
      const harness = buildSinkChainHarness('E_chain', CHAIN_LEN, 5)

      runChainStream(renderer, harness, /* totalTicks */ 200, /* cadenceTicks */ 1, () => {})

      const { worldArcs } = captureGaps(renderer, harness)
      expect(worldArcs.length).toBeGreaterThanOrEqual(5)
      // Last 5 items (highest chain-arc — closest to the sink).
      const tail = worldArcs.slice(-5)
      const tailGaps: number[] = []
      for (let i = 1; i < tail.length; i++) tailGaps.push(tail[i] - tail[i - 1])
      const stats = gapStats(tailGaps)
      expect(
        stats.spread,
        `shipper-adjacent kink: tail-of-chain gap spread too large at belt speed 5: ${stats.summary}`,
      ).toBeLessThan(0.1)
    },
  )
})

/* ================================================================== */
/*  Pause preserves uniform spacing — hold-then-snap contract          */
/* ================================================================== */
//
// Contract pinned by these tests:
//
//   "When `paused = true`:
//      • The FIRST paused frame after a running frame must HOLD the
//        previous `renderedArc` (no visible jump on pause-entry).
//      • EVERY SUBSEQUENT paused frame must SNAP to sim truth (uniform
//        spacing while the player inspects the paused factory; truth
//        does not change while paused, so all subsequent frames stay
//        identical)."
//
// This satisfies two complementary invariants:
//
//   1. (E2E `SandboxSimulation.spec.ts > Pause should freeze
//      rendered belt items in place; Resume advances them again`)
//      The first paused frame == the last running frame within
//      `1e-3`, so the player sees the layout freeze on pause-entry.
//
//   2. (User-reported uniform-spacing-while-paused) The 2nd-and-later
//      paused frames == sim truth within `< 1e-6`, so the layout
//      settles to uniform spacing one render frame (~16 ms) after the
//      pause click and stays stable thereafter.
//
// Effect: the player clicks pause, sees the layout freeze identically
// to the last running frame, then ~16 ms later the layout settles to
// the uniform sim-truth positions.
//
// Tolerance note:
//   The desired paused branch should set `renderedArc = truthArc`
//   exactly (no float arithmetic) on frame 1+. `< 1e-6` is a
//   generous tolerance that comfortably accommodates Float64
//   accumulation in `chainOffsets`. The pre-fix bug produces leads up
//   to `tickAdvance` (= speed * SIM_TICK_INTERVAL * L = 0.1 at
//   SPEED=1, L=1), so `1e-6` catches it loudly.

describe('ItemRenderer — pause preserves uniform spacing', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    resetItemIdCounter()
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  const PAUSE_CHAIN_ID = 'pauseChain'
  const PAUSE_CHAIN_CELLS = 10
  const PAUSE_RUN_TICKS = 100
  const PAUSE_TOL = 1e-6

  /**
   * Render one paused frame against the supplied harness. Returns the
   * fresh `BeltRenderData[]` so callers can both step the renderer and
   * inspect topology.
   */
  function renderPausedFrame(
    rndr: ItemRenderer,
    harness: ReturnType<typeof buildSinkChainHarness>,
  ): void {
    rndr.update(
      rndr.buildRenderData(harness.sim.getBelts()),
      GRID_W,
      GRID_H,
      RENDER_DT,
      /* paused */ true,
    )
  }

  /**
   * For every renderer-tracked item, compute
   * `renderedChainArc - simChainArc(harness, id)`. Returns one entry
   * per tracked id, sorted by simChainArc ascending so the chain order
   * matches the visual layout.
   */
  function collectTruthDiffs(
    rndr: ItemRenderer,
    harness: ReturnType<typeof buildSinkChainHarness>,
  ): { id: string; renderedArc: number; simArc: number; diff: number }[] {
    const offsets = chainOffsetsByKey(harness)
    const states = readItemStates(rndr)
    const out: { id: string; renderedArc: number; simArc: number; diff: number }[] = []
    for (const [id, st] of states) {
      const off = offsets.get(st.beltKey)
      if (off === undefined) continue
      const renderedArc = off + st.renderedArc
      const simArc = simChainArc(harness, id)
      // Skip items that have left the chain (delivered) — they no
      // longer have a sim-truth position to compare against.
      if (Number.isNaN(simArc)) continue
      out.push({ id, renderedArc, simArc, diff: renderedArc - simArc })
    }
    out.sort((a, b) => a.simArc - b.simArc)
    return out
  }

  /** Format a diff list compactly for assertion failure messages. */
  function fmtDiffs(
    diffs: ReadonlyArray<{ id: string; diff: number }>,
  ): string {
    return diffs.map((d) => `${d.id}:${d.diff.toExponential(2)}`).join(' ')
  }

  /* ---------- A. second paused frame snaps to truth ---------- */

  it(
    'A: renders at sim truth on the SECOND paused frame after running flow',
    () => {
      // GIVEN: cap-2 saturated stream into a sink (cadence 1 at SPEED=1
      // gives MIN_ITEM_SPACING packing). The final render in
      // `runChainStream` is at `paused=false`, leaving each tracked
      // item with whatever extrapolated lead its render-frame phase
      // happens to dictate (0 → +tickAdvance).
      //
      // Under the hold-then-snap contract, the FIRST paused frame
      // holds those leads (no jump on pause-entry — see case F). The
      // SECOND paused frame must snap every item to sim truth.
      const harness = buildSinkChainHarness(PAUSE_CHAIN_ID, PAUSE_CHAIN_CELLS)
      runChainStream(renderer, harness, PAUSE_RUN_TICKS, 1, () => {})

      // First paused frame — holds prev (do NOT assert truth here).
      renderPausedFrame(renderer, harness)
      // Second paused frame — should snap to truth.
      renderPausedFrame(renderer, harness)

      const diffs = collectTruthDiffs(renderer, harness)
      // Sanity: cap-2 saturation must put plenty of items in flight.
      expect(diffs.length).toBeGreaterThanOrEqual(10)

      const maxAbs = diffs.reduce((m, d) => Math.max(m, Math.abs(d.diff)), 0)
      expect(
        maxAbs,
        `paused renderer did not snap to truth on frame 1: ` +
          `max |diff| = ${maxAbs.toExponential(3)} ` +
          `(expected < ${PAUSE_TOL}). Per-item diffs: ${fmtDiffs(diffs)}`,
      ).toBeLessThan(PAUSE_TOL)
    },
  )

  /* ---------- B. subsequent paused frames hold truth ---------- */

  it(
    'B: renders at sim truth on subsequent paused frames (steady hold)',
    () => {
      // Same setup as A. Verifies paused state from frame 1 onward is
      // STABLE: the truth values don't change while paused, so frame
      // 1+k must match truth exactly. Catches a hypothetical bug
      // where the second paused frame snaps but later frames re-
      // extrapolate.
      //
      // Frame 0 (the first paused frame) is the hold-prev frame and
      // is intentionally skipped — its contract is pinned by case F.
      const harness = buildSinkChainHarness(PAUSE_CHAIN_ID, PAUSE_CHAIN_CELLS)
      runChainStream(renderer, harness, PAUSE_RUN_TICKS, 1, () => {})

      const PAUSED_FRAMES = 6
      for (let i = 0; i < PAUSED_FRAMES; i++) {
        renderPausedFrame(renderer, harness)
        // Frame 0 holds prev (no jump on pause-entry); skip it here.
        if (i === 0) continue
        const diffs = collectTruthDiffs(renderer, harness)
        expect(diffs.length).toBeGreaterThanOrEqual(10)
        const maxAbs = diffs.reduce((m, d) => Math.max(m, Math.abs(d.diff)), 0)
        expect(
          maxAbs,
          `paused frame ${i}: max |diff| = ${maxAbs.toExponential(3)} ` +
            `(expected < ${PAUSE_TOL}). Per-item diffs: ${fmtDiffs(diffs)}`,
        ).toBeLessThan(PAUSE_TOL)
      }
    },
  )

  /* ---------- C. gap variance is zero while paused ---------- */

  it(
    'C: gap variance is zero on the second paused frame',
    () => {
      // GIVEN: cap-2 saturation. Sim truth places consecutive items
      // exactly MIN_ITEM_SPACING (= 0.5 cells × unit-length cell L =
      // 0.5 world arc) apart. If the renderer matches truth exactly
      // on the second paused frame, the gap spread must be effectively
      // zero (limited only by Float64 chain-arc accumulation, which
      // `1e-6` covers with massive margin).
      //
      // Frame 0 (the first paused frame) holds prev — see case F —
      // so its gaps still carry per-item extrapolation leads. The
      // assertion targets frame 1 (the snap frame).
      const harness = buildSinkChainHarness(PAUSE_CHAIN_ID, PAUSE_CHAIN_CELLS)
      runChainStream(renderer, harness, PAUSE_RUN_TICKS, 1, () => {})

      // Frame 0: hold prev. Frame 1: snap to truth.
      renderPausedFrame(renderer, harness)
      renderPausedFrame(renderer, harness)

      const offsets = chainOffsetsByKey(harness)
      const states = readItemStates(renderer)
      const arcs: number[] = []
      for (const [, st] of states) {
        const off = offsets.get(st.beltKey)
        if (off === undefined) continue
        arcs.push(off + st.renderedArc)
      }
      arcs.sort((a, b) => a - b)
      const gaps: number[] = []
      for (let i = 1; i < arcs.length; i++) gaps.push(arcs[i] - arcs[i - 1])
      expect(gaps.length).toBeGreaterThanOrEqual(10)

      let min = Infinity
      let max = -Infinity
      for (const g of gaps) {
        if (g < min) min = g
        if (g > max) max = g
      }
      const spread = max - min
      expect(
        spread,
        `paused frame 1 gap spread = ${spread.toExponential(3)} ` +
          `(expected < ${PAUSE_TOL}). gaps=[${gaps
            .map((g) => g.toFixed(6))
            .join(', ')}]`,
      ).toBeLessThan(PAUSE_TOL)
    },
  )

  /* ---------- D. zero variance across many paused frames ---------- */

  it(
    'D: paused gap variance stays at zero across paused frames 2..10',
    () => {
      // Catches a bug where the second paused frame snaps but
      // subsequent frames drift (e.g. paused branch accidentally
      // calls back into same-belt advance).
      //
      // Frame 0 (the first paused frame) is the hold-prev frame and
      // is intentionally skipped — its contract is pinned by case F.
      const harness = buildSinkChainHarness(PAUSE_CHAIN_ID, PAUSE_CHAIN_CELLS)
      runChainStream(renderer, harness, PAUSE_RUN_TICKS, 1, () => {})

      const PAUSED_FRAMES = 10
      for (let i = 0; i < PAUSED_FRAMES; i++) {
        renderPausedFrame(renderer, harness)
        // Frame 0 holds prev (no jump on pause-entry); skip it here.
        if (i === 0) continue
        const offsets = chainOffsetsByKey(harness)
        const states = readItemStates(renderer)
        const arcs: number[] = []
        for (const [, st] of states) {
          const off = offsets.get(st.beltKey)
          if (off === undefined) continue
          arcs.push(off + st.renderedArc)
        }
        arcs.sort((a, b) => a - b)
        const gaps: number[] = []
        for (let j = 1; j < arcs.length; j++) gaps.push(arcs[j] - arcs[j - 1])
        expect(gaps.length).toBeGreaterThanOrEqual(10)
        let min = Infinity
        let max = -Infinity
        for (const g of gaps) {
          if (g < min) min = g
          if (g > max) max = g
        }
        const spread = max - min
        expect(
          spread,
          `paused frame ${i}: gap spread = ${spread.toExponential(3)} ` +
            `(expected < ${PAUSE_TOL}). gaps=[${gaps
              .map((g) => g.toFixed(6))
              .join(', ')}]`,
        ).toBeLessThan(PAUSE_TOL)
      }
    },
  )

  /* ---------- E. shipper-adjacent items match truth on pause ---------- */

  it(
    'E: paused state preserves chain-end items at correct truth positions on the second paused frame',
    () => {
      // Catches the "persistent kink near the shipper" pattern from
      // previous reports. Examines ONLY the last 3 items in chain
      // order (closest to the sink) and asserts each matches sim
      // truth within `< 1e-6` on the SECOND paused frame. These are
      // the items most exposed to accumulated extrapolation lead
      // because they have travelled the furthest and crossed the
      // most cell boundaries.
      //
      // Frame 0 (the first paused frame) holds prev — see case F —
      // so its tail items still carry per-item extrapolation leads.
      // The assertion targets frame 1 (the snap frame).
      const harness = buildSinkChainHarness(PAUSE_CHAIN_ID, PAUSE_CHAIN_CELLS)
      runChainStream(renderer, harness, PAUSE_RUN_TICKS, 1, () => {})

      // Frame 0: hold prev. Frame 1: snap to truth.
      renderPausedFrame(renderer, harness)
      renderPausedFrame(renderer, harness)

      const diffs = collectTruthDiffs(renderer, harness)
      expect(diffs.length).toBeGreaterThanOrEqual(3)
      const tail = diffs.slice(-3)
      for (const d of tail) {
        expect(
          Math.abs(d.diff),
          `chain-end item ${d.id}: |diff| = ${Math.abs(d.diff).toExponential(3)} ` +
            `(rendered=${d.renderedArc.toFixed(6)} sim=${d.simArc.toFixed(6)}; ` +
            `expected < ${PAUSE_TOL})`,
        ).toBeLessThan(PAUSE_TOL)
      }
    },
  )

  /* ---------- F. first paused frame holds prev rendered position ---------- */

  it(
    'F: first paused frame holds prev rendered position (preserves E2E no-jump invariant)',
    () => {
      // GIVEN: cap-2 saturated stream into a sink. The final render
      // in `runChainStream` is at `paused=false`, leaving each
      // tracked item with an extrapolated lead 0 → +tickAdvance.
      //
      // Under the hold-then-snap contract, the FIRST paused frame
      // after a running frame must HOLD the previous `renderedArc`
      // (no visible jump on pause-entry). This locks the
      // E2E-invariant side of the contract:
      //   `tests/e2e/SandboxSimulation.spec.ts > Pause should freeze
      //    rendered belt items in place; Resume advances them again`
      // which asserts `maxPerItemJump < 1e-3` between the last
      // running frame and the first paused frame.
      //
      // Tolerance: `< 1e-6` here is much tighter than the 1e-3
      // browser-side tolerance because we read the exact in-process
      // `renderedArc` field (no DOM rounding, no RAF scheduling
      // jitter).
      const harness = buildSinkChainHarness(PAUSE_CHAIN_ID, PAUSE_CHAIN_CELLS)
      runChainStream(renderer, harness, PAUSE_RUN_TICKS, 1, () => {})

      // Capture the renderer's per-item state from the LAST running
      // frame (immediately before the pause click). Snapshot the
      // values — `readItemStates` returns a live reference to the
      // renderer's internal Map, so subsequent updates would mutate
      // it in place.
      const liveBefore = readItemStates(renderer)
      const prevPositions = new Map<
        string,
        { renderedArc: number; beltKey: string }
      >()
      for (const [id, st] of liveBefore) {
        prevPositions.set(id, {
          renderedArc: st.renderedArc,
          beltKey: st.beltKey,
        })
      }
      // Sanity: cap-2 saturation must put plenty of items in flight
      // so the "no-jump on pause-entry" contract is meaningfully
      // tested.
      expect(prevPositions.size).toBeGreaterThanOrEqual(10)

      // First paused frame — should hold prev.
      renderPausedFrame(renderer, harness)

      const after = readItemStates(renderer)
      let maxAbs = 0
      const violations: string[] = []
      for (const [id, prev] of prevPositions) {
        const cur = after.get(id)
        if (!cur) continue // item delivered between frames — out of scope
        // The sim does not tick while paused, so each item must stay
        // on the same belt and the per-belt `renderedArc` must hold
        // its previous value exactly.
        expect(
          cur.beltKey,
          `item ${id} changed belt during paused frame 0 ` +
            `(${prev.beltKey} → ${cur.beltKey})`,
        ).toBe(prev.beltKey)
        const diff = Math.abs(cur.renderedArc - prev.renderedArc)
        if (diff > maxAbs) maxAbs = diff
        if (diff >= PAUSE_TOL) {
          violations.push(
            `${id}: prev=${prev.renderedArc.toFixed(6)} ` +
              `cur=${cur.renderedArc.toFixed(6)} ` +
              `|Δ|=${diff.toExponential(3)}`,
          )
        }
      }
      expect(
        maxAbs,
        `first paused frame did not hold prev renderedArc: ` +
          `max |Δ| = ${maxAbs.toExponential(3)} (expected < ${PAUSE_TOL}). ` +
          `Violations: ${violations.join(' | ')}`,
      ).toBeLessThan(PAUSE_TOL)
    },
  )
})
