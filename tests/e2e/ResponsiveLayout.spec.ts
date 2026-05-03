import { test, expect } from './pom'

/**
 * UX Blocker B3 — Responsive layout at 1024×768 with the PXT editor open.
 *
 * At a 1024×768 viewport with Level 1 loaded AND the editor panel open:
 *
 *   1. The level objective panel (`.ui-level-brief`) MUST NOT be visually
 *      overlapped/clipped by the editor container (`#editor-container`).
 *      Today the brief is centered horizontally near the top of the screen
 *      and the editor takes `max(500px, 40%)` of the viewport width on the
 *      right, so the right edge of the brief slides under the editor.
 *
 *   2. Every required (starting) machine for Level 1 MUST remain visible —
 *      its projected screen X coordinate must fall inside the canvas region
 *      that is NOT covered by the editor panel, i.e. inside
 *      `[0, viewportWidth - editorPanelWidth]`.
 *
 * These tests are EXPECTED TO FAIL on current code. They will pass once the
 * brief is repositioned (or the canvas/camera is refit) to coexist with the
 * editor at narrow viewports.
 */
test.describe('Responsive Layout — UX Blocker B3 @ 1024×768', () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test('level brief is not overlapped by the editor container', async ({
    mainMenu,
    levelSelect,
    toolbar,
    tutorial,
    editorPanel,
    levelBrief,
  }) => {
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickUnlocked(0) // Level 1
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await toolbar.waitForCameraSettle()

    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()

    const briefBox = await levelBrief.getBoundingBox()
    await editorPanel.expectDoesNotOverlapRect(briefBox, '.ui-level-brief')
  })

  test('all Level 1 required machines stay inside the visible canvas region', async ({
    mainMenu,
    levelSelect,
    toolbar,
    tutorial,
    editorPanel,
    probe,
    page,
  }) => {
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickUnlocked(0) // Level 1
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await toolbar.waitForCameraSettle()

    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    // Allow the camera fit-to-grid pass to settle after the editor opens.
    await toolbar.waitForCameraSettle()

    const editorBox = await editorPanel.getContainerBoundingBox()
    expect(editorBox, 'editor container has a bounding box').not.toBeNull()
    const viewport = page.viewportSize()!
    const visibleRightEdge = editorBox!.x // canvas region ends where editor begins

    const machines = await probe.getAllMachineScreenPositions()
    expect(
      machines.length,
      'Level 1 must have at least one starting (required) machine',
    ).toBeGreaterThan(0)

    for (const m of machines) {
      expect(
        m.x,
        `machine ${m.type} @ (${m.gridX}, ${m.gridZ}) screen x=${m.x} must be ≥ 0`,
      ).toBeGreaterThanOrEqual(0)
      expect(
        m.x,
        `machine ${m.type} @ (${m.gridX}, ${m.gridZ}) screen x=${m.x} must be inside the visible canvas region [0, ${visibleRightEdge}] (viewport=${viewport.width}, editorWidth=${editorBox!.width})`,
      ).toBeLessThanOrEqual(visibleRightEdge)
    }
  })
})
