import { test, expect } from './pom'

/**
 * RED spec — Blockly emits "unavailable option" warnings on project load.
 *
 * The bundled `projects/Assembly.json` save contains PXT blocks that
 * reference Machine.A through Machine.H, but the factory layout only
 * exposes machines A..(N) where N is the number of slot-eligible machines
 * currently placed. When PXT deserializes the saved blocks XML, every
 * `factory_pick_machine` dropdown whose stored value (`Machine.B`,
 * `Machine.C`, …, `Machine.H`) is not in the current dropdown's option
 * list logs a Blockly warning:
 *
 *   "Cannot set the dropdown's value to an unavailable option.
 *    Block type: factory_pick_machine, Field name: machine,
 *    Value: Machine.X"
 *
 * This pollutes the console on every load of a project whose saved
 * blocks reference more machines than the live factory exposes, masking
 * real warnings and confusing diagnostics.
 *
 * Expected (post-fix): ZERO such warnings on project load. The contract
 * is that loading a saved project must not emit Blockly-internal
 * dropdown-value warnings, even if the saved blocks reference machines
 * not currently in the factory (those references are valid PXT source
 * — what to do with them is a UX decision, not a console-warning event).
 *
 * This spec FAILS today (production emits ~15 warnings for the bundled
 * `Assembly.json`). Do NOT weaken the assertion to make it pass; fix
 * the editor load pipeline instead.
 */

test.describe('Saved project — stale machine references (Blockly dropdown warnings)', () => {
  test('loading bundled Assembly.json emits ZERO "unavailable option" warnings for factory_pick_machine', async ({
    page, mainMenu, toolbar, tutorial, projectsPanel, pxt,
  }) => {
    test.setTimeout(60_000)

    // Read the bundled Assembly fixture from disk (Node-side file I/O,
    // not a runtime page evaluation — allowed in the spec body per the
    // same pattern used in PxtEditor.spec.ts).
    const fs = await import('node:fs')
    const path = await import('node:path')
    const fixturePath = path.resolve(process.cwd(), 'projects', 'Assembly.json')
    const fixtureContent = fs.readFileSync(fixturePath, 'utf8')

    // Attach the console listener BEFORE any navigation that could
    // trigger workspace deserialization. We listen for the entire flow
    // and filter post-hoc to the precise pattern under test.
    const captured: { type: string; text: string }[] = []
    const listener = (msg: import('@playwright/test').ConsoleMessage): void => {
      captured.push({ type: msg.type(), text: msg.text() })
    }
    page.on('console', listener)

    try {
      await mainMenu.enterSandbox(toolbar, tutorial)

      // Import the bundle, then double-click to load it. The Projects
      // panel does NOT auto-load on import (see SandboxProjects.spec.ts).
      await toolbar.clickProjects()
      await projectsPanel.expectOpen()
      await projectsPanel.importBundleFromString('Assembly.json', fixtureContent)
      await projectsPanel.expectSlotPresent('Assembly')
      await projectsPanel.doubleClickSlot('Assembly')

      // Close the panel and open the PXT editor so the load-pipeline
      // re-deserializes the project's blocks XML. Dropdown value
      // resolution happens during deserialization.
      await toolbar.clickProjects()
      await projectsPanel.expectClosed()
      await pxt.openAndWaitForBlockly()
      await pxt.waitForPxtReady()
      await pxt.waitForPxtBootstrapSettled()
    } finally {
      page.off('console', listener)
    }

    const offending = captured.filter((m) =>
      /unavailable option/i.test(m.text) && /factory_pick_machine/i.test(m.text),
    )
    const distinctValues = [
      ...new Set(
        offending
          .map((m) => m.text.match(/Value:\s*(\S+)/)?.[1] ?? null)
          .filter((v): v is string => v !== null),
      ),
    ].sort()

    expect(
      offending,
      `Loading the bundled Assembly project must NOT emit any Blockly ` +
        `"unavailable option" warnings for \`factory_pick_machine\` ` +
        `dropdowns. Observed ${offending.length} such warning(s) ` +
        `covering distinct values ${JSON.stringify(distinctValues)}. ` +
        `Sample messages: ${JSON.stringify(offending.slice(0, 5).map((m) => m.text))}`,
    ).toHaveLength(0)
  })
})
