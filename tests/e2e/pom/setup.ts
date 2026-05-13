import { test } from './fixtures'

/**
 * Register a `beforeEach` that wipes `localStorage` before the app boots so
 * tests start from a deterministic empty state. Call once per `test.describe`.
 */
export function clearStorageBeforeEach(): void {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear()
      } catch {
        /* ignore */
      }
    })
  })
}
