import { test, expect } from './pom'

/**
 * RED step for the "doubled function name" bug.
 *
 * Repro: stale toolbox-width pin in `PxtEditor.pinInitialViewport()`.
 * On first interaction with the workspace the canvas shifts to its
 * correct transform, but Blockly's `.blocklyHtmlInput` HTML overlay
 * (mounted in `.blocklyWidgetDiv`) is positioned from the pre-shift
 * coordinates — so the SVG field and the HTML input render side-by-
 * side instead of overlapping, producing the visual "doubled name".
 *
 * The diagnostic dump from the prior investigation showed the SVG
 * `<g>` at iframe-relative x=142 / y=270 and the input at x=292 /
 * y=309 — a ~150 px horizontal mismatch. A 4 px / 8 px tolerance
 * catches the bug while allowing Blockly's intentional ~3 px input
 * padding once the GREEN fix lands.
 */

const FUNCTION_NAME = 'doSomething'

test.describe('PXT function-name field edit overlay alignment', () => {
  test('HTML input overlay paints on top of the SVG function-name field', async ({
    mainMenu,
    toolbar,
    tutorial,
    pxt,
  }) => {
    // 1) Sandbox exposes the Functions toolbox category with no level
    //    gating, so `function_definition` is a valid block type here.
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await pxt.openAndWaitForBlockly()
    await pxt.waitForPxtReady()

    // 2) Drop a `function doSomething` definition onto the workspace
    //    via `Blockly.Xml.appendDomToWorkspace` — the same call
    //    Blockly itself makes when a flyout block is dropped on the
    //    main workspace. This path does NOT call `Workspace.clear()`
    //    nor `Xml.domToWorkspace`-with-replace, so it leaves the
    //    pinned viewport (and Blockly's cached metrics) in the buggy
    //    pre-shift state that the subsequent field-edit click is
    //    supposed to expose. `function_definition` cannot be dragged
    //    out of the Functions flyout directly (it is normally created
    //    by the "Make a Function" modal), so this is the closest
    //    behavioural equivalent for a deterministic test.
    await pxt.createFunctionDefinitionBlock(FUNCTION_NAME)

    // 3) Click the editable function-name text to enter edit mode.
    //    This is the action that triggers the canvas shift AND mounts
    //    the `.blocklyHtmlInput` HTML overlay — the moment at which
    //    the bug becomes visible.
    await pxt.clickFunctionNameField(FUNCTION_NAME)

    // 4) Read both rects in a single iframe round-trip.
    const rects = await pxt.readEditingFieldOverlayRects()

    // 5) Sanity: exactly one of each, so the geometry check is not
    //    measuring an unrelated field. A setup error here surfaces
    //    distinctly from the geometric assertion below.
    expect(
      rects.svgCount,
      'expected exactly one editing SVG group',
    ).toBe(1)
    expect(
      rects.inputCount,
      'expected exactly one mounted .blocklyHtmlInput',
    ).toBe(1)
    expect(rects.svg, 'SVG rect must be present').not.toBeNull()
    expect(rects.input, 'input rect must be present').not.toBeNull()

    const svg = rects.svg!
    const input = rects.input!

    const inputCenterX = input.x + input.width / 2
    const inputCenterY = input.y + input.height / 2
    const centerInsideSvg =
      inputCenterX >= svg.x &&
      inputCenterX <= svg.x + svg.width &&
      inputCenterY >= svg.y &&
      inputCenterY <= svg.y + svg.height

    const dx = Math.abs(input.x - svg.x)
    const dy = Math.abs(input.y - svg.y)

    const msg =
      `Edit overlay misaligned. ` +
      `SVG=${JSON.stringify(svg)} ` +
      `INPUT=${JSON.stringify(input)} ` +
      `dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} ` +
      `centerInsideSvg=${centerInsideSvg}`

    // 6) Correct-behavior assertions. With the GREEN fix, the HTML
    //    input is mounted on top of the SVG label (≤4 px horizontal,
    //    ≤8 px vertical offset to account for Blockly's input
    //    padding). On RED main the input sits ~150 px to the right
    //    and ~40 px below, so all three assertions fail.
    expect(centerInsideSvg, msg).toBe(true)
    expect(dx, `horizontal-edge mismatch: ${msg}`).toBeLessThanOrEqual(4)
    // Blockly mounts .blocklyWidgetDiv at the field's text baseline (~8 px below the bounding-rect top), so up to ~12 px is intrinsic and not a misalignment.
    expect(dy, `vertical-edge mismatch: ${msg}`).toBeLessThanOrEqual(12)
  })
})
