/**
 * @vitest-environment jsdom
 *
 * Contract tests pinning the human-readable pxtWorkspace export format.
 *
 * RED: the implementation in src/utils/SaveLoad.ts currently serializes
 * `pxtWorkspace` as the raw stored string (a stringified JSON), and
 * `validateSave` rejects any object form. These tests will fail until
 * the GREEN agent updates exportToFile / exportBundleToFile / validateSave
 * / importFromFile / importFilesFromUser.
 *
 * In-memory FactorySave.pxtWorkspace MUST remain a string (this file
 * does not assert otherwise; existing tests still cover that).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  exportToFile,
  exportBundleToFile,
  importFromFile,
  importFilesFromUser,
} from '../../../src/utils/SaveLoad'
import type { FactorySave } from '../../../src/utils/SaveLoad'

const SAMPLE_TS = '\n'
const SAMPLE_BLOCKS =
  '<xml xmlns="https://developers.google.com/blockly/xml"><block type="forever"></block></xml>'
const SAMPLE_WORKSPACE_STRING = JSON.stringify({
  ts: SAMPLE_TS,
  blocks: SAMPLE_BLOCKS,
})

function makeFactorySave(overrides: Partial<FactorySave> = {}): FactorySave {
  return {
    version: 2,
    grid: [],
    belts: [],
    pxtWorkspace: SAMPLE_WORKSPACE_STRING,
    ...overrides,
  }
}

// --------------------------------------------------------------------------
// XML structural-equivalence helpers — re-parse both blocks XML strings and
// compare element trees so that <block></block> ↔ <block/> normalization
// differences (introduced by XML→tree→XML round-trip) don't cause spurious
// failures. Mirrors the helper in SaveLoadPxtWorkspaceBlocksJsonTree.test.ts;
// kept local so this file stays self-contained.
// --------------------------------------------------------------------------

interface NormalizedNode {
  tag: string
  attrs: Record<string, string>
  children: (NormalizedNode | { text: string })[]
}

function elementToNormalized(el: Element): NormalizedNode {
  const attrs: Record<string, string> = {}
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes.item(i)!
    attrs[a.name] = a.value
  }
  const children: (NormalizedNode | { text: string })[] = []
  el.childNodes.forEach((n) => {
    if (n.nodeType === 1) {
      children.push(elementToNormalized(n as Element))
    } else if (n.nodeType === 3) {
      const text = n.nodeValue ?? ''
      if (text.length > 0) children.push({ text })
    }
  })
  return { tag: el.tagName, attrs, children }
}

function parseXmlNormalized(xml: string): NormalizedNode {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) {
    throw new Error(`Invalid XML: ${err.textContent ?? 'unknown parse error'}`)
  }
  return elementToNormalized(doc.documentElement)
}

function expectXmlEquivalent(actualXml: string, expectedXml: string): void {
  expect(parseXmlNormalized(actualXml)).toEqual(parseXmlNormalized(expectedXml))
}

function expectWorkspaceStringEquivalent(actual: string, expected: string): void {
  const a = JSON.parse(actual) as { ts: string; blocks: string }
  const e = JSON.parse(expected) as { ts: string; blocks: string }
  expect(a.ts).toBe(e.ts)
  expectXmlEquivalent(a.blocks, e.blocks)
}

// --------------------------------------------------------------------------
// Export harness — captures Blob text written via the anchor-download trick.
// --------------------------------------------------------------------------

interface CapturedDownload {
  filename: string
  blob: Blob
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
      downloads.push({ filename: this.download, blob })
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

async function readDownloadJson(d: CapturedDownload): Promise<unknown> {
  return JSON.parse(await d.blob.text())
}

// --------------------------------------------------------------------------
// Import harness — fake file picker.
// --------------------------------------------------------------------------

interface ImportHarness {
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
          originalClick()
          return
        }
        const fileList = next.map(
          (content, i) =>
            new File([content], `file-${i}.json`, { type: 'application/json' }),
        )
        Object.defineProperty(input, 'files', {
          configurable: true,
          get: () => fileList as unknown as FileList,
        })
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

// ==========================================================================
// EXPORT — pxtWorkspace serialized as a nested object
// ==========================================================================

describe('exportToFile() — pxtWorkspace nested object format', () => {
  let harness: ExportHarness

  beforeEach(() => {
    harness = installExportHarness()
  })

  afterEach(() => {
    harness.restore()
  })

  it('serializes pxtWorkspace as an OBJECT (not a string) with { ts, blocks }', async () => {
    exportToFile(makeFactorySave())

    expect(harness.downloads).toHaveLength(1)
    const parsed = (await readDownloadJson(harness.downloads[0]!)) as {
      pxtWorkspace: unknown
    }

    expect(typeof parsed.pxtWorkspace).toBe('object')
    expect(parsed.pxtWorkspace).not.toBeNull()
    const ws = parsed.pxtWorkspace as { ts: unknown; blocks: unknown }
    expect(typeof ws.ts).toBe('string')
    expect(typeof ws.blocks).toBe('object')
    expect(ws.blocks).not.toBeNull()
    expect(ws.ts).toBe(SAMPLE_TS)
    expect(ws.blocks).toEqual({
      tag: 'xml',
      attrs: { xmlns: 'https://developers.google.com/blockly/xml' },
      children: [{ tag: 'block', attrs: { type: 'forever' } }],
    })
  })

  it('produces human-readable JSON: blocks XML appears un-escaped (no backslash-quote runs)', async () => {
    exportToFile(makeFactorySave())

    const text = await harness.downloads[0]!.blob.text()
    // Legacy (broken) shape would contain `\"xml` — the XML attributes get
    // escaped twice. The new shape has them only escaped once: `\"xml` only
    // exists via standard JSON string escaping of XML attributes, NOT as
    // a doubly-escaped run like `\\\"`.
    expect(text).not.toMatch(/\\\\"/)
    // The blocks string should be visibly present as a JSON string value,
    // not nested inside another JSON string literal.
    expect(text).toContain('"blocks"')
  })
})

describe('exportBundleToFile() — pxtWorkspace nested object format', () => {
  let harness: ExportHarness

  beforeEach(() => {
    harness = installExportHarness()
  })

  afterEach(() => {
    harness.restore()
  })

  it('serializes pxtWorkspace as an OBJECT for every project in the bundle', async () => {
    const a = makeFactorySave({
      pxtWorkspace: JSON.stringify({ ts: 'A', blocks: '<a/>' }),
    })
    const b = makeFactorySave({
      pxtWorkspace: JSON.stringify({ ts: 'B', blocks: '<b/>' }),
    })

    exportBundleToFile([
      { name: 'Alpha', save: a },
      { name: 'Beta', save: b },
    ])

    expect(harness.downloads).toHaveLength(1)
    const parsed = (await readDownloadJson(harness.downloads[0]!)) as {
      projects: { name: string; save: { pxtWorkspace: unknown } }[]
    }

    expect(parsed.projects).toHaveLength(2)
    for (const proj of parsed.projects) {
      expect(typeof proj.save.pxtWorkspace).toBe('object')
      expect(proj.save.pxtWorkspace).not.toBeNull()
    }
    const ws0 = parsed.projects[0]!.save.pxtWorkspace as { ts: string; blocks: unknown }
    const ws1 = parsed.projects[1]!.save.pxtWorkspace as { ts: string; blocks: unknown }
    expect(ws0).toEqual({ ts: 'A', blocks: { tag: 'a' } })
    expect(ws1).toEqual({ ts: 'B', blocks: { tag: 'b' } })
  })
})

// ==========================================================================
// IMPORT — accepts BOTH new (object) and legacy (string) forms
// ==========================================================================

describe('importFromFile() — accepts new object form and legacy string form', () => {
  let exportH: ExportHarness
  let importH: ImportHarness

  beforeEach(() => {
    exportH = installExportHarness()
    importH = installImportHarness()
  })

  afterEach(() => {
    importH.restore()
    exportH.restore()
  })

  it('accepts NEW object form and normalizes pxtWorkspace back to a string', async () => {
    const fileContent = JSON.stringify({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: SAMPLE_BLOCKS },
    })
    importH.enqueueFiles([fileContent])

    const save = await importFromFile()

    expect(typeof save.pxtWorkspace).toBe('string')
    expect(save.pxtWorkspace).toBe(SAMPLE_WORKSPACE_STRING)
  })

  it('accepts LEGACY string form unchanged', async () => {
    const fileContent = JSON.stringify({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: SAMPLE_WORKSPACE_STRING,
    })
    importH.enqueueFiles([fileContent])

    const save = await importFromFile()

    expect(typeof save.pxtWorkspace).toBe('string')
    expect(save.pxtWorkspace).toBe(SAMPLE_WORKSPACE_STRING)
  })

  it('round-trips: import(export(save)).pxtWorkspace structurally equals save.pxtWorkspace', async () => {
    const original = makeFactorySave()
    exportToFile(original)
    const text = await exportH.downloads[0]!.blob.text()
    importH.enqueueFiles([text])

    const reloaded = await importFromFile()

    expect(typeof reloaded.pxtWorkspace).toBe('string')
    expectWorkspaceStringEquivalent(reloaded.pxtWorkspace, original.pxtWorkspace)
  })

  it('rejects object form with non-string blocks', async () => {
    const fileContent = JSON.stringify({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: 42 },
    })
    importH.enqueueFiles([fileContent])

    await expect(importFromFile()).rejects.toThrow()
  })

  it('rejects object form with non-string ts', async () => {
    const fileContent = JSON.stringify({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: { ts: 17, blocks: SAMPLE_BLOCKS },
    })
    importH.enqueueFiles([fileContent])

    await expect(importFromFile()).rejects.toThrow()
  })

  it('rejects object form missing blocks', async () => {
    const fileContent = JSON.stringify({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: { ts: SAMPLE_TS },
    })
    importH.enqueueFiles([fileContent])

    await expect(importFromFile()).rejects.toThrow()
  })
})

describe('importFilesFromUser() — accepts new object form and legacy string form', () => {
  let exportH: ExportHarness
  let importH: ImportHarness

  beforeEach(() => {
    exportH = installExportHarness()
    importH = installImportHarness()
  })

  afterEach(() => {
    importH.restore()
    exportH.restore()
  })

  it('accepts NEW object form (single file) and normalizes pxtWorkspace to a string', async () => {
    const fileContent = JSON.stringify({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: SAMPLE_BLOCKS },
    })
    importH.enqueueFiles([fileContent])

    const entries = await importFilesFromUser()

    expect(entries).toHaveLength(1)
    expect(typeof entries[0]!.save.pxtWorkspace).toBe('string')
    expect(entries[0]!.save.pxtWorkspace).toBe(SAMPLE_WORKSPACE_STRING)
  })

  it('accepts LEGACY string form (single file) unchanged', async () => {
    const fileContent = JSON.stringify({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: SAMPLE_WORKSPACE_STRING,
    })
    importH.enqueueFiles([fileContent])

    const entries = await importFilesFromUser()

    expect(entries).toHaveLength(1)
    expect(entries[0]!.save.pxtWorkspace).toBe(SAMPLE_WORKSPACE_STRING)
  })

  it('accepts NEW object form inside a bundle and normalizes each project', async () => {
    const wsA = JSON.stringify({ ts: 'A', blocks: '<a/>' })
    const wsB = JSON.stringify({ ts: 'B', blocks: '<b/>' })
    const bundle = {
      version: 1,
      type: 'bundle',
      projects: [
        {
          name: 'Alpha',
          save: { version: 2, grid: [], belts: [], pxtWorkspace: { ts: 'A', blocks: '<a/>' } },
        },
        {
          name: 'Beta',
          save: { version: 2, grid: [], belts: [], pxtWorkspace: { ts: 'B', blocks: '<b/>' } },
        },
      ],
    }
    importH.enqueueFiles([JSON.stringify(bundle)])

    const entries = await importFilesFromUser()

    expect(entries).toHaveLength(2)
    expect(typeof entries[0]!.save.pxtWorkspace).toBe('string')
    expect(typeof entries[1]!.save.pxtWorkspace).toBe('string')
    expect(entries[0]!.save.pxtWorkspace).toBe(wsA)
    expect(entries[1]!.save.pxtWorkspace).toBe(wsB)
  })

  it('accepts a mix of new-form and legacy-form files in a single pick', async () => {
    const newForm = JSON.stringify({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: SAMPLE_BLOCKS },
    })
    const legacy = JSON.stringify({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: SAMPLE_WORKSPACE_STRING,
    })
    importH.enqueueFiles([newForm, legacy])

    const entries = await importFilesFromUser()

    expect(entries).toHaveLength(2)
    expect(entries[0]!.save.pxtWorkspace).toBe(SAMPLE_WORKSPACE_STRING)
    expect(entries[1]!.save.pxtWorkspace).toBe(SAMPLE_WORKSPACE_STRING)
  })

  it('round-trips a bundle: import(export(saves))[i].pxtWorkspace === saves[i].pxtWorkspace', async () => {
    const a = makeFactorySave({
      pxtWorkspace: JSON.stringify({ ts: 'A', blocks: '<a/>' }),
    })
    const b = makeFactorySave({
      pxtWorkspace: JSON.stringify({ ts: 'B', blocks: '<b/>' }),
    })
    exportBundleToFile([
      { name: 'Alpha', save: a },
      { name: 'Beta', save: b },
    ])
    const text = await exportH.downloads[0]!.blob.text()
    importH.enqueueFiles([text])

    const entries = await importFilesFromUser()

    expect(entries).toHaveLength(2)
    expect(entries[0]!.save.pxtWorkspace).toBe(a.pxtWorkspace)
    expect(entries[1]!.save.pxtWorkspace).toBe(b.pxtWorkspace)
  })

  it('rejects object form with non-string blocks', async () => {
    const fileContent = JSON.stringify({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: null },
    })
    importH.enqueueFiles([fileContent])

    await expect(importFilesFromUser()).rejects.toThrow()
  })

  it('rejects object form missing blocks', async () => {
    const fileContent = JSON.stringify({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: { ts: SAMPLE_TS },
    })
    importH.enqueueFiles([fileContent])

    await expect(importFilesFromUser()).rejects.toThrow()
  })
})
