import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const localesDir = join(here, '..', '..', '..', '..', 'src', 'locales')

const dicts = {
  en: JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8')),
  cs: JSON.parse(readFileSync(join(localesDir, 'cs.json'), 'utf-8')),
} as const

export type Lang = keyof typeof dicts

export function t(lang: Lang, key: string): string {
  let cur: unknown = dicts[lang]
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(part in (cur as Record<string, unknown>))) {
      throw new Error(`i18n key not found: ${lang}/${key}`)
    }
    cur = (cur as Record<string, unknown>)[part]
  }
  if (typeof cur !== 'string') {
    throw new Error(`i18n key not a string: ${lang}/${key}`)
  }
  return cur
}
