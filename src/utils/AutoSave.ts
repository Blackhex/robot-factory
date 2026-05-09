import type { Factory } from '../game/Factory'
import {
  saveFactory,
  loadFactory,
  saveToLocalStorage,
  loadFromLocalStorage,
  type FactorySave,
} from './SaveLoad'
import {
  getLastLoadedId,
  loadSlot,
  migrateLegacyAutosave,
  overwriteSlot,
} from './SandboxProjects'

export const FACTORY_SAVE_PREFIX = 'rf_factory_'

/**
 * Structural interface for the PXT editor surface needed by autosave.
 * The real `PxtEditor` satisfies this via duck typing — keeps `src/utils/`
 * free of editor/rendering imports.
 */
export interface PxtEditorLike {
  getWorkspaceXml(): string
  loadWorkspaceXml(xml: string): void
  flushPendingSaveAsync(): Promise<void>
}

export function getFactorySaveKey(levelId?: string): string {
  return FACTORY_SAVE_PREFIX + (levelId ?? 'sandbox')
}

export async function autoSaveFactory(
  factory: Factory | null | undefined,
  pxtEditor: PxtEditorLike,
  levelId?: string,
): Promise<void> {
  if (!factory) return
  await pxtEditor.flushPendingSaveAsync()
  const workspace = pxtEditor.getWorkspaceXml()
  const save = saveFactory(factory, workspace, levelId)
  if (levelId === undefined) {
    // Sandbox: autosave overwrites the slot the user most recently loaded
    // (or saved) in the Projects panel. Until the user explicitly saves a
    // project once, autosave is a no-op — we don't want to silently
    // resurrect a sandbox state on top of an unrelated session.
    const lastId = getLastLoadedId()
    if (lastId === null) return
    try {
      overwriteSlot(lastId, save)
    } catch {
      // Slot was deleted between load and autosave — silently drop.
    }
    return
  }
  saveToLocalStorage(getFactorySaveKey(levelId), save)
}

export function autoRestoreFactory(
  factory: Factory | null | undefined,
  pxtEditor: PxtEditorLike,
  levelId?: string,
): boolean {
  if (!factory) return false
  if (levelId === undefined) {
    // Sandbox: migrate any legacy single-slot autosave into the named-slot
    // index, then restore from the user's most recently loaded slot.
    try { migrateLegacyAutosave() } catch { /* ignore migration failure */ }
    const lastId = getLastLoadedId()
    if (lastId === null) return false
    const save = loadSlot(lastId)
    if (!save) return false
    try {
      importFactoryWithProgram(save, factory, pxtEditor)
      return true
    } catch {
      return false
    }
  }
  const save = loadFromLocalStorage(getFactorySaveKey(levelId))
  if (!save) return false
  try {
    importFactoryWithProgram(save, factory, pxtEditor)
    return true
  } catch {
    return false
  }
}

export async function exportFactoryWithProgram(
  factory: Factory,
  pxtEditor: PxtEditorLike,
  levelId?: string,
): Promise<FactorySave> {
  await pxtEditor.flushPendingSaveAsync()
  return saveFactory(factory, pxtEditor.getWorkspaceXml(), levelId)
}

export function importFactoryWithProgram(
  save: FactorySave,
  factory: Factory,
  pxtEditor: PxtEditorLike,
): void {
  const result = loadFactory(save)
  factory.restoreState(
    result.factory.getMachines().map(m => ({ x: m.x, z: m.z, type: m.type, rotation: m.rotation, name: m.name })),
    result.factory.getBelts().map(b => ({ sourceSlot: b.sourceSlot, destinationSlot: b.destinationSlot, path: b.path, name: b.name })),
  )
  if (typeof save.pxtWorkspace === 'string' && save.pxtWorkspace.length > 0) {
    pxtEditor.loadWorkspaceXml(save.pxtWorkspace)
  }
}
