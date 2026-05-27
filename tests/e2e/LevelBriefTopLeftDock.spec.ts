import { test, expect } from './pom'

/**
 * Top-Left dock contract for the in-level objective panel (`.ui-level-brief`).
 *
 * The brief must:
 *   (a) anchor to the top-LEFT corner of the visible game area, just below
 *       the toolbar, NOT be horizontally centered;
 *   (b) honor `--rf-canvas-left` so any left-side overlay (e.g. the sandbox
 *       Projects panel) never covers it;
 *   (c) wear the same surface look as `.ui-machine-panel` (solid
 *       `var(--rf-surface)` background, `var(--rf-border)` 1px border,
 *       `var(--rf-radius-lg)` corners, `box-shadow 0 4px 16px rgba(0,0,0,0.4)`,
 *       no `backdrop-filter`, no `transform`).
 *
 * These tests are EXPECTED TO FAIL on the current `main`:
 *   - rect.left ≈ 460 (centered at 50% in the default 1280px viewport),
 *     not within [8, 24];
 *   - transform serializes to a non-identity matrix (translateX(-50%)),
 *     not 'none';
 *   - box-shadow is 'none' (no shadow declared);
 *   - backdrop-filter is 'blur(6px)' instead of 'none';
 *   - background-color is `rgba(26, 29, 39, 0.9)` instead of the opaque
 *     `var(--rf-surface)` reference;
 *   - the brief's `left` does not change when `--rf-canvas-left` is set.
 *
 * They will pass once `.ui-level-brief` in `src/style.css` is rewritten to
 * dock at `left: calc(var(--rf-canvas-left, 0px) + 16px)` with the
 * machine-panel surface styling and the `body.editor-open` override is
 * removed.
 */
test.describe('Level Brief — top-left dock @ 1280×720', () => {
  test('docks to the top-left of the game area with machine-panel styling', async ({
    mainMenu,
    levelSelect,
    toolbar,
    tutorial,
    levelBrief,
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

    // (a) Anchored to the left, not centered. Soft assertions so every
    // independent contract clause reports its actual-vs-expected in one run.
    expect.soft(
      briefBox.x,
      `brief left=${briefBox.x} must be within [8, 24] (anchored to the viewport's left edge, not centered)`,
    ).toBeGreaterThanOrEqual(8)
    expect.soft(
      briefBox.x,
      `brief left=${briefBox.x} must be within [8, 24] (anchored to the viewport's left edge, not centered)`,
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
      `brief boxShadow=${css.boxShadow} must be non-empty (machine-panel uses '0 4px 16px rgba(0,0,0,0.4)')`,
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

  test('respects --rf-canvas-left so a left-side panel never covers it', async ({
    mainMenu,
    levelSelect,
    toolbar,
    tutorial,
    levelBrief,
  }) => {
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickUnlocked(0) // Level 1
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await toolbar.waitForCameraSettle()
    await levelBrief.expectVisible()

    // Baseline: no left-side overlay open.
    await levelBrief.clearLeftPanelInset()
    const before = await levelBrief.getBoundingBox()

    // Simulate a 280px-wide left-side panel (sandbox Projects panel does
    // exactly this via `setCanvasInset('left', container.clientWidth)`).
    // The brief and the Projects panel never coexist in real UI flow
    // (Projects = sandbox only, brief = level only), so we exercise the
    // `--rf-canvas-left` CSS contract directly.
    const inset = 280
    try {
      await levelBrief.simulateLeftPanelInset(inset)
      const after = await levelBrief.getBoundingBox()

      // (b) Brief must dock just to the right of the inset, NOT under it.
      expect(
        after.x,
        `brief left=${after.x} must be ≥ ${inset + 8} (inset ${inset}px + 8px gutter) when --rf-canvas-left=${inset}px`,
      ).toBeGreaterThanOrEqual(inset + 8)
      expect(
        after.x,
        `brief left=${after.x} must be ≤ ${inset + 24} (inset ${inset}px + 24px gutter) when --rf-canvas-left=${inset}px`,
      ).toBeLessThanOrEqual(inset + 24)

      // The brief must move RIGHT when the inset opens.
      expect(
        after.x,
        `brief left moved from ${before.x} → ${after.x}; it must increase when --rf-canvas-left grows from 0px → ${inset}px`,
      ).toBeGreaterThan(before.x)
    } finally {
      await levelBrief.clearLeftPanelInset()
    }
  })
})
