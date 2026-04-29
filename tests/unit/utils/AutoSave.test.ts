/**
 * @vitest-environment jsdom
 *
 * RED-step tests for the autosave / autorestore wiring of the PXT editor's
 * workspace XML.
 *
 * TESTABILITY APPROACH:
 *   `autoSaveFactory` and `autoRestoreFactory` are currently *inner functions*
 *   inside `src/main.ts` (closing over `gameManager`, `pxtEditor`, etc.) and
 *   are not exported. To unit-test the wiring without booting the entire
 *   `main.ts` module (which constructs Three.js scenes, the PXT iframe,
 *   AudioManager, i18next, etc.), these tests target a small extracted
 *   module:
 *
 *       src/utils/AutoSave.ts
 *           export function autoSaveFactory(
 *               factory: Factory,
 *               pxtEditor: PxtEditorLike,
 *               levelId?: string,
 *           ): void
 *           export function autoRestoreFactory(
 *               factory: Factory,
 *               pxtEditor: PxtEditorLike,
 *               levelId?: string,
 *           ): boolean
 *           export function getFactorySaveKey(levelId?: string): string
 *           export interface PxtEditorLike {
 *               getWorkspaceXml(): string
 *               loadWorkspaceXml(xml: string): void
 *           }
 *
 *   The GREEN step must:
 *     1. Create `src/utils/AutoSave.ts` with the surface above.
 *     2. Replace the inner `autoSaveFactory` / `autoRestoreFactory` /
 *        `getFactorySaveKey` in `src/main.ts` with calls into that module,
 *        passing `gameManager.factory`, `pxtEditor`, and
 *        `gameManager.currentLevel?.id`.
 *     3. Inside `autoSaveFactory`, replace the hardcoded `workspace = ''`
 *        with `pxtEditor.getWorkspaceXml()`.
 *     4. Inside `autoRestoreFactory`, after restoring the factory state,
 *        call `pxtEditor.loadWorkspaceXml(save.pxtWorkspace)` IFF
 *        `save.pxtWorkspace` is a non-empty string.
 *
 *   These tests therefore currently fail at *import time* (the module does
 *   not exist yet) — exactly the failure mode required at the RED step.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Factory } from '../../../src/game/Factory'
import {
  autoSaveFactory,
  autoRestoreFactory,
  exportFactoryWithProgram,
  importFactoryWithProgram,
  getFactorySaveKey,
  type PxtEditorLike,
} from '../../../src/utils/AutoSave'
import { saveFactory, type FactorySave } from '../../../src/utils/SaveLoad'

function makeFactory(): Factory {
  const factory = new Factory(10, 10)
  // One real machine keeps the save/load round-trip realistic and ensures
  // we exercise the same restore path as the real game.
  factory.placeMachine(0, 0, 'assembler', 'south')
  return factory
}

function makePxtEditor(workspaceXml = '') {
  return {
    getWorkspaceXml: vi.fn<() => string>(() => workspaceXml),
    loadWorkspaceXml: vi.fn<(xml: string) => void>(),
    // Satisfies the post-GREEN PxtEditorLike surface; existing tests don't
    // assert on it but every fake editor must include it because
    // autoSaveFactory()/exportFactoryWithProgram() will await it.
    flushPendingSaveAsync: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } satisfies PxtEditorLike
}

describe('AutoSave — PXT workspace persistence wiring', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('autoSaveFactory()', () => {
    it('persists the editor workspace XML returned by pxtEditor.getWorkspaceXml() into localStorage', async () => {
      // GIVEN
      const factory = makeFactory()
      const xml = '<xml xmlns="https://developers.google.com/blockly/xml"><block type="controls_if"/></xml>'
      const pxtEditor = makePxtEditor(xml)
      const levelId = 'level-1'

      // WHEN
      await autoSaveFactory(factory, pxtEditor, levelId)

      // THEN — getWorkspaceXml was consulted (no hardcoded '' anymore)
      expect(pxtEditor.getWorkspaceXml).toHaveBeenCalledTimes(1)

      // THEN — the persisted blob carries the actual editor XML
      const raw = localStorage.getItem(getFactorySaveKey(levelId))
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw as string) as FactorySave
      expect(parsed.pxtWorkspace).toBe(xml)
      expect(parsed.levelId).toBe(levelId)
    })

    it('persists an empty pxtWorkspace string when the editor returns an empty workspace (no crash)', async () => {
      const factory = makeFactory()
      const pxtEditor = makePxtEditor('')

      await autoSaveFactory(factory, pxtEditor, 'sandbox-key')

      expect(pxtEditor.getWorkspaceXml).toHaveBeenCalledTimes(1)
      const raw = localStorage.getItem(getFactorySaveKey('sandbox-key'))
      const parsed = JSON.parse(raw as string) as FactorySave
      expect(parsed.pxtWorkspace).toBe('')
    })
  })

  describe('autoRestoreFactory()', () => {
    it('calls pxtEditor.loadWorkspaceXml exactly once with the persisted XML when pxtWorkspace is non-empty', async () => {
      // GIVEN — a prior autoSave produced a save with real XML
      const xml = '<xml><block type="math_number"><field name="NUM">42</field></block></xml>'
      const sourceFactory = makeFactory()
      const sourceEditor = makePxtEditor(xml)
      await autoSaveFactory(sourceFactory, sourceEditor, 'level-2')

      // WHEN — a fresh factory + editor restores
      const restoreFactory = new Factory(10, 10)
      const restoreEditor = makePxtEditor('') // editor starts empty

      const ok = autoRestoreFactory(restoreFactory, restoreEditor, 'level-2')

      // THEN
      expect(ok).toBe(true)
      expect(restoreEditor.loadWorkspaceXml).toHaveBeenCalledTimes(1)
      expect(restoreEditor.loadWorkspaceXml).toHaveBeenCalledWith(xml)
    })

    it('does NOT call pxtEditor.loadWorkspaceXml when the persisted pxtWorkspace is an empty string', async () => {
      // GIVEN — a save manually written with an empty pxtWorkspace
      // (simulates older saves / a freshly-initialized editor that was
      // saved before the user wrote any blocks).
      const factory = makeFactory()
      const sourceEditor = makePxtEditor('') // saves '' workspace
      await autoSaveFactory(factory, sourceEditor, 'level-3')

      // sanity-check: the persisted blob has empty pxtWorkspace
      const raw = localStorage.getItem(getFactorySaveKey('level-3'))
      const parsed = JSON.parse(raw as string) as FactorySave
      expect(parsed.pxtWorkspace).toBe('')

      // WHEN
      const restoreFactory = new Factory(10, 10)
      const restoreEditor = makePxtEditor('')
      const ok = autoRestoreFactory(restoreFactory, restoreEditor, 'level-3')

      // THEN — restore still succeeds, but we MUST NOT clobber the editor
      // with empty XML.
      expect(ok).toBe(true)
      expect(restoreEditor.loadWorkspaceXml).not.toHaveBeenCalled()
    })

    it('returns false and does not touch the editor when no save is present', () => {
      const restoreFactory = new Factory(10, 10)
      const restoreEditor = makePxtEditor('')

      const ok = autoRestoreFactory(restoreFactory, restoreEditor, 'never-saved')

      expect(ok).toBe(false)
      expect(restoreEditor.loadWorkspaceXml).not.toHaveBeenCalled()
    })
  })
})

/**
 * RED-step tests for the file-based Export / Load flow (toolbar Export &
 * Load buttons in `main.ts`).
 *
 * Today `toolbar.onExport` hardcodes `workspace = ''` and `toolbar.onLoad`
 * drops `belt.name` when restoring. The fix introduces two pure helpers in
 * `src/utils/AutoSave.ts` so the file-based path uses the same single
 * source of truth as the localStorage path.
 *
 * Expected GREEN-step API surface (in `src/utils/AutoSave.ts`):
 *
 *     export function exportFactoryWithProgram(
 *         factory: Factory,
 *         pxtEditor: PxtEditorLike,
 *         levelId?: string,
 *     ): FactorySave
 *
 *     export function importFactoryWithProgram(
 *         save: FactorySave,
 *         factory: Factory,
 *         pxtEditor: PxtEditorLike,
 *     ): void
 *
 *   - `exportFactoryWithProgram` is pure: it does NOT call `exportToFile`.
 *     `main.ts` will pass its return value to `exportToFile(...)`.
 *   - `importFactoryWithProgram` mirrors `autoRestoreFactory`'s editor
 *     restore (load XML iff non-empty) and restores belt names.
 */
describe('AutoSave — file-based Export/Load helpers (toolbar parity)', () => {
  /**
   * Build a factory with two assemblers connected by a belt and rename
   * that belt. Returns the factory plus the belt's id and the chosen name
   * so each test can assert against them.
   */
  function makeFactoryWithNamedBelt(): { factory: Factory; beltId: string; beltName: string } {
    const factory = new Factory(10, 10)
    factory.placeMachine(2, 2, 'assembler', 'south')
    factory.placeMachine(2, 4, 'assembler', 'south')
    const src = factory.getMachineAt(2, 2)!
    const dst = factory.getMachineAt(2, 4)!
    const placed = factory.placeBelt(src, { x: 0, z: 1 }, dst, { x: 0, z: -1 })
    expect(placed).toBe(true)
    const belts = factory.getBelts()
    expect(belts.length).toBe(1)
    const beltId = belts[0]!.id
    const beltName = 'main_conveyor'
    const renamed = factory.renameBelt(beltId, beltName)
    expect(renamed).toBe(true)
    return { factory, beltId, beltName }
  }

  describe('exportFactoryWithProgram()', () => {
    it('returns a FactorySave whose pxtWorkspace equals pxtEditor.getWorkspaceXml()', async () => {
      // GIVEN
      const { factory } = makeFactoryWithNamedBelt()
      const xml = '<xml xmlns="https://developers.google.com/blockly/xml"><block type="controls_repeat_ext"/></xml>'
      const pxtEditor = makePxtEditor(xml)

      // WHEN
      const save = await exportFactoryWithProgram(factory, pxtEditor, 'level-1')

      // THEN
      expect(pxtEditor.getWorkspaceXml).toHaveBeenCalledTimes(1)
      expect(save.pxtWorkspace).toBe(xml)
      expect(save.levelId).toBe('level-1')
    })

    it('preserves belt.name on the returned FactorySave', async () => {
      // GIVEN
      const { factory, beltName } = makeFactoryWithNamedBelt()
      const pxtEditor = makePxtEditor('<xml/>')

      // WHEN
      const save = await exportFactoryWithProgram(factory, pxtEditor)

      // THEN
      expect(save.belts.length).toBe(1)
      expect(save.belts[0]!.name).toBe(beltName)
    })
  })

  describe('importFactoryWithProgram()', () => {
    it('calls pxtEditor.loadWorkspaceXml exactly once with save.pxtWorkspace when non-empty', async () => {
      // GIVEN — a save built via the export helper carries real XML
      const { factory: sourceFactory } = makeFactoryWithNamedBelt()
      const xml = '<xml><block type="math_number"><field name="NUM">7</field></block></xml>'
      const sourceEditor = makePxtEditor(xml)
      const save = await exportFactoryWithProgram(sourceFactory, sourceEditor, 'level-2')

      // WHEN — restoring into a fresh factory + editor
      const restoreFactory = new Factory(10, 10)
      const restoreEditor = makePxtEditor('')
      importFactoryWithProgram(save, restoreFactory, restoreEditor)

      // THEN
      expect(restoreEditor.loadWorkspaceXml).toHaveBeenCalledTimes(1)
      expect(restoreEditor.loadWorkspaceXml).toHaveBeenCalledWith(xml)
    })

    it('does NOT call pxtEditor.loadWorkspaceXml when save.pxtWorkspace is empty', () => {
      // GIVEN — a save with an empty workspace (e.g. older file or
      // freshly-initialized editor)
      const sourceFactory = new Factory(10, 10)
      sourceFactory.placeMachine(0, 0, 'assembler', 'south')
      const save: FactorySave = saveFactory(sourceFactory, '', 'level-3')
      expect(save.pxtWorkspace).toBe('')

      // WHEN
      const restoreFactory = new Factory(10, 10)
      const restoreEditor = makePxtEditor('<xml><block type="controls_if"/></xml>')
      importFactoryWithProgram(save, restoreFactory, restoreEditor)

      // THEN — must not clobber the editor with empty XML
      expect(restoreEditor.loadWorkspaceXml).not.toHaveBeenCalled()
    })

    it('restores belt.name into the live factory (currently dropped by toolbar.onLoad)', async () => {
      // GIVEN — exported save carries a belt name
      const { factory: sourceFactory, beltName } = makeFactoryWithNamedBelt()
      const sourceEditor = makePxtEditor('<xml/>')
      const save = await exportFactoryWithProgram(sourceFactory, sourceEditor)
      expect(save.belts[0]!.name).toBe(beltName)

      // WHEN — importing into a fresh factory
      const restoreFactory = new Factory(10, 10)
      const restoreEditor = makePxtEditor('')
      importFactoryWithProgram(save, restoreFactory, restoreEditor)

      // THEN — belt name survived the round-trip into the live factory
      const restoredBelts = restoreFactory.getBelts()
      expect(restoredBelts.length).toBe(1)
      const namedBelt = restoredBelts.find(b => b.name === beltName)
      expect(namedBelt).toBeDefined()
    })
  })
})
