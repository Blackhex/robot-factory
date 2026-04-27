/**
 * @vitest-environment jsdom
 *
 * PROBE — investigation only, no production code changes.
 *
 * Reproduces the user-reported "corner cells move slower / jerky" bug.
 *
 * Hypothesis: Sim advances `positionOnBelt` by `speed * dt = 0.1` per
 * tick on EVERY belt cell regardless of the cell's rendered arc length.
 * The renderer maps `position ∈ [0,1]` to `renderedArc ∈ [0, L]`. So
 * world-space speed equals `L * speed` per tick:
 *   - straight interior cell: L = 1.0  →  Δworld/tick = 1.0 * speed
 *   - corner cell:            L ≈ 0.871 → Δworld/tick = 0.871 * speed
 * Expected corner/straight ratio ≈ 0.871 (~13 % slower on corners).
 *
 * Probe builds a 5-cell chain that contains exactly one straight cell
 * with L = 1.0 and one corner cell with L ≈ 0.871, runs sim at 10 Hz
 * and renderer at 60 fps, and logs per-frame Δworld.
 */
import { describe, it } from 'vitest'
import * as THREE from 'three'
import { Simulation } from '../../../src/game/Simulation'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { ItemRenderer, type BeltLike } from '../../../src/rendering/ItemRenderer'
import type { ItemType } from '../../../src/game/types'

const GRID_W = 20
const GRID_H = 20

interface FrameLog {
  frame: number
  simTick: number
  belt: string
  simPos: string
  renderedArc: string
  L: string
  wx: string
  wz: string
  dWorld: string
}

describe('PROBE 2 — corner cell movement speed', () => {
  it('logs per-frame Δworld and computes corner/straight speed ratio', () => {
    resetItemIdCounter()
    const sim = new Simulation() // tickRate = 10 → dt = 0.1

    // 5-segment chain (chain id "c") laid out so:
    //   c_seg0: (0,0)→(1,0)   straight (chain start, before any corner) → L = 1.0
    //   c_seg1: (1,0)→(2,0)   straight (interior, no neighbour corner) → L = 1.0  ★STRAIGHT MEASURE
    //   c_seg2: (2,0)→(3,0)   straight (next is corner)                 → L = 1.0  (was 0.5 before half-cell removal)
    //   c_seg3: (3,0)→(3,1)   CORNER                                    → L ≈ 0.871 ★CORNER MEASURE
    //   c_seg4: (3,1)→(3,2)   straight (prev is corner)                 → L = 1.0  (was 0.5 before half-cell removal)
    const segs: Array<[number, number, number, number]> = [
      [0, 0, 1, 0],
      [1, 0, 2, 0],
      [2, 0, 3, 0],
      [3, 0, 3, 1],
      [3, 1, 3, 2],
    ]
    const belts: ConveyorBelt[] = segs.map(
      ([fx, fz, tx, tz], i) => new ConveyorBelt(`c_seg${i}`, fx, fz, tx, tz, 1.0),
    )
    for (const b of belts) sim.addBelt(b)

    // Inject one item at the start of c_seg1 (the L=1.0 straight cell).
    const item = createItem('wheel_small')
    belts[1].insertItemAt(item, 0)

    const scene = new THREE.Scene()
    const renderer = new ItemRenderer(scene)
    const meshes = (renderer as unknown as {
      meshes: Map<ItemType, THREE.InstancedMesh>
    }).meshes
    const itemStates = (renderer as unknown as {
      itemStates: Map<string, { renderedArc: number; pathLength: number; beltKey: string }>
    }).itemStates

    function getWorld(): { x: number; z: number } | null {
      const mesh = meshes.get('wheel_small')!
      if (mesh.count === 0) return null
      const m = new THREE.Matrix4()
      mesh.getMatrixAt(0, m)
      const p = new THREE.Vector3()
      p.setFromMatrixPosition(m)
      return { x: p.x, z: p.z }
    }
    function whichBelt(): string {
      for (const b of belts) {
        if (b.getItems().some((it) => it.id === item.id)) return b.id
      }
      return '-'
    }
    function simPosOnBelt(): number {
      for (const b of belts) {
        const it = b.getItems().find((i) => i.id === item.id)
        if (it) return it.positionOnBelt
      }
      return -1
    }

    // Seed render frame (snap-to-truth).
    const beltsMap = sim.getBelts() as ReadonlyMap<string, BeltLike>
    let data = renderer.buildRenderData(beltsMap)
    renderer.update(data, GRID_W, GRID_H, 0)

    const dtFrame = 1 / 60
    const ticksPerFrame = dtFrame * sim.tickRate // 10/60 ≈ 0.1667
    let tickAccum = 0
    let prev = getWorld()

    const logs: FrameLog[] = []
    // 240 frames ≈ 4 s of sim time, enough to traverse all 5 cells at speed=1.0.
    for (let f = 0; f < 240; f++) {
      tickAccum += ticksPerFrame
      while (tickAccum >= 1 - 1e-9) {
        sim.tick()
        tickAccum -= 1
      }
      data = renderer.buildRenderData(beltsMap)
      renderer.update(data, GRID_W, GRID_H, dtFrame)

      const cur = getWorld()
      if (!cur) break

      const dWorld = prev ? Math.hypot(cur.x - prev.x, cur.z - prev.z) : 0
      const st = itemStates.get(item.id)
      logs.push({
        frame: f,
        simTick: sim.currentTick,
        belt: whichBelt(),
        simPos: simPosOnBelt().toFixed(4),
        renderedArc: (st?.renderedArc ?? -1).toFixed(4),
        L: (st?.pathLength ?? -1).toFixed(4),
        wx: cur.x.toFixed(4),
        wz: cur.z.toFixed(4),
        dWorld: dWorld.toFixed(5),
      })
      prev = cur
    }

    console.log('\n=== PROBE 2: per-frame Δworld (sim 10 Hz, render 60 fps) ===')
    for (const l of logs) console.log(JSON.stringify(l))

    // Bucket Δworld by belt-id, dropping frames that crossed a belt
    // boundary (those Δworld values mix two cells).
    const byBelt = new Map<string, number[]>()
    for (let i = 1; i < logs.length; i++) {
      if (logs[i].belt === '-' || logs[i - 1].belt === '-') continue
      if (logs[i].belt !== logs[i - 1].belt) continue
      const arr = byBelt.get(logs[i].belt) ?? []
      arr.push(parseFloat(logs[i].dWorld))
      byBelt.set(logs[i].belt, arr)
    }

    console.log('\n=== Per-belt Δworld stats (cross-belt frames excluded) ===')
    const means = new Map<string, number>()
    for (const id of ['c_seg0', 'c_seg1', 'c_seg2', 'c_seg3', 'c_seg4']) {
      const arr = byBelt.get(id)
      if (!arr || arr.length === 0) {
        console.log(`${id}: (no samples)`)
        continue
      }
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length
      const min = Math.min(...arr)
      const max = Math.max(...arr)
      means.set(id, mean)
      console.log(
        `${id}: n=${arr.length} mean=${mean.toFixed(5)} min=${min.toFixed(5)} max=${max.toFixed(5)}`,
      )
    }

    const straight = means.get('c_seg1')
    const corner = means.get('c_seg3')
    if (straight !== undefined && corner !== undefined && straight > 0) {
      const ratio = corner / straight
      console.log(
        `\nCorner/straight Δworld ratio: ${ratio.toFixed(4)} (expected ≈ 0.871)`,
      )
      console.log(
        `Per-tick Δworld in WORLD UNITS: straight≈${(straight * 6).toFixed(4)}, corner≈${(corner * 6).toFixed(4)}`,
      )
    }
  })
})
