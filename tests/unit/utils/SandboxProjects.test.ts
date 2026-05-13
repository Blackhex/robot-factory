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
import * as SandboxProjectsModule from '../../../src/utils/SandboxProjects'

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

// REQUIREMENT: drag-and-drop reordering needs a store-level mutator
// `setSlotOrder(orderedIds)` that reshuffles the persisted slot array
// so that subsequent `listSlots()` calls return slots in the requested
// order. Unknown ids in the input are silently dropped; existing slots
// not mentioned in the input are appended at the end in their original
// relative order. The function must be idempotent for the same input
// and persist to the same localStorage key the rest of the module uses.
describe('SandboxProjects.setSlotOrder()', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // The new export does not exist yet. Read it through a typed cast on
  // the module namespace so the file still compiles in RED.
  function setSlotOrder(orderedIds: string[]): void {
    const fn = (
      SandboxProjectsModule as unknown as {
        setSlotOrder?: (ids: string[]) => void
      }
    ).setSlotOrder
    if (typeof fn !== 'function') {
      throw new Error('setSlotOrder is not exported from SandboxProjects')
    }
    fn(orderedIds)
  }

  it('reorders persisted slots so listSlots() returns them in the requested order', () => {
    const a = saveNewSlot('A', makeSave())
    const b = saveNewSlot('B', makeSave())
    const c = saveNewSlot('C', makeSave())

    setSlotOrder([b.id, c.id, a.id])

    expect(listSlots().map(s => s.id)).toEqual([b.id, c.id, a.id])
  })

  it('persists the new order across re-reads (writes to the same index key)', () => {
    const a = saveNewSlot('A', makeSave())
    const b = saveNewSlot('B', makeSave())

    setSlotOrder([a.id, b.id])

    const raw = localStorage.getItem(SANDBOX_PROJECTS_INDEX_KEY)
    expect(raw).not.toBeNull()
    // Just observe the public effect: a fresh listSlots() reads the
    // same key and returns the requested order.
    expect(listSlots().map(s => s.id)).toEqual([a.id, b.id])
  })

  it('filters out unknown ids in the input without throwing', () => {
    const a = saveNewSlot('A', makeSave())
    const b = saveNewSlot('B', makeSave())

    expect(() =>
      setSlotOrder([b.id, 'ghost-1', a.id, 'ghost-2']),
    ).not.toThrow()

    expect(listSlots().map(s => s.id)).toEqual([b.id, a.id])
  })

  it('appends slots not mentioned in the input at the end in their original relative order', () => {
    const a = saveNewSlot('A', makeSave())
    const b = saveNewSlot('B', makeSave())
    const c = saveNewSlot('C', makeSave())
    const d = saveNewSlot('D', makeSave())

    // Establish a known starting order: D, C, B, A (newest first via
    // saveNewSlot's prepend semantics).
    expect(listSlots().map(s => s.id)).toEqual([d.id, c.id, b.id, a.id])

    // Mention only B and D. A and C must follow at the end in their
    // original relative order — which in the starting array is
    // [D, C, B, A] → C appears before A.
    setSlotOrder([b.id, d.id])

    const ids = listSlots().map(s => s.id)
    expect(ids.slice(0, 2)).toEqual([b.id, d.id])
    expect(ids.slice(2)).toEqual([c.id, a.id])
  })

  it('is idempotent: applying the same order twice yields the same result', () => {
    const a = saveNewSlot('A', makeSave())
    const b = saveNewSlot('B', makeSave())
    const c = saveNewSlot('C', makeSave())

    const order = [c.id, a.id, b.id]
    setSlotOrder(order)
    const after1 = listSlots().map(s => s.id)
    setSlotOrder(order)
    const after2 = listSlots().map(s => s.id)

    expect(after1).toEqual(order)
    expect(after2).toEqual(order)
  })

  it('empty input keeps every existing slot, preserving original order', () => {
    const a = saveNewSlot('A', makeSave())
    const b = saveNewSlot('B', makeSave())

    const before = listSlots().map(s => s.id)
    setSlotOrder([])
    const after = listSlots().map(s => s.id)

    expect(after).toEqual(before)
    // Sanity — both saved ids are still present.
    expect(after).toContain(a.id)
    expect(after).toContain(b.id)
  })

  it('does not delete slot payloads when reordering', () => {
    const a = saveNewSlot('A', makeSave({ pxtWorkspace: 'A-data' }))
    const b = saveNewSlot('B', makeSave({ pxtWorkspace: 'B-data' }))

    setSlotOrder([b.id, a.id])

    expect(loadSlot(a.id)?.pxtWorkspace).toBe('A-data')
    expect(loadSlot(b.id)?.pxtWorkspace).toBe('B-data')
  })
})
