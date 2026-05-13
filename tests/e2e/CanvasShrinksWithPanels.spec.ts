import { test, expect, clearStorageBeforeEach } from './pom'

/**
 * UX behavior — `#canvas-container` physically shrinks (does NOT overlay)
 * when the projects panel or the PXT editor panel is open, and reflows
 * back to the full viewport when that panel closes again.
 *
 * Today `#canvas-container` is `position: absolute; inset: 0;` so its
 * bounding rect spans the full viewport regardless of which side panel
 * is open — the panels render ON TOP of the canvas. The GREEN step will
 * switch the canvas to `top:0; bottom:0; left: var(--rf-canvas-left,0px);
 * right: var(--rf-canvas-right,0px);` and have the projects / editor
 * panels publish their measured widths as those CSS variables, so the
 * canvas physically reflows inward (and back out on close).
 *
 * Scope: each panel is exercised INDEPENDENTLY. Coexistence of both
 * panels open at the same time is intentionally OUT OF SCOPE for this
 * spec — only the single-panel open/close round-trips are guaranteed.
 *
 * Note on navigation recipe: the Projects toolbar button is sandbox-only
 * (see `SandboxProjects.spec.ts` — "Projects button is NOT visible in
 * campaign levels"). We therefore enter Sandbox mode for all four tests
 * rather than Level 1 from the campaign select. Editor + canvas readiness
 * are equivalent in either entry.
 *
 * These tests are EXPECTED TO FAIL until the GREEN step lands.
 */
test.describe('Canvas shrinks (does not overlay) with side panels open', () => {
  clearStorageBeforeEach()

  // Wider viewport so the projects (~max(320px, 28%)) and editor
  // (~max(500px, 40%)) panels each leave a comfortably non-zero canvas
  // strip when individually open.
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('when projects panel opens, canvas left edge moves right by the panel\'s width', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)

    const before = await grid.getCanvasContainerBoundingBox()
    expect(before, '#canvas-container has a bounding box before opening projects').not.toBeNull()

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    const after = await grid.getCanvasContainerBoundingBox()
    const panel = await projectsPanel.getContainerBoundingBox()
    expect(after, '#canvas-container has a bounding box after opening projects').not.toBeNull()
    expect(panel, '#projects-container has a bounding box').not.toBeNull()

    expect(
      Math.abs(after!.x - (panel!.x + panel!.width)),
      `canvas left edge (x=${after!.x}) must align with projects panel right edge ` +
        `(x=${panel!.x + panel!.width}); the canvas is still rendering full-width ` +
        `behind the projects panel instead of physically reflowing.`,
    ).toBeLessThanOrEqual(1)

    expect(
      after!.width,
      `canvas width (${after!.width}) must be strictly less than the pre-open width ` +
        `(${before!.width}) once the projects panel is open.`,
    ).toBeLessThan(before!.width)

    expect(
      Math.abs((after!.x + after!.width) - (before!.x + before!.width)),
      `canvas right edge must NOT move when only the projects panel opens ` +
        `(before.right=${before!.x + before!.width}, after.right=${after!.x + after!.width}).`,
    ).toBeLessThanOrEqual(1)
  })

  test('when editor panel opens, canvas right edge moves left by the editor\'s width', async ({
    mainMenu, toolbar, tutorial, editorPanel, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)

    const before = await grid.getCanvasContainerBoundingBox()
    expect(before, '#canvas-container has a bounding box before opening editor').not.toBeNull()

    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    await toolbar.waitForCameraSettle()

    const after = await grid.getCanvasContainerBoundingBox()
    const editor = await editorPanel.getContainerBoundingBox()
    expect(after, '#canvas-container has a bounding box after opening editor').not.toBeNull()
    expect(editor, '#editor-container has a bounding box').not.toBeNull()

    expect(
      Math.abs((after!.x + after!.width) - editor!.x),
      `canvas right edge (x=${after!.x + after!.width}) must align with editor panel ` +
        `left edge (x=${editor!.x}); the canvas is still rendering full-width behind ` +
        `the editor panel instead of physically reflowing.`,
    ).toBeLessThanOrEqual(1)

    expect(
      after!.width,
      `canvas width (${after!.width}) must be strictly less than the pre-open width ` +
        `(${before!.width}) once the editor panel is open.`,
    ).toBeLessThan(before!.width)

    expect(
      Math.abs(after!.x - before!.x),
      `canvas left edge must NOT move when only the editor panel opens ` +
        `(before.left=${before!.x}, after.left=${after!.x}).`,
    ).toBeLessThanOrEqual(1)
  })

  test('closing the projects panel restores the canvas to full width', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)

    // Capture the all-closed baseline BEFORE opening the projects panel.
    const before = await grid.getCanvasContainerBoundingBox()
    expect(before, '#canvas-container has a bounding box at the all-closed baseline').not.toBeNull()

    // Open: confirm the canvas shrank and its left edge meets the panel.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await toolbar.waitForCameraSettle()

    const opened = await grid.getCanvasContainerBoundingBox()
    const panel = await projectsPanel.getContainerBoundingBox()
    expect(opened, '#canvas-container has a bounding box while projects is open').not.toBeNull()
    expect(panel, '#projects-container has a bounding box').not.toBeNull()
    expect(
      Math.abs(opened!.x - (panel!.x + panel!.width)),
      `with projects panel open, canvas left edge (x=${opened!.x}) must align with ` +
        `the panel right edge (x=${panel!.x + panel!.width}).`,
    ).toBeLessThanOrEqual(1)

    // Close via the same toolbar toggle.
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
    await toolbar.waitForCameraSettle()

    const after = await grid.getCanvasContainerBoundingBox()
    expect(after, '#canvas-container has a bounding box after projects panel closes').not.toBeNull()

    expect(
      Math.abs(after!.x - before!.x),
      `canvas left edge must reflow back to the baseline once projects closes ` +
        `(before.left=${before!.x}, after.left=${after!.x}).`,
    ).toBeLessThanOrEqual(1)

    expect(
      Math.abs((after!.x + after!.width) - (before!.x + before!.width)),
      `canvas right edge must match the baseline once projects closes ` +
        `(before.right=${before!.x + before!.width}, after.right=${after!.x + after!.width}).`,
    ).toBeLessThanOrEqual(1)

    expect(
      Math.abs(after!.width - before!.width),
      `canvas width must match the baseline once projects closes ` +
        `(before.width=${before!.width}, after.width=${after!.width}).`,
    ).toBeLessThanOrEqual(1)
  })

  test('closing the editor panel restores the canvas to full width', async ({
    mainMenu, toolbar, tutorial, editorPanel, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)

    // Capture the all-closed baseline BEFORE opening the editor panel.
    const before = await grid.getCanvasContainerBoundingBox()
    expect(before, '#canvas-container has a bounding box at the all-closed baseline').not.toBeNull()

    // Open: confirm the canvas shrank and its right edge meets the panel.
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    await toolbar.waitForCameraSettle()

    const opened = await grid.getCanvasContainerBoundingBox()
    const panel = await editorPanel.getContainerBoundingBox()
    expect(opened, '#canvas-container has a bounding box while editor is open').not.toBeNull()
    expect(panel, '#editor-container has a bounding box').not.toBeNull()
    expect(
      Math.abs((opened!.x + opened!.width) - panel!.x),
      `with editor panel open, canvas right edge (x=${opened!.x + opened!.width}) ` +
        `must align with the editor left edge (x=${panel!.x}).`,
    ).toBeLessThanOrEqual(1)

    // Close via the same toolbar toggle.
    await toolbar.clickEditor()
    await editorPanel.expectClosed()
    await toolbar.waitForCameraSettle()

    const after = await grid.getCanvasContainerBoundingBox()
    expect(after, '#canvas-container has a bounding box after editor panel closes').not.toBeNull()

    expect(
      Math.abs(after!.x - before!.x),
      `canvas left edge must match the baseline once editor closes ` +
        `(before.left=${before!.x}, after.left=${after!.x}).`,
    ).toBeLessThanOrEqual(1)

    expect(
      Math.abs((after!.x + after!.width) - (before!.x + before!.width)),
      `canvas right edge must reflow back to the baseline once editor closes ` +
        `(before.right=${before!.x + before!.width}, after.right=${after!.x + after!.width}).`,
    ).toBeLessThanOrEqual(1)

    expect(
      Math.abs(after!.width - before!.width),
      `canvas width must match the baseline once editor closes ` +
        `(before.width=${before!.width}, after.width=${after!.width}).`,
    ).toBeLessThanOrEqual(1)
  })

  // Regression: toolbar.onOpenProjects and closeProjects in main.ts must trigger
  // the camera refit so the inner <canvas> element and WebGL drawing buffer
  // track the container's reflowed clientWidth. Without the refit, only the
  // container reflows (CSS) — the canvas pixel buffer stays at its old size.

  test('opening the projects panel via the toolbar resizes the inner <canvas> element to match the container', async ({
    page, mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await toolbar.waitForCameraSettle()

    const readCanvas = () =>
      page.evaluate(() => {
        const c = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
        const container = document.getElementById('canvas-container') as HTMLElement
        return {
          width: c.width,
          height: c.height,
          cssWidth: c.clientWidth,
          cssHeight: c.clientHeight,
          containerWidth: container.clientWidth,
          containerHeight: container.clientHeight,
          dpr: window.devicePixelRatio,
        }
      })

    const baseline = await readCanvas()
    expect(
      Math.abs(baseline.width - baseline.containerWidth * baseline.dpr),
      `baseline: inner <canvas> width=${baseline.width} should already match ` +
        `container clientWidth=${baseline.containerWidth} × dpr=${baseline.dpr} ` +
        `before opening any panel.`,
    ).toBeLessThanOrEqual(2)

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await toolbar.waitForCameraSettle()

    // Poll briefly: the renderer/camera-fit pass may take a frame or two
    // after the panel writes --rf-canvas-left.
    await page
      .waitForFunction(() => {
        const c = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
        const container = document.getElementById('canvas-container') as HTMLElement
        return Math.abs(c.width - container.clientWidth * window.devicePixelRatio) <= 2
      }, undefined, { timeout: 2000 })
      .catch(() => {
        /* swallow — the assertion below produces the rich diagnostic message */
      })

    const after = await readCanvas()
    expect(
      Math.abs(after.width - after.containerWidth * after.dpr),
      `inner <canvas> width=${after.width} does not match container ` +
        `clientWidth=${after.containerWidth} × dpr=${after.dpr} ` +
        `(expected ≈${after.containerWidth * after.dpr}, baseline canvas.width=${baseline.width}, ` +
        `baseline container=${baseline.containerWidth}) — toolbar.onOpenProjects must trigger ` +
        `editorViewport.refitCameraToCurrentLevel() so SceneManager.resize updates the WebGL drawing buffer.`,
    ).toBeLessThanOrEqual(2)
    expect(
      Math.abs(after.height - after.containerHeight * after.dpr),
      `inner <canvas> height=${after.height} does not match container ` +
        `clientHeight=${after.containerHeight} × dpr=${after.dpr}.`,
    ).toBeLessThanOrEqual(2)
    // Sanity: the container truly DID shrink (this is the precondition the
    // 4 pre-existing tests already cover; if it fails the regression test
    // is moot).
    expect(
      after.containerWidth,
      `precondition: container clientWidth (${after.containerWidth}) must be ` +
        `strictly less than baseline (${baseline.containerWidth}) once the projects panel is open.`,
    ).toBeLessThan(baseline.containerWidth)
  })

  test('closing the projects panel via the toolbar (after a resize-drag) restores the inner <canvas> to full width', async ({
    page, mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await toolbar.waitForCameraSettle()

    const readCanvas = () =>
      page.evaluate(() => {
        const c = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
        const container = document.getElementById('canvas-container') as HTMLElement
        return {
          width: c.width,
          height: c.height,
          containerWidth: container.clientWidth,
          containerHeight: container.clientHeight,
          dpr: window.devicePixelRatio,
        }
      })

    const baseline = await readCanvas()

    // Open via toolbar.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await toolbar.waitForCameraSettle()

    // Widen the panel significantly via the resize handle. Default panel
    // width at 1920px viewport is max(320, 1920*0.28) ≈ 538px; a +320px
    // drag pushes it to ≈858px, well past the default.
    await projectsPanel.dragResizeHandle(320)
    await toolbar.waitForCameraSettle()

    // Wait for the canvas to track the dragged width before we close.
    await page
      .waitForFunction(() => {
        const c = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
        const container = document.getElementById('canvas-container') as HTMLElement
        return Math.abs(c.width - container.clientWidth * window.devicePixelRatio) <= 2
      }, undefined, { timeout: 2000 })
      .catch(() => {
        /* not fatal here — the post-close assertion is the contract */
      })

    const dragged = await readCanvas()
    // Sanity: the drag actually widened the panel (i.e. shrank the canvas
    // container) below the post-open width. If this fails the test setup
    // is broken, not the close path.
    expect(
      dragged.containerWidth,
      `precondition: drag must shrink the container clientWidth ` +
        `(after-drag=${dragged.containerWidth}, baseline=${baseline.containerWidth}).`,
    ).toBeLessThan(baseline.containerWidth)

    // Close via the same toolbar toggle.
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
    await toolbar.waitForCameraSettle()

    await page
      .waitForFunction(() => {
        const c = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
        const container = document.getElementById('canvas-container') as HTMLElement
        return Math.abs(c.width - container.clientWidth * window.devicePixelRatio) <= 2
      }, undefined, { timeout: 2000 })
      .catch(() => {
        /* swallow — the assertion below produces the rich diagnostic message */
      })

    const after = await readCanvas()

    // Container should have reflowed back to the baseline (this is the
    // contract the 4 pre-existing tests already cover).
    expect(
      Math.abs(after.containerWidth - baseline.containerWidth),
      `precondition: container clientWidth must restore to baseline ` +
        `(after=${after.containerWidth}, baseline=${baseline.containerWidth}).`,
    ).toBeLessThanOrEqual(1)

    expect(
      Math.abs(after.width - after.containerWidth * after.dpr),
      `after closing projects panel post-drag, inner <canvas> width=${after.width} ` +
        `does not match restored container clientWidth=${after.containerWidth} × ` +
        `dpr=${after.dpr} (expected ≈${after.containerWidth * after.dpr}, ` +
        `dragged-state canvas.width=${dragged.width}, dragged container=${dragged.containerWidth}) — ` +
        `closeProjects() must trigger editorViewport.refitCameraToCurrentLevel().`,
    ).toBeLessThanOrEqual(2)
    expect(
      Math.abs(after.height - after.containerHeight * after.dpr),
      `after closing projects panel, inner <canvas> height=${after.height} does not ` +
        `match container clientHeight=${after.containerHeight} × dpr=${after.dpr}.`,
    ).toBeLessThanOrEqual(2)
  })
})
