import { expect } from '@playwright/test'
import type { SimulationProbe } from '../canvas/SimulationProbe'
import type { FactoryGridPage } from '../canvas/FactoryGridPage'
import type { EditorPanelPage } from '../screens/EditorPanelPage'
import type { MachinePanelPage } from '../screens/MachinePanelPage'
import type { MainMenuPage } from '../screens/MainMenuPage'
import type { ToolbarPage } from '../screens/ToolbarPage'

export async function enterSandbox(mainMenu: MainMenuPage, toolbar: ToolbarPage) {
  await mainMenu.open()
  await mainMenu.clickSandbox()
  await toolbar.expectVisible()
  await toolbar.waitForCameraSettle()
}

export async function buildAndRunSandboxFactory(
  mainMenu: MainMenuPage,
  toolbar: ToolbarPage,
  grid: FactoryGridPage,
  machinePanel: MachinePanelPage,
  editorPanel: EditorPanelPage,
  probe: SimulationProbe,
) {
  await enterSandbox(mainMenu, toolbar)
  await grid.expectCanvasVisible()

  await grid.dblClickCell({ x: 10, z: 10 })
  await grid.dblClickCell({ x: 13, z: 10 })

  await grid.clickCell({ x: 13, z: 10 })
  await machinePanel.expectVisible()
  await machinePanel.selectType('factory_output')
  await machinePanel.expectTypeValue('factory_output')
  await machinePanel.clickClose()
  await machinePanel.expectHidden()

  const machines = await probe.getMachines()
  const fabricator = machines.find((m) => m.type === 'part_fabricator')
  const output = machines.find((m) => m.type === 'factory_output')
  expect(fabricator).toBeTruthy()
  expect(output).toBeTruthy()

  const beltPlaced = await probe.placeBeltViaTestApi(
    fabricator!.x, fabricator!.z, output!.x, output!.z,
  )
  expect(beltPlaced).toBe(true)

  await toolbar.clickEditor()
  await editorPanel.expectOpen()
  const programCode =
    'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)\n' +
    'machines.startMachine(Machine.A)'
  await editorPanel.expectFallbackTextareaAttached()
  await editorPanel.setFallbackProgramViaValueAssignment(programCode)
  await toolbar.clickEditor()
  await editorPanel.expectClosed()

  await toolbar.clickStart()
  await expect(async () => {
    const snap = await probe.readSnapshot()
    expect(snap.itemsOnBelts).toBeGreaterThan(0)
  }).toPass({ timeout: 30000, intervals: [250] })
}

export async function waitForRenderedBeltItems(
  probe: SimulationProbe,
  // One-item-per-cell contract: a 3-cell belt can carry at most 3 items,
  // and steady-state with output-consumption typically holds ~2 items in
  // flight. This sentinel is just a "system warmed up" check; the real
  // invariants under test live in the spec assertions themselves.
  minimumCount = 2,
  timeoutMs = 30000,
) {
  await expect(async () => {
    const snap = await probe.readItemInstancePositions()
    expect(snap.totalCount).toBeGreaterThanOrEqual(minimumCount)
  }).toPass({ timeout: timeoutMs, intervals: [200] })
}