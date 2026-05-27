import type { Page } from '@playwright/test'
import { test, expect } from './pom'

/**
 * Pins the Czech block-text overflow regression.
 *
 * Background: the PXT iframe boots with `?lang=cs`, which sets
 * `pxt.Util.userLanguage()` to 'cs' synchronously. PXT's
 * `updateLocalizationAsync` then bails immediately because the requested
 * code equals the current userLanguage, leaving `translationsCache()`
 * empty. Blockly measures every block using the English source string
 * (`lf()` returns its argument when the cache is empty), then later a
 * DOM-level text patcher repaints the Czech text into the same SVG
 * `<text>` nodes. Because Czech labels are longer than their English
 * counterparts, the visible text overflows the right edge of the block.
 *
 * Fix: `src/editor/pxtIframeNativeLocale.ts` flips userLanguage to 'en'
 * at iframe load and calls `updateLocalizationAsync({code:'cs', force:true,
 * baseUrl:'/pxt-editor/', ...})`, which downloads the static CS strings
 * and populates both `setLocalizedStrings` (used by `lf()`) and
 * `pxtc.apiLocalizationStrings` (used when compiling `//% block=`
 * annotations to Blockly block defs). Blocks are then laid out with
 * Czech text from the start.
 *
 * This spec asserts the regression directly: in Czech mode, every text
 * label rendered inside every Machines-flyout block must fit within
 * the right edge of its containing block SVG.
 */

const LANG_STORAGE_KEY = 'robot-factory.lang'

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

test.describe('PXT Czech block layout — native localization must populate before block render', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Czech: Machines flyout block text fits inside each block SVG (no overflow)', async ({
    page, mainMenu, levelSelect, toolbar, tutorial, pxt,
  }) => {
    test.setTimeout(90_000)

    await seedLang(page, 'cs')
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickFirstUnlocked()
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await pxt.openAndWaitForBlockly()
    await pxt.clickToolboxCategoryByIndex(0)
    // Allow Blockly's flyout reflow to settle.
    await page.waitForTimeout(250)

    // Contract: the native-locale bootstrap must have injected our
    // English→Czech block-text mappings into PXT's `lf()` dictionary
    // before Blockly measured any block.
    const lfProbe = await page.evaluate(() => {
      const iframe = document.querySelector('iframe.pxt-editor-iframe') as HTMLIFrameElement | null
      const win = iframe?.contentWindow as any
      const lf = win?.pxt?.Util?.lf
      if (typeof lf !== 'function') return { ok: false, reason: 'pxt.Util.lf missing' }
      return {
        ok: true,
        start: lf.call(win.pxt.Util, 'start %machine'),
        stop: lf.call(win.pxt.Util, 'stop %machine'),
        setRecipe: lf.call(win.pxt.Util, 'set recipe of %machine to %recipe'),
        setSpeed: lf.call(win.pxt.Util, 'set %machine speed to %speed'),
      }
    })
    expect(lfProbe.ok, JSON.stringify(lfProbe)).toBe(true)
    expect(lfProbe.start).toBe('spustit %machine')
    expect(lfProbe.stop).toBe('zastavit %machine')
    expect(lfProbe.setRecipe).toBe('nastav recept %machine na %recipe')
    expect(lfProbe.setSpeed).toBe('nastav rychlost %machine na %speed')

    const measurements = await pxt.measureOpenFlyoutBlockTextOverflow()
    expect(
      measurements.length,
      'Expected at least one block in the open Machines flyout.',
    ).toBeGreaterThan(0)

    const overflows = measurements.filter((m) => m.overflow > 1) // 1px slack
    expect(
      overflows,
      `Czech block text must fit inside its block SVG (no overflow past the ` +
        `right edge). Overflowing labels: ` +
        JSON.stringify(overflows, null, 2),
    ).toEqual([])
  })

  test('English: Machines flyout block text fits inside each block SVG (baseline)', async ({
    page, mainMenu, levelSelect, toolbar, tutorial, pxt,
  }) => {
    test.setTimeout(90_000)

    await seedLang(page, 'en')
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickFirstUnlocked()
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await pxt.openAndWaitForBlockly()
    await pxt.openMachinesFlyout()
    await page.waitForTimeout(250)

    const measurements = await pxt.measureOpenFlyoutBlockTextOverflow()
    expect(measurements.length).toBeGreaterThan(0)
    const overflows = measurements.filter((m) => m.overflow > 1)
    expect(
      overflows,
      `English baseline must have no block-text overflow. Overflowing labels: ` +
        JSON.stringify(overflows, null, 2),
    ).toEqual([])
  })

  /**
   * Czech localization completeness: parameter-name labels must NOT leak
   * through as visible SVG text inside Blockly blocks.
   *
   * Background: PXT's `//% block="..."` annotations interpolate value
   * inputs using `%paramName` tokens (e.g. `block="start %machine"` →
   * the `machine` value input). When that input's dropdown items list
   * is empty (e.g. the `factory_pick_belt` reporter shadow on level 1
   * where no belts are placed yet), PXT/Blockly falls back to rendering
   * the parameter NAME — the literal English token from the source
   * annotation — as a standalone `FieldLabel` before the dropdown
   * value. The Czech-localized block string never references the param
   * name, so the resulting block reads e.g. `belt (žádné pásy) nastav
   * rychlost pásu` — leaking the English word `belt` into the Czech UI.
   *
   * This test walks every toolbox category in the level-1 editor (which
   * is the smallest reproduction available: no belts placed → the belt
   * dropdown is empty) and asserts that no flyout block contains any of
   * the known English param-name labels as a standalone text segment.
   */
  test('Czech: no English parameter-name labels leak into flyout blocks across all toolbox categories', async ({
    page, mainMenu, levelSelect, toolbar, tutorial, pxt,
  }) => {
    test.setTimeout(120_000)

    const FORBIDDEN_PARAM_LABELS = [
      'machine',
      'speed',
      'recipe',
      'sides',
      'side',
      'belt',
      'count',
      'ms',
      'ticks',
      'condition',
      'partType',
    ] as const

    await seedLang(page, 'cs')
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickFirstUnlocked()
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await pxt.openAndWaitForBlockly()

    const categories = await pxt.getToolboxCategoryOrder()
    expect(
      categories.length,
      'Expected the toolbox to expose at least one category for the Czech leak scan.',
    ).toBeGreaterThan(0)

    type Leak = { category: string; type: string; segment: string; allTexts: string[] }
    const leaks: Leak[] = []

    for (const category of categories) {
      await pxt.clickToolboxCategory(category)
      await page.waitForTimeout(300)
      const blocks = await pxt.snapshotOpenFlyoutBlockTexts()
      for (const b of blocks) {
        for (const segment of b.texts) {
          // Match a segment iff it equals one of the forbidden English
          // param names exactly (case-sensitive). We do NOT use substring
          // matching here because Czech translations legitimately contain
          // some of these tokens as part of longer phrases (e.g. the wait
          // block's `počkej %ms ms` renders the unit `"ms"` as a trailing
          // label — that is intentional and not a leak).
          if ((FORBIDDEN_PARAM_LABELS as readonly string[]).includes(segment)) {
            // The wait blocks' trailing `"ms"` / `"tiků"` unit labels are
            // legitimate Czech text (the unit, not the param name). Exempt
            // `factory_wait` so we don't false-positive on its rendered
            // `ms` unit label.
            if (b.type === 'factory_wait' && segment === 'ms') continue
            leaks.push({
              category,
              type: b.type,
              segment,
              allTexts: b.texts,
            })
          }
        }
      }
    }

    expect(
      leaks,
      'English parameter-name labels must NOT appear as visible text segments ' +
        'inside Czech-mode flyout blocks. Each leak below is a standalone ' +
        '`text.blocklyText` segment whose contents exactly equal an English ' +
        '`//% block="..."` param token (e.g. `belt`, `machine`, `recipe`). ' +
        'Leaks found: ' +
        JSON.stringify(leaks, null, 2),
    ).toEqual([])
  })
})
