import { test, expect } from './pom'

/**
 * Verifies that the PXT "Edit Function" / "Create a function" React modal
 * (DOM class `.ReactModal__Content.ui.modal.createfunction`, mounted by
 * `pxt-editor/main.js#CreateFunctionDialog`) has been re-skinned to the
 * Robot Factory dark theme by additional CSS appended to
 * `src/editor/pxt-toolbox-overrides.css` and injected into the iframe by
 * `PxtEditor.injectToolboxStyles()`.
 *
 * Expected token values (from `src/style.css`):
 *   --rf-bg      #0f1117 → rgb(15, 17, 23)
 *   --rf-surface #1a1d27 → rgb(26, 29, 39)
 *   --rf-border  #2e3140 → rgb(46, 49, 64)
 *   --rf-text    #e0e0e6 → rgb(224, 224, 230)
 *   --rf-accent  #4fc3f7 → rgb(79, 195, 247)
 *
 * This spec is the RED step: at the time of authoring the modal still
 * renders with default light Semantic UI styles (white modal box, blue
 * header, gray buttons), so every style assertion below fails. The
 * GREEN step is the CSS-only edit that flips the computed values.
 */

const RGB = {
  bg: 'rgb(15, 17, 23)',
  surface: 'rgb(26, 29, 39)',
  border: 'rgb(46, 49, 64)',
  text: 'rgb(224, 224, 230)',
  accent: 'rgb(79, 195, 247)',
} as const

test.describe('PXT Function-Editor Modal — Robot Factory dark theme', () => {
  test('Edit Function modal is re-skinned to the dark theme', async ({
    mainMenu,
    toolbar,
    tutorial,
    pxt,
    pxtFunctionModal,
  }) => {
    // 1) Fast-path into Sandbox so the PXT editor loads with level 10
    //    (all toolbox categories, including built-in Functions).
    await mainMenu.enterSandboxFast(toolbar, tutorial)

    // 2) Open the embedded PXT editor and wait until Blockly + the
    //    `Blockly.Functions` API are wired up. `waitForPxtReady` gates
    //    on the workspacesync handshake; the modal-open helper then
    //    polls for `Blockly.Functions.createFunctionCallback_` itself.
    await pxt.openAndWaitForBlockly()
    await pxt.waitForPxtReady()

    // 3) Mount the React function-editor modal via the same Blockly
    //    API call the toolbox / context-menu paths use. See POM for
    //    rationale.
    await pxtFunctionModal.openCreateFunctionModal()

    // 4) Capture a "before" screenshot for the GREEN reviewer. Saved
    //    under test-results/screenshots/ per project convention.
    await pxtFunctionModal.screenshot(
      'test-results/screenshots/function-editor-modal-before.png',
    )

    // 5) Read computed styles inside the iframe and assert dark-theme
    //    values. These assertions fail in RED because the modal still
    //    uses default Semantic UI styling.
    const s = await pxtFunctionModal.readStyleSnapshot()

    // Dimmer overlay — translucent app-bg.
    expect(s.overlay.backgroundColor, 'overlay backgroundColor').toBe(
      'rgba(15, 17, 23, 0.85)',
    )

    // Modal box.
    expect(s.modal.backgroundColor, 'modal backgroundColor').toBe(RGB.surface)
    expect(s.modal.color, 'modal text color').toBe(RGB.text)
    expect(s.modal.borderColor, 'modal border color').toBe(RGB.border)
    expect(s.modal.borderRadius, 'modal border-radius').toBe('12px')

    // Header bar.
    expect(s.header.backgroundColor, 'header backgroundColor').toBe(RGB.surface)
    expect(s.header.borderBottomColor, 'header border-bottom color').toBe(RGB.border)
    expect(s.header.color, 'header text color').toBe(RGB.text)
    expect(s.headerTitleColor, 'header-title color').toBe(RGB.text)

    // Content area.
    expect(s.content.backgroundColor, 'content backgroundColor').toBe(RGB.surface)
    expect(s.content.color, 'content text color').toBe(RGB.text)

    // Actions footer.
    expect(s.actions.backgroundColor, 'actions backgroundColor').toBe(RGB.surface)
    expect(s.actions.borderTopColor, 'actions border-top color').toBe(RGB.border)

    // Done button (accent fill, dark text, 8px radius).
    expect(s.doneButton.backgroundColor, 'Done button backgroundColor').toBe(RGB.accent)
    expect(s.doneButton.color, 'Done button text color').toBe(RGB.bg)
    expect(s.doneButton.borderRadius, 'Done button border-radius').toBe('8px')

    // Parameter-add button (surface fill, 1px border, 8px radius).
    expect(s.paramButton.backgroundColor, 'param button backgroundColor').toBe(RGB.surface)
    expect(s.paramButton.color, 'param button text color').toBe(RGB.text)
    expect(s.paramButton.borderColor, 'param button border color').toBe(RGB.border)
    expect(s.paramButton.borderRadius, 'param button border-radius').toBe('8px')

    // Close icon uses the foreground text color.
    expect(s.closeIconColor, 'closeIcon color').toBe(RGB.text)

    // Single injected <style> tag — no second tag added by the re-skin.
    expect(s.injectedStyleTagCount, 'injected <style> tag count').toBe(1)
  })
})
