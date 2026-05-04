/**
 * @vitest-environment jsdom
 *
 * Slice 4 contract — defective items must render with a distinct red
 * color while non-defective items keep their per-type color from
 * `ITEM_COLORS`. These tests are intentionally RED until
 * `ItemRenderer` and `ItemColors` are extended:
 *   - `ItemColors.ts` must export a new `DEFECTIVE_ITEM_COLOR` constant
 *     that is distinct from every entry in `ITEM_COLORS`.
 *   - `BeltRenderData.items` entries must carry `isDefective: boolean`,
 *     populated by `ItemRenderer.buildRenderData()` from
 *     `Item.isDefective`.
 *   - `ItemRenderer.update()` must call `setColorAt(idx, color)` on the
 *     per-type `InstancedMesh`, choosing `DEFECTIVE_ITEM_COLOR` for
 *     defective instances and `ITEM_COLORS[type]` for clean ones, so
 *     `mesh.instanceColor` is non-null and `getColorAt(idx, target)`
 *     returns the expected hex per instance.
 *
 * The test exercises the renderer's own `Belt.getItems().map(...)`
 * mapping by passing a real `ConveyorBelt` map through
 * `renderer.buildRenderData(belts)` rather than constructing
 * `BeltRenderData` literals.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ItemRenderer } from '../../../src/rendering/ItemRenderer'
import {
  ITEM_COLORS,
  DEFECTIVE_ITEM_COLOR,
} from '../../../src/rendering/ItemColors'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { createItem } from '../../../src/game/Item'
import type { ItemType } from '../../../src/game/types'

const GRID_W = 20
const GRID_H = 20
const ITEM_TYPE: ItemType = 'wheel_small'
const SEED_DT = 0
const FRAME_DT = 1 / 60

interface Harness {
  scene: THREE.Scene
  renderer: ItemRenderer
  belt: ConveyorBelt
  belts: Map<string, ConveyorBelt>
}

function setup(): Harness {
  const scene = new THREE.Scene()
  const renderer = new ItemRenderer(scene)
  const belt = new ConveyorBelt('belt_test', 0, 0, 1, 0, 1.0)
  const belts = new Map<string, ConveyorBelt>()
  belts.set(belt.id, belt)
  return { scene, renderer, belt, belts }
}

function tickRenderer(h: Harness): void {
  // Real Belt → BeltRenderData mapping path. Seed with dt=0, then run
  // one real frame so the renderer commits per-instance colors.
  h.renderer.cacheBeltTopology(h.belts)
  h.renderer.update(
    h.renderer.buildRenderData(h.belts),
    GRID_W,
    GRID_H,
    SEED_DT,
  )
  h.renderer.update(
    h.renderer.buildRenderData(h.belts),
    GRID_W,
    GRID_H,
    FRAME_DT,
  )
}

function meshFor(renderer: ItemRenderer, type: ItemType): THREE.InstancedMesh {
  const meshes = (renderer as unknown as {
    meshes: Map<ItemType, THREE.InstancedMesh>
  }).meshes
  const mesh = meshes.get(type)
  if (!mesh) throw new Error(`No InstancedMesh for type ${type}`)
  return mesh
}

describe('ItemRenderer defective-item color (Slice 4 contract)', () => {
  describe('A. ItemColors exports DEFECTIVE_ITEM_COLOR', () => {
    it('is a number distinct from every entry in ITEM_COLORS', () => {
      expect(typeof DEFECTIVE_ITEM_COLOR).toBe('number')
      for (const [type, color] of Object.entries(ITEM_COLORS)) {
        expect(
          color,
          `ITEM_COLORS[${type}] must differ from DEFECTIVE_ITEM_COLOR`,
        ).not.toBe(DEFECTIVE_ITEM_COLOR)
      }
    })
  })

  describe('B. defective item renders with DEFECTIVE_ITEM_COLOR', () => {
    let h: Harness
    beforeEach(() => {
      h = setup()
    })

    it('paints instance 0 with DEFECTIVE_ITEM_COLOR', () => {
      const item = createItem(ITEM_TYPE)
      item.isDefective = true
      expect(h.belt.addItem(item)).toBe(true)

      tickRenderer(h)

      const mesh = meshFor(h.renderer, ITEM_TYPE)
      expect(mesh.count).toBeGreaterThanOrEqual(1)
      // instanceColor must be enabled before getColorAt can read it.
      expect(mesh.instanceColor).not.toBeNull()
      const target = new THREE.Color()
      mesh.getColorAt(0, target)
      expect(target.getHex()).toBe(DEFECTIVE_ITEM_COLOR)
    })
  })

  describe('C. non-defective item keeps the per-type color', () => {
    let h: Harness
    beforeEach(() => {
      h = setup()
    })

    it('paints instance 0 with ITEM_COLORS[type]', () => {
      const item = createItem(ITEM_TYPE) // isDefective defaults to false
      expect(item.isDefective).toBe(false)
      expect(h.belt.addItem(item)).toBe(true)

      tickRenderer(h)

      const mesh = meshFor(h.renderer, ITEM_TYPE)
      expect(mesh.count).toBeGreaterThanOrEqual(1)
      expect(mesh.instanceColor).not.toBeNull()
      const target = new THREE.Color()
      mesh.getColorAt(0, target)
      expect(target.getHex()).toBe(ITEM_COLORS[ITEM_TYPE])
    })
  })

  describe('D. mixed defective + clean items of the same type', () => {
    let h: Harness
    beforeEach(() => {
      h = setup()
    })

    it('both per-instance colors appear across indices 0 and 1', () => {
      // Two items of the SAME type on the SAME belt: one defective, one
      // clean. We don't lock which index is which (renderer iterates
      // `belt.items` in stored order, which `ConveyorBelt` keeps sorted
      // ascending by position) — only that both expected colors appear.
      const defective = createItem(ITEM_TYPE)
      defective.isDefective = true
      expect(h.belt.addItem(defective)).toBe(true)
      // Advance the defective item past MIN_ITEM_SPACING so addItem(0)
      // for the clean item below doesn't hit the spacing reject branch.
      defective.positionOnBelt = 0.7

      const clean = createItem(ITEM_TYPE)
      expect(clean.isDefective).toBe(false)
      expect(h.belt.addItem(clean)).toBe(true)

      tickRenderer(h)

      const mesh = meshFor(h.renderer, ITEM_TYPE)
      expect(mesh.count).toBeGreaterThanOrEqual(2)
      expect(mesh.instanceColor).not.toBeNull()
      const c0 = new THREE.Color()
      const c1 = new THREE.Color()
      mesh.getColorAt(0, c0)
      mesh.getColorAt(1, c1)
      const observed = [c0.getHex(), c1.getHex()].sort()
      const expected = [DEFECTIVE_ITEM_COLOR, ITEM_COLORS[ITEM_TYPE]].sort()
      expect(observed).toEqual(expected)
    })
  })

  describe('E. mesh.instanceColor is enabled after update', () => {
    let h: Harness
    beforeEach(() => {
      h = setup()
    })

    it('non-null after the first non-seed update for the affected type', () => {
      expect(h.belt.addItem(createItem(ITEM_TYPE))).toBe(true)

      tickRenderer(h)

      const mesh = meshFor(h.renderer, ITEM_TYPE)
      expect(mesh.instanceColor).not.toBeNull()
    })
  })
})
