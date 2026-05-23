import { test } from './pom'

/**
 * RED-step regression spec for UX Minor #2 — "Level Select 'Back to Menu'
 * requires scroll at 1024×768".
 *
 * The `.ui-level-select-card` container has `max-height: 90vh; overflow-y:
 * auto` and the back button is the LAST child after the level grid. At
 * 1024×768 the card's max-height is ~691px, the title + 10-card grid + gaps
 * push the back button below the fold, and kids in the target audience
 * (ages 10–14) won't think to scroll. The button must be visible without
 * any scroll at every supported viewport ≥ 1024×768.
 */

test.describe('Level Select — "Back to Menu" must be reachable without scroll', () => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test.describe(`${viewport.width}×${viewport.height} viewport`, () => {
      test.use({ viewport })

      test('Back button is visible in the initial layout and clicks return to Main Menu', async ({
        mainMenu, levelSelect,
      }) => {
        test.setTimeout(30000)

        await mainMenu.open()
        await mainMenu.expectStartButtonVisible()
        await mainMenu.clickStartGame()
        await levelSelect.expectVisible()

        await levelSelect.expectBackButtonInViewport()

        await levelSelect.clickBackWithoutScrolling()
        await levelSelect.expectHidden()
        await mainMenu.expectVisible()
      })
    })
  }
})
