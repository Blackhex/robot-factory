import {
  loadFromLocalStorage,
  saveToLocalStorage,
  type FactorySave,
} from './SaveLoad.ts'

/** localStorage key for the sandbox projects index document. */
export const SANDBOX_PROJECTS_INDEX_KEY = 'rf_sandbox_projects_index'

/** localStorage key for the user-controlled slot ordering (if present). */
export const SANDBOX_PROJECTS_ORDER_KEY = 'rf_sandbox_projects_index:order'

/** Legacy single-slot sandbox autosave key, kept for migration. */
export const LEGACY_SANDBOX_AUTOSAVE_KEY = 'rf_factory_sandbox'

const INDEX_VERSION = 1

/** Build the localStorage key for the FactorySave payload of a given slot. */
export function sandboxProjectSlotKey(id: string): string {
  return `rf_sandbox_project_${id}`
}

export interface ProjectSlot {
  id: string
  name: string
  savedAt: number
}

export interface SandboxProjectsIndex {
  version: number
  slots: ProjectSlot[]
  lastLoadedId: string | null
}

function emptyIndex(): SandboxProjectsIndex {
  return { version: INDEX_VERSION, slots: [], lastLoadedId: null }
}

function readIndex(): SandboxProjectsIndex {
  const raw = localStorage.getItem(SANDBOX_PROJECTS_INDEX_KEY)
  if (raw === null) return emptyIndex()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as SandboxProjectsIndex).slots)
    ) {
      const idx = parsed as SandboxProjectsIndex
      return {
        version: typeof idx.version === 'number' ? idx.version : INDEX_VERSION,
        slots: idx.slots.filter(
          (s): s is ProjectSlot =>
            typeof s === 'object' &&
            s !== null &&
            typeof s.id === 'string' &&
            typeof s.name === 'string' &&
            typeof s.savedAt === 'number',
        ),
        lastLoadedId:
          typeof idx.lastLoadedId === 'string' ? idx.lastLoadedId : null,
      }
    }
  } catch {
    // fall through
  }
  return emptyIndex()
}

function writeIndex(idx: SandboxProjectsIndex): void {
  localStorage.setItem(SANDBOX_PROJECTS_INDEX_KEY, JSON.stringify(idx))
}

function readExplicitOrder(): string[] | null {
  const raw = localStorage.getItem(SANDBOX_PROJECTS_ORDER_KEY)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every(v => typeof v === 'string')) {
      return parsed
    }
  } catch {
    // fall through
  }
  return null
}

function writeExplicitOrder(order: string[]): void {
  try {
    localStorage.setItem(SANDBOX_PROJECTS_ORDER_KEY, JSON.stringify(order))
  } catch {
    // swallow — matches existing best-effort persistence pattern
  }
}

function generateId(): string {
  const c: { randomUUID?: () => string } | undefined =
    typeof crypto !== 'undefined' ? crypto : undefined
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID().replace(/-/g, '').slice(0, 12)
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Return all known slots, newest first (or in user-defined order if set). */
export function listSlots(): ProjectSlot[] {
  const slots = readIndex().slots
  const defaultOrder = defaultSortNewestFirst(slots)
  const explicit = readExplicitOrder()
  if (explicit === null) return defaultOrder

  const byId = new Map<string, ProjectSlot>()
  for (const s of slots) byId.set(s.id, s)

  const result: ProjectSlot[] = []
  const seen = new Set<string>()
  for (const id of explicit) {
    const slot = byId.get(id)
    if (slot && !seen.has(id)) {
      result.push(slot)
      seen.add(id)
    }
  }
  for (const slot of defaultOrder) {
    if (!seen.has(slot.id)) {
      result.push(slot)
      seen.add(slot.id)
    }
  }
  return result
}

/** Default user-facing sort: most recently saved first. */
function defaultSortNewestFirst(slots: ProjectSlot[]): ProjectSlot[] {
  return [...slots].sort((a, b) => b.savedAt - a.savedAt)
}

/**
 * Persist a user-controlled slot ordering. Unknown ids are dropped
 * silently; existing slots not mentioned are appended at the end in
 * their current `listSlots()` order.
 */
export function setSlotOrder(orderedIds: string[]): void {
  try {
    const slots = readIndex().slots
    const validIds = new Set(slots.map(s => s.id))
    const seen = new Set<string>()
    const filtered: string[] = []
    for (const id of orderedIds) {
      if (validIds.has(id) && !seen.has(id)) {
        filtered.push(id)
        seen.add(id)
      }
    }
    // Append leftovers in their current listSlots() order. Compute
    // listSlots() order without our own (still-unwritten) explicit
    // order — i.e. fall back to newest-first by savedAt.
    const defaultOrder = defaultSortNewestFirst(slots)
    for (const slot of defaultOrder) {
      if (!seen.has(slot.id)) {
        filtered.push(slot.id)
        seen.add(slot.id)
      }
    }
    writeExplicitOrder(filtered)
  } catch {
    // swallow — matches existing best-effort persistence pattern
  }
}

/** Create a new slot with the given name and persist the FactorySave to it. */
export function saveNewSlot(name: string, save: FactorySave): ProjectSlot {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new Error('Slot name must not be empty')
  }
  const slot: ProjectSlot = {
    id: generateId(),
    name: trimmed,
    savedAt: Date.now(),
  }
  const idx = readIndex()
  idx.slots.unshift(slot)
  writeIndex(idx)
  saveToLocalStorage(sandboxProjectSlotKey(slot.id), save)
  return slot
}

/**
 * Create a new slot AND pin it to the end of the user-facing display
 * order. Wraps `saveNewSlot` (so the underlying index still prepends,
 * keeping its newest-first invariant) and then writes an explicit
 * order placing the new slot last — matching the user expectation
 * that saving a project appends it visually to the projects list.
 */
export function saveNewSlotAtEnd(name: string, save: FactorySave): ProjectSlot {
  const slot = saveNewSlot(name, save)
  const ordered = listSlots().map(s => s.id).filter(id => id !== slot.id)
  setSlotOrder([...ordered, slot.id])
  return slot
}

/** Overwrite an existing slot's FactorySave content and bump its savedAt. */
export function overwriteSlot(slotId: string, save: FactorySave): ProjectSlot {
  const idx = readIndex()
  const slot = idx.slots.find(s => s.id === slotId)
  if (!slot) {
    throw new Error(`Unknown sandbox slot: ${slotId}`)
  }
  slot.savedAt = Date.now()
  writeIndex(idx)
  saveToLocalStorage(sandboxProjectSlotKey(slot.id), save)
  return { ...slot }
}

/** Rename an existing slot. The new name is trimmed and must not be empty. */
export function renameSlot(slotId: string, name: string): ProjectSlot {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new Error('Slot name must not be empty')
  }
  const idx = readIndex()
  const slot = idx.slots.find(s => s.id === slotId)
  if (!slot) {
    throw new Error(`Unknown sandbox slot: ${slotId}`)
  }
  slot.name = trimmed
  writeIndex(idx)
  return { ...slot }
}

/** Load a slot's FactorySave. Returns null if missing or invalid. Sets lastLoadedId on success. */
export function loadSlot(slotId: string): FactorySave | null {
  const save = loadFromLocalStorage(sandboxProjectSlotKey(slotId))
  if (save === null) return null
  setLastLoadedId(slotId)
  return save
}

/** Delete a slot and its FactorySave payload. Clears lastLoadedId if it pointed at the slot. */
export function deleteSlot(slotId: string): void {
  const idx = readIndex()
  const before = idx.slots.length
  idx.slots = idx.slots.filter(s => s.id !== slotId)
  if (idx.slots.length === before) return
  if (idx.lastLoadedId === slotId) {
    idx.lastLoadedId = null
  }
  writeIndex(idx)
  localStorage.removeItem(sandboxProjectSlotKey(slotId))
  const order = readExplicitOrder()
  if (order !== null) {
    writeExplicitOrder(order.filter(id => id !== slotId))
  }
}

/** Get the id of the slot most recently loaded, if any. */
export function getLastLoadedId(): string | null {
  return readIndex().lastLoadedId
}

/** Set or clear the last-loaded slot id. */
export function setLastLoadedId(id: string | null): void {
  const idx = readIndex()
  idx.lastLoadedId = id
  writeIndex(idx)
}

/**
 * Migrate the legacy single-slot sandbox autosave into a named slot called "Autosave".
 * No-op (returns null) if there is no legacy save, the legacy save is invalid,
 * or the index already contains at least one slot.
 */
export function migrateLegacyAutosave(): ProjectSlot | null {
  const existing = readIndex()
  if (existing.slots.length > 0) return null

  const legacy = loadFromLocalStorage(LEGACY_SANDBOX_AUTOSAVE_KEY)
  if (legacy === null) return null

  const slot = saveNewSlot('Autosave', legacy)
  localStorage.removeItem(LEGACY_SANDBOX_AUTOSAVE_KEY)
  return slot
}
