/**
 * @vitest-environment jsdom
 *
 * Contract tests for the new multi-export wiring in wireProjectsPanel.
 *
 * RED: these tests assert against the new onExport(slotIds: string[])
 * signature and the new exportBundleToFile() helper. Both will be
 * missing/wrong shape until the GREEN agent updates the panel +
 * SaveLoad + wireProjectsPanel to match.
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
import type { FactorySave } from '../../../src/utils/SaveLoad'
import { buildHarness, makeSave } from './_helpers/wireProjectsPanelHarness'

describe('wireProjectsPanel.onExport — multi-select', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    ;(SandboxProjects.listSlots as ReturnType<typeof vi.fn>).mockReturnValue([])
  })

  it('onExport([]) calls exportToFile (current factory) and not exportBundleToFile', async () => {
    const panel = buildHarness()
    panel.triggerExport([])
    await new Promise((r) => setTimeout(r, 0))

    expect(SaveLoad.exportToFile).toHaveBeenCalledTimes(1)
    expect(SaveLoad.exportBundleToFile).not.toHaveBeenCalled()
    const arg = (SaveLoad.exportToFile as ReturnType<typeof vi.fn>).mock.calls[0]![0] as FactorySave
    expect(arg.pxtWorkspace).toBe('<current/>')
  })

  it("onExport(['a']) loads slot 'a' and calls exportToFile (single-file format) — backward compat", async () => {
    ;(SandboxProjects.loadSlot as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string) => (id === 'a' ? makeSave('<a/>') : null),
    )
    ;(SandboxProjects.listSlots as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'a', name: 'Alpha', savedAt: 0 },
    ])

    const panel = buildHarness()
    panel.triggerExport(['a'])
    await new Promise((r) => setTimeout(r, 0))

    expect(SandboxProjects.loadSlot).toHaveBeenCalledWith('a')
    expect(SaveLoad.exportToFile).toHaveBeenCalledTimes(1)
    expect(SaveLoad.exportBundleToFile).not.toHaveBeenCalled()
    const arg = (SaveLoad.exportToFile as ReturnType<typeof vi.fn>).mock.calls[0]![0] as FactorySave
    expect(arg.pxtWorkspace).toBe('<a/>')
  })

  it("onExport(['a', 'b']) loads both slots and calls exportBundleToFile with two entries", async () => {
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
    await new Promise((r) => setTimeout(r, 0))

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

  it("onExport(['a', 'missing']) skips the missing slot but still bundles the rest", async () => {
    ;(SandboxProjects.loadSlot as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      id === 'a' ? makeSave('<a/>') : null,
    )
    ;(SandboxProjects.listSlots as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'a', name: 'Alpha', savedAt: 0 },
    ])

    const panel = buildHarness()
    panel.triggerExport(['a', 'missing'])
    await new Promise((r) => setTimeout(r, 0))

    expect(SaveLoad.exportBundleToFile).toHaveBeenCalledTimes(1)
    const entries = (SaveLoad.exportBundleToFile as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      name: string
      save: FactorySave
    }[]
    expect(entries).toHaveLength(1)
    expect(entries[0]!.name).toBe('Alpha')
  })
})
