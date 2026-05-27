import { installSetEnabledTrap, applyHatBlockShape } from './hatBlockShape'
import { installPxtIframeTextI18n } from './pxtIframeTextI18n'
import { bootstrapPxtNativeLocale } from './pxtIframeNativeLocale'
import type { PxtLocale } from './pxtEditorLanguageNotice'

function buildPxtIframeSrc(lang: PxtLocale): string {
  const baseUrl = import.meta.env.BASE_URL ?? '/'
  return `${baseUrl}pxt-editor/index.html?lang=${lang}#controller=1`
}

export function createLocalizedPxtIframe(container: HTMLElement, lang: PxtLocale): HTMLIFrameElement {
  // Always emit ?lang=... so stale PXT_LANG cookie values cannot override app locale.
  document.cookie = `PXT_LANG=${lang}; path=/; SameSite=Lax`

  const iframe = document.createElement('iframe')
  iframe.className = 'pxt-editor-iframe'
  iframe.setAttribute('title', 'PXT Editor')
  iframe.src = buildPxtIframeSrc(lang)
  iframe.style.cssText = [
    'width: 100%',
    'height: 100%',
    'border: 0',
    'display: block',
  ].join(';')

  iframe.addEventListener('load', () => {
    const win = iframe.contentWindow
    // Kick off PXT's native localization download as early as possible so
    // Blockly can lay out blocks with the Czech strings from the start
    // (instead of measuring English and being patched after-the-fact).
    void bootstrapPxtNativeLocale(win, lang)
    installSetEnabledTrap(win)
    installPxtIframeTextI18n(win, lang)
    applyHatBlockShape((win as any)?.Blockly, (win as any)?.Blockly?.getMainWorkspace?.())
  })

  container.appendChild(iframe)
  return iframe
}

// Maps localized category names back to canonical English keys used in blockColors,
// so built-in PXT categories (which PXT translates via Crowdin) still pick up our
// bright theme color instead of falling back to PXT's desaturated row background.
const LOCALIZED_CATEGORY_TO_BLOCKCOLOR_KEY: Record<string, string> = {
  smyčky: 'loops',
  logika: 'logic',
  podmínky: 'logic',
  proměnné: 'variables',
  funkce: 'functions',
  události: 'events',
  stroje: 'machines',
  pásy: 'belts',
  akce: 'machines',
}

function applyCategoryColorStyles(doc: Document, iframeWin: Window | null): void {
  const blockColors: Record<string, string> = (iframeWin as any)?.pxt?.appTarget?.appTheme?.blockColors ?? {}
  const rows = Array.from(doc.querySelectorAll<HTMLElement>('.blocklyTreeRow'))
  for (const row of rows) {
    // Prefer PXT's own inline background-color (the desaturated variant it paints
    // on the row when coloredToolbox is enabled) so the row accent matches the
    // actual block headers in the flyout regardless of UI language.
    const inlineBg = row.style.backgroundColor.trim()
    if (inlineBg) {
      row.style.setProperty('--cat-color', inlineBg)
      continue
    }
    const icon = row.querySelector<HTMLElement>('.blocklyTreeIcon')
    const classKey = icon?.className.match(/blocklyTreeIcon(\w+)/)?.[1]?.toLowerCase() ?? ''
    const aria = row.getAttribute('aria-label') ?? ''
    const ariaKey = aria.replace(/^Toggle category\s+/i, '').trim().toLowerCase()
    const labelKey = row.querySelector<HTMLElement>('.blocklyTreeLabel')?.textContent?.trim()?.toLowerCase() ?? ''
    const csMappedAria = LOCALIZED_CATEGORY_TO_BLOCKCOLOR_KEY[ariaKey] ?? ''
    const csMappedLabel = LOCALIZED_CATEGORY_TO_BLOCKCOLOR_KEY[labelKey] ?? ''
    const color =
      blockColors[classKey] ??
      blockColors[ariaKey] ??
      blockColors[labelKey] ??
      blockColors[csMappedAria] ??
      blockColors[csMappedLabel]
    if (color) row.style.setProperty('--cat-color', color)
  }
}

export function stylePxtToolboxRows(
  iframe: HTMLIFrameElement,
  prevObserver: MutationObserver | null,
): MutationObserver | null {
  prevObserver?.disconnect()

  let doc: Document
  try {
    doc = iframe.contentWindow!.document
  } catch {
    return null
  }
  if (!doc.body) return null

  const win = iframe.contentWindow
  applyCategoryColorStyles(doc, win)

  const observer = new MutationObserver(() => applyCategoryColorStyles(doc, win))
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true })
  return observer
}
