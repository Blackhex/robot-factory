import type { Item } from './Item.ts'
import type { BeltInfo } from './types.ts'
import { beltPathSegmentLengths } from '../utils/BeltGeometry.ts'
import {
  BELT_CELL_CAPACITY,
  BELT_FP_DRIFT_EPS,
  BELT_MIN_ITEM_SPACING,
} from '../utils/BeltFlowInvariants.ts'

export class ConveyorBelt {
  /**
   * Per-cell capacity contract: each cell holds up to `CELL_CAPACITY`
   * items, and any two items on the same cell must be at least
   * `MIN_ITEM_SPACING` apart (so visuals never overlap and back-pressure
   * is well-defined).
   */
  static readonly CELL_CAPACITY = BELT_CELL_CAPACITY
  static readonly MIN_ITEM_SPACING = BELT_MIN_ITEM_SPACING

  /**
   * Float-drift tolerance for "at end of cell" / "spacing boundary"
   * comparisons. Used to decide when an item has reached the cell exit
   * or when a candidate placement clears the minimum-spacing rule,
   * despite cumulative `+= speed * dt` and `frontPos - MIN_ITEM_SPACING`
   * accumulating IEEE-754 drift (e.g. `10 × 0.1 = 0.9999999999999999`,
   * `0.6 - 0.5 = 0.09999999999999998`).
   */
  static readonly FP_DRIFT_EPS = BELT_FP_DRIFT_EPS

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
   * Build a per-cell segment id from a logical belt id and a segment index.
   * Centralizes the `${logicalId}_seg${N}` convention so callers don't
   * reinvent it via template literals.
   */
  static segmentIdFor(logicalId: string, segmentIndex: number): string {
    return `${logicalId}_seg${segmentIndex}`
  }

  /**
   * Parse a per-cell segment id back into its logical id and segment index.
   * Returns `null` for ids that do not match the `${logicalId}_seg${N}`
   * convention (no `_seg` suffix, missing number, negative numbers, decimals).
   * Uses a greedy capture so logical ids that themselves contain underscores
   * are preserved (e.g. `weird_id_with_underscores_seg7`).
   */
  static parseSegmentId(
    id: string,
  ): { logicalId: string; segmentIndex: number } | null {
    const match = id.match(/^(.+)_seg(\d+)$/)
    if (!match) return null
    return { logicalId: match[1], segmentIndex: parseInt(match[2], 10) }
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

  /**
   * Pure predicate: can a new item be placed at `positionOnBelt` on a cell
   * whose current items occupy `occupiedPositions`, under the per-cell
   * capacity contract (up to `CELL_CAPACITY` items, separated by at least
   * `MIN_ITEM_SPACING`)?
   *
   * Exposed as a static so the migration planner can ask the same question
   * against a list of planned positions without first materializing items.
   */
  static canFitAt(
    occupiedPositions: readonly number[],
    positionOnBelt: number,
  ): boolean {
    if (occupiedPositions.length >= ConveyorBelt.CELL_CAPACITY) return false
    for (const p of occupiedPositions) {
      // Uses ConveyorBelt.FP_DRIFT_EPS for the same drift tolerance
      // applied across this file's boundary predicates. Without it,
      // the back item stored as 0.4999999999999999 would cause
      // `addItem(item, 0)` to wrongly reject — producing an asymmetric
      // machine-injection cadence and alternating 0.500/0.600
      // inter-item gaps in steady-state cap-2 streams.
      if (
        Math.abs(p - positionOnBelt) <
        ConveyorBelt.MIN_ITEM_SPACING - ConveyorBelt.FP_DRIFT_EPS
      ) {
        return false
      }
    }
    return true
  }

  /**
   * Place a freshly-emitted item at position 0. Subject to the per-cell
   * capacity contract: returns `false` (without modifying state) if the
   * cell already holds `CELL_CAPACITY` items or any existing item is
   * within `MIN_ITEM_SPACING` of position 0.
   */
  addItem(item: Item): boolean {
    if (!this.hasSpaceAt(0)) return false
    item.positionOnBelt = 0
    this.items.push(item)
    this.sortItems()
    return true
  }

  advance(dt = 0.1): void {
    // Uniform cell time: every cell is traversed in the same time
    // regardless of arc length. At speed 1, each cell takes 10 ticks.
    //
    // Iterate items in DESCENDING positionOnBelt order (front-most
    // first) so the spacing cap for each item is the freshly-advanced
    // position of the item ahead of it. The front-most item has no
    // spacing cap (only the existing A1 drift cap at >= 1.0).
    const factor = this.speed * dt
    this.sortItems() // ascending; items[items.length - 1] is front-most
    let frontPos = Number.POSITIVE_INFINITY
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]
      // Drift cap: any item within ConveyorBelt.FP_DRIFT_EPS of 1.0 is
      // considered "at the end" and must NOT be advanced further. Uses
      // ConveyorBelt.FP_DRIFT_EPS for the same drift tolerance applied
      // across this file's boundary predicates, so this cap and
      // getReadyItems() agree about which items are ready for delivery.
      if (item.positionOnBelt >= 1.0 - ConveyorBelt.FP_DRIFT_EPS) {
        frontPos = item.positionOnBelt
        continue
      }
      const desired = item.positionOnBelt + factor
      const cap = frontPos - ConveyorBelt.MIN_ITEM_SPACING
      // Never move backwards: if cap < current (only reachable after a
      // manual insertItemAt that placed items closer than MIN_SPACING
      // would normally allow — defensive only), keep current.
      const nextPos = Math.min(desired, cap)
      item.positionOnBelt = Math.max(item.positionOnBelt, nextPos)
      frontPos = item.positionOnBelt
    }
  }

  getReadyItems(): ReadonlyArray<Item> {
    // Uses ConveyorBelt.FP_DRIFT_EPS for the same drift tolerance applied
    // across this file's boundary predicates, so cumulative float drift
    // in `advance()` doesn't delay the boundary handover by one tick.
    return this.items.filter(
      (item) => item.positionOnBelt >= 1.0 - ConveyorBelt.FP_DRIFT_EPS,
    )
  }

  /**
   * Accept an item handed over from an upstream belt, preserving any
   * overshoot beyond the upstream cell as a plain normalized position
   * (cell-fraction). Subject to the per-cell capacity contract: returns
   * `false` (without modifying state) if the cell already holds
   * `CELL_CAPACITY` items or any existing item is within
   * `MIN_ITEM_SPACING` of the projected position.
   */
  acceptHandover(item: Item, overshoot: number): boolean {
    const positionOnBelt = Math.max(
      0,
      Math.min(overshoot, 1 - Number.EPSILON),
    )
    if (!this.hasSpaceAt(positionOnBelt)) return false
    item.positionOnBelt = positionOnBelt
    this.items.push(item)
    this.sortItems()
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
   * Insert an existing item at a specific fractional position (clamped
   * to `[0, 1]`). Subject to the per-cell capacity contract: returns
   * `false` (without modifying state) if the cell already holds
   * `CELL_CAPACITY` items or any existing item is within
   * `MIN_ITEM_SPACING` of the clamped position.
   */
  insertItemAt(item: Item, positionOnBelt: number): boolean {
    const clamped = Math.max(0, Math.min(1, positionOnBelt))
    if (!this.hasSpaceAt(clamped)) return false
    item.positionOnBelt = clamped
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

  private hasSpaceAt(positionOnBelt: number): boolean {
    return ConveyorBelt.canFitAt(
      this.items.map((item) => item.positionOnBelt),
      positionOnBelt,
    )
  }
}
