import { test, expect } from './pom'

/**
 * Top-Right dock contract for the in-level objective panel (`.ui-level-brief`).
 *
 * The brief must:
 *   (a) anchor to the top-RIGHT corner of the visible game area, just below
 *       the toolbar, NOT be horizontally centered;
 *   (b) honor `--rf-canvas-right` so any right-side overlay (e.g. the PXT
 *       editor panel) never covers it;
 *   (c) wear the same surface look as `.ui-machine-panel` (solid
 *       `var(--rf-surface)` background, `var(--rf-border)` 1px border,
 *       `var(--rf-radius-lg)` corners, `var(--rf-shadow-panel)` shadow,
 *       no `backdrop-filter`, no `transform`).
 */
test.describe('Level Brief — top-right dock @ 1280×720', () => {
  test('docks to the top-right of the game area with machine-panel styling', async ({
    mainMenu,
    levelSelect,
    toolbar,
    tutorial,
    levelBrief,
    page,
  }) => {
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickUnlocked(0) // Level 1
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await toolbar.waitForCameraSettle()
    await levelBrief.expectVisible()

    const briefBox = await levelBrief.getBoundingBox()
    const toolbarBox = await toolbar.getBoundingBox()
    const viewportWidth = page.viewportSize()!.width
    const rightGap = viewportWidth - (briefBox.x + briefBox.width)

    // (a) Anchored to the right, not centered. Soft assertions so every
    // independent contract clause reports its actual-vs-expected in one run.
    expect.soft(
      rightGap,
      `brief right gap=${rightGap} (viewport ${viewportWidth} − (x ${briefBox.x} + w ${briefBox.width})) must be ≥ 8 (anchored to the viewport's right edge, not centered)`,
    ).toBeGreaterThanOrEqual(8)
    expect.soft(
      rightGap,
      `brief right gap=${rightGap} must be ≤ 24 (anchored to the viewport's right edge, not centered)`,
    ).toBeLessThanOrEqual(24)

    // (a) Just below the toolbar.
    const toolbarBottom = toolbarBox.y + toolbarBox.height
    expect.soft(
      briefBox.y,
      `brief top=${briefBox.y} must sit ≥ ${toolbarBottom + 8} (8px below toolbar bottom ${toolbarBottom})`,
    ).toBeGreaterThanOrEqual(toolbarBottom + 8)
    expect.soft(
      briefBox.y,
      `brief top=${briefBox.y} must sit ≤ ${toolbarBottom + 24} (≤24px below toolbar bottom ${toolbarBottom})`,
    ).toBeLessThanOrEqual(toolbarBottom + 24)

    // (c) Machine-panel surface styling parity.
    const css = await levelBrief.readComputedStyle()
    const { surfaceColor, borderColor } = await levelBrief.resolveSurfaceReference()

    expect.soft(css.position, 'brief must be absolutely positioned').toBe('absolute')

    expect.soft(
      css.backgroundColor,
      `brief backgroundColor=${css.backgroundColor} must match the opaque var(--rf-surface) reference ${surfaceColor}`,
    ).toBe(surfaceColor)

    expect.soft(
      css.backdropFilter,
      `brief backdropFilter=${css.backdropFilter} must be 'none' (machine-panel parity has no backdrop blur)`,
    ).toBe('none')

    expect.soft(
      css.boxShadow,
      `brief boxShadow=${css.boxShadow} must be non-empty (machine-panel uses var(--rf-shadow-panel))`,
    ).not.toBe('none')
    expect.soft(
      css.boxShadow,
      `brief boxShadow=${css.boxShadow} must contain the 'rgba(0, 0, 0, 0.4)' shadow color`,
    ).toMatch(/rgba\(0,\s*0,\s*0,\s*0\.4\)/)

    expect.soft(
      css.transform,
      `brief transform=${css.transform} must be 'none' or the identity matrix (no translateX centering)`,
    ).toMatch(/^(none|matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\))$/)

    // Border parity with machine panel.
    expect.soft(css.borderTopWidth, `brief border-width=${css.borderTopWidth} must be 1px`).toBe('1px')
    expect.soft(css.borderTopStyle, `brief border-style=${css.borderTopStyle} must be 'solid'`).toBe('solid')
    expect.soft(
      css.borderTopColor,
      `brief border-color=${css.borderTopColor} must match var(--rf-border) reference ${borderColor}`,
    ).toBe(borderColor)
  })

  test('respects --rf-canvas-right so a right-side panel never covers it', async ({
    mainMenu,
    levelSelect,
    toolbar,
    tutorial,
    levelBrief,
    page,
  }) => {
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickUnlocked(0) // Level 1
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await toolbar.waitForCameraSettle()
    await levelBrief.expectVisible()

    const viewportWidth = page.viewportSize()!.width

    // Baseline: no right-side overlay open.
    await levelBrief.clearRightPanelInset()
    const before = await levelBrief.getBoundingBox()
    const beforeRightEdge = before.x + before.width

    // Simulate a 280px-wide right-side overlay by writing --rf-canvas-right.
    // The brief's CSS rule reads --rf-canvas-right; exercise the contract directly.
    const inset = 280
    try {
      await levelBrief.simulateRightPanelInset(inset)
      const after = await levelBrief.getBoundingBox()
      const afterRightEdge = after.x + after.width
      const afterRightGap = viewportWidth - afterRightEdge

      // (b) Brief must dock just to the left of the inset, NOT under it.
      expect(
        afterRightGap,
        `brief right gap=${afterRightGap} must be ≥ ${inset + 8} (inset ${inset}px + 8px gutter) when --rf-canvas-right=${inset}px`,
      ).toBeGreaterThanOrEqual(inset + 8)
      expect(
        afterRightGap,
        `brief right gap=${afterRightGap} must be ≤ ${inset + 24} (inset ${inset}px + 24px gutter) when --rf-canvas-right=${inset}px`,
      ).toBeLessThanOrEqual(inset + 24)

      // The brief's right edge must move LEFT when the inset opens.
      expect(
        afterRightEdge,
        `brief right edge moved from ${beforeRightEdge} → ${afterRightEdge}; it must decrease when --rf-canvas-right grows from 0px → ${inset}px`,
      ).toBeLessThan(beforeRightEdge)
    } finally {
      await levelBrief.clearRightPanelInset()
    }
  })
})
