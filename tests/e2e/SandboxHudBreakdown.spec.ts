import { test, expect } from './pom'
import { buildAndRunSandboxFactory } from './pom/scenarios/SandboxFactoryScenario'

// Use a wide viewport so the editor + canvas behave like the rest of the sandbox suite.
test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('Sandbox HUD — five-row Parts/Assemblies/Robots/Time/Quality breakdown', () => {
  test('HUD shows five metric rows in order and no legacy "Items Delivered" row', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, hud, probe,
  }) => {
    test.setTimeout(90000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)
    await hud.expectVisible()

    await hud.expectMetricLabelsInOrder([
      'Parts',
      'Assemblies',
      'Robots',
      'Time',
      'Quality',
    ])

    const allLabels = await hud.getMetricLabels()
    expect(allLabels).not.toContain('Items Delivered')
  })

  test('HUD updates Parts > 0 and Quality > 0% during a running sandbox', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, hud, probe,
  }) => {
    test.setTimeout(90000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)
    await hud.expectVisible()

    // Parts counter must climb above zero once the fabricator → shipper chain delivers items.
    await hud.expectMetricValue('Parts', (v) => Number.parseInt(v, 10) > 0, 45000)

    // Quality must report a non-zero percentage once parts have been delivered without defects.
    await hud.expectMetricValue('Quality', (v) => {
      const match = /^(\d+)%$/.exec(v)
      return match !== null && Number.parseInt(match[1], 10) > 0
    }, 45000)

    // Time format must remain m:ss (single-digit minute, two-digit seconds).
    const timeValue = await hud.getMetricValue('Time')
    expect(timeValue).toMatch(/^\d+:\d{2}$/)
  })
})
