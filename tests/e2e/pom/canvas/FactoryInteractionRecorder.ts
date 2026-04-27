import { expect, type Page } from '@playwright/test'
import type { GridCoord } from '../types'
import type { RaycastInteractionProbe } from './RaycastInteractionProbe'

export class FactoryInteractionRecorder {
  private readonly page: Page
  private readonly raycast: RaycastInteractionProbe

  constructor(page: Page, raycast: RaycastInteractionProbe) {
    this.page = page
    this.raycast = raycast
  }

  async startMoveMachineRecording(): Promise<void> {
    await this.page.evaluate(() => {
      const factory = (window as any).__gameManager?.factory
      if (!factory) throw new Error('Cannot record machine moves before the factory is ready')
      if (!factory.__e2eMoveMachineRecorderInstalled) {
        const original = factory.moveMachine.bind(factory)
        const originalCanMove = factory.canMoveMachine.bind(factory)
        factory.canMoveMachine = (fromX: number, fromZ: number, toX: number, toZ: number) => {
          const result = originalCanMove(fromX, fromZ, toX, toZ)
          ;(window as any).__e2eLastCanMoveMachineAttempt = { fromX, fromZ, toX, toZ, result }
          return result
        }
        factory.moveMachine = (fromX: number, fromZ: number, toX: number, toZ: number) => {
          const result = original(fromX, fromZ, toX, toZ)
          ;(window as any).__e2eLastMoveMachineAttempt = { fromX, fromZ, toX, toZ, result }
          return result
        }
        factory.__e2eMoveMachineRecorderInstalled = true
      }
      ;(window as any).__e2eLastMoveMachineAttempt = null
      ;(window as any).__e2eLastCanMoveMachineAttempt = null
    })
  }

  async expectMoveMachineAttempt(from: GridCoord, to: GridCoord): Promise<void> {
    const attempt = await this.page.evaluate(() => (window as any).__e2eLastMoveMachineAttempt ?? null)
    const canMoveAttempt = await this.page.evaluate(() => (window as any).__e2eLastCanMoveMachineAttempt ?? null)
    expect(
      attempt,
      `Expected the renderer drop path to call factory.moveMachine from ` +
        `(${from.x}, ${from.z}) to (${to.x}, ${to.z}); ` +
        `last canMoveMachine attempt was ${JSON.stringify(canMoveAttempt)}`,
    ).toEqual({ fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, result: true })
  }

  async startBeltPlacementRecording(): Promise<void> {
    await this.page.evaluate(() => {
      const factory = (window as any).__gameManager?.factory
      if (!factory) throw new Error('Cannot record belt placements before the factory is ready')
      if (!factory.__e2eBeltPlacementRecorderInstalled) {
        const original = factory.placeBeltChain.bind(factory)
        factory.placeBeltChain = (source: any, destination: any, sourceSlotType?: any, opts?: any) => {
          const result = original(source, destination, sourceSlotType, opts)
          ;(window as any).__e2eLastPlaceBeltChainAttempt = {
            sourceX: source?.x,
            sourceZ: source?.z,
            destX: destination?.x,
            destZ: destination?.z,
            sourceSlotType,
            sourceSlotPosition: opts?.sourceSlotPosition,
            targetSlotPosition: opts?.targetSlotPosition,
            fixedRotations: opts?.fixedRotations,
            result,
          }
          return result
        }
        factory.__e2eBeltPlacementRecorderInstalled = true
      }
      ;(window as any).__e2eLastPlaceBeltChainAttempt = null
    })
  }

  async expectBeltPlacementAttempt(from: GridCoord, to: GridCoord): Promise<void> {
    const attempt = await this.page.evaluate(() => (window as any).__e2eLastPlaceBeltChainAttempt ?? null)
    const raycastHit = await this.raycast.readRecordedInteraction()
    if (!attempt) {
      throw new Error(
        `Expected slot drag to attempt belt placement from (${from.x}, ${from.z}) to (${to.x}, ${to.z}); ` +
          `last renderer raycast hit was ${JSON.stringify(raycastHit)}`,
      )
    }
    expect(
      attempt,
      `Expected slot drag to attempt belt placement from (${from.x}, ${from.z}) to (${to.x}, ${to.z}); ` +
        `last renderer raycast hit was ${JSON.stringify(raycastHit)}`,
    ).toMatchObject({ sourceX: from.x, sourceZ: from.z, destX: to.x, destZ: to.z, result: true })
  }
}