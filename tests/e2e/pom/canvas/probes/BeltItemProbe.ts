import { expect, type Page } from '@playwright/test'
import type { BeltItemSnapshot } from '../../types'

export class BeltItemProbe {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async readBeltItems(): Promise<BeltItemSnapshot[]> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const sim = gm?.simulation
      if (!sim) return []
      const items: any[] = []
      const beltMap = sim.getBelts() as Map<string, any>
      beltMap.forEach((belt: any, beltId: string) => {
        for (const item of belt.getItems()) {
          items.push({
            id: item.id,
            type: item.type,
            quality: item.quality,
            positionOnBelt: item.positionOnBelt,
            beltId,
            fromX: belt.fromX,
            fromZ: belt.fromZ,
            toX: belt.toX,
            toZ: belt.toZ,
          })
        }
      })
      return items
    })
  }

  async waitForBeltItem(options?: {
    itemId?: string
    minPositionOnBelt?: number
    maxPositionOnBelt?: number
    timeoutMs?: number
  }): Promise<BeltItemSnapshot> {
    const minPosition = options?.minPositionOnBelt ?? 0
    const maxPosition = options?.maxPositionOnBelt ?? 1
    let matchingItem: BeltItemSnapshot | undefined

    await expect(async () => {
      const items = await this.readBeltItems()
      matchingItem = items.find((item) =>
        (options?.itemId === undefined || item.id === options.itemId) &&
        item.positionOnBelt >= minPosition &&
        item.positionOnBelt <= maxPosition,
      )
      expect(
        matchingItem,
        `Expected ${options?.itemId ?? 'an item'} on a live belt with ` +
          `positionOnBelt between ${minPosition} and ${maxPosition}`,
      ).toBeTruthy()
    }).toPass({ timeout: options?.timeoutMs ?? 30000, intervals: [100] })

    return matchingItem!
  }
}