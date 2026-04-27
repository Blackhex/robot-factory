import { describe, expect, it, beforeEach } from 'vitest'
import { BeltInventoryMigrationCoordinator } from '../../../src/game/BeltInventoryMigrationCoordinator'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { beltInfo, machine } from './helpers/BeltInventoryMigrationPlannerHelpers'

describe('BeltInventoryMigrationCoordinator', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('does not treat both-unknown slot identities as exact covered-cell continuation', () => {
    const sourceMachine = machine('source', 0, 0)
    const destinationMachine = machine('destination', 3, 0)
    const removedBelt = beltInfo({
      id: 'removed_unknown_slot_belt',
      sourceMachine,
      sourceSlot: undefined,
      destinationMachine,
      destinationSlot: null,
      path: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
      ],
    })
    const replacement = beltInfo({
      id: 'replacement_unknown_slot_belt',
      sourceMachine,
      sourceSlot: undefined,
      destinationMachine,
      destinationSlot: null,
      path: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
      ],
    })
    const capturedItem = createItem('sensor_camera', 73)
    capturedItem.positionOnBelt = 0.35
    const removedSegment = new ConveyorBelt(`${removedBelt.id}_seg1`, 1, 0, 2, 0)
    removedSegment.insertItemAt(capturedItem, capturedItem.positionOnBelt)
    const replacementSegment = new ConveyorBelt(`${replacement.id}_seg1`, 1, 0, 2, 0)
    const coordinator = new BeltInventoryMigrationCoordinator()

    expect(removedBelt.sourceMachine.id).toBe(replacement.sourceMachine.id)
    expect(removedBelt.destinationMachine.id).toBe(replacement.destinationMachine.id)
    expect(removedBelt.sourceSlot).toBeUndefined()
    expect(replacement.sourceSlot).toBeUndefined()
    expect(removedBelt.destinationSlot).toBeNull()
    expect(replacement.destinationSlot).toBeNull()
    expect(replacement.path.some((cell) => cell.x === 1 && cell.z === 0)).toBe(true)

    coordinator.beginEdit()
    coordinator.captureRemovedBeltInventory(removedBelt, (segmentId) => (
      segmentId === removedSegment.id ? removedSegment : undefined
    ))

    coordinator.flush({
      getBelt: (segmentId: string) => (segmentId === replacementSegment.id ? replacementSegment : undefined),
    }, [replacement])

    expect(replacementSegment.getItems()).toEqual([])
  })
})

// Phase 2 RED tests — coordinator must respect the planner's discrete
// placements / dropped contract:
//   (a) every placement is placed via insertItemAt, all calls return true
//   (b) coordinator never calls insertItemAt on an already-occupied segment
//   (c) items in plan.dropped end up on no belt
//   (d) dropped items vanish (no silent stash, no second placement attempt)
describe('BeltInventoryMigrationCoordinator — discrete placement & drop contract', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  function buildStraightBelt(id: string, x0: number, z0: number, length: number) {
    const path = []
    for (let i = 0; i < length; i++) path.push({ x: x0 + i, z: z0 })
    return beltInfo({
      id,
      sourceMachine: machine('source', x0, z0),
      sourceSlot: 'front',
      destinationMachine: machine('destination', x0 + length - 1, z0),
      destinationSlot: 'back',
      path,
    })
  }

  function makeSegments(belt: { id: string; path: ReadonlyArray<{ x: number; z: number }> }): Map<string, ConveyorBelt> {
    const map = new Map<string, ConveyorBelt>()
    for (let i = 0; i < belt.path.length - 1; i++) {
      const id = `${belt.id}_seg${i}`
      const a = belt.path[i]
      const b = belt.path[i + 1]
      map.set(id, new ConveyorBelt(id, a.x, a.z, b.x, b.z))
    }
    return map
  }

  it('(a) places every planner placement via insertItemAt and (b) every insertItemAt returns true', () => {
    // Same-path replacement: 5 cells (4 segs) old → 5 cells (4 segs) new, 3 items.
    const oldBelt = buildStraightBelt('old_belt', 0, 0, 5)
    const replacement = buildStraightBelt('replacement_belt', 0, 0, 5)
    const oldSegments = makeSegments(oldBelt)
    const newSegments = makeSegments(replacement)

    const items = [
      createItem('wheel_small'),
      createItem('wheel_small'),
      createItem('wheel_small'),
    ]
    // Inject into oldBelt segs 0, 2, 3 (one-item-per-cell)
    oldSegments.get('old_belt_seg0')!.insertItemAt(items[0], 0.1)
    oldSegments.get('old_belt_seg2')!.insertItemAt(items[1], 0.5)
    oldSegments.get('old_belt_seg3')!.insertItemAt(items[2], 0.9)

    // Track all insertItemAt calls on the destination segments via spies.
    const insertCalls: Array<{ segmentId: string; itemId: string; result: boolean }> = []
    for (const [segId, segment] of newSegments) {
      const original = segment.insertItemAt.bind(segment)
      segment.insertItemAt = (item, pos) => {
        const result = original(item, pos)
        insertCalls.push({ segmentId: segId, itemId: item.id, result })
        return result
      }
    }

    const coordinator = new BeltInventoryMigrationCoordinator()
    coordinator.beginEdit()
    coordinator.captureRemovedBeltInventory(oldBelt, (id) => oldSegments.get(id))
    coordinator.flush({ getBelt: (id) => newSegments.get(id) }, [replacement])

    // Every captured item placed exactly once
    expect(insertCalls).toHaveLength(3)
    // All inserts succeeded — coordinator never targets an occupied segment
    for (const call of insertCalls) {
      expect(call.result, `insertItemAt for ${call.itemId} should succeed`).toBe(true)
    }
    // Items live on the new belt (segments 0, 2, 3)
    expect(newSegments.get('replacement_belt_seg0')!.getItems().map((i) => i.id)).toEqual([items[0].id])
    expect(newSegments.get('replacement_belt_seg2')!.getItems().map((i) => i.id)).toEqual([items[1].id])
    expect(newSegments.get('replacement_belt_seg3')!.getItems().map((i) => i.id)).toEqual([items[2].id])
  })

  it('(c) drops items returned in plan.dropped — they end up on no belt', () => {
    // Dense shrink: 5 segs → 3 segs. Planner drops 2 items.
    const oldBelt = buildStraightBelt('old_belt', 0, 0, 6) // 5 segments
    const replacement = buildStraightBelt('replacement_belt', 0, 0, 4) // 3 segments
    const oldSegments = makeSegments(oldBelt)
    const newSegments = makeSegments(replacement)

    const items = [0, 1, 2, 3, 4].map(() => createItem('wheel_small'))
    for (let i = 0; i < 5; i++) {
      oldSegments.get(`old_belt_seg${i}`)!.insertItemAt(items[i], 0.5)
    }

    const coordinator = new BeltInventoryMigrationCoordinator()
    coordinator.beginEdit()
    coordinator.captureRemovedBeltInventory(oldBelt, (id) => oldSegments.get(id))
    coordinator.flush({ getBelt: (id) => newSegments.get(id) }, [replacement])

    // 3 items on the new belt total; 2 nowhere to be found.
    let placedCount = 0
    const placedIds = new Set<string>()
    for (const seg of newSegments.values()) {
      for (const it of seg.getItems()) {
        placedCount++
        placedIds.add(it.id)
      }
    }
    expect(placedCount).toBe(3)
    // First 3 items (oldSegs 0..2) survive in flow order.
    expect(placedIds.has(items[0].id)).toBe(true)
    expect(placedIds.has(items[1].id)).toBe(true)
    expect(placedIds.has(items[2].id)).toBe(true)
    // Last 2 items dropped — appear on no belt.
    expect(placedIds.has(items[3].id)).toBe(false)
    expect(placedIds.has(items[4].id)).toBe(false)
  })

  it('(d) coordinator never calls insertItemAt on an already-occupied destination segment', () => {
    // Same-path replacement, 3 items in dense cells 0..2 of a 4-cell belt.
    const oldBelt = buildStraightBelt('old_belt', 0, 0, 4) // 3 segs
    const replacement = buildStraightBelt('replacement_belt', 0, 0, 4) // 3 segs
    const oldSegments = makeSegments(oldBelt)
    const newSegments = makeSegments(replacement)

    const items = [createItem('wheel_small'), createItem('wheel_small'), createItem('wheel_small')]
    oldSegments.get('old_belt_seg0')!.insertItemAt(items[0], 0.2)
    oldSegments.get('old_belt_seg1')!.insertItemAt(items[1], 0.4)
    oldSegments.get('old_belt_seg2')!.insertItemAt(items[2], 0.6)

    let occupiedTargetingCount = 0
    for (const segment of newSegments.values()) {
      const original = segment.insertItemAt.bind(segment)
      segment.insertItemAt = (item, pos) => {
        if (segment.getItems().length > 0) occupiedTargetingCount++
        return original(item, pos)
      }
    }

    const coordinator = new BeltInventoryMigrationCoordinator()
    coordinator.beginEdit()
    coordinator.captureRemovedBeltInventory(oldBelt, (id) => oldSegments.get(id))
    coordinator.flush({ getBelt: (id) => newSegments.get(id) }, [replacement])

    expect(occupiedTargetingCount).toBe(0)
  })
})