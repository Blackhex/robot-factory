import { vi } from 'vitest'
import { wireProjectsPanel } from '../../../../src/ui/wireProjectsPanel'
import type { Factory } from '../../../../src/game/Factory'
import type { ProjectsPanel } from '../../../../src/ui/ProjectsPanel'
import type { FactorySave } from '../../../../src/utils/SaveLoad'

export interface PanelStub {
  onSaveSlot?: unknown
  onLoadSlot?: unknown
  onDeleteSlot?: unknown
  onCreateNew?: () => void
  onImport?: () => void
  onExport?: (slotIds: string[]) => void
  setSlots: ReturnType<typeof vi.fn>
  /**
   * Production `ProjectsPanel.updateSlotName(slotId, newName)`: keeps
   * the panel's cached `slots[]` and the live row in sync with storage
   * after a per-keystroke rename, WITHOUT re-rendering. The wire layer
   * must call it from `onNameChange` immediately after `renameSlot`
   * succeeds so the blur-restore reads the latest name.
   */
  updateSlotName: ReturnType<typeof vi.fn>
  triggerExport(slotIds: string[]): void
  triggerImport(): void
  triggerCreateNew(): void
}

export type ProjectsPanelStub = ProjectsPanel & PanelStub

export function makeProjectsPanelStub(): ProjectsPanelStub {
  const panel: PanelStub = {
    setSlots: vi.fn(),
    updateSlotName: vi.fn(),
    triggerExport(slotIds: string[]): void {
      this.onExport?.(slotIds)
    },
    triggerImport(): void {
      this.onImport?.()
    },
    triggerCreateNew(): void {
      this.onCreateNew?.()
    },
  }
  return panel as unknown as ProjectsPanelStub
}

export function buildHarness(): ProjectsPanelStub {
  const projectsPanel = makeProjectsPanelStub()
  const factory = {
    getMachines: () => [],
    getBelts: () => [],
  } as unknown as Factory
  const gameManager = { factory, currentLevel: { id: 'sandbox' } }
  const pxtEditor = {
    getWorkspaceXml: () => '<xml/>',
    loadWorkspaceXml: vi.fn(),
    loadBlankProjectAsync: vi.fn(() => Promise.resolve()),
    flushPendingSaveAsync: () => Promise.resolve(),
  }

  wireProjectsPanel({
    projectsPanel,
    gameManager: gameManager as unknown as Parameters<typeof wireProjectsPanel>[0]['gameManager'],
    pxtEditor,
    audio: { playUIClick: vi.fn(), playError: vi.fn() },
    syncFactoryToEditor: vi.fn(),
    machinePanel: { hide: vi.fn() },
    beltPanel: { hide: vi.fn() },
    getFactoryRenderer: () => null,
    getItemRenderer: () => null,
    getGridInteraction: () => null,
  })

  return projectsPanel
}

/**
 * Spy bag exposed by `buildHarnessWithSpies()`. Every entry is the exact
 * `vi.fn()` instance handed to `wireProjectsPanel`, so tests can assert
 * call counts, arguments, and `mock.invocationCallOrder` for ordering.
 */
export interface HarnessSpies {
  factoryClear: ReturnType<typeof vi.fn>
  loadWorkspaceXml: ReturnType<typeof vi.fn>
  loadBlankProjectAsync: ReturnType<typeof vi.fn>
  flushPendingSaveAsync: ReturnType<typeof vi.fn>
  syncFactoryToEditor: ReturnType<typeof vi.fn>
  machinePanelHide: ReturnType<typeof vi.fn>
  beltPanelHide: ReturnType<typeof vi.fn>
  itemRendererClear: ReturnType<typeof vi.fn>
  factoryRendererSyncMeshes: ReturnType<typeof vi.fn>
  gridEnable: ReturnType<typeof vi.fn>
  gridDisable: ReturnType<typeof vi.fn>
  audioPlayUIClick: ReturnType<typeof vi.fn>
  audioPlayError: ReturnType<typeof vi.fn>
  /** Allow tests to swap the factory reference (e.g. set to null). */
  gameManager: { factory: Factory | null; currentLevel: { id: string } | null }
}

export interface SpyHarness {
  panel: ProjectsPanelStub
  mocks: HarnessSpies
}

export function buildHarnessWithSpies(): SpyHarness {
  const projectsPanel = makeProjectsPanelStub()

  const factoryClear = vi.fn()
  const factory = {
    getMachines: () => [],
    getBelts: () => [],
    clear: factoryClear,
  } as unknown as Factory

  const gameManager: HarnessSpies['gameManager'] = {
    factory,
    currentLevel: { id: 'sandbox' },
  }

  const loadWorkspaceXml = vi.fn()
  const loadBlankProjectAsync = vi.fn(() => Promise.resolve())
  const flushPendingSaveAsync = vi.fn(() => Promise.resolve())
  const pxtEditor = {
    getWorkspaceXml: () => '<xml/>',
    loadWorkspaceXml,
    loadBlankProjectAsync,
    flushPendingSaveAsync,
  }

  const audioPlayUIClick = vi.fn()
  const audioPlayError = vi.fn()
  const syncFactoryToEditor = vi.fn()
  const machinePanelHide = vi.fn()
  const beltPanelHide = vi.fn()
  const itemRendererClear = vi.fn()
  const factoryRendererSyncMeshes = vi.fn()
  const gridEnable = vi.fn()
  const gridDisable = vi.fn()

  wireProjectsPanel({
    projectsPanel,
    gameManager: gameManager as unknown as Parameters<typeof wireProjectsPanel>[0]['gameManager'],
    pxtEditor,
    audio: { playUIClick: audioPlayUIClick, playError: audioPlayError },
    syncFactoryToEditor,
    machinePanel: { hide: machinePanelHide },
    beltPanel: { hide: beltPanelHide },
    getFactoryRenderer: () => ({ syncMeshes: factoryRendererSyncMeshes }),
    getItemRenderer: () => ({ clear: itemRendererClear }),
    getGridInteraction: () => ({ enable: gridEnable, disable: gridDisable }),
  })

  return {
    panel: projectsPanel,
    mocks: {
      factoryClear,
      loadWorkspaceXml,
      loadBlankProjectAsync,
      flushPendingSaveAsync,
      syncFactoryToEditor,
      machinePanelHide,
      beltPanelHide,
      itemRendererClear,
      factoryRendererSyncMeshes,
      gridEnable,
      gridDisable,
      audioPlayUIClick,
      audioPlayError,
      gameManager,
    },
  }
}

export function makeSave(workspace: string): FactorySave {
  return { version: 2, grid: [], belts: [], pxtWorkspace: workspace }
}
