import { expect } from '@playwright/test'
import type { FactoryGridPage } from '../canvas/FactoryGridPage'
import type { MachinePanelPage } from '../screens/MachinePanelPage'
import type { TutorialOverlayPage } from '../screens/TutorialOverlayPage'
import type { SimulationProbe } from '../canvas/SimulationProbe'
import type { MachineInfo } from '../types'

export interface ThreeMachineChainOptions {
  grid: FactoryGridPage
  machinePanel: MachinePanelPage
  tutorial: TutorialOverlayPage
  probe: SimulationProbe
  /** Coord where the starting Fabricator is double-clicked into existence. */
  fabricatorAt: { x: number; z: number }
  /** Middle machine: placed via dblClick then retyped via machine panel. */
  middleAt: { x: number; z: number }
  middleType: string
  /** Output (factory_output) machine coord. */
  outputAt: { x: number; z: number }
  /**
   * If true, run the standard "dismiss tutorial if visible" probe. If
   * false, the caller has already advanced the tutorial explicitly.
   */
  dismissTutorial: boolean
}

export interface ThreeMachineChainResult {
  fabricator: MachineInfo
  middle: MachineInfo
  output: MachineInfo
}

/**
 * Repeated build-phase seed used across Levels 4, 5, 7, 8: dismiss tutorial,
 * place a Fabricator + a retyped middle machine + a factory_output, connect
 * fabricator → middle → output with two belts via the test API. Preserves
 * every assertion that was previously inlined in each level test.
 */
export async function seedThreeMachineChain(
  opts: ThreeMachineChainOptions,
): Promise<ThreeMachineChainResult> {
  const { grid, machinePanel, tutorial, probe } = opts

  if (opts.dismissTutorial && (await tutorial.isVisibleNow(2000))) {
    await tutorial.dismissIfPresent(1000)
  }

  // Fabricator (the default machine type for an empty cell dblClick).
  await grid.dblClickCell(opts.fabricatorAt)
  let machines = await probe.getMachines()
  expect(machines.length).toBe(1)
  expect(machines[0].type).toBe('part_fabricator')

  // Middle machine — placed then retyped.
  await placeAndChangeType(grid, machinePanel, opts.middleAt, opts.middleType)
  machines = await probe.getMachines()
  expect(machines.length).toBe(2)

  // Factory output.
  await placeAndChangeType(grid, machinePanel, opts.outputAt, 'factory_output')
  machines = await probe.getMachines()
  expect(machines.length).toBe(3)

  const fabricator = machines.find(
    (m) => m.type === 'part_fabricator' && m.x === opts.fabricatorAt.x && m.z === opts.fabricatorAt.z,
  )
  const middle = machines.find(
    (m) => m.type === opts.middleType && m.x === opts.middleAt.x && m.z === opts.middleAt.z,
  )
  const output = machines.find(
    (m) => m.type === 'factory_output' && m.x === opts.outputAt.x && m.z === opts.outputAt.z,
  )
  expect(fabricator).toBeTruthy()
  expect(middle).toBeTruthy()
  expect(output).toBeTruthy()

  expect(
    await probe.placeBeltViaTestApi(fabricator!.x, fabricator!.z, middle!.x, middle!.z),
  ).toBe(true)
  expect(
    await probe.placeBeltViaTestApi(middle!.x, middle!.z, output!.x, output!.z),
  ).toBe(true)
  expect(await probe.getBeltCount()).toBeGreaterThanOrEqual(2)

  return { fabricator: fabricator!, middle: middle!, output: output! }
}

async function placeAndChangeType(
  grid: FactoryGridPage,
  machinePanel: MachinePanelPage,
  coord: { x: number; z: number },
  newType: string,
): Promise<void> {
  await grid.dblClickCell(coord)
  await grid.clickCell(coord)
  await machinePanel.expectVisible()
  await machinePanel.selectType(newType)
  await machinePanel.expectTypeValue(newType)
  await machinePanel.clickClose()
  await machinePanel.expectHidden()
}
