import i18next from 'i18next'
import en from '../locales/en.json'
import cs from '../locales/cs.json'

export async function initI18n(): Promise<void> {
  await i18next.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      cs: { translation: cs },
    },
    interpolation: {
      escapeValue: false,
    },
  })
}

export function switchLanguage(lang: string): Promise<void> {
  return i18next.changeLanguage(lang).then(() => undefined)
}

export { i18next }
