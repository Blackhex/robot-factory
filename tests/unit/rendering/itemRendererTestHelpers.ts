/**
 * Shared helpers and constants for ItemRenderer test suites.
 */
import { ItemRenderer } from '../../../src/rendering/ItemRenderer'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { Simulation } from '../../../src/game/Simulation'
import { Machine } from '../../../src/game/Machine'
import { createItem } from '../../../src/game/Item'
import { buildBeltPath } from '../../../src/rendering/BeltPath'
import type { ItemType } from '../../../src/game/types'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const GRID_W = 20
export const GRID_H = 20
export const HALF_W = GRID_W / 2
export const HALF_H = GRID_H / 2
export const ITEM_TYPE: ItemType = 'wheel_small'
export const SPEED = 1.0
export const TICK_INTERVAL = 0.1 // 10 Hz
export const RENDER_DT = 1 / 60 // 60 fps
export const FRAMES_PER_TICK = 6 // 0.1 / (1/60) ≈ 6
export const INPUT_CADENCE_TICKS = 10 // one item every 10 ticks (= 1 s)

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ItemStateView {
  renderedArc: number
  beltKey: string
  pathLength: number
}

/** Minimal shape shared by all per-test harness types. */
export interface BeltChainHarness {
  belts: ConveyorBelt[]
  chainOffsets: number[]
  cellLengths: number[]
}

/**
 * Chain harness backed by a real `Simulation` plus a terminal output
 * machine. Used by both the stream-stability and uniform-flow suites
 * (the former also uses a stub variant where `outputMachine` is a
 * disabled recycler — that variant is built locally).
 */
export interface SinkChainHarness extends BeltChainHarness {
  sim: Simulation
  outputMachine: Machine
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function readItemStates(
  renderer: ItemRenderer,
): Map<string, ItemStateView> {
  return (renderer as unknown as { itemStates: Map<string, ItemStateView> })
    .itemStates
}

export function beltKey(b: ConveyorBelt): string {
  return `${b.fromX},${b.fromZ}->${b.toX},${b.toZ}`
}

/**
 * Compute chain-arc-from-chain-start for a sim item, given the belt it
 * is currently on. Returns NaN if the item is not in any belt (e.g.
 * already delivered).
 */
export function simChainArc(
  harness: BeltChainHarness,
  itemId: string,
): number {
  for (let i = 0; i < harness.belts.length; i++) {
    const it = harness.belts[i].getItems().find((x) => x.id === itemId)
    if (it) {
      const clamped = Math.max(0, Math.min(1, it.positionOnBelt))
      return harness.chainOffsets[i] + clamped * harness.cellLengths[i]
    }
  }
  return Number.NaN
}

/** Build a beltKey → chain-arc-offset map matching `chainOffsets`. */
export function chainOffsetsByKey(harness: BeltChainHarness): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < harness.belts.length; i++) {
    m.set(beltKey(harness.belts[i]), harness.chainOffsets[i])
  }
  return m
}

/**
 * Inject a fresh item onto belts[0] if the cell is empty. Returns the
 * injected item id, or null if the input cell is occupied (back-pressure
 * at the source).
 */
export function injectItem(harness: BeltChainHarness): string | null {
  const item = createItem(ITEM_TYPE)
  if (!harness.belts[0].addItem(item)) return null
  return item.id
}

/**
 * Build a real Simulation with a straight chain of `cellCount`
 * ConveyorBelt segments laid along (0,0) → (cellCount,0) and a
 * `factory_output` (always-accepts) sink at the chain end. Belt ids
 * follow `<chainId>_seg<N>` so the renderer's `cacheBeltTopology`
 * recognises the chain and populates prev/next/prevPrev links.
 *
 * Use this for tests that exercise normal flow without back-pressure.
 * For back-pressure scenarios (full-machine stub), build the harness
 * locally — those need a different output-machine configuration.
 */
export function buildSinkChainHarness(
  chainId: string,
  cellCount: number,
  speed: number = SPEED,
): SinkChainHarness {
  const sim = new Simulation()
  const belts: ConveyorBelt[] = []
  for (let i = 0; i < cellCount; i++) {
    const belt = new ConveyorBelt(
      `${chainId}_seg${i}`,
      i,
      0,
      i + 1,
      0,
      speed,
    )
    sim.addBelt(belt)
    belts.push(belt)
  }
  // Always-accepts sink: deliveries succeed every tick, so back-pressure
  // never builds — items stream through at full belt speed indefinitely.
  const outputMachine = new Machine('output', 'factory_output')
  sim.addMachine(outputMachine)
  sim.setMachinePosition(outputMachine.id, cellCount, 0)

  // Per-cell arc length matching the renderer's path builder.
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
 * `cadenceTicks` ticks (starting at tick 0) injects one item onto
 * belt 0 of the chain. Renders FRAMES_PER_TICK frames between each
 * tick. Calls `onFrame(frameIdx)` after each render update.
 */
export function runChainStream(
  renderer: ItemRenderer,
  harness: SinkChainHarness,
  totalTicks: number,
  cadenceTicks: number,
  onFrame: (frameIdx: number) => void,
): void {
  renderer.cacheBeltTopology(harness.sim.getBelts())
  // Seed (dt = 0) so first sight of any item snaps to truth.
  renderer.update(
    renderer.buildRenderData(harness.sim.getBelts()),
    GRID_W,
    GRID_H,
    0,
  )
  let frameIdx = 0
  for (let t = 0; t < totalTicks; t++) {
    if (t % cadenceTicks === 0) injectItem(harness)
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
