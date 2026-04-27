/**
 * Phase 2 RED tests — discrete one-item-per-cell belt migration contract.
 *
 * The new planner contract (rules R1-R10):
 *
 *   - Each captured item lives on exactly ONE old segment, identified by
 *     `segmentIndex` (int, 0..N-1) and `positionOnCell` (float, [0,1]).
 *   - The planner returns:
 *       {
 *         placements: [{ beltId, newSegmentIndex, newPositionOnCell, item }],
 *         dropped:    [{ item, oldSegmentIndex, reason }],
 *         claimedItemIds, slotIdentityMismatchSuppressedItemIds,
 *         remainingInventories
 *       }
 *   - Capacity per destination belt = segmentCount (one item per cell).
 *   - No two placements may share `(beltId, newSegmentIndex)`.
 *   - Coordinator must place every placement (no silent drops) — drops only
 *     happen via the `dropped` array.
 *
 * These tests exercise `planBeltInventoryMigration` directly. They are
 * expected to FAIL against the current planner (which still uses the
 * legacy multi-item-per-cell distribution).
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  planBeltInventoryMigration,
  type BeltInventoryMigrationPlan,
  type CapturedBeltItem,
  type RemovedBeltInventory,
} from '../../../src/game/BeltInventoryMigration'
import { createItem, resetItemIdCounter, type Item } from '../../../src/game/Item'
import type { BeltInfo, GridPosition } from '../../../src/game/types'
import { machine } from './helpers/BeltInventoryMigrationPlannerHelpers'

// ---- local helpers ---------------------------------------------------------

interface CapturedSpec {
  segmentIndex: number
  positionOnCell: number
  item: Item
}

function straightPath(x0: number, z0: number, length: number): GridPosition[] {
  const path: GridPosition[] = []
  for (let i = 0; i < length; i++) path.push({ x: x0 + i, z: z0 })
  return path
}

function lShapedPath(): GridPosition[] {
  // 5 cells (4 segments): (0,0)->(1,0)->(2,0)->(2,1)->(2,2)
  return [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 2, z: 0 },
    { x: 2, z: 1 },
    { x: 2, z: 2 },
  ]
}
void lShapedPath // reserved for future R3 collision-shape variant

function buildBelt(id: string, path: GridPosition[], srcId = 'source', dstId = 'destination'): BeltInfo {
  const src = machine(srcId, path[0].x, path[0].z)
  const dst = machine(dstId, path[path.length - 1].x, path[path.length - 1].z)
  // Override dst type so machine() returns assembler-shaped slots for both endpoints.
  return {
    id,
    name: id,
    sourceMachine: src,
    sourceSlot: 'front',
    destinationMachine: dst,
    destinationSlot: 'back',
    path,
  } as unknown as BeltInfo
}

function buildCaptured(belt: BeltInfo, specs: CapturedSpec[]): RemovedBeltInventory {
  const items: CapturedBeltItem[] = specs.map((s) => {
    const cell = belt.path[s.segmentIndex]
    const captured = {
      cellX: cell.x,
      cellZ: cell.z,
      positionOnBelt: s.positionOnCell,
      // Phase 2 additions — the rewritten planner expects discrete fields.
      segmentIndex: s.segmentIndex,
      positionOnCell: s.positionOnCell,
      item: s.item,
    } as unknown as CapturedBeltItem
    return captured
  })
  return {
    sourceMachineId: belt.sourceMachine.id,
    destinationMachineId: belt.destinationMachine.id,
    sourceSlot: belt.sourceSlot,
    destinationSlot: belt.destinationSlot,
    sourceCellX: belt.path[0].x,
    sourceCellZ: belt.path[0].z,
    destinationCellX: belt.path[belt.path.length - 1].x,
    destinationCellZ: belt.path[belt.path.length - 1].z,
    segmentCount: belt.path.length - 1,
    items,
  }
}

function expectNoDuplicatePlacements(plan: BeltInventoryMigrationPlan): void {
  const seen = new Set<string>()
  for (const p of plan.placements) {
    const key = `${p.beltId}#${(p as unknown as { newSegmentIndex: number }).newSegmentIndex}`
    expect(seen.has(key), `duplicate placement at ${key}`).toBe(false)
    seen.add(key)
  }
}

interface DiscretePlacement {
  beltId: string
  newSegmentIndex: number
  newPositionOnCell: number
  item: Item
}

function placementsByItem(plan: BeltInventoryMigrationPlan): Map<string, DiscretePlacement> {
  const m = new Map<string, DiscretePlacement>()
  for (const p of plan.placements as unknown as DiscretePlacement[]) {
    m.set(p.item.id, p)
  }
  return m
}

interface DroppedEntry {
  item: Item
  oldSegmentIndex: number
  reason: 'capacity' | 'no_match'
}

function droppedOf(plan: BeltInventoryMigrationPlan): DroppedEntry[] {
  return ((plan as unknown as { dropped?: DroppedEntry[] }).dropped) ?? []
}

// ---- tests -----------------------------------------------------------------

describe('planBeltInventoryMigration() — discrete one-item-per-cell contract', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('R1: same path, 3 items — preserves (segmentIndex, positionOnCell) exactly with zero drops', () => {
    const old5 = buildBelt('old', straightPath(0, 0, 5))
    const replacement = buildBelt('repl', straightPath(0, 0, 5))
    const a = createItem('wheel_small')
    const b = createItem('wheel_small')
    const c = createItem('wheel_small')
    const inventory = buildCaptured(old5, [
      { segmentIndex: 0, positionOnCell: 0.1, item: a },
      { segmentIndex: 2, positionOnCell: 0.5, item: b },
      { segmentIndex: 3, positionOnCell: 0.9, item: c }, // last segment of 4 (indices 0..3)
    ])

    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    expect(plan.placements).toHaveLength(3)
    expect(droppedOf(plan)).toHaveLength(0)
    const byItem = placementsByItem(plan)
    expect(byItem.get(a.id)).toMatchObject({ beltId: 'repl', newSegmentIndex: 0, newPositionOnCell: 0.1 })
    expect(byItem.get(b.id)).toMatchObject({ beltId: 'repl', newSegmentIndex: 2, newPositionOnCell: 0.5 })
    expect(byItem.get(c.id)).toMatchObject({ beltId: 'repl', newSegmentIndex: 3, newPositionOnCell: 0.9 })
    expectNoDuplicatePlacements(plan)
  })

  it('R2: same length, different shape — preserves (segmentIndex, positionOnCell), zero drops', () => {
    // 4-cell straight (3 segments) → 4-cell L-shape (3 segments). Same source/dest cells.
    const oldStraight = buildBelt('old', [
      { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 },
    ])
    const replacementL = buildBelt('repl', [
      { x: 0, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 },
    ])
    const itm0 = createItem('wheel_small')
    const itm2 = createItem('wheel_small')
    const inventory = buildCaptured(oldStraight, [
      { segmentIndex: 0, positionOnCell: 0.3, item: itm0 },
      { segmentIndex: 2, positionOnCell: 0.7, item: itm2 },
    ])

    const plan = planBeltInventoryMigration([inventory], [replacementL], true)

    expect(plan.placements).toHaveLength(2)
    expect(droppedOf(plan)).toHaveLength(0)
    const byItem = placementsByItem(plan)
    expect(byItem.get(itm0.id)).toMatchObject({ newSegmentIndex: 0, newPositionOnCell: 0.3 })
    expect(byItem.get(itm2.id)).toMatchObject({ newSegmentIndex: 2, newPositionOnCell: 0.7 })
    expectNoDuplicatePlacements(plan)
  })

  it('R3: longer replacement (3→6 segs) — source-anchored: items keep oldSegmentIndex, extra cells stay empty', () => {
    const old4 = buildBelt('old', straightPath(0, 0, 4)) // 3 segments
    const repl7 = buildBelt('repl', straightPath(0, 0, 7)) // 6 segments
    const a = createItem('wheel_small')
    const b = createItem('wheel_small')
    const c = createItem('wheel_small')
    const inventory = buildCaptured(old4, [
      { segmentIndex: 0, positionOnCell: 0.5, item: a },
      { segmentIndex: 1, positionOnCell: 0.5, item: b },
      { segmentIndex: 2, positionOnCell: 0.5, item: c },
    ])

    const plan = planBeltInventoryMigration([inventory], [repl7], true)

    expect(plan.placements).toHaveLength(3)
    expect(droppedOf(plan)).toHaveLength(0)
    const byItem = placementsByItem(plan)
    expect(byItem.get(a.id)).toMatchObject({ newSegmentIndex: 0, newPositionOnCell: 0.5 })
    expect(byItem.get(b.id)).toMatchObject({ newSegmentIndex: 1, newPositionOnCell: 0.5 })
    expect(byItem.get(c.id)).toMatchObject({ newSegmentIndex: 2, newPositionOnCell: 0.5 })
    expectNoDuplicatePlacements(plan)
  })

  it('R3: longer replacement (4→5 segs) dense — no collisions, zero drops', () => {
    const old5 = buildBelt('old', straightPath(0, 0, 5)) // 4 segments
    const repl6 = buildBelt('repl', straightPath(0, 0, 6)) // 5 segments
    const items = [0, 1, 2, 3].map(() => createItem('wheel_small'))
    const inventory = buildCaptured(old5, items.map((it, i) => ({
      segmentIndex: i, positionOnCell: 0.25, item: it,
    })))

    const plan = planBeltInventoryMigration([inventory], [repl6], true)

    expect(plan.placements).toHaveLength(4)
    expect(droppedOf(plan)).toHaveLength(0)
    const byItem = placementsByItem(plan)
    // floor(i*5/4) = 0,1,2,3
    expect(byItem.get(items[0].id)?.newSegmentIndex).toBe(0)
    expect(byItem.get(items[1].id)?.newSegmentIndex).toBe(1)
    expect(byItem.get(items[2].id)?.newSegmentIndex).toBe(2)
    expect(byItem.get(items[3].id)?.newSegmentIndex).toBe(3)
    expectNoDuplicatePlacements(plan)
  })

  it('R4: shorter replacement (6→3 segs) sparse — source-anchored: items at oldSeg ≥ newSegCount are dropped', () => {
    const old7 = buildBelt('old', straightPath(0, 0, 7)) // 6 segments
    const repl4 = buildBelt('repl', straightPath(0, 0, 4)) // 3 segments
    const a = createItem('wheel_small')
    const b = createItem('wheel_small')
    const c = createItem('wheel_small')
    const inventory = buildCaptured(old7, [
      { segmentIndex: 0, positionOnCell: 0.2, item: a },
      { segmentIndex: 2, positionOnCell: 0.4, item: b },
      { segmentIndex: 4, positionOnCell: 0.6, item: c },
    ])

    const plan = planBeltInventoryMigration([inventory], [repl4], true)

    expect(plan.placements).toHaveLength(2)
    const droppedItems = droppedOf(plan)
    expect(droppedItems).toHaveLength(1)
    expect(droppedItems[0]).toMatchObject({ oldSegmentIndex: 4, reason: 'capacity' })
    expect(droppedItems[0].item.id).toBe(c.id)
    const byItem = placementsByItem(plan)
    // Source-anchored: oldSeg N → newSeg N when N < newSegCount.
    expect(byItem.get(a.id)).toMatchObject({ newSegmentIndex: 0, newPositionOnCell: 0.2 })
    expect(byItem.get(b.id)).toMatchObject({ newSegmentIndex: 2, newPositionOnCell: 0.4 })
    expect(byItem.has(c.id)).toBe(false)
    expectNoDuplicatePlacements(plan)
  })

  it('R4: shorter replacement (5→3 segs) dense — keeps 3 in flow order, drops 2 with reason=capacity', () => {
    // Bug B repro: 5 dense items (one per cell on a 6-cell belt = 5 segments)
    // → 4-cell belt (3 segments). Projected new segs = floor(i*3/5) = 0,0,1,1,2.
    // Resolution: oldSeg 0→0; oldSeg 1→1 (next free after 0); oldSeg 2→2
    // (next free after 1); oldSeg 3,4 → no free segment forward → DROPPED.
    const old6 = buildBelt('old', straightPath(0, 0, 6)) // 5 segments
    const repl4 = buildBelt('repl', straightPath(0, 0, 4)) // 3 segments
    const items = [0, 1, 2, 3, 4].map(() => createItem('wheel_small'))
    const inventory = buildCaptured(old6, items.map((it, i) => ({
      segmentIndex: i, positionOnCell: 0.5, item: it,
    })))

    const plan = planBeltInventoryMigration([inventory], [repl4], true)

    expect(plan.placements).toHaveLength(3)
    expect(droppedOf(plan)).toHaveLength(2)
    const byItem = placementsByItem(plan)
    expect(byItem.get(items[0].id)?.newSegmentIndex).toBe(0)
    expect(byItem.get(items[1].id)?.newSegmentIndex).toBe(1)
    expect(byItem.get(items[2].id)?.newSegmentIndex).toBe(2)
    expect(byItem.has(items[3].id)).toBe(false)
    expect(byItem.has(items[4].id)).toBe(false)

    const droppedItemIds = droppedOf(plan).map((d) => d.item.id).sort()
    expect(droppedItemIds).toEqual([items[3].id, items[4].id].sort())
    expectNoDuplicatePlacements(plan)
  })

  it('R4: capacity-fitting prefix preservation (10→5 segs dense) — first 5 in flow order kept, last 5 dropped', () => {
    const old11 = buildBelt('old', straightPath(0, 0, 11)) // 10 segments
    const repl6 = buildBelt('repl', straightPath(0, 0, 6)) // 5 segments
    const items = Array.from({ length: 10 }, () => createItem('wheel_small'))
    const inventory = buildCaptured(old11, items.map((it, i) => ({
      segmentIndex: i, positionOnCell: 0.4, item: it,
    })))

    const plan = planBeltInventoryMigration([inventory], [repl6], true)

    expect(plan.placements).toHaveLength(5)
    expect(droppedOf(plan)).toHaveLength(5)

    const byItem = placementsByItem(plan)
    // First five (oldSegs 0..4) placed in flow order on newSegs 0..4
    for (let i = 0; i < 5; i++) {
      const placement = byItem.get(items[i].id)
      expect(placement, `item[${i}] should be placed`).toBeDefined()
      expect(placement?.newSegmentIndex).toBe(i)
      expect(placement?.newPositionOnCell).toBe(0.4)
    }
    // Last five (oldSegs 5..9) dropped
    const droppedIds = new Set(droppedOf(plan).map((d) => d.item.id))
    for (let i = 5; i < 10; i++) {
      expect(droppedIds.has(items[i].id), `item[${i}] should be dropped`).toBe(true)
    }
    expectNoDuplicatePlacements(plan)
  })

  it('R7: capacity invariant — no duplicate (beltId, newSegmentIndex) across mixed scenarios', () => {
    // Run several scenarios and assert no duplicates on each.
    const scenarios: Array<() => BeltInventoryMigrationPlan> = [
      () => {
        const oldB = buildBelt('o1', straightPath(0, 0, 6))
        const newB = buildBelt('n1', straightPath(0, 0, 4))
        const inv = buildCaptured(oldB, [0, 1, 2, 3, 4].map((i) => ({
          segmentIndex: i, positionOnCell: 0.5, item: createItem('wheel_small'),
        })))
        return planBeltInventoryMigration([inv], [newB], true)
      },
      () => {
        const oldB = buildBelt('o2', straightPath(0, 0, 4))
        const newB = buildBelt('n2', straightPath(0, 0, 7))
        const inv = buildCaptured(oldB, [0, 1, 2].map((i) => ({
          segmentIndex: i, positionOnCell: 0.3, item: createItem('wheel_small'),
        })))
        return planBeltInventoryMigration([inv], [newB], true)
      },
    ]
    for (const run of scenarios) {
      expectNoDuplicatePlacements(run())
    }
  })

  it('R8: dropped entries carry reason="capacity" and original item identity', () => {
    const old6 = buildBelt('old', straightPath(0, 0, 6)) // 5 segments
    const repl4 = buildBelt('repl', straightPath(0, 0, 4)) // 3 segments
    const items = [0, 1, 2, 3, 4].map(() => createItem('wheel_small'))
    const inventory = buildCaptured(old6, items.map((it, i) => ({
      segmentIndex: i, positionOnCell: 0.5, item: it,
    })))

    const plan = planBeltInventoryMigration([inventory], [repl4], true)
    const dropped = droppedOf(plan)
    expect(dropped.length).toBeGreaterThan(0)
    for (const d of dropped) {
      expect(d.reason).toBe('capacity')
      // Identity preserved (same item reference, not a clone).
      expect(items.includes(d.item)).toBe(true)
      expect(typeof d.oldSegmentIndex).toBe('number')
      expect(d.oldSegmentIndex).toBeGreaterThanOrEqual(0)
    }
  })

  it('R10: repeated identical moves are stable (5 calls produce identical placements)', () => {
    const old5 = buildBelt('old', straightPath(0, 0, 5))
    const repl5 = buildBelt('repl', straightPath(0, 0, 5))
    const items = [
      createItem('wheel_small'),
      createItem('wheel_small'),
      createItem('wheel_small'),
    ]
    const specs: CapturedSpec[] = [
      { segmentIndex: 0, positionOnCell: 0.2, item: items[0] },
      { segmentIndex: 2, positionOnCell: 0.6, item: items[1] },
      { segmentIndex: 3, positionOnCell: 0.9, item: items[2] },
    ]

    const snapshots: Array<Array<{ id: string; seg: number; pos: number }>> = []
    for (let call = 0; call < 5; call++) {
      const inv = buildCaptured(old5, specs)
      const plan = planBeltInventoryMigration([inv], [repl5], true)
      const snapshot = (plan.placements as unknown as DiscretePlacement[])
        .map((p) => ({ id: p.item.id, seg: p.newSegmentIndex, pos: p.newPositionOnCell }))
        .sort((a, b) => a.id.localeCompare(b.id))
      snapshots.push(snapshot)
      expect(droppedOf(plan)).toHaveLength(0)
    }
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i]).toEqual(snapshots[0])
    }
  })

  it('R10: repeated shrink — first migration drops are stable across repeated planner calls', () => {
    const old6 = buildBelt('old', straightPath(0, 0, 6)) // 5 segments
    const repl4 = buildBelt('repl', straightPath(0, 0, 4)) // 3 segments
    const items = [0, 1, 2, 3, 4].map(() => createItem('wheel_small'))
    const specs: CapturedSpec[] = items.map((it, i) => ({
      segmentIndex: i, positionOnCell: 0.5, item: it,
    }))

    const droppedSnapshots: string[][] = []
    for (let call = 0; call < 3; call++) {
      const inv = buildCaptured(old6, specs)
      const plan = planBeltInventoryMigration([inv], [repl4], true)
      droppedSnapshots.push(droppedOf(plan).map((d) => d.item.id).sort())
    }
    for (let i = 1; i < droppedSnapshots.length; i++) {
      expect(droppedSnapshots[i]).toEqual(droppedSnapshots[0])
    }
  })

  it('Identity preservation: placed items retain id/type/quality/components', () => {
    const old5 = buildBelt('old', straightPath(0, 0, 5))
    const repl5 = buildBelt('repl', straightPath(0, 0, 5))
    const a = createItem('wheel_small', 73)
    const b = createItem('sensor_camera', 91)
    const inventory = buildCaptured(old5, [
      { segmentIndex: 0, positionOnCell: 0.1, item: a },
      { segmentIndex: 3, positionOnCell: 0.9, item: b },
    ])

    const plan = planBeltInventoryMigration([inventory], [repl5], true)
    const byItem = placementsByItem(plan)

    const placedA = byItem.get(a.id)
    const placedB = byItem.get(b.id)
    expect(placedA?.item).toBe(a) // same reference, no clone
    expect(placedB?.item).toBe(b)
    expect(placedA?.item.type).toBe('wheel_small')
    expect(placedA?.item.quality).toBe(73)
    expect(placedB?.item.type).toBe('sensor_camera')
    expect(placedB?.item.quality).toBe(91)
  })
})
