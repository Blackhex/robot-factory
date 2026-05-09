/**
 * @vitest-environment jsdom
 *
 * Contract tests for the bundled multi-import/export helpers.
 *
 * RED: these tests reference helpers that do not yet exist on
 * src/utils/SaveLoad.ts (`exportBundleToFile`, `importFilesFromUser`).
 * They will fail to compile / import until the GREEN agent adds them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  exportBundleToFile,
  importFilesFromUser,
} from '../../../src/utils/SaveLoad'
import type { FactorySave } from '../../../src/utils/SaveLoad'

function makeFactorySave(overrides: Partial<FactorySave> = {}): FactorySave {
  return {
    version: 2,
    grid: [],
    belts: [],
    pxtWorkspace: '',
    ...overrides,
  }
}

interface CapturedDownload {
  filename: string
  blob: Blob
  text: string
}

interface ExportHarness {
  downloads: CapturedDownload[]
  restore: () => void
}

function installExportHarness(): ExportHarness {
  const downloads: CapturedDownload[] = []
  const blobByUrl = new Map<string, Blob>()

  let counter = 0
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  URL.createObjectURL = vi.fn((blob: Blob): string => {
    const url = `blob:mock-${counter++}`
    blobByUrl.set(url, blob)
    return url
  }) as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn(() => {}) as typeof URL.revokeObjectURL

  const originalAnchorClick = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function patchedClick(this: HTMLAnchorElement): void {
    const url = this.href
    const blob = blobByUrl.get(url)
    if (blob) {
      downloads.push({
        filename: this.download,
        blob,
        text: '',
      })
    }
  }

  return {
    downloads,
    restore: (): void => {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      HTMLAnchorElement.prototype.click = originalAnchorClick
    },
  }
}

async function readDownloadText(d: CapturedDownload): Promise<string> {
  // Blob.text() is supported under jsdom.
  return await d.blob.text()
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

  it('filename starts with "factory-bundle-" and ends with ".json"', () => {
    exportBundleToFile([{ name: 'Solo', save: makeFactorySave() }])

    expect(harness.downloads).toHaveLength(1)
    const filename = harness.downloads[0]!.filename
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

interface ImportHarness {
  /** Queue of file content strings that the next file picker should "select". */
  enqueueFiles: (contents: string[]) => void
  restore: () => void
}

function installImportHarness(): ImportHarness {
  const queue: string[][] = []

  const originalCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((
    tagName: string,
    options?: ElementCreationOptions,
  ): HTMLElement => {
    const el = originalCreateElement(tagName, options)
    if (tagName.toLowerCase() === 'input') {
      const input = el as HTMLInputElement
      const originalClick = input.click.bind(input)
      input.click = (): void => {
        const next = queue.shift()
        if (next === undefined) {
          // No fake files queued — invoke real click to keep behavior consistent.
          originalClick()
          return
        }
        const fileList = next.map(
          (content, i) =>
            new File([content], `file-${i}.json`, { type: 'application/json' }),
        )
        // input.files is normally read-only; override it for the test.
        Object.defineProperty(input, 'files', {
          configurable: true,
          get: () => fileList as unknown as FileList,
        })
        // Fire async to mimic a real picker.
        queueMicrotask(() => {
          input.dispatchEvent(new Event('change'))
        })
      }
    }
    return el
  }) as typeof document.createElement)

  return {
    enqueueFiles: (contents: string[]): void => {
      queue.push(contents)
    },
    restore: (): void => {
      vi.restoreAllMocks()
    },
  }
}

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
    harness.enqueueFiles([JSON.stringify(bundle)])

    const entries = await importFilesFromUser()
    expect(entries).toHaveLength(3)
    expect(entries.map((e) => e.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(entries[0]!.save.pxtWorkspace).toBe('<a/>')
    expect(entries[2]!.save.pxtWorkspace).toBe('<g/>')
  })

  it('parses a single FactorySave file into one entry with name: null', async () => {
    const save = makeFactorySave({ pxtWorkspace: '<single/>' })
    harness.enqueueFiles([JSON.stringify(save)])

    const entries = await importFilesFromUser()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.name).toBeNull()
    expect(entries[0]!.save.pxtWorkspace).toBe('<single/>')
  })

  it('parses multiple files (mix of bundle + single) into a flat list', async () => {
    const bundle = {
      version: 1,
      type: 'bundle',
      projects: [
        { name: 'X', save: makeFactorySave({ pxtWorkspace: '<x/>' }) },
        { name: 'Y', save: makeFactorySave({ pxtWorkspace: '<y/>' }) },
      ],
    }
    const single = makeFactorySave({ pxtWorkspace: '<solo/>' })
    harness.enqueueFiles([JSON.stringify(bundle), JSON.stringify(single)])

    const entries = await importFilesFromUser()
    expect(entries).toHaveLength(3)
    // Order: all entries from file 1, then file 2.
    expect(entries[0]!.name).toBe('X')
    expect(entries[1]!.name).toBe('Y')
    expect(entries[2]!.name).toBeNull()
    expect(entries[2]!.save.pxtWorkspace).toBe('<solo/>')
  })

  it('rejects when any file has invalid JSON', async () => {
    harness.enqueueFiles(['{not valid json'])
    await expect(importFilesFromUser()).rejects.toThrow()
  })

  it('rejects when any file has an invalid FactorySave schema', async () => {
    // Looks like a save (has version field) but version is wrong.
    const bogus = { version: 999, grid: [], belts: [], pxtWorkspace: '' }
    harness.enqueueFiles([JSON.stringify(bogus)])

    await expect(importFilesFromUser()).rejects.toThrow()
  })

  it('rejects when one file in a multi-file pick is invalid', async () => {
    const good = makeFactorySave()
    harness.enqueueFiles([JSON.stringify(good), '{broken'])

    await expect(importFilesFromUser()).rejects.toThrow()
  })

  it('rejects when a bundle entry is missing a string name', async () => {
    const bundle = {
      version: 1,
      type: 'bundle',
      projects: [{ save: makeFactorySave({ pxtWorkspace: '<a/>' }) }],
    }
    harness.enqueueFiles([JSON.stringify(bundle)])

    await expect(importFilesFromUser()).rejects.toThrow(/name/)
  })
})
