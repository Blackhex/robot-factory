import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Source-level / build-artifact guards for the complete removal of the
 * `factory_if_item_type` PXT block (function `logic.ifItemType` /
 * `factory.ifItemType`).
 *
 * The block was a no-op stub that ignored its `itemType` argument and
 * always ran its body. It is removed entirely; the standard `if/else`
 * block combined with the existing `factory_current_item_is` predicate
 * covers the same expressive power without misleading the player.
 *
 * These tests assert absence of every trace of the block:
 *   1. The PXT library source (`factory.ts`) does not declare it.
 *   2. The locale strings file does not provide a label for it.
 *   3. The compiled target metadata under `pxt-target/built/` does not
 *      reference the block id, the qualified name, or the function
 *      declaration.
 *   4. The editor-served copy under `public/pxt-editor/` (regenerated
 *      from `pxt-target/built/` by `scripts/update-build-artifacts.cjs`)
 *      does not reference any of the above either.
 */

const REPO_ROOT = resolve(__dirname, '../../..')

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8')
}

describe('factory_if_item_type removal — PXT library source', () => {
  it('pxt-target/libs/core/factory.ts does not declare ifItemType', () => {
    const source = readRepoFile('pxt-target/libs/core/factory.ts')
    expect(source).not.toContain('factory_if_item_type')
    expect(source).not.toMatch(/\bexport\s+function\s+ifItemType\b/)
  })

  it('pxt-target/libs/core/_locales/core-strings.json does not declare a label for logic.ifItemType', () => {
    const source = readRepoFile(
      'pxt-target/libs/core/_locales/core-strings.json',
    )
    expect(source).not.toContain('logic.ifItemType')
    expect(source).not.toContain('factory_if_item_type')
  })
})

describe('factory_if_item_type removal — built target metadata', () => {
  // Files regenerated from the PXT library source. After the source
  // declaration is removed and the build artifacts script is rerun,
  // none of these may contain any reference to the removed block.
  const BUILT_ARTIFACTS = [
    'pxt-target/built/target.json',
    'pxt-target/built/target.js',
    'public/pxt-editor/target.json',
    'public/pxt-editor/target.js',
  ] as const

  for (const relPath of BUILT_ARTIFACTS) {
    describe(relPath, () => {
      it('does not contain the block id "factory_if_item_type"', () => {
        const source = readRepoFile(relPath)
        expect(
          source.includes('factory_if_item_type'),
          `${relPath} still references the removed block id ` +
            `"factory_if_item_type". Rerun the build artifacts script ` +
            `after removing the declaration from factory.ts.`,
        ).toBe(false)
      })

      it('does not contain the qualified name "logic.ifItemType"', () => {
        const source = readRepoFile(relPath)
        expect(
          source.includes('logic.ifItemType'),
          `${relPath} still references the removed function ` +
            `"logic.ifItemType". Rerun the build artifacts script ` +
            `after removing the declaration from factory.ts.`,
        ).toBe(false)
      })
    })
  }
})

describe('factory_if_item_type removal — app locales', () => {
  for (const relPath of ['src/locales/en.json', 'src/locales/cs.json'] as const) {
    it(`${relPath} has no orphan if_item_type / if_item_type_tooltip keys`, () => {
      const blocks = JSON.parse(readRepoFile(relPath)).blocks ?? {}
      expect(blocks.if_item_type).toBeUndefined()
      expect(blocks.if_item_type_tooltip).toBeUndefined()
    })
  }
})
