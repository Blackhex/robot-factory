/**
 * @vitest-environment jsdom
 *
 * Contract tests for the unified bundle-only import wiring in
 * `wireProjectsPanel.onImport`.
 *
 * RED: these tests assert that for ALL imports (single OR multi entries)
 * the panel:
 *   - calls `saveNewSlot(entry.name, entry.save)` for each entry,
 *   - never calls `promptModal`,
 *   - never mutates the live factory (no `importFactoryWithProgram`,
 *     no `getFactoryRenderer().syncMeshes()`).
 *
 * The legacy single-file/name=null branch in `wireProjectsPanel.onImport`
 * (which prompted the user and applied the save to the live factory)
 * MUST be removed for these tests to pass.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../src/utils/SaveLoad', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/utils/SaveLoad')
  >('../../../src/utils/SaveLoad')
  return {
    ...actual,
    importFromFile: vi.fn(),
    importFilesFromUser: vi.fn(),
  }
})

vi.mock('../../../src/utils/SandboxProjects', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/utils/SandboxProjects')
  >('../../../src/utils/SandboxProjects')
  return {
    ...actual,
    saveNewSlot: vi.fn((name: string) => ({ id: `id-${name}`, name, savedAt: 0 })),
    listSlots: vi.fn(() => []),
    setLastLoadedId: vi.fn(),
  }
})

vi.mock('../../../src/utils/AutoSave', () => {
  return {
    exportFactoryWithProgram: vi.fn(),
    importFactoryWithProgram: vi.fn(),
  }
})

import * as SaveLoad from '../../../src/utils/SaveLoad'
import * as SandboxProjects from '../../../src/utils/SandboxProjects'
import * as AutoSave from '../../../src/utils/AutoSave'
import * as Modal from '../../../src/ui/Modal'
import {
  buildHarness,
  buildHarnessWithSpies,
  makeSave,
} from './_helpers/wireProjectsPanelHarness'

async function flush(): Promise<void> {
  // Two macrotask flips to drain await chains in onImport.
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('wireProjectsPanel.onImport — unified bundle-only imports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it("with one entry (name: 'Hello') silently saves the slot — no prompt", async () => {
    ;(SaveLoad.importFilesFromUser as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'Hello', save: makeSave('<h/>') },
    ])
    const promptSpy = vi.spyOn(Modal, 'promptModal')

    const panel = buildHarness()
    panel.triggerImport()
    await flush()

    expect(promptSpy).not.toHaveBeenCalled()
    expect(SandboxProjects.saveNewSlot).toHaveBeenCalledTimes(1)
    expect(SandboxProjects.saveNewSlot).toHaveBeenCalledWith(
      'Hello',
      expect.objectContaining({ pxtWorkspace: '<h/>' }),
    )
  })

  it('single-entry import does NOT mutate the live factory (no importFactoryWithProgram, no syncMeshes)', async () => {
    ;(SaveLoad.importFilesFromUser as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'Hello', save: makeSave('<h/>') },
    ])
    vi.spyOn(Modal, 'promptModal')

    const { panel, mocks } = buildHarnessWithSpies()
    panel.triggerImport()
    await flush()

    expect(AutoSave.importFactoryWithProgram).not.toHaveBeenCalled()
    expect(mocks.factoryRendererSyncMeshes).not.toHaveBeenCalled()
    expect(mocks.syncFactoryToEditor).not.toHaveBeenCalled()
    expect(mocks.factoryClear).not.toHaveBeenCalled()
    expect(mocks.itemRendererClear).not.toHaveBeenCalled()
  })

  it('with multiple entries silently creates one slot per entry using bundled names; no prompt', async () => {
    ;(SaveLoad.importFilesFromUser as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'Alpha', save: makeSave('<a/>') },
      { name: 'Beta', save: makeSave('<b/>') },
      { name: 'Gamma', save: makeSave('<g/>') },
    ])
    const promptSpy = vi.spyOn(Modal, 'promptModal')

    const panel = buildHarness()
    panel.triggerImport()
    await flush()

    expect(promptSpy).not.toHaveBeenCalled()
    expect(SandboxProjects.saveNewSlot).toHaveBeenCalledTimes(3)
    expect(SandboxProjects.saveNewSlot).toHaveBeenNthCalledWith(
      1,
      'Alpha',
      expect.objectContaining({ pxtWorkspace: '<a/>' }),
    )
    expect(SandboxProjects.saveNewSlot).toHaveBeenNthCalledWith(
      2,
      'Beta',
      expect.objectContaining({ pxtWorkspace: '<b/>' }),
    )
    expect(SandboxProjects.saveNewSlot).toHaveBeenNthCalledWith(
      3,
      'Gamma',
      expect.objectContaining({ pxtWorkspace: '<g/>' }),
    )
  })

  it('refreshes slots after creating new entries', async () => {
    ;(SaveLoad.importFilesFromUser as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'Alpha', save: makeSave('<a/>') },
      { name: 'Beta', save: makeSave('<b/>') },
    ])

    const panel = buildHarness()
    // setSlots is called once in the wire constructor; clear so we can
    // assert the post-import refresh in isolation.
    panel.setSlots.mockClear()

    panel.triggerImport()
    await flush()

    expect(panel.setSlots).toHaveBeenCalled()
  })

  it('on importFilesFromUser() rejection plays the error sound (and never prompts)', async () => {
    ;(SaveLoad.importFilesFromUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Bad file'),
    )
    const promptSpy = vi.spyOn(Modal, 'promptModal')

    const { panel, mocks } = buildHarnessWithSpies()
    panel.triggerImport()
    await flush()

    expect(mocks.audioPlayError).toHaveBeenCalledTimes(1)
    expect(promptSpy).not.toHaveBeenCalled()
    expect(SandboxProjects.saveNewSlot).not.toHaveBeenCalled()
  })
})
