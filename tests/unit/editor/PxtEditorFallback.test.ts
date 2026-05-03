/**
 * @vitest-environment jsdom
 *
 * Locale-coverage tests for the PxtEditor fallback `<textarea>` editor.
 *
 * The fallback is shown until the PXT iframe responds (always-visible at
 * first paint), so its label & textarea placeholder MUST be localized via
 * i18next instead of hardcoded English literals.
 *
 * Today (before fix):
 *   - `src/editor/PxtEditor.ts` writes `'Factory Program (TypeScript)'` and
 *     a multi-line `'// Type factory commands here:'` placeholder directly.
 *   - `src/locales/{en,cs}.json` do not declare `pxt.fallback.label` or
 *     `pxt.fallback.placeholder`.
 *
 * These tests pin the contract so the fix can land with confidence.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import i18next from 'i18next'
import { PxtEditor } from '../../../src/editor/PxtEditor'

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

describe('PxtEditor fallback — locale keys are declared', () => {
  for (const locale of ['en', 'cs'] as const) {
    describe(`${locale}.json`, () => {
      it('contains pxt.fallback.label as a non-empty string', () => {
        // GIVEN
        const data = loadLocale(locale)

        // WHEN
        const value = getNested(data, 'pxt.fallback.label')

        // THEN
        expect(typeof value).toBe('string')
        expect((value as string).length).toBeGreaterThan(0)
      })

      it('contains pxt.fallback.placeholder as a non-empty string', () => {
        // GIVEN
        const data = loadLocale(locale)

        // WHEN
        const value = getNested(data, 'pxt.fallback.placeholder')

        // THEN
        expect(typeof value).toBe('string')
        expect((value as string).length).toBeGreaterThan(0)
      })
    })
  }
})

describe('PxtEditor fallback — DOM uses i18next translations', () => {
  let editor: PxtEditor
  let container: HTMLDivElement

  beforeEach(async () => {
    // Mirror the app's i18next setup — load the actual EN locale bundle from disk.
    const en = loadLocale('en')
    const cs = loadLocale('cs')
    await i18next.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: { translation: en },
        cs: { translation: cs },
      },
      interpolation: { escapeValue: false },
    })

    container = document.createElement('div')
    document.body.appendChild(container)

    editor = new PxtEditor()
    editor.mount(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('fallback label textContent equals i18next.t("pxt.fallback.label")', () => {
    // GIVEN
    const labelEl = container.querySelector<HTMLDivElement>('.pxt-editor-fallback-label')
    expect(labelEl, 'fallback label element should exist').not.toBeNull()

    // WHEN
    const expected = i18next.t('pxt.fallback.label')

    // THEN — must match the translation.
    expect(labelEl!.textContent).toBe(expected)
  })

  it('fallback textarea placeholder equals i18next.t("pxt.fallback.placeholder")', () => {
    // GIVEN
    const textareaEl = container.querySelector<HTMLTextAreaElement>(
      '.pxt-editor-fallback-textarea',
    )
    expect(textareaEl, 'fallback textarea element should exist').not.toBeNull()

    // WHEN
    const expected = i18next.t('pxt.fallback.placeholder')

    // THEN — must match the translation.
    expect(textareaEl!.placeholder).toBe(expected)
  })

  it('a fresh mount in CS picks up the Czech translation strings', async () => {
    // GIVEN — switch language and re-mount in a fresh container.
    await i18next.changeLanguage('cs')
    const csContainer = document.createElement('div')
    document.body.appendChild(csContainer)
    const csEditor = new PxtEditor()
    csEditor.mount(csContainer)

    // WHEN
    const labelEl = csContainer.querySelector<HTMLDivElement>('.pxt-editor-fallback-label')
    const textareaEl = csContainer.querySelector<HTMLTextAreaElement>(
      '.pxt-editor-fallback-textarea',
    )

    // THEN
    expect(labelEl!.textContent).toBe(i18next.t('pxt.fallback.label'))
    expect(textareaEl!.placeholder).toBe(i18next.t('pxt.fallback.placeholder'))

    csContainer.remove()
  })
})
