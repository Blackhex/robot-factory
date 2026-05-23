/**
 * Runtime hook that hides the auto-rendered PXT `splitters` toolbox
 * category when the current level is below 4.
 *
 * **Why this exists**: PXT auto-renders every namespace present in the
 * compiled `apiInfo.byQName` map as a top-level toolbox category. The
 * Splitters category should only appear at level >= 4, but the bundled
 * PXT controller has no `setToolboxDefinition` action and no built-in
 * per-level filter. We patch the BlocksEditor instance at runtime
 * (exposed as `window.__rfBlocksEditor` by `update-build-artifacts.cjs`)
 * to make `getNamespaceAttrs('splitters')` return `undefined` when the
 * current level is below the minimum, then re-render the toolbox.
 *
 * The function is pure (no `PxtEditor` dependency) so it can be unit-
 * tested against a stub iframe / editor object.
 */

export const SPLITTERS_MIN_LEVEL = 4

/**
 * Apply the splitters-namespace gate to the BlocksEditor exposed at
 * `iframe.contentWindow.__rfBlocksEditor`, then trigger a toolbox
 * refresh so the change takes effect. Idempotent: the
 * `getNamespaceAttrs` wrapper is installed on the first call and
 * re-reads the level from a per-editor field on every subsequent call.
 * Safe to invoke when the editor handle is missing (no-op).
 */
export function applySplittersGate(
  iframe: { contentWindow?: any } | null,
  currentLevel: number,
  minLevel: number = SPLITTERS_MIN_LEVEL,
): void {
  const editor = (iframe?.contentWindow as any)?.__rfBlocksEditor
  if (!editor || typeof editor.getNamespaceAttrs !== 'function') return
  editor.__rfSplittersLevel = currentLevel
  if (!editor.__rfSplittersGate) {
    const orig = editor.getNamespaceAttrs.bind(editor)
    editor.getNamespaceAttrs = (ns: string) => {
      if (ns === 'splitters' && (editor.__rfSplittersLevel ?? 0) < minLevel) {
        return undefined
      }
      return orig(ns)
    }
    editor.__rfSplittersGate = true
  }
  if (typeof editor.refreshToolbox === 'function') {
    editor.refreshToolbox()
  }
}
