/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { FactorySave } from '../../../src/utils/SaveLoad'
import {
  listSlots,
  saveNewSlot,
  overwriteSlot,
  renameSlot,
  loadSlot,
  deleteSlot,
  getLastLoadedId,
  setLastLoadedId,
  migrateLegacyAutosave,
  sandboxProjectSlotKey,
  SANDBOX_PROJECTS_INDEX_KEY,
  LEGACY_SANDBOX_AUTOSAVE_KEY,
} from '../../../src/utils/SandboxProjects'

function makeSave(overrides: Partial<FactorySave> = {}): FactorySave {
  return {
    version: 2,
    grid: [],
    belts: [],
    pxtWorkspace: '',
    ...overrides,
  }
}

describe('SandboxProjects', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('constants', () => {
    it('exports stable storage key constants', () => {
      expect(SANDBOX_PROJECTS_INDEX_KEY).toBe('rf_sandbox_projects_index')
      expect(LEGACY_SANDBOX_AUTOSAVE_KEY).toBe('rf_factory_sandbox')
      expect(sandboxProjectSlotKey('abc')).toBe('rf_sandbox_project_abc')
    })
  })

  describe('listSlots()', () => {
    it('returns [] when localStorage is empty', () => {
      expect(listSlots()).toEqual([])
    })
  })

  describe('saveNewSlot()', () => {
    it('persists a slot, returns its data, and re-reads the FactorySave from its slot key', () => {
      // GIVEN
      const save = makeSave({ pxtWorkspace: '<xml id="hello"/>' })

      // WHEN
      const slot = saveNewSlot('My Project', save)

      // THEN
      expect(slot.id).toBeTruthy()
      expect(typeof slot.id).toBe('string')
      expect(slot.name).toBe('My Project')
      expect(typeof slot.savedAt).toBe('number')
      expect(slot.savedAt).toBeGreaterThan(0)

      const slots = listSlots()
      expect(slots).toHaveLength(1)
      expect(slots[0]?.id).toBe(slot.id)

      const raw = localStorage.getItem(sandboxProjectSlotKey(slot.id))
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw as string) as FactorySave
      expect(parsed.pxtWorkspace).toBe('<xml id="hello"/>')
    })

    it('trims the name and throws on whitespace-only name', () => {
      const slot = saveNewSlot('   Trimmed   ', makeSave())
      expect(slot.name).toBe('Trimmed')

      expect(() => saveNewSlot('   ', makeSave())).toThrow()
      expect(() => saveNewSlot('', makeSave())).toThrow()
    })

    it('prepends to the index so newest is first when listed', () => {
      const a = saveNewSlot('A', makeSave())
      const b = saveNewSlot('B', makeSave())
      const c = saveNewSlot('C', makeSave())

      const slots = listSlots()
      expect(slots.map(s => s.id)).toEqual([c.id, b.id, a.id])
    })
  })

  describe('overwriteSlot()', () => {
    it('updates savedAt and FactorySave content but keeps id and name', async () => {
      // GIVEN
      const slot = saveNewSlot('Original', makeSave({ pxtWorkspace: 'v1' }))
      const originalSavedAt = slot.savedAt

      // small delay so savedAt definitely advances
      await new Promise(r => setTimeout(r, 5))

      // WHEN
      const updated = overwriteSlot(slot.id, makeSave({ pxtWorkspace: 'v2' }))

      // THEN
      expect(updated.id).toBe(slot.id)
      expect(updated.name).toBe('Original')
      expect(updated.savedAt).toBeGreaterThanOrEqual(originalSavedAt)

      const raw = localStorage.getItem(sandboxProjectSlotKey(slot.id))
      const parsed = JSON.parse(raw as string) as FactorySave
      expect(parsed.pxtWorkspace).toBe('v2')
    })

    it('throws on unknown slot id', () => {
      expect(() => overwriteSlot('nope', makeSave())).toThrow()
    })
  })

  describe('renameSlot()', () => {
    it('updates the name (trimmed)', () => {
      const slot = saveNewSlot('Original', makeSave())
      const renamed = renameSlot(slot.id, '  New Name  ')
      expect(renamed.name).toBe('New Name')
      expect(renamed.id).toBe(slot.id)
      expect(listSlots().find(s => s.id === slot.id)?.name).toBe('New Name')
    })

    it('throws on empty name', () => {
      const slot = saveNewSlot('Original', makeSave())
      expect(() => renameSlot(slot.id, '   ')).toThrow()
      expect(() => renameSlot(slot.id, '')).toThrow()
    })

    it('throws on unknown id', () => {
      expect(() => renameSlot('nope', 'x')).toThrow()
    })
  })

  describe('loadSlot()', () => {
    it('returns the FactorySave and sets lastLoadedId', () => {
      const slot = saveNewSlot('P', makeSave({ pxtWorkspace: 'data' }))

      const save = loadSlot(slot.id)
      expect(save).not.toBeNull()
      expect(save?.pxtWorkspace).toBe('data')
      expect(getLastLoadedId()).toBe(slot.id)
    })

    it('returns null if the slot is missing', () => {
      expect(loadSlot('does-not-exist')).toBeNull()
    })

    it('returns null if the stored FactorySave is invalid', () => {
      const slot = saveNewSlot('Bad', makeSave())
      localStorage.setItem(sandboxProjectSlotKey(slot.id), '{not valid json')
      expect(loadSlot(slot.id)).toBeNull()
    })
  })

  describe('deleteSlot()', () => {
    it('removes both the FactorySave key and the index entry', () => {
      const slot = saveNewSlot('Doomed', makeSave())
      expect(localStorage.getItem(sandboxProjectSlotKey(slot.id))).not.toBeNull()

      deleteSlot(slot.id)

      expect(localStorage.getItem(sandboxProjectSlotKey(slot.id))).toBeNull()
      expect(listSlots().find(s => s.id === slot.id)).toBeUndefined()
    })

    it('clears lastLoadedId if it pointed to the deleted slot', () => {
      const slot = saveNewSlot('Doomed', makeSave())
      loadSlot(slot.id)
      expect(getLastLoadedId()).toBe(slot.id)

      deleteSlot(slot.id)

      expect(getLastLoadedId()).toBeNull()
    })

    it('does not clear lastLoadedId if it pointed to a different slot', () => {
      const a = saveNewSlot('A', makeSave())
      const b = saveNewSlot('B', makeSave())
      loadSlot(a.id)

      deleteSlot(b.id)

      expect(getLastLoadedId()).toBe(a.id)
    })

    it('is a no-op for unknown slot id', () => {
      expect(() => deleteSlot('unknown')).not.toThrow()
    })
  })

  describe('getLastLoadedId() / setLastLoadedId()', () => {
    it('round-trips through localStorage', () => {
      expect(getLastLoadedId()).toBeNull()
      setLastLoadedId('xyz')
      expect(getLastLoadedId()).toBe('xyz')
      setLastLoadedId(null)
      expect(getLastLoadedId()).toBeNull()
    })
  })

  describe('migrateLegacyAutosave()', () => {
    it('migrates a legacy autosave into a slot named "Autosave" and removes the legacy key', () => {
      const legacy = makeSave({ pxtWorkspace: 'legacy-data' })
      localStorage.setItem(LEGACY_SANDBOX_AUTOSAVE_KEY, JSON.stringify(legacy))

      const slot = migrateLegacyAutosave()

      expect(slot).not.toBeNull()
      expect(slot?.name).toBe('Autosave')
      expect(localStorage.getItem(LEGACY_SANDBOX_AUTOSAVE_KEY)).toBeNull()

      const slots = listSlots()
      expect(slots).toHaveLength(1)
      expect(slots[0]?.id).toBe(slot?.id)

      const loaded = loadSlot(slot!.id)
      expect(loaded?.pxtWorkspace).toBe('legacy-data')
    })

    it('returns null and leaves storage alone when there is no legacy autosave', () => {
      expect(migrateLegacyAutosave()).toBeNull()
      expect(listSlots()).toEqual([])
    })

    it('returns null when the index already has slots', () => {
      saveNewSlot('Existing', makeSave())
      const legacy = makeSave({ pxtWorkspace: 'legacy-data' })
      localStorage.setItem(LEGACY_SANDBOX_AUTOSAVE_KEY, JSON.stringify(legacy))

      expect(migrateLegacyAutosave()).toBeNull()
      // legacy key untouched
      expect(localStorage.getItem(LEGACY_SANDBOX_AUTOSAVE_KEY)).not.toBeNull()
      expect(listSlots()).toHaveLength(1)
    })

    it('returns null when the legacy autosave is invalid JSON', () => {
      localStorage.setItem(LEGACY_SANDBOX_AUTOSAVE_KEY, '{not valid')
      expect(migrateLegacyAutosave()).toBeNull()
    })

    it('is idempotent: calling twice does nothing the second time', () => {
      const legacy = makeSave({ pxtWorkspace: 'legacy-data' })
      localStorage.setItem(LEGACY_SANDBOX_AUTOSAVE_KEY, JSON.stringify(legacy))

      const first = migrateLegacyAutosave()
      expect(first).not.toBeNull()
      expect(listSlots()).toHaveLength(1)

      const second = migrateLegacyAutosave()
      expect(second).toBeNull()
      expect(listSlots()).toHaveLength(1)
    })
  })
})
