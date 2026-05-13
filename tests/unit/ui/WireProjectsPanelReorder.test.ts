/**
 * @vitest-environment jsdom
 *
 * Contract tests for the drag-and-drop reorder wiring in
 * wireProjectsPanel.
 *
 * `wireProjectsPanel` assigns `projectsPanel.onReorder` to a handler
 * that ONLY persists the new order via `setSlotOrder(orderedIds)`.
 *
 * NOTE (UX Major #1 fix): the handler must NOT also re-fetch slots and
 * call `setSlots(...)` — the `ProjectsPanelReorderController` has
 * already updated `this.slots` and re-rendered the list with focus
 * restored to the moved row. A second `setSlots()` would re-run
 * `renderList()` and destroy the focused row, breaking consecutive
 * Alt+Arrow keyboard reorder.
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
    listSlots: vi.fn(() => []),
    setLastLoadedId: vi.fn(),
    // New mutator the wiring is expected to call. Declared here so the
    // mocked module surface contains it even if the real module hasn't
    // exported it yet (pre-GREEN).
    setSlotOrder: vi.fn(),
  }
})

vi.mock('../../../src/utils/AutoSave', () => {
  return {
    exportFactoryWithProgram: vi.fn(),
    importFactoryWithProgram: vi.fn(),
  }
})

import * as SandboxProjects from '../../../src/utils/SandboxProjects'
import { buildHarness } from './_helpers/wireProjectsPanelHarness'
import type { ProjectsPanel } from '../../../src/ui/ProjectsPanel'

// Local type extension: the new `onReorder` field. Lets us read/invoke
// the wiring-installed handler without `as any`.
type ReorderPanel = ProjectsPanel & {
  onReorder?: (orderedSlotIds: string[]) => void
}

// Typed view onto the mocked SandboxProjects module that includes the
// not-yet-exported `setSlotOrder` mock added by the vi.mock above.
interface MockedSandboxProjects {
  listSlots: ReturnType<typeof vi.fn>
  setLastLoadedId: ReturnType<typeof vi.fn>
  setSlotOrder: ReturnType<typeof vi.fn>
}
const MockedStore = SandboxProjects as unknown as MockedSandboxProjects

describe('wireProjectsPanel.onReorder — store + refresh wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('assigns a function to projectsPanel.onReorder during wiring', () => {
    const panel = buildHarness() as unknown as ReorderPanel
    expect(typeof panel.onReorder).toBe('function')
  })

  it('invoking onReorder calls setSlotOrder with the exact ordering', () => {
    const panel = buildHarness() as unknown as ReorderPanel

    panel.onReorder?.(['c', 'a', 'b'])

    expect(MockedStore.setSlotOrder).toHaveBeenCalledTimes(1)
    expect(MockedStore.setSlotOrder).toHaveBeenCalledWith(['c', 'a', 'b'])
  })

  it('invoking onReorder does NOT re-render the panel (UX Major #1 fix)', () => {
    // Regression guard: previously the wiring also called
    // refreshSlots() → listSlots() → setSlots() inside onReorder,
    // which destroyed focus on the moved row and broke consecutive
    // Alt+Arrow keyboard reorder. Persistence is the wiring layer's
    // only responsibility here; rendering and focus restoration are
    // owned by ProjectsPanelReorderController.
    const panel = buildHarness() as unknown as ReorderPanel & {
      setSlots: ReturnType<typeof vi.fn>
    }

    // Reset call counts AFTER buildHarness — wireProjectsPanel calls
    // refreshSlots() once on initialisation, and we want to observe
    // only what the reorder handler does.
    MockedStore.listSlots.mockClear()
    panel.setSlots.mockClear()

    panel.onReorder?.(['x', 'y'])

    expect(MockedStore.listSlots).not.toHaveBeenCalled()
    expect(panel.setSlots).not.toHaveBeenCalled()
  })

  it('forwarded ids are passed by-value (not the same array reference is required, but contents must match)', () => {
    const panel = buildHarness() as unknown as ReorderPanel

    const ids = ['a', 'b', 'c']
    panel.onReorder?.(ids)

    expect(MockedStore.setSlotOrder).toHaveBeenCalledTimes(1)
    const passed = MockedStore.setSlotOrder.mock.calls[0]![0] as string[]
    expect(passed).toEqual(['a', 'b', 'c'])
  })
})
