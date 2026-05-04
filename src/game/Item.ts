import type { ItemType } from './types.ts'

export interface Item {
  readonly id: string
  readonly type: ItemType
  quality: number
  positionOnBelt: number
  isDefective: boolean
  readonly components?: ReadonlyArray<Item>
}

let nextItemId = 1

export function createItem(type: ItemType, quality = 80): Item {
  return {
    id: `item_${nextItemId++}`,
    type,
    quality,
    positionOnBelt: 0,
    isDefective: false,
  }
}

export function createAssembly(
  type: ItemType,
  components: ReadonlyArray<Item>,
  quality?: number,
): Item {
  const avgQuality =
    quality ??
    Math.round(
      components.reduce((sum, c) => sum + c.quality, 0) / components.length,
    )
  return {
    id: `item_${nextItemId++}`,
    type,
    quality: avgQuality,
    positionOnBelt: 0,
    isDefective: false,
    components,
  }
}

export function resetItemIdCounter(): void {
  nextItemId = 1
}
