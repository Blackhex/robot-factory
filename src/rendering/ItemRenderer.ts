import * as THREE from 'three'
import type { ItemType } from '../game/types'
import { buildBeltPath, sampleBeltPath, type PathPoint } from './BeltPath'

export interface BeltRenderData {
  from: { x: number; z: number }
  to: { x: number; z: number }
  prevSegmentFrom?: { x: number; z: number }
  /** Belt fraction per second (used for render-time interpolation). */
  speed?: number
  items: ReadonlyArray<{ id?: string; type: ItemType; position: number }>
}

/** Minimal belt interface so we don't import ConveyorBelt directly. */
export interface BeltLike {
  readonly id: string
  readonly fromX: number
  readonly fromZ: number
  readonly toX: number
  readonly toZ: number
  readonly speed: number
  getItems(): ReadonlyArray<{ id: string; type: ItemType; positionOnBelt: number }>
}

interface CachedSegmentInfo {
  beltId: string
  prevFrom: { x: number; z: number } | undefined
}

/**
 * Renderer-global per-item state, keyed by stable `Item.id`.
 *
 * `renderedArc` is in arc-length units on the path identified by
 * `beltKey` (∈ [0, pathLength]). NOTE: during a multi-frame cross-belt
 * hand-over, `beltKey` may temporarily lag behind the simulator's
 * truth belt — the renderer keeps drawing on the OLD belt's path while
 * its world-space position has not yet crossed the cell boundary, then
 * promotes to the NEW belt once it has. `pathLength` always matches the
 * path identified by `beltKey`.
 *
 * Renderer follows simulation truth directly: each frame the rendered
 * arc advances at world speed and is clamped within `±1 sim-tick` of
 * truth on the current belt. Cross-belt hand-overs CARRY OVER the
 * previous frame's natural advance through the boundary so that the
 * world-space step on the hand-over frame stays at exactly
 * `speed * dt * L` (no teleport), instead of snapping to truth on the
 * new belt.
 */
interface ItemRenderState {
  renderedArc: number
  beltKey: string
  pathLength: number
}

/**
 * Sim tick interval in seconds. The renderer is allowed at most one
 * tick of lead over the simulator. Both the per-frame advance and the
 * tick bound are scaled by the cell's path length L, so the rate is
 * `speed * dt * L` and the bound is `speed * SIM_TICK_INTERVAL * L`.
 */
const SIM_TICK_INTERVAL = 0.1

const MAX_INSTANCES = 512

const ITEM_COLORS: Record<ItemType, number> = {
  wheel_small: 0xbbbbbb,
  wheel_medium: 0x999999,
  wheel_large: 0x777777,
  sensor_proximity: 0x44cc44,
  sensor_camera: 0x339933,
  sensor_lidar: 0x66ee66,
  battery_standard: 0xddaa22,
  battery_high_capacity: 0xff8833,
  chassis_light: 0x5588dd,
  chassis_heavy: 0x334488,
  circuit_basic: 0x22cccc,
  circuit_advanced: 0x118888,
  drivetrain_basic: 0xcc8844,
  drivetrain_advanced: 0x886633,
  sensor_array_basic: 0x88ee88,
  sensor_array_advanced: 0x44aa44,
  power_unit_standard: 0xcccc22,
  power_unit_high: 0xeeee44,
  robot_explorer: 0xffcc00,
  robot_worker: 0xff8800,
  robot_guardian: 0xcc4400,
  raw_material: 0xaa8866,
}

/** Canonical belt key formula used to identify the belt path an item is on. */
const beltKeyOf = (b: BeltRenderData): string =>
  `${b.from.x},${b.from.z}->${b.to.x},${b.to.z}`

/**
 * Clamp `arc` to within ±`tickAdvance` of `truthArc` — the
 * renderer's one-sim-tick lead-or-lag bound on the active belt.
 * Centralises the invariant shared by the cross-belt carry-over
 * branch and the same-belt advance branch in `update()`.
 */
const clampToTickInterval = (
  arc: number,
  truthArc: number,
  tickAdvance: number,
): number => {
  const upper = truthArc + tickAdvance
  const lower = truthArc - tickAdvance
  if (arc > upper) return upper
  if (arc < lower) return lower
  return arc
}

export class ItemRenderer {
  private scene: THREE.Scene
  private meshes: Map<ItemType, THREE.InstancedMesh> = new Map()
  private geometry: THREE.SphereGeometry
  private materials: Map<ItemType, THREE.MeshStandardMaterial> = new Map()
  private tempMatrix = new THREE.Matrix4()
  private tempPosition = new THREE.Vector3()
  private outPoint: PathPoint = { x: 0, z: 0 }
  private cachedSegments: CachedSegmentInfo[] = []
  /**
   * Per-item render state keyed by simulation `Item.id`. Stays alive across
   * cross-belt chain hand-offs (the same id may appear on a different belt
   * key on the next frame) and is pruned at the end of each `update` for
   * ids no longer present anywhere.
   */
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
    const chainMap = new Map<string, { belt: BeltLike; segIndex: number }[]>()
    const standalone: string[] = []

    for (const belt of belts.values()) {
      const match = belt.id.match(/^(.+)_seg(\d+)$/)
      if (match) {
        const chainId = match[1]
        const segIndex = parseInt(match[2], 10)
        if (!chainMap.has(chainId)) chainMap.set(chainId, [])
        chainMap.get(chainId)!.push({ belt, segIndex })
      } else {
        standalone.push(belt.id)
      }
    }

    this.cachedSegments = []

    for (const id of standalone) {
      this.cachedSegments.push({
        beltId: id,
        prevFrom: undefined,
      })
    }

    for (const segs of chainMap.values()) {
      segs.sort((a, b) => a.segIndex - b.segIndex)
      for (let i = 0; i < segs.length; i++) {
        const prev = i > 0 ? segs[i - 1].belt : undefined
        this.cachedSegments.push({
          beltId: segs[i].belt.id,
          prevFrom: prev ? { x: prev.fromX, z: prev.fromZ } : undefined,
        })
      }
    }
  }

  buildRenderData(belts: ReadonlyMap<string, BeltLike>): BeltRenderData[] {
    // Self-heal: mid-simulation Factory edits (machine move/rotate) cause
    // `Factory.attachSimulation` to mint fresh belt entities with new ids
    // that `main.ts` never sees, so they're absent from `cachedSegments`.
    // If the cached id set diverges from the live belt id set, rebuild.
    // Steady-state cost is two size checks plus one `has` per belt.
    let needsRebuild = this.cachedSegments.length !== belts.size
    if (!needsRebuild) {
      // Sizes match → verify every cached id still exists in `belts`.
      // Iterating `cachedSegments` and probing `belts.get` avoids a
      // per-frame Set allocation in the steady state.
      for (let i = 0; i < this.cachedSegments.length; i++) {
        if (!belts.has(this.cachedSegments[i].beltId)) {
          needsRebuild = true
          break
        }
      }
    }
    if (needsRebuild) this.cacheBeltTopology(belts)

    const result: BeltRenderData[] = []
    for (const cached of this.cachedSegments) {
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
   * follows simulation truth directly:
   *
   *   - On the first sight of an id, or during a seed-frame
   *     (`dt <= 0`), `renderedArc` snaps to the simulator's truth on
   *     the current belt.
   *   - On same-belt frames, `renderedArc` advances at world speed
   *     (`speed * dt * L`) and is clamped within
   *     `[truthArc − speed*SIM_TICK_INTERVAL*L, truthArc + speed*SIM_TICK_INTERVAL*L]`
   *     so the renderer is never more than one sim tick out of step
   *     with truth on the current belt — in EITHER direction. The
   *     symmetric (relaxed) lower bound replaces the previous
   *     "snap up to truth" behaviour: snapping forward to truth would
   *     undo a recent cross-belt carry-over (see below) and recreate
   *     the very boundary jump this contract was rewritten to remove.
   *   - On a cross-belt hand-over (the simulator just delivered the
   *     item to a downstream belt with overshoot O), the renderer
   *     CARRIES OVER its world-space position rather than snapping to
   *     `O * L_new`. Conceptually:
   *       (a) `prev.renderedArc` on the OLD belt corresponded to a
   *           chain-arc of `prev.renderedArc` (i.e. a distance
   *           `prev.pathLength − prev.renderedArc` SHORT of the
   *           boundary).
   *       (b) Continuing the natural same-belt advance through the
   *           boundary, the renderer's chain-arc one frame later is
   *           `prev.renderedArc + speed * dt * L_new`, which on the
   *           NEW belt is `nextArc = −(prev.pathLength − prev.renderedArc) + speed * dt * L_new`.
   *       (c) If `nextArc ≥ 0`, the renderer has reached or crossed
   *           the boundary in chain-arc terms — render on the NEW
   *           belt at `nextArc`.
   *       (d) If `nextArc < 0`, the renderer has not yet reached the
   *           boundary — render on the OLD belt's path at
   *           `prev.pathLength + nextArc` (= `prev.renderedArc + advance`,
   *           clamped to `[0, prev.pathLength]`). This keeps the
   *           rendered world position on a smooth chain-arc trajectory
   *           even though the simulator has already moved the item to
   *           the new belt; the renderer "promotes" to the new belt
   *           on a subsequent frame once the natural advance carries
   *           it across the boundary.
   *     Both (c) and (d) bound the result by the relaxed
   *     `[truthArc − tickAdvance, truthArc + tickAdvance]` interval so
   *     the renderer can never get more than one sim tick out of step
   *     with truth on the new belt. A defensive guard skips the
   *     carry-over (and snaps to truth on the new belt) if the
   *     pre-frame "distance behind boundary" exceeds 1.5 cells,
   *     which is symptomatic of a non-handover (item destroyed and
   *     re-created elsewhere) rather than a chain step.
   *   - Paused (`paused === true`) holds each tracked item's
   *     previously rendered `renderedArc` / `beltKey` instead of
   *     advancing or snapping, so paused frames don't visibly yank
   *     items.
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
    interface PathInfo {
      path: ReturnType<typeof buildBeltPath>
      L: number
    }
    const pathCache = new Map<string, PathInfo>()
    const getPathInfo = (k: string, b: BeltRenderData): PathInfo => {
      let info = pathCache.get(k)
      if (!info) {
        const path = buildBeltPath(
          b.from,
          b.to,
          b.prevSegmentFrom,
          halfW,
          halfH,
        )
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
        // future sim change ever exposes a transient overshoot mid-
        // tick.
        let truth = item.position
        if (truth < 0) truth = 0
        else if (truth > 1) truth = 1
        const truthArc = truth * L

        const prev = this.itemStates.get(id)

        // Resolved per-frame draw state. `renderedArc` is in arc-length
        // units on `activePath` (length `activePathLength`, identified
        // by `activeBeltKey`). The `active*` belt may be the OLD belt
        // during a multi-frame carry-over (see below).
        let renderedArc: number
        let activeBeltKey: string = key
        let activePath: ReturnType<typeof buildBeltPath> = info.path
        let activePathLength: number = L

        if (paused && prev && prev.beltKey === key) {
          // Hold last rendered position so paused frames don't yank
          // items visually back onto truth.
          renderedArc = prev.renderedArc
          activePathLength = prev.pathLength
        } else if (!prev || dt <= 0) {
          // First sight or seed-frame (dt <= 0): snap to sim truth on
          // the current belt. This branch is also the only place a
          // brand-new id enters tracked state.
          renderedArc = truthArc
        } else if (prev.beltKey !== key) {
          // CROSS-BELT carry-over. Continue the renderer's natural
          // chain-arc trajectory through the cell boundary instead of
          // snapping to truth (= overshoot) on the new belt.
          //
          // The carry-over is only valid for true CHAIN hand-overs (the
          // OLD belt's exit cell is the NEW belt's entry cell). For
          // non-adjacent belt changes — Factory live-edit migrations,
          // belt deletions, item teleports — there is no smooth
          // chain-arc trajectory to continue, so snap to truth on the
          // new belt instead.
          const oldBelt = beltByKey.get(prev.beltKey)
          const isChainHandover =
            oldBelt !== undefined &&
            oldBelt.to.x === belt.from.x &&
            oldBelt.to.z === belt.from.z

          const tickAdvance = speed * SIM_TICK_INTERVAL * L
          const carryDistance = prev.pathLength - prev.renderedArc

          if (
            isChainHandover &&
            carryDistance >= 0 &&
            carryDistance < 1.5
          ) {
            // Natural chain-arc advance from one cell back from the
            // boundary, expressed in NEW-belt arc units.
            let nextArc = -carryDistance + speed * dt * L

            // RELAXED lower bound for the carry-over frame: the
            // renderer is allowed to be up to one sim tick of arc
            // behind truth so the carry-over isn't immediately undone
            // by a snap-to-truth.
            nextArc = clampToTickInterval(nextArc, truthArc, tickAdvance)

            if (nextArc >= 0) {
              // Renderer has reached / crossed the boundary in
              // chain-arc terms — promote to the NEW belt.
              if (nextArc > L) nextArc = L
              renderedArc = nextArc
            } else {
              // Renderer has NOT yet reached the boundary — keep
              // drawing on the OLD belt's path at the chain-arc-
              // equivalent position. This avoids the "park at
              // boundary midpoint" jump that would otherwise occur
              // when `prev.renderedArc < L_old` on the prev frame
              // (the spec's literal "clamp negative to 0" only stays
              // smooth when prev was AT the boundary world position).
              // `oldBelt` is guaranteed non-undefined here because
              // `isChainHandover` requires `oldBelt !== undefined`.
              const oldInfo = getPathInfo(prev.beltKey, oldBelt!)
              let oldArc = prev.pathLength + nextArc
              if (oldArc < 0) oldArc = 0
              if (oldArc > oldInfo.L) oldArc = oldInfo.L
              renderedArc = oldArc
              activeBeltKey = prev.beltKey
              activePath = oldInfo.path
              activePathLength = oldInfo.L
            }
          } else {
            // Defensive: not a chain hand-over (migration / non-
            // adjacent topology change), or distance behind boundary
            // is implausibly large for a chain step. Snap to truth.
            renderedArc = truthArc
          }
        } else {
          // SAME-BELT advance: advance at cell-proportional speed
          // (`speed * dt * L`), then clamp within `±1 sim tick` of
          // truth (RELAXED bound — symmetric, not snap-to-truth).
          // Symmetric bound choice rationale: a tighter
          // `next < truthArc → next = truthArc` lower bound would,
          // on the frame immediately following a cross-belt carry,
          // snap the renderer forward to truth and recreate exactly
          // the boundary jump the carry-over was rewritten to
          // eliminate. Allowing up to one tick of lag is the simplest
          // way to keep the post-handover trajectory smooth without
          // tracking extra "post-carry" state across frames.
          const tickAdvance = speed * SIM_TICK_INTERVAL * L
          let next = prev.renderedArc + speed * dt * L
          next = clampToTickInterval(next, truthArc, tickAdvance)
          // Monotonicity: never pull rendered backward within the same
          // belt.
          if (next < prev.renderedArc) next = prev.renderedArc
          // Don't render past the cell end on a back-pressured belt.
          if (next > L) next = L
          renderedArc = next
        }

        this.itemStates.set(id, {
          renderedArc,
          beltKey: activeBeltKey,
          pathLength: activePathLength,
        })

        const mesh = this.meshes.get(item.type)
        if (!mesh) continue

        const idx = counts.get(item.type) ?? 0
        if (idx >= MAX_INSTANCES) continue

        const p = activePathLength > 0 ? renderedArc / activePathLength : 0
        sampleBeltPath(activePath, p, this.outPoint)
        this.tempPosition.set(this.outPoint.x, 0.15, this.outPoint.z)
        this.tempMatrix.setPosition(this.tempPosition)
        mesh.setMatrixAt(idx, this.tempMatrix)

        counts.set(item.type, idx + 1)
      }
    }

    // Prune state for items not seen this frame (delivered/destroyed).
    for (const id of this.itemStates.keys()) {
      if (!this.seenIds.has(id)) {
        this.itemStates.delete(id)
      }
    }

    // Update mesh counts and mark instance matrices dirty.
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
