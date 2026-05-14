import { test, expect, clearStorageBeforeEach } from './pom'

// Wider viewport so the Projects panel + toolbar layout has room and
// canvas reflow produces a measurable width delta.
test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('Projects panel — Q keyboard toggle (mirrors E for the editor)', () => {
  clearStorageBeforeEach()

  test('Q opens the Projects panel in Sandbox', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()

    // Baseline: panel is closed and toolbar reflects the closed state.
    await projectsPanel.expectClosed()
    await toolbar.expectProjectsButtonClosed()
    const beforeBox = await grid.getCanvasContainerBoundingBox()
    expect(beforeBox, 'canvas container has a bounding box before opening projects').not.toBeNull()

    // Move focus to <body> so the window-level keydown listener fires
    // for a non-INPUT/TEXTAREA/SELECT target without dispatching a
    // synthetic mouse click on the canvas.
    await projectsPanel.blurActiveElement()

    await toolbar.pressProjectsShortcut()

    await projectsPanel.expectOpen()
    await toolbar.expectProjectsButtonOpen()

    const afterBox = await grid.getCanvasContainerBoundingBox()
    expect(afterBox, 'canvas container has a bounding box after opening projects').not.toBeNull()
    expect(
      afterBox!.x,
      `canvas left edge (x=${afterBox!.x}) must move right of the pre-open ` +
        `left edge (x=${beforeBox!.x}) — the existing --rf-canvas-left reflow ` +
        `must run when Q opens the Projects panel.`,
    ).toBeGreaterThan(beforeBox!.x)
  })

  test('Q closes the Projects panel in Sandbox', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()

    // Capture all-closed canvas geometry, then open via the toolbar
    // button so we can verify Q closes a panel opened by other means.
    const baseline = await grid.getCanvasContainerBoundingBox()
    expect(baseline, 'canvas container has a bounding box at the all-closed baseline').not.toBeNull()

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await toolbar.expectProjectsButtonOpen()
    const opened = await grid.getCanvasContainerBoundingBox()
    expect(opened, 'canvas container has a bounding box while projects are open').not.toBeNull()
    expect(opened!.width, 'canvas shrank when Projects opened').toBeLessThan(baseline!.width)

    // Press Q with focus on `<body>` (a non-INPUT/TEXTAREA/SELECT). We do
    // NOT click the canvas first: that would trigger the panel's
    // outside-click-to-close handler and mask the Q wiring under test.
    await projectsPanel.blurActiveElement()

    await toolbar.pressProjectsShortcut()

    await projectsPanel.expectClosed()
    await toolbar.expectProjectsButtonClosed()
    await projectsPanel.expectResizeHandleHidden()

    const restored = await grid.getCanvasContainerBoundingBox()
    expect(restored, 'canvas container has a bounding box after closing').not.toBeNull()
    expect(
      Math.abs(restored!.x - baseline!.x),
      `canvas left edge (x=${restored!.x}) must restore to the baseline ` +
        `(x=${baseline!.x}) once Q closes the Projects panel.`,
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(restored!.width - baseline!.width),
      `canvas width (${restored!.width}) must restore to the baseline ` +
        `(${baseline!.width}) once Q closes the Projects panel.`,
    ).toBeLessThanOrEqual(1)
  })

  test('Q does NOT trigger while typing in a project-name input', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)

    // Open the panel and create one slot via the canonical save flow so
    // there is an editable name input to focus.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Test')
    await projectsPanel.expectSlotPresent('Test')

    // Place focus inside the slot's name input via the canonical POM
    // rename flow (click + assert focused), move caret to end so the
    // typed character is appended, then press Q.
    await projectsPanel.focusSlotNameInput('Test')
    await projectsPanel.pressKey('End')
    await projectsPanel.pressKey('q')

    // The input must contain the typed `q` (the wire layer mirrors live
    // renames so a slot whose persisted name became "Testq" still matches).
    await projectsPanel.expectSlotName('Testq')

    // And the panel must remain open — the window keydown handler must
    // ignore key events whose target is an INPUT/TEXTAREA/SELECT.
    await projectsPanel.expectOpen()
    await toolbar.expectProjectsButtonOpen()

    // Positive control: blur the input and press Q again — Q must now
    // route to the window keydown listener and toggle the panel closed.
    // This sub-assertion fails RED (Q wiring missing) and passes GREEN
    // (wiring exists and only skips INPUT/TEXTAREA/SELECT targets).
    await projectsPanel.blurActiveElement()
    await toolbar.pressProjectsShortcut()
    await projectsPanel.expectClosed()
    await toolbar.expectProjectsButtonClosed()
  })

  test('Q is ignored on the main menu', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid,
  }) => {
    await mainMenu.open()
    await mainMenu.expectVisible()

    // Capture the canvas baseline on the main menu so we can assert
    // pressing Q does NOT trigger the panel reflow.
    const before = await grid.getCanvasContainerBoundingBox()
    expect(before, 'canvas container has a bounding box on the main menu').not.toBeNull()

    // Move focus off any focusable button so a subsequent keydown reaches
    // the window-level listener with `<body>` as its target — without
    // dispatching a click that could activate a menu button.
    await projectsPanel.blurActiveElement()

    await toolbar.pressProjectsShortcut()

    // No Projects panel should open (state is `main_menu`, not sandbox).
    await projectsPanel.expectClosed()

    const after = await grid.getCanvasContainerBoundingBox()
    expect(after, 'canvas container has a bounding box after pressing Q on main menu').not.toBeNull()
    expect(
      Math.abs(after!.x - before!.x),
      `canvas left edge (x=${after!.x}) must not change when Q is pressed ` +
        `on the main menu (baseline x=${before!.x}).`,
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(after!.width - before!.width),
      `canvas width (${after!.width}) must not change when Q is pressed ` +
        `on the main menu (baseline width=${before!.width}).`,
    ).toBeLessThanOrEqual(1)

    // Positive control: the same Q press, after entering Sandbox, MUST
    // toggle the Projects panel — proves the wiring exists and only the
    // main_menu state suppresses it. Fails RED (no wiring), passes GREEN.
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()
    await projectsPanel.expectClosed()
    await projectsPanel.blurActiveElement()
    await toolbar.pressProjectsShortcut()
    await projectsPanel.expectOpen()
    await toolbar.expectProjectsButtonOpen()
  })
})
