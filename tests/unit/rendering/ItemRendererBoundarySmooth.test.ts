/**
 * @vitest-environment jsdom
 *
 * RED-step regression test pinning the bug:
 *   "items jump at segment boundary on multi-cell belts at speed 3".
 *
 * Bug summary (UX measurement / inspection):
 *   On a multi-cell belt chain at high speed (e.g. speed 3 = 0.3 cells
 *   per simulation tick), every time `Simulation.advanceBelts` hands an
 *   item from one `ConveyorBelt` segment to the next, the destination
 *   belt receives the handover overshoot O via `acceptHandover` (e.g.
 *   O = 0.2 cells when the upstream item just crossed pos = 1.2).
 *
 *   The renderer's per-frame `update()` then takes the cross-belt
 *   branch:
 *
 *     } else if (!prev || prev.beltKey !== key || dt <= 0) {
 *       // First sight, item handed over to a new belt this frame, or
 *       // seed-frame (dt <= 0): snap to sim truth.
 *       renderedArc = truthArc
 *     }
 *
 *   `truthArc` on the NEW belt is `O * L_new` (≈ 0.2 cells past the
 *   boundary). The PREVIOUS render frame had the same item rendered on
 *   the OLD belt with `renderedArc` already clamped to ≈ L_old (the
 *   boundary midpoint world position). The world-space step on the
 *   handover frame is therefore ≈ O cells (~0.2) instead of the smooth
 *   per-frame target of `speed * dt = 3 * (1/60) ≈ 0.05` cells.
 *
 *   The result is a visible per-cell teleport that the user sees as
 *   "items jumping at every segment boundary" along multi-cell belts at
 *   high speed.
 *
 * Scope: white-box, real `Simulation` + real `ConveyorBelt` chain +
 * real `ItemRenderer` against a fresh `THREE.Scene`. NO production code
 * is modified. This test is expected to FAIL on current code; the
 * recorded `maxDelta` and `frame` document the size and location of the
 * jump for the fix to target.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ItemRenderer } from '../../../src/rendering/ItemRenderer'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { Simulation } from '../../../src/game/Simulation'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import type { BeltInfo, ItemType } from '../../../src/game/types'

const GRID_W = 20
const GRID_H = 20
const RENDER_DT = 1 / 60 // 60 fps render
const FRAMES_PER_TICK = 6 // 0.1 s sim tick / (1/60 s frame) ≈ 6
const ITEM_TYPE: ItemType = 'wheel_small'

interface Harness {
  sim: Simulation
  belts: ConveyorBelt[]
  itemId: string
}

/**
 * Build a 5-cell straight chain `belt_long_seg0..4` along
 * (0,0)→(1,0)→(2,0)→(3,0)→(4,0)→(5,0) using
 * `ConveyorBelt.fromBeltInfo`, so each segment carries the
 * canonical `${logicalId}_seg${i}` id the renderer's
 * `cacheBeltTopology` recognises as a chain.
 */
function buildLongBelt(speed: number): Harness {
  // `fromBeltInfo` only reads `id` and `path` off `BeltInfo`; the rest
  // of the BeltInfo shape is irrelevant for segment construction.
  const stub = {
    id: 'belt_long',
    path: [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
      { x: 4, z: 0 },
      { x: 5, z: 0 },
    ],
  } as unknown as BeltInfo

  const segments = ConveyorBelt.fromBeltInfo(stub, speed)
  const sim = new Simulation()
  for (const seg of segments) {
    // Defensive: guarantee per-segment speed regardless of any future
    // change to fromBeltInfo's speed propagation.
    seg.speed = speed
    sim.addBelt(seg)
  }

  const item = createItem(ITEM_TYPE)
  // Item enters at the start of belt_long_seg0 with positionOnBelt = 0.
  segments[0].addItem(item)

  return { sim, belts: segments, itemId: item.id }
}

/**
 * Read the WORLD-space x of the single tracked item out of the
 * InstancedMesh matrix. Returns null when the renderer is not
 * currently rendering any item of `ITEM_TYPE`.
 */
function readWorldX(renderer: ItemRenderer): number | null {
  const meshes = (renderer as unknown as {
    meshes: Map<ItemType, THREE.InstancedMesh>
  }).meshes
  const mesh = meshes.get(ITEM_TYPE)
  if (!mesh || mesh.count === 0) return null
  const m = new THREE.Matrix4()
  mesh.getMatrixAt(0, m)
  return new THREE.Vector3().setFromMatrixPosition(m).x
}

interface RunResult {
  worldX: number[]
  expectedStep: number
}

/**
 * Run sim + render for `frames` frames at 60 fps; tick the
 * simulation every `FRAMES_PER_TICK` frames so the sim runs at its
 * native 10 Hz. Records the rendered world-x of the single tracked
 * item after every render frame.
 */
function runAndCollect(harness: Harness, frames: number): RunResult {
  const scene = new THREE.Scene()
  const renderer = new ItemRenderer(scene)
  renderer.cacheBeltTopology(harness.sim.getBelts())

  // Seed (dt=0): snap rendered positions to truth.
  renderer.update(
    renderer.buildRenderData(harness.sim.getBelts()),
    GRID_W,
    GRID_H,
    0,
  )

  const speed = harness.belts[0].speed
  const expectedStep = speed * RENDER_DT // ≈ 0.05 cells/frame at speed 3
  const worldX: number[] = []

  for (let f = 0; f < frames; f++) {
    if (f % FRAMES_PER_TICK === 0) {
      harness.sim.tick()
    }
    renderer.update(
      renderer.buildRenderData(harness.sim.getBelts()),
      GRID_W,
      GRID_H,
      RENDER_DT,
      false,
    )
    const x = readWorldX(renderer)
    worldX.push(x ?? Number.NaN)
  }

  return { worldX, expectedStep }
}

interface MaxDelta {
  maxDelta: number
  frame: number
}

/**
 * Compute the max frame-to-frame increase in world-x and the frame
 * index where it occurred. Frame 0 is skipped (no predecessor). NaN
 * frames (no item rendered yet/anymore) are skipped pairwise.
 */
function maxForwardDelta(worldX: number[]): MaxDelta {
  let maxDelta = -Infinity
  let frame = -1
  for (let i = 1; i < worldX.length; i++) {
    const a = worldX[i - 1]
    const b = worldX[i]
    if (Number.isNaN(a) || Number.isNaN(b)) continue
    const d = b - a
    if (d > maxDelta) {
      maxDelta = d
      frame = i
    }
  }
  return { maxDelta, frame }
}

describe('ItemRenderer — segment-boundary smoothness', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('should not jump at segment boundary on multi-cell belts at speed 3', () => {
    // GIVEN: a 5-segment colinear chain at speed 3 (= 0.3 cells per
    // sim tick), one item injected at the head of seg0. Every ~3.3
    // ticks the simulation hands the item to the next segment with a
    // non-zero overshoot O ≈ 0.2 cells.
    const harness = buildLongBelt(3)

    // WHEN: rendered for 120 frames at 60 fps (≈ 20 sim ticks → the
    // item crosses several segment boundaries within the window).
    const { worldX, expectedStep } = runAndCollect(harness, 120)

    // THEN: the per-frame world-space step never exceeds 2× the
    // smooth target. Anything materially above that is the cross-belt
    // snap teleporting the item past the boundary on the handover
    // frame.
    const { maxDelta, frame } = maxForwardDelta(worldX)
    const tolerance = 0.10 // 2× expected per-frame step (0.05 at speed 3)

    expect(
      maxDelta,
      `maxDelta=${maxDelta.toFixed(4)} at frame ${frame} ` +
        `(expected per-frame step ≈ ${expectedStep.toFixed(4)}; ` +
        `tolerance ${tolerance.toFixed(2)}). ` +
        `A maxDelta materially > ${tolerance} indicates the renderer ` +
        `is teleporting the item across the segment boundary in a ` +
        `single frame (cross-belt snap in ItemRenderer.update()).`,
    ).toBeLessThan(tolerance)
  })
})
