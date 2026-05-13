/**
 * @vitest-environment jsdom
 *
 * Contract tests for the unified single+bundle export wiring in
 * `wireProjectsPanel.onExport`.
 *
 * RED: these tests assert the new `exportToFile(save, name)` two-arg
 * signature and the new 0-selected behavior (resolve name from
 * `getLastLoadedId()` -> slot meta, otherwise prompt). They will fail
 * until the GREEN agent updates `wireProjectsPanel` and `SaveLoad`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../src/utils/SaveLoad', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/utils/SaveLoad')
  >('../../../src/utils/SaveLoad')
  return {
    ...actual,
    exportToFile: vi.fn(),
    exportBundleToFile: vi.fn(),
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
    loadSlot: vi.fn(),
    listSlots: vi.fn(() => []),
    setLastLoadedId: vi.fn(),
    getLastLoadedId: vi.fn(() => null),
  }
})

vi.mock('../../../src/utils/AutoSave', () => {
  return {
    exportFactoryWithProgram: vi.fn(async () => ({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: '<current/>',
    })),
    importFactoryWithProgram: vi.fn(),
  }
})

import * as SaveLoad from '../../../src/utils/SaveLoad'
import * as SandboxProjects from '../../../src/utils/SandboxProjects'
import * as Modal from '../../../src/ui/Modal'
import type { FactorySave } from '../../../src/utils/SaveLoad'
import { buildHarness, makeSave } from './_helpers/wireProjectsPanelHarness'

async function flush(): Promise<void> {
  // Drain await chains in onExport.
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('wireProjectsPanel.onExport — unified single+bundle export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    localStorage.clear()
    ;(SandboxProjects.listSlots as ReturnType<typeof vi.fn>).mockReturnValue([])
    ;(SandboxProjects.getLastLoadedId as ReturnType<typeof vi.fn>).mockReturnValue(null)
  })

  it("0-selected with getLastLoadedId() -> known slot uses slot's name (no prompt)", async () => {
    ;(SandboxProjects.getLastLoadedId as ReturnType<typeof vi.fn>).mockReturnValue('a')
    ;(SandboxProjects.listSlots as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'a', name: 'Alpha', savedAt: 0 },
    ])
    const promptSpy = vi.spyOn(Modal, 'promptModal')

    const panel = buildHarness()
    panel.triggerExport([])
    await flush()

    expect(promptSpy).not.toHaveBeenCalled()
    expect(SaveLoad.exportToFile).toHaveBeenCalledTimes(1)
    const call = (SaveLoad.exportToFile as ReturnType<typeof vi.fn>).mock.calls[0]!
    const save = call[0] as FactorySave
    expect(save.pxtWorkspace).toBe('<current/>')
    expect(call[1]).toBe('Alpha')
    expect(SaveLoad.exportBundleToFile).not.toHaveBeenCalled()
  })

  it('0-selected with getLastLoadedId() === null prompts the user with the export-name title', async () => {
    ;(SandboxProjects.getLastLoadedId as ReturnType<typeof vi.fn>).mockReturnValue(null)
    const promptSpy = vi.spyOn(Modal, 'promptModal').mockResolvedValue('Manual Name')

    const panel = buildHarness()
    panel.triggerExport([])
    await flush()

    expect(promptSpy).toHaveBeenCalledTimes(1)
    const promptArg = promptSpy.mock.calls[0]![0] as { title?: unknown; defaultValue?: unknown }
    expect(typeof promptArg.title).toBe('string')
    // i18next isn't initialized in unit tests, so `i18next.t(key)` echoes the key.
    expect(promptArg.title).toBe('projects.export_name_title')
    expect(promptArg.defaultValue).toBe('')

    expect(SaveLoad.exportToFile).toHaveBeenCalledTimes(1)
    const call = (SaveLoad.exportToFile as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(call[1]).toBe('Manual Name')
  })

  it('0-selected with getLastLoadedId() pointing to a missing slot prompts (no slot meta to use)', async () => {
    ;(SandboxProjects.getLastLoadedId as ReturnType<typeof vi.fn>).mockReturnValue('ghost')
    ;(SandboxProjects.listSlots as ReturnType<typeof vi.fn>).mockReturnValue([])
    const promptSpy = vi.spyOn(Modal, 'promptModal').mockResolvedValue('Recovered')

    const panel = buildHarness()
    panel.triggerExport([])
    await flush()

    expect(promptSpy).toHaveBeenCalledTimes(1)
    expect(SaveLoad.exportToFile).toHaveBeenCalledTimes(1)
    const call = (SaveLoad.exportToFile as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(call[1]).toBe('Recovered')
  })

  it('0-selected: prompt cancel (null) aborts the export — no file written', async () => {
    ;(SandboxProjects.getLastLoadedId as ReturnType<typeof vi.fn>).mockReturnValue(null)
    vi.spyOn(Modal, 'promptModal').mockResolvedValue(null)

    const panel = buildHarness()
    panel.triggerExport([])
    await flush()

    expect(SaveLoad.exportToFile).not.toHaveBeenCalled()
    expect(SaveLoad.exportBundleToFile).not.toHaveBeenCalled()
  })

  it('0-selected: empty/whitespace-only name aborts the export — no file written', async () => {
    ;(SandboxProjects.getLastLoadedId as ReturnType<typeof vi.fn>).mockReturnValue(null)
    vi.spyOn(Modal, 'promptModal').mockResolvedValue('   ')

    const panel = buildHarness()
    panel.triggerExport([])
    await flush()

    expect(SaveLoad.exportToFile).not.toHaveBeenCalled()
    expect(SaveLoad.exportBundleToFile).not.toHaveBeenCalled()
  })

  it("1-selected uses the slot's name; no prompt", async () => {
    ;(SandboxProjects.loadSlot as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string) => (id === 'a' ? makeSave('<a/>') : null),
    )
    ;(SandboxProjects.listSlots as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'a', name: 'Alpha', savedAt: 0 },
    ])
    const promptSpy = vi.spyOn(Modal, 'promptModal')

    const panel = buildHarness()
    panel.triggerExport(['a'])
    await flush()

    expect(promptSpy).not.toHaveBeenCalled()
    expect(SaveLoad.exportBundleToFile).not.toHaveBeenCalled()
    expect(SaveLoad.exportToFile).toHaveBeenCalledTimes(1)
    const call = (SaveLoad.exportToFile as ReturnType<typeof vi.fn>).mock.calls[0]!
    const save = call[0] as FactorySave
    expect(save.pxtWorkspace).toBe('<a/>')
    expect(call[1]).toBe('Alpha')
  })

  it("2+ selected delegates to exportBundleToFile with the entries array (unchanged)", async () => {
    ;(SandboxProjects.loadSlot as ReturnType<typeof vi.fn>).mockImplementation((id: string) => {
      if (id === 'a') return makeSave('<a/>')
      if (id === 'b') return makeSave('<b/>')
      return null
    })
    ;(SandboxProjects.listSlots as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'a', name: 'Alpha', savedAt: 0 },
      { id: 'b', name: 'Beta', savedAt: 1 },
    ])

    const panel = buildHarness()
    panel.triggerExport(['a', 'b'])
    await flush()

    expect(SaveLoad.exportToFile).not.toHaveBeenCalled()
    expect(SaveLoad.exportBundleToFile).toHaveBeenCalledTimes(1)
    const entries = (SaveLoad.exportBundleToFile as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      name: string
      save: FactorySave
    }[]
    expect(entries).toHaveLength(2)
    expect(entries[0]!.name).toBe('Alpha')
    expect(entries[0]!.save.pxtWorkspace).toBe('<a/>')
    expect(entries[1]!.name).toBe('Beta')
    expect(entries[1]!.save.pxtWorkspace).toBe('<b/>')
  })

  it("2+ selected with one missing slot still bundles the rest", async () => {
    ;(SandboxProjects.loadSlot as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      id === 'a' ? makeSave('<a/>') : null,
    )
    ;(SandboxProjects.listSlots as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'a', name: 'Alpha', savedAt: 0 },
    ])

    const panel = buildHarness()
    panel.triggerExport(['a', 'missing'])
    await flush()

    expect(SaveLoad.exportBundleToFile).toHaveBeenCalledTimes(1)
    const entries = (SaveLoad.exportBundleToFile as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      name: string
      save: FactorySave
    }[]
    expect(entries).toHaveLength(1)
    expect(entries[0]!.name).toBe('Alpha')
  })
})
