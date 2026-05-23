import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * E4e + E4f + E4g — RED-step source-content tests for the PXT
 * factory.ts namespace cleanup.
 *
 *   E4e — Predicates `currentItemIsDefective` / `currentItemIs`
 *         move from `namespace splitters` → `namespace logic`.
 *         Block IDs (`factory_current_item_defective`,
 *         `factory_current_item_is`) UNCHANGED for save-compat;
 *         function NAMES UNCHANGED so the runtime proxies in
 *         BlockInterpreter (E3) keep working.
 *
 *   E4f — Event hat `events.onItemArrivesAtSplitter` is renamed
 *         to the more general `events.onItemArrives`. Block id
 *         `factory_on_item_arrives` UNCHANGED.
 *
 *   E4g — The entire `namespace splitters { ... }` block is
 *         deleted from factory.ts (the toolbox category and locale
 *         entries are deleted in their own RED tests).
 *
 * The tests read the PXT source as text — same approach as
 * factory.routeItemsTo.test.ts and FactoryShadowInputs.test.ts.
 */

const FACTORY_TS_PATH = resolve(
  __dirname,
  '../../../pxt-target/libs/core/factory.ts',
)

function readFactorySource(): string {
  return readFileSync(FACTORY_TS_PATH, 'utf8')
}

/**
 * Brace-balanced extraction of `namespace <name> { ... }`. Body
 * INCLUDES the opening `{` and closing `}` so substring-position
 * checks against the whole match still tell us the block sits
 * inside the namespace. Mirrors the helper duplicated in
 * factory.routeItemsTo.test.ts / FactoryShadowInputs.test.ts /
 * FactorySetRecipeMachineSlot.test.ts.
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

describe('factory.ts — namespace splitters cleanup (E4g)', () => {
  it('A: `namespace splitters {` is GONE from factory.ts', () => {
    const source = readFactorySource()
    expect(
      source,
      'The entire `namespace splitters { ... }` block must be deleted ' +
        'from factory.ts as part of E4g — the splitters toolbox category ' +
        'is being removed and its three blocks redistributed (or deleted).',
    ).not.toMatch(/namespace\s+splitters\s*\{/)
  })

  it('B: `blockId=factory_route_current_item` declaration is GONE', () => {
    const source = readFactorySource()
    expect(
      source,
      'splitters.routeCurrentItemTo is replaced by the persistent ' +
        'machines.routeItemsTo block (E4b/E4c). Its declaration must be ' +
        'removed from factory.ts so the Splitters category has no source ' +
        'anchor left behind.',
    ).not.toMatch(/blockId=factory_route_current_item\b/)
  })
})

describe('factory.ts — predicates moved to namespace logic (E4e)', () => {
  it('C: `namespace logic {` exists in factory.ts', () => {
    const source = readFactorySource()
    expect(source).toMatch(/namespace\s+logic\s*\{/)
  })

  it('D1: `blockId=factory_current_item_defective` lives inside namespace logic', () => {
    const source = readFactorySource()
    const logicBody = extractNamespaceBody(source, 'logic')
    expect(
      logicBody,
      'currentItemIsDefective must be moved into `namespace logic { ... }` ' +
        '(E4e). Block id is preserved for save-compat; runtime BlockInterpreter ' +
        'already proxies logic.currentItemIsDefective from E3.',
    ).toMatch(/blockId=factory_current_item_defective\b/)
  })

  it('D2: `blockId=factory_current_item_is` lives inside namespace logic', () => {
    const source = readFactorySource()
    const logicBody = extractNamespaceBody(source, 'logic')
    expect(
      logicBody,
      'currentItemIs(partType) must be moved into `namespace logic { ... }` ' +
        '(E4e). Block id is preserved for save-compat.',
    ).toMatch(/blockId=factory_current_item_is\b/)
  })

  it('E1: predicate function name `currentItemIsDefective` is UNCHANGED', () => {
    const source = readFactorySource()
    const logicBody = extractNamespaceBody(source, 'logic')
    // Empty-paren signature → no-arg boolean predicate. The name is
    // preserved so the runtime proxy `logic.currentItemIsDefective`
    // installed by BlockInterpreter (E3) finds the same symbol.
    expect(logicBody).toMatch(
      /export\s+function\s+currentItemIsDefective\s*\(\s*\)\s*:\s*boolean/,
    )
  })

  it('E2: predicate function name `currentItemIs(partType: PartType)` is UNCHANGED', () => {
    const source = readFactorySource()
    const logicBody = extractNamespaceBody(source, 'logic')
    expect(logicBody).toMatch(
      /export\s+function\s+currentItemIs\s*\(\s*partType\s*:\s*PartType\s*\)\s*:\s*boolean/,
    )
  })
})

describe('factory.ts — event hat renamed (E4f)', () => {
  it('F1: `namespace events {` declares export function onItemArrives(machine, handler)', () => {
    const source = readFactorySource()
    const eventsBody = extractNamespaceBody(source, 'events')
    expect(
      eventsBody,
      'The event hat is renamed from `onItemArrivesAtSplitter` to the ' +
        'more general `onItemArrives` (E4f). The runtime BlockInterpreter ' +
        'already aliases eventsNs.onItemArrives from E3.',
    ).toMatch(
      /export\s+function\s+onItemArrives\s*\(\s*machine\s*:\s*number\s*,\s*handler\s*:\s*\(\s*\)\s*=>\s*void\s*\)/,
    )
  })

  it('F2: `blockId=factory_on_item_arrives` is STILL present (id preserved for save-compat)', () => {
    const source = readFactorySource()
    const eventsBody = extractNamespaceBody(source, 'events')
    expect(
      eventsBody,
      'Block id factory_on_item_arrives must be preserved verbatim — it is ' +
        'the persistence key for saved programs that already use the hat.',
    ).toMatch(/blockId=factory_on_item_arrives\b/)
  })

  it('G: `onItemArrivesAtSplitter` function name is GONE from factory.ts', () => {
    const source = readFactorySource()
    expect(
      source,
      'The legacy function name `onItemArrivesAtSplitter` must be removed; ' +
        'only the new generalized name `onItemArrives` should remain.',
    ).not.toMatch(/onItemArrivesAtSplitter/)
  })
})
