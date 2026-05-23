import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * E4b — RED-step content tests for the new locale entries that
 * label the `factory_route_items_to` block and the
 * `SplitterOutputs` enum members.
 *
 * PXT looks up block labels from `_locales/<lang>/core-strings.json`
 * (or the default `_locales/core-strings.json`). The keys follow
 * the pattern:
 *
 *   `<namespace>.<functionName>|block`         — for block labels
 *   `<EnumName>.<MemberName>|block`            — for enum dropdown options
 *
 * If the locale entries are missing, the player sees the raw key
 * (e.g. `machines.routeItemsTo|block`) inside the editor.
 */

const CORE_STRINGS_PATH = resolve(
  __dirname,
  '../../../pxt-target/libs/core/_locales/core-strings.json',
)

function readCoreStrings(): Record<string, string> {
  const raw = readFileSync(CORE_STRINGS_PATH, 'utf8')
  return JSON.parse(raw)
}

describe('core-strings.json — machines.routeItemsTo block label (E4b, M)', () => {
  it('M: contains key "machines.routeItemsTo|block" with a non-empty value', () => {
    const strings = readCoreStrings()
    const value = strings['machines.routeItemsTo|block']
    expect(
      value,
      'Locale key "machines.routeItemsTo|block" must exist so PXT renders ' +
        'the player-facing block label instead of the raw key text.',
    ).toBeDefined()
    expect(typeof value).toBe('string')
    expect(value!.trim().length).toBeGreaterThan(0)
  })
})

const SPLITTER_OUTPUT_MEMBERS = [
  'Left',
  'Forward',
  'Right',
  'LeftForward',
  'LeftRight',
  'ForwardRight',
  'LeftForwardRight',
] as const

describe('core-strings.json — SplitterOutputs enum dropdown labels (E4b, N)', () => {
  it.each(SPLITTER_OUTPUT_MEMBERS)(
    'N: contains key "SplitterOutputs.%s|block" with a non-empty value',
    (member) => {
      const strings = readCoreStrings()
      const key = `SplitterOutputs.${member}|block`
      const value = strings[key]
      expect(
        value,
        `Locale key "${key}" must exist so PXT renders the dropdown ` +
          `option label instead of the raw enum member name.`,
      ).toBeDefined()
      expect(typeof value).toBe('string')
      expect(value!.trim().length).toBeGreaterThan(0)
    },
  )
})
