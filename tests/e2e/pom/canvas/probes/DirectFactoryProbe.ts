import type { Page } from '@playwright/test'

type BeltChainPlacementResult = {
  placed: boolean
  beltCount: number
  machineA: { x: number; z: number }
  machineB: { x: number; z: number }
} | null

export class DirectFactoryProbe {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async placeBeltViaTestApi(
    sx: number,
    sz: number,
    dx: number,
    dz: number,
  ): Promise<boolean> {
    return this.page.evaluate(
      ({ sx, sz, dx, dz }) =>
        (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false,
      { sx, sz, dx, dz },
    )
  }

  async placeBeltChainViaFactory(): Promise<BeltChainPlacementResult> {
    return this.placeBeltChainBetweenFirstMachines()
  }

  async placeBeltChainViaFactoryUsingMachineRefs(): Promise<BeltChainPlacementResult> {
    return this.placeBeltChainBetweenFirstMachines()
  }

  async placeMachineDirect(x: number, z: number, type: string): Promise<boolean> {
    return this.page.evaluate(
      ({ x, z, type }) => {
        const gm = (window as any).__gameManager
        const placed = gm?.factory?.placeMachine?.(x, z, type)
        const r = (window as any).__getFactoryRenderer?.()
        r?.update?.()
        return !!placed
      },
      { x, z, type },
    )
  }

  async setMachineRotationDirect(x: number, z: number, rotation: string): Promise<boolean> {
    return this.rotateMachineViaFactory(x, z, rotation)
  }

  async rotateMachineDirect(x: number, z: number, rotation: string): Promise<boolean> {
    return this.rotateMachineViaFactory(x, z, rotation)
  }

  private async placeBeltChainBetweenFirstMachines(): Promise<BeltChainPlacementResult> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      if (!gm?.factory) return null
      const f = gm.factory
      const machines = f.getMachines()
      if (machines.length < 2) return null
      const [mA, mB] = machines
      const placed = f.placeBeltChain(mA, mB, 'output')
      return {
        placed,
        beltCount: f.getBelts().length,
        machineA: { x: mA.x, z: mA.z },
        machineB: { x: mB.x, z: mB.z },
      }
    })
  }

  private async rotateMachineViaFactory(x: number, z: number, rotation: string): Promise<boolean> {
    return this.page.evaluate(
      ({ x, z, rotation }) => {
        const gm = (window as any).__gameManager
        const m = gm?.factory?.getMachineAt?.(x, z)
        if (!m) return false
        const ok = gm.factory.rotateMachine(m, rotation)
        const r = (window as any).__getFactoryRenderer?.()
        r?.update?.()
        return !!ok
      },
      { x, z, rotation },
    )
  }

  async removeFirstBeltDirect(): Promise<boolean> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const belts = gm?.factory?.getBelts?.() ?? []
      if (belts.length === 0) return false
      const ok = gm.factory.removeBeltById(belts[0].id)
      const r = (window as any).__getFactoryRenderer?.()
      r?.update?.()
      return !!ok
    })
  }

  async moveMachineDirect(
    fromX: number, fromZ: number, toX: number, toZ: number,
  ): Promise<boolean> {
    return this.page.evaluate(
      ({ fromX, fromZ, toX, toZ }) => {
        const gm = (window as any).__gameManager
        const ok = gm?.factory?.moveMachine?.(fromX, fromZ, toX, toZ)
        const r = (window as any).__getFactoryRenderer?.()
        r?.update?.()
        return !!ok
      },
      { fromX, fromZ, toX, toZ },
    )
  }

  async getMachineRotation(x: number, z: number): Promise<string | null> {
    return this.page.evaluate(
      ({ x, z }) => {
        const gm = (window as any).__gameManager
        const m = gm?.factory?.getMachineAt?.(x, z)
        return m ? m.rotation : null
      },
      { x, z },
    )
  }

  async placeBeltChainBetween(
    sx: number, sz: number, dx: number, dz: number,
  ): Promise<boolean> {
    return this.page.evaluate(
      ({ sx, sz, dx, dz }) => {
        const gm = (window as any).__gameManager
        const f = gm?.factory
        if (!f) return false
        const src = f.getMachineAt(sx, sz)
        const dst = f.getMachineAt(dx, dz)
        if (!src || !dst) return false
        const ok = f.placeBeltChain(src, dst, 'output')
        const r = (window as any).__getFactoryRenderer?.()
        r?.update?.()
        return !!ok
      },
      { sx, sz, dx, dz },
    )
  }

  async getBeltsDetailed(): Promise<Array<{
    id: string
    sourceX: number; sourceZ: number; sourceSlot: string
    destX: number; destZ: number; destSlot: string
  }>> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const belts = gm?.factory?.getBelts?.() ?? []
      return belts.map((b: any) => ({
        id: b.id,
        sourceX: b.sourceMachine.x,
        sourceZ: b.sourceMachine.z,
        sourceSlot: b.sourceSlot,
        destX: b.destinationMachine.x,
        destZ: b.destinationMachine.z,
        destSlot: b.destinationSlot,
      }))
    })
  }
}