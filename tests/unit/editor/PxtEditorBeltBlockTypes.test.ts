import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Source-level guard for `PxtEditor.BELT_BLOCK_TYPES`.
 *
 * Mirrors `PxtEditorMachineBlockTypes.test.ts`. The list is a
 * `private static readonly` field, so it is not directly reachable
 * through the public API. We assert membership by inspecting the
 * source text — the same approach used by the other extraction /
 * structural tests in this folder.
 *
 * `factory_pick_belt` must appear inside the BELT_BLOCK_TYPES
 * declaration so the dynamic dropdown patcher updates the new
 * reporter's `belt` field with live belt names (mirrors the existing
 * `factory_pick_machine` entry in MACHINE_BLOCK_TYPES).
 */

const PXT_EDITOR_PATH = resolve(__dirname, '../../../src/editor/PxtEditor.ts')

function readPxtEditorSource(): string {
  return readFileSync(PXT_EDITOR_PATH, 'utf8')
}

/**
 * Extract the array literal that follows
 * `private static readonly BELT_BLOCK_TYPES = [`.
 */
function extractBeltBlockTypesLiteral(source: string): string {
  const start = source.indexOf('BELT_BLOCK_TYPES')
  expect(start, 'BELT_BLOCK_TYPES declaration must exist').toBeGreaterThan(-1)
  const open = source.indexOf('[', start)
  expect(open, 'BELT_BLOCK_TYPES must be an array literal').toBeGreaterThan(-1)
  const close = source.indexOf(']', open)
  expect(close, 'BELT_BLOCK_TYPES literal must terminate').toBeGreaterThan(-1)
  return source.slice(open, close + 1)
}

describe('PxtEditor — BELT_BLOCK_TYPES contains factory_pick_belt', () => {
  it('factory_pick_belt appears in the BELT_BLOCK_TYPES literal', () => {
    // GIVEN
    const literal = extractBeltBlockTypesLiteral(readPxtEditorSource())

    // THEN — must be a quoted member of the array (single or double quotes)
    expect(literal).toMatch(/['"]factory_pick_belt['"]/)
  })

  it('factory_set_belt_speed remains in BELT_BLOCK_TYPES (regression guard)', () => {
    // GIVEN
    const literal = extractBeltBlockTypesLiteral(readPxtEditorSource())

    // THEN — adding the pickBelt entry must not displace setBeltSpeed
    expect(literal).toMatch(/['"]factory_set_belt_speed['"]/)
  })
})
