/**
 * Installs Czech text localization inside the PXT iframe.
 *
 * This module only orchestrates installation timing and language gating.
 * Locale-dictionary loading/building and DOM/Blockly patching live in
 * dedicated helpers so the runtime behavior stays the same without keeping
 * the whole localization pipeline in one file.
 */

import { loadCsLocaleDicts, type StringMap } from './pxtIframeLocaleDicts'
import { createPxtIframeTextPatchers } from './pxtIframeTextPatchers'

// Keep bootstrap resilient after clean installs where PXT locale JSON files
// are absent; the runtime loader overlays richer dictionaries when available.
const CS_FALLBACK_CATEGORY_TRANSLATIONS: StringMap = {
  'Machines': 'Stroje',
  'Belts': 'Pásy',
  'Loops': 'Smyčky',
  'Logic': 'Logika',
  'Variables': 'Proměnné',
  'Functions': 'Funkce',
  'Events': 'Události',
}

// Block-text overrides remain as a safety net for race-windows where PXT
// already cached an English `message0` for a block before the native locale
// bootstrap in `pxtIframeNativeLocale.ts` populated
// `pxtc.apiLocalizationStrings`. In the from-start CS path the bootstrap
// usually wins and this map is a no-op; in the mid-session EN→CS toggle
// path Blockly may compile blocks against pre-bootstrap state and the
// patcher rewrites the visible text.
const CS_FALLBACK_BLOCK_TEXT_TRANSLATIONS: StringMap = {
  'start': 'spustit',
  'stop': 'zastavit',
  // Suppress the raw `%machine` placeholder token in the flyout so the
  // localized reporter block can render its own resolved label without
  // leaking the English placeholder. Translating this token to "stroj"
  // duplicates the reporter prefix.
  'machine': '',
  // factory_set_recipe: "set recipe of %machine to %recipe"
  'set recipe of': 'nastav recept',
  // factory_set_machine_speed: "set %machine speed to %speed"
  'set': 'nastav rychlost',
  'speed to': 'na',
  // factory_route_items_to: "route items of %machine to %sides"
  'route items of': 'přeprav zboží ze',
  // factory_route_current_item_to: "route current item of %machine to %side"
  'route current item of': 'přeprav aktuální zboží ze',
  'repeat': 'opakuj',
  'wait': 'počkej',
  'while': 'dokud',
  // 'on start' removed: PXT's native Czech locale now renders "při startu" via Crowdin.
}

const START_RETRY_MS = 100

/**
 * Install a translator inside the given PXT iframe content window.
 * No-op for English (the iframe already renders in EN). For Czech,
 * sets up a MutationObserver that rewrites matching text nodes as
 * Blockly renders / re-renders them.
 *
 * Idempotent: calling twice on the same window only installs once.
 */
export function installPxtIframeTextI18n(win: Window | null, lang: string): void {
  if (!win) return

  const mountLocale = lang.toLowerCase()
  const shouldPatchCs = (): boolean => mountLocale.startsWith('cs')
  const flagKey = '__rfPxtI18nInstalled'
  const w = win as Window & { [flagKey]?: boolean }
  if (w[flagKey]) return
  w[flagKey] = true

  let categoryDict: StringMap = { ...CS_FALLBACK_CATEGORY_TRANSLATIONS }
  let blockTextDict: StringMap = { ...CS_FALLBACK_BLOCK_TEXT_TRANSLATIONS }
  const { patchBlocklyMsg, sweep, tryPatch, tryPatchAria } = createPxtIframeTextPatchers(
    win,
    shouldPatchCs,
    () => categoryDict,
    () => blockTextDict,
  )
  const localeDictsPromise = shouldPatchCs()
    ? loadCsLocaleDicts(CS_FALLBACK_CATEGORY_TRANSLATIONS, CS_FALLBACK_BLOCK_TEXT_TRANSLATIONS)
    : null

  const start = (): void => {
    const doc = win.document
    if (!doc || !doc.body) {
      win.setTimeout(start, START_RETRY_MS)
      return
    }
    patchBlocklyMsg()
    sweep(doc.body)
    const MutationObserverCtor = (win as unknown as { MutationObserver: typeof MutationObserver }).MutationObserver
    const observer = new MutationObserverCtor((mutations: MutationRecord[]) => {
      for (const m of mutations) {
        if (m.type === 'characterData') {
          const parent = (m.target as Text).parentElement
          if (parent) tryPatch(parent)
        } else if (m.type === 'attributes' && m.attributeName === 'aria-label') {
          if (m.target.nodeType === 1) tryPatchAria(m.target as Element)
        } else {
          m.addedNodes.forEach((node: Node) => {
            if (node.nodeType !== 1) return
            const el = node as Element
            if (
              el.classList?.contains('blocklyTreeLabel') ||
              el.classList?.contains('blocklyText') ||
              el.classList?.contains('blocklyFlyoutLabelText')
            ) {
              tryPatch(el)
            }
            if (el.hasAttribute?.('aria-label')) tryPatchAria(el)
            if ('querySelectorAll' in el) sweep(el)
          })
        }
      }
    })
    observer.observe(doc.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label'],
    })

    // Load the authoritative CS dictionaries from the static locale assets.
    // If those files are absent, the emergency subset above keeps bootstrap
    // functional until the iframe can recover.
    void localeDictsPromise?.then((loaded) => {
      categoryDict = loaded.category
      blockTextDict = loaded.blockText
      patchBlocklyMsg()
      sweep(doc.body)
    })
  }
  start()
}
