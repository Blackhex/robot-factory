import { ConveyorBelt } from '../game/ConveyorBelt'
import type { ItemType } from '../game/types'

/**
 * Minimal belt interface used by the renderer. We import `ConveyorBelt`
 * only for its static segment-id helpers (`parseSegmentId`); the runtime
 * data is still consumed via this structural type so tests and other
 * callers can supply lightweight belt-like objects.
 */
export interface BeltLike {
  readonly id: string
  readonly fromX: number
  readonly fromZ: number
  readonly toX: number
  readonly toZ: number
  readonly speed: number
  getItems(): ReadonlyArray<{ id: string; type: ItemType; positionOnBelt: number }>
}

/**
 * Per-segment topology entry: the live belt id and the previous chain
 * segment's `from` cell (used to bend the belt path through corners).
 * `prevFrom` is `undefined` for the first segment of a chain or for
 * standalone belts that don't follow the `<chainId>_seg<N>` id pattern.
 */
export interface CachedSegmentInfo {
  beltId: string
  prevFrom: { x: number; z: number } | undefined
}

/**
 * Caches the per-belt topology data the `ItemRenderer` reads each frame
 * to build `BeltRenderData`. Owns only the chain ordering + per-segment
 * `prevFrom` cell — the per-cell arc length is recomputed from
 * `buildBeltPath` at draw time and is not part of this cache.
 *
 * The cache is rebuilt whenever the live belt id set diverges from the
 * cached one (live Factory edits mint fresh belt entities with new ids
 * the renderer never saw before).
 */
export class BeltTopologyCache {
  private segments: CachedSegmentInfo[] = []

  /**
   * Rebuild the cache from the given live belt map. Belts whose ids
   * follow the `<chainId>_seg<N>` pattern are grouped by chain id and
   * sorted by segment index so each segment can record the previous
   * segment's `from` cell. Standalone belts get a `prevFrom` of
   * `undefined`.
   */
  cache(belts: ReadonlyMap<string, BeltLike>): void {
    const chainMap = new Map<string, { belt: BeltLike; segIndex: number }[]>()
    const standalone: string[] = []

    for (const belt of belts.values()) {
      const parsed = ConveyorBelt.parseSegmentId(belt.id)
      if (parsed) {
        const { logicalId: chainId, segmentIndex: segIndex } = parsed
        if (!chainMap.has(chainId)) chainMap.set(chainId, [])
        chainMap.get(chainId)!.push({ belt, segIndex })
      } else {
        standalone.push(belt.id)
      }
    }

    this.segments = []

    for (const id of standalone) {
      this.segments.push({
        beltId: id,
        prevFrom: undefined,
      })
    }

    for (const segs of chainMap.values()) {
      segs.sort((a, b) => a.segIndex - b.segIndex)
      for (let i = 0; i < segs.length; i++) {
        const prev = i > 0 ? segs[i - 1].belt : undefined
        this.segments.push({
          beltId: segs[i].belt.id,
          prevFrom: prev ? { x: prev.fromX, z: prev.fromZ } : undefined,
        })
      }
    }
  }

  /** Cached segments in chain order (standalone belts first). */
  getSegments(): ReadonlyArray<CachedSegmentInfo> {
    return this.segments
  }

  /**
   * True if the cached id set diverges from the live belt id set —
   * either the sizes differ, or some cached id is no longer present in
   * `belts`. Steady-state cost is two size checks plus one `has` per
   * cached belt; no per-frame Set allocation.
   */
  needsRebuild(belts: ReadonlyMap<string, BeltLike>): boolean {
    if (this.segments.length !== belts.size) return true
    for (let i = 0; i < this.segments.length; i++) {
      if (!belts.has(this.segments[i].beltId)) return true
    }
    return false
  }
}
