/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initI18n, switchLanguage, i18next } from '../../../src/i18n/i18n'

const LANG_STORAGE_KEY = 'robot-factory.lang'

type NavigatorOverrides = {
  language?: string
  languages?: readonly string[]
}

const originalDescriptors = {
  language: Object.getOwnPropertyDescriptor(window.navigator, 'language'),
  languages: Object.getOwnPropertyDescriptor(window.navigator, 'languages'),
}

function stubNavigator(overrides: NavigatorOverrides): void {
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    get: () => overrides.language,
  })
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    get: () => overrides.languages,
  })
}

function restoreNavigator(): void {
  if (originalDescriptors.language) {
    Object.defineProperty(window.navigator, 'language', originalDescriptors.language)
  } else {
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      get: () => 'en-US',
    })
  }
  if (originalDescriptors.languages) {
    Object.defineProperty(window.navigator, 'languages', originalDescriptors.languages)
  } else {
    Object.defineProperty(window.navigator, 'languages', {
      configurable: true,
      get: () => ['en-US'],
    })
  }
}

beforeEach(() => {
  localStorage.clear()
  // Strip every `languageChanged` listener registered by previous initI18n
  // calls so persistence side-effects from one test do not leak into the
  // next.
  i18next.off('languageChanged')
})

afterEach(() => {
  restoreNavigator()
  localStorage.clear()
  i18next.off('languageChanged')
})

describe('initI18n() — browser language auto-detection', () => {
  it('picks cs when localStorage empty and navigator.language is cs-CZ', async () => {
    stubNavigator({ language: 'cs-CZ', languages: undefined })
    await initI18n()
    expect(i18next.language).toBe('cs')
  })

  it('picks cs when localStorage empty and navigator.languages is [cs-CZ, en-US]', async () => {
    stubNavigator({ language: 'cs-CZ', languages: ['cs-CZ', 'en-US'] })
    await initI18n()
    expect(i18next.language).toBe('cs')
  })

  it('falls back to en when localStorage empty and navigator.language is unsupported (de-DE)', async () => {
    stubNavigator({ language: 'de-DE', languages: undefined })
    await initI18n()
    expect(i18next.language).toBe('en')
  })

  it('skips unsupported and picks first supported when navigator.languages is [de-DE, cs-CZ]', async () => {
    stubNavigator({ language: 'de-DE', languages: ['de-DE', 'cs-CZ'] })
    await initI18n()
    expect(i18next.language).toBe('cs')
  })

  it('primary-subtag extraction is case-insensitive (CS-cz → cs)', async () => {
    stubNavigator({ language: 'CS-cz', languages: undefined })
    await initI18n()
    expect(i18next.language).toBe('cs')
  })
})

describe('initI18n() — stored value wins over browser detection', () => {
  it('uses stored cs when localStorage has cs and navigator.language is en-US', async () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'cs')
    stubNavigator({ language: 'en-US', languages: ['en-US'] })
    await initI18n()
    expect(i18next.language).toBe('cs')
  })

  it('uses stored cs when localStorage has cs and navigator.language is de-DE', async () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'cs')
    stubNavigator({ language: 'de-DE', languages: ['de-DE'] })
    await initI18n()
    expect(i18next.language).toBe('cs')
  })
})

describe('switchLanguage persistence', () => {
  it('persists to localStorage and is read back on the next initI18n call', async () => {
    stubNavigator({ language: 'en-US', languages: ['en-US'] })
    await initI18n()
    await switchLanguage('cs')
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('cs')

    // Fresh init with English browser must still pick cs from storage.
    i18next.off('languageChanged')
    stubNavigator({ language: 'en-US', languages: ['en-US'] })
    await initI18n()
    expect(i18next.language).toBe('cs')
  })
})
