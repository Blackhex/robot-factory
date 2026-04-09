import type { Item } from './Item.ts'

export class ConveyorBelt {
  readonly id: string
  readonly fromX: number
  readonly fromZ: number
  readonly toX: number
  readonly toZ: number
  speed: number
  private items: Item[] = []

  constructor(
    id: string,
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    speed = 1.0,
  ) {
    this.id = id
    this.fromX = fromX
    this.fromZ = fromZ
    this.toX = toX
    this.toZ = toZ
    this.speed = speed
  }

  addItem(item: Item): boolean {
    // Don't add if there's already an item near the start
    if (this.items.length > 0) {
      const first = this.items[0]
      if (first.positionOnBelt < 0.15) return false
    }
    item.positionOnBelt = 0
    this.items.push(item)
    this.sortItems()
    return true
  }

  advance(dt = 0.1): void {
    const delta = this.speed * dt
    for (const item of this.items) {
      item.positionOnBelt = Math.min(item.positionOnBelt + delta, 1.0)
    }
  }

  getReadyItems(): ReadonlyArray<Item> {
    return this.items.filter((item) => item.positionOnBelt >= 1.0)
  }

  removeItem(itemId: string): boolean {
    const idx = this.items.findIndex((item) => item.id === itemId)
    if (idx === -1) return false
    this.items.splice(idx, 1)
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
