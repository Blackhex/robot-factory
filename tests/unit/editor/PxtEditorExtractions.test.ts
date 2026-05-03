/**
 * @vitest-environment jsdom
 *
 * Pinning tests for the first B-3 sub-extraction:
 *   Move the fallback `<textarea>` editor (the rescue UI shown when the PXT
 *   iframe doesn't respond) out of `PxtEditor` and into a dedicated
 *   `PxtFallbackEditor` class.
 *
 * Today (before the refactor):
 *   - `src/editor/PxtFallbackEditor.ts` does not exist.
 *   - `src/editor/PxtEditor.ts` declares `fallbackEl: HTMLDivElement` and
 *     `fallbackTextarea: HTMLTextAreaElement` directly and constructs them
 *     inline in `mount()`.
 *   - `src/editor/PxtEditor.ts` is ~1112 lines.
 *
 * After the refactor (these tests should turn green):
 *   - `src/editor/PxtFallbackEditor.ts` exports a `PxtFallbackEditor` class
 *     with `getValue`, `setValue`, `show`, `hide`, `dispose`.
 *   - `src/editor/PxtEditor.ts` no longer declares the raw fallback DOM
 *     fields and instead delegates to `PxtFallbackEditor`.
 *   - `src/editor/PxtEditor.ts` is strictly less than 1100 lines.
 *
 * Behavioral preservation is covered by the existing
 * `tests/unit/editor/PxtEditorFallback.test.ts` suite (7 tests, locale
 * coverage + DOM rendering). The implementer MUST NOT modify that file —
 * those tests must continue to pass after this extraction.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(__dirname, '..', '..', '..')
const PXT_EDITOR_PATH = join(REPO_ROOT, 'src', 'editor', 'PxtEditor.ts')
const PXT_FALLBACK_EDITOR_PATH = join(
  REPO_ROOT,
  'src',
  'editor',
  'PxtFallbackEditor.ts',
)
const PXT_TOOLBOX_OVERRIDES_CSS_PATH = join(
  REPO_ROOT,
  'src',
  'editor',
  'pxt-toolbox-overrides.css',
)

function readSource(path: string): string {
  return readFileSync(path, 'utf-8')
}

describe('B-3 sub-extraction: PxtFallbackEditor', () => {
  describe('new module exists', () => {
    it('src/editor/PxtFallbackEditor.ts file exists on disk', () => {
      expect(
        existsSync(PXT_FALLBACK_EDITOR_PATH),
        `Expected new module at ${PXT_FALLBACK_EDITOR_PATH} but file is missing.`,
      ).toBe(true)
    })

    it('exports a PxtFallbackEditor class with the documented public surface', async () => {
      // Skip the dynamic import if the file is missing, so the failure
      // message comes from the existence test above instead of a confusing
      // module-resolution error.
      if (!existsSync(PXT_FALLBACK_EDITOR_PATH)) {
        throw new Error(
          'src/editor/PxtFallbackEditor.ts does not exist — see the existence test for details.',
        )
      }

      // Build the specifier at runtime so Vite's static import analysis
      // cannot fail the whole suite when the module is absent.
      const specifier = '../../../src/editor/PxtFallbackEditor.ts'
      const mod = (await import(/* @vite-ignore */ specifier)) as Record<
        string,
        unknown
      >
      const PxtFallbackEditor = mod.PxtFallbackEditor

      expect(typeof PxtFallbackEditor).toBe('function')

      const proto = (PxtFallbackEditor as { prototype: Record<string, unknown> })
        .prototype
      for (const method of ['getValue', 'setValue', 'show', 'hide', 'dispose']) {
        expect(
          typeof proto[method],
          `PxtFallbackEditor.prototype.${method} should be a function`,
        ).toBe('function')
      }
    })
  })

  describe('PxtEditor.ts source no longer owns the fallback DOM', () => {
    it('does not declare a raw fallbackTextarea: HTMLTextAreaElement field', () => {
      const source = readSource(PXT_EDITOR_PATH)
      expect(source).not.toMatch(/fallbackTextarea\s*:\s*HTMLTextAreaElement/)
    })

    it('does not declare a raw fallbackEl: HTMLDivElement field', () => {
      const source = readSource(PXT_EDITOR_PATH)
      expect(source).not.toMatch(/fallbackEl\s*:\s*HTMLDivElement/)
    })

    it('references the new PxtFallbackEditor class by name', () => {
      const source = readSource(PXT_EDITOR_PATH)
      expect(source).toContain('PxtFallbackEditor')
    })
  })

  describe('PxtEditor.ts size budget', () => {
    it('is strictly less than 1100 lines after the extraction', () => {
      const source = readSource(PXT_EDITOR_PATH)
      const lineCount = source.split('\n').length
      expect(
        lineCount,
        `PxtEditor.ts is ${lineCount} lines; the B-3 sub-extraction requires < 1100.`,
      ).toBeLessThan(1100)
    })
  })
})

/**
 * Pinning tests for the second B-3 sub-extraction:
 *   Move the ~80-line CSS template literal in
 *   `PxtEditor.injectToolboxStyles` into a separate `.css` file imported as
 *   `?raw` and injected via `style.textContent = toolboxOverridesCss`.
 *
 * Today (before the refactor):
 *   - `src/editor/pxt-toolbox-overrides.css` does not exist.
 *   - `PxtEditor.injectToolboxStyles` contains an inline ~80-line template
 *     literal with all the dark-theme + toolbox-row CSS rules.
 *   - `src/editor/PxtEditor.ts` is ~1006 lines.
 *
 * After the refactor (these tests should turn green):
 *   - `src/editor/pxt-toolbox-overrides.css` exists and contains the
 *     toolbox / dark-theme CSS rules.
 *   - `PxtEditor.ts` imports the CSS as a raw string via the Vite
 *     `?raw` query: `import toolboxOverridesCss from
 *     './pxt-toolbox-overrides.css?raw'`.
 *   - `injectToolboxStyles()` body is short (≤ 12 lines between its
 *     opening and matching closing braces): get iframe doc, create style
 *     element, set `style.textContent = toolboxOverridesCss`, append.
 *   - `src/editor/PxtEditor.ts` is strictly less than 950 lines.
 *
 * Behavioral preservation: the CSS shipped to the iframe must remain
 * identical (whitespace-insensitive). That property is not asserted here
 * directly — these tests only pin the structural extraction. Existing
 * Playwright coverage of the toolbox dark theme guards the runtime
 * appearance.
 */
describe('B-3 sub-extraction 2: toolbox CSS file', () => {
  describe('new CSS file exists', () => {
    it('src/editor/pxt-toolbox-overrides.css file exists on disk', () => {
      expect(
        existsSync(PXT_TOOLBOX_OVERRIDES_CSS_PATH),
        `Expected new CSS file at ${PXT_TOOLBOX_OVERRIDES_CSS_PATH} but file is missing.`,
      ).toBe(true)
    })

    it('CSS file contains the expected toolbox + theme rules', () => {
      if (!existsSync(PXT_TOOLBOX_OVERRIDES_CSS_PATH)) {
        throw new Error(
          'src/editor/pxt-toolbox-overrides.css does not exist — see the existence test for details.',
        )
      }
      const css = readSource(PXT_TOOLBOX_OVERRIDES_CSS_PATH)
      expect(
        css,
        'CSS file should contain the .blocklyToolboxDiv selector',
      ).toContain('.blocklyToolboxDiv')
      expect(
        css,
        'CSS file should contain the .blocklyTreeRow selector',
      ).toContain('.blocklyTreeRow')
      expect(
        css,
        'CSS file should contain the --cat-color CSS custom property',
      ).toContain('--cat-color')
    })
  })

  describe('PxtEditor.ts source no longer owns the CSS literal', () => {
    it('imports the CSS file as a raw string via the ?raw Vite query', () => {
      const source = readSource(PXT_EDITOR_PATH)
      expect(source).toContain("from './pxt-toolbox-overrides.css?raw'")
    })

    it('injectToolboxStyles() body is ≤ 12 lines (CSS literal extracted)', () => {
      const source = readSource(PXT_EDITOR_PATH)
      const methodMatch = source.match(
        /injectToolboxStyles\s*\([^)]*\)\s*:\s*\w+\s*\{/,
      )
      expect(
        methodMatch,
        'Could not locate injectToolboxStyles() method declaration in PxtEditor.ts',
      ).not.toBeNull()

      // Walk the source from the opening `{` of the method body and find
      // the matching closing `}` by tracking brace depth. Skip braces
      // inside string literals and template literals so we don't get
      // confused by the (now-removed) CSS template literal or any
      // remaining string content.
      const openIndex = source.indexOf('{', methodMatch!.index!)
      expect(openIndex).toBeGreaterThan(-1)

      let depth = 1
      let i = openIndex + 1
      let inSingle = false
      let inDouble = false
      let inTemplate = false
      let inLineComment = false
      let inBlockComment = false
      while (i < source.length && depth > 0) {
        const ch = source[i]
        const next = source[i + 1]
        if (inLineComment) {
          if (ch === '\n') inLineComment = false
        } else if (inBlockComment) {
          if (ch === '*' && next === '/') {
            inBlockComment = false
            i++
          }
        } else if (inSingle) {
          if (ch === '\\') i++
          else if (ch === "'") inSingle = false
        } else if (inDouble) {
          if (ch === '\\') i++
          else if (ch === '"') inDouble = false
        } else if (inTemplate) {
          if (ch === '\\') i++
          else if (ch === '`') inTemplate = false
        } else {
          if (ch === '/' && next === '/') {
            inLineComment = true
            i++
          } else if (ch === '/' && next === '*') {
            inBlockComment = true
            i++
          } else if (ch === "'") inSingle = true
          else if (ch === '"') inDouble = true
          else if (ch === '`') inTemplate = true
          else if (ch === '{') depth++
          else if (ch === '}') depth--
        }
        i++
      }
      expect(depth, 'Failed to find matching closing brace of injectToolboxStyles()').toBe(0)

      const closeIndex = i - 1
      const body = source.slice(openIndex + 1, closeIndex)
      const bodyLineCount = body.split('\n').length
      expect(
        bodyLineCount,
        `injectToolboxStyles() body is ${bodyLineCount} lines; expected ≤ 12 once the CSS literal is moved out.`,
      ).toBeLessThanOrEqual(12)
    })
  })

  describe('PxtEditor.ts size budget (post-CSS-extraction)', () => {
    it('is strictly less than 950 lines after the CSS extraction', () => {
      const source = readSource(PXT_EDITOR_PATH)
      const lineCount = source.split('\n').length
      expect(
        lineCount,
        `PxtEditor.ts is ${lineCount} lines; the B-3 CSS sub-extraction requires < 950.`,
      ).toBeLessThan(950)
    })
  })
})
