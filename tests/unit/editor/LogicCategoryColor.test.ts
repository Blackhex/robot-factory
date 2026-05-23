import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// UX review proved that PXT's built-in Logic blocks render at the exact hex
// `#cccc44` (via `Blockly.Msg.LOGIC_HUE` in our skin). To make our
// `currentItemIsDefective` / `currentItemIs` predicates blend with the
// built-in if/else and comparison blocks, both the `logic` namespace AND
// each individual predicate block must carry that exact hex. The previous
// namespace-only patch (hue 210) shipped green tests but failed the UX
// review — hence the per-block assertions below.
const EXPECTED_LOGIC_COLOR = '#cccc44'

const repoRoot = resolve(__dirname, '..', '..', '..')

function readRepoFile(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), 'utf8')
}

describe(`Logic category color is ${EXPECTED_LOGIC_COLOR} (matches PXT built-in Logic blocks)`, () => {
  describe('source of truth', () => {
    it(`pxt-target/libs/core/factory.ts: logic namespace declares color="${EXPECTED_LOGIC_COLOR}"`, () => {
      const source = readRepoFile('pxt-target/libs/core/factory.ts')

      const namespaceIdx = source.search(/namespace\s+logic\s*\{/)
      expect(namespaceIdx, 'expected to find `namespace logic {` in factory.ts').toBeGreaterThan(-1)

      const before = source.slice(0, namespaceIdx)
      // Accept either bare numeric hue (`color=210`) or quoted hex
      // (`color="#cccc44"`). The test then enforces the hex form.
      const colorMatches = [...before.matchAll(/\/\/%\s*color=("?)([^\s"]+)\1/g)]
      expect(
        colorMatches.length,
        'expected at least one //% color= attribute before the logic namespace',
      ).toBeGreaterThan(0)

      const lastColor = colorMatches[colorMatches.length - 1][2]
      expect(lastColor).toBe(EXPECTED_LOGIC_COLOR)
    })

    it(`src/editor/FactoryToolbox.ts: CATEGORY_COLOURS.conditionals is "${EXPECTED_LOGIC_COLOR}"`, () => {
      const source = readRepoFile('src/editor/FactoryToolbox.ts')
      const match = source.match(/conditionals:\s*'([^']+)'/)
      expect(
        match,
        "expected to find `conditionals: '<value>'` in CATEGORY_COLOURS",
      ).not.toBeNull()
      expect(match![1]).toBe(EXPECTED_LOGIC_COLOR)
    })
  })

  describe('built artifacts reflect the same color on the logic namespace AND each predicate block', () => {
    const jsonArtifacts = [
      'pxt-target/built/target.json',
      'public/pxt-editor/target.json',
    ] as const

    for (const rel of jsonArtifacts) {
      it(`${rel}: logic namespace metadata color is "${EXPECTED_LOGIC_COLOR}"`, () => {
        const bundle = JSON.parse(readRepoFile(rel))
        const logicAttrs = findLogicNamespaceAttrs(bundle)
        expect(
          logicAttrs,
          `expected to find a logic namespace entry with attributes.color in ${rel}`,
        ).not.toBeNull()
        expect(logicAttrs!.color).toBe(EXPECTED_LOGIC_COLOR)
      })

      for (const qname of ['logic.currentItemIsDefective', 'logic.currentItemIs'] as const) {
        it(`${rel}: byQName["${qname}"].attributes.color is "${EXPECTED_LOGIC_COLOR}"`, () => {
          const bundle = JSON.parse(readRepoFile(rel))
          const attrs = findByQNameAttrs(bundle, qname)
          expect(
            attrs,
            `expected to find byQName entry "${qname}" with attributes in ${rel}`,
          ).not.toBeNull()
          expect(attrs!.color).toBe(EXPECTED_LOGIC_COLOR)
        })
      }
    }

    const jsArtifacts = [
      'pxt-target/built/target.js',
      'public/pxt-editor/target.js',
    ] as const

    for (const rel of jsArtifacts) {
      it(`${rel}: logic namespace block carries color "${EXPECTED_LOGIC_COLOR}"`, () => {
        const text = readRepoFile(rel)
        const color = findColorNear(text, /"logic"\s*:\s*\{[\s\S]{0,2000}?"block"\s*:\s*"Logic"/g)
        expect(color, `expected to find color near logic namespace in ${rel}`).not.toBeNull()
        expect(color).toBe(EXPECTED_LOGIC_COLOR)
      })

      for (const qname of ['logic.currentItemIsDefective', 'logic.currentItemIs'] as const) {
        it(`${rel}: per-block entry "${qname}" carries color "${EXPECTED_LOGIC_COLOR}"`, () => {
          const text = readRepoFile(rel)
          // Anchor on the qname key, walk forward until we hit the start of
          // its `attributes` body, then scan the next window for the color.
          const escaped = qname.replace(/\./g, '\\.')
          const re = new RegExp(
            `"${escaped}"\\s*:\\s*\\{[\\s\\S]{0,2000}?"attributes"\\s*:\\s*\\{`,
            'g',
          )
          const color = findColorNear(text, re)
          expect(
            color,
            `expected to find a "color" attribute inside the "${qname}" block in ${rel}. ` +
              `If color is missing entirely, the block inherits PXT's default and will NOT ` +
              `render as ${EXPECTED_LOGIC_COLOR} in the editor.`,
          ).not.toBeNull()
          expect(color).toBe(EXPECTED_LOGIC_COLOR)
        })
      }
    }
  })
})

/** Recursively walk `obj` looking for a key `"logic"` whose value has
 *  `attributes.block === "Logic"`, return that attributes object. */
function findLogicNamespaceAttrs(obj: unknown): { color?: string } | null {
  if (obj === null || typeof obj !== 'object') return null

  const record = obj as Record<string, unknown>
  for (const [key, value] of Object.entries(record)) {
    if (
      key === 'logic' &&
      value !== null &&
      typeof value === 'object' &&
      'attributes' in (value as Record<string, unknown>)
    ) {
      const attrs = (value as { attributes?: { block?: string; color?: string } }).attributes
      if (attrs && attrs.block === 'Logic') {
        return attrs
      }
    }
    const nested = findLogicNamespaceAttrs(value)
    if (nested) return nested
  }
  return null
}

/** Recursively walk `obj` looking for a key equal to `qname` whose value has
 *  an `attributes` object; return that attributes object. */
function findByQNameAttrs(obj: unknown, qname: string): { color?: string } | null {
  if (obj === null || typeof obj !== 'object') return null

  const record = obj as Record<string, unknown>
  for (const [key, value] of Object.entries(record)) {
    if (
      key === qname &&
      value !== null &&
      typeof value === 'object' &&
      'attributes' in (value as Record<string, unknown>)
    ) {
      return (value as { attributes?: { color?: string } }).attributes ?? null
    }
    const nested = findByQNameAttrs(value, qname)
    if (nested) return nested
  }
  return null
}

/** Find the first `"color": "<value>"` occurring within ~500 chars after
 *  the end of the first match of `anchorRe` in `text`. Returns the captured
 *  value or null if no color attribute is found in the window. */
function findColorNear(text: string, anchorRe: RegExp): string | null {
  const match = anchorRe.exec(text)
  if (!match) return null
  const start = match.index
  const end = Math.min(text.length, anchorRe.lastIndex + 500)
  const window = text.slice(start, end)
  const colorMatch = window.match(/"color"\s*:\s*"([^"]+)"/)
  return colorMatch ? colorMatch[1] : null
}
