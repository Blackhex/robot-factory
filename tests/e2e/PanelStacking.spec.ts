import { test, expect, clearStorageBeforeEach, boxesOverlap } from './pom'
import { buildAndRunSandboxFactory } from './pom/scenarios/SandboxFactoryScenario'

// Sandbox + Projects panel layout needs a wide viewport so the Projects
// panel (default `max(320px, 28%)`) has a meaningful width AND the
// game-area panels still have room to the right of it. The shift-right
// assertions below depend on the canvas being wide enough that the
// HUD / Machine / Belt panels remain fully on-screen after the Projects
// panel pushes them right.
test.use({ viewport: { width: 1920, height: 1080 } })

/**
 * Visual-layout contract — see DESIGN.md "Sandbox Projects panel":
 *
 * When the sandbox Projects panel is open, the three game-area panels
 * (HUD, Machine properties, Belt properties) must SHIFT RIGHT with
 * the visible canvas, so they no longer spatially overlap the
 * Projects panel. The Projects panel drives `--rf-canvas-left` to its
 * measured width on open; the three panels are anchored to
 * `calc(var(--rf-canvas-left, 0px) + Npx)` and follow that anchor.
 *
 * Each test:
 *   1. Reaches sandbox mode and arranges the relevant panel to open.
 *   2. Opens the Projects panel.
 *   3. Asserts the game-area panel is still reported visible.
 *   4. Asserts the game-area panel's bounding box does NOT overlap
 *      the Projects panel's bounding box, and sits entirely to its
 *      right (`panel.x >= projectsPanel.x + projectsPanel.width`).
 *   5. Asserts `document.elementFromPoint` at the panel's centroid
 *      still resolves to the panel itself (and therefore not to the
 *      canvas underneath nor to the Projects panel since they no
 *      longer overlap).
 */
test.describe('Panel layout — game-area panels shift right when the Projects panel opens', () => {
  clearStorageBeforeEach()

  test('Sandbox HUD shifts right when Projects panel opens and remains fully visible to the right of it', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, hud, probe, projectsPanel,
  }) => {
    test.setTimeout(90000)

    // Reach sandbox + start a simulation so the HUD is mounted.
    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)
    await hud.expectVisible()

    // Pause so HUD layout is stable for the geometric assertions.
    await toolbar.clickPause()

    // Open the Projects panel — this drives `--rf-canvas-left` and
    // shifts the HUD to the right.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // HUD must still be reported as visible after the shift.
    await hud.expectVisible()

    // Layout contract: the HUD must sit entirely to the right of the
    // Projects panel and not overlap it at all.
    const hudBox = await hud.getBoundingBox()
    const projBox = await projectsPanel.getContainerBoundingBox()
    expect(hudBox, 'HUD bounding box must exist after Projects panel opens').not.toBeNull()
    expect(projBox, 'Projects panel bounding box must exist when it is open').not.toBeNull()
    expect(
      boxesOverlap(hudBox, projBox),
      `HUD box ${JSON.stringify(hudBox)} must NOT overlap Projects panel ` +
        `box ${JSON.stringify(projBox)} — the HUD is expected to shift right with the canvas`,
    ).toBe(false)
    expect(
      hudBox!.x,
      `HUD.x (${hudBox!.x}) must be >= Projects panel right edge ` +
        `(${projBox!.x + projBox!.width}) — HUD must sit entirely to the right of the Projects panel`,
    ).toBeGreaterThanOrEqual(projBox!.x + projBox!.width)

    // Stacking contract still meaningful: the element at the HUD's
    // geometric centre must be inside the HUD's DOM subtree (not the
    // canvas underneath).
    await hud.expectStaysOnTopAtCenter()
  })

  test('Machine panel shifts right when Projects panel opens and remains fully visible to the right of it', async ({
    mainMenu, toolbar, tutorial, grid, machinePanel, projectsPanel,
  }) => {
    test.setTimeout(60000)

    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.expectCanvasVisible()

    // Place a single Fabricator (default machine type) and select it
    // so the Machine properties panel opens at the bottom-left.
    await grid.dblClickCell({ x: 10, z: 10 })
    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()

    // Open the Projects panel.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // Machine panel must still be reported as visible.
    await machinePanel.expectVisible()

    // Layout contract: Machine panel sits entirely to the right of
    // the Projects panel.
    const mpBox = await machinePanel.getBoundingBox()
    const projBox = await projectsPanel.getContainerBoundingBox()
    expect(mpBox, 'Machine panel bounding box must exist after Projects panel opens').not.toBeNull()
    expect(projBox, 'Projects panel bounding box must exist when it is open').not.toBeNull()
    expect(
      boxesOverlap(mpBox, projBox),
      `Machine panel box ${JSON.stringify(mpBox)} must NOT overlap Projects ` +
        `panel box ${JSON.stringify(projBox)} — the panel is expected to shift right with the canvas`,
    ).toBe(false)
    expect(
      mpBox!.x,
      `Machine panel.x (${mpBox!.x}) must be >= Projects panel right edge ` +
        `(${projBox!.x + projBox!.width}) — Machine panel must sit entirely to the right of the Projects panel`,
    ).toBeGreaterThanOrEqual(projBox!.x + projBox!.width)

    // Stacking contract: Machine panel owns its centre pixel.
    await machinePanel.expectStaysOnTopAtCenter()
  })

  test('Belt panel shifts right when Projects panel opens and remains fully visible to the right of it', async ({
    mainMenu, toolbar, tutorial, grid, belt, beltPanel, probe, projectsPanel,
  }) => {
    test.setTimeout(60000)

    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.expectCanvasVisible()

    // Place two machines and auto-connect them with a belt chain so a
    // belt segment exists for selection. Same setup pattern as
    // BeltSelection.spec.ts.
    await grid.dblClickCell({ x: 8, z: 10 })
    await grid.clickCell({ x: 1, z: 1 }) // deselect
    await grid.dblClickCell({ x: 12, z: 10 })
    await grid.clickCell({ x: 1, z: 1 }) // deselect

    const beltResult = await probe.placeBeltChainViaFactoryUsingMachineRefs()
    if (beltResult === null || !beltResult.placed || beltResult.beltCount === 0) {
      throw new Error(`Belt placement failed: ${JSON.stringify(beltResult)}`)
    }
    await probe.forceRendererUpdate()
    await probe.settle(500)

    // Select a belt segment so the Belt properties panel opens.
    await belt.click()
    await beltPanel.expectVisible(3000)

    // Open the Projects panel.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // Belt panel must still be reported as visible.
    await beltPanel.expectVisible()

    // Layout contract: Belt panel sits entirely to the right of the
    // Projects panel.
    const bpBox = await beltPanel.getBoundingBox()
    const projBox = await projectsPanel.getContainerBoundingBox()
    expect(bpBox, 'Belt panel bounding box must exist after Projects panel opens').not.toBeNull()
    expect(projBox, 'Projects panel bounding box must exist when it is open').not.toBeNull()
    expect(
      boxesOverlap(bpBox, projBox),
      `Belt panel box ${JSON.stringify(bpBox)} must NOT overlap Projects ` +
        `panel box ${JSON.stringify(projBox)} — the panel is expected to shift right with the canvas`,
    ).toBe(false)
    expect(
      bpBox!.x,
      `Belt panel.x (${bpBox!.x}) must be >= Projects panel right edge ` +
        `(${projBox!.x + projBox!.width}) — Belt panel must sit entirely to the right of the Projects panel`,
    ).toBeGreaterThanOrEqual(projBox!.x + projBox!.width)

    // Stacking contract: Belt panel owns its centre pixel.
    await beltPanel.expectStaysOnTopAtCenter()
  })
})
