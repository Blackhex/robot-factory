/**
 * @vitest-environment jsdom
 *
 * Renderer contract guards: no ghost items after a factory edit removes
 * or replaces belts during a running simulation.
 *
 * Companion to `tests/unit/game/FactoryItemMigration.test.ts`. These
 * tests exercise `ItemRenderer.update()` directly with hand-built
 * `BeltRenderData` so they don't depend on game-side migration logic.
 *
 * Tests:
 *   G1 — When the belts list shrinks to empty, every InstancedMesh count
 *        is reset to 0. Renderer derives counts only from items it sees
 *        this frame, so an empty belts list yields 0.
 *   G2 — When the same item id moves from belt A (slot 0.5) to belt B
 *        (slot 0.2), the rendered position is sampled from belt B's path,
 *        NOT belt A's stale path.
 *   G3 — When belts are swapped (different ids, with no items on the new
 *        ones), no orphan instance remains in mesh.count.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  ItemRenderer,
  type BeltLike,
  type BeltRenderData,
} from '../../../src/rendering/ItemRenderer'
import type { ItemType } from '../../../src/game/types'

const GRID_W = 10
const GRID_H = 10
const ITEM_TYPE: ItemType = 'wheel_small'

function readMeshCount(renderer: ItemRenderer, type: ItemType): number {
  const meshes = (renderer as unknown as {
    meshes: Map<ItemType, THREE.InstancedMesh>
  }).meshes
  return meshes.get(type)?.count ?? 0
}

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
 * Build a single-segment belt render data with one item.
 */
function makeBelt(
  from: { x: number; z: number },
  to: { x: number; z: number },
  itemId: string | undefined,
  position: number,
): BeltRenderData {
  return {
    from,
    to,
    items:
      itemId !== undefined
        ? [{ id: itemId, type: ITEM_TYPE, position }]
        : [],
  }
}

describe('ItemRenderer — no ghost items after factory edit', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  describe('G1 — items on a removed belt are not rendered', () => {
    it('mesh.count drops to 0 when the belts list becomes empty', () => {
      // GIVEN: seed with one belt holding one item.
      renderer.update(
        [makeBelt({ x: 1, z: 0 }, { x: 2, z: 0 }, 'X', 0.5)],
        GRID_W,
        GRID_H,
        0,
        false,
      )
      expect(readMeshCount(renderer, ITEM_TYPE)).toBe(1)

      // WHEN: belts list goes empty (the belt was removed).
      renderer.update([], GRID_W, GRID_H, 0.0167, false)

      // THEN: every mesh count is 0 — no ghost instance remains.
      const meshes = (renderer as unknown as {
        meshes: Map<ItemType, THREE.InstancedMesh>
      }).meshes
      for (const mesh of meshes.values()) {
        expect(mesh.count).toBe(0)
      }
    })
  })

  describe('G2 — migrated item renders at the new belt position', () => {
    it('item id moved to a new belt is sampled from the NEW belt path, not the old one', () => {
      // GIVEN: seed item X at belt A position 0.5. Belt A goes from
      // (1,0) to (2,0), so the rendered point should sit roughly at the
      // mid-cell of (1,0)→(2,0).
      const beltA = makeBelt({ x: 1, z: 0 }, { x: 2, z: 0 }, 'X', 0.5)
      renderer.update([beltA], GRID_W, GRID_H, 0, false)
      expect(readMeshCount(renderer, ITEM_TYPE)).toBe(1)
      const posA = readInstancePosition(renderer, ITEM_TYPE, 0).clone()

      // WHEN: edit replaces belt A with belt B. Belt B has the SAME id
      // for the carried item but its path is far away ((5,5)→(6,5)).
      // Use dt=0 so the renderer snaps to truth (no interpolation
      // residue from belt A).
      const beltB = makeBelt({ x: 5, z: 5 }, { x: 6, z: 5 }, 'X', 0.2)
      renderer.update([beltB], GRID_W, GRID_H, 0, false)

      // THEN: exactly one instance is drawn.
      expect(readMeshCount(renderer, ITEM_TYPE)).toBe(1)

      // THEN: the new world position is on belt B's path, NOT belt A's.
      const posB = readInstancePosition(renderer, ITEM_TYPE, 0).clone()
      // Belt B is around world (5,5) area; belt A around (1,0).
      // Distance from old position must be substantial.
      const delta = posB.distanceTo(posA)
      expect(
        delta,
        `instance still rendered near old belt A position (delta=${delta.toFixed(3)})`,
      ).toBeGreaterThan(2.0)
    })
  })

  describe('G3 — after edit replaces belts entirely, no orphan instance remains', () => {
    it('mesh.count reflects only items present on the new belts list', () => {
      // GIVEN: seed three items on belt A.
      const beltA: BeltRenderData = {
        from: { x: 1, z: 0 },
        to: { x: 2, z: 0 },
        items: [
          { id: 'A1', type: ITEM_TYPE, position: 0.2 },
          { id: 'A2', type: ITEM_TYPE, position: 0.5 },
          { id: 'A3', type: ITEM_TYPE, position: 0.8 },
        ],
      }
      renderer.update([beltA], GRID_W, GRID_H, 0, false)
      expect(readMeshCount(renderer, ITEM_TYPE)).toBe(3)

      // WHEN: edit replaces belt A with belt B carrying NO items.
      const beltB: BeltRenderData = {
        from: { x: 5, z: 5 },
        to: { x: 6, z: 5 },
        items: [],
      }
      renderer.update([beltB], GRID_W, GRID_H, 0.0167, false)

      // THEN: nothing is rendered — no orphan instance survives.
      expect(readMeshCount(renderer, ITEM_TYPE)).toBe(0)
    })
  })

  /**
   * G4 — Items on a belt whose id is NOT in the renderer's topology
   * cache must still render correctly at the item's slot fraction on
   * that belt's path.
   *
   * This is the actual UX-reported regression: after live-edit
   * (moveMachine / rotateMachine mid-sim) the simulation creates new
   * belt entities with brand-new ids. The renderer's `cacheBeltTopology`
   * was only invoked at sim-populate time, so new ids are unknown to the
   * topology cache, and items on those belts must NOT be silently
   * skipped or rendered at a stale position.
   *
   * Acceptance: the renderer self-heals — it builds topology for the
   * new belt on the fly inside `update()`. We do NOT call
   * `cacheBeltTopology` between the two updates.
   */
  describe('G4 — items on belt with id missing from topology cache render correctly', () => {
    it('item migrated to a brand-new belt renders at the new belt slot, not at start/origin', () => {
      // GIVEN: seed item X on beltA at slot 0.5. We deliberately do
      // NOT call `cacheBeltTopology` — the renderer must work from the
      // raw `BeltRenderData` passed to `update()`.
      const beltA = makeBelt({ x: 1, z: 0 }, { x: 2, z: 0 }, 'X', 0.5)
      renderer.update([beltA], GRID_W, GRID_H, 0, false)
      expect(readMeshCount(renderer, ITEM_TYPE)).toBe(1)

      // WHEN: live-edit replaces beltA with beltB (different path,
      // same item id, slot 0.2). Use a non-zero render dt so the
      // renderer takes the "advance" branch — it must self-heal
      // topology for beltB and place the item at beltB's path[0.2],
      // NOT pin it at beltB.from (overshoot=0 fallback) or skip it.
      const beltB = makeBelt({ x: 5, z: 5 }, { x: 6, z: 5 }, 'X', 0.2)
      renderer.update([beltB], GRID_W, GRID_H, 0.0167, false)

      // THEN: exactly one instance is drawn for the item type.
      expect(readMeshCount(renderer, ITEM_TYPE)).toBe(1)

      // THEN: the rendered world position is sampled at beltB's slot
      // fraction (0.2), not at beltB.from (0.0) and not at beltA's
      // stale position. We compare against the expected world point
      // along beltB's straight from (5,5) to (6,5): grid->world maps
      // grid (gx, gz) to world (gx - halfW + 0.5, gz - halfH + 0.5)
      // for cell centers; for from/to corners we use the grid coords
      // directly minus halves. With GRID_W=GRID_H=10, beltB straight
      // segment runs through approximately x∈[-4..-3], z=0 in world
      // space. The sample at fraction 0.2 must be on that line.
      const pos = readInstancePosition(renderer, ITEM_TYPE, 0)

      // Expected: somewhere on the world segment between
      // world(5,5) and world(6,5) at fraction 0.2 — strictly NOT at
      // either endpoint, and strictly NOT on beltA's line (z≈-4.5).
      const beltAWorldZ = 0 - GRID_H / 2 // beltA was at grid z=0
      const beltBWorldZ = 5 - GRID_H / 2 // beltB is at grid z=5
      // The rendered item must be on (or very near) beltB's z line,
      // not beltA's. If the renderer skipped the item or rendered it
      // at world-origin/zero-arc, this would not hold.
      expect(
        Math.abs(pos.z - beltBWorldZ),
        `item rendered at z=${pos.z.toFixed(3)} is not on beltB (expected z≈${beltBWorldZ})`,
      ).toBeLessThan(0.6)
      expect(Math.abs(pos.z - beltAWorldZ)).toBeGreaterThan(2.0)

      // The slot-fraction (~0.2) along beltB must place the item
      // closer to beltB.from than beltB.to — and substantially away
      // from beltB.from itself (at fraction 0, distance from
      // beltB.from would be ~0; at fraction 0.2 along a unit-length
      // straight, distance ≈ 0.2 in world units). Not zero-pinned.
      const beltBFromWorld = new THREE.Vector3(
        5 - GRID_W / 2,
        0.15,
        5 - GRID_H / 2,
      )
      const distFromBeltBStart = pos.distanceTo(beltBFromWorld)
      expect(
        distFromBeltBStart,
        `item appears pinned at beltB.from (dist=${distFromBeltBStart.toFixed(3)}) — likely overshoot=0 fallback`,
      ).toBeGreaterThan(0.05)
    })
  })

  /**
   * G5 — Multiple new belts, none in cache, all render their items.
   *
   * Strengthens G4: even with several brand-new belts, every item on
   * every new belt must produce an instance. No silent skips.
   */
  describe('G5 — multiple new belts with same itemtype, none in topology cache', () => {
    it('every item on every new belt is rendered (mesh.count === total items)', () => {
      // GIVEN: a fresh renderer with no prior state and no
      // cacheBeltTopology call.

      // WHEN: a single update introduces two new belts carrying a
      // total of five items (3 on beltA, 2 on beltB), neither known
      // to a topology cache.
      const beltA: BeltRenderData = {
        from: { x: 1, z: 0 },
        to: { x: 2, z: 0 },
        items: [
          { id: 'A1', type: ITEM_TYPE, position: 0.2 },
          { id: 'A2', type: ITEM_TYPE, position: 0.5 },
          { id: 'A3', type: ITEM_TYPE, position: 0.8 },
        ],
      }
      const beltB: BeltRenderData = {
        from: { x: 5, z: 5 },
        to: { x: 6, z: 5 },
        items: [
          { id: 'B1', type: ITEM_TYPE, position: 0.3 },
          { id: 'B2', type: ITEM_TYPE, position: 0.7 },
        ],
      }
      renderer.update([beltA, beltB], GRID_W, GRID_H, 0.0167, false)

      // THEN: all five items produce an instance. Anything less means
      // the renderer silently dropped items because their belt id was
      // not in the topology cache.
      expect(readMeshCount(renderer, ITEM_TYPE)).toBe(5)
    })
  })

  /**
   * G6 — Strengthens G3: replace beltA (with items) with beltB (a
   * DIFFERENT id, also carrying items of the same itemtype). The
   * count must reflect ONLY the new belt's items — not 0 (renderer
   * dropped them) and not 4 (orphans from beltA bled through).
   */
  describe('G6 — swap belt-with-items for a different belt-with-items', () => {
    it('mesh.count equals the new belt item count after a same-frame swap', () => {
      // GIVEN: seed beltA with 2 items.
      const beltA: BeltRenderData = {
        from: { x: 1, z: 0 },
        to: { x: 2, z: 0 },
        items: [
          { id: 'A1', type: ITEM_TYPE, position: 0.3 },
          { id: 'A2', type: ITEM_TYPE, position: 0.7 },
        ],
      }
      renderer.update([beltA], GRID_W, GRID_H, 0, false)
      expect(readMeshCount(renderer, ITEM_TYPE)).toBe(2)

      // WHEN: a live-edit replaces beltA with beltB (different path)
      // also carrying 2 items, all with brand-new ids. No
      // cacheBeltTopology call is made in between.
      const beltB: BeltRenderData = {
        from: { x: 5, z: 5 },
        to: { x: 6, z: 5 },
        items: [
          { id: 'B1', type: ITEM_TYPE, position: 0.25 },
          { id: 'B2', type: ITEM_TYPE, position: 0.75 },
        ],
      }
      renderer.update([beltB], GRID_W, GRID_H, 0.0167, false)

      // THEN: exactly the new belt's 2 items are rendered. Not 0
      // (silent drop), not 4 (stale beltA orphans bled through).
      expect(readMeshCount(renderer, ITEM_TYPE)).toBe(2)
    })
  })

  /**
   * G7 — Real UX regression: full pipeline (`buildRenderData` →
   * `update`) silently drops items on belts whose id is missing from
   * `cachedSegments`.
   *
   * G4/G5/G6 above call `update()` directly with hand-crafted
   * `BeltRenderData[]`, which bypasses `buildRenderData`'s
   * `cachedSegments` filter. They confirm the renderer's update loop
   * is robust on its own. The actual UX bug is upstream: live-edit
   * (moveMachine / rotateMachine mid-sim) creates new sim belt
   * entities with brand-new ids; `cacheBeltTopology` is only called
   * at sim-populate time; so `buildRenderData` iterates the stale
   * cache, fails the `belts.get(cached.beltId)` lookup, and skips the
   * new belts entirely. `update()` then receives an empty list, sees
   * no items, and the visible item count drops to zero.
   *
   * This test reproduces the bug end-to-end via the public API the
   * caller (main.ts) actually uses.
   */
  describe('G7 — full buildRenderData → update pipeline self-heals on uncached belts', () => {
    /** Minimal `BeltLike` stub for `buildRenderData` / `cacheBeltTopology`. */
    function makeBeltLike(args: {
      id: string
      from: { x: number; z: number }
      to: { x: number; z: number }
      speed: number
      items: Array<{ id: string; type: ItemType; positionOnBelt: number }>
    }): BeltLike {
      return {
        id: args.id,
        fromX: args.from.x,
        fromZ: args.from.z,
        toX: args.to.x,
        toZ: args.to.z,
        speed: args.speed,
        getItems: () => args.items,
      }
    }

    it('items on belts not present in topology cache still reach update() and render', () => {
      // GIVEN: an initial sim with one belt, cached at populate time.
      const initialBelt = makeBeltLike({
        id: 'belt_1_seg0',
        from: { x: 1, z: 0 },
        to: { x: 2, z: 0 },
        speed: 1,
        items: [{ id: 'X', type: ITEM_TYPE, positionOnBelt: 0.5 }],
      })
      const initialMap = new Map<string, BeltLike>([
        [initialBelt.id, initialBelt],
      ])
      renderer.cacheBeltTopology(initialMap)

      // Sanity: through the full pipeline, the seeded item renders.
      const seedData = renderer.buildRenderData(initialMap)
      renderer.update(seedData, GRID_W, GRID_H, 0, false)
      expect(readMeshCount(renderer, ITEM_TYPE)).toBe(1)

      // WHEN: a live-edit replaces the sim's belt entity with a NEW
      // entity (different id, different path) carrying an item — and
      // `cacheBeltTopology` is NOT re-invoked. This is exactly what
      // happens today after `moveMachine` / `rotateMachine` mid-sim.
      const editedBelt = makeBeltLike({
        id: 'belt_3_seg0',
        from: { x: 5, z: 5 },
        to: { x: 6, z: 5 },
        speed: 1,
        items: [{ id: 'Y', type: ITEM_TYPE, positionOnBelt: 0.4 }],
      })
      const editedMap = new Map<string, BeltLike>([
        [editedBelt.id, editedBelt],
      ])

      // Pipeline as main.ts uses it: buildRenderData(sim.getBelts())
      // → update(...).
      const editedData = renderer.buildRenderData(editedMap)
      renderer.update(editedData, GRID_W, GRID_H, 0.0167, false)

      // THEN: the new belt's item is rendered. With the current
      // implementation, `buildRenderData` iterates stale
      // `cachedSegments` (which only knows `belt_1_seg0`), the new
      // belt id is filtered out, `editedData` is empty, and
      // `mesh.count` collapses to 0 — exactly the UX regression
      // ("renderer silently shows zero items").
      expect(
        readMeshCount(renderer, ITEM_TYPE),
        'item on belt with id missing from topology cache was silently dropped by buildRenderData',
      ).toBe(1)
    })
  })
})
