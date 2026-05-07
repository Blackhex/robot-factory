import { test } from './pom'
import {
  buildFabricatorToDestinationLayout,
  setProgramAndStart,
} from './pom/scenarios/SandboxFactoryScenario'

test.describe.configure({ mode: 'serial' })

test.use({ viewport: { width: 1920, height: 1080 } })

const FABRICATOR_ONLY_PROGRAM = [
  'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)',
  'machines.startMachine(Machine.A)',
].join('\n')

test.describe('Sandbox — Game Over modal', () => {
  test('game-over modal appears when an item reaches a disabled factory_output', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe, gameOverModal,
  }) => {
    test.setTimeout(90000)

    await buildFabricatorToDestinationLayout(
      mainMenu,
      toolbar,
      grid,
      machinePanel,
      probe,
      'factory_output',
    )

    await setProgramAndStart(toolbar, editorPanel, FABRICATOR_ONLY_PROGRAM)

    await gameOverModal.expectVisible(30_000)
    await gameOverModal.expectTitleText('Game Over')
    await gameOverModal.expectMessageText(
      "The Shipper is stopped, so it can't accept Small Wheel. Start the Shipper and try again.",
    )
    await gameOverModal.expectRestartButtonVisible()

    await gameOverModal.clickRestart()
    await gameOverModal.expectHidden()
  })

  test('game-over modal includes the stopped machine display name when a named shipper is disabled', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe, gameOverModal,
  }) => {
    test.setTimeout(90000)

    const shipperName = 'North Dock Shipper'

    await buildFabricatorToDestinationLayout(
      mainMenu,
      toolbar,
      grid,
      machinePanel,
      probe,
      'factory_output',
    )

    await grid.clickCell({ x: 13, z: 10 })
    await machinePanel.expectVisible()
    await machinePanel.expectTypeValue('factory_output')
    await machinePanel.setName(shipperName)
    await machinePanel.expectNameValue(shipperName)
    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    await grid.clickCell({ x: 13, z: 10 })
    await machinePanel.expectVisible()
    await machinePanel.expectTypeValue('factory_output')
    await machinePanel.expectNameValue(shipperName)
    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    await setProgramAndStart(toolbar, editorPanel, FABRICATOR_ONLY_PROGRAM)

    await gameOverModal.expectVisible(30_000)
    await gameOverModal.expectTitleText('Game Over')
    await gameOverModal.expectMessageText(
      `The ${shipperName} is stopped, so it can't accept Small Wheel. Start the ${shipperName} and try again.`,
    )
    await gameOverModal.expectRestartButtonVisible()
  })

  test('game-over modal appears when an item reaches a disabled quality_checker on first arrival', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe, gameOverModal,
  }) => {
    test.setTimeout(90000)

    await buildFabricatorToDestinationLayout(
      mainMenu,
      toolbar,
      grid,
      machinePanel,
      probe,
      'quality_checker',
    )

    await setProgramAndStart(toolbar, editorPanel, FABRICATOR_ONLY_PROGRAM)

    await gameOverModal.expectVisible(30_000)
    await gameOverModal.expectTitleText('Game Over')
    await gameOverModal.expectMessageText(
      "The Checker is stopped, so it can't accept Small Wheel. Start the Checker and try again.",
    )
    await gameOverModal.expectRestartButtonVisible()

    await gameOverModal.clickRestart()
    await gameOverModal.expectHidden()
  })
})