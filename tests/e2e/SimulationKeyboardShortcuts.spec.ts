import { test, expect, clearStorageBeforeEach, CameraStateProbe } from './pom'

// Wider viewport so the toolbar layout, HUD, and Projects panel all fit
// comfortably and canvas reflows produce measurable deltas (matches the
// pattern already used by ProjectsPanelKeyboardToggle.spec.ts and
// CameraKeyboardPan.spec.ts).
test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('Simulation keyboard shortcuts — F / R / Space / Esc', () => {
  clearStorageBeforeEach()

  // -------------------------------------------------------------------
  // F — start / pause / resume cycle (keyboard equivalent of the button
  // flow covered in Toolbar.spec.ts)
  // -------------------------------------------------------------------

  test('F starts, pauses, and resumes the sandbox simulation', async ({
    mainMenu, toolbar, tutorial, projectsPanel, hud, probe, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()

    // Baseline: simulation is idle, HUD hidden, pause button shows the
    // "Pause" label (no `is-paused` class) and Start is the active control.
    expect(await probe.isRunning()).toBe(false)
    await hud.expectHidden()
    await toolbar.expectPauseButtonNoPausedClass()

    // (1) F starts the simulation. Same observable as clicking Start.
    await projectsPanel.blurActiveElement()
    await toolbar.pressSimulationToggleShortcut()

    await expect.poll(() => probe.isRunning()).toBe(true)
    await hud.expectVisible()
    await toolbar.expectPauseButtonNoPausedClass()
    expect(await probe.isPaused()).toBe(false)

    // (2) F pauses the running simulation. Same observable as Pause click.
    await projectsPanel.blurActiveElement()
    await toolbar.pressSimulationToggleShortcut()

    await expect.poll(() => probe.isPaused()).toBe(true)
    await toolbar.expectPauseButtonHasPausedClass()
    expect(await probe.isRunning()).toBe(true)

    // (3) F resumes the paused simulation. Same observable as Resume click.
    await projectsPanel.blurActiveElement()
    await toolbar.pressSimulationToggleShortcut()

    await expect.poll(() => probe.isPaused()).toBe(false)
    await toolbar.expectPauseButtonNoPausedClass()
    expect(await probe.isRunning()).toBe(true)
  })

  // ---- Parameterised: F / R / Space / Esc on the main menu ----------
  // Each shortcut must be a no-op while the main menu owns the screen.
  // The per-key extra assertions (isRunning, isPaused, scrollY) are
  // preserved verbatim from the previous individual tests.
  for (const variant of [
    {
      key: 'F',
      press: (toolbar: import('./pom/screens/ToolbarPage').ToolbarPage) =>
        toolbar.pressSimulationToggleShortcut(),
      extra: async (probe: import('./pom/canvas/SimulationProbe').SimulationProbe) => {
        expect(await probe.isRunning()).toBe(false)
      },
    },
    {
      key: 'R',
      press: (toolbar: import('./pom/screens/ToolbarPage').ToolbarPage) =>
        toolbar.pressSimulationRestartShortcut(),
      extra: async (_probe: import('./pom/canvas/SimulationProbe').SimulationProbe) => {},
    },
    {
      key: 'Space',
      press: (toolbar: import('./pom/screens/ToolbarPage').ToolbarPage) =>
        toolbar.pressResetViewShortcut(),
      extra: async (
        _probe: import('./pom/canvas/SimulationProbe').SimulationProbe,
        toolbar: import('./pom/screens/ToolbarPage').ToolbarPage,
      ) => {
        expect(await toolbar.readWindowScrollY()).toBe(0)
      },
    },
    {
      key: 'Esc',
      press: (toolbar: import('./pom/screens/ToolbarPage').ToolbarPage) =>
        toolbar.pressBackToMenuShortcut(),
      extra: async (_probe: import('./pom/canvas/SimulationProbe').SimulationProbe) => {},
    },
  ]) {
    test(`${variant.key} is ignored on the main menu`, async ({
      mainMenu, toolbar, projectsPanel, probe,
    }) => {
      await mainMenu.open()
      await mainMenu.expectVisible()
      expect(await probe.getGameState()).toBe('main_menu')

      await projectsPanel.blurActiveElement()
      await variant.press(toolbar)

      await mainMenu.expectVisible()
      await toolbar.expectHidden()
      expect(await probe.getGameState()).toBe('main_menu')
      await variant.extra(probe, toolbar)
    })
  }

  // -------------------------------------------------------------------
  // R — restart
  // -------------------------------------------------------------------

  test('R restarts a running sandbox simulation back to idle', async ({
    mainMenu, toolbar, tutorial, projectsPanel, hud, probe, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()

    // Bring the simulation into the running state via the canonical
    // toolbar Start button so we know R is operating on a real run.
    await toolbar.clickStart()
    await expect.poll(() => probe.isRunning()).toBe(true)
    await hud.expectVisible()

    // (5) R restarts → idle, HUD hidden, in-flight cleared. Same observable
    // result as clicking the toolbar Restart button.
    await projectsPanel.blurActiveElement()
    await toolbar.pressSimulationRestartShortcut()

    await expect.poll(() => probe.isRunning()).toBe(false)
    await expect.poll(() => probe.isPaused()).toBe(false)
    await hud.expectHidden()
    await toolbar.expectPauseButtonNoPausedClass()
  })

  // -------------------------------------------------------------------
  // Space — reset camera view
  // -------------------------------------------------------------------

  test('Space resets the camera back to the post-zoomToFit baseline', async ({
    page, mainMenu, toolbar, tutorial, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()
    const camera = new CameraStateProbe(page)

    // Capture the post-entry "default sandbox view" baseline once the
    // zoomToFit transition has fully settled.
    await camera.focusCanvas()
    await camera.waitUntilSettled()
    const baseline = await camera.getCameraState()

    // Pan with W (~500ms) so the camera is measurably off the baseline.
    await camera.holdKey('w', 500)
    await camera.waitUntilSettled()
    const afterPan = await camera.getCameraState()
    const panDistance = Math.hypot(
      afterPan.position.x - baseline.position.x,
      afterPan.position.z - baseline.position.z,
    )
    expect(
      panDistance,
      'WSAD precondition: camera must have moved away from baseline before Space',
    ).toBeGreaterThan(0.5)

    // Press Space — the new handler resets the view via cameraController.resetView().
    await camera.focusCanvas()
    await toolbar.pressResetViewShortcut()
    await camera.waitUntilSettled()
    const afterSpace = await camera.getCameraState()

    // The camera should now be measurably closer to the baseline than it
    // was post-pan. Assert against a generous tolerance to allow for any
    // residual zoomToFit easing while still catching "no reset happened".
    const resetDistance = Math.hypot(
      afterSpace.position.x - baseline.position.x,
      afterSpace.position.z - baseline.position.z,
    )
    expect(
      resetDistance,
      `Space must reset the camera near the baseline (resetDistance=${resetDistance.toFixed(3)}, ` +
        `panDistance=${panDistance.toFixed(3)}).`,
    ).toBeLessThan(0.5)
    expect(
      resetDistance,
      'Space-reset distance must be smaller than the post-pan distance',
    ).toBeLessThan(panDistance)
  })

  test('Space does NOT scroll the page (preventDefault is honored)', async ({
    page, mainMenu, toolbar, tutorial, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()
    const camera = new CameraStateProbe(page)
    await camera.focusCanvas()

    expect(await toolbar.readWindowScrollY()).toBe(0)

    // Dispatch via real keyboard so the handler's preventDefault() is observed.
    await toolbar.pressResetViewShortcut()

    expect(
      await toolbar.readWindowScrollY(),
      'window.scrollY must remain 0 — Space handler must call preventDefault()',
    ).toBe(0)
  })

  test('Space does NOT reset view when the toolbar Start button is focused', async ({
    page, mainMenu, toolbar, tutorial, hud, probe, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()
    const camera = new CameraStateProbe(page)

    // Capture a settled baseline so we can detect any unwanted reset.
    await camera.focusCanvas()
    await camera.waitUntilSettled()

    // Pan the camera off baseline — the assertion is "Space must NOT
    // restore baseline when the focused element is the Start button".
    await camera.holdKey('w', 500)
    await camera.waitUntilSettled()
    const beforeSpace = await camera.getCameraState()

    // Move keyboard focus to the toolbar Start button and press Space:
    // the browser's default action for a focused button is to "click" it,
    // so the simulation should start. The new Space handler MUST skip
    // when `event.target.tagName === 'BUTTON'` so the button activation
    // isn't preempted by the camera-reset.
    await toolbar.focusStartButton()
    await page.keyboard.press(' ')

    // Sim becomes running (button activation).
    await expect.poll(() => probe.isRunning()).toBe(true)
    await hud.expectVisible()

    // Camera is unchanged (no reset).
    await camera.waitUntilSettled()
    const afterSpace = await camera.getCameraState()
    await camera.expectCameraStateApproxEqual(afterSpace, beforeSpace, 0.05)
  })

  // -------------------------------------------------------------------
  // Esc — back to the main menu
  // -------------------------------------------------------------------

  test('Esc returns to the main menu from sandbox build phase', async ({
    mainMenu, toolbar, tutorial, projectsPanel, probe, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()
    expect(await probe.getGameState()).toBe('sandbox')

    // No panels, no modal, focus on <body> so the window-level Esc
    // handler fires unimpeded.
    await projectsPanel.expectClosed()
    await projectsPanel.expectNoModal()
    await projectsPanel.blurActiveElement()

    await toolbar.pressBackToMenuShortcut()

    await probe.expectGameState('main_menu')
    await mainMenu.expectVisible()
    await toolbar.expectHidden()
  })

  test('Esc closes the Projects panel first; a second Esc returns to menu', async ({
    mainMenu, toolbar, tutorial, projectsPanel, probe, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()

    // Open Projects via Q so the existing window-level handler owns the panel.
    await projectsPanel.blurActiveElement()
    await toolbar.pressProjectsShortcut()
    await projectsPanel.expectOpen()
    await toolbar.expectProjectsButtonOpen()

    // First Esc — existing ProjectsPanel handler consumes it: panel
    // closes, state stays sandbox, the new back-to-menu handler MUST
    // be inhibited via `isEscapeBlocked`.
    await projectsPanel.blurActiveElement()
    await toolbar.pressBackToMenuShortcut()

    await projectsPanel.expectClosed()
    expect(await probe.getGameState()).toBe('sandbox')
    await toolbar.expectVisible()

    // Second Esc — no panel/modal in the way, back-to-menu fires.
    await projectsPanel.blurActiveElement()
    await toolbar.pressBackToMenuShortcut()

    await probe.expectGameState('main_menu')
    await mainMenu.expectVisible()
    await toolbar.expectHidden()
  })

  test('Esc closes a Modal first; a second Esc returns to menu', async ({
    mainMenu, toolbar, tutorial, projectsPanel, probe, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()

    // Trigger the "Name your project" prompt modal via the canonical
    // empty-placeholder save flow so we know a `.ui-modal` is mounted.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.expectModalVisible()

    // First Esc — Modal owns Escape on capture phase; modal closes,
    // state stays sandbox, back-to-menu handler MUST be inhibited.
    await toolbar.pressBackToMenuShortcut()
    await projectsPanel.expectNoModal()
    expect(await probe.getGameState()).toBe('sandbox')
    await toolbar.expectVisible()

    // Close the Projects panel as well so the second Esc finds nothing
    // in the way and the back-to-menu handler fires.
    await projectsPanel.blurActiveElement()
    await toolbar.pressBackToMenuShortcut()
    await projectsPanel.expectClosed()
    expect(await probe.getGameState()).toBe('sandbox')

    // Third Esc — clean state, navigation to main menu.
    await projectsPanel.blurActiveElement()
    await toolbar.pressBackToMenuShortcut()
    await probe.expectGameState('main_menu')
    await mainMenu.expectVisible()
    await toolbar.expectHidden()
  })

  test('Esc does nothing while typing in a project-name input', async ({
    mainMenu, toolbar, tutorial, projectsPanel, probe, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()

    // Create a saved slot so an editable name input exists.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('EscProj')
    await projectsPanel.expectSlotPresent('EscProj')

    // Focus the name input and append "Esc test" character-by-character
    // (the helper asserts the input keeps focus across each keystroke).
    await projectsPanel.typeIntoSlotNameInput('EscProj', 'Esc test')

    // Now press Esc with focus still inside the INPUT. The new
    // window-level back-to-menu handler MUST skip when the keydown
    // target is an INPUT/TEXTAREA/SELECT — same skip rule as the
    // existing E and Q shortcuts. We do NOT assert what happens to the
    // input itself (commit vs blur is existing browser/input behavior),
    // only that we did NOT navigate to the main menu.
    await toolbar.pressBackToMenuShortcut()

    expect(
      await probe.getGameState(),
      'Esc inside an INPUT must NOT trigger the back-to-menu handler',
    ).toBe('sandbox')
    await toolbar.expectVisible()
    // The pre-existing ProjectsPanel.handleKeyDown closes the panel on Esc regardless of focus; that's out of scope. We only assert the new back-to-menu shortcut did NOT fire.
  })

})
