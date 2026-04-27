import { expect, type Page } from '@playwright/test'
import type { OutputDeliveryRecorderState, OutputDeliverySnapshot } from '../../types'

export class OutputDeliveryProbe {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async startOutputDeliveryRecording(): Promise<void> {
    await this.page.evaluate(() => {
      const w = window as any
      if (w.__rfE2eOutputDeliveryRecorderAttached) return
      w.__rfE2eOutputDeliveries = []
      const sim = w.__gameManager?.simulation
      if (!sim || typeof sim.on !== 'function') return
      sim.on('output_delivered', (event: any) => {
        w.__rfE2eOutputDeliveries.push({
          itemId: event.data.itemId,
          itemType: event.data.itemType,
          machineId: event.data.machineId,
          tick: event.tick,
        })
      })
      w.__rfE2eOutputDeliveryRecorderAttached = true
    })
  }

  async resetOutputDeliveryRecording(): Promise<void> {
    await this.page.evaluate(() => {
      const w = window as any
      delete w.__rfE2eOutputDeliveryRecorderAttached
      w.__rfE2eOutputDeliveries = []
    })
  }

  async readOutputDeliveryRecorderState(): Promise<OutputDeliveryRecorderState> {
    return this.page.evaluate(() => {
      const w = window as any
      const sim = w.__gameManager?.simulation
      const handlers = sim?.handlers as Map<string, unknown[]> | undefined
      const outputHandlers = handlers?.get?.('output_delivered') ?? []
      return {
        hasSimulation: !!sim,
        attachedFlag: !!w.__rfE2eOutputDeliveryRecorderAttached,
        listenerCount: outputHandlers.length,
      }
    })
  }

  async readOutputDeliveries(): Promise<OutputDeliverySnapshot[]> {
    return this.page.evaluate(() => {
      return ((window as any).__rfE2eOutputDeliveries ?? []) as OutputDeliverySnapshot[]
    })
  }

  async waitForOutputDelivery(
    itemId: string,
    machineId: string,
    timeoutMs = 30000,
  ): Promise<OutputDeliverySnapshot> {
    let matchingDelivery: OutputDeliverySnapshot | undefined

    await expect(async () => {
      const deliveries = await this.readOutputDeliveries()
      matchingDelivery = deliveries.find((delivery) =>
        delivery.itemId === itemId && delivery.machineId === machineId,
      )
      expect(matchingDelivery).toBeTruthy()
    }).toPass({ timeout: timeoutMs, intervals: [250] })

    return matchingDelivery!
  }
}