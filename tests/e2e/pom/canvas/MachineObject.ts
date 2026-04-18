import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import type { GridCoord } from '../types'
import type { SimulationProbe } from './SimulationProbe'
import type { FactoryGridPage } from './FactoryGridPage'

/**
 * Page Object representing a single machine at a grid coordinate. Currently
 * a thin wrapper around the FactoryGridPage + SimulationProbe; provided so
 * specs can talk in domain terms (`machineAt(coord).clickToSelect()`).
 */
export class MachineObject {
  private readonly grid: FactoryGridPage
  private readonly probe: SimulationProbe
  private readonly coord: GridCoord

  constructor(
    _page: Page,
    grid: FactoryGridPage,
    probe: SimulationProbe,
    coord: GridCoord,
  ) {
    this.grid = grid
    this.probe = probe
    this.coord = coord
  }

  async clickToSelect(): Promise<void> {
    await this.grid.clickMachineAt(this.coord)
  }

  async expectExists(): Promise<void> {
    const machines = await this.probe.getMachines()
    expect(
      machines.find((m) => m.x === this.coord.x && m.z === this.coord.z),
      `expected a machine at (${this.coord.x}, ${this.coord.z})`,
    ).toBeTruthy()
  }
}
