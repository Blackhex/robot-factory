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
 *
 * This spec is EXPECTED TO FAIL at 1024×768 on the current build because
 * the back button currently sits inside the scrollable card region. The
 * 1920×1080 desktop case should pass (or fail more loudly if the card is
 * also misaligned there). The fix lives in `src/ui/LevelSelect.ts` +
 * `src/style.css` and belongs to the `ui-designer` specialist.
 */

test.describe('Level Select — "Back to Menu" must be reachable without scroll', () => {
  test.describe('1024×768 viewport (minimum supported)', () => {
    test.use({ viewport: { width: 1024, height: 768 } })

    test('Back button is visible in the initial layout and clicks return to Main Menu', async ({
      mainMenu, levelSelect,
    }) => {
      test.setTimeout(30000)

      await mainMenu.open()
      await mainMenu.expectStartButtonVisible()
      await mainMenu.clickStartGame()
      await levelSelect.expectVisible()

      // The button must be inside the viewport with no caller-issued scroll.
      await levelSelect.expectBackButtonInViewport()

      // And clicking it without first scrolling must navigate back.
      await levelSelect.clickBackWithoutScrolling()
      await levelSelect.expectHidden()
      await mainMenu.expectVisible()
    })
  })

  test.describe('1920×1080 viewport (desktop)', () => {
    test.use({ viewport: { width: 1920, height: 1080 } })

    test('Back button remains visible without scroll at desktop size', async ({
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
})
