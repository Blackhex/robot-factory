import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ALL_MACHINE_TYPES,
  PLACEABLE_MACHINE_TYPES,
  type MachineType,
} from '../../../src/game/types'

const MACHINE_PANEL_PATH = join(__dirname, '../../../src/ui/MachinePanel.ts')
const MAIN_PATH = join(__dirname, '../../../src/main.ts')

describe('PLACEABLE_MACHINE_TYPES', () => {
  it('is exported as a non-empty readonly array of MachineType strings', () => {
    expect(Array.isArray(PLACEABLE_MACHINE_TYPES)).toBe(true)
    expect(PLACEABLE_MACHINE_TYPES.length).toBeGreaterThan(0)
    for (const t of PLACEABLE_MACHINE_TYPES) {
      expect(typeof t).toBe('string')
      expect((ALL_MACHINE_TYPES as readonly MachineType[])).toContain(t)
    }
  })

  it('equals ALL_MACHINE_TYPES minus factory_output (set difference)', () => {
    const expected = (ALL_MACHINE_TYPES as readonly MachineType[]).filter(
      (t) => t !== 'factory_output',
    )
    expect([...PLACEABLE_MACHINE_TYPES].sort()).toEqual([...expected].sort())
    expect(PLACEABLE_MACHINE_TYPES).not.toContain('factory_output' as MachineType)
  })
})

describe('Machine-type list deduplication (static source checks)', () => {
  it('MachinePanel.ts imports PLACEABLE_MACHINE_TYPES and has no local copy', () => {
    const source = readFileSync(MACHINE_PANEL_PATH, 'utf-8')

    // Must import the shared constant from src/game/types.
    expect(
      source,
      'MachinePanel.ts must import PLACEABLE_MACHINE_TYPES from ../game/types',
    ).toMatch(/import\s*\{[^}]*\bPLACEABLE_MACHINE_TYPES\b[^}]*\}\s*from\s*['"]\.\.\/game\/types['"]/)

    // Must NOT declare a local MACHINE_TYPES list of MachineType.
    expect(
      source,
      'MachinePanel.ts must not declare a local MACHINE_TYPES array',
    ).not.toMatch(/const\s+MACHINE_TYPES\s*:\s*MachineType\[\]\s*=/)

    // Must NOT contain the inline literal members of the panel's machine list.
    // (After the fix the strings only exist in src/game/types.ts.)
    expect(
      source,
      "MachinePanel.ts must not contain the inline 'part_fabricator' literal",
    ).not.toMatch(/'part_fabricator'/)
    expect(
      source,
      "MachinePanel.ts must not contain the inline 'assembler' literal",
    ).not.toMatch(/'assembler'/)
  })

  it('main.ts uses ALL_MACHINE_TYPES (or PLACEABLE_MACHINE_TYPES) for sandbox, not a local copy', () => {
    const source = readFileSync(MAIN_PATH, 'utf-8')

    // Must import the shared constant from src/game/types.
    expect(
      source,
      'main.ts must import ALL_MACHINE_TYPES or PLACEABLE_MACHINE_TYPES from ./game/types',
    ).toMatch(
      /import\s*(?:type\s*)?\{[^}]*\b(?:ALL_MACHINE_TYPES|PLACEABLE_MACHINE_TYPES)\b[^}]*\}\s*from\s*['"]\.\/game\/types['"]/,
    )

    // The sandbox setAvailableMachineTypes call must pass the constant
    // (optionally spread) — never an inline array literal of strings.
    // After the setupLevelRendering refactor the constant may be supplied
    // via a config object (e.g. `availableMachines: ALL_MACHINE_TYPES`)
    // and the actual setAvailableMachineTypes call lives in the shared
    // helper. Either form is acceptable as long as the constant is wired
    // through (the no-inline-literal checks below pin the real intent).
    expect(
      source,
      'main.ts sandbox setAvailableMachineTypes must reference ALL_MACHINE_TYPES or PLACEABLE_MACHINE_TYPES',
    ).toMatch(
      /(?:machinePanel\.setAvailableMachineTypes\(\s*(?:\[\s*\.\.\.\s*)?(?:ALL_MACHINE_TYPES|PLACEABLE_MACHINE_TYPES)\b|availableMachines\s*:\s*(?:\[\s*\.\.\.\s*)?(?:ALL_MACHINE_TYPES|PLACEABLE_MACHINE_TYPES)\b)/,
    )

    // Must NOT contain the inline 7-element string literal that currently
    // lives in the sandbox setup.
    expect(
      source,
      "main.ts must not contain the inline 'part_fabricator' literal",
    ).not.toMatch(/'part_fabricator'/)
    expect(
      source,
      "main.ts must not contain the inline 'factory_output' literal",
    ).not.toMatch(/'factory_output'/)
  })
})
