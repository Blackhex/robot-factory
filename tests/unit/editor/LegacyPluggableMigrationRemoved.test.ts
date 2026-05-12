import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const repoRoot = resolve(__dirname, '../../..')
const editorDir = resolve(repoRoot, 'src/editor')
const legacyModulePath = resolve(editorDir, 'legacyPluggableFlatten.ts')
const pxtEditorPath = resolve(editorDir, 'PxtEditor.ts')

const LEGACY_HELPER_NAMES = [
  'flattenLegacyPluggableSlots',
  'promoteInlinePluggableConsumer',
  'xmlContainsPluggableConsumer',
  'legacyPluggableFlatten',
] as const

const LEGACY_IMPORT_PATTERN = /from\s+['"]\.\/legacyPluggableFlatten['"]/

function listEditorTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listEditorTsFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('legacy pluggable-slot save-migration has been removed', () => {
  it('the src/editor/legacyPluggableFlatten.ts module file does not exist', () => {
    let exists = false
    try {
      statSync(legacyModulePath)
      exists = true
    } catch {
      exists = false
    }
    expect(
      exists,
      `Expected legacy migration module to be deleted, but it still exists at ${legacyModulePath}`,
    ).toBe(false)
  })

  it('PxtEditor.ts no longer imports anything from ./legacyPluggableFlatten', () => {
    const src = readFileSync(pxtEditorPath, 'utf8')
    expect(
      LEGACY_IMPORT_PATTERN.test(src),
      'PxtEditor.ts still has an `import ... from "./legacyPluggableFlatten"` line',
    ).toBe(false)
  })

  it('PxtEditor.ts no longer references the legacy migration helpers by name', () => {
    const src = readFileSync(pxtEditorPath, 'utf8')
    for (const name of LEGACY_HELPER_NAMES) {
      expect(
        src.includes(name),
        `PxtEditor.ts still references legacy helper "${name}"`,
      ).toBe(false)
    }
  })

  it('PxtEditor.ts no longer references the legacy synthetic input names RF_MACHINE_INPUT / RF_BELT_INPUT', () => {
    const src = readFileSync(pxtEditorPath, 'utf8')
    expect(
      src.includes('RF_MACHINE_INPUT'),
      'PxtEditor.ts still references legacy synthetic input name "RF_MACHINE_INPUT"',
    ).toBe(false)
    expect(
      src.includes('RF_BELT_INPUT'),
      'PxtEditor.ts still references legacy synthetic input name "RF_BELT_INPUT"',
    ).toBe(false)
  })

  it('no other src/editor file references the deleted legacyPluggableFlatten module', () => {
    const files = listEditorTsFiles(editorDir).filter((f) => f !== legacyModulePath)
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      expect(
        LEGACY_IMPORT_PATTERN.test(src),
        `${file} still imports from "./legacyPluggableFlatten"`,
      ).toBe(false)
      for (const name of LEGACY_HELPER_NAMES) {
        expect(
          src.includes(name),
          `${file} still references legacy helper "${name}"`,
        ).toBe(false)
      }
    }
  })
})
