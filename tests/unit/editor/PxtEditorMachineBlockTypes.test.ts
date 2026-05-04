import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Source-level guard for `PxtEditor.MACHINE_BLOCK_TYPES`.
 *
 * The list is a `private static readonly` field, so it is not directly
 * reachable through the public API. We assert membership by inspecting
 * the source text — the same approach used by the other extraction /
 * structural tests in this folder (e.g. PxtEditorExtractions.test.ts,
 * MachineBehaviors.test.ts source-structure block).
 *
 * `factory_set_machine_speed` must appear inside the MACHINE_BLOCK_TYPES
 * declaration so the dynamic dropdown patcher updates the new block's
 * `machine` field with live machine names (mirrors the existing entries
 * for `factory_start_machine`, `factory_stop_machine`, etc.).
 */

const PXT_EDITOR_PATH = resolve(__dirname, '../../../src/editor/PxtEditor.ts')

function readPxtEditorSource(): string {
  return readFileSync(PXT_EDITOR_PATH, 'utf8')
}

/**
 * Extract the array literal that follows
 * `private static readonly MACHINE_BLOCK_TYPES = [`.
 */
function extractMachineBlockTypesLiteral(source: string): string {
  const start = source.indexOf('MACHINE_BLOCK_TYPES')
  expect(start, 'MACHINE_BLOCK_TYPES declaration must exist').toBeGreaterThan(-1)
  const open = source.indexOf('[', start)
  expect(open, 'MACHINE_BLOCK_TYPES must be an array literal').toBeGreaterThan(-1)
  const close = source.indexOf(']', open)
  expect(close, 'MACHINE_BLOCK_TYPES literal must terminate').toBeGreaterThan(-1)
  return source.slice(open, close + 1)
}

describe('PxtEditor — MACHINE_BLOCK_TYPES contains factory_set_machine_speed', () => {
  it('factory_set_machine_speed appears in the MACHINE_BLOCK_TYPES literal', () => {
    // GIVEN
    const literal = extractMachineBlockTypesLiteral(readPxtEditorSource())

    // THEN — must be a quoted member of the array (single or double quotes)
    expect(literal).toMatch(/['"]factory_set_machine_speed['"]/)
  })

  it('the existing machine block types are still present (regression guard)', () => {
    // GIVEN
    const literal = extractMachineBlockTypesLiteral(readPxtEditorSource())

    // THEN — adding the new entry must not displace the established entries
    for (const id of [
      'factory_start_machine',
      'factory_stop_machine',
      'factory_set_recipe',
      'factory_on_machine_idle',
      'factory_pick_machine',
    ]) {
      expect(
        literal,
        `${id} should remain in MACHINE_BLOCK_TYPES`,
      ).toMatch(new RegExp(`['"]${id}['"]`))
    }
  })
})
