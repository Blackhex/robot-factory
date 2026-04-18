import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

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

describe('Locales — empty-state dropdown labels', () => {
  for (const locale of ['en', 'cs'] as const) {
    describe(`${locale}.json`, () => {
      it('contains blocks.no_machines as a non-empty string', () => {
        // GIVEN
        const data = loadLocale(locale)

        // WHEN
        const value = getNested(data, 'blocks.no_machines')

        // THEN
        expect(typeof value).toBe('string')
        expect((value as string).length).toBeGreaterThan(0)
      })

      it('contains blocks.no_belts as a non-empty string', () => {
        // GIVEN
        const data = loadLocale(locale)

        // WHEN
        const value = getNested(data, 'blocks.no_belts')

        // THEN
        expect(typeof value).toBe('string')
        expect((value as string).length).toBeGreaterThan(0)
      })
    })
  }
})
