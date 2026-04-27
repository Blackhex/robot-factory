/**
 * @vitest-environment jsdom
 *
 * Renderer contract guards for mid-simulation item migration.
 *
 * When a Factory live-edit removes a belt and migrates its items onto a
 * different belt (new belt id / new geometry → new render key), the
 * renderer's per-id state still references the prior belt. The expected
 * behavior is a single-frame "snap" to the migrated item's truth position
 * on the NEW belt, with no multi-frame drift, lead-close sprint, or
 * backward motion.
 *
 * Same pattern as `ItemRendererNoGhostAfterEdit.test.ts` (hand-built
 * `BeltRenderData`, direct `update()` calls, deterministic dt).
 *
 * P1 — A migrated item snaps to the new-belt truth position on the first
 *      update after migration, then advances at ~speed*dt per frame (no
 *      catch-up sprint).
 * P2 — Multiple migrated items each land at their truth position and
 *      preserve their initial spacing across subsequent frames.
 * P3 — Migrated items never move backward along the new belt's arc length
 *      after the migration frame.
 * P4 — Items that stay on the same belt across update calls keep their
 *      existing interpolation behavior (regression guard for non-
 *      migration cases).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  ItemRenderer,
  type BeltRenderData,
} from '../../../src/rendering/ItemRenderer'
import { buildBeltPath, sampleBeltPath } from '../../../src/rendering/BeltPath'
import type { ItemType } from '../../../src/game/types'

const GRID_W = 10
const GRID_H = 10
const HALF_W = GRID_W / 2
const HALF_H = GRID_H / 2
const ITEM_TYPE: ItemType = 'wheel_small'
const SPEED = 1
const DT = 0.0167

function readInstancePosition(
  renderer: ItemRenderer,
  type: ItemType,
  index: number,
): THREE.Vector3 {
  const meshes = (renderer as unknown as {
    meshes: Map<ItemType, THREE.InstancedMesh>
  }).meshes
  const mesh = meshes.get(type)!
  const m = new THREE.Matrix4()
  mesh.getMatrixAt(index, m)
  const p = new THREE.Vector3()
  p.setFromMatrixPosition(m)
  return p
}

/**
 * Compute the world-space sample point for a straight unit belt at a
 * given slot fraction.
 */
function expectedWorldAt(
  from: { x: number; z: number },
  to: { x: number; z: number },
  fraction: number,
): { x: number; z: number; L: number } {
  const path = buildBeltPath(from, to, undefined, HALF_W, HALF_H)
  const out = { x: 0, z: 0 }
  sampleBeltPath(path, fraction, out)
  return { x: out.x, z: out.z, L: path.length }
}

/** Read the i-th instance world position as a 2D (x,z) pair. */
function pos2D(
  renderer: ItemRenderer,
  index: number,
): { x: number; z: number } {
  const v = readInstancePosition(renderer, ITEM_TYPE, index)
  return { x: v.x, z: v.z }
}

function dist2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.hypot(dx, dz)
}

/** Build single-item belt render data for one belt. */
function makeBelt(
  from: { x: number; z: number },
  to: { x: number; z: number },
  items: Array<{ id: string; position: number }>,
): BeltRenderData {
  return {
    from,
    to,
    speed: SPEED,
    items: items.map((it) => ({
      id: it.id,
      type: ITEM_TYPE,
      position: it.position,
    })),
  }
}

describe('ItemRenderer — migration stability (no multi-frame popping)', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  /**
   * P1 — Single migrated item snaps to new-belt truth on the first
   * frame, then advances normally.
   *
   * Build beltA at z=0 and beltB at z=5 (different keys, both unit
   * straights). Seed item "X" on beltA and run multiple render frames
   * with no truth advance so renderedArc gets ahead of truth (lead
   * territory). Then perform migration: belts list now contains ONLY
   * beltB (different geometry → different key) carrying item "X" at a
   * fresh slot fraction. The first update after migration must place
   * the item exactly at samplePath(beltB, truth_B); subsequent frames
   * must each move by ~speed*dt (no catch-up sprint, no backward step).
   */
  describe('P1 — migrated item snaps to truth on first frame, then advances normally', () => {
    it('first post-migration frame matches truth on new belt; subsequent frames advance ~speed*dt', () => {
      const beltAFrom = { x: 1, z: 0 }
      const beltATo = { x: 2, z: 0 }
      const beltBFrom = { x: 1, z: 5 }
      const beltBTo = { x: 2, z: 5 }

      // Seed: item X on beltA at slot 0.5.
      renderer.update(
        [makeBelt(beltAFrom, beltATo, [{ id: 'X', position: 0.5 }])],
        GRID_W,
        GRID_H,
        0,
        false,
      )

      // Advance several frames on beltA with truth held at 0.5 so
      // renderedArc accumulates ahead of truth (engages lead territory).
      for (let i = 0; i < 15; i++) {
        renderer.update(
          [makeBelt(beltAFrom, beltATo, [{ id: 'X', position: 0.5 }])],
          GRID_W,
          GRID_H,
          DT,
          false,
        )
      }

      // Migration: beltA is gone, item X is now on beltB at slot 0.2.
      const truthBSlot = 0.2
      renderer.update(
        [makeBelt(beltBFrom, beltBTo, [{ id: 'X', position: truthBSlot }])],
        GRID_W,
        GRID_H,
        DT,
        false,
      )

      // ASSERT: rendered position matches truth on beltB exactly.
      const truthB = expectedWorldAt(beltBFrom, beltBTo, truthBSlot)
      const got = pos2D(renderer, 0)
      const errAtMigration = dist2D(got, truthB)
      expect(
        errAtMigration,
        `migration frame: rendered (${got.x.toFixed(4)},${got.z.toFixed(4)}) ` +
          `differs from truth on beltB (${truthB.x.toFixed(4)},${truthB.z.toFixed(4)}) ` +
          `by ${errAtMigration.toFixed(4)} world units (expected ≤ 1e-4)`,
      ).toBeLessThan(1e-4)

      // Subsequent frames: simulate the sim having ticked so truth on
      // beltB advances by ~speed*dt per render frame. The renderer's
      // per-frame world delta must equal ~SPEED*DT (within ±15 %).
      const expectedStep = SPEED * DT
      const lower = expectedStep * 0.85
      const upper = expectedStep * 1.15

      let prevPos = got
      let prevSlot = truthBSlot
      for (let i = 0; i < 6; i++) {
        prevSlot += SPEED * DT
        if (prevSlot > 1) prevSlot = 1
        renderer.update(
          [makeBelt(beltBFrom, beltBTo, [{ id: 'X', position: prevSlot }])],
          GRID_W,
          GRID_H,
          DT,
          false,
        )
        const cur = pos2D(renderer, 0)
        const delta = dist2D(cur, prevPos)
        expect(
          delta,
          `frame ${i + 1} after migration: Δworld=${delta.toFixed(4)} not in ` +
            `[${lower.toFixed(4)}, ${upper.toFixed(4)}] (expected ~${expectedStep.toFixed(4)})`,
        ).toBeGreaterThanOrEqual(lower)
        expect(delta).toBeLessThanOrEqual(upper)
        prevPos = cur
      }
    })
  })

  /**
   * P2 — Multiple migrated items end at their truth positions and keep
   * their relative spacing.
   */
  describe('P2 — multiple migrated items land on truth and preserve spacing', () => {
    it('three migrated items land on truth on the new belt and stay evenly spaced', () => {
      const beltAFrom = { x: 1, z: 0 }
      const beltATo = { x: 2, z: 0 }
      const beltBFrom = { x: 1, z: 5 }
      const beltBTo = { x: 2, z: 5 }

      const slotsA = [0.2, 0.5, 0.8] as const
      const slotsB = [0.2, 0.5, 0.8] as const

      // Seed three items on beltA.
      renderer.update(
        [
          makeBelt(beltAFrom, beltATo, [
            { id: 'I1', position: slotsA[0] },
            { id: 'I2', position: slotsA[1] },
            { id: 'I3', position: slotsA[2] },
          ]),
        ],
        GRID_W,
        GRID_H,
        0,
        false,
      )

      // Run a few frames on beltA so per-id state diverges from truth.
      for (let i = 0; i < 5; i++) {
        renderer.update(
          [
            makeBelt(beltAFrom, beltATo, [
              { id: 'I1', position: slotsA[0] },
              { id: 'I2', position: slotsA[1] },
              { id: 'I3', position: slotsA[2] },
            ]),
          ],
          GRID_W,
          GRID_H,
          DT,
          false,
        )
      }

      // Migration: all three items now on beltB at the same slots.
      renderer.update(
        [
          makeBelt(beltBFrom, beltBTo, [
            { id: 'I1', position: slotsB[0] },
            { id: 'I2', position: slotsB[1] },
            { id: 'I3', position: slotsB[2] },
          ]),
        ],
        GRID_W,
        GRID_H,
        DT,
        false,
      )

      // ASSERT: each rendered position == samplePath(beltB, slot).
      for (let i = 0; i < 3; i++) {
        const truth = expectedWorldAt(beltBFrom, beltBTo, slotsB[i])
        const got = pos2D(renderer, i)
        const err = dist2D(got, truth)
        expect(
          err,
          `item ${i} on migration frame: rendered (${got.x.toFixed(4)},${got.z.toFixed(4)}) ` +
            `differs from truth (${truth.x.toFixed(4)},${truth.z.toFixed(4)}) by ${err.toFixed(4)}`,
        ).toBeLessThan(1e-4)
      }

      // Capture initial spacing between consecutive items on beltB.
      const p0 = pos2D(renderer, 0)
      const p1 = pos2D(renderer, 1)
      const p2 = pos2D(renderer, 2)
      const initialSpacing01 = dist2D(p1, p0)
      const initialSpacing12 = dist2D(p2, p1)

      // Run 10 more frames with truth held; the renderer must NOT
      // collapse spacing (e.g. by all items advancing at the same rate
      // from a stale identical renderedArc).
      for (let f = 0; f < 10; f++) {
        renderer.update(
          [
            makeBelt(beltBFrom, beltBTo, [
              { id: 'I1', position: slotsB[0] },
              { id: 'I2', position: slotsB[1] },
              { id: 'I3', position: slotsB[2] },
            ]),
          ],
          GRID_W,
          GRID_H,
          DT,
          false,
        )
      }

      const q0 = pos2D(renderer, 0)
      const q1 = pos2D(renderer, 1)
      const q2 = pos2D(renderer, 2)
      const finalSpacing01 = dist2D(q1, q0)
      const finalSpacing12 = dist2D(q2, q1)

      const tolFactor = 0.05
      expect(
        Math.abs(finalSpacing01 - initialSpacing01) / initialSpacing01,
        `spacing item0→item1 changed from ${initialSpacing01.toFixed(4)} to ` +
          `${finalSpacing01.toFixed(4)} (>${(tolFactor * 100).toFixed(0)}% drift)`,
      ).toBeLessThan(tolFactor)
      expect(
        Math.abs(finalSpacing12 - initialSpacing12) / initialSpacing12,
        `spacing item1→item2 changed from ${initialSpacing12.toFixed(4)} to ` +
          `${finalSpacing12.toFixed(4)} (>${(tolFactor * 100).toFixed(0)}% drift)`,
      ).toBeLessThan(tolFactor)
    })
  })

  /**
   * P3 — Migrated items never move backward along the new belt's arc
   * length after the migration frame.
   */
  describe('P3 — migrated item does not move backward after migration frame', () => {
    it('rendered arc length on beltB is monotonically non-decreasing for 30 frames', () => {
      const beltAFrom = { x: 1, z: 0 }
      const beltATo = { x: 2, z: 0 }
      const beltBFrom = { x: 1, z: 5 }
      const beltBTo = { x: 2, z: 5 }

      // Seed and run several frames on beltA at a fixed slot so
      // renderedArc accumulates ahead of truth (worst case for the
      // cross-belt overshoot logic).
      renderer.update(
        [makeBelt(beltAFrom, beltATo, [{ id: 'X', position: 0.5 }])],
        GRID_W,
        GRID_H,
        0,
        false,
      )
      for (let i = 0; i < 15; i++) {
        renderer.update(
          [makeBelt(beltAFrom, beltATo, [{ id: 'X', position: 0.5 }])],
          GRID_W,
          GRID_H,
          DT,
          false,
        )
      }

      // Migrate to beltB at slot 0.4. Then advance 30 frames with truth
      // increasing by ~speed*dt each frame.
      let slot = 0.4
      // Migration frame.
      renderer.update(
        [makeBelt(beltBFrom, beltBTo, [{ id: 'X', position: slot }])],
        GRID_W,
        GRID_H,
        DT,
        false,
      )

      // Reference axis: beltB's straight runs along +x, so arc-length
      // along beltB ≡ (worldX - beltBFromWorldX). We monitor that.
      const beltBStartWorld = expectedWorldAt(beltBFrom, beltBTo, 0)
      const arcOf = (p: { x: number; z: number }): number => p.x - beltBStartWorld.x

      const arcs: number[] = [arcOf(pos2D(renderer, 0))]
      for (let i = 0; i < 30; i++) {
        slot += SPEED * DT
        if (slot > 1) slot = 1
        renderer.update(
          [makeBelt(beltBFrom, beltBTo, [{ id: 'X', position: slot }])],
          GRID_W,
          GRID_H,
          DT,
          false,
        )
        arcs.push(arcOf(pos2D(renderer, 0)))
      }

      for (let i = 1; i < arcs.length; i++) {
        const delta = arcs[i] - arcs[i - 1]
        expect(
          delta,
          `frame ${i}: backward step Δarc=${delta.toFixed(6)} ` +
            `(arc[${i - 1}]=${arcs[i - 1].toFixed(4)} → arc[${i}]=${arcs[i].toFixed(4)})`,
        ).toBeGreaterThan(-1e-4)
      }
    })
  })

  /**
   * P4 — Regression guard: items that stay on the same belt across
   * update calls must keep their existing interpolation behavior. The
   * migration fix must not perturb the same-belt code path.
   *
   * Setup: seed item on beltA, advance several frames so renderedArc
   * sits slightly ahead of truth (the existing lead). Then call
   * update() again with the SAME beltA (no migration). The lead must
   * not be reset to zero, nor explode — it should evolve under the
   * existing lead-close rules (within ±LEAD_HORIZON of where it was).
   */
  describe('P4 — same-belt updates keep existing interpolation behavior', () => {
    it('rendered lead over truth is preserved across same-belt updates', () => {
      const beltAFrom = { x: 1, z: 0 }
      const beltATo = { x: 2, z: 0 }

      renderer.update(
        [makeBelt(beltAFrom, beltATo, [{ id: 'X', position: 0.3 }])],
        GRID_W,
        GRID_H,
        0,
        false,
      )

      // Build a small lead by running render frames while truth holds.
      for (let i = 0; i < 5; i++) {
        renderer.update(
          [makeBelt(beltAFrom, beltATo, [{ id: 'X', position: 0.3 }])],
          GRID_W,
          GRID_H,
          DT,
          false,
        )
      }

      const truthA = expectedWorldAt(beltAFrom, beltATo, 0.3)
      const beforePos = pos2D(renderer, 0)
      const leadBefore = beforePos.x - truthA.x // beltA runs along +x

      // The renderer should have moved slightly ahead of truth.
      expect(
        leadBefore,
        `pre-condition: expected renderedArc to lead truth on same belt; got lead=${leadBefore.toFixed(4)}`,
      ).toBeGreaterThan(0)

      // Continue same-belt updates; lead should remain bounded and
      // monotone (within a small tolerance of the prior frame).
      for (let i = 0; i < 5; i++) {
        renderer.update(
          [makeBelt(beltAFrom, beltATo, [{ id: 'X', position: 0.3 }])],
          GRID_W,
          GRID_H,
          DT,
          false,
        )
      }
      const afterPos = pos2D(renderer, 0)
      const leadAfter = afterPos.x - truthA.x

      // The lead must not have collapsed to ~0 (no spurious reset
      // applied by a migration-handling branch). It is allowed to
      // grow modestly under the existing lead-close convergence.
      expect(
        leadAfter,
        `same-belt continuation: lead collapsed unexpectedly ` +
          `(leadBefore=${leadBefore.toFixed(4)}, leadAfter=${leadAfter.toFixed(4)})`,
      ).toBeGreaterThan(leadBefore * 0.5)
    })
  })
})
