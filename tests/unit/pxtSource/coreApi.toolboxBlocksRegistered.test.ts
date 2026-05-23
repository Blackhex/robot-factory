import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Regression — every `factory_*` block id referenced by the level
 * toolbox in `src/editor/FactoryToolbox.ts` MUST appear in the
 * compiled PXT API registry at
 * `public/pxt-editor/target.json` → `apiInfo['libs/core'].apis.byQName`
 * as an entry whose `attributes.blockId` matches.
 *
 * PXT silently drops toolbox `<block type="…">` references that
 * have no `byQName` entry, so the user sees the toolbox built
 * without the block — exactly the symptom that triggered this
 * test for `factory_route_current_item_to` (qname
 * `machines.routeCurrentItemTo`).
 */

const TOOLBOX_PATH = resolve(__dirname, '../../../src/editor/FactoryToolbox.ts')
const TARGET_JSON_PATH = resolve(__dirname, '../../../public/pxt-editor/target.json')

/** Pre-existing gap — `factory_if_else` is referenced by the level-4 Conditionals category but has no source decl in `pxt-target/libs/core/factory.ts` and no post-build patch in `scripts/update-build-artifacts.cjs`. Tracked as a separate task. Remove this entry once the synthesized block is wired up. */
const KNOWN_MISSING_REGISTRY_BLOCK_IDS: readonly string[] = ['factory_if_else']

function readToolboxBlockIds(): string[] {
  const src = readFileSync(TOOLBOX_PATH, 'utf8')
  // Minimal regex parse: `block('factory_…')` calls only.
  const re = /\bblock\(\s*['"](factory_[a-z0-9_]+)['"]\s*\)/g
  const ids = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    ids.add(m[1])
  }
  return [...ids].sort()
}

interface ByQNameEntry {
  attributes?: { blockId?: string }
}

function readByQName(): Record<string, ByQNameEntry> {
  const raw = readFileSync(TARGET_JSON_PATH, 'utf8')
  const json = JSON.parse(raw) as {
    apiInfo?: { 'libs/core'?: { apis?: { byQName?: Record<string, ByQNameEntry> } } }
  }
  const byQName = json.apiInfo?.['libs/core']?.apis?.byQName
  expect(
    byQName,
    "apiInfo['libs/core'].apis.byQName must exist in public/pxt-editor/target.json",
  ).toBeTruthy()
  return byQName!
}

function registeredFactoryBlockIds(byQName: Record<string, ByQNameEntry>): Set<string> {
  const out = new Set<string>()
  for (const k of Object.keys(byQName)) {
    const id = byQName[k]?.attributes?.blockId
    if (id && id.startsWith('factory_')) out.add(id)
  }
  return out
}

describe('PXT compiled API registry — toolbox block coverage', () => {
  it('factory_route_current_item_to (qname machines.routeCurrentItemTo) is registered in byQName', () => {
    const byQName = readByQName()
    const entry = byQName['machines.routeCurrentItemTo']
    expect(
      entry,
      [
        '`factory_route_current_item_to` is referenced by the toolbox but has no compiled API entry in',
        "`public/pxt-editor/target.json` (`apiInfo['libs/core'].apis.byQName['machines.routeCurrentItemTo']`).",
        'Rebuild PXT to regenerate the registry.',
      ].join(' '),
    ).toBeTruthy()
    expect(
      entry?.attributes?.blockId,
      "machines.routeCurrentItemTo entry must carry attributes.blockId === 'factory_route_current_item_to'",
    ).toBe('factory_route_current_item_to')
  })

  it('every factory_* blockId referenced by FactoryToolbox.ts has a matching byQName entry', () => {
    const referenced = readToolboxBlockIds()
    const registered = registeredFactoryBlockIds(readByQName())
    const missing = referenced.filter((id) => !registered.has(id))
    const unexpectedMissing = missing.filter((id) => !KNOWN_MISSING_REGISTRY_BLOCK_IDS.includes(id))
    expect(
      unexpectedMissing,
      `Toolbox-referenced factory_* block ids missing from public/pxt-editor/target.json byQName: ${JSON.stringify(missing)} (allowlisted: ${JSON.stringify(KNOWN_MISSING_REGISTRY_BLOCK_IDS)}). Rebuild PXT to regenerate the registry.`,
    ).toEqual([])
  })

  it('KNOWN_MISSING_REGISTRY_BLOCK_IDS does not allowlist factory_route_current_item_to', () => {
    expect(
      KNOWN_MISSING_REGISTRY_BLOCK_IDS,
      '`factory_route_current_item_to` must never be allowlisted — it is the regression this test guards.',
    ).not.toContain('factory_route_current_item_to')
  })
})
