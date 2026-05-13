/**
 * @vitest-environment jsdom
 *
 * Contract tests for the bundled multi-import/export helpers.
 *
 * RED: these tests reference helpers that do not yet exist on
 * src/utils/SaveLoad.ts (`exportBundleToFile`, `importFilesFromUser`).
 * They will fail to compile / import until the GREEN agent adds them.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  exportBundleToFile,
  importFilesFromUser,
} from '../../../src/utils/SaveLoad'
import type { FactorySave } from '../../../src/utils/SaveLoad'
import {
  installExportHarness,
  installImportHarness,
  type CapturedDownload,
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

function readDownloadText(d: CapturedDownload): string {
  return d.jsonText
}

describe('exportBundleToFile()', () => {
  let harness: ExportHarness

  beforeEach(() => {
    harness = installExportHarness()
  })

  afterEach(() => {
    harness.restore()
  })

  it('writes a JSON bundle with shape { version: 1, type: "bundle", projects: [...] }', async () => {
    const a = makeFactorySave({ pxtWorkspace: '<a/>' })
    const b = makeFactorySave({ pxtWorkspace: '<b/>' })

    exportBundleToFile([
      { name: 'Alpha', save: a },
      { name: 'Beta', save: b },
    ])

    expect(harness.downloads).toHaveLength(1)
    const text = await readDownloadText(harness.downloads[0]!)
    const parsed = JSON.parse(text) as {
      version: number
      type: string
      projects: { name: string; save: FactorySave }[]
    }
    expect(parsed.version).toBe(1)
    expect(parsed.type).toBe('bundle')
    expect(Array.isArray(parsed.projects)).toBe(true)
    expect(parsed.projects).toHaveLength(2)
    expect(parsed.projects[0]!.name).toBe('Alpha')
    expect(parsed.projects[0]!.save.pxtWorkspace).toBe('<a/>')
    expect(parsed.projects[1]!.name).toBe('Beta')
    expect(parsed.projects[1]!.save.pxtWorkspace).toBe('<b/>')
  })

  it('filename for a single-entry bundle uses the sanitized entry name and ends with ".json"', () => {
    exportBundleToFile([{ name: 'Solo', save: makeFactorySave() }])

    expect(harness.downloads).toHaveLength(1)
    const filename = harness.downloads[0]!.download
    expect(filename).toBe('Solo.json')
  })

  it('filename for a multi-entry bundle starts with "factory-bundle-" and ends with ".json"', () => {
    exportBundleToFile([
      { name: 'A', save: makeFactorySave() },
      { name: 'B', save: makeFactorySave() },
    ])

    expect(harness.downloads).toHaveLength(1)
    const filename = harness.downloads[0]!.download
    expect(filename.startsWith('factory-bundle-')).toBe(true)
    expect(filename.endsWith('.json')).toBe(true)
  })

  it('with empty entries produces a bundle with empty projects array (no throw)', async () => {
    expect(() => exportBundleToFile([])).not.toThrow()

    expect(harness.downloads).toHaveLength(1)
    const text = await readDownloadText(harness.downloads[0]!)
    const parsed = JSON.parse(text) as {
      version: number
      type: string
      projects: unknown[]
    }
    expect(parsed.version).toBe(1)
    expect(parsed.type).toBe('bundle')
    expect(parsed.projects).toEqual([])
  })
})

describe('importFilesFromUser()', () => {
  let harness: ImportHarness

  beforeEach(() => {
    harness = installImportHarness()
  })

  afterEach(() => {
    harness.restore()
  })

  it('parses a bundle file into N entries with their stored names', async () => {
    const bundle = {
      version: 1,
      type: 'bundle',
      projects: [
        { name: 'Alpha', save: makeFactorySave({ pxtWorkspace: '<a/>' }) },
        { name: 'Beta', save: makeFactorySave({ pxtWorkspace: '<b/>' }) },
        { name: 'Gamma', save: makeFactorySave({ pxtWorkspace: '<g/>' }) },
      ],
    }
    await harness.fire(JSON.stringify(bundle))

    const entries = await importFilesFromUser()
    expect(entries).toHaveLength(3)
    expect(entries.map((e) => e.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(entries[0]!.save.pxtWorkspace).toBe('<a/>')
    expect(entries[2]!.save.pxtWorkspace).toBe('<g/>')
  })

  it('parses a single FactorySave file by REJECTING (raw saves are no longer accepted)', async () => {
    const save = makeFactorySave({ pxtWorkspace: '<single/>' })
    await harness.fire(JSON.stringify(save))

    await expect(importFilesFromUser()).rejects.toThrow()
  })

  it('parses multiple bundle files into a flat list (file order, then bundle-internal order)', async () => {
    const bundle1 = {
      version: 1,
      type: 'bundle',
      projects: [
        { name: 'X', save: makeFactorySave({ pxtWorkspace: '<x/>' }) },
        { name: 'Y', save: makeFactorySave({ pxtWorkspace: '<y/>' }) },
      ],
    }
    const bundle2 = {
      version: 1,
      type: 'bundle',
      projects: [
        { name: 'Solo', save: makeFactorySave({ pxtWorkspace: '<solo/>' }) },
      ],
    }
    await harness.fire([JSON.stringify(bundle1), JSON.stringify(bundle2)])

    const entries = await importFilesFromUser()
    expect(entries).toHaveLength(3)
    expect(entries[0]!.name).toBe('X')
    expect(entries[1]!.name).toBe('Y')
    expect(entries[2]!.name).toBe('Solo')
    expect(entries[2]!.save.pxtWorkspace).toBe('<solo/>')
  })

  it('rejects when any file has invalid JSON', async () => {
    await harness.fire('{not valid json')
    await expect(importFilesFromUser()).rejects.toThrow()
  })

  it('rejects when any file has an invalid FactorySave schema', async () => {
    // Wrap a bogus save in a valid bundle envelope so the rejection comes
    // from validateSave (not from the bundle-only contract).
    const bogus = { version: 999, grid: [], belts: [], pxtWorkspace: '' }
    const bundle = { version: 1, type: 'bundle', projects: [{ name: 'X', save: bogus }] }
    await harness.fire(JSON.stringify(bundle))

    await expect(importFilesFromUser()).rejects.toThrow()
  })

  it('rejects when one file in a multi-file pick is invalid', async () => {
    const good = {
      version: 1,
      type: 'bundle',
      projects: [{ name: 'X', save: makeFactorySave() }],
    }
    await harness.fire([JSON.stringify(good), '{broken'])

    await expect(importFilesFromUser()).rejects.toThrow()
  })

  it('rejects when a bundle entry is missing a string name', async () => {
    const bundle = {
      version: 1,
      type: 'bundle',
      projects: [{ save: makeFactorySave({ pxtWorkspace: '<a/>' }) }],
    }
    await harness.fire(JSON.stringify(bundle))

    await expect(importFilesFromUser()).rejects.toThrow(/name/)
  })
})
