/**
 * @vitest-environment jsdom
 *
 * RED tests pinning the unified single+bundle export/import format.
 *
 * Spec under test (will fail until the GREEN agent updates SaveLoad.ts):
 *   - `exportToFile(save, name)` writes a 1-entry bundle envelope with a
 *     filename derived from the sanitized name.
 *   - `exportBundleToFile([entry])` (length 1) ALSO uses the sanitized
 *     entry name as the filename.
 *   - `exportBundleToFile([...])` (length !== 1) keeps `factory-bundle-<ts>.json`.
 *   - `importFromFile()` returns `{ name, save }` parsed from a 1-entry
 *     bundle file. Rejects 0- or 2-entry bundles.
 *   - `importFilesFromUser()` returns `{ name: string; save }[]` and
 *     REJECTS files that are a raw FactorySave (no `type: 'bundle'`).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  exportToFile,
  exportBundleToFile,
  importFromFile,
  importFilesFromUser,
} from '../../../src/utils/SaveLoad'
import type { FactorySave } from '../../../src/utils/SaveLoad'
import {
  installExportHarness,
  installImportHarness,
  type ExportHarness,
  type ImportHarness,
} from '../../_helpers/saveLoadHarness'

function makeFactorySave(overrides: Partial<FactorySave> = {}): FactorySave {
  return {
    version: 2,
    grid: [],
    belts: [],
    pxtWorkspace: '',
    ...overrides,
  }
}

// The post-GREEN signature of `exportToFile` takes a required `name`.
// Cast through `unknown` so this test file compiles against the current
// (pre-GREEN) one-arg signature.
type UnifiedExportToFile = (save: FactorySave, name: string) => void
const exportToFileUnified = exportToFile as unknown as UnifiedExportToFile

// The post-GREEN signature of `importFromFile` returns `{ name, save }`.
type UnifiedImportFromFile = () => Promise<{ name: string; save: FactorySave }>
const importFromFileUnified = importFromFile as unknown as UnifiedImportFromFile

describe('exportToFile(save, name) — unified single export', () => {
  let harness: ExportHarness

  beforeEach(() => {
    harness = installExportHarness()
  })

  afterEach(() => {
    harness.restore()
  })

  it('writes a bundle envelope { version: 1, type: "bundle", projects: [{ name, save }] }', async () => {
    const save = makeFactorySave({ pxtWorkspace: '<x/>' })

    exportToFileUnified(save, 'My Project')

    expect(harness.downloads).toHaveLength(1)
    const text = harness.downloads[0]!.jsonText
    const parsed = JSON.parse(text) as {
      version: number
      type: string
      projects: { name: string; save: FactorySave }[]
    }
    expect(parsed.version).toBe(1)
    expect(parsed.type).toBe('bundle')
    expect(parsed.projects).toHaveLength(1)
    expect(parsed.projects[0]!.name).toBe('My Project')
    expect(parsed.projects[0]!.save.pxtWorkspace).toBe('<x/>')
  })

  it('uses the sanitized name for the download filename: "My Project" → My-Project.json', () => {
    exportToFileUnified(makeFactorySave(), 'My Project')

    expect(harness.downloads).toHaveLength(1)
    expect(harness.downloads[0]!.download).toBe('My-Project.json')
  })

  it('sanitizes punctuation: "My Cool Factory!" → My-Cool-Factory.json', () => {
    exportToFileUnified(makeFactorySave(), 'My Cool Factory!')

    expect(harness.downloads).toHaveLength(1)
    expect(harness.downloads[0]!.download).toBe('My-Cool-Factory.json')
  })

  it('falls back to "factory.json" when the sanitized name is empty (whitespace only)', () => {
    exportToFileUnified(makeFactorySave(), '   ')

    expect(harness.downloads).toHaveLength(1)
    expect(harness.downloads[0]!.download).toBe('factory.json')
  })
})

describe('exportBundleToFile() — unified filename rules', () => {
  let harness: ExportHarness

  beforeEach(() => {
    harness = installExportHarness()
  })

  afterEach(() => {
    harness.restore()
  })

  it('with one entry uses the sanitized entry name as filename: A.json', () => {
    exportBundleToFile([{ name: 'A', save: makeFactorySave() }])

    expect(harness.downloads).toHaveLength(1)
    expect(harness.downloads[0]!.download).toBe('A.json')
  })

  it('with multiple entries uses /^factory-bundle-\\d+\\.json$/', () => {
    exportBundleToFile([
      { name: 'A', save: makeFactorySave() },
      { name: 'B', save: makeFactorySave() },
    ])

    expect(harness.downloads).toHaveLength(1)
    expect(harness.downloads[0]!.download).toMatch(/^factory-bundle-\d+\.json$/)
  })
})

describe('importFromFile() — unified single import', () => {
  let harness: ImportHarness

  beforeEach(() => {
    harness = installImportHarness()
  })

  afterEach(() => {
    harness.restore()
  })

  it('returns { name, save } from a single-entry bundle file', async () => {
    const bundle = {
      version: 1,
      type: 'bundle',
      projects: [{ name: 'Hello', save: makeFactorySave({ pxtWorkspace: '<h/>' }) }],
    }
    await harness.fire(JSON.stringify(bundle))

    const result = await importFromFileUnified()

    expect(result.name).toBe('Hello')
    expect(result.save.pxtWorkspace).toBe('<h/>')
  })

  it('rejects a 0-entry bundle file', async () => {
    const bundle = { version: 1, type: 'bundle', projects: [] }
    await harness.fire(JSON.stringify(bundle))

    await expect(importFromFile()).rejects.toThrow()
  })

  it('rejects a 2-entry bundle file', async () => {
    const bundle = {
      version: 1,
      type: 'bundle',
      projects: [
        { name: 'A', save: makeFactorySave() },
        { name: 'B', save: makeFactorySave() },
      ],
    }
    await harness.fire(JSON.stringify(bundle))

    await expect(importFromFile()).rejects.toThrow()
  })
})

describe('importFilesFromUser() — bundle-only contract', () => {
  let harness: ImportHarness

  beforeEach(() => {
    harness = installImportHarness()
  })

  afterEach(() => {
    harness.restore()
  })

  it('rejects a raw FactorySave file (no type: "bundle" envelope)', async () => {
    const save = makeFactorySave({ pxtWorkspace: '<raw/>' })
    await harness.fire(JSON.stringify(save))

    await expect(importFilesFromUser()).rejects.toThrow()
  })

  it('returns entries whose name is a non-null string from a bundle file', async () => {
    const bundle = {
      version: 1,
      type: 'bundle',
      projects: [{ name: 'Hello', save: makeFactorySave({ pxtWorkspace: '<h/>' }) }],
    }
    await harness.fire(JSON.stringify(bundle))

    const entries = await importFilesFromUser()

    expect(entries).toHaveLength(1)
    expect(entries[0]!.name).toBe('Hello')
    expect(entries[0]!.save.pxtWorkspace).toBe('<h/>')
  })
})
