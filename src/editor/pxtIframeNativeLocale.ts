/**
 * Force PXT's native localization pipeline to actually run for Czech.
 *
 * PXT skips its `updateLocalizationAsync` download whenever the requested
 * language already equals `pxt.Util.userLanguage()`. The PXT iframe boots
 * with `?lang=cs`, which sets userLanguage='cs' synchronously — so PXT
 * assumes Czech is the built-in language and never fetches the locale JSON.
 * That leaves `translationsCache()` empty, every `lf()` call returns the
 * English source, and Blockly measures/lays out blocks in English. Czech
 * text painted into the SVG afterwards then overflows.
 *
 * Workaround: at iframe load, temporarily flip userLanguage back to 'en'
 * and call `updateLocalizationAsync({code:'cs', force:true, ...})`. PXT
 * then downloads `/pxt-editor/locales/cs/strings.json` + `target-strings.json`
 * (Editor kind) and `bundled-strings.json` (Apis kind), populates both
 * `setLocalizedStrings` (used by `lf()`) and `pxtc.apiLocalizationStrings`
 * (used when compiling `//% block=` annotations to Blockly block defs).
 *
 * Block compilation runs after the workspacesync handshake, so as long as
 * our localization promise wins the race against compilation, blocks are
 * built with Czech strings from the start.
 */

import type { PxtLocale } from './pxtEditorLanguageNotice'

interface PxtUtilLike {
  userLanguage?: () => string
  setUserLanguage?: (code: string) => void
  setLocalizedStrings?: (map: Record<string, string>) => void
  getLocalizedStrings?: () => Record<string, string>
  updateLocalizationAsync?: (opts: {
    code: string
    force: boolean
    targetId: string
    baseUrl: string
    pxtBranch: string
    targetBranch: string
  }) => Promise<unknown>
  translationsCache?: () => Record<string, unknown>
}

interface PxtNamespaceLike {
  Util?: PxtUtilLike
  appTarget?: { id?: string }
}

interface IframeWindow extends Window {
  pxt?: PxtNamespaceLike
  pxtConfig?: { targetId?: string }
  pxtc?: { apiLocalizationStrings?: Record<string, string> }
}

const READY_POLL_MS = 50
const READY_POLL_MAX = 200 // 10s ceiling

// Vite injects BASE_URL ('/' in dev, '/robot-factory/' on GitHub Pages). The
// PXT iframe shares the host origin, so root-absolute `/pxt-editor/...` URLs
// would 404 on Pages.
function publicBase(): string {
  const b = (import.meta.env?.BASE_URL ?? '/') as string
  return b.endsWith('/') ? b : `${b}/`
}

/**
 * Maps each `symbolPath|block` key from our static `cs/strings.json` to the
 * raw English source string compiled into the block by PXT (from the
 * `//% block="..."` annotation in `pxt-target/libs/core/factory.ts`).
 *
 * PXT's `lf()` looks up English sources, not symbol paths — so without this
 * remap, the entries in `strings.json` never reach Blockly's measurement
 * pass and block widths are computed from the English text. The Czech
 * label painted afterwards then overflows the block edge.
 *
 * Keep this table in sync with the `//% block="..."` annotations.
 */
const SYMBOL_PATH_TO_ENGLISH_BLOCK: Record<string, string> = {
  'machines.startMachine': 'start %machine',
  'machines.stopMachine': 'stop %machine',
  'machines.setRecipe': 'set recipe of %machine to %recipe',
  'machines.setMachineSpeed': 'set %machine speed to %speed',
  'machines.routeItemsTo': 'route items of %machine to %sides',
  'machines.routeCurrentItemTo': 'route current item of %machine to %side',
  'machines.pickMachine': '%machine',
  'belts.setBeltSpeed': 'set %belt speed to %speed',
  'belts.pickBelt': '%belt',
  'loops.repeatTimes': 'repeat %count times',
  'loops.wait': 'wait %ms ms',
  'loops.waitTicks': 'wait %ticks ticks',
  'loops.whileCondition': 'while %condition',
  'logic.currentItemIsDefective': 'current item is defective',
  'logic.currentItemIs': 'current item is %partType',
  'events.onOrderReceived': 'on order received',
  'events.onBeltJam': 'on belt jam',
  'events.onMachineIdle': 'on %machine idle',
  'events.onItemArrives': 'on item arrives at %machine',
}

async function waitForPxtUtil(win: IframeWindow): Promise<PxtUtilLike | null> {
  for (let i = 0; i < READY_POLL_MAX; i++) {
    const util = win.pxt?.Util
    if (util && typeof util.updateLocalizationAsync === 'function') return util
    await new Promise<void>((resolve) => win.setTimeout(resolve, READY_POLL_MS))
  }
  return null
}

const INSTALLED_FLAG = '__rfPxtNativeLocaleInstalled'

export async function bootstrapPxtNativeLocale(
  win: Window | null,
  lang: PxtLocale,
): Promise<boolean> {
  if (!win) return false
  if (lang === 'en') return false
  const w = win as IframeWindow & { [INSTALLED_FLAG]?: boolean }
  if (w[INSTALLED_FLAG]) return true
  w[INSTALLED_FLAG] = true

  const util = await waitForPxtUtil(w)
  if (!util?.updateLocalizationAsync || !util.setUserLanguage) return false

  // Defeat the `code === userLanguage()` bail-out.
  util.setUserLanguage('en')

  const targetId = w.pxt?.appTarget?.id ?? w.pxtConfig?.targetId ?? 'robot-factory'
  const base = publicBase()
  try {
    await util.updateLocalizationAsync({
      code: lang,
      force: true,
      targetId,
      baseUrl: `${base}pxt-editor/`,
      pxtBranch: 'master',
      targetBranch: 'master',
    })
  } catch {
    // If the download fails (offline, missing file), fall back to the
    // DOM-text patcher that already runs in parallel.
    util.setUserLanguage(lang)
    return false
  }
  // updateLocalizationAsync sets userLanguage back to `lang` internally on
  // success. Be defensive in case PXT changes that.
  if (util.userLanguage?.() !== lang) util.setUserLanguage(lang)

  // PXT's native download populates English-source-keyed strings (Crowdin
  // bundle) but our project-specific block annotations are not on Crowdin.
  // Inject English→Czech mappings for our blocks so `lf("start %machine")`
  // resolves at Blockly's first measurement pass.
  await injectProjectBlockTranslations(w, util, lang)
  return true
}

async function injectProjectBlockTranslations(
  win: IframeWindow,
  util: PxtUtilLike,
  lang: PxtLocale,
): Promise<void> {
  if (typeof util.setLocalizedStrings !== 'function') return
  const fetchFn = (win as unknown as { fetch?: typeof fetch }).fetch
  if (typeof fetchFn !== 'function') return
  const base = publicBase()
  let dict: Record<string, unknown>
  try {
    let response = await fetchFn(`${base}pxt-editor/locales/${lang}/strings.json`)
    if (!response.ok) {
      // Fallback to the non-gitignored copy shipped under public/pxt-locales/.
      response = await fetchFn(`${base}pxt-locales/${lang}/strings.json`)
    }
    if (!response.ok) return
    dict = (await response.json()) as Record<string, unknown>
  } catch {
    return
  }
  const additions: Record<string, string> = {}
  const symbolPathDict: Record<string, string> = {}
  const blockMarker = '|block'
  const paramMarker = '|param|'
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== 'string') continue
    if (key.endsWith(blockMarker)) {
      symbolPathDict[key] = value
      const symbolPath = key.slice(0, -blockMarker.length)
      const englishSource = SYMBOL_PATH_TO_ENGLISH_BLOCK[symbolPath]
      if (englishSource) additions[englishSource] = value
      continue
    }
    const paramIdx = key.indexOf(paramMarker)
    if (paramIdx > 0) {
      // PXT compiles `//% block="... %paramName ..."` with the bare param
      // name as the lf() English source for the inline parameter-name
      // label that Blockly renders when a value input has no dropdown
      // options. Mirror the symbol-path entry into both dicts so:
      //   • apiLocalizationStrings carries the symbol-path form (used by
      //     PXT's localizeApisAsync when compiling block defs).
      //   • setLocalizedStrings carries the English-source form (used by
      //     lf() at Blockly's measurement pass).
      symbolPathDict[key] = value
      const paramName = key.slice(paramIdx + paramMarker.length)
      if (paramName) additions[paramName] = value
    }
  }
  if (Object.keys(additions).length === 0) return
  const existing = util.getLocalizedStrings?.() ?? {}
  util.setLocalizedStrings({ ...existing, ...additions })

  // Also seed `pxtc.apiLocalizationStrings` with the symbol-path-keyed dict
  // so PXT's `localizeApisAsync` translates block attributes (`message0`,
  // jsdoc, etc.) to Czech when the workspace compiles block definitions.
  // Our `public/pxt-editor/locales/cs/` ships only `strings.json` (no
  // `bundled-strings.json`), so PXT's own Apis download returns empty and
  // this is the only path that gets symbol-path translations into the
  // compiler.
  const pxtc = (win as IframeWindow).pxtc
  if (pxtc) {
    pxtc.apiLocalizationStrings = {
      ...(pxtc.apiLocalizationStrings ?? {}),
      ...symbolPathDict,
    }
  }

  // Build a flat {englishParamName -> czech} map for in-place label rewrites
  // (PXT auto-inserts a bare-param-name FieldLabel before any value input
  // whose message text is only that param — e.g. `factory_pick_belt`'s
  // `%belt` message produces `[FieldLabel("belt"), FieldDropdown(...)]`).
  // The label text is the literal English param name from the `//% block=`
  // annotation, not routed through `lf()`, so apiLocalizationStrings alone
  // does not fix it.
  const paramNameTranslations: Record<string, string> = {}
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== 'string') continue
    const paramIdx = key.indexOf(paramMarker)
    if (paramIdx > 0) {
      const paramName = key.slice(paramIdx + paramMarker.length)
      if (paramName) paramNameTranslations[paramName] = value
    }
  }
  installFieldLabelTranslator(win, paramNameTranslations)

  // Re-render blocks Blockly may have laid out before our injection. New
  // blocks built after this point will be born with Czech text.
  try {
    const Blockly = (win as unknown as { Blockly?: { getMainWorkspace?: () => unknown } }).Blockly
    const ws = Blockly?.getMainWorkspace?.() as
      | { getAllBlocks?: (ordered: boolean) => Array<{ render?: (b: boolean) => void }> }
      | undefined
    ws?.getAllBlocks?.(false).forEach((b) => b.render?.(false))
  } catch {
    /* defensive: Blockly may not be ready yet — future blocks will be Czech */
  }
}

/**
 * Patch `Blockly.FieldLabel.prototype.initView` so any nameless `FieldLabel`
 * whose stored value equals an English param name (e.g. `belt`, `machine`)
 * has its SVG text node rewritten to the Czech translation after the SVG
 * is built. This sidesteps the timing race where wrapping
 * `Blockly.Blocks[type].init` captures a stale pre-localization init
 * function — the prototype patch fires on every `FieldLabel` instance
 * Blockly ever creates, regardless of which init built the block.
 *
 * We only mutate the rendered SVG text, not `value_` or `getValue()`, so
 * any code reading the field's logical value continues to see the original
 * English param name.
 */
function installFieldLabelTranslator(
  win: IframeWindow,
  paramNameTranslations: Record<string, string>,
): void {
  if (Object.keys(paramNameTranslations).length === 0) return
  // Blockly may not yet be exposed on the iframe window — bootstrap runs
  // very early. Poll for `Blockly.FieldLabel.prototype` and apply the patch
  // once it appears. Future block flyout opens then pick it up.
  const FLAG = '__rfFieldLabelTranslated'
  const tryInstall = (): boolean => {
    const blockly = (win as unknown as { Blockly?: { FieldLabel?: { prototype?: Record<string, unknown> } } }).Blockly
    const proto = blockly?.FieldLabel?.prototype
    if (!proto) return false
    if ((proto as Record<string, unknown>)[FLAG]) return true
    // `getDisplayText_` is inherited from `Blockly.Field.prototype` and is
    // invoked by `Field.render_` to derive the SVG text node's content. By
    // installing an own override on `FieldLabel.prototype` we intercept
    // every render of every FieldLabel instance — without touching value_,
    // getValue(), or getText() semantics for other code paths.
    const fieldProto = Object.getPrototypeOf(proto) as Record<string, unknown>
    const baseGetDisplay = fieldProto?.getDisplayText_ as ((this: unknown) => string) | undefined
    ;(proto as Record<string, unknown>)[FLAG] = true
    proto.getDisplayText_ = function (this: { name?: string; value_?: unknown }): string {
      const original = typeof baseGetDisplay === 'function'
        ? String(baseGetDisplay.call(this) ?? '')
        : String((this as { value_?: unknown }).value_ ?? '')
      if (this.name) return original
      const translated = paramNameTranslations[original]
      return translated ?? original
    } as unknown as () => string
    return true
  }
  if (tryInstall()) return
  let attempts = 0
  const tick = (): void => {
    attempts += 1
    if (tryInstall()) return
    if (attempts >= READY_POLL_MAX) return
    win.setTimeout(tick, READY_POLL_MS)
  }
  win.setTimeout(tick, READY_POLL_MS)
}
