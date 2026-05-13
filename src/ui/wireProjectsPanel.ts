import { i18next } from '../i18n/i18n'
import { promptModal, confirmModal } from './Modal'
import {
  exportToFile,
  exportBundleToFile,
  importFilesFromUser,
  type FactorySave,
} from '../utils/SaveLoad'
import {
  exportFactoryWithProgram,
  importFactoryWithProgram,
} from '../utils/AutoSave'
import {
  deleteSlot,
  listSlots,
  loadSlot,
  overwriteSlot,
  saveNewSlot,
  saveNewSlotAtEnd,
  setLastLoadedId,
  setSlotOrder,
} from '../utils/SandboxProjects'
import type { Factory } from '../game/Factory'
import type { ProjectsPanel } from './ProjectsPanel'

interface AudioLike {
  playUIClick(): void
  playError(): void
}

interface PxtEditorLike {
  getWorkspaceXml(): string
  loadWorkspaceXml(xml: string): void
  /**
   * Replace the editor with a blank "on start" program. Resolves only
   * after the live Blockly workspace has converged to that one block —
   * see `PxtEditor.loadBlankProjectAsync` for why this is a separate API
   * from `loadWorkspaceXml(BLANK_PROJECT_BLOCKS_XML)` (defined in
   * `src/editor/PxtEditorBlankProject.ts`).
   */
  loadBlankProjectAsync(): Promise<void>
  flushPendingSaveAsync(): Promise<void>
}

interface CurrentLevelLike {
  id: string
}

interface GameManagerLike {
  factory: Factory | null
  currentLevel: CurrentLevelLike | null
}

interface FactoryRendererLike {
  syncMeshes(): void
}

interface ItemRendererLike {
  clear(): void
}

interface GridInteractionLike {
  enable(): void
  disable(): void
}

interface SelectionPanelLike {
  hide(): void
}

export interface WireProjectsPanelOptions {
  projectsPanel: ProjectsPanel
  gameManager: GameManagerLike
  pxtEditor: PxtEditorLike
  audio: AudioLike
  syncFactoryToEditor: () => void
  /** Hide selection panels synchronously before a destructive load. */
  machinePanel: SelectionPanelLike
  beltPanel: SelectionPanelLike
  getFactoryRenderer: () => FactoryRendererLike | null
  getItemRenderer: () => ItemRendererLike | null
  getGridInteraction: () => GridInteractionLike | null
}

export interface WiredProjectsPanel {
  refreshSlots: () => void
}

export function wireProjectsPanel(options: WireProjectsPanelOptions): WiredProjectsPanel {
  const {
    projectsPanel,
    gameManager,
    pxtEditor,
    audio,
    syncFactoryToEditor,
    machinePanel,
    beltPanel,
    getFactoryRenderer,
    getItemRenderer,
    getGridInteraction,
  } = options

  const refreshSlots = (): void => {
    projectsPanel.setSlots(listSlots())
  }

  async function runDestructiveFactoryReplace(
    mutate: (factory: Factory) => void | Promise<void>,
  ): Promise<void> {
    machinePanel.hide()
    beltPanel.hide()
    getGridInteraction()?.disable()
    try {
      await pxtEditor.flushPendingSaveAsync()
    } catch { /* best-effort drain */ }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const f = gameManager.factory
    if (!f) {
      getGridInteraction()?.enable()
      return
    }
    f.clear()
    getItemRenderer()?.clear()
    await mutate(f)
    getFactoryRenderer()?.syncMeshes()
    syncFactoryToEditor()
    getGridInteraction()?.enable()
  }

  projectsPanel.onSaveSlot = (slotId) => {
    audio.playUIClick()
    const factory = gameManager.factory
    if (!factory) return
    void (async (): Promise<void> => {
      const levelId = gameManager.currentLevel?.id
      const save = await exportFactoryWithProgram(factory, pxtEditor, levelId)
      if (slotId === null) {
        const name = await promptModal({
          title: i18next.t('projects.new_project_title'),
          defaultValue: '',
        })
        if (name === null) return
        const trimmed = name.trim()
        if (trimmed.length === 0) return
        const newSlot = saveNewSlotAtEnd(trimmed, save)
        setLastLoadedId(newSlot.id)
      } else {
        overwriteSlot(slotId, save)
        setLastLoadedId(slotId)
      }
      refreshSlots()
    })()
  }

  projectsPanel.onLoadSlot = (slotId) => {
    audio.playUIClick()
    const factory = gameManager.factory
    if (!factory) return
    const save = loadSlot(slotId)
    if (!save) return
    void runDestructiveFactoryReplace((f) => importFactoryWithProgram(save, f, pxtEditor))
  }

  projectsPanel.onCreateNew = () => {
    audio.playUIClick()
    void (async (): Promise<void> => {
      const ok = await confirmModal({
        title: i18next.t('projects.confirm_new_title'),
        message: i18next.t('projects.confirm_new_message'),
      })
      if (!ok) return
      await runDestructiveFactoryReplace(() => pxtEditor.loadBlankProjectAsync())
    })()
  }

  projectsPanel.onDeleteSlot = (slotId) => {
    audio.playUIClick()
    void (async (): Promise<void> => {
      const slot = listSlots().find((s) => s.id === slotId)
      const displayName = slot?.name === 'Autosave'
        ? i18next.t('projects.autosave_name')
        : slot?.name ?? ''
      const ok = await confirmModal({
        title: i18next.t('projects.confirm_delete_title'),
        message: i18next.t('projects.confirm_delete_message', { name: displayName }),
      })
      if (!ok) return
      deleteSlot(slotId)
      refreshSlots()
    })()
  }

  projectsPanel.onImport = () => {
    audio.playUIClick()
    void (async (): Promise<void> => {
      try {
        const entries = await importFilesFromUser()
        if (entries.length === 0) return

        if (entries.length === 1 && entries[0]!.name === null) {
          const factory = gameManager.factory
          const save = entries[0]!.save
          if (factory) {
            importFactoryWithProgram(save, factory, pxtEditor)
            getFactoryRenderer()?.syncMeshes()
            syncFactoryToEditor()
          }
          const name = await promptModal({
            title: i18next.t('projects.new_project_title'),
            defaultValue: '',
          })
          if (name !== null && name.trim().length > 0) {
            saveNewSlot(name.trim(), save)
            refreshSlots()
          }
          return
        }

        for (const entry of entries) {
          const name = entry.name ?? `Imported ${Date.now()}`
          saveNewSlot(name, entry.save)
        }
        refreshSlots()
      } catch {
        audio.playError()
      }
    })()
  }

  projectsPanel.onExport = (slotIds) => {
    audio.playUIClick()
    void (async (): Promise<void> => {
      if (slotIds.length === 0) {
        const factory = gameManager.factory
        if (!factory) return
        const levelId = gameManager.currentLevel?.id
        const save = await exportFactoryWithProgram(factory, pxtEditor, levelId)
        exportToFile(save)
        return
      }
      if (slotIds.length === 1) {
        const save = loadSlot(slotIds[0]!)
        if (save) exportToFile(save)
        return
      }
      const allSlots = listSlots()
      const entries: { name: string; save: FactorySave }[] = []
      for (const id of slotIds) {
        const save = loadSlot(id)
        if (!save) continue
        const meta = allSlots.find((s) => s.id === id)
        entries.push({ name: meta?.name ?? id, save })
      }
      exportBundleToFile(entries)
    })()
  }

  projectsPanel.onReorder = (ids) => {
    // Persist only — the panel's reorder controller has already updated
    // its in-memory `slots` and re-rendered the list with focus restored
    // to the moved row. Calling `refreshSlots()` here would invoke
    // `setSlots()` → `renderList()` a second time, wiping the focused
    // row's DOM node and breaking consecutive Alt+Arrow keyboard reorder.
    setSlotOrder(ids)
  }

  refreshSlots()

  return { refreshSlots }
}
