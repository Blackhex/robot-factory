import type { BeltInventoryMigrationPlan, CapturedBeltItem, RemovedBeltInventory } from '../../../../src/game/BeltInventoryMigration'
import type { Item } from '../../../../src/game/Item'
import type { BeltInfo, GridPosition, MachineInfo } from '../../../../src/game/types'
import { expect } from 'vitest'

type SlotIdentity = BeltInfo['sourceSlot'] | undefined | null

interface BeltInfoBuilderOptions {
  id: string
  sourceMachine: MachineInfo
  sourceSlot: SlotIdentity
  destinationMachine: MachineInfo
  destinationSlot: SlotIdentity
  path: GridPosition[]
}

interface RemovedInventoryItemOptions {
  cellX: number
  cellZ: number
  item: Item
  positionOnBelt?: number
}

interface RemovedInventoryBuilderOptions {
  sourceMachine: MachineInfo
  destinationMachine: MachineInfo
  sourceSlot: SlotIdentity
  destinationSlot: SlotIdentity
  sourceCellX?: number
  sourceCellZ?: number
  destinationCellX?: number
  destinationCellZ?: number
  segmentCount?: number
  items: RemovedInventoryItemOptions[]
}

export function machine(id: string, x: number, z: number): MachineInfo {
  return {
    id,
    name: id,
    type: id === 'source' ? 'part_fabricator' : 'assembler',
    x,
    z,
    rotation: 'east',
    slots: {
      inputs: ['back'],
      outputs: ['front'],
    },
  }
}

export function beltCoversCell(belt: BeltInfo, x: number, z: number): boolean {
  return belt.path.some((cell) => cell.x === x && cell.z === z)
}

export function beltInfo(options: BeltInfoBuilderOptions): BeltInfo {
  return {
    id: options.id,
    name: options.id,
    sourceMachine: options.sourceMachine,
    sourceSlot: options.sourceSlot,
    destinationMachine: options.destinationMachine,
    destinationSlot: options.destinationSlot,
    path: options.path,
  } as unknown as BeltInfo
}

export function removedInventory(options: RemovedInventoryBuilderOptions): RemovedBeltInventory {
  const sourceCellX = options.sourceCellX ?? 0
  const sourceCellZ = options.sourceCellZ ?? 0
  return {
    sourceMachineId: options.sourceMachine.id,
    destinationMachineId: options.destinationMachine.id,
    sourceSlot: options.sourceSlot,
    destinationSlot: options.destinationSlot,
    sourceCellX,
    sourceCellZ,
    destinationCellX: options.destinationCellX,
    destinationCellZ: options.destinationCellZ,
    segmentCount: options.segmentCount ?? 7,
    items: options.items.map((item) => toCapturedBeltItem(item, sourceCellX, sourceCellZ)),
  }
}

export function expectNoOrderedMigration(plan: BeltInventoryMigrationPlan, item: Item): void {
  expect(plan.placements).toEqual([])
  expect(plan.claimedItemIds.has(item.id)).toBe(false)
}

function toCapturedBeltItem(
  options: RemovedInventoryItemOptions,
  sourceCellX: number,
  sourceCellZ: number,
): CapturedBeltItem {
  return {
    segmentIndex: Math.abs(options.cellX - sourceCellX) + Math.abs(options.cellZ - sourceCellZ),
    positionOnCell: options.positionOnBelt ?? 0,
    item: options.item,
  }
}
