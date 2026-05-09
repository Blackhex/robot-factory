/**
 * @vitest-environment jsdom
 *
 * Contract tests for the new bundled-import wiring in wireProjectsPanel.
 *
 * RED: these tests assume `importFilesFromUser()` exists on SaveLoad and
 * that wireProjectsPanel.onImport calls it (instead of importFromFile()).
 * They will fail until the GREEN agent rewires onImport.
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
import * as Modal from '../../../src/ui/Modal'
import { buildHarness, makeSave } from './_helpers/wireProjectsPanelHarness'

async function flush(): Promise<void> {
  // Two macrotask flips to drain await chains in onImport.
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('wireProjectsPanel.onImport — bundled imports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('with one legacy single-file (name: null) entry applies it to current factory and prompts for slot name', async () => {
    ;(SaveLoad.importFilesFromUser as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: null, save: makeSave('<legacy/>') },
    ])
    const promptSpy = vi.spyOn(Modal, 'promptModal').mockResolvedValue('LegacyName')

    const panel = buildHarness()
    panel.triggerImport()
    await flush()

    expect(promptSpy).toHaveBeenCalledTimes(1)
    expect(SandboxProjects.saveNewSlot).toHaveBeenCalledTimes(1)
    expect(SandboxProjects.saveNewSlot).toHaveBeenCalledWith(
      'LegacyName',
      expect.objectContaining({ pxtWorkspace: '<legacy/>' }),
    )
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

  it("with one bundled entry (name: 'X') silently creates one slot named 'X'; no prompt", async () => {
    ;(SaveLoad.importFilesFromUser as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'X', save: makeSave('<x/>') },
    ])
    const promptSpy = vi.spyOn(Modal, 'promptModal')

    const panel = buildHarness()
    panel.triggerImport()
    await flush()

    expect(promptSpy).not.toHaveBeenCalled()
    expect(SandboxProjects.saveNewSlot).toHaveBeenCalledTimes(1)
    expect(SandboxProjects.saveNewSlot).toHaveBeenCalledWith(
      'X',
      expect.objectContaining({ pxtWorkspace: '<x/>' }),
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
})
