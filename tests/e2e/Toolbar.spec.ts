import { test, expect } from './pom'

test.use({ viewport: { width: 1600, height: 900 } })

test.describe('Toolbar — Pause / Resume button', () => {
  // Keyboard shortcut coverage for the same lifecycle lives in
  // SimulationKeyboardShortcuts.spec.ts so the suite keeps distinct click-vs-hotkey assertions.
  test('Pause button toggles to Resume and pauses the simulation, then back', async ({
    mainMenu,
    toolbar,
    probe,
  }) => {
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle(800)

    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()

    await expect.poll(() => probe.isRunning(), { timeout: 5000 }).toBe(true)

    await toolbar.expectPauseButtonVisible()
    await toolbar.expectPauseButtonText('Pause')
    expect(await probe.isPaused()).toBe(false)

    await toolbar.clickPause()
    await toolbar.expectPauseButtonText('Resume')
    await expect.poll(() => probe.isPaused(), { timeout: 2000 }).toBe(true)

    await toolbar.clickPause()
    await toolbar.expectPauseButtonText('Pause')
    await expect.poll(() => probe.isPaused(), { timeout: 2000 }).toBe(false)
    expect(await probe.isRunning()).toBe(true)
  })
})
