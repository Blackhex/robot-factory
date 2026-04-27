import { expect, type Page } from '@playwright/test'
import type { BeltPathSegment, MachineInfo, SimSnapshot } from '../../types'

export class SimulationStateProbe {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async isRunning(): Promise<boolean> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      return !!gm?.simulation?.running
    })
  }

  async isPaused(): Promise<boolean> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      return !!gm?.simulation?.paused
    })
  }

  async getMachines(): Promise<MachineInfo[]> {
    return this.page.evaluate(() => {
      const t = (window as any).__test
      return (t?.getMachines?.() ?? []) as any[]
    })
  }

  async getMachineCount(): Promise<number> {
    return this.page.evaluate(() => {
      const t = (window as any).__test
      return (t?.getMachines?.() ?? []).length
    })
  }

  async getMachineCountFromFactory(): Promise<number> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      return gm?.factory?.getMachines?.().length ?? 0
    })
  }

  async getBeltCount(): Promise<number> {
    return this.page.evaluate(() => {
      const t = (window as any).__test
      return (t?.getBelts?.() ?? []).length
    })
  }

  async getBeltCountFromFactory(): Promise<number> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      return gm?.factory?.getBelts?.().length ?? 0
    })
  }

  async getFirstMachineDisplayName(): Promise<string> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const m = gm?.factory?.getMachines?.()[0]
      return (m?.name ?? m?.type ?? '') as string
    })
  }

  async readSnapshot(): Promise<SimSnapshot> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const factory = gm?.factory
      const sim = gm?.simulation
      if (!factory || !sim) {
        return {
          running: false,
          machineCount: 0,
          beltCount: 0,
          itemsOnBelts: 0,
          beltItemCounts: [],
          machineStates: [],
        }
      }
      const beltMap = sim.getBelts() as Map<string, any>
      const beltItemCounts: number[] = []
      beltMap.forEach((b: any) => beltItemCounts.push(b.getItems().length))
      const itemsOnBelts = beltItemCounts.reduce((a: number, b: number) => a + b, 0)
      const machineMap = sim.getMachines() as Map<string, any>
      const machineStates: any[] = []
      machineMap.forEach((m: any) => {
        machineStates.push({
          id: m.id,
          state: m.state,
          inputSlots: m.inputSlots.length,
          outputSlot: m.outputSlot != null,
          consumedItems: m.consumedItems,
        })
      })
      return {
        running: !!sim.running,
        machineCount: machineMap.size,
        beltCount: beltMap.size,
        itemsOnBelts,
        beltItemCounts,
        machineStates,
      }
    })
  }

  async readSimItemIdsPerBelt(): Promise<string[][]> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const sim = gm?.simulation
      if (!sim) return [] as string[][]
      const beltMap = sim.getBelts() as Map<string, any>
      const out: string[][] = []
      beltMap.forEach((b: any) => {
        out.push(b.getItems().map((it: any) => String(it.id)))
      })
      return out
    })
  }

  /**
   * Returns sim items keyed by the stable per-cell coordinate key
   * `${fromX},${fromZ}->${toX},${toZ}`. Belt segment IDs change across
   * re-routes (each placeBeltChain mints fresh `belt_<n>_seg<i>` ids), so
   * specs that need to compare per-belt item identity across machine moves
   * MUST key by physical cell coordinates rather than belt segment id.
   */
  async readSimItemsByCellKey(): Promise<
    Array<{ cellKey: string; items: Array<{ id: string; position: number }> }>
  > {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const sim = gm?.simulation
      if (!sim) return [] as Array<{ cellKey: string; items: Array<{ id: string; position: number }> }>
      const beltMap = sim.getBelts() as Map<string, any>
      const out: Array<{ cellKey: string; items: Array<{ id: string; position: number }> }> = []
      beltMap.forEach((b: any) => {
        const cellKey = `${b.fromX},${b.fromZ}->${b.toX},${b.toZ}`
        const items = b.getItems().map((it: any) => ({
          id: String(it.id),
          position: Number(it.positionOnBelt),
        }))
        out.push({ cellKey, items })
      })
      out.sort((a, b) => a.cellKey.localeCompare(b.cellKey))
      return out
    })
  }

  async readBeltPathSegments(): Promise<BeltPathSegment[]> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const factory = gm?.factory
      if (!factory) return []
      const W: number = factory.width
      const H: number = factory.height
      const halfW = W / 2
      const halfH = H / 2
      const segments: Array<{ ax: number; az: number; bx: number; bz: number }> = []
      const belts = factory.getBelts() as Array<{ path: Array<{ x: number; z: number }> }>
      for (const belt of belts) {
        const path = belt.path
        if (!path || path.length < 2) continue
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i]
          const b = path[i + 1]
          segments.push({
            ax: a.x - halfW + 0.5,
            az: a.z - halfH + 0.5,
            bx: b.x - halfW + 0.5,
            bz: b.z - halfH + 0.5,
          })
        }
      }
      return segments
    })
  }

  async expectCurrentBeltPathHasSegments(message: string): Promise<void> {
    const segments = await this.readBeltPathSegments()
    expect(segments.length, message).toBeGreaterThan(0)
  }
}