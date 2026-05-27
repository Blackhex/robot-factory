/**
 * Regression tests for the __rf_machineLabels / __rf_beltLabels naming contract.
 *
 * The buggy code sets win.__rf_machineLabelMap and win.__rf_beltLabelMap.
 * The POM (waitForMachineDropdownReady) and the original code (git 3242668)
 * both expect win.__rf_machineLabels and win.__rf_beltLabels.
 *
 * These tests are expected to FAIL until patchBlocklyDropdowns is fixed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import i18next from 'i18next'
import { patchBlocklyDropdowns } from '../../../src/editor/PxtEditorDropdownPatch'

// ---------------------------------------------------------------------------
// Mock all side-effectful dependencies so the function can run in isolation
// ---------------------------------------------------------------------------
vi.mock('i18next', () => ({
  default: { t: (key: string) => key },
}))

vi.mock('../../../src/editor/dropdownOptions', () => ({
  buildDropdownOptions: vi.fn().mockImplementation((kind, items, members, emptyLabel) => {
    if (items.length === 0) return [[emptyLabel, kind === 'machine' ? 'Machine.A' : 'Belt.Belt1']]
    return items.map((item: { slotIndex: number; id: string; name?: string; label?: string }) => [
      item.name ?? item.label ?? item.id,
      kind === 'machine' ? `Machine.${members[item.slotIndex]}` : `Belt.${members[item.slotIndex]}`,
    ])
  }),
  patchFieldDropdownClassValidation: vi.fn(),
  resolveDropdownText: vi.fn((value: string, labelMap: Record<string, string>, emptyLabel: string) => {
    if (Object.keys(labelMap).length === 0) return emptyLabel
    return Object.prototype.hasOwnProperty.call(labelMap, value) ? labelMap[value] : null
  }),
}))

vi.mock('../../../src/editor/slotEnumAutoReset', () => ({
  autoResetEnumFieldsForWorkspace: vi.fn(),
}))

vi.mock('../../../src/editor/recipeDropdownFilter', () => ({
  buildRecipeDropdownEntries: vi.fn().mockReturnValue([]),
  resolveRecipeOptionsForBlock: vi.fn().mockReturnValue([]),
}))

vi.mock('../../../src/editor/recipeAutoReset', () => ({
  installRecipeAutoResetListener: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockIframe(): { iframe: HTMLIFrameElement; win: Record<string, unknown> } {
  const win: Record<string, unknown> = {
    Blockly: {
      getMainWorkspace: () => ({
        addChangeListener: vi.fn(),
        getBlocksByType: vi.fn().mockReturnValue([]),
      }),
      Block: {
        prototype: {} as Record<string, unknown>,
      },
      FieldDropdown: {
        prototype: {} as Record<string, unknown>,
      },
      Events: {
        BLOCK_CHANGE: 'block_change',
        BLOCK_MOVE: 'block_move',
        BLOCK_CREATE: 'block_create',
      },
    },
  }
  const iframe = { contentWindow: win } as unknown as HTMLIFrameElement
  return { iframe, win }
}

function makeState() {
  return { prototypePatched: false, textPatched: false, recipeAutoResetInstalled: false }
}

const MACHINE_ITEMS = [
  { slotIndex: 0, id: 'machine-1', name: 'Fabricator' },
  { slotIndex: 1, id: 'machine-2', name: 'QC Station' },
]

const BELT_ITEMS = [
  { slotIndex: 0, id: 'belt-1', name: 'Belt A' },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('patchBlocklyDropdowns — window property naming contract', () => {
  let iframe: HTMLIFrameElement
  let win: Record<string, unknown>

  beforeEach(() => {
    const mock = makeMockIframe()
    iframe = mock.iframe
    win = mock.win
  })

  it('sets win.__rf_machineLabels (not __rf_machineLabelMap) after a machine patch', () => {
    // GIVEN
    const state = makeState()

    // WHEN
    patchBlocklyDropdowns(iframe, true, 'machine', MACHINE_ITEMS, state)

    // THEN — expects the canonical name; FAILS if the buggy *LabelMap name is used instead
    expect(win.__rf_machineLabels).toBeDefined()
  })

  it('sets win.__rf_machineLabels to a plain object (record) after a machine patch', () => {
    // GIVEN
    const state = makeState()

    // WHEN
    patchBlocklyDropdowns(iframe, true, 'machine', MACHINE_ITEMS, state)

    // THEN
    expect(typeof win.__rf_machineLabels).toBe('object')
    expect(win.__rf_machineLabels).not.toBeNull()
  })

  it('sets win.__rf_beltLabels (not __rf_beltLabelMap) after a belt patch', () => {
    // GIVEN
    const state = makeState()

    // WHEN
    patchBlocklyDropdowns(iframe, true, 'belt', BELT_ITEMS, state)

    // THEN — expects the canonical name; FAILS if the buggy *LabelMap name is used instead
    expect(win.__rf_beltLabels).toBeDefined()
  })

  it('does NOT set win.__rf_machineLabelMap — regression guard against stale naming', () => {
    // GIVEN
    const state = makeState()

    // WHEN
    patchBlocklyDropdowns(iframe, true, 'machine', MACHINE_ITEMS, state)

    // THEN — the old (wrong) name must NOT appear on the window; if it does, the
    // naming regression is present and waitForMachineDropdownReady will never resolve
    expect(win.__rf_machineLabelMap).toBeUndefined()
  })

  it('does NOT set win.__rf_beltLabelMap — regression guard against stale naming', () => {
    // GIVEN
    const state = makeState()

    // WHEN
    patchBlocklyDropdowns(iframe, true, 'belt', BELT_ITEMS, state)

    // THEN
    expect(win.__rf_beltLabelMap).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Tests 6 & 7 — i18next key contract
// These FAIL until PxtEditorDropdownPatch uses the correct keys:
//   'blocks.no_machines' and 'blocks.no_belts'
// ---------------------------------------------------------------------------

describe('patchBlocklyDropdowns — i18next key contract for empty-label', () => {
  let iframe: HTMLIFrameElement
  let win: Record<string, unknown>

  beforeEach(() => {
    const mock = makeMockIframe()
    iframe = mock.iframe
    win = mock.win
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stores localized empty labels on the iframe window', () => {
    const state = makeState()

    patchBlocklyDropdowns(iframe, true, 'machine', [], state)

    expect(win.__rf_machineEmptyLabel).toBe('blocks.no_machines')
    expect(win.__rf_beltEmptyLabel).toBe('blocks.no_belts')
  })

  it('renders raw machine names instead of duplicating the localized reporter prefix', () => {
    const state = makeState()
    patchBlocklyDropdowns(iframe, true, 'machine', MACHINE_ITEMS, state)

    const blockly = (win as any).Blockly
    const fakeReporterBlock = {
      type: 'factory_pick_machine',
      getField: vi.fn(() => ({
        getValue: () => 'Machine.A',
      })),
    }

    expect(blockly.Block.prototype.toString.call(fakeReporterBlock)).toBe('Fabricator')
  })

  it('uses the localized empty label when the machine list is empty', () => {
    const state = makeState()
    patchBlocklyDropdowns(iframe, true, 'machine', [], state)

    const blockly = (win as any).Blockly
    const fakeReporterBlock = {
      type: 'factory_pick_machine',
      getField: vi.fn(() => ({
        getValue: () => 'Machine.A',
      })),
    }

    expect(blockly.Block.prototype.toString.call(fakeReporterBlock)).toBe('blocks.no_machines')
  })

  it('keeps dropdown text aligned with the raw mapped label', () => {
    const state = makeState()
    patchBlocklyDropdowns(iframe, true, 'machine', MACHINE_ITEMS, state)

    const blockly = (win as any).Blockly
    const fakeField = {
      name: 'machine',
      sourceBlock_: { type: 'factory_pick_machine' },
      getValue: () => 'Machine.A',
    }

    expect(blockly.FieldDropdown.prototype.getText.call(fakeField)).toBe('Fabricator')
  })

  it('does not look up the empty machine label via a stale key', () => {
    const state = makeState()
    const tSpy = vi.spyOn(i18next, 't')

    patchBlocklyDropdowns(iframe, true, 'machine', [], state)

    const blockly = (win as any).Blockly
    const fakeField = {
      name: 'machine',
      sourceBlock_: { type: 'factory_start_machine' },
      getValue: () => 'Machine.A',
    }
    blockly.FieldDropdown.prototype.getText.call(fakeField)

    expect(tSpy.mock.calls.map((c) => c[0])).toContain('blocks.no_machines')
    expect(tSpy.mock.calls.map((c) => c[0])).not.toContain('editor.dropdown.no_machine')
  })

  it('does not look up the empty belt label via a stale key', () => {
    const state = makeState()
    const tSpy = vi.spyOn(i18next, 't')

    patchBlocklyDropdowns(iframe, true, 'belt', [], state)

    const blockly = (win as any).Blockly
    const fakeField = {
      name: 'belt',
      sourceBlock_: { type: 'factory_set_belt_speed' },
      getValue: () => 'Belt.Belt1',
    }
    blockly.FieldDropdown.prototype.getText.call(fakeField)

    expect(tSpy.mock.calls.map((c) => c[0])).toContain('blocks.no_belts')
    expect(tSpy.mock.calls.map((c) => c[0])).not.toContain('editor.dropdown.no_belt')
  })
})
