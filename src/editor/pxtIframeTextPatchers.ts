import type { StringMap } from './pxtIframeLocaleDicts'

const PATCHED_MARK = Symbol.for('rf.pxtI18nPatched')

function normalizeLookupKey(text: string): { key: string; hadNbsp: boolean } {
  const trimmed = text.trim()
  if (!trimmed.includes('\u00A0')) return { key: trimmed, hadNbsp: false }
  return { key: trimmed.replace(/\u00A0/g, ' '), hadNbsp: true }
}

function restoreNbspIfNeeded(value: string, hadNbsp: boolean): string {
  return hadNbsp ? value.replace(/ /g, '\u00A0') : value
}

export function createPxtIframeTextPatchers(
  win: Window,
  shouldPatchCs: () => boolean,
  getCategoryDict: () => StringMap,
  getBlockTextDict: () => StringMap,
): {
  patchBlocklyMsg: () => void
  sweep: (root: ParentNode) => void
  tryPatch: (el: Element) => void
  tryPatchAria: (el: Element) => void
} {
  const patchBlocklyMsg = (): void => {
    if (!shouldPatchCs()) return
    const Blockly = (win as any).Blockly
    const msg = Blockly?.Msg
    if (!msg) return

    const categoryDict = getCategoryDict()
    for (const [english, translated] of Object.entries(categoryDict)) {
      const key = `CATEGORY_${english.toUpperCase().replace(/\s+/g, '_')}`
      if (typeof msg[key] !== 'undefined') msg[key] = translated
    }

    const blockTextDict = getBlockTextDict()
    for (const [key, value] of Object.entries(blockTextDict)) {
      if (key.includes('|')) {
        msg[key] = value
      }
    }
  }

  const tryPatch = (el: Element): void => {
    if (!shouldPatchCs()) return
    if ((el as any)[PATCHED_MARK]) return

    const text = el.textContent ?? ''
    const normalizedWhitespace = text.replace(/\u00A0/g, ' ')
    if (normalizedWhitespace.trim().length === 0) {
      el.remove()
      return
    }

    const { key, hadNbsp } = normalizeLookupKey(text)
    const category = getCategoryDict()[key]
    const blockText = getBlockTextDict()[key]
    const translated = typeof category !== 'undefined' ? category : typeof blockText !== 'undefined' ? blockText : undefined
    if (typeof translated === 'undefined') return

    if (translated === '') {
      el.remove()
      return
    }

    el.textContent = restoreNbspIfNeeded(translated, hadNbsp)
    ;(el as any)[PATCHED_MARK] = true
  }

  const tryPatchAria = (el: Element): void => {
    if (!shouldPatchCs()) return
    const aria = el.getAttribute('aria-label')
    if (!aria || aria.trim().length === 0) return
    const { key, hadNbsp } = normalizeLookupKey(aria)
    const category = getCategoryDict()[key]
    const blockText = getBlockTextDict()[key]
    const translated = typeof category !== 'undefined' ? category : typeof blockText !== 'undefined' ? blockText : undefined
    if (typeof translated === 'undefined') return
    el.setAttribute('aria-label', restoreNbspIfNeeded(translated, hadNbsp))
  }

  const sweep = (root: ParentNode): void => {
    if (!shouldPatchCs()) return
    const selectors = '.blocklyTreeLabel, .blocklyText, .blocklyFlyoutLabelText'
    const elements = root.querySelectorAll(selectors)
    for (const el of Array.from(elements)) tryPatch(el)

    const ariaElements = root.querySelectorAll('[aria-label]')
    for (const el of Array.from(ariaElements)) tryPatchAria(el)
  }

  return { patchBlocklyMsg, sweep, tryPatch, tryPatchAria }
}
