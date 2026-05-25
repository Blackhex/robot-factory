/**
 * RED-step parity tests for Task D: Level 4 tutorial localization.
 *
 * The new `tutorial.level4_step*` keys must exist in both en.json and
 * cs.json with non-empty translated values. Existing tutorial keys
 * must remain intact (regression guard).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type LocaleData = Record<string, unknown>

function loadLocale(name: 'en' | 'cs'): LocaleData {
  const path = join(__dirname, '..', '..', '..', 'src', 'locales', `${name}.json`)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function getNested(obj: LocaleData, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function getTutorialSection(locale: LocaleData): Record<string, string> {
  const tutorial = locale.tutorial
  if (tutorial === null || typeof tutorial !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(tutorial as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

function level4StepKeys(locale: LocaleData): string[] {
  return Object.keys(getTutorialSection(locale)).filter((k) => /^level4_step\d+$/.test(k))
}

describe('Locales — Level 4 tutorial parity (Task D)', () => {
  const en = loadLocale('en')
  const cs = loadLocale('cs')

  it('T18: tutorial.level4_step1 exists in both en.json and cs.json with non-empty values', () => {
    const enVal = getNested(en, 'tutorial.level4_step1')
    const csVal = getNested(cs, 'tutorial.level4_step1')
    expect(typeof enVal, 'en tutorial.level4_step1 must be a string').toBe('string')
    expect(typeof csVal, 'cs tutorial.level4_step1 must be a string').toBe('string')
    expect((enVal as string).length).toBeGreaterThan(0)
    expect((csVal as string).length).toBeGreaterThan(0)
  })

  it('T19: every tutorial.level4_step* key in en.json is also in cs.json (and vice versa)', () => {
    const enKeys = new Set(level4StepKeys(en))
    const csKeys = new Set(level4StepKeys(cs))
    expect(enKeys.size, 'en.json must define at least one tutorial.level4_step* key').toBeGreaterThan(0)

    const missingInCs = [...enKeys].filter((k) => !csKeys.has(k))
    const missingInEn = [...csKeys].filter((k) => !enKeys.has(k))
    expect(missingInCs, `keys in en.json but missing in cs.json: ${missingInCs.join(', ')}`).toHaveLength(0)
    expect(missingInEn, `keys in cs.json but missing in en.json: ${missingInEn.join(', ')}`).toHaveLength(0)
  })

  it('T20: each Level 4 tutorial step in cs.json is non-empty and not identical to en.json', () => {
    const enTut = getTutorialSection(en)
    const csTut = getTutorialSection(cs)
    const keys = level4StepKeys(en)
    expect(keys.length, 'expected at least one level4_step* key in en.json').toBeGreaterThan(0)

    for (const k of keys) {
      const enVal = enTut[k]
      const csVal = csTut[k]
      expect(typeof csVal, `cs tutorial.${k} must be a string`).toBe('string')
      expect(csVal.length, `cs tutorial.${k} must be non-empty`).toBeGreaterThan(0)

      // Skip non-identity check for very short / proper-noun-heavy values.
      // Normal sentence-length tutorial copy must be actually translated.
      if (enVal && enVal.length >= 20) {
        expect(csVal, `cs tutorial.${k} must not be identical to en (translate it!)`).not.toBe(enVal)
      }
    }
  })

  it('T21: regression — existing tutorial keys still exist with non-empty values in both files', () => {
    const existing = [
      'tutorial.level1_step1', 'tutorial.level1_step2', 'tutorial.level1_step3',
      'tutorial.level1_step4', 'tutorial.level1_step5', 'tutorial.level1_step6',
      'tutorial.level1_step7',
      'tutorial.level2_step1', 'tutorial.level2_step2', 'tutorial.level2_step3',
      'tutorial.level3_step1', 'tutorial.level3_step2',
    ]
    for (const k of existing) {
      const enVal = getNested(en, k)
      const csVal = getNested(cs, k)
      expect(typeof enVal, `en ${k} must be a string`).toBe('string')
      expect(typeof csVal, `cs ${k} must be a string`).toBe('string')
      expect((enVal as string).length, `en ${k} must be non-empty`).toBeGreaterThan(0)
      expect((csVal as string).length, `cs ${k} must be non-empty`).toBeGreaterThan(0)
    }
  })

  it('T22: en.json levels.level_4.description mentions both Splitter and Recycler', () => {
    const desc = getNested(en, 'levels.level_4.description')
    expect(typeof desc, 'en levels.level_4.description must be a string').toBe('string')
    expect(desc as string).toMatch(/Splitter/i)
    expect(desc as string).toMatch(/Recycler/i)
  })

  it('T23: cs.json levels.level_4.description mentions both Rozdělovač and Recyklovač', () => {
    const desc = getNested(cs, 'levels.level_4.description')
    expect(typeof desc, 'cs levels.level_4.description must be a string').toBe('string')
    expect(desc as string).toMatch(/Rozdělovač/i)
    expect(desc as string).toMatch(/Recyklovač/i)
  })
})
