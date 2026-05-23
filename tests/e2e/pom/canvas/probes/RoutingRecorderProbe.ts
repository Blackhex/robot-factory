import type { Page } from '@playwright/test'

export interface ProducedItemRecord {
  itemId: string
  itemType: string
  machineId: string
  isDefective: boolean
  tick: number
}

export interface DeliveredItemRecord {
  itemId: string
  machineId: string
  tick: number
}

export interface DiscardedItemRecord {
  itemId: string
  machineId: string
  reason: string
  tick: number
}

export interface RoutingSnapshot {
  produced: ProducedItemRecord[]
  delivered: DeliveredItemRecord[]
  discarded: DiscardedItemRecord[]
}

/**
 * Records every item produced by a target machine (capturing the
 * `isDefective` flag at emission time) and every subsequent arrival at
 * any machine. Used to assert strict per-item routing invariants.
 */
export class RoutingRecorderProbe {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async startRecording(producerMachineId: string): Promise<void> {
    await this.page.evaluate((producerId) => {
      const w = window as any
      if (w.__rfE2eRoutingAttached) return
      w.__rfE2eRoutingProduced = []
      w.__rfE2eRoutingDelivered = []
      w.__rfE2eRoutingDiscarded = []
      const sim = w.__gameManager?.simulation
      if (!sim || typeof sim.on !== 'function') return
      sim.on('item_produced', (event: any) => {
        const data = event.data
        if (data.machineId !== producerId) return
        const m = sim.getMachines().get(producerId)
        let isDefective: boolean | null = null
        const candidates = [m?.outputSlot, m?.secondaryOutputSlot, m?.tertiaryOutputSlot]
        for (const slot of candidates) {
          if (slot && slot.id === data.itemId) {
            isDefective = !!slot.isDefective
            break
          }
        }
        w.__rfE2eRoutingProduced.push({
          itemId: data.itemId,
          itemType: data.itemType,
          machineId: data.machineId,
          isDefective: isDefective ?? false,
          tick: event.tick,
        })
      })
      sim.on('item_delivered', (event: any) => {
        const data = event.data
        w.__rfE2eRoutingDelivered.push({
          itemId: data.itemId,
          machineId: data.machineId,
          tick: event.tick,
        })
      })
      sim.on('item_discarded', (event: any) => {
        const data = event.data
        w.__rfE2eRoutingDiscarded.push({
          itemId: data.itemId,
          machineId: data.machineId,
          reason: data.reason,
          tick: event.tick,
        })
      })
      w.__rfE2eRoutingAttached = true
    }, producerMachineId)
  }

  async readSnapshot(): Promise<RoutingSnapshot> {
    return this.page.evaluate(() => {
      const w = window as any
      return {
        produced: (w.__rfE2eRoutingProduced ?? []) as ProducedItemRecord[],
        delivered: (w.__rfE2eRoutingDelivered ?? []) as DeliveredItemRecord[],
        discarded: (w.__rfE2eRoutingDiscarded ?? []) as DiscardedItemRecord[],
      }
    }) as Promise<RoutingSnapshot>
  }

  async getProducedCount(): Promise<number> {
    return this.page.evaluate(() => {
      const w = window as any
      return ((w.__rfE2eRoutingProduced ?? []) as unknown[]).length
    })
  }
}
