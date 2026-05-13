/**
 * @vitest-environment jsdom
 *
 * Regression: after saveNewSlot or overwriteSlot, the slot must be set as
 * lastLoadedId so the sandbox autosave hook starts persisting subsequent
 * edits to that slot. Without this attachment, "I just saved project Foo"
 * leaves autosave silently no-oping.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { wireProjectsPanel } from '../../../src/ui/wireProjectsPanel'
import * as Modal from '../../../src/ui/Modal'
import {
  getLastLoadedId,
  listSlots,
  saveNewSlot,
} from '../../../src/utils/SandboxProjects'
import type { Factory } from '../../../src/game/Factory'
import type { ProjectsPanel } from '../../../src/ui/ProjectsPanel'

function makeProjectsPanelStub(): ProjectsPanel & {
  triggerSave: (slotId: string | null) => void
} {
  const panel = {
    onSaveSlot: undefined as ((slotId: string | null) => void) | undefined,
    onLoadSlot: undefined as unknown,
    onDeleteSlot: undefined as unknown,
    onImport: undefined as unknown,
    onExport: undefined as unknown,
    setSlots: vi.fn(),
    triggerSave(slotId: string | null): void {
      this.onSaveSlot?.(slotId)
    },
  }
  return panel as unknown as ProjectsPanel & {
    triggerSave: (slotId: string | null) => void
  }
}

describe('wireProjectsPanel.onSaveSlot — attaches slot as lastLoadedId', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saveNewSlot path sets lastLoadedId to the new slot id', async () => {
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

    vi.spyOn(Modal, 'promptModal').mockResolvedValue('My Project')

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

    expect(getLastLoadedId()).toBeNull()

    projectsPanel.triggerSave(null)
    // onSaveSlot wraps async work — let it settle.
    await new Promise(resolve => setTimeout(resolve, 0))

    const slots = listSlots()
    expect(slots).toHaveLength(1)
    expect(getLastLoadedId()).toBe(slots[0]!.id)
  })

  it('overwriteSlot path sets lastLoadedId to the overwritten slot id', async () => {
    const existing = saveNewSlot('Existing', {
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: '',
    })
    // Make sure we start with no attachment.
    localStorage.setItem(
      'rf_sandbox_projects_index',
      JSON.stringify({
        version: 1,
        slots: [existing],
        lastLoadedId: null,
      }),
    )
    expect(getLastLoadedId()).toBeNull()

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

    projectsPanel.triggerSave(existing.id)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(getLastLoadedId()).toBe(existing.id)
  })
})
