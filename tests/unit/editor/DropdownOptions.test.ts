import { describe, it, expect } from 'vitest'
import {
  buildDropdownOptions,
  resolveDropdownText,
  resolveLocalizedReporterText,
  type DropdownItem,
} from '../../../src/editor/dropdownOptions'

const MACHINE_MEMBERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
  'M9', 'M10', 'M11', 'M12',
] as const

const BELT_MEMBERS = [
  'Belt1', 'Belt2', 'Belt3', 'Belt4', 'Belt5', 'Belt6', 'Belt7', 'Belt8',
] as const

const EMPTY_MACHINE_LABEL = '(no machines)'
const EMPTY_BELT_LABEL = '(no belts)'

describe('buildDropdownOptions()', () => {
  describe('machine kind', () => {
    it('returns single placeholder option using first enum member when items are empty', () => {
      // GIVEN
      const items: DropdownItem[] = []

      // WHEN
      const result = buildDropdownOptions('machine', items, MACHINE_MEMBERS, EMPTY_MACHINE_LABEL)

      // THEN
      expect(result).toEqual([[EMPTY_MACHINE_LABEL, 'Machine.A']])
    })

    it('returns one real option when one machine is present (no placeholder)', () => {
      // GIVEN
      const items: DropdownItem[] = [{ slotIndex: 0, id: 'm1', name: 'Fab' }]

      // WHEN
      const result = buildDropdownOptions('machine', items, MACHINE_MEMBERS, EMPTY_MACHINE_LABEL)

      // THEN
      expect(result).toEqual([['Fab', 'Machine.A']])
    })

    it('skips gaps in slotIndex (slot 1 omitted -> Machine.B not in result)', () => {
      // GIVEN
      const items: DropdownItem[] = [
        { slotIndex: 0, id: 'm1', name: 'Fab' },
        { slotIndex: 2, id: 'm3', name: 'QC' },
      ]

      // WHEN
      const result = buildDropdownOptions('machine', items, MACHINE_MEMBERS, EMPTY_MACHINE_LABEL)

      // THEN
      expect(result).toEqual([
        ['Fab', 'Machine.A'],
        ['QC', 'Machine.C'],
      ])
    })

    it('falls back to id when neither name nor label is provided', () => {
      // GIVEN
      const items: DropdownItem[] = [{ slotIndex: 0, id: 'm1' }]

      // WHEN
      const result = buildDropdownOptions('machine', items, MACHINE_MEMBERS, EMPTY_MACHINE_LABEL)

      // THEN
      expect(result).toEqual([['m1', 'Machine.A']])
    })
  })

  describe('belt kind', () => {
    it('uses label when name is absent', () => {
      // GIVEN
      const items: DropdownItem[] = [{ slotIndex: 0, id: 'm1', label: 'Belt1→Belt2' }]

      // WHEN
      const result = buildDropdownOptions('belt', items, BELT_MEMBERS, EMPTY_BELT_LABEL)

      // THEN
      expect(result).toEqual([['Belt1→Belt2', 'Belt.Belt1']])
    })

    it('returns single placeholder option for belts when empty', () => {
      // GIVEN
      const items: DropdownItem[] = []

      // WHEN
      const result = buildDropdownOptions('belt', items, BELT_MEMBERS, EMPTY_BELT_LABEL)

      // THEN
      expect(result).toEqual([[EMPTY_BELT_LABEL, 'Belt.Belt1']])
    })
  })
})

describe('resolveDropdownText()', () => {
  it('returns emptyLabel for any value when labelMap is empty', () => {
    // GIVEN / WHEN / THEN
    expect(resolveDropdownText('Machine.A', {}, EMPTY_MACHINE_LABEL)).toBe(EMPTY_MACHINE_LABEL)
    expect(resolveDropdownText('Machine.X', {}, EMPTY_MACHINE_LABEL)).toBe(EMPTY_MACHINE_LABEL)
    expect(resolveDropdownText('', {}, EMPTY_MACHINE_LABEL)).toBe(EMPTY_MACHINE_LABEL)
  })

  it('returns mapped label when value exists in non-empty labelMap', () => {
    // GIVEN
    const labelMap = { 'Machine.A': 'Fab' }

    // WHEN / THEN
    expect(resolveDropdownText('Machine.A', labelMap, EMPTY_MACHINE_LABEL)).toBe('Fab')
  })

  it('returns null (fall-through) when value is missing from non-empty labelMap', () => {
    // GIVEN
    const labelMap = { 'Machine.A': 'Fab' }

    // WHEN / THEN
    expect(resolveDropdownText('Machine.B', labelMap, EMPTY_MACHINE_LABEL)).toBeNull()
  })

  it('returns null for empty value when labelMap is non-empty', () => {
    // GIVEN
    const labelMap = { 'Machine.A': 'Fab' }

    // WHEN / THEN
    expect(resolveDropdownText('', labelMap, EMPTY_MACHINE_LABEL)).toBeNull()
  })
})

describe('resolveLocalizedReporterText()', () => {
  it('substitutes localized reporter templates into mapped labels', () => {
    const labelMap = { 'Machine.A': 'Odesílač1' }

    expect(
      resolveLocalizedReporterText('Machine.A', labelMap, EMPTY_MACHINE_LABEL, 'stroj %machine'),
    ).toBe('stroj Odesílač1')
  })

  it('skips the localized prefix when the machine name already includes it', () => {
    const labelMap = { 'Machine.A': 'stroj1' }

    expect(
      resolveLocalizedReporterText('Machine.A', labelMap, EMPTY_MACHINE_LABEL, 'stroj %machine'),
    ).toBe('stroj1')
  })

  it('suppresses the empty-state placeholder instead of manufacturing a localized prefix', () => {
    expect(
      resolveLocalizedReporterText('Machine.A', {}, EMPTY_MACHINE_LABEL, 'stroj %machine'),
    ).toBe('')
  })

  it('falls back to raw label resolution when no localized template is available', () => {
    const labelMap = { 'Machine.A': 'Odesílač1' }

    expect(resolveLocalizedReporterText('Machine.A', labelMap, EMPTY_MACHINE_LABEL, null)).toBe('Odesílač1')
  })

  it('returns an empty string when no localized template is available and no label can be resolved', () => {
    expect(resolveLocalizedReporterText('Machine.A', {}, EMPTY_MACHINE_LABEL, null)).toBe('')
  })
})
