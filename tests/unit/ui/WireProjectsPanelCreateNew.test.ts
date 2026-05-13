/**
 * @vitest-environment jsdom
 *
 * Contract tests for the new "create blank project" wiring in
 * wireProjectsPanel. Triggered by double-clicking the "+ New project"
 * empty row in ProjectsPanel.
 *
 * RED: these tests assume `wireProjectsPanel` binds `panel.onCreateNew`
 * to a confirm-modal-gated handler that clears the factory and resets
 * the PXT workspace to a blank `pxt-on-start` block. They will fail
 * until the GREEN agent implements that wiring.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { initI18n } from '../../../src/i18n/i18n'

beforeAll(async () => {
  await initI18n()
})

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

import * as Modal from '../../../src/ui/Modal'
import { buildHarnessWithSpies } from './_helpers/wireProjectsPanelHarness'

async function flush(): Promise<void> {
  // Drain await chains: both flushPendingSaveAsync() and the rAF gap
  // mirrored from the existing onLoadSlot path.
  await new Promise((r) => setTimeout(r, 0))
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('wireProjectsPanel.onCreateNew — confirm-gated blank project', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('shows confirm modal when onCreateNew fires', async () => {
    const confirmSpy = vi.spyOn(Modal, 'confirmModal').mockResolvedValue(false)

    const { panel } = buildHarnessWithSpies()
    panel.triggerCreateNew()
    await flush()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    const arg = confirmSpy.mock.calls[0]![0] as { title?: unknown; message?: unknown }
    expect(typeof arg.title).toBe('string')
    expect((arg.title as string).length).toBeGreaterThan(0)
    expect(typeof arg.message).toBe('string')
    expect((arg.message as string).length).toBeGreaterThan(0)
  })

  it('on confirm: clears factory, resets PXT workspace to blank, syncs renderer and editor (in correct order)', async () => {
    vi.spyOn(Modal, 'confirmModal').mockResolvedValue(true)

    const { panel, mocks } = buildHarnessWithSpies()
    panel.triggerCreateNew()
    await flush()

    // All destructive operations happened.
    expect(mocks.factoryClear).toHaveBeenCalledTimes(1)
    expect(mocks.itemRendererClear).toHaveBeenCalledTimes(1)
    // Wiring now uses loadBlankProjectAsync to guarantee TS+blocks are
    // reset together — see PxtEditor.loadBlankProjectAsync.
    expect(mocks.loadBlankProjectAsync).toHaveBeenCalledTimes(1)
    expect(mocks.loadWorkspaceXml).not.toHaveBeenCalled()
    expect(mocks.factoryRendererSyncMeshes).toHaveBeenCalledTimes(1)
    expect(mocks.syncFactoryToEditor).toHaveBeenCalledTimes(1)

    // Pre-destructive UI lockout.
    expect(mocks.machinePanelHide).toHaveBeenCalledTimes(1)
    expect(mocks.beltPanelHide).toHaveBeenCalledTimes(1)
    expect(mocks.gridDisable).toHaveBeenCalledTimes(1)

    // Post-destructive grid re-enable.
    expect(mocks.gridEnable).toHaveBeenCalledTimes(1)

    // Ordering: hide/disable BEFORE factory.clear and loadWorkspaceXml,
    // gridEnable AFTER all destructive ops.
    const hideOrder = mocks.machinePanelHide.mock.invocationCallOrder[0]!
    const beltHideOrder = mocks.beltPanelHide.mock.invocationCallOrder[0]!
    const disableOrder = mocks.gridDisable.mock.invocationCallOrder[0]!
    const clearOrder = mocks.factoryClear.mock.invocationCallOrder[0]!
    const loadOrder = mocks.loadBlankProjectAsync.mock.invocationCallOrder[0]!
    const syncMeshesOrder = mocks.factoryRendererSyncMeshes.mock.invocationCallOrder[0]!
    const syncEditorOrder = mocks.syncFactoryToEditor.mock.invocationCallOrder[0]!
    const enableOrder = mocks.gridEnable.mock.invocationCallOrder[0]!

    expect(hideOrder).toBeLessThan(clearOrder)
    expect(beltHideOrder).toBeLessThan(clearOrder)
    expect(disableOrder).toBeLessThan(clearOrder)
    expect(disableOrder).toBeLessThan(loadOrder)
    expect(clearOrder).toBeLessThan(enableOrder)
    expect(loadOrder).toBeLessThan(enableOrder)
    expect(syncMeshesOrder).toBeLessThan(enableOrder)
    expect(syncEditorOrder).toBeLessThan(enableOrder)

    // The pending PXT save must be drained before we wipe the workspace.
    expect(mocks.flushPendingSaveAsync).toHaveBeenCalledTimes(1)
    const flushOrder = mocks.flushPendingSaveAsync.mock.invocationCallOrder[0]!
    expect(flushOrder).toBeLessThan(clearOrder)
    expect(flushOrder).toBeLessThan(loadOrder)
  })

  it('on cancel: nothing destructive happens', async () => {
    vi.spyOn(Modal, 'confirmModal').mockResolvedValue(false)

    const { panel, mocks } = buildHarnessWithSpies()
    panel.triggerCreateNew()
    await flush()

    expect(mocks.factoryClear).not.toHaveBeenCalled()
    expect(mocks.itemRendererClear).not.toHaveBeenCalled()
    expect(mocks.loadWorkspaceXml).not.toHaveBeenCalled()
    expect(mocks.loadBlankProjectAsync).not.toHaveBeenCalled()
    expect(mocks.factoryRendererSyncMeshes).not.toHaveBeenCalled()
    expect(mocks.syncFactoryToEditor).not.toHaveBeenCalled()
    expect(mocks.machinePanelHide).not.toHaveBeenCalled()
    expect(mocks.beltPanelHide).not.toHaveBeenCalled()
  })

  it('on confirm but factory is null: bails out gracefully without crashing and re-enables grid', async () => {
    vi.spyOn(Modal, 'confirmModal').mockResolvedValue(true)

    const { panel, mocks } = buildHarnessWithSpies()
    mocks.gameManager.factory = null

    expect(() => panel.triggerCreateNew()).not.toThrow()
    await flush()

    expect(mocks.factoryClear).not.toHaveBeenCalled()
    expect(mocks.loadWorkspaceXml).not.toHaveBeenCalled()
    expect(mocks.loadBlankProjectAsync).not.toHaveBeenCalled()
    expect(mocks.factoryRendererSyncMeshes).not.toHaveBeenCalled()
    expect(mocks.syncFactoryToEditor).not.toHaveBeenCalled()

    // Grid was disabled up-front; safety net must re-enable it even on
    // the bail-out path so the user is not stuck with a frozen grid.
    expect(mocks.gridEnable).toHaveBeenCalledTimes(1)
  })
})
