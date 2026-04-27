/**
 * RED tests — source-anchored projection contract for belt inventory migration.
 *
 * Contract under test (to be implemented in GREEN):
 *
 *   newSegmentIndex = oldSegmentIndex            (DIRECT, NOT proportional)
 *   newPositionOnCell = oldPositionOnCell        (already preserved)
 *
 * Items whose `oldSegmentIndex >= newSegmentCount` are dropped with
 * `reason: 'capacity'` (the source machine anchors the chain — "N cells
 * from source" stays "N cells from source" across topology changes).
 *
 * Collision rule: when two captured items resolve to the same target
 * `newSegmentIndex`, the older one (lower `positionOnCell` after the flow
 * sort) takes that segment; the next walks forward to the next free segment.
 *
 * The current planner uses proportional projection
 *   `floor((clampedOldSeg * newSegCount) / oldSegCount)`
 * which leaves empty cells when the new chain is longer (Test 1, Test 4)
 * and silently re-maps over-capacity items (Test 2). These tests must FAIL
 * RED for the right reason: wrong `newSegmentIndex` from proportional
 * projection.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  planBeltInventoryMigration,
  type BeltInventoryPlacement,
  type CapturedBeltItem,
  type RemovedBeltInventory,
} from '../../../src/game/BeltInventoryMigration'
import { createItem, resetItemIdCounter, type Item } from '../../../src/game/Item'
import type { BeltInfo, GridPosition } from '../../../src/game/types'
import { machine } from './helpers/BeltInventoryMigrationPlannerHelpers'

// ---- helpers ---------------------------------------------------------------

function straightPath(length: number): GridPosition[] {
  const path: GridPosition[] = []
  for (let i = 0; i < length; i++) path.push({ x: i, z: 0 })
  return path
}

function buildBelt(id: string, path: GridPosition[]): BeltInfo {
  const src = machine('source', path[0].x, path[0].z)
  const dst = machine('destination', path[path.length - 1].x, path[path.length - 1].z)
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

interface CapturedSpec {
  segmentIndex: number
  positionOnCell: number
  item: Item
}

function buildCaptured(belt: BeltInfo, specs: CapturedSpec[]): RemovedBeltInventory {
  const items: CapturedBeltItem[] = specs.map((s) => ({
    segmentIndex: s.segmentIndex,
    positionOnCell: s.positionOnCell,
    item: s.item,
  }))
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

function placementsByItem(
  placements: BeltInventoryPlacement[],
): Map<string, BeltInventoryPlacement> {
  const m = new Map<string, BeltInventoryPlacement>()
  for (const p of placements) m.set(p.item.id, p)
  return m
}

// ---- tests -----------------------------------------------------------------

describe('planBeltInventoryMigration() — source-anchored projection contract', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('Test 1: longer new chain — items keep their oldSegmentIndex (no proportional spreading)', () => {
    // GIVEN: an old 5-cell chain (path length 6 = 5 segments) with 5 items,
    // one per cell at positionOnCell 0.3, replaced by a longer 7-cell chain
    // (path length 8 = 7 segments).
    const oldBelt = buildBelt('old', straightPath(6)) // 5 segments
    const replacement = buildBelt('repl', straightPath(8)) // 7 segments
    const items = [0, 1, 2, 3, 4].map(() => createItem('wheel_small'))
    const inventory = buildCaptured(
      oldBelt,
      items.map((it, i) => ({ segmentIndex: i, positionOnCell: 0.3, item: it })),
    )

    // WHEN: the planner runs.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: each item lands on the SAME segment index it had on the old
    // chain (source-anchored), NOT spread proportionally onto 0,1,2,4,5.
    expect(plan.placements).toHaveLength(5)
    expect(plan.dropped).toHaveLength(0)
    const byItem = placementsByItem(plan.placements)
    expect(byItem.get(items[0].id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 0,
      newPositionOnCell: 0.3,
    })
    expect(byItem.get(items[1].id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 1,
      newPositionOnCell: 0.3,
    })
    expect(byItem.get(items[2].id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 2,
      newPositionOnCell: 0.3,
    })
    expect(byItem.get(items[3].id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 3,
      newPositionOnCell: 0.3,
    })
    expect(byItem.get(items[4].id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 4,
      newPositionOnCell: 0.3,
    })
    // AND: cells 5 and 6 stay empty.
    const occupiedSegs = new Set(plan.placements.map((p) => p.newSegmentIndex))
    expect(occupiedSegs.has(5)).toBe(false)
    expect(occupiedSegs.has(6)).toBe(false)
  })

  it('Test 2: shorter new chain — items past new chain end are dropped', () => {
    // GIVEN: an old 7-cell chain (7 segments) fully populated, replaced by a
    // 4-cell chain (3 segments).
    // NB: path length 8 → 7 segments; path length 4 → 3 segments. To get
    // exactly "7 cells, 7 items at segmentIndex 0..6" and "4 cells, items
    // 0..3 land", we need oldSegCount=7 and newSegCount=4, i.e. old path
    // length 8 and new path length 5.
    const oldBelt = buildBelt('old', straightPath(8)) // 7 segments
    const replacement = buildBelt('repl', straightPath(5)) // 4 segments
    const items = [0, 1, 2, 3, 4, 5, 6].map(() => createItem('wheel_small'))
    const inventory = buildCaptured(
      oldBelt,
      items.map((it, i) => ({ segmentIndex: i, positionOnCell: 0.5, item: it })),
    )

    // WHEN: planner runs.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: items 0..3 land on newSegs 0..3 (NOT proportionally projected
    // to 0,1,2,3 from oldSegs 0,1,3,5 as the legacy planner would).
    expect(plan.placements).toHaveLength(4)
    expect(plan.dropped).toHaveLength(3)
    const byItem = placementsByItem(plan.placements)
    expect(byItem.get(items[0].id)?.newSegmentIndex).toBe(0)
    expect(byItem.get(items[0].id)?.newPositionOnCell).toBe(0.5)
    expect(byItem.get(items[1].id)?.newSegmentIndex).toBe(1)
    expect(byItem.get(items[1].id)?.newPositionOnCell).toBe(0.5)
    expect(byItem.get(items[2].id)?.newSegmentIndex).toBe(2)
    expect(byItem.get(items[2].id)?.newPositionOnCell).toBe(0.5)
    expect(byItem.get(items[3].id)?.newSegmentIndex).toBe(3)
    expect(byItem.get(items[3].id)?.newPositionOnCell).toBe(0.5)

    // AND: items 4,5,6 are dropped with reason='capacity'.
    expect(byItem.has(items[4].id)).toBe(false)
    expect(byItem.has(items[5].id)).toBe(false)
    expect(byItem.has(items[6].id)).toBe(false)
    const droppedIds = new Set(plan.dropped.map((d) => d.item.id))
    expect(droppedIds.has(items[4].id)).toBe(true)
    expect(droppedIds.has(items[5].id)).toBe(true)
    expect(droppedIds.has(items[6].id)).toBe(true)
    for (const d of plan.dropped) {
      expect(d.reason).toBe('capacity')
    }
  })

  it('Test 3: same-length new chain — items keep their (segmentIndex, positionOnCell)', () => {
    // GIVEN: an old 4-cell chain (3 segments) with 3 items at distinct
    // positions on cells, replaced by a same-shape 4-cell chain.
    const oldBelt = buildBelt('old', straightPath(4)) // 3 segments
    const replacement = buildBelt('repl', straightPath(4)) // 3 segments
    const a = createItem('wheel_small')
    const b = createItem('wheel_small')
    const c = createItem('wheel_small')
    const inventory = buildCaptured(oldBelt, [
      { segmentIndex: 0, positionOnCell: 0.4, item: a },
      { segmentIndex: 1, positionOnCell: 0.7, item: b },
      { segmentIndex: 2, positionOnCell: 0.2, item: c },
    ])

    // WHEN: planner runs.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: each item lands at its original (segmentIndex, positionOnCell)
    // (regression — same-length case must still work after the GREEN change).
    expect(plan.placements).toHaveLength(3)
    expect(plan.dropped).toHaveLength(0)
    const byItem = placementsByItem(plan.placements)
    expect(byItem.get(a.id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 0,
      newPositionOnCell: 0.4,
    })
    expect(byItem.get(b.id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 1,
      newPositionOnCell: 0.7,
    })
    expect(byItem.get(c.id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 2,
      newPositionOnCell: 0.2,
    })
  })

  it('Test 4: uniform tick-discrete spacing — production scenario', () => {
    // GIVEN: steady-state captured inventory on a 5-cell chain (path length
    // 6 → 5 segments), all 5 items at positionOnCell 0.5 (mid-cell tick
    // boundary), replaced by an 8-cell chain (path length 9 → 8 segments)
    // because the destination machine moved 3 cells further.
    const oldBelt = buildBelt('old', straightPath(6)) // 5 segments
    const replacement = buildBelt('repl', straightPath(9)) // 8 segments
    const items = [0, 1, 2, 3, 4].map(() => createItem('wheel_small'))
    const inventory = buildCaptured(
      oldBelt,
      items.map((it, i) => ({ segmentIndex: i, positionOnCell: 0.5, item: it })),
    )

    // WHEN: planner runs.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: 5 items land at newSegs 0,1,2,3,4 each at positionOnCell 0.5.
    expect(plan.placements).toHaveLength(5)
    expect(plan.dropped).toHaveLength(0)
    const byItem = placementsByItem(plan.placements)
    for (let i = 0; i < 5; i++) {
      expect(byItem.get(items[i].id)?.newSegmentIndex).toBe(i)
      expect(byItem.get(items[i].id)?.newPositionOnCell).toBe(0.5)
    }

    // AND: chain-arc spacing between consecutive items is uniform = 1.0.
    const sortedSegs = plan.placements.map((p) => p.newSegmentIndex).sort((x, y) => x - y)
    for (let i = 1; i < sortedSegs.length; i++) {
      expect(sortedSegs[i] - sortedSegs[i - 1]).toBe(1)
    }

    // AND: cells 5,6,7 stay empty (no placement for them).
    const occupiedSegs = new Set(sortedSegs)
    expect(occupiedSegs.has(5)).toBe(false)
    expect(occupiedSegs.has(6)).toBe(false)
    expect(occupiedSegs.has(7)).toBe(false)
  })

  it('Test 5: collision rule — items at the same oldSegmentIndex collide one-to-a-cell', () => {
    // GIVEN: an old 5-cell chain (4 segments) where two items share
    // oldSegmentIndex=2 (degenerate but possible after some edits), with
    // distinct positionOnCell values so flow order is well-defined; the
    // older item has positionOnCell=0.3, the newer has 0.7.
    const oldBelt = buildBelt('old', straightPath(5)) // 4 segments
    const replacement = buildBelt('repl', straightPath(5)) // 4 segments
    const olderAtSeg2 = createItem('wheel_small')
    const newerAtSeg2 = createItem('wheel_small')
    const inventory = buildCaptured(oldBelt, [
      { segmentIndex: 2, positionOnCell: 0.3, item: olderAtSeg2 },
      { segmentIndex: 2, positionOnCell: 0.7, item: newerAtSeg2 },
    ])

    // WHEN: planner runs.
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN: oldest takes its target segment (2); the second walks forward
    // to next free segment (3). No drops.
    expect(plan.placements).toHaveLength(2)
    expect(plan.dropped).toHaveLength(0)
    const byItem = placementsByItem(plan.placements)
    expect(byItem.get(olderAtSeg2.id)?.newSegmentIndex).toBe(2)
    expect(byItem.get(olderAtSeg2.id)?.newPositionOnCell).toBe(0.3)
    expect(byItem.get(newerAtSeg2.id)?.newSegmentIndex).toBe(3)
    expect(byItem.get(newerAtSeg2.id)?.newPositionOnCell).toBe(0.7)

    // AND: no two placements share (beltId, newSegmentIndex).
    const seen = new Set<string>()
    for (const p of plan.placements) {
      const key = `${p.beltId}#${p.newSegmentIndex}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })
})
