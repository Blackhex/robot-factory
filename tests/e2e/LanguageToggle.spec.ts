import { test } from './pom'

/**
 * UX Blocker B2 — Language toggle visibility.
 *
 * The `.ui-lang-btn` toggle MUST be visible AND clickable from the Main Menu
 * and from the Level Select screen, not only after entering a level. Right
 * now the toggle is rendered exclusively by the build/play Toolbar, so a new
 * player on the title screen has no way to switch the UI language.
 *
 * Bonus: the toggle should also flip `<html lang>` between `en` and `cs` so
 * accessibility tooling and CSS `:lang(...)` selectors can react to it.
 *
 * These tests are EXPECTED TO FAIL on current code. They will pass once the
 * language toggle is rendered as shared chrome on every screen and the i18n
 * layer mirrors the active language onto `<html lang>`.
 */
test.describe('Language Toggle — UX Blocker B2', () => {
  test('language toggle is visible on the Main Menu screen', async ({ mainMenu }) => {
    await mainMenu.open()
    await mainMenu.expectVisible()

    await mainMenu.expectLanguageToggleVisible()
  })

  test('language toggle is visible on the Level Select screen', async ({
    mainMenu,
    levelSelect,
  }) => {
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()

    await levelSelect.expectLanguageToggleVisible()
  })

  test('clicking the language toggle on the Main Menu flips <html lang> en ↔ cs', async ({
    mainMenu,
  }) => {
    await mainMenu.open()
    await mainMenu.expectVisible()

    // Initial state: English.
    await mainMenu.expectHtmlLang('en')

    // First click: switch to Czech.
    await mainMenu.clickLanguageToggle()
    await mainMenu.expectHtmlLang('cs')

    // Second click: back to English.
    await mainMenu.clickLanguageToggle()
    await mainMenu.expectHtmlLang('en')
  })

  test('language toggle changes toolbar text to Czech', async ({ mainMenu, levelSelect, toolbar, tutorial }) => {
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickFirstUnlocked()
    await toolbar.expectVisible()

    await tutorial.dismissIfPresent()

    await toolbar.expectEditorButtonText('Code')
    await toolbar.expectLanguageButtonText('CS')
    await toolbar.clickLanguageToggle()

    await toolbar.expectEditorButtonText('Kód')
    await toolbar.expectLanguageButtonText('EN')
  })
})
