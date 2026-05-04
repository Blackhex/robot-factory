/**
 * RED tests — BeltInventoryMigration under the two-item-per-cell contract.
 *
 * Source-anchored projection still applies: targetSeg = oldSegmentIndex,
 * and newPositionOnCell = oldPositionOnCell on first try. The per-segment
 * occupancy test is now: a placement at (seg, pos) succeeds iff fewer
 * than 2 items already sit on `seg` AND every already-placed pos at `seg`
 * is at least MIN_ITEM_SPACING (=0.5) away from `pos`. Items that
 * overflow past `newSegCount` are dropped with reason `'capacity'`.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  planBeltInventoryMigration,
  type CapturedBeltItem,
  type RemovedBeltInventory,
} from '../../../src/game/BeltInventoryMigration'
import { createItem, resetItemIdCounter, type Item } from '../../../src/game/Item'
import type { BeltInfo, GridPosition } from '../../../src/game/types'
import { machine } from './helpers/BeltInventoryMigrationPlannerHelpers'

interface CapturedSpec {
  segmentIndex: number
  positionOnCell: number
  item: Item
}

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
  }
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

describe('planBeltInventoryMigration — two-items-per-cell placement', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('keeps two items on the same source cell when spacing is 0.5 (well-spaced pair → both placed)', () => {
    // GIVEN — a 2-cell same-shape replacement; both items live on old seg 0
    // at well-spaced positions [0.0, 0.5].
    const oldBelt = buildBelt('old', straightPath(3)) // 2 segments
    const replacement = buildBelt('repl', straightPath(3)) // 2 segments
    const a = createItem('wheel_small')
    const b = createItem('circuit_basic')
    const inventory = buildCaptured(oldBelt, [
      { segmentIndex: 0, positionOnCell: 0.0, item: a },
      { segmentIndex: 0, positionOnCell: 0.5, item: b },
    ])

    // WHEN
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN — both items land on new seg 0 at their original positions.
    expect(plan.placements).toHaveLength(2)
    expect(plan.dropped).toHaveLength(0)
    const byItem = new Map(plan.placements.map((p) => [p.item.id, p]))
    expect(byItem.get(a.id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 0,
      newPositionOnCell: 0.0,
    })
    expect(byItem.get(b.id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 0,
      newPositionOnCell: 0.5,
    })
  })

  it('drops both items with reason="capacity" when the replacement chain has 0 cells', () => {
    // GIVEN — replacement path of length 1 → 0 segments → no capacity.
    const oldBelt = buildBelt('old', straightPath(3))
    const replacement = buildBelt('repl', [{ x: 0, z: 0 }])
    const a = createItem('wheel_small')
    const b = createItem('circuit_basic')
    const inventory = buildCaptured(oldBelt, [
      { segmentIndex: 0, positionOnCell: 0.0, item: a },
      { segmentIndex: 0, positionOnCell: 0.5, item: b },
    ])

    // WHEN
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN — both dropped with reason 'capacity'.
    expect(plan.placements).toHaveLength(0)
    expect(plan.dropped).toHaveLength(2)
    for (const d of plan.dropped) {
      expect(d.reason).toBe('capacity')
      expect(d.oldSegmentIndex).toBe(0)
    }
    const droppedIds = plan.dropped.map((d) => d.item.id).sort()
    expect(droppedIds).toEqual([a.id, b.id].sort())
  })

  it('places both items on the single new cell when the replacement chain has 1 cell and spacing is OK', () => {
    // GIVEN
    const oldBelt = buildBelt('old', straightPath(3)) // 2 segments
    const replacement = buildBelt('repl', straightPath(2)) // 1 segment
    const a = createItem('wheel_small')
    const b = createItem('circuit_basic')
    const inventory = buildCaptured(oldBelt, [
      { segmentIndex: 0, positionOnCell: 0.0, item: a },
      { segmentIndex: 0, positionOnCell: 0.5, item: b },
    ])

    // WHEN
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN — both fit on new seg 0.
    expect(plan.placements).toHaveLength(2)
    expect(plan.dropped).toHaveLength(0)
    const byItem = new Map(plan.placements.map((p) => [p.item.id, p]))
    expect(byItem.get(a.id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 0,
      newPositionOnCell: 0.0,
    })
    expect(byItem.get(b.id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 0,
      newPositionOnCell: 0.5,
    })
  })

  it('places spacing-collision pair at exactly the MIN_ITEM_SPACING boundary [0.3, 0.8] on a 1-cell replacement', () => {
    // GIVEN — gap is exactly 0.5 (MIN_ITEM_SPACING) — must be allowed.
    const oldBelt = buildBelt('old', straightPath(3))
    const replacement = buildBelt('repl', straightPath(2)) // 1 segment
    const a = createItem('wheel_small')
    const b = createItem('circuit_basic')
    const inventory = buildCaptured(oldBelt, [
      { segmentIndex: 0, positionOnCell: 0.3, item: a },
      { segmentIndex: 0, positionOnCell: 0.8, item: b },
    ])

    // WHEN
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN — both placed on new seg 0 at their original positions.
    expect(plan.placements).toHaveLength(2)
    expect(plan.dropped).toHaveLength(0)
    const byItem = new Map(plan.placements.map((p) => [p.item.id, p]))
    expect(byItem.get(a.id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 0,
      newPositionOnCell: 0.3,
    })
    expect(byItem.get(b.id)).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 0,
      newPositionOnCell: 0.8,
    })
  })

  it('overflows extra items past the chain end with reason="capacity" when 3 items target a 1-cell chain', () => {
    // GIVEN — one item at (seg 0, 0.0) plus a well-spaced [0.0, 0.5] pair
    // captured on old seg 1. Replacement has 1 segment.
    //   - cell-0 item targets new seg 0 at pos 0.0 → placed.
    //   - cell-1 items target new seg 1 (= newSegCount) → drop loop kicks in;
    //     under source-anchored projection neither cascades into seg 0
    //     (capacity already 1 and spacing collides with placed 0.0). Both
    //     are dropped with reason 'capacity'.
    const oldBelt = buildBelt('old', straightPath(3)) // 2 segments
    const replacement = buildBelt('repl', straightPath(2)) // 1 segment
    const head = createItem('wheel_small')
    const back = createItem('circuit_basic')
    const front = createItem('chassis_light')
    const inventory = buildCaptured(oldBelt, [
      { segmentIndex: 0, positionOnCell: 0.0, item: head },
      { segmentIndex: 1, positionOnCell: 0.0, item: back },
      { segmentIndex: 1, positionOnCell: 0.5, item: front },
    ])

    // WHEN
    const plan = planBeltInventoryMigration([inventory], [replacement], true)

    // THEN
    expect(plan.placements).toHaveLength(1)
    expect(plan.placements[0]).toMatchObject({
      beltId: 'repl',
      newSegmentIndex: 0,
      newPositionOnCell: 0.0,
      item: head,
    })
    expect(plan.dropped).toHaveLength(2)
    for (const d of plan.dropped) {
      expect(d.reason).toBe('capacity')
      expect(d.oldSegmentIndex).toBe(1)
    }
    const droppedIds = plan.dropped.map((d) => d.item.id).sort()
    expect(droppedIds).toEqual([back.id, front.id].sort())
  })
})
