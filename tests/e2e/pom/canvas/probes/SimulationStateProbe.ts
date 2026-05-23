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

  /**
   * Returns `Simulation.currentTick` — the number of ticks the simulation
   * has executed since (re)start. Use this for tick-budget polling in
   * specs that need to be deterministic under host throttling instead of
   * relying on wall-clock `settle(ms)` windows.
   */
  async getCurrentTick(): Promise<number> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const t = gm?.simulation?.currentTick
      return typeof t === 'number' ? t : 0
    })
  }

  /** Read the current `GameManager` state string (e.g. `'main_menu'`, `'sandbox'`, `'build_phase'`). */
  async getGameState(): Promise<string> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      return (gm?.getCurrentState?.() ?? '') as string
    })
  }

  /** Polling assertion that the GameManager state equals `expected`. */
  async expectGameState(expected: string, timeoutMs = 5000): Promise<void> {
    await expect(async () => {
      const actual = await this.getGameState()
      expect(actual).toBe(expected)
    }).toPass({ timeout: timeoutMs, intervals: [100] })
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
          let ax = a.x - halfW + 0.5
          let az = a.z - halfH + 0.5
          const bx = b.x - halfW + 0.5
          const bz = b.z - halfH + 0.5
          // The renderer's chain-start straight cell extends its path
          // backward from the source machine cell center by half a cell
          // (entry-edge midpoint → exit-edge midpoint) to enable smooth
          // handover from a phantom "upstream" cell. For the FIRST
          // segment of a belt path, items at low positionOnBelt
          // therefore render UPSTREAM of `a` (the source machine cell
          // center) by up to half a cell. To keep the on-belt-path
          // check consistent with what the renderer actually draws,
          // extend this segment's `a` endpoint backward by half a cell
          // along the segment's direction. Without this extension,
          // freshly emitted items at positionOnBelt ≈ 0 right after a
          // mid-sim machine rotate (or move) read as ghost items even
          // though they sit on the renderer's actual rendered path.
          if (i === 0) {
            const dx = bx - ax
            const dz = bz - az
            const len = Math.hypot(dx, dz)
            if (len > 0) {
              ax -= (dx / len) * 0.5
              az -= (dz / len) * 0.5
            }
          }
          segments.push({ ax, az, bx, bz })
        }
      }
      return segments
    })
  }

  async expectCurrentBeltPathHasSegments(message: string): Promise<void> {
    const segments = await this.readBeltPathSegments()
    expect(segments.length, message).toBeGreaterThan(0)
  }

  async readDiagnosticSnapshot(): Promise<any> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const sim = gm?.simulation
      const factory = gm?.factory
      if (!sim || !factory) return { error: 'no sim/factory' }
      const machines: any[] = []
      const machineMap = sim.getMachines() as Map<string, any>
      machineMap.forEach((m: any) => {
        machines.push({
          id: m.id,
          machineType: m.machineType,
          x: m.x,
          z: m.z,
          enabled: !!m.enabled,
          state: m.state,
          // `Machine.speed` is the per-machine processing-rate multiplier
          // mutated by the `SET_MACHINE_SPEED` command. Defaults to 1.
          speed: typeof m.speed === 'number' ? m.speed : null,
          currentRecipeId: m.currentRecipe?.id ?? null,
          processingTimer: m.processingTimer,
          consumedItems: m.consumedItems,
          inputSlotsCount: m.inputSlots.length,
          inputSlotTypes: m.inputSlots.map((it: any) => it?.type),
          outputSlotType: m.outputSlot?.type ?? null,
          secondaryOutputSlotType: m.secondaryOutputSlot?.type ?? null,
          tertiaryOutputSlotType: m.tertiaryOutputSlot?.type ?? null,
          // Splitter routing bitfield: persistent config mutated by the
          // `routeItemsTo` block (via SET_OUTPUT_SIDES). Default 7 = all
          // three sides enabled (round-robin). A value of 1/2/4 means the
          // splitter is pinned to Left / Forward / Right respectively.
          outputSidesConfig: typeof m.outputSidesConfig === 'number' ? m.outputSidesConfig : null,
        })
      })
      // Augment with positions from factory (sim machine map may not carry x/z directly).
      const factMachines = factory.getMachines() as any[]
      for (const fm of factMachines) {
        const found = machines.find((m) => m.id === fm.id)
        if (found) {
          found.x = fm.x
          found.z = fm.z
        }
      }
      const beltMap = sim.getBelts() as Map<string, any>
      const belts: any[] = []
      beltMap.forEach((b: any) => {
        belts.push({
          id: b.id,
          fromX: b.fromX,
          fromZ: b.fromZ,
          toX: b.toX,
          toZ: b.toZ,
          // `ConveyorBelt.speed` is the per-belt transport-rate multiplier
          // mutated by the `SET_BELT_SPEED` command. Defaults to 1.0.
          speed: typeof b.speed === 'number' ? b.speed : null,
          itemCount: b.getItems().length,
          itemTypes: b.getItems().map((it: any) => it?.type),
        })
      })
      return {
        running: !!sim.running,
        paused: !!sim.paused,
        currentTick: sim.currentTick,
        itemsProduced: sim.itemsProduced,
        itemsDelivered: sim.itemsDelivered,
        outputsDelivered: sim.outputsDelivered,
        gameOver: sim.gameOver ?? null,
        machines,
        belts,
      }
    })
  }
}