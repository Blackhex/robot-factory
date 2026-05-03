import { test } from './pom'

/**
 * E2E spec: "Level Failed" screen flow (UX requirement B1).
 *
 * Contract:
 *   In CAMPAIGN levels, when the player ends a run without meeting the
 *   objective (e.g. presses Restart with 0 outputs / fewer outputs than
 *   required), a new "Level Failed" screen is shown INSTEAD of the regular
 *   Score screen, and the next level must NOT be unlocked.
 *
 * STATUS: This spec is EXPECTED TO FAIL on current code — the new screen
 *   does not exist yet (the existing flow shows ScoreScreen on Restart).
 */

test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('Level Failed screen — campaign failure flow', () => {
  test('Level 1: Restart with 0 outputs shows Level Failed (not Score), keeps Level 2 locked, awards 0 stars', async ({
    mainMenu, levelSelect, toolbar, grid, tutorial, hud,
    scoreScreen, levelFailed,
  }) => {
    test.setTimeout(60_000)

    // ===================== STEP 1: Main Menu → Level Select → Level 1 ======
    await mainMenu.open()
    await mainMenu.expectStartButtonVisible()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()

    // Sanity: on a fresh save, Level 2 starts locked.
    await levelSelect.expectLevelLocked(1)

    await levelSelect.clickFirstUnlocked()
    await levelSelect.expectHidden()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()
    await grid.expectCanvasVisible()

    // Dismiss the tutorial overlay if present so the toolbar is interactive.
    await tutorial.dismissIfPresent(2000)

    // ===================== STEP 2: Start sim with NO machines placed =======
    // Start the simulation with no machines / no program. The run will
    // produce 0 outputs.
    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()
    await hud.expectVisible()

    // ===================== STEP 3: End the run (Restart with 0 outputs) ====
    await toolbar.expectRestartButtonVisible()
    await toolbar.clickRestart()

    // ===================== STEP 4: Level Failed visible, ScoreScreen NOT ===
    await levelFailed.expectVisible()
    await scoreScreen.expectHidden()

    // ===================== STEP 5: Failure UI affordances ==================
    await levelFailed.expectTitleVisible()
    await levelFailed.expectRetryButtonVisible()
    await levelFailed.expectBackToLevelSelectButtonVisible()

    // ===================== STEP 6: Back to Level Select ====================
    await levelFailed.clickBackToLevelSelect()
    await levelSelect.expectVisible()

    // ===================== STEP 7: Level 2 still LOCKED ====================
    await levelSelect.expectLevelLocked(1)

    // ===================== STEP 8: No stars recorded for Level 1 ===========
    await levelSelect.expectZeroStars(0)
  })

  test('Sandbox regression: ending a sandbox session with 0 outputs does NOT show Level Failed', async ({
    mainMenu, toolbar, grid, hud, levelFailed,
  }) => {
    test.setTimeout(45_000)

    // Enter sandbox directly.
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()
    await grid.expectCanvasVisible()

    // Start with no machines, then restart immediately.
    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()
    await hud.expectVisible()

    await toolbar.expectRestartButtonVisible()
    await toolbar.clickRestart()

    // Level Failed must NOT appear in sandbox mode.
    await levelFailed.expectHidden()
  })
})
