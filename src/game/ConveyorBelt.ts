import type { Item } from './Item.ts'
import type { BeltInfo } from './types.ts'
import { beltPathSegmentLengths } from '../utils/BeltGeometry.ts'

export class ConveyorBelt {
  readonly id: string
  readonly fromX: number
  readonly fromZ: number
  readonly toX: number
  readonly toZ: number
  speed: number
  /**
   * World-arc length of this belt cell. Retained for rendering
   * interpolation but NOT used in `advance()` or handover — the
   * simulation uses uniform cell time (every cell traversed in the
   * same number of ticks regardless of arc length).
   * See src/utils/BeltGeometry.ts.
   */
  readonly length: number
  private items: Item[] = []

  constructor(
    id: string,
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    speed = 1.0,
    length = 1.0,
  ) {
    this.id = id
    this.fromX = fromX
    this.fromZ = fromZ
    this.toX = toX
    this.toZ = toZ
    this.speed = speed
    this.length = length
  }

  /**
   * Build the per-cell `ConveyorBelt` segments for a `BeltInfo`. One
   * segment per `path[i] → path[i+1]` step, with the per-cell arc length
   * computed via `beltPathSegmentLengths` and ids `${belt.id}_seg${i}`.
   * Centralizes segment construction so call sites in `GameManager` and
   * `FactorySimulationSync` cannot drift apart.
   */
  static fromBeltInfo(belt: BeltInfo, speed = 1.0): ConveyorBelt[] {
    const segLengths = beltPathSegmentLengths(belt.path)
    const segments: ConveyorBelt[] = []
    for (let i = 0; i < belt.path.length - 1; i++) {
      segments.push(
        new ConveyorBelt(
          `${belt.id}_seg${i}`,
          belt.path[i].x,
          belt.path[i].z,
          belt.path[i + 1].x,
          belt.path[i + 1].z,
          speed,
          segLengths[i],
        ),
      )
    }
    return segments
  }

  /**
   * Look up the speed of a logical user-drawn belt in a Simulation, regardless
   * of whether it is stored as a single belt (exact id) or as multi-cell
   * segments under ids `${logicalId}_seg${N}` (see `fromBeltInfo`). Segments
   * are kept uniform by `Simulation.executeCommand` for SET_BELT_SPEED, so
   * probing seg0 is representative.
   *
   * Returns the speed if found; otherwise the provided default (1.0).
   */
  static getBeltSpeedByLogicalId(
    sim: { getBelt(id: string): { speed: number } | undefined },
    logicalId: string,
    defaultSpeed = 1,
  ): number {
    return sim.getBelt(`${logicalId}_seg0`)?.speed
        ?? sim.getBelt(logicalId)?.speed
        ?? defaultSpeed
  }

  addItem(item: Item): boolean {
    // One-item-per-cell contract: each ConveyorBelt instance models a
    // single cell-to-cell segment and may hold at most one item at a time.
    if (this.items.length > 0) return false
    item.positionOnBelt = 0
    this.items.push(item)
    this.sortItems()
    return true
  }

  advance(dt = 0.1): void {
    // Uniform cell time: every cell is traversed in the same time
    // regardless of arc length. At speed 1, each cell takes 10 ticks.
    const factor = this.speed * dt
    for (const item of this.items) {
      // A1 drift cap: once an item has reached or passed 1.0 it is
      // awaiting handover/delivery — do NOT advance it again, otherwise
      // back-pressure on a downstream cell allows position to grow
      // unboundedly (probe-observed pos=11.50 at tick 200 in old code).
      if (item.positionOnBelt >= 1.0) continue
      item.positionOnBelt += factor
    }
  }

  getReadyItems(): ReadonlyArray<Item> {
    // Use a tiny tolerance so cumulative float drift in `advance()` (e.g.
    // 10 successive additions of 0.1 summing to 0.9999...) doesn't delay
    // the boundary handover by one tick. Anything within 1e-9 of 1.0 is
    // treated as "at the end".
    return this.items.filter((item) => item.positionOnBelt >= 1.0 - 1e-9)
  }

  /**
   * Accept an item handed over from an upstream belt, preserving any
   * overshoot beyond the upstream cell as a plain normalized position
   * (cell-fraction). Returns false if the cell is occupied.
   */
  acceptHandover(item: Item, overshoot: number): boolean {
    if (this.items.length > 0) return false
    const positionOnBelt = Math.max(
      0,
      Math.min(overshoot, 1 - Number.EPSILON),
    )
    item.positionOnBelt = positionOnBelt
    this.items.push(item)
    return true
  }

  removeItem(itemId: string): boolean {
    const idx = this.items.findIndex((item) => item.id === itemId)
    if (idx === -1) return false
    this.items.splice(idx, 1)
    return true
  }

  /** Remove all items from the belt. */
  clear(): void {
    this.items.length = 0
  }

  /**
   * Insert an existing item at a specific fractional position. Returns
   * `false` (without modifying state) if the belt is already occupied,
   * since each segment may hold at most one item under the
   * one-item-per-cell contract.
   */
  insertItemAt(item: Item, positionOnBelt: number): boolean {
    if (this.items.length > 0) return false
    item.positionOnBelt = Math.max(0, Math.min(1, positionOnBelt))
    this.items.push(item)
    this.sortItems()
    return true
  }

  getItems(): ReadonlyArray<Item> {
    return this.items
  }

  getItemCount(): number {
    return this.items.length
  }

  isEmpty(): boolean {
    return this.items.length === 0
  }

  private sortItems(): void {
    this.items.sort((a, b) => a.positionOnBelt - b.positionOnBelt)
  }
}
