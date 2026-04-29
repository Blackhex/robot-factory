import type { Factory } from '../game/Factory'
import {
  saveFactory,
  loadFactory,
  saveToLocalStorage,
  loadFromLocalStorage,
  type FactorySave,
} from './SaveLoad'

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
  saveToLocalStorage(getFactorySaveKey(levelId), save)
}

export function autoRestoreFactory(
  factory: Factory | null | undefined,
  pxtEditor: PxtEditorLike,
  levelId?: string,
): boolean {
  const save = loadFromLocalStorage(getFactorySaveKey(levelId))
  if (!save) return false
  if (!factory) return false
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
