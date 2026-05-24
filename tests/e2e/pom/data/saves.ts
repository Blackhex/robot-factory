import type { Page } from '@playwright/test'

/**
 * Minimal type-only shape of a persisted factory save. Mirrors
 * `FactorySave` from `src/utils/SaveLoad.ts` without importing from `src/`.
 */
export interface FactorySaveLike {
  version: number
  grid: Array<{
    x: number
    z: number
    machineType: string
    rotation: string
    name?: string
  }>
  belts: Array<{
    sourceSlot: string
    destinationSlot: string
    path: Array<[number, number]>
    name?: string
  }>
  /**
   * The PXT workspace string. For envelope saves this is a JSON-encoded
   * `{ ts, blocks }` pair; for legacy saves it may be a plain TS string.
   */
  pxtWorkspace: string
  levelId?: string
}

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

  /**
   * Pre-seed a sandbox project slot AND mark it as the most recently
   * loaded slot, so `autoRestoreFactory` picks it up the first time the
   * user enters Sandbox mode after page load.
   *
   * Mirrors the persistence layout of `src/utils/SandboxProjects.ts`:
   *   - `rf_sandbox_projects_index` → `{ version, slots[], lastLoadedId }`
   *   - `rf_sandbox_project_<id>`   → the FactorySave payload
   *
   * Runs BEFORE app boot via `addInitScript`, but only when the script
   * fires inside the top-level frame — otherwise the PXT iframe (same
   * origin, served from `/pxt-editor/index.html`) would also receive the
   * write, which is harmless but noisy.
   */
  async seedSandboxProjectAsActive(name: string, save: FactorySaveLike): Promise<void> {
    const slotId = `e2e-${Math.floor(Math.random() * 1e9).toString(36)}`
    await this.page.addInitScript(
      ({ slotId, name, save }: { slotId: string; name: string; save: unknown }) => {
        // Only seed in the top-level main app document; skip the PXT iframe.
        if (window.top !== window.self) return
        const index = {
          version: 1,
          slots: [{ id: slotId, name, savedAt: Date.now() }],
          lastLoadedId: slotId,
        }
        try {
          localStorage.setItem('rf_sandbox_projects_index', JSON.stringify(index))
          localStorage.setItem(`rf_sandbox_project_${slotId}`, JSON.stringify(save))
        } catch {
          /* ignore */
        }
      },
      { slotId, name, save: save as unknown },
    )
  }

  /**
   * Pre-seed a sandbox project slot WITHOUT marking it as the most
   * recently loaded slot — i.e. `lastLoadedId` stays `null`. The user
   * then has to actively open the Projects panel and double-click the
   * slot to load it. Used to exercise the Projects-menu load path
   * (`projectsPanel.onLoadSlot` → `runDestructiveFactoryReplace` in
   * `src/ui/wireProjectsPanel.ts`), which is distinct from the
   * page-refresh / `autoRestoreFactory` path covered by
   * `seedSandboxProjectAsActive`.
   */
  async seedSandboxProjectSlot(name: string, save: FactorySaveLike): Promise<void> {
    const slotId = `e2e-${Math.floor(Math.random() * 1e9).toString(36)}`
    await this.page.addInitScript(
      ({ slotId, name, save }: { slotId: string; name: string; save: unknown }) => {
        if (window.top !== window.self) return
        const index = {
          version: 1,
          slots: [{ id: slotId, name, savedAt: Date.now() }],
          lastLoadedId: null,
        }
        try {
          localStorage.setItem('rf_sandbox_projects_index', JSON.stringify(index))
          localStorage.setItem(`rf_sandbox_project_${slotId}`, JSON.stringify(save))
        } catch {
          /* ignore */
        }
      },
      { slotId, name, save: save as unknown },
    )
  }

  /**
   * Pre-seed MULTIPLE sandbox project slots in a single index, with
   * `lastLoadedId: null` so none autoload. Used by tests that exercise
   * chained Projects-menu loads (load slot A, then load slot B).
   */
  async seedSandboxProjectSlots(
    entries: Array<{ name: string; save: FactorySaveLike }>,
  ): Promise<void> {
    const seeded = entries.map((e) => ({
      id: `e2e-${Math.floor(Math.random() * 1e9).toString(36)}`,
      name: e.name,
      save: e.save,
    }))
    await this.page.addInitScript(
      (items: Array<{ id: string; name: string; save: unknown }>) => {
        if (window.top !== window.self) return
        const index = {
          version: 1,
          slots: items.map((it) => ({ id: it.id, name: it.name, savedAt: Date.now() })),
          lastLoadedId: null,
        }
        try {
          localStorage.setItem('rf_sandbox_projects_index', JSON.stringify(index))
          for (const it of items) {
            localStorage.setItem(`rf_sandbox_project_${it.id}`, JSON.stringify(it.save))
          }
        } catch {
          /* ignore */
        }
      },
      seeded as Array<{ id: string; name: string; save: unknown }>,
    )
  }
}
