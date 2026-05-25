import { test, clearStorageBeforeEach } from './pom'

test.use({ viewport: { width: 1280, height: 720 } })

/**
 * Default machine names are LOCALIZED and SPACE-LESS.
 *
 * Contract (see plan in /memories/session/plan.md):
 *   - Auto-generated name = `<LocalizedTypeLabel><N>` (no space).
 *       EN: `Fabricator1`, `Assembler1`, ...
 *       CS: `Vyráběč1`,    `Montovač1`,  ...
 *   - When the UI language flips mid-session, every auto-generated machine
 *     name re-localizes LIVE (no reload).
 *   - User-renamed (custom) machine names are NEVER touched by a language
 *     flip — they round-trip unchanged.
 *   - After a page reload that rehydrates the factory from save, the
 *     auto-generated names appear in the CURRENT UI language (so a save
 *     authored in EN still reads `Vyráběč1` if the user is now in CS, and
 *     vice versa), while custom names stay verbatim.
 *
 * These tests are EXPECTED TO FAIL on current source — today the registry
 * emits `"Part Fabricator 1"` with a space and no localization. They pin
 * the new behavior end-to-end through the machine-panel name input,
 * which is the only place a player can read a machine's display name.
 */

const FAB_A: { x: number; z: number } = { x: 8, z: 10 }
const FAB_B: { x: number; z: number } = { x: 11, z: 10 }
const ASM_C: { x: number; z: number } = { x: 14, z: 10 }

test.describe('Machine name localization — default names are localized, space-less, and round-trip', () => {
  clearStorageBeforeEach()

  test('place machines: EN auto-names are Fabricator1, Fabricator2, Assembler1', async ({
    mainMenu, toolbar, tutorial, grid, machinePanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)

    // First Fabricator.
    await grid.dblClickCell(FAB_A)
    await machinePanel.expectVisible()
    await machinePanel.expectNameValue('Fabricator1')
    await machinePanel.clickClose()

    // Second Fabricator.
    await grid.dblClickCell(FAB_B)
    await machinePanel.expectVisible()
    await machinePanel.expectNameValue('Fabricator2')
    await machinePanel.clickClose()

    // First Assembler — placed as a fabricator then converted via the panel.
    await grid.dblClickCell(ASM_C)
    await machinePanel.expectVisible()
    await machinePanel.selectType('assembler')
    await machinePanel.expectTypeValue('assembler')
    await machinePanel.expectNameValue('Assembler1')
  })

  test('switching to Czech mid-session re-localizes auto-names live (no reload)', async ({
    mainMenu, toolbar, tutorial, grid, machinePanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)

    await grid.dblClickCell(FAB_A)
    await machinePanel.expectVisible()
    await machinePanel.clickClose()
    await grid.dblClickCell(FAB_B)
    await machinePanel.expectVisible()
    await machinePanel.clickClose()
    await grid.dblClickCell(ASM_C)
    await machinePanel.expectVisible()
    await machinePanel.selectType('assembler')
    await machinePanel.clickClose()

    // Flip EN → CS via the toolbar language toggle.
    await toolbar.clickLanguageToggle()
    await toolbar.expectLanguageButtonText('EN') // toggle now offers EN

    // Re-open each panel and verify the Czech labels appear.
    await grid.clickCell(FAB_A)
    await machinePanel.expectVisible()
    await machinePanel.expectNameValue('Vyráběč1')
    await machinePanel.clickClose()

    await grid.clickCell(FAB_B)
    await machinePanel.expectVisible()
    await machinePanel.expectNameValue('Vyráběč2')
    await machinePanel.clickClose()

    await grid.clickCell(ASM_C)
    await machinePanel.expectVisible()
    await machinePanel.expectNameValue('Montovač1')
  })

  test('custom (user-renamed) names survive a language flip; siblings re-localize', async ({
    mainMenu, toolbar, tutorial, grid, machinePanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)

    await grid.dblClickCell(FAB_A)
    await machinePanel.expectVisible()
    await machinePanel.clickClose()

    await grid.dblClickCell(FAB_B)
    await machinePanel.expectVisible()
    // Rename the SECOND Fabricator to a custom Czech-looking name. This
    // value must round-trip verbatim through every language flip and
    // reload below.
    await machinePanel.setName('MůjRobot')
    await machinePanel.clickClose()

    await grid.dblClickCell(ASM_C)
    await machinePanel.expectVisible()
    await machinePanel.selectType('assembler')
    await machinePanel.clickClose()

    // Flip EN → CS.
    await toolbar.clickLanguageToggle()
    await toolbar.expectLanguageButtonText('EN')

    // Custom name is untouched in CS.
    await grid.clickCell(FAB_B)
    await machinePanel.expectVisible()
    await machinePanel.expectNameValue('MůjRobot')
    await machinePanel.clickClose()

    // Flip CS → EN.
    await toolbar.clickLanguageToggle()
    await toolbar.expectLanguageButtonText('CS')

    // Custom name still untouched; siblings re-localized to English again.
    await grid.clickCell(FAB_A)
    await machinePanel.expectVisible()
    await machinePanel.expectNameValue('Fabricator1')
    await machinePanel.clickClose()

    await grid.clickCell(FAB_B)
    await machinePanel.expectVisible()
    await machinePanel.expectNameValue('MůjRobot')
    await machinePanel.clickClose()

    await grid.clickCell(ASM_C)
    await machinePanel.expectVisible()
    await machinePanel.expectNameValue('Assembler1')
  })
})

// Persistence is split into its own describe so we can use a one-shot
// localStorage clear (sentinel in sessionStorage) instead of the standard
// per-test clear that would also wipe the saved slot on `page.reload()`.
test.describe('Machine name localization — save + reload persistence', () => {
  test('after save + page reload, auto-names re-localize to the active language and custom names persist', async ({
    page, mainMenu, toolbar, tutorial, grid, machinePanel, projectsPanel,
  }, testInfo) => {
    testInfo.setTimeout(60_000)

    // One-shot localStorage clear (sentinel in sessionStorage) so the
    // post-reload re-entry inherits the saved slot AND its `lastLoadedId`
    // pointer — the standard per-test clear would wipe it.
    await page.addInitScript(() => {
      const KEY = '__rf_e2e_machine_name_loc_seeded__'
      try {
        if (!sessionStorage.getItem(KEY)) {
          localStorage.clear()
          sessionStorage.setItem(KEY, '1')
        }
      } catch { /* ignore */ }
    })

    await mainMenu.enterSandbox(toolbar, tutorial)

    // Place: Fabricator, Fabricator (renamed → MůjRobot), Assembler.
    await grid.dblClickCell(FAB_A)
    await machinePanel.expectVisible()
    await machinePanel.clickClose()
    await grid.dblClickCell(FAB_B)
    await machinePanel.expectVisible()
    await machinePanel.setName('MůjRobot')
    await machinePanel.clickClose()
    await grid.dblClickCell(ASM_C)
    await machinePanel.expectVisible()
    await machinePanel.selectType('assembler')
    await machinePanel.clickClose()

    // Persist to a named project slot. Saving from the empty placeholder
    // also sets `lastLoadedId`, so the post-reload sandbox entry will
    // autorestore this slot.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('LocTest')
    await projectsPanel.expectSlotPresent('LocTest')

    // Full page reload, then re-enter sandbox. We are still in EN.
    await page.reload()
    await mainMenu.enterSandboxFast(toolbar, tutorial)

    await grid.clickCell(FAB_A)
    await machinePanel.expectVisible()
    await machinePanel.expectNameValue('Fabricator1')
    await machinePanel.clickClose()

    await grid.clickCell(FAB_B)
    await machinePanel.expectVisible()
    await machinePanel.expectNameValue('MůjRobot')
    await machinePanel.clickClose()

    await grid.clickCell(ASM_C)
    await machinePanel.expectVisible()
    await machinePanel.expectNameValue('Assembler1')
  })
})
