import type { Page } from '@playwright/test'

/**
 * Owns all `localStorage` access and pre-navigation init scripts. The only
 * place in the POM library that touches browser persistent storage.
 */
export class SaveManager {
  private readonly page: Page
  constructor(page: Page) { this.page = page }

  /** Pre-seed level progress so levels up to `levelIndex` (0-based) are unlocked. */
  async seedProgressUpTo(levelIndex: number): Promise<void> {
    const progressLevels: Record<string, number> = {}
    for (let i = 0; i < levelIndex; i++) {
      progressLevels[`level_${i + 1}`] = 1
    }
    await this.page.addInitScript((progress) => {
      localStorage.setItem('rf_progress', JSON.stringify({ levels: progress }))
    }, progressLevels)
  }

  /** Add an init script that clears localStorage on every navigation. */
  async clearOnNavigate(): Promise<void> {
    await this.page.addInitScript(() => {
      try { localStorage.clear() } catch { /* ignore */ }
    })
  }
}
