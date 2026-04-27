/**
 * @vitest-environment jsdom
 *
 * Renderer advance rate scales by cell path length L — covers corner
 * cells (L ≈ 0.871) and full straight cells (L = 1.0).
 *
 * Half-cells (L = 0.5) no longer exist: every straight cell renders
 * entry-edge midpoint to exit-edge midpoint at length 1.0, regardless
 * of whether a neighboring cell turns. Only corner cells deviate from
 * L = 1.0.
 *
 * The simulation uses uniform cell-time: every cell traverses in the same
 * number of ticks regardless of arc length. The renderer must therefore
 * advance `renderedArc` at `speed * dt * L` per frame, with a per-tick
 * bound of `speed * TICK_INTERVAL * L`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ItemRenderer } from '../../../src/rendering/ItemRenderer'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { Simulation } from '../../../src/game/Simulation'
import { Machine } from '../../../src/game/Machine'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { buildBeltPath } from '../../../src/rendering/BeltPath'
import {
  GRID_W, GRID_H, HALF_W, HALF_H,
  ITEM_TYPE, SPEED, TICK_INTERVAL, RENDER_DT,
  FRAMES_PER_TICK, INPUT_CADENCE_TICKS,
  readItemStates, beltKey, simChainArc, chainOffsetsByKey, injectItem,
  type BeltChainHarness,
} from './itemRendererTestHelpers'

const CHAIN_ID = 'chain1'

/* ------------------------------------------------------------------ */
/*  Harness                                                            */
/* ------------------------------------------------------------------ */

interface MixedChainHarness extends BeltChainHarness {
  sim: Simulation
  outputMachine: Machine
}

/**
 * Build a chain with a 90° corner:
 *
 *   (0,0) → (1,0) → (2,0) → (2,1) → (2,2)
 *
 * 4 belt segments — uniform straight length, only the corner is shorter:
 *   belt 0: (0,0)→(1,0)  — straight, L = 1.0
 *   belt 1: (1,0)→(2,0)  — straight, L = 1.0 (NOT shortened by corner)
 *   belt 2: (2,0)→(2,1)  — CORNER cell, L ≈ 0.871
 *   belt 3: (2,1)→(2,2)  — straight, L = 1.0 (NOT shortened by corner)
 *
 * An output machine (factory_output) sits at (2,2).
 */
function buildMixedHarness(): MixedChainHarness {
  const pathCoords = [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 2, z: 0 },
    { x: 2, z: 1 },
    { x: 2, z: 2 },
  ]

  const sim = new Simulation()
  const belts: ConveyorBelt[] = []

  for (let i = 0; i < pathCoords.length - 1; i++) {
    const from = pathCoords[i]
    const to = pathCoords[i + 1]
    const belt = new ConveyorBelt(
      `${CHAIN_ID}_seg${i}`,
      from.x,
      from.z,
      to.x,
      to.z,
      SPEED,
    )
    sim.addBelt(belt)
    belts.push(belt)
  }

  const outputMachine = new Machine('output', 'factory_output')
  sim.addMachine(outputMachine)
  sim.setMachinePosition(outputMachine.id, 2, 2)

  // Compute per-cell arc lengths using the same buildBeltPath the
  // renderer uses internally.
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

function cellLengthByKey(harness: MixedChainHarness): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < harness.belts.length; i++) {
    m.set(beltKey(harness.belts[i]), harness.cellLengths[i])
  }
  return m
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('ItemRenderer — advance rate must scale by path length L', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    resetItemIdCounter()
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  // Sanity: the mixed chain must contain exactly one cell with L < 1
  // (the corner) — every straight cell is length 1.0 regardless of
  // whether a neighbor turns.
  it('mixed chain has exactly one non-unit cell — the corner', () => {
    const harness = buildMixedHarness()
    const nonUnit = harness.cellLengths.filter((L) => Math.abs(L - 1.0) > 0.01)
    // Only the corner cell (belt 2) deviates from L=1.0; belts 0/1/3
    // are straight L=1.0.
    expect(nonUnit.length).toBe(1)
    // Straight cells are exactly 1.0.
    expect(harness.cellLengths[0]).toBe(1.0)
    expect(harness.cellLengths[1]).toBe(1.0)
    expect(harness.cellLengths[3]).toBe(1.0)
    // The corner cell should be ≈ 0.871
    const cornerIdx = 2
    expect(harness.cellLengths[cornerIdx]).toBeGreaterThan(0.8)
    expect(harness.cellLengths[cornerIdx]).toBeLessThan(0.9)
  })

  it('advance rate matches truth on corner cells', () => {
    // GIVEN: one item placed directly on the corner cell (belt 2).
    // After a warm-up tick so the renderer is settled, measure the
    // arc advance over one sim-tick interval (6 render frames).
    // Assert advance ≈ speed × TICK_INTERVAL × L (≈ 0.0871).
    const harness = buildMixedHarness()
    const cornerIdx = 2
    const L = harness.cellLengths[cornerIdx]

    // Place item on the corner belt.
    const item = createItem(ITEM_TYPE)
    harness.belts[cornerIdx].addItem(item)

    // Seed renderer (dt=0 → snap to truth).
    renderer.cacheBeltTopology(harness.sim.getBelts())
    renderer.update(
      renderer.buildRenderData(harness.sim.getBelts()),
      GRID_W, GRID_H, 0,
    )

    // Warm-up: 2 ticks + 6 frames each so the renderer is fully in
    // sync with truth and the lower-bound clamp doesn't dominate.
    for (let t = 0; t < 2; t++) {
      harness.sim.tick()
      for (let f = 0; f < FRAMES_PER_TICK; f++) {
        renderer.update(
          renderer.buildRenderData(harness.sim.getBelts()),
          GRID_W, GRID_H, RENDER_DT,
        )
      }
    }

    // Record arc BEFORE the measurement tick.
    const arcBefore = readItemStates(renderer).get(item.id)!.renderedArc

    // One more tick + 6 render frames.
    harness.sim.tick()
    for (let f = 0; f < FRAMES_PER_TICK; f++) {
      renderer.update(
        renderer.buildRenderData(harness.sim.getBelts()),
        GRID_W, GRID_H, RENDER_DT,
      )
    }

    const arcAfter = readItemStates(renderer).get(item.id)!.renderedArc
    const advance = arcAfter - arcBefore
    const expected = SPEED * TICK_INTERVAL * L

    // Within 1 % of the L-scaled advance.
    expect(advance).toBeGreaterThan(expected * 0.99)
    expect(advance).toBeLessThan(expected * 1.01)
  })

  it('truth tracking within one tick on mixed chain', () => {
    // GIVEN: items injected every INPUT_CADENCE_TICKS into the mixed
    // chain for 100 ticks. For each frame, every rendered item must
    // satisfy:
    //   |renderedArc − truthArc| ≤ speed × TICK_INTERVAL × L
    // where L is the CELL-SPECIFIC path length (not the flat 0.1).
    // Verifies the L-scaled bound is respected on corner cells (L ≈ 0.087).
    const harness = buildMixedHarness()
    const lengths = cellLengthByKey(harness)

    const violations: Array<{
      id: string
      frame: number
      diff: number
      bound: number
    }> = []

    renderer.cacheBeltTopology(harness.sim.getBelts())
    renderer.update(
      renderer.buildRenderData(harness.sim.getBelts()),
      GRID_W, GRID_H, 0,
    )

    let frameIdx = 0
    for (let t = 0; t < 100; t++) {
      if (t % INPUT_CADENCE_TICKS === 0) injectItem(harness)
      harness.sim.tick()

      for (let f = 0; f < FRAMES_PER_TICK; f++) {
        renderer.update(
          renderer.buildRenderData(harness.sim.getBelts()),
          GRID_W, GRID_H, RENDER_DT,
        )

        const states = readItemStates(renderer)
        for (const [id, st] of states) {
          const cellL = lengths.get(st.beltKey)
          if (cellL === undefined) continue
          const truth = simChainArc(harness, id)
          if (Number.isNaN(truth)) continue

          const offsets = chainOffsetsByKey(harness)
          const off = offsets.get(st.beltKey)
          if (off === undefined) continue
          const rendered = off + st.renderedArc

          const bound = SPEED * TICK_INTERVAL * cellL
          const diff = Math.abs(rendered - truth)
          if (diff > bound + 1e-9) {
            violations.push({ id, frame: frameIdx, diff, bound })
          }
        }
        frameIdx++
      }
    }

    expect(violations).toEqual([])
  })

  it('spacing is uniform on a chain with corners (rendered vs sim-truth)', () => {
    // GIVEN: 120 ticks, inject every INPUT_CADENCE_TICKS. At each frame,
    // compute rendered spacing and sim-truth spacing between consecutive
    // items. Assert rendered spacing stays within 15 % of sim-truth
    // spacing for all pairs.
    // Verifies uniform spacing is preserved across cells with varying L.
    const harness = buildMixedHarness()
    const offsets = chainOffsetsByKey(harness)

    let finalRenderedArcs: Array<{ id: string; arc: number }> = []
    let finalTruthArcs: Array<{ id: string; arc: number }> = []

    renderer.cacheBeltTopology(harness.sim.getBelts())
    renderer.update(
      renderer.buildRenderData(harness.sim.getBelts()),
      GRID_W, GRID_H, 0,
    )

    for (let t = 0; t < 120; t++) {
      if (t % INPUT_CADENCE_TICKS === 0) injectItem(harness)
      harness.sim.tick()
      for (let f = 0; f < FRAMES_PER_TICK; f++) {
        renderer.update(
          renderer.buildRenderData(harness.sim.getBelts()),
          GRID_W, GRID_H, RENDER_DT,
        )
      }
    }

    // Capture final frame state.
    const states = readItemStates(renderer)
    for (const [id, st] of states) {
      const off = offsets.get(st.beltKey)
      if (off === undefined) continue
      finalRenderedArcs.push({ id, arc: off + st.renderedArc })
      const truth = simChainArc(harness, id)
      if (!Number.isNaN(truth)) {
        finalTruthArcs.push({ id, arc: truth })
      }
    }

    // Need at least 2 items in flight to measure spacing.
    expect(finalRenderedArcs.length).toBeGreaterThanOrEqual(2)

    // Sort by chain-arc position.
    finalRenderedArcs.sort((a, b) => a.arc - b.arc)
    finalTruthArcs.sort((a, b) => a.arc - b.arc)

    // Build id-indexed truth map.
    const truthMap = new Map<string, number>()
    for (const t of finalTruthArcs) truthMap.set(t.id, t.arc)

    // For each consecutive pair of rendered items, compare rendered
    // spacing to sim-truth spacing. They must agree within 15 %.
    const offenders: Array<{
      idA: string
      idB: string
      renderedSpacing: number
      truthSpacing: number
      relError: number
    }> = []

    for (let i = 1; i < finalRenderedArcs.length; i++) {
      const a = finalRenderedArcs[i - 1]
      const b = finalRenderedArcs[i]
      const truthA = truthMap.get(a.id)
      const truthB = truthMap.get(b.id)
      if (truthA === undefined || truthB === undefined) continue

      const renderedSpacing = b.arc - a.arc
      const truthSpacing = truthB - truthA
      if (truthSpacing < 1e-6) continue // skip co-located items

      const relError = Math.abs(renderedSpacing - truthSpacing) / truthSpacing
      if (relError > 0.15) {
        offenders.push({
          idA: a.id,
          idB: b.id,
          renderedSpacing,
          truthSpacing,
          relError,
        })
      }
    }

    expect(offenders).toEqual([])
  })

  it('no stall at segment end on corner cell', () => {
    // GIVEN: one item on the corner cell. Run the full traversal
    // (10 ticks × 6 frames). Record renderedArc at each frame.
    // For every frame where truth < L (item hasn't finished the cell),
    // the per-frame delta must be approximately speed × RENDER_DT × L
    // (within 20 % to accommodate clamping near tick boundaries).
    // Asserts no zero-delta stall frames and consistent per-frame advance rate.
    const harness = buildMixedHarness()
    const cornerIdx = 2
    const L = harness.cellLengths[cornerIdx]

    const item = createItem(ITEM_TYPE)
    harness.belts[cornerIdx].addItem(item)

    // Seed renderer.
    renderer.cacheBeltTopology(harness.sim.getBelts())
    renderer.update(
      renderer.buildRenderData(harness.sim.getBelts()),
      GRID_W, GRID_H, 0,
    )

    const arcs: number[] = []
    // Run 10 ticks (full cell traversal) × 6 frames each.
    for (let t = 0; t < 10; t++) {
      harness.sim.tick()
      for (let f = 0; f < FRAMES_PER_TICK; f++) {
        renderer.update(
          renderer.buildRenderData(harness.sim.getBelts()),
          GRID_W, GRID_H, RENDER_DT,
        )
        const st = readItemStates(renderer).get(item.id)
        if (st) arcs.push(st.renderedArc)
      }
    }

    expect(arcs.length).toBeGreaterThanOrEqual(10) // at least some frames

    const expectedDelta = SPEED * RENDER_DT * L
    const TOL = 0.20 // 20 % tolerance

    // Collect frames where the delta is zero or near-zero (stalls) or
    // significantly different from the expected rate. Skip the very
    // first frame (snap) and the last few frames near L (natural slow
    // to boundary).
    const stalls: Array<{ frame: number; delta: number }> = []
    const wrongRate: Array<{ frame: number; delta: number; expected: number }> = []

    // Exclude the last 2 frame quanta near L where sim-tick clamping
    // produces expected deviations from the steady-state advance rate.
    const boundaryMargin = SPEED * RENDER_DT * L * 2
    for (let i = 1; i < arcs.length; i++) {
      const delta = arcs[i] - arcs[i - 1]
      // Skip frames near the end of the cell where clamping is expected.
      if (arcs[i] >= L - boundaryMargin) break

      if (Math.abs(delta) < 1e-9) {
        stalls.push({ frame: i, delta })
      } else if (Math.abs(delta - expectedDelta) > expectedDelta * TOL) {
        wrongRate.push({ frame: i, delta, expected: expectedDelta })
      }
    }

    // Stalls are the core symptom: the renderer outruns truth on the
    // corner cell, hits the upper-bound clamp, and produces zero-delta
    // frames while waiting for truth to catch up.
    expect(stalls).toEqual([])
    // Per-frame advance should be consistently ≈ speed × dt × L.
    expect(wrongRate).toEqual([])
  })
})
