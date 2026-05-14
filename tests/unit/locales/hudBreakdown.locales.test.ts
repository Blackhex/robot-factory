import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * RED-state spec: new HUD breakdown keys must exist in both locales.
 * The legacy `hud.items_delivered` key MAY remain (other surfaces still
 * reference it) but the HUD no longer renders it — see HUD.test.ts.
 */

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

const REQUIRED_KEYS = [
  'hud.parts_delivered',
  'hud.assemblies_delivered',
] as const

describe('Locales — HUD per-category breakdown keys', () => {
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
})
