import type { FrameLocator, Page } from '@playwright/test'
import { test, expect } from './pom'

/**
 * Locks in the requirement that the embedded PXT editor renders its blocks
 * and chrome in the active app language (Czech or English).
 *
 * GREEN wiring (now in place):
 *   - `pxt-target/pxtarget.json` + `public/pxt-editor/target.json|js`
 *     declare `appTheme.availableLocales: ["en","cs"]`,
 *     `defaultLocale: "en"`, `disableLiveTranslations: true`.
 *   - `src/editor/PxtEditor.ts` injects `lang=<i18next active lang>` into
 *     the iframe URL hash at mount time. The currently-loaded language is
 *     read from `i18next.language` at iframe creation; a mid-session toggle
 *     does NOT live-update the iframe (PXT bakes the locale at boot).
 *   - `public/pxt-editor/locales/cs/{target,bundled,strings,sim}-strings.json`
 *     ship the translated chrome + block strings PXT loads statically.
 *
 * The toolbox-category and on-start assertions reach into the iframe via
 * the canonical helpers on `PxtEditorPage` (`getIframeSrc`,
 * `expectToolboxCategory`, `expectNoToolboxCategory`, `expectOnStartLabel`,
 * `expectNoBlocklyText`). Inline-helper hold-overs are limited to test
 * orchestration (seeding `localStorage` before boot, opening Level 1).
 */

const LANG_STORAGE_KEY = 'robot-factory.lang'

/**
 * Seed `localStorage[robot-factory.lang]` before the app boots.
 *
 * The init script is idempotent: it only writes the seed if the key is not
 * already present. Playwright re-runs `addInitScript` on every navigation
 * (including `page.reload()`); a non-idempotent seed would clobber values
 * written by mid-session language toggles, defeating the
 * toggle→persist→reload flow exercised by test 3.
 */
async function seedLang(page: Page, lang: 'cs' | 'en'): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, value)
        }
      } catch {
        /* ignore */
      }
    },
    [LANG_STORAGE_KEY, lang] as const,
  )
}

/** Frame locator into the PXT iframe contents. */
function pxtFrame(page: Page): FrameLocator {
  return page.frameLocator('#editor-container .pxt-editor-iframe')
}

/**
 * Enter Level 1 (or first unlocked level), dismiss tutorial, open the
 * editor, and wait until Blockly + the toolbox have rendered.
 */
async function openEditorOnLevel1(
  mainMenu: import('./pom/screens/MainMenuPage').MainMenuPage,
  levelSelect: import('./pom/screens/LevelSelectPage').LevelSelectPage,
  toolbar: import('./pom/screens/ToolbarPage').ToolbarPage,
  tutorial: import('./pom/screens/TutorialOverlayPage').TutorialOverlayPage,
  pxt: import('./pom/editor/PxtEditorPage').PxtEditorPage,
): Promise<void> {
  await mainMenu.open()
  await mainMenu.clickStartGame()
  await levelSelect.expectVisible()
  await levelSelect.clickFirstUnlocked()
  await toolbar.expectVisible()
  await tutorial.dismissIfPresent()
  await pxt.openAndWaitForBlockly()
}

test.describe('PXT Editor Localization — iframe lang propagation and translated chrome', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Czech active → iframe URL carries lang=cs and editor chrome renders in Czech', async ({
    page, mainMenu, levelSelect, toolbar, tutorial, pxt,
  }) => {
    test.setTimeout(60_000)

    await seedLang(page, 'cs')
    await openEditorOnLevel1(mainMenu, levelSelect, toolbar, tutorial, pxt)

    // (1) Iframe URL carries the active language.
    const src = await pxt.getIframeSrc()
    expect.soft(
      src,
      `PXT iframe src must contain "lang=cs" when active app language is Czech. ` +
        `GREEN: src/editor/PxtEditor.ts appends "&lang=cs" (or "&lang=en") using ` +
        `the active i18next language at iframe mount time. Actual src: ${src}`,
    ).toMatch(/lang=cs(\b|$|&)/)
    expect.soft(
      src,
      `When Czech is active the PXT iframe src must NOT contain "lang=en". ` +
        `Actual src: ${src}`,
    ).not.toMatch(/lang=en(\b|$|&)/)

    // (2) Czech block category label renders ("Stroje", not "Machines").
    await pxt.expectToolboxCategory('Stroje')
    await pxt.expectNoToolboxCategory('Machines')

    // (3) Built-in `on start` hat block renders in Czech (PXT's official Czech: "při startu").
    await pxt.expectOnStartLabel('při startu')
    await pxt.expectNoBlocklyText('on start')
  })

  test('English active → iframe URL carries lang=en (or none) and editor chrome renders in English', async ({
    page, mainMenu, levelSelect, toolbar, tutorial, pxt,
  }) => {
    test.setTimeout(60_000)

    await seedLang(page, 'en')
    await openEditorOnLevel1(mainMenu, levelSelect, toolbar, tutorial, pxt)

    // (1) Iframe URL either carries lang=en or no lang param (both acceptable),
    //     but it must NOT carry lang=cs.
    const src = await pxt.getIframeSrc()
    expect.soft(
      src,
      `When English is active the PXT iframe src must NOT contain "lang=cs". ` +
        `Actual src: ${src}`,
    ).not.toMatch(/lang=cs(\b|$|&)/)
    expect.soft(
      src,
      `When English is active the PXT iframe src must either contain "lang=en" or ` +
        `omit the lang param entirely. Actual src: ${src}`,
    ).toMatch(/(lang=en(\b|$|&)|^[^?#]*(?:#controller=1)?$|^[^?#]*#[^l]*$|^(?!.*lang=).*$)/)

    // (2) English block category label renders.
    await pxt.expectToolboxCategory('Machines')
    await pxt.expectNoToolboxCategory('Stroje')

    // (3) Built-in `on start` hat block renders in English.
    await pxt.expectOnStartLabel('on start')
    await pxt.expectNoBlocklyText('po spuštění')
  })

  test(
    'mid-session language toggle does NOT live-update the editor; reload applies it',
    async ({ page, mainMenu, levelSelect, toolbar, tutorial, pxt }) => {
      test.setTimeout(90_000)

      // Start in English.
      await seedLang(page, 'en')
      await openEditorOnLevel1(mainMenu, levelSelect, toolbar, tutorial, pxt)

      const frame = pxtFrame(page)
      await expect(
        frame.locator('.blocklyTreeLabel', { hasText: 'Machines' }).first(),
      ).toBeVisible({ timeout: 15_000 })

      // Toggle UI language → Czech via the toolbar language button.
      await toolbar.clickLanguageToggle()
      await page.waitForTimeout(300)

      // Editor must NOT live-update — it should still show "Machines" until
      // the page is reloaded (PXT bakes the locale at iframe boot).
      await expect(
        frame.locator('.blocklyTreeLabel', { hasText: 'Machines' }).first(),
        'Mid-session language toggle must NOT live-update the PXT editor; the ' +
          '"Machines" label should persist until the next page reload.',
      ).toBeVisible()
      await expect(
        frame.locator('.blocklyTreeLabel', { hasText: 'Stroje' }),
      ).toHaveCount(0)

      // A small, observable notice appears in our UI telling the player
      // the new language takes effect on next reload.
      await expect(
        page.locator('.pxt-editor-language-reload-notice'),
        'A non-blocking notice must appear when the user toggles the language ' +
          'while the editor is visible.',
      ).toBeVisible({ timeout: 5_000 })

      // Reload the page (the language toggle already persisted `cs` to
      // localStorage so the post-reload boot picks Czech).
      await page.reload()
      await mainMenu.clickStartGame()
      await levelSelect.expectVisible()
      await levelSelect.clickFirstUnlocked()
      await toolbar.expectVisible()
      await tutorial.dismissIfPresent()
      await pxt.openAndWaitForBlockly()

      // After reload the editor must render in Czech.
      await pxt.expectToolboxCategory('Stroje')
    },
  )

  test('Czech mode shows Czech toolbox and command labels', async ({
    saves,
    mainMenu,
    levelSelect,
    toolbar,
    tutorial,
    pxt,
  }) => {
    test.setTimeout(90_000)

    await saves.clearOnNavigate()
    await openEditorOnLevel1(mainMenu, levelSelect, toolbar, tutorial, pxt)

    await toolbar.clickLanguageToggle()
    await toolbar.expectEditorButtonText('Kód')

    await pxt.closeIfOpen()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForToolboxInteractive()

    const categories = await pxt.getToolboxCategoryOrder()
    expect.soft(
      categories,
      `Expected Czech toolbox category "Stroje" after clean install + language toggle. ` +
        `Actual categories: ${JSON.stringify(categories)}`,
    ).toContain('Stroje')
    expect.soft(
      categories,
      `English toolbox category "Machines" must be absent when Czech is active. ` +
        `Actual categories: ${JSON.stringify(categories)}`,
    ).not.toContain('Machines')

    await pxt.clickToolboxCategoryByIndex(0)
    const machineFlyout = await pxt.getOpenFlyoutTextLabels()
    const machineFlyoutJoined = machineFlyout.join(' | ').toLowerCase()
    expect.soft(
      machineFlyoutJoined,
      `Expected Czech machine command labels in flyout. Got: ${JSON.stringify(machineFlyout)}`,
    ).toContain('spustit')
    expect.soft(
      machineFlyoutJoined,
      `Expected Czech machine command labels in flyout. Got: ${JSON.stringify(machineFlyout)}`,
    ).toContain('zastavit')
    expect.soft(
      machineFlyoutJoined,
      `Expected Czech machine speed command label in flyout. Got: ${JSON.stringify(machineFlyout)}`,
    ).toContain('nastav rychlost')
    expect.soft(
      machineFlyoutJoined,
      `Expected the machine reporter label to be translated in Czech. Got: ${JSON.stringify(machineFlyout)}`,
    ).toContain('stroj')
    expect.soft(
      machineFlyoutJoined,
      `English machine reporter text must be absent in Czech flyout. Got: ${JSON.stringify(machineFlyout)}`,
    ).not.toContain('machine')
    expect.soft(
      machineFlyoutJoined,
      `English machine command labels must be absent in Czech flyout. Got: ${JSON.stringify(machineFlyout)}`,
    ).not.toContain('start')
    expect.soft(
      machineFlyoutJoined,
      `English machine command labels must be absent in Czech flyout. Got: ${JSON.stringify(machineFlyout)}`,
    ).not.toContain('stop')
    expect.soft(
      machineFlyoutJoined,
      `English machine command labels must be absent in Czech flyout. Got: ${JSON.stringify(machineFlyout)}`,
    ).not.toContain('set speed')

    await pxt.createWorkspaceBlockByType('factory_start_machine', 180, 180)
    await pxt.createWorkspaceBlockByType('factory_stop_machine', 180, 280)
    await pxt.createWorkspaceBlockByType('factory_set_machine_speed', 180, 380)

    await pxt.clickToolboxCategoryByIndex(2)
    const loopsFlyout = await pxt.getOpenFlyoutTextLabels()
    const loopsFlyoutJoined = loopsFlyout.join(' | ').toLowerCase()
    expect.soft(
      loopsFlyoutJoined,
      `Expected Czech loop command labels in flyout. Got: ${JSON.stringify(loopsFlyout)}`,
    ).toContain('opakuj')
    expect.soft(
      loopsFlyoutJoined,
      `Expected Czech wait command label in flyout. Got: ${JSON.stringify(loopsFlyout)}`,
    ).toContain('počkej')
    expect.soft(
      loopsFlyoutJoined,
      `English loop command labels must be absent in Czech flyout. Got: ${JSON.stringify(loopsFlyout)}`,
    ).not.toContain('repeat')
    expect.soft(
      loopsFlyoutJoined,
      `English wait command labels must be absent in Czech flyout. Got: ${JSON.stringify(loopsFlyout)}`,
    ).not.toContain('wait')

    await pxt.createWorkspaceBlockByType('factory_repeat_times', 520, 180)
    await pxt.createWorkspaceBlockByType('factory_wait', 520, 280)

    const startRendered = (await pxt.readWorkspaceBlocksRenderedText('factory_start_machine'))[0]?.joined?.toLowerCase() ?? ''
    const stopRendered = (await pxt.readWorkspaceBlocksRenderedText('factory_stop_machine'))[0]?.joined?.toLowerCase() ?? ''
    const speedRendered = (await pxt.readWorkspaceBlocksRenderedText('factory_set_machine_speed'))[0]?.joined?.toLowerCase() ?? ''
    const repeatRendered = (await pxt.readWorkspaceBlocksRenderedText('factory_repeat_times'))[0]?.joined?.toLowerCase() ?? ''
    const waitRendered = (await pxt.readWorkspaceBlocksRenderedText('factory_wait'))[0]?.joined?.toLowerCase() ?? ''

    expect.soft(
      startRendered,
      `Expected workspace start-machine block label in Czech. Got: ${JSON.stringify(startRendered)}`,
    ).toContain('spustit')
    expect.soft(
      startRendered,
      `English workspace label must be absent for start-machine block in Czech mode. Got: ${JSON.stringify(startRendered)}`,
    ).not.toContain('start')

    expect.soft(
      stopRendered,
      `Expected workspace stop-machine block label in Czech. Got: ${JSON.stringify(stopRendered)}`,
    ).toContain('zastavit')
    expect.soft(
      stopRendered,
      `English workspace label must be absent for stop-machine block in Czech mode. Got: ${JSON.stringify(stopRendered)}`,
    ).not.toContain('stop')

    expect.soft(
      speedRendered,
      `Expected workspace set-speed block label in Czech. Got: ${JSON.stringify(speedRendered)}`,
    ).toContain('nastav')
    expect.soft(
      speedRendered,
      `Expected workspace set-speed block label in Czech. Got: ${JSON.stringify(speedRendered)}`,
    ).toContain('rychlost')
    expect.soft(
      speedRendered,
      `English workspace label must be absent for set-speed block in Czech mode. Got: ${JSON.stringify(speedRendered)}`,
    ).not.toContain('set')

    expect.soft(
      repeatRendered,
      `Expected workspace repeat block label in Czech. Got: ${JSON.stringify(repeatRendered)}`,
    ).toContain('opakuj')
    expect.soft(
      repeatRendered,
      `English workspace label must be absent for repeat block in Czech mode. Got: ${JSON.stringify(repeatRendered)}`,
    ).not.toContain('repeat')

    expect.soft(
      waitRendered,
      `Expected workspace wait block label in Czech. Got: ${JSON.stringify(waitRendered)}`,
    ).toContain('počkej')
    expect.soft(
      waitRendered,
      `English workspace label must be absent for wait block in Czech mode. Got: ${JSON.stringify(waitRendered)}`,
    ).not.toContain('wait')
  })

  test('Czech mode translates the machine reporter block label', async ({
    page, mainMenu, levelSelect, toolbar, tutorial, pxt,
  }) => {
    test.setTimeout(90_000)

    await seedLang(page, 'cs')
    await openEditorOnLevel1(mainMenu, levelSelect, toolbar, tutorial, pxt)
    await pxt.clickToolboxCategoryByIndex(0)

    const pickMachineText = await pxt.readPickMachineBlockText()
    const pickMachineTextLower = pickMachineText.toLowerCase()

    expect.soft(
      pickMachineTextLower,
      `The machine reporter must not prepend the localized machine noun in Czech mode. ` +
        `Actual rendered text: ${pickMachineText}`,
    ).not.toContain('stroj')
    expect.soft(
      pickMachineTextLower,
      `The machine reporter must not keep the untranslated English label in Czech mode. ` +
        `Actual rendered text: ${pickMachineText}`,
    ).not.toContain('machine')
  })
})
