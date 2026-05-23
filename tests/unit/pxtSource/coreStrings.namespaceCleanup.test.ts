import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * E4e + E4f + E4g — RED-step content tests for the locale entries
 * that label the namespace-cleanup blocks.
 *
 *   E4g — `splitters.routeCurrentItemTo|block` is REMOVED (block
 *         deleted entirely; replaced by machines.routeItemsTo).
 *
 *   E4e — `splitters.currentItemIsDefective|block` and
 *         `splitters.currentItemIs|block` are RENAMED to
 *         `logic.currentItemIsDefective|block` and
 *         `logic.currentItemIs|block` to match the function's new
 *         home in `namespace logic`.
 *
 *   E4f — `events.onItemArrivesAtSplitter|block` is RENAMED to
 *         `events.onItemArrives|block` to match the generalized
 *         hat function name.
 *
 * Pattern mirrors coreStrings.routeItemsTo.test.ts.
 */

const CORE_STRINGS_PATH = resolve(
  __dirname,
  '../../../pxt-target/libs/core/_locales/core-strings.json',
)

function readCoreStrings(): Record<string, string> {
  const raw = readFileSync(CORE_STRINGS_PATH, 'utf8')
  return JSON.parse(raw)
}

describe('core-strings.json — splitters namespace cleanup (E4g)', () => {
  it('H: key "splitters.routeCurrentItemTo|block" is REMOVED', () => {
    const strings = readCoreStrings()
    expect(
      strings,
      'splitters.routeCurrentItemTo is deleted entirely (replaced by ' +
        'machines.routeItemsTo). Its locale key must be removed so PXT does ' +
        'not retain a label for a block that no longer exists.',
    ).not.toHaveProperty('splitters.routeCurrentItemTo|block')
  })
})

describe('core-strings.json — predicate keys renamed to logic.* (E4e)', () => {
  it('I1: legacy "splitters.currentItemIsDefective|block" is REMOVED', () => {
    const strings = readCoreStrings()
    expect(strings).not.toHaveProperty('splitters.currentItemIsDefective|block')
  })

  it('I2: legacy "splitters.currentItemIs|block" is REMOVED', () => {
    const strings = readCoreStrings()
    expect(strings).not.toHaveProperty('splitters.currentItemIs|block')
  })

  it('I3: new "logic.currentItemIsDefective|block" exists with non-empty value', () => {
    const strings = readCoreStrings()
    const value = strings['logic.currentItemIsDefective|block']
    expect(
      value,
      'After E4e the predicate lives in `namespace logic`, so PXT looks up ' +
        'the label under the `logic.*` key prefix.',
    ).toBeDefined()
    expect(typeof value).toBe('string')
    expect(value!.trim().length).toBeGreaterThan(0)
  })

  it('I4: new "logic.currentItemIs|block" exists with non-empty value', () => {
    const strings = readCoreStrings()
    const value = strings['logic.currentItemIs|block']
    expect(value).toBeDefined()
    expect(typeof value).toBe('string')
    expect(value!.trim().length).toBeGreaterThan(0)
  })
})

describe('core-strings.json — event hat key renamed to events.onItemArrives (E4f)', () => {
  it('J1: legacy "events.onItemArrivesAtSplitter|block" is REMOVED', () => {
    const strings = readCoreStrings()
    expect(strings).not.toHaveProperty('events.onItemArrivesAtSplitter|block')
  })

  it('J2: new "events.onItemArrives|block" exists with non-empty value', () => {
    const strings = readCoreStrings()
    const value = strings['events.onItemArrives|block']
    expect(
      value,
      'After E4f the hat function is renamed to `events.onItemArrives`; the ' +
        'locale key must follow the new function path. The label text itself ' +
        'may still read "on item arrives at %machine" — only the key changes.',
    ).toBeDefined()
    expect(typeof value).toBe('string')
    expect(value!.trim().length).toBeGreaterThan(0)
  })
})
