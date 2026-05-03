import * as THREE from 'three'
import type { ItemType } from '../game/types'
import { sampleBeltPath, buildBeltPath, type PathPoint } from './BeltPath'
import { BeltTopologyCache, type BeltLike } from './BeltTopologyCache'
import { ITEM_COLORS } from './ItemColors'
import {
  beltKeyOf,
  resolveCrossBeltCarry,
  resolvePausedArc,
  resolveSameBeltAdvance,
  resolveSeedArc,
  type BeltRenderData,
  type ItemRenderState,
  type PathInfo,
  type RenderArcResolution,
} from './ItemArcResolver'

// Re-export public types so existing callers that import them from
// `./ItemRenderer` keep working after the topology / arc-resolver split.
export type { BeltRenderData } from './ItemArcResolver'
export type { BeltLike } from './BeltTopologyCache'

const MAX_INSTANCES = 512

export class ItemRenderer {
  private scene: THREE.Scene
  private meshes: Map<ItemType, THREE.InstancedMesh> = new Map()
  private geometry: THREE.SphereGeometry
  private materials: Map<ItemType, THREE.MeshStandardMaterial> = new Map()
  private tempMatrix = new THREE.Matrix4()
  private tempPosition = new THREE.Vector3()
  private outPoint: PathPoint = { x: 0, z: 0 }
  private readonly topologyCache: BeltTopologyCache = new BeltTopologyCache()
  /** Per-item render state keyed by `Item.id`; pruned each `update`. */
  private itemStates: Map<string, ItemRenderState> = new Map()
  private seenIds: Set<string> = new Set()

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.geometry = new THREE.SphereGeometry(0.1, 8, 6)

    for (const [type, color] of Object.entries(ITEM_COLORS) as Array<
      [ItemType, number]
    >) {
      const material = new THREE.MeshStandardMaterial({ color })
      this.materials.set(type, material)

      const mesh = new THREE.InstancedMesh(this.geometry, material, MAX_INSTANCES)
      mesh.count = 0
      mesh.castShadow = true
      // InstancedMesh auto-computes its bounding sphere from the BASE
      // geometry only — a tiny sphere near origin (~0.15 r). With
      // `frustumCulled = true` (default), Three.js culls the entire
      // instanced mesh whenever that origin sphere is offscreen, even
      // though the actual instances are spread across the grid. The
      // shadow pass uses a different frustum (the directional light's),
      // so shadows still rasterise — items disappear, shadows linger.
      // Disabling frustum culling is the simplest correct fix; the cost
      // is one extra draw call per item type when no instances are on
      // screen, which is negligible for a 20×20 grid.
      mesh.frustumCulled = false
      this.scene.add(mesh)
      this.meshes.set(type, mesh)
    }
  }

  cacheBeltTopology(belts: ReadonlyMap<string, BeltLike>): void {
    this.topologyCache.cache(belts)
  }

  buildRenderData(belts: ReadonlyMap<string, BeltLike>): BeltRenderData[] {
    // Self-heal: mid-simulation Factory edits (machine move/rotate) cause
    // `Factory.attachSimulation` to mint fresh belt entities with new ids
    // that `main.ts` never sees, so they're absent from the topology
    // cache. If the cached id set diverges from the live belt id set,
    // rebuild. Steady-state cost is two size checks plus one `has` per
    // belt (handled inside `topologyCache.needsRebuild`).
    if (this.topologyCache.needsRebuild(belts)) {
      this.topologyCache.cache(belts)
    }

    const result: BeltRenderData[] = []
    for (const cached of this.topologyCache.getSegments()) {
      const belt = belts.get(cached.beltId)
      if (!belt) continue
      result.push({
        from: { x: belt.fromX, z: belt.fromZ },
        to: { x: belt.toX, z: belt.toZ },
        prevSegmentFrom: cached.prevFrom,
        speed: belt.speed,
        items: belt.getItems().map((item) => ({
          id: item.id,
          type: item.type,
          position: item.positionOnBelt,
        })),
      })
    }
    return result
  }

  /**
   * Update item instance matrices.
   *
   * Per-item state is keyed by the simulation `Item.id`. The renderer
   * follows simulation truth directly, dispatching each item to one of
   * four resolver branches in `ItemArcResolver`:
   *
   *   - First sight of an id, or seed-frame (`dt <= 0`): `resolveSeedArc`
   *     snaps `renderedArc` to truth on the current belt.
   *   - Same-belt advance: `resolveSameBeltAdvance` adds `speed * dt * L`,
   *     then clamps to `[truthArc ± speed*SIM_TICK_INTERVAL*L]`
   *     (symmetric ±1-tick bound), monotonic, and capped at the cell
   *     end for back-pressure. The relaxed lower bound matters because
   *     a "snap up to truth" lower bound would, on the frame after a
   *     cross-belt carry-over, recreate the boundary jump the carry-over
   *     was written to eliminate.
   *   - Cross-belt hand-over: `resolveCrossBeltCarry` carries over the
   *     natural advance through the cell boundary so the world-space
   *     step on the hand-over frame stays at `speed * dt * L`. If
   *     `nextArc < 0` the renderer keeps drawing on the OLD belt's
   *     path until a later frame promotes to the new belt. Defensive
   *     guards (chain-adjacency + `carryDistance < 1.5` cells) snap to
   *     truth for non-handover topology changes (Factory edits,
   *     deletions, teleports).
   *   - Paused (`paused === true`): `resolvePausedArc` holds the
   *     previously rendered `renderedArc` / `beltKey` so paused frames
   *     don't visibly yank items.
   *
   * @param dt Optional render-frame delta in seconds. When `<= 0`,
   *           rendered positions snap to simulation truth (used for the
   *           initial seed call).
   * @param paused When `true`, the renderer HOLDS each tracked item's
   *           previously rendered `renderedArc` / `beltKey` instead of
   *           advancing or snapping to truth.
   */
  update(
    belts: ReadonlyArray<BeltRenderData>,
    gridWidth: number,
    gridHeight: number,
    dt: number = 0,
    paused: boolean = false,
  ): void {
    const counts = new Map<ItemType, number>()
    for (const type of this.meshes.keys()) {
      counts.set(type, 0)
    }

    const halfW = gridWidth / 2
    const halfH = gridHeight / 2
    this.seenIds.clear()

    // Path cache to avoid rebuilding the same belt's path twice across
    // ids on the same belt or across the seed and re-evaluation paths.
    const pathCache = new Map<string, PathInfo>()
    const getPathInfo = (k: string, b: BeltRenderData): PathInfo => {
      let info = pathCache.get(k)
      if (!info) {
        const path = buildBeltPath(b.from, b.to, b.prevSegmentFrom, halfW, halfH)
        info = { path, L: path.length }
        pathCache.set(k, info)
      }
      return info
    }

    // Pre-build belt-by-key lookup so the cross-belt carry-over branch
    // can resolve the OLD belt's path even though the iteration below
    // visits belts by their items (and the OLD belt has already lost
    // the item it handed downstream).
    const beltByKey = new Map<string, BeltRenderData>()
    for (const b of belts) {
      beltByKey.set(beltKeyOf(b), b)
    }

    for (const belt of belts) {
      const key = beltKeyOf(belt)
      const info = getPathInfo(key, belt)
      const L = info.L
      const speed = belt.speed ?? 0

      const items = belt.items
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        // Items without a stable id (legacy/test paths) get a per-belt
        // synthetic id so they don't collide across belts.
        const id = item.id ?? `__noid_${key}_${i}`
        this.seenIds.add(id)

        // Sim truth on this belt. Post-tick state is guaranteed to be
        // in [0, 1]; the defensive clamp is a safety net in case a
        // future sim change ever exposes a transient overshoot mid-tick.
        let truth = item.position
        if (truth < 0) truth = 0
        else if (truth > 1) truth = 1
        const truthArc = truth * L

        const prev = this.itemStates.get(id)

        // Dispatch to the appropriate per-frame resolver. `activePath`
        // returned by the cross-belt branch may identify the OLD belt
        // during a multi-frame carry-over (see method JSDoc).
        let resolution: RenderArcResolution
        if (paused && prev && prev.beltKey === key) {
          resolution = resolvePausedArc(prev, key, info)
        } else if (!prev || dt <= 0) {
          resolution = resolveSeedArc(truthArc, key, info)
        } else if (prev.beltKey !== key) {
          resolution = resolveCrossBeltCarry(
            prev,
            belt,
            key,
            info,
            beltByKey,
            getPathInfo,
            truthArc,
            speed,
            dt,
          )
        } else {
          resolution = resolveSameBeltAdvance(prev, key, info, truthArc, speed, dt)
        }

        this.itemStates.set(id, {
          renderedArc: resolution.renderedArc,
          beltKey: resolution.activeBeltKey,
          pathLength: resolution.activePathLength,
        })

        this.writeInstanceMatrix(item.type, resolution, counts)
      }
    }

    this.pruneOrphanedInstances()
    this.commitInstanceCounts(counts)
  }

  /**
   * Sample the active belt path at the resolved arc and write the
   * resulting world position into the next free instance slot for the
   * item's type. Increments `counts[type]`. No-op when the type has no
   * mesh or the per-type pool is exhausted.
   */
  private writeInstanceMatrix(
    type: ItemType,
    resolution: RenderArcResolution,
    counts: Map<ItemType, number>,
  ): void {
    const mesh = this.meshes.get(type)
    if (!mesh) return

    const idx = counts.get(type) ?? 0
    if (idx >= MAX_INSTANCES) return

    const { renderedArc, activePath, activePathLength } = resolution
    const p = activePathLength > 0 ? renderedArc / activePathLength : 0
    sampleBeltPath(activePath, p, this.outPoint)
    this.tempPosition.set(this.outPoint.x, 0.15, this.outPoint.z)
    this.tempMatrix.setPosition(this.tempPosition)
    mesh.setMatrixAt(idx, this.tempMatrix)

    counts.set(type, idx + 1)
  }

  /** Prune state for items not seen this frame (delivered/destroyed). */
  private pruneOrphanedInstances(): void {
    for (const id of this.itemStates.keys()) {
      if (!this.seenIds.has(id)) {
        this.itemStates.delete(id)
      }
    }
  }

  /** Update each per-type mesh's instance count and mark matrices dirty. */
  private commitInstanceCounts(counts: ReadonlyMap<ItemType, number>): void {
    for (const [type, mesh] of this.meshes) {
      const count = counts.get(type) ?? 0
      mesh.count = count
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true
      }
    }
  }

  clear(): void {
    for (const mesh of this.meshes.values()) {
      mesh.count = 0
      mesh.instanceMatrix.needsUpdate = true
    }
    this.itemStates.clear()
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh)
      mesh.dispose()
    }
    this.meshes.clear()

    this.geometry.dispose()

    for (const material of this.materials.values()) {
      material.dispose()
    }
    this.materials.clear()
    this.itemStates.clear()
  }
}
