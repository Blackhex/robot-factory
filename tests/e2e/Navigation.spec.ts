import { test, expect } from './pom'

test.describe('Navigation — Smoke Tests', () => {
  test.beforeEach(async ({ mainMenu }) => {
    await mainMenu.open()
  })

  test('app loads without console errors', async ({ mainMenu }) => {
    const errors = mainMenu.collectPageErrors()

    // Re-navigate to capture errors from load
    await mainMenu.navigate()

    expect(errors).toEqual([])
  })

  test('main menu is visible with title "Robot Factory"', async ({ mainMenu }) => {
    await mainMenu.expectVisible()
    await mainMenu.expectTitle('Robot Factory')
  })

  test('"Start Game" button is visible and clickable', async ({ mainMenu }) => {
    await mainMenu.expectStartButtonVisible()
    await mainMenu.expectStartButtonText('Start Game')
    await mainMenu.expectStartButtonEnabled()
  })

  test('clicking "Start Game" hides menu and shows level select', async ({ mainMenu, levelSelect }) => {
    await mainMenu.clickStartGame()
    await mainMenu.expectHidden()
    await levelSelect.expectVisible()
  })

  test('selecting a level shows toolbar and HUD', async ({ mainMenu, levelSelect, toolbar, hud }) => {
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickFirstUnlocked()
    await levelSelect.expectHidden()
    await toolbar.expectVisible()
    await hud.expectHidden()
  })

  test('canvas container has a canvas element', async ({ grid }) => {
    await grid.expectCanvasAttached()
    const box = await grid.getCanvasBoundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })

  test('language toggle changes toolbar text to Czech', async ({ mainMenu, levelSelect, toolbar, tutorial }) => {
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickFirstUnlocked()
    await toolbar.expectVisible()

    await tutorial.dismissIfPresent()

    await toolbar.expectEditorButtonText('Open Editor')
    await toolbar.expectLanguageButtonText('CS')
    await toolbar.clickLanguageToggle()

    await toolbar.expectEditorButtonText('Otevřít editor')
    await toolbar.expectLanguageButtonText('EN')
  })

  test('"E" key opens and closes the editor panel', async ({ mainMenu, levelSelect, toolbar, tutorial, editorPanel }) => {
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickFirstUnlocked()
    await toolbar.expectVisible()

    await tutorial.dismissIfPresent()

    await editorPanel.expectClosed()
    await toolbar.pressEditorShortcut()
    await editorPanel.expectOpen()
    await toolbar.pressEditorShortcut()
    await editorPanel.expectClosed()
  })

  test('toolbar dropdown is removed — no .ui-toolbar-select exists', async ({ mainMenu, levelSelect, toolbar, tutorial }) => {
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickFirstUnlocked()
    await toolbar.expectVisible()

    await tutorial.dismissIfPresent()

    await toolbar.expectNoLegacySelect()
  })
})
