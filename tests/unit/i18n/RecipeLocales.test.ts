import { describe, it, expect, beforeAll } from 'vitest'
import i18next from 'i18next'
import en from '../../../src/locales/en.json'
import cs from '../../../src/locales/cs.json'
import { getAllRecipes } from '../../../src/game/Recipe'

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: { translation: en },
        cs: { translation: cs },
      },
      interpolation: { escapeValue: false },
    })
  }
})

describe('locales: every recipe has a display name in en and cs', () => {
  for (const lang of ['en', 'cs'] as const) {
    it(`recipes.<id> exists for every recipe in ${lang}`, async () => {
      await i18next.changeLanguage(lang)
      const missing: string[] = []
      for (const recipe of getAllRecipes()) {
        const key = `recipes.${recipe.id}`
        if (!i18next.exists(key)) missing.push(key)
      }
      expect(missing, `Missing ${lang} keys: ${missing.join(', ')}`).toEqual([])
    })
  }
})
