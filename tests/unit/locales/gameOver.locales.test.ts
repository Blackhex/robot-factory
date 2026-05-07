import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ITEM_COLORS } from '../../../src/rendering/ItemColors'

function loadLocale(name: 'en' | 'cs'): Record<string, unknown> {
  const path = join(__dirname, '..', '..', '..', 'src', 'locales', `${name}.json`)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function getNested(obj: Record<string, unknown>, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, obj)
}

const ALL_ITEM_TYPES = Object.keys(ITEM_COLORS).sort()

const REQUIRED_KEYS = [
  'game_over.title',
  'game_over.reason.unconsumable_input',
  'game_over.reason.unconsumable_input_machine_disabled',
  'game_over.restart',
] as const

describe('Locales — game_over keys', () => {
  for (const locale of ['en', 'cs'] as const) {
    describe(`${locale}.json`, () => {
      for (const key of REQUIRED_KEYS) {
        it(`contains ${key} as a non-empty string`, () => {
          // GIVEN
          const data = loadLocale(locale)

          // WHEN
          const value = getNested(data, key)

          // THEN
          expect(typeof value).toBe('string')
          expect((value as string).length).toBeGreaterThan(0)
        })
      }
    })
  }

  it('reason.unconsumable_input contains placeholders for machine and item', () => {
    // GIVEN
    for (const locale of ['en', 'cs'] as const) {
      const data = loadLocale(locale)

      // WHEN
      const value = getNested(data, 'game_over.reason.unconsumable_input') as string

      // THEN — must contain i18next-style placeholders {{machine}} and {{item}}.
      expect(value).toMatch(/\{\{machine\}\}/)
      expect(value).toMatch(/\{\{item\}\}/)
    }
  })

  it('reason.unconsumable_input_machine_disabled uses stopped wording and repeats the machine placeholder in recovery text', () => {
    // GIVEN
    const en = loadLocale('en')
    const cs = loadLocale('cs')

    // WHEN
    const enValue = getNested(en, 'game_over.reason.unconsumable_input_machine_disabled') as string
    const csValue = getNested(cs, 'game_over.reason.unconsumable_input_machine_disabled') as string

    // THEN
    expect(enValue).toContain('{{machine}} is stopped')
    expect(enValue).toContain('Start the {{machine}} and try again.')
    expect(enValue).not.toMatch(/or disabled/i)
    expect(enValue).not.toContain('Start it')
    expect(enValue.match(/\{\{machine\}\}/g)).toHaveLength(2)
    expect(enValue.match(/\{\{item\}\}/g)).toHaveLength(1)

    expect(csValue).toMatch(/\{\{machine\}\} je zastaven/i)
    expect(csValue).toContain('Spusť {{machine}} a zkus to znovu.')
    expect(csValue).not.toMatch(/vypnut/i)
    expect(csValue).not.toContain('Spusť ho')
    expect(csValue.match(/\{\{machine\}\}/g)).toHaveLength(2)
    expect(csValue.match(/\{\{item\}\}/g)).toHaveLength(1)
  })

  it('EN and CS provide player-facing labels for the offending machine and item', () => {
    for (const locale of ['en', 'cs'] as const) {
      const data = loadLocale(locale)

      expect(getNested(data, 'machines.part_fabricator')).toBeTypeOf('string')
      expect(getNested(data, 'items.wheel_small')).toBeTypeOf('string')
      expect((getNested(data, 'machines.part_fabricator') as string).length).toBeGreaterThan(0)
      expect((getNested(data, 'items.wheel_small') as string).length).toBeGreaterThan(0)
    }
  })

  it('EN and CS provide localized item names for every current ItemType', () => {
    for (const locale of ['en', 'cs'] as const) {
      const data = loadLocale(locale)

      for (const itemType of ALL_ITEM_TYPES) {
        const value = getNested(data, `items.${itemType}`)
        expect(typeof value, `${locale}.json is missing items.${itemType}`).toBe('string')
        expect((value as string).length, `${locale}.json has empty items.${itemType}`).toBeGreaterThan(0)
      }
    }
  })

  it('EN and CS expose the same set of game_over keys', () => {
    // GIVEN
    const en = loadLocale('en')
    const cs = loadLocale('cs')

    function flatten(obj: unknown, prefix = ''): string[] {
      if (obj === null || typeof obj !== 'object') return prefix ? [prefix] : []
      const keys: string[] = []
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const next = prefix ? `${prefix}.${k}` : k
        if (v !== null && typeof v === 'object') keys.push(...flatten(v, next))
        else keys.push(next)
      }
      return keys
    }

    const enKeys = flatten(getNested(en, 'game_over')).sort()
    const csKeys = flatten(getNested(cs, 'game_over')).sort()

    // THEN — both files must define the game_over namespace …
    expect(enKeys.length).toBeGreaterThan(0)
    expect(csKeys.length).toBeGreaterThan(0)
    // … with identical key sets.
    expect(csKeys).toEqual(enKeys)
  })
})
