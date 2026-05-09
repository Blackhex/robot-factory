import { vi } from 'vitest'
import { wireProjectsPanel } from '../../../../src/ui/wireProjectsPanel'
import type { Factory } from '../../../../src/game/Factory'
import type { ProjectsPanel } from '../../../../src/ui/ProjectsPanel'
import type { FactorySave } from '../../../../src/utils/SaveLoad'

export interface PanelStub {
  onSaveSlot?: unknown
  onLoadSlot?: unknown
  onDeleteSlot?: unknown
  onImport?: () => void
  onExport?: (slotIds: string[]) => void
  setSlots: ReturnType<typeof vi.fn>
  triggerExport(slotIds: string[]): void
  triggerImport(): void
}

export type ProjectsPanelStub = ProjectsPanel & PanelStub

export function makeProjectsPanelStub(): ProjectsPanelStub {
  const panel: PanelStub = {
    setSlots: vi.fn(),
    triggerExport(slotIds: string[]): void {
      this.onExport?.(slotIds)
    },
    triggerImport(): void {
      this.onImport?.()
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

export function makeSave(workspace: string): FactorySave {
  return { version: 2, grid: [], belts: [], pxtWorkspace: workspace }
}
