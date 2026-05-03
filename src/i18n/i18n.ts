import i18next from 'i18next'
import en from '../locales/en.json'
import cs from '../locales/cs.json'

/**
 * Mirror the active i18next language onto `<html lang>` so accessibility
 * tools, CSS `:lang(...)` selectors, and screen readers stay in sync with
 * the UI language (UX requirement B2 / UX#8). No-ops outside the browser
 * (e.g. unit-test environments without a `document`).
 */
function syncHtmlLang(lang: string): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lang
  }
}

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
  syncHtmlLang(i18next.language)
  i18next.on('languageChanged', syncHtmlLang)
}

export function switchLanguage(lang: string): Promise<void> {
  return i18next.changeLanguage(lang).then(() => undefined)
}

export { i18next }

