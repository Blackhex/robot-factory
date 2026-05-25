import i18next from 'i18next'
import en from '../locales/en.json'
import cs from '../locales/cs.json'
import type { MachineType } from '../game/types'
import type { MachineNameGenerator } from '../game/Factory'

const LANG_STORAGE_KEY = 'robot-factory.lang'
const SUPPORTED_LANGS = ['en', 'cs'] as const

const MACHINE_LABEL_BY_LANG: Record<string, Record<string, string>> = {
  en: (en as { machines?: Record<string, string> }).machines ?? {},
  cs: (cs as { machines?: Record<string, string> }).machines ?? {},
}

/** Return the localized machine-type label for `lang` (defaults to active). */
export function getMachineTypeLabel(type: MachineType, lang?: string): string {
  const active = lang ?? i18next.language ?? 'en'
  const direct = MACHINE_LABEL_BY_LANG[active]?.[type]
  if (direct) return direct
  return MACHINE_LABEL_BY_LANG.en?.[type] ?? type
}

/**
 * Humanize a snake_case MachineType to a Pascal-case label, e.g.
 * `part_fabricator` → `PartFabricator`. The canonical default used by the
 * game registry when no i18n generator is wired (unit-test path).
 */
function humanizeMachineTypeNoSpace(type: MachineType): string {
  return type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

function humanizeMachineTypeSpaced(type: MachineType): string {
  return type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/**
 * All labels that count as "auto-generated" prefixes for `type`, across
 * every shipped language plus the legacy humanized formats. Used by the
 * auto-name recognizer so saves from any locale (or the historic spaced
 * format) re-localize cleanly.
 */
export function getAllKnownMachineLabels(type: MachineType): string[] {
  const labels = new Set<string>()
  for (const lang of SUPPORTED_LANGS) {
    const v = MACHINE_LABEL_BY_LANG[lang]?.[type]
    if (v) labels.add(v)
  }
  labels.add(humanizeMachineTypeNoSpace(type))
  labels.add(humanizeMachineTypeSpaced(type))
  return [...labels]
}

/**
 * i18n-backed default machine name generator: `<LocalizedLabel><N>` with no
 * space. Reads the active i18next language each call so wiring it once
 * keeps producing fresh labels after `languageChanged`.
 */
export const i18nMachineNameGenerator: MachineNameGenerator = (type, n) =>
  `${getMachineTypeLabel(type)}${n}`

function syncHtmlLang(lang: string): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lang
  }
}

function readStoredLang(): string | null {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_STORAGE_KEY) : null
    return stored && (SUPPORTED_LANGS as readonly string[]).includes(stored) ? stored : null
  } catch {
    return null
  }
}

function persistLang(lang: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LANG_STORAGE_KEY, lang)
    }
  } catch {
    // ignore quota / disabled storage
  }
}

export async function initI18n(): Promise<void> {
  await i18next.init({
    lng: readStoredLang() ?? 'en',
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
  i18next.on('languageChanged', (lang) => {
    syncHtmlLang(lang)
    persistLang(lang)
  })
}

export function switchLanguage(lang: string): Promise<void> {
  return i18next.changeLanguage(lang).then(() => undefined)
}

export { i18next }

