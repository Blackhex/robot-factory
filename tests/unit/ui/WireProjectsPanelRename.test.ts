/**
 * @vitest-environment jsdom
 *
 * Contract tests for the inline-rename wiring in `wireProjectsPanel`.
 *
 * RED: these tests assume `wireProjectsPanel` binds a new
 * `panel.onNameChange` callback that:
 *   1. Calls `renameSlot(slotId, newName)` from
 *      `src/utils/SandboxProjects.ts` and refreshes the panel
 *      (re-renders the slot list via `panel.setSlots(...)`).
 *   2. Swallows the throw from `renameSlot` when the new name is empty
 *      or whitespace-only and does NOT refresh the panel.
 *   3. Does not crash when the new name equals the current name.
 *
 * They will fail until the GREEN agent (a) adds `onNameChange` to
 * `ProjectsPanel` and (b) wires it up in `wireProjectsPanel`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../src/utils/SandboxProjects', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/utils/SandboxProjects')
  >('../../../src/utils/SandboxProjects')
  return {
    ...actual,
    listSlots: vi.fn(() => []),
    renameSlot: vi.fn((id: string, name: string) => {
      const trimmed = name.trim()
      if (trimmed.length === 0) {
        throw new Error('Slot name must not be empty')
      }
      return { id, name: trimmed, savedAt: 0 }
    }),
  }
})

vi.mock('../../../src/utils/AutoSave', () => ({
  exportFactoryWithProgram: vi.fn(),
  importFactoryWithProgram: vi.fn(),
}))

import * as SandboxProjects from '../../../src/utils/SandboxProjects'
import { buildHarnessWithSpies } from './_helpers/wireProjectsPanelHarness'
import { ProjectsPanel } from '../../../src/ui/ProjectsPanel'
import { wireProjectsPanel } from '../../../src/ui/wireProjectsPanel'
import type { Factory } from '../../../src/game/Factory'
import type { FactorySave } from '../../../src/utils/SaveLoad'

type PanelWithRename = {
  onNameChange?: (slotId: string, newName: string) => void
}

describe('wireProjectsPanel — name change wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('exposes panel.onNameChange after wiring (callback assigned by wireProjectsPanel)', () => {
    const { panel } = buildHarnessWithSpies()
    const onNameChange = (panel as unknown as PanelWithRename).onNameChange
    expect(typeof onNameChange).toBe('function')
  })

  it('panel.onNameChange(slotId, newName) calls renameSlot(slotId, newName) WITHOUT refreshing the slot list', () => {
    const { panel } = buildHarnessWithSpies()

    // Reset call counts so the initial refreshSlots() from wireProjectsPanel
    // doesn't pollute our assertions.
    ;(SandboxProjects.renameSlot as ReturnType<typeof vi.fn>).mockClear()
    ;(SandboxProjects.listSlots as ReturnType<typeof vi.fn>).mockClear()
    panel.setSlots.mockClear()

    const onNameChange = (panel as unknown as PanelWithRename).onNameChange!
    onNameChange('slot-1', 'New Name')

    expect(SandboxProjects.renameSlot).toHaveBeenCalledTimes(1)
    expect(SandboxProjects.renameSlot).toHaveBeenCalledWith('slot-1', 'New Name')

    // No refresh: refreshSlots() would destroy the focused <input> mid-keystroke.
    // The panel renders the new name on the next external trigger of setSlots().
    expect(SandboxProjects.listSlots).not.toHaveBeenCalled()
    expect(panel.setSlots).not.toHaveBeenCalled()
  })

  it('passes the raw (untrimmed) name through to renameSlot — trimming is renameSlot\'s job', () => {
    const { panel } = buildHarnessWithSpies()
    ;(SandboxProjects.renameSlot as ReturnType<typeof vi.fn>).mockClear()

    const onNameChange = (panel as unknown as PanelWithRename).onNameChange!
    onNameChange('slot-1', '  Padded Name  ')

    expect(SandboxProjects.renameSlot).toHaveBeenCalledWith('slot-1', '  Padded Name  ')
  })

  it('skips renameSlot when newName is empty: does NOT crash, does NOT refresh', () => {
    const { panel } = buildHarnessWithSpies()
    panel.setSlots.mockClear()
    ;(SandboxProjects.listSlots as ReturnType<typeof vi.fn>).mockClear()

    const onNameChange = (panel as unknown as PanelWithRename).onNameChange!
    expect(() => onNameChange('slot-1', '')).not.toThrow()

    // No refresh — the user is still typing.
    expect(panel.setSlots).not.toHaveBeenCalled()
    expect(SandboxProjects.listSlots).not.toHaveBeenCalled()
  })

  it('skips renameSlot when newName is whitespace-only: does NOT crash, does NOT refresh', () => {
    const { panel } = buildHarnessWithSpies()
    panel.setSlots.mockClear()
    ;(SandboxProjects.listSlots as ReturnType<typeof vi.fn>).mockClear()

    const onNameChange = (panel as unknown as PanelWithRename).onNameChange!
    expect(() => onNameChange('slot-1', '   \t  ')).not.toThrow()

    expect(panel.setSlots).not.toHaveBeenCalled()
    expect(SandboxProjects.listSlots).not.toHaveBeenCalled()
  })

  it('does not crash when newName equals current name (no slot duplication)', () => {
    // Mock listSlots to return a fixed snapshot — assert no duplication
    // by counting how many slots end up in the latest setSlots call.
    ;(SandboxProjects.listSlots as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'slot-1', name: 'Same', savedAt: 0 },
    ])

    const { panel } = buildHarnessWithSpies()
    panel.setSlots.mockClear()

    const onNameChange = (panel as unknown as PanelWithRename).onNameChange!
    expect(() => onNameChange('slot-1', 'Same')).not.toThrow()

    // If the wiring did refresh, the most recent slot list still has
    // exactly the one slot — no duplication regardless of strategy.
    if (panel.setSlots.mock.calls.length > 0) {
      const lastCallArgs = panel.setSlots.mock.calls[panel.setSlots.mock.calls.length - 1]!
      const slots = lastCallArgs[0] as Array<{ id: string }>
      expect(slots.length).toBe(1)
      expect(slots[0]!.id).toBe('slot-1')
    }
  })

  it('keeps the same name input element reference across consecutive keystrokes', async () => {
    // Use the REAL ProjectsPanel + REAL wireProjectsPanel + REAL
    // SandboxProjects storage so we exercise the actual DOM rebuild
    // path. The harness's stub panel never calls setSlots() →
    // renderList() and therefore can't catch the focus-drop regression.
    const real = await vi.importActual<
      typeof import('../../../src/utils/SandboxProjects')
    >('../../../src/utils/SandboxProjects')

    const listSpy = SandboxProjects.listSlots as ReturnType<typeof vi.fn>
    const renameSpy = SandboxProjects.renameSlot as ReturnType<typeof vi.fn>
    const origListImpl = listSpy.getMockImplementation()
    const origRenameImpl = renameSpy.getMockImplementation()
    listSpy.mockImplementation(real.listSlots)
    renameSpy.mockImplementation(real.renameSlot)

    try {
      const save: FactorySave = {
        version: 2,
        grid: [],
        belts: [],
        pxtWorkspace: '<xml/>',
      }
      const slot = real.saveNewSlot('Original', save)

      document.body.innerHTML = ''
      const root = document.createElement('div')
      document.body.appendChild(root)
      const panel = new ProjectsPanel(root)

      const factory = {
        getMachines: () => [],
        getBelts: () => [],
        clear: vi.fn(),
      } as unknown as Factory

      wireProjectsPanel({
        projectsPanel: panel,
        gameManager: { factory, currentLevel: { id: 'sandbox' } } as Parameters<
          typeof wireProjectsPanel
        >[0]['gameManager'],
        pxtEditor: {
          getWorkspaceXml: () => '<xml/>',
          loadWorkspaceXml: vi.fn(),
          loadBlankProjectAsync: vi.fn(() => Promise.resolve()),
          flushPendingSaveAsync: vi.fn(() => Promise.resolve()),
        },
        audio: { playUIClick: vi.fn(), playError: vi.fn() },
        syncFactoryToEditor: vi.fn(),
        machinePanel: { hide: vi.fn() },
        beltPanel: { hide: vi.fn() },
        getFactoryRenderer: () => null,
        getItemRenderer: () => null,
        getGridInteraction: () => null,
      })

      const selector = `[data-slot-id="${slot.id}"] input.ui-projects-slot-name-input`
      const before = root.querySelector(selector) as HTMLInputElement | null
      expect(before).not.toBeNull()
      const beforeRef = before!

      // Clear the rename spy so we count only keystroke-driven calls.
      renameSpy.mockClear()

      // First keystroke — simulate the user typing the next character.
      beforeRef.value = 'OriginalA'
      beforeRef.dispatchEvent(new Event('input'))

      const afterFirst = root.querySelector(selector) as HTMLInputElement | null
      expect(afterFirst).toBe(beforeRef)
      expect(document.body.contains(beforeRef)).toBe(true)

      // Second keystroke — the input must STILL be the same node so the
      // browser keeps focus and caret on it.
      beforeRef.value = 'OriginalAB'
      beforeRef.dispatchEvent(new Event('input'))

      const afterSecond = root.querySelector(selector) as HTMLInputElement | null
      expect(afterSecond).toBe(beforeRef)
      expect(document.body.contains(beforeRef)).toBe(true)

      // Both keystrokes round-tripped through the real storage layer.
      expect(renameSpy).toHaveBeenCalledTimes(2)
      const updated = real.listSlots().find((s) => s.id === slot.id)!
      expect(updated.name).toBe('OriginalAB')

      panel.dispose()
    } finally {
      if (origListImpl) listSpy.mockImplementation(origListImpl)
      else listSpy.mockReset()
      if (origRenameImpl) renameSpy.mockImplementation(origRenameImpl)
      else renameSpy.mockReset()
    }
  })

  // BUG 1 regression: the wire layer skips refreshSlots() per keystroke
  // (so the focused <input> survives), which means the panel's cached
  // `slots[]` lags behind storage. The wire layer must therefore call
  // `panel.updateSlotName(slotId, newName)` immediately AFTER
  // `renameSlot` succeeds, so the blur-restore reads the latest name.
  it('onNameChange calls panel.updateSlotName(slotId, newName) AFTER renameSlot succeeds', () => {
    const { panel } = buildHarnessWithSpies()
    ;(SandboxProjects.renameSlot as ReturnType<typeof vi.fn>).mockClear()
    panel.updateSlotName.mockClear()

    const onNameChange = (panel as unknown as PanelWithRename).onNameChange!
    onNameChange('slot-1', 'Edited')

    expect(SandboxProjects.renameSlot).toHaveBeenCalledTimes(1)
    expect(SandboxProjects.renameSlot).toHaveBeenCalledWith('slot-1', 'Edited')

    expect(panel.updateSlotName).toHaveBeenCalledTimes(1)
    expect(panel.updateSlotName).toHaveBeenCalledWith('slot-1', 'Edited')

    // Order matters: storage write is the source of truth, then the
    // panel cache is updated to match.
    const renameOrder = (SandboxProjects.renameSlot as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0]!
    const updateOrder = panel.updateSlotName.mock.invocationCallOrder[0]!
    expect(updateOrder).toBeGreaterThan(renameOrder)
  })

  it('onNameChange does NOT call panel.updateSlotName when newName is empty', () => {
    const { panel } = buildHarnessWithSpies()
    panel.updateSlotName.mockClear()

    const onNameChange = (panel as unknown as PanelWithRename).onNameChange!
    onNameChange('slot-1', '')

    expect(panel.updateSlotName).not.toHaveBeenCalled()
  })

  it('onNameChange does NOT call panel.updateSlotName when newName is whitespace-only', () => {
    const { panel } = buildHarnessWithSpies()
    panel.updateSlotName.mockClear()

    const onNameChange = (panel as unknown as PanelWithRename).onNameChange!
    onNameChange('slot-1', '   \t  ')

    expect(panel.updateSlotName).not.toHaveBeenCalled()
  })
})
