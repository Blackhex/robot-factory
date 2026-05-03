import { test, expect } from './pom'

/**
 * RED-step regression spec for UX Minor #1 — "Tutorial arrow does not anchor
 * to per-step target".
 *
 * The Level 1 tutorial has six steps. Step 4 highlights
 * `.ui-toolbar-btn--editor` and step 6 highlights `.ui-toolbar-btn--start`.
 * Both buttons live inside the top-mounted `.ui-toolbar` which lays its
 * children out left-to-right starting from `padding: 0.5rem`, so at a
 * 1280×800 viewport their centers are well to the LEFT of the viewport
 * center (~640 px). The current TutorialOverlay implementation centers the
 * tooltip horizontally in the viewport and pins the arrow to `left: 50%` of
 * the tooltip, so the arrow sits at viewport center (~640 px) regardless of
 * which step is active. That violates the per-step anchoring contract:
 *
 *   1. The arrow center X should align (within ±60 px) with the highlighted
 *      target's center X.
 *   2. Two consecutive steps with different targets must produce visibly
 *      different arrow positions (delta > 50 px).
 *
 * Both assertions are EXPECTED TO FAIL on the current build. The fix lives
 * in `src/ui/TutorialOverlay.ts` + `src/style.css` and belongs to the
 * `ui-designer` specialist.
 */

test.use({ viewport: { width: 1280, height: 800 } })

const ALIGN_TOLERANCE_PX = 60
const STEP_DELTA_THRESHOLD_PX = 50

test.describe('Tutorial arrow — per-step target anchoring (Level 1)', () => {
  test('arrow center X tracks the active step\'s highlight target', async ({
    mainMenu, levelSelect, toolbar, tutorial,
  }) => {
    test.setTimeout(60000)

    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickFirstUnlocked()
    await toolbar.expectVisible()

    await tutorial.expectVisible(5000)
    await tutorial.expectTooltipVisible()
    await tutorial.expectCounter('1 / 6')

    // Advance to step 4 — highlight target is `.ui-toolbar-btn--editor`.
    await tutorial.clickNext() // 2 / 6
    await tutorial.clickNext() // 3 / 6
    await tutorial.clickNext() // 4 / 6
    await tutorial.expectCounter('4 / 6')

    const editorTargetX = await tutorial.getStepTargetCenterX('.ui-toolbar-btn--editor')
    const arrowAtStep4 = await tutorial.getArrowCenterX()

    expect(editorTargetX, 'editor button must be in the DOM at step 4').not.toBeNull()
    expect(arrowAtStep4, 'tutorial arrow must have a bounding box at step 4').not.toBeNull()

    // Anchoring assertion: arrow X must align with the active step's target X.
    expect(
      Math.abs(arrowAtStep4! - editorTargetX!),
      `Step 4 (.ui-toolbar-btn--editor): arrow center X (${arrowAtStep4}) must align ` +
        `with target center X (${editorTargetX}) within ±${ALIGN_TOLERANCE_PX}px`,
    ).toBeLessThanOrEqual(ALIGN_TOLERANCE_PX)

    // Advance to step 6 — highlight target is `.ui-toolbar-btn--start`.
    await tutorial.clickNext() // 5 / 6
    await tutorial.clickNext() // 6 / 6
    await tutorial.expectCounter('6 / 6')

    const startTargetX = await tutorial.getStepTargetCenterX('.ui-toolbar-btn--start')
    const arrowAtStep6 = await tutorial.getArrowCenterX()

    expect(startTargetX, 'start button must be in the DOM at step 6').not.toBeNull()
    expect(arrowAtStep6, 'tutorial arrow must have a bounding box at step 6').not.toBeNull()

    expect(
      Math.abs(arrowAtStep6! - startTargetX!),
      `Step 6 (.ui-toolbar-btn--start): arrow center X (${arrowAtStep6}) must align ` +
        `with target center X (${startTargetX}) within ±${ALIGN_TOLERANCE_PX}px`,
    ).toBeLessThanOrEqual(ALIGN_TOLERANCE_PX)

    // Cross-step assertion: when two consecutive tutorial steps highlight
    // different targets that have visibly distinct screen positions, the
    // arrow must move with them.
    expect(
      Math.abs(editorTargetX! - startTargetX!),
      'precondition: editor button and start button must occupy distinct X positions',
    ).toBeGreaterThan(STEP_DELTA_THRESHOLD_PX)

    expect(
      Math.abs(arrowAtStep6! - arrowAtStep4!),
      `Tutorial arrow X did not move between step 4 (${arrowAtStep4}) and ` +
        `step 6 (${arrowAtStep6}), even though their highlight targets are ` +
        `${Math.abs(editorTargetX! - startTargetX!)}px apart. The arrow is ` +
        `pinned to viewport center instead of anchoring to the per-step target.`,
    ).toBeGreaterThan(STEP_DELTA_THRESHOLD_PX)
  })
})
