import { expect } from 'vitest'
import { Simulation } from '../../../../../src/game/Simulation'
import { ConveyorBelt } from '../../../../../src/game/ConveyorBelt'
import { beltInventoryCapacity } from '../../../../../src/game/BeltInventoryRules'
import { createItem } from '../../../../../src/game/Item'
import type { Item } from '../../../../../src/game/Item'
import type { BeltInfo, ItemType } from '../../../../../src/game/types'

export function allItemsOnSimBelts(sim: Simulation): Item[] {
  const items: Item[] = []
  for (const belt of sim.getBelts().values()) {
    for (const item of belt.getItems()) {
      items.push(item as Item)
    }
  }
  return items
}

export function liveSimBeltItemSnapshot(sim: Simulation): Array<{
  beltId: string
  itemId: string
  type: ItemType
  positionOnBelt: number
  fromX: number
  fromZ: number
  toX: number
  toZ: number
}> {
  return Array.from(sim.getBelts().entries())
    .flatMap(([beltId, belt]) => belt.getItems().map((item) => ({
      beltId,
      itemId: item.id,
      type: item.type,
      positionOnBelt: item.positionOnBelt,
      fromX: belt.fromX,
      fromZ: belt.fromZ,
      toX: belt.toX,
      toZ: belt.toZ,
    })))
    .sort((a, b) => a.itemId.localeCompare(b.itemId) || a.beltId.localeCompare(b.beltId))
}

export function findItemOnCell(
  sim: Simulation,
  cx: number,
  cz: number,
  type: ItemType,
): { belt: ConveyorBelt; item: Item } | undefined {
  for (const belt of sim.getBelts().values()) {
    const coversFrom = belt.fromX === cx && belt.fromZ === cz
    const coversTo = belt.toX === cx && belt.toZ === cz
    if (!coversFrom && !coversTo) continue
    for (const item of belt.getItems()) {
      if (item.type === type) return { belt, item: item as Item }
    }
  }
  return undefined
}

export function findItemById(
  sim: Simulation,
  itemId: string,
): { belt: ConveyorBelt; item: Item } | undefined {
  for (const belt of sim.getBelts().values()) {
    for (const item of belt.getItems()) {
      if (item.id === itemId) return { belt, item: item as Item }
    }
  }
  return undefined
}

export function injectItem(
  sim: Simulation,
  info: BeltInfo,
  segIdx: number,
  positionOnBelt: number,
  type: ItemType,
): string {
  const segId = `${info.id}_seg${segIdx}`
  const belt = sim.getBelts().get(segId)
  if (!belt) {
    throw new Error(`No sim segment "${segId}" — cannot inject item`)
  }
  const item = createItem(type)
  ;(belt as unknown as { items: Item[] }).items.push(item)
  ;(item as { positionOnBelt: number }).positionOnBelt = positionOnBelt
  return item.id
}

/**
 * Legacy ordered-inventory injector. Under the one-item-per-cell contract
 * each segment holds at most one item, so this helper now writes one item
 * per consecutive segment starting at index 0.
 */
export function injectOrderedInventory(
  sim: Simulation,
  info: BeltInfo,
  count: number,
  type: ItemType = 'wheel_small',
): string[] {
  const segmentCount = info.path.length - 1
  const capacity = beltInventoryCapacity(info)
  if (count > capacity) {
    throw new Error(`Cannot inject ${count} items into capacity ${capacity}`)
  }
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const segIdx = Math.min(segmentCount - 1, i)
    ids.push(injectItem(sim, info, segIdx, 0, type))
  }
  return ids
}

export function orderedItemIdsOnFactoryBelt(sim: Simulation, info: BeltInfo): string[] {
  const ids: string[] = []
  for (let i = 0; i < info.path.length - 1; i++) {
    const seg = sim.getBelt(`${info.id}_seg${i}`)
    if (!seg) continue
    for (const item of seg.getItems()) {
      ids.push(item.id)
    }
  }
  return ids
}

/**
 * Phase 2 helper: inject one item per segment under the discrete
 * one-item-per-cell contract. New API the GREEN agent should converge on.
 *
 * @param sim Simulation harness
 * @param info Belt to inject onto
 * @param itemsBySegment Map from segmentIndex (0..segmentCount-1) to optional
 *   `{ type, positionOnCell }`. Missing segments are left empty.
 */
export function injectOneItemPerCell(
  sim: Simulation,
  info: BeltInfo,
  itemsBySegment: ReadonlyMap<number, { type?: ItemType; positionOnCell?: number }>,
): Map<number, string> {
  const segmentCount = info.path.length - 1
  const ids = new Map<number, string>()
  for (const [segIdx, spec] of itemsBySegment) {
    if (segIdx < 0 || segIdx >= segmentCount) {
      throw new Error(`segmentIndex ${segIdx} out of range [0,${segmentCount})`)
    }
    const id = injectItem(sim, info, segIdx, spec.positionOnCell ?? 0, spec.type ?? 'wheel_small')
    ids.set(segIdx, id)
  }
  return ids
}

export function injectedInventoryCell(info: BeltInfo, index: number, count: number): { x: number; z: number } {
  const segmentCount = info.path.length - 1
  void count
  const segIdx = Math.min(segmentCount - 1, index)
  const cell = info.path[segIdx]
  return { x: cell.x, z: cell.z }
}

export function expectBeltCoversCell(info: BeltInfo, cell: { x: number; z: number }): void {
  expect(
    info.path.some((pathCell) => pathCell.x === cell.x && pathCell.z === cell.z),
    `expected belt ${info.id} to cover cell (${cell.x},${cell.z})`,
  ).toBe(true)
}