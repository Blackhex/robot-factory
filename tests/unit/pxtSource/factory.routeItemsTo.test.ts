import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * E4b — RED-step source-content tests for the new PXT block
 * declaration `factory_route_items_to`.
 *
 * The block exposes the runtime handler
 * `machines.routeItemsTo(machine, sidesBitmask)` (already wired in
 * BlockInterpreter by E2) to the player. It must:
 *
 *   - live inside `namespace machines { ... }` so it inherits the
 *     Actions category color (217) and weight,
 *   - declare blockId=factory_route_items_to (the BlockInterpreter
 *     keys its handler off this id),
 *   - take a `machine: number` slot with a
 *     `factory_pick_machine` shadow (so the pluggable-slot patcher
 *     can convert the dropdown into a value input — see
 *     PluggableSlotsRouteItemsTo.test.ts), and
 *   - take a `sides: SplitterOutputs` enum slot.
 *
 * These tests read the PXT source as text — same approach as
 * FactoryShadowInputs.test.ts and FactoryPxtSource.test.ts.
 */

const FACTORY_TS_PATH = resolve(
  __dirname,
  '../../../pxt-target/libs/core/factory.ts',
)

function readFactorySource(): string {
  return readFileSync(FACTORY_TS_PATH, 'utf8')
}

/**
 * Brace-balanced extraction of `namespace <name> { ... }`. The body
 * INCLUDES the opening `{` and closing `}` so substring-position
 * checks against the whole match still tell us the block sits
 * inside the namespace.
 */
function extractNamespaceBody(source: string, namespaceName: string): string {
  const re = new RegExp(`namespace\\s+${namespaceName}\\s*\\{`)
  const match = source.match(re)
  expect(match, `namespace ${namespaceName} must exist in factory.ts`).not.toBeNull()
  const start = match!.index!
  const openBrace = source.indexOf('{', start)
  let depth = 0
  for (let i = openBrace; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`namespace ${namespaceName} did not close`)
}

describe('factory.ts — factory_route_items_to block declaration (E4b)', () => {
  it('G: declares blockId=factory_route_items_to AND export function routeItemsTo(', () => {
    const source = readFactorySource()
    expect(source, 'blockId=factory_route_items_to must be declared').toMatch(
      /blockId=factory_route_items_to\b/,
    )
    expect(source, 'export function routeItemsTo( must exist').toMatch(
      /export\s+function\s+routeItemsTo\s*\(/,
    )
  })

  it('H: the declaration sits inside namespace machines (not splitters / events)', () => {
    const source = readFactorySource()
    const machinesBody = extractNamespaceBody(source, 'machines')

    expect(
      machinesBody,
      'factory_route_items_to must be declared inside `namespace machines { ... }` ' +
        'so it inherits the Actions category color (217) and weight.',
    ).toMatch(/blockId=factory_route_items_to\b/)
    expect(machinesBody).toMatch(/export\s+function\s+routeItemsTo\s*\(/)
  })

  it('I: signature is routeItemsTo(machine: number, sides: SplitterOutputs)', () => {
    const source = readFactorySource()
    // Allow `sidesBitmask` as an alternate parameter name — the
    // BlockInterpreter (E2) keys off the block id, not the param
    // name. Type must be `SplitterOutputs` either way.
    expect(source).toMatch(
      /export\s+function\s+routeItemsTo\s*\(\s*machine\s*:\s*number\s*,\s*\w+\s*:\s*SplitterOutputs\s*\)/,
    )
  })

  it('J: declares machine.shadow="factory_pick_machine"', () => {
    const source = readFactorySource()
    // Find the contiguous //% annotation block surrounding the
    // blockId line and assert the shadow directive is in it.
    const lines = source.split('\n')
    let lineIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('blockId=factory_route_items_to')) {
        lineIdx = i
        break
      }
    }
    expect(lineIdx, 'blockId=factory_route_items_to line must exist').toBeGreaterThan(-1)
    let start = lineIdx
    while (start > 0 && lines[start - 1].trim().startsWith('//%')) start--
    let end = lineIdx
    while (end < lines.length - 1 && lines[end + 1].trim().startsWith('//%')) end++
    const annotation = lines.slice(start, end + 1).join('\n')

    expect(
      annotation,
      'machine.shadow="factory_pick_machine" must be declared in the ' +
        'factory_route_items_to annotation so PXT pre-populates the slot ' +
        'with the pickMachine reporter.',
    ).toMatch(/machine\.shadow\s*=\s*"factory_pick_machine"/)
  })
})
