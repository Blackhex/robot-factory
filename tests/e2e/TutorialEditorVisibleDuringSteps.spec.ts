import { test, expect } from './pom'

/**
 * RED-step regression spec — the Level 1 tutorial backdrop must NOT cover
 * the open PXT editor panel during the editor-interaction steps (5 and 6).
 *
 * Level 1 has 7 tutorial steps. Step 4 instructs the player to open the
 * editor. From step 5 onwards the tooltip text directs the player to drag
 * blocks inside the editor, so the editor panel is open and the player
 * must be able to SEE its contents. The tutorial scrim
 * (`.ui-tutorial-backdrop`) currently has `inset: 0` unconditionally and
 * therefore extends across the full viewport width, visually covering the
 * right-side `#editor-container.open` panel even when `body.editor-open`
 * is set.
 *
 * The fix lives in `src/style.css`: when `body.editor-open` is true the
 * backdrop's right edge must be inset by the editor width
 * (`--rf-canvas-right`, already exposed on `body` by
 * `src/utils/setCanvasInset.ts`). This spec asserts the resulting visual
 * contract — the backdrop's right edge stops at or before the editor's
 * left edge, while still covering the rest of the screen (non-zero
 * width).
 */

test.use({ viewport: { width: 1280, height: 800 } })

const SLACK_PX = 1

test.describe('Tutorial backdrop — must not cover the open editor (Level 1)', () => {
  test('backdrop stops at the editor\'s left edge during steps 5 and 6', async ({
    mainMenu, levelSelect, toolbar, editorPanel, tutorial,
  }) => {
    test.setTimeout(60000)

    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickFirstUnlocked()
    await toolbar.expectVisible()

    await tutorial.expectVisible(5000)
    await tutorial.expectTooltipVisible()
    await tutorial.expectCounter('1 / 7')

    // Advance to step 4 — "Open the Editor".
    await tutorial.clickNext() // 2 / 7
    await tutorial.clickNext() // 3 / 7
    await tutorial.clickNext() // 4 / 7
    await tutorial.expectCounter('4 / 7')

    // Open the editor as the tutorial instructs. The toolbar button is
    // visually highlighted by the spotlight cut-out so the click passes
    // through the backdrop.
    await toolbar.clickEditor()
    await editorPanel.expectOpen()

    // Advance to step 5 — editor-interaction step (drag the `set recipe`
    // block).
    await tutorial.clickNext() // 5 / 7
    await tutorial.expectCounter('5 / 7')

    await assertBackdropDoesNotCoverEditor(editorPanel, tutorial, 'step 5')

    // Advance to step 6 — still an editor-interaction step.
    await tutorial.clickNext() // 6 / 7
    await tutorial.expectCounter('6 / 7')

    await assertBackdropDoesNotCoverEditor(editorPanel, tutorial, 'step 6')
  })
})

async function assertBackdropDoesNotCoverEditor(
  editorPanel: { getContainerBoundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> },
  tutorial: { getBackdropRect(): Promise<{ left: number; right: number; top: number; bottom: number; width: number; height: number } | null> },
  label: string,
): Promise<void> {
  const editorBox = await editorPanel.getContainerBoundingBox()
  const backdrop = await tutorial.getBackdropRect()

  expect(editorBox, `${label}: #editor-container must have a bounding box (editor panel open)`).not.toBeNull()
  expect(backdrop, `${label}: .ui-tutorial-backdrop must have a bounding box (tutorial visible)`).not.toBeNull()

  const editorLeft = editorBox!.x

  // Precondition: backdrop must still darken the rest of the screen.
  expect(
    backdrop!.width,
    `${label}: backdrop width must be > 0 — otherwise this spec could silently pass when the backdrop is hidden entirely`,
  ).toBeGreaterThan(0)

  // Core assertion: backdrop's right edge must stop at or before the
  // editor's left edge (1 px slack for rounding). On unfixed `main` the
  // backdrop is `inset: 0` so its right edge equals window width, far to
  // the right of the editor's left edge.
  expect(
    backdrop!.right,
    `${label}: tutorial backdrop right edge (${backdrop!.right}) must be at or ` +
      `before the editor's left edge (${editorLeft}). The backdrop is currently ` +
      `${backdrop!.right - editorLeft}px past the editor's left edge, visually ` +
      `covering the open PXT editor panel that the tutorial is asking the ` +
      `player to interact with.`,
  ).toBeLessThanOrEqual(editorLeft + SLACK_PX)
}
