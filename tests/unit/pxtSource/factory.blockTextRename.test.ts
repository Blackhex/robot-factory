// FIXME(cs-locale): src/locales/cs.json level4_step3 / level4_step4 still
// use "směruj položky z rozdělovače" ("route items from"). EN was renamed
// to "route items of" / "route current item of <splitter> to <side>" but
// Czech genitive needs a translator pass — no clean minimal substitution.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * RED: pin the new wording of the Machines-category routing blocks.
 *
 * - `factory_route_items_to`: was `"route items from %machine to %sides"`,
 *   becomes `"route items of %machine to %sides"`.
 * - `factory_route_current_item_to`: was
 *   `"route current item to %side of %machine"`, becomes
 *   `"route current item of %machine to %side"` (machine now first).
 *
 * Both must keep `machine.shadow="factory_pick_machine"` so the slot
 * renders as a machine-picker dropdown, not a raw numeric input.
 */

const FACTORY_TS_PATH = resolve(__dirname, '../../../pxt-target/libs/core/factory.ts')

function readFactorySource(): string {
  return readFileSync(FACTORY_TS_PATH, 'utf8')
}

/** Slice the contiguous `//%` annotation block + following `export function` line for a given blockId. */
function extractBlockDecl(source: string, blockId: string): string {
  const lines = source.split('\n')
  const idLineIdx = lines.findIndex((l) => l.includes(`blockId=${blockId}`))
  expect(idLineIdx, `blockId=${blockId} must exist in factory.ts`).toBeGreaterThanOrEqual(0)
  let start = idLineIdx
  while (start > 0 && lines[start - 1].trim().startsWith('//%')) start--
  let end = idLineIdx
  while (end < lines.length - 1 && lines[end + 1].trim().startsWith('//%')) end++
  // Include the export line that follows the annotation block.
  if (end + 1 < lines.length) end++
  return lines.slice(start, end + 1).join('\n')
}

describe('factory.ts — Machines routing block text rename (RED)', () => {
  it('factory_route_items_to declares the new block text "route items of %machine to %sides"', () => {
    const decl = extractBlockDecl(readFactorySource(), 'factory_route_items_to')
    expect(decl).toContain('block="route items of %machine to %sides"')
  })

  it('factory_route_items_to keeps machine.shadow="factory_pick_machine"', () => {
    const decl = extractBlockDecl(readFactorySource(), 'factory_route_items_to')
    expect(decl).toContain('machine.shadow="factory_pick_machine"')
  })

  it('factory_route_current_item_to declares the new block text "route current item of %machine to %side"', () => {
    const decl = extractBlockDecl(readFactorySource(), 'factory_route_current_item_to')
    expect(decl).toContain('block="route current item of %machine to %side"')
  })

  it('factory_route_current_item_to keeps machine.shadow="factory_pick_machine"', () => {
    const decl = extractBlockDecl(readFactorySource(), 'factory_route_current_item_to')
    expect(decl).toContain('machine.shadow="factory_pick_machine"')
  })

  it('factory.ts no longer contains the old block-text wordings', () => {
    const source = readFactorySource()
    expect(source, 'old `route items from %machine` wording must be removed').not.toContain(
      'route items from %machine',
    )
    expect(
      source,
      'old `route current item to %side of %machine` wording must be removed',
    ).not.toContain('route current item to %side of %machine')
  })
})
