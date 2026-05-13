/**
 * @vitest-environment jsdom
 *
 * Contract tests pinning the JSON-tree representation of pxtWorkspace.blocks
 * in EXPORTED save files (single + bundle).
 *
 * RED: the implementation currently emits `pxtWorkspace.blocks` as a raw XML
 * string. These tests will fail until the GREEN agent updates
 * expandPxtWorkspaceForExport / normalizePxtWorkspaceForImport in
 * src/utils/SaveLoad.ts.
 *
 * In-memory FactorySave.pxtWorkspace MUST remain a stringified JSON
 * `{"ts":"...","blocks":"<xml ...>...</xml>"}` after import — these tests
 * assert that explicitly.
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
  wrapBundle,
  type CapturedDownload,
  type ExportHarness,
  type ImportHarness,
} from '../../_helpers/saveLoadHarness'

// --------------------------------------------------------------------------
// Sample data — mirrors a real exported workspace from the user's bug report.
// --------------------------------------------------------------------------

const SAMPLE_TS = '\n'
const SAMPLE_BLOCKS_XML =
  '<xml xmlns="https://developers.google.com/blockly/xml">' +
  '<block type="pxt-on-start" id="^N*;_HrdOvT[8=F^GV^G" x="0" y="0"></block>' +
  '</xml>'
const SAMPLE_WORKSPACE_STRING = JSON.stringify({
  ts: SAMPLE_TS,
  blocks: SAMPLE_BLOCKS_XML,
})

const EXPECTED_TREE: XmlJsonNode = {
  tag: 'xml',
  attrs: { xmlns: 'https://developers.google.com/blockly/xml' },
  children: [
    {
      tag: 'block',
      attrs: { type: 'pxt-on-start', id: '^N*;_HrdOvT[8=F^GV^G', x: '0', y: '0' },
    },
  ],
}

interface XmlJsonNode {
  tag: string
  attrs?: Record<string, string>
  children?: (XmlJsonNode | string)[]
}

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
// XML structural-equality helper — re-parses both strings and compares
// element trees so that <block></block> ↔ <block/> normalization differences
// in jsdom don't cause spurious failures.
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
      const text = (n.nodeValue ?? '')
      // Preserve text exactly — including whitespace — for round-trip checks.
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

async function readDownloadJson(d: CapturedDownload): Promise<unknown> {
  return JSON.parse(d.jsonText)
}

/** Read the exported single-entry bundle and return the wrapped save. */
async function readExportedSave(d: CapturedDownload): Promise<{ pxtWorkspace: { ts: string; blocks: XmlJsonNode } }> {
  const parsed = (await readDownloadJson(d)) as {
    projects: { save: { pxtWorkspace: { ts: string; blocks: XmlJsonNode } } }[]
  }
  return parsed.projects[0]!.save
}

// --------------------------------------------------------------------------
// IMPORT harness — fake file picker.
// --------------------------------------------------------------------------

// ==========================================================================
// EXPORT — pxtWorkspace.blocks is an XML-as-JSON tree
// ==========================================================================

describe('exportToFile() — pxtWorkspace.blocks JSON-tree representation', () => {
  let harness: ExportHarness

  beforeEach(() => {
    harness = installExportHarness()
  })

  afterEach(() => {
    harness.restore()
  })

  it('serializes pxtWorkspace.blocks as an OBJECT (not a string)', async () => {
    exportToFile(makeFactorySave(), 'sample')

    expect(harness.downloads).toHaveLength(1)
    const parsed = await readExportedSave(harness.downloads[0]!)

    expect(typeof parsed.pxtWorkspace).toBe('object')
    expect(typeof parsed.pxtWorkspace.blocks).toBe('object')
    expect(Array.isArray(parsed.pxtWorkspace.blocks)).toBe(false)
    expect(parsed.pxtWorkspace.blocks).not.toBeNull()
  })

  it('produces the exact { tag, attrs, children } tree for the sample workspace', async () => {
    exportToFile(makeFactorySave(), 'sample')

    const parsed = await readExportedSave(harness.downloads[0]!)

    expect(parsed.pxtWorkspace.ts).toBe(SAMPLE_TS)
    expect(parsed.pxtWorkspace.blocks).toEqual(EXPECTED_TREE)
  })

  it('omits `attrs` when an element has no attributes', async () => {
    const ws = JSON.stringify({ ts: '', blocks: '<xml><inner></inner></xml>' })
    exportToFile(makeFactorySave({ pxtWorkspace: ws }), 'sample')

    const parsed = await readExportedSave(harness.downloads[0]!)
    const root = parsed.pxtWorkspace.blocks
    expect(root.tag).toBe('xml')
    expect('attrs' in root).toBe(false)
    expect(root.children).toHaveLength(1)
    const inner = root.children![0] as XmlJsonNode
    expect(inner.tag).toBe('inner')
    expect('attrs' in inner).toBe(false)
  })

  it('omits `children` when an element has no children (including <a></a>)', async () => {
    const ws = JSON.stringify({
      ts: '',
      blocks: '<xml xmlns="x"><block type="t"></block></xml>',
    })
    exportToFile(makeFactorySave({ pxtWorkspace: ws }), 'sample')

    const parsed = await readExportedSave(harness.downloads[0]!)
    const root = parsed.pxtWorkspace.blocks
    expect(root.children).toHaveLength(1)
    const block = root.children![0] as XmlJsonNode
    expect(block.tag).toBe('block')
    expect(block.attrs).toEqual({ type: 't' })
    expect('children' in block).toBe(false)
  })

  it('preserves whitespace-only text between elements as string children', async () => {
    const ws = JSON.stringify({
      ts: '',
      blocks: '<xml>\n  <a/>\n  <b/>\n</xml>',
    })
    exportToFile(makeFactorySave({ pxtWorkspace: ws }), 'sample')

    const parsed = await readExportedSave(harness.downloads[0]!)
    const root = parsed.pxtWorkspace.blocks
    expect(Array.isArray(root.children)).toBe(true)
    // Expect alternating whitespace strings and elements.
    const stringChildren = root.children!.filter((c): c is string => typeof c === 'string')
    expect(stringChildren.length).toBeGreaterThan(0)
    // All preserved string children must be whitespace-only here.
    for (const s of stringChildren) {
      expect(s).toMatch(/^\s+$/)
    }
  })

  it('contains no double-escaped quote runs (\\\\") in the blocks portion — XML is gone', async () => {
    exportToFile(makeFactorySave(), 'sample')

    const text = harness.downloads[0]!.jsonText
    expect(text).not.toMatch(/\\\\"/)
    // And the literal XML attribute syntax should not appear inside a
    // JSON string value at all — the structure is JSON now.
    expect(text).not.toContain('<block')
    expect(text).not.toContain('<xml')
  })
})

describe('exportBundleToFile() — pxtWorkspace.blocks JSON-tree representation', () => {
  let harness: ExportHarness

  beforeEach(() => {
    harness = installExportHarness()
  })

  afterEach(() => {
    harness.restore()
  })

  it('serializes pxtWorkspace.blocks as an OBJECT for every project', async () => {
    const a = makeFactorySave({
      pxtWorkspace: JSON.stringify({ ts: 'A', blocks: '<a foo="1"/>' }),
    })
    const b = makeFactorySave({
      pxtWorkspace: JSON.stringify({ ts: 'B', blocks: '<b/>' }),
    })

    exportBundleToFile([
      { name: 'Alpha', save: a },
      { name: 'Beta', save: b },
    ])

    const parsed = (await readDownloadJson(harness.downloads[0]!)) as {
      projects: { name: string; save: { pxtWorkspace: { ts: string; blocks: XmlJsonNode } } }[]
    }
    expect(parsed.projects).toHaveLength(2)

    for (const proj of parsed.projects) {
      expect(typeof proj.save.pxtWorkspace.blocks).toBe('object')
      expect(Array.isArray(proj.save.pxtWorkspace.blocks)).toBe(false)
      expect(proj.save.pxtWorkspace.blocks).not.toBeNull()
      expect(typeof proj.save.pxtWorkspace.blocks.tag).toBe('string')
    }

    expect(parsed.projects[0]!.save.pxtWorkspace).toEqual({
      ts: 'A',
      blocks: { tag: 'a', attrs: { foo: '1' } },
    })
    expect(parsed.projects[1]!.save.pxtWorkspace).toEqual({
      ts: 'B',
      blocks: { tag: 'b' },
    })
  })

  it('contains no XML tag literals in the bundle output', async () => {
    exportBundleToFile([{ name: 'Solo', save: makeFactorySave() }])
    const text = harness.downloads[0]!.jsonText
    expect(text).not.toContain('<xml')
    expect(text).not.toContain('<block')
    expect(text).not.toMatch(/\\\\"/)
  })
})

// ==========================================================================
// IMPORT — accepts NEW JSON-tree form AND legacy XML-string form
// ==========================================================================

describe('importFromFile() — accepts new JSON-tree blocks and legacy XML-string blocks', () => {
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

  it('accepts NEW JSON-tree form and normalizes pxtWorkspace to the legacy in-memory string', async () => {
    await importH.fire(wrapBundle({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: EXPECTED_TREE },
    }))

    const { save } = await importFromFile()

    expect(typeof save.pxtWorkspace).toBe('string')
    expectWorkspaceStringEquivalent(save.pxtWorkspace, SAMPLE_WORKSPACE_STRING)
  })

  it('still accepts the prior-iteration object form (string blocks) unchanged', async () => {
    await importH.fire(wrapBundle({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: SAMPLE_BLOCKS_XML },
    }))

    const { save } = await importFromFile()

    expect(save.pxtWorkspace).toBe(SAMPLE_WORKSPACE_STRING)
  })

  it('still accepts the fully-legacy string pxtWorkspace form unchanged', async () => {
    await importH.fire(wrapBundle({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: SAMPLE_WORKSPACE_STRING,
    }))

    const { save } = await importFromFile()

    expect(save.pxtWorkspace).toBe(SAMPLE_WORKSPACE_STRING)
  })

  it('round-trips: import(export(save)).save.pxtWorkspace ≡ save.pxtWorkspace', async () => {
    const original = makeFactorySave()
    exportToFile(original, 'rt')
    const text = exportH.downloads[0]!.jsonText
    await importH.fire(text)

    const { save: reloaded } = await importFromFile()

    expect(typeof reloaded.pxtWorkspace).toBe('string')
    expectWorkspaceStringEquivalent(reloaded.pxtWorkspace, original.pxtWorkspace)
  })

  it('rejects: blocks is a number', async () => {
    await importH.fire(wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: 42 },
    }))
    await expect(importFromFile()).rejects.toThrow()
  })

  it('rejects: blocks is an array', async () => {
    await importH.fire(wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: [{ tag: 'xml' }] },
    }))
    await expect(importFromFile()).rejects.toThrow()
  })

  it('rejects: blocks is null', async () => {
    await importH.fire(wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: null },
    }))
    await expect(importFromFile()).rejects.toThrow()
  })

  it('rejects: node missing `tag`', async () => {
    await importH.fire(wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: { attrs: { foo: 'bar' } } },
    }))
    await expect(importFromFile()).rejects.toThrow()
  })

  it('rejects: node `attrs` is not an object of strings', async () => {
    await importH.fire(wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: { tag: 'xml', attrs: { foo: 17 } } },
    }))
    await expect(importFromFile()).rejects.toThrow()
  })

  it('rejects: node `attrs` is not an object (e.g., array)', async () => {
    await importH.fire(wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: { tag: 'xml', attrs: ['foo', 'bar'] } },
    }))
    await expect(importFromFile()).rejects.toThrow()
  })

  it('rejects: node `children` is not an array', async () => {
    await importH.fire(wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: { tag: 'xml', children: 'oops' } },
    }))
    await expect(importFromFile()).rejects.toThrow()
  })

  it('rejects: child item is neither object nor string (e.g., number)', async () => {
    await importH.fire(wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: { tag: 'xml', children: [42] } },
    }))
    await expect(importFromFile()).rejects.toThrow()
  })
})

describe('importFilesFromUser() — accepts JSON-tree blocks (single, bundle, mixed)', () => {
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

  it('accepts a single NEW JSON-tree-blocks file (single-entry bundle) and normalizes pxtWorkspace to a string', async () => {
    await importH.fire(wrapBundle({
      version: 2,
      grid: [],
      belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: EXPECTED_TREE },
    }))

    const entries = await importFilesFromUser()

    expect(entries).toHaveLength(1)
    expect(typeof entries[0]!.save.pxtWorkspace).toBe('string')
    expectWorkspaceStringEquivalent(entries[0]!.save.pxtWorkspace, SAMPLE_WORKSPACE_STRING)
  })

  it('accepts NEW JSON-tree blocks inside a bundle and normalizes each project', async () => {
    const treeA: XmlJsonNode = { tag: 'a', attrs: { foo: '1' } }
    const treeB: XmlJsonNode = { tag: 'b' }
    const expectedA = JSON.stringify({ ts: 'A', blocks: '<a foo="1"/>' })
    const expectedB = JSON.stringify({ ts: 'B', blocks: '<b/>' })

    const bundle = {
      version: 1,
      type: 'bundle',
      projects: [
        {
          name: 'Alpha',
          save: { version: 2, grid: [], belts: [], pxtWorkspace: { ts: 'A', blocks: treeA } },
        },
        {
          name: 'Beta',
          save: { version: 2, grid: [], belts: [], pxtWorkspace: { ts: 'B', blocks: treeB } },
        },
      ],
    }
    await importH.fire(JSON.stringify(bundle))

    const entries = await importFilesFromUser()

    expect(entries).toHaveLength(2)
    expect(typeof entries[0]!.save.pxtWorkspace).toBe('string')
    expect(typeof entries[1]!.save.pxtWorkspace).toBe('string')
    expectWorkspaceStringEquivalent(entries[0]!.save.pxtWorkspace, expectedA)
    expectWorkspaceStringEquivalent(entries[1]!.save.pxtWorkspace, expectedB)
  })

  it('accepts a mixed pick: one NEW-form bundle + one fully-legacy string bundle', async () => {
    const newForm = wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: EXPECTED_TREE },
    }, 'A')
    const legacy = wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: SAMPLE_WORKSPACE_STRING,
    }, 'B')
    await importH.fire([newForm, legacy])

    const entries = await importFilesFromUser()

    expect(entries).toHaveLength(2)
    expect(typeof entries[0]!.save.pxtWorkspace).toBe('string')
    expect(typeof entries[1]!.save.pxtWorkspace).toBe('string')
    expectWorkspaceStringEquivalent(entries[0]!.save.pxtWorkspace, SAMPLE_WORKSPACE_STRING)
    expect(entries[1]!.save.pxtWorkspace).toBe(SAMPLE_WORKSPACE_STRING)
  })

  it('round-trips a single save: import(export(save))[0].save.pxtWorkspace ≡ save.pxtWorkspace', async () => {
    const original = makeFactorySave()
    exportToFile(original, 'rt')
    const text = exportH.downloads[0]!.jsonText
    await importH.fire(text)

    const entries = await importFilesFromUser()

    expect(entries).toHaveLength(1)
    expectWorkspaceStringEquivalent(entries[0]!.save.pxtWorkspace, original.pxtWorkspace)
  })

  it('round-trips a bundle: import(export(saves))[i].pxtWorkspace ≡ saves[i].pxtWorkspace', async () => {
    const a = makeFactorySave({
      pxtWorkspace: JSON.stringify({
        ts: 'A',
        blocks: '<xml xmlns="https://developers.google.com/blockly/xml"><block type="pxt-on-start" id="abc" x="0" y="0"></block></xml>',
      }),
    })
    const b = makeFactorySave({
      pxtWorkspace: JSON.stringify({
        ts: 'B',
        blocks: '<xml><block type="forever"></block></xml>',
      }),
    })
    exportBundleToFile([
      { name: 'Alpha', save: a },
      { name: 'Beta', save: b },
    ])
    const text = exportH.downloads[0]!.jsonText
    await importH.fire(text)

    const entries = await importFilesFromUser()

    expect(entries).toHaveLength(2)
    expectWorkspaceStringEquivalent(entries[0]!.save.pxtWorkspace, a.pxtWorkspace)
    expectWorkspaceStringEquivalent(entries[1]!.save.pxtWorkspace, b.pxtWorkspace)
  })

  it('rejects malformed JSON-tree blocks (number)', async () => {
    await importH.fire(wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: 42 },
    }))
    await expect(importFilesFromUser()).rejects.toThrow()
  })

  it('rejects malformed JSON-tree blocks (missing tag)', async () => {
    await importH.fire(wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: { attrs: { foo: 'bar' } } },
    }))
    await expect(importFilesFromUser()).rejects.toThrow()
  })

  it('rejects malformed JSON-tree blocks (attrs not object of strings)', async () => {
    await importH.fire(wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: { tag: 'xml', attrs: { foo: 17 } } },
    }))
    await expect(importFilesFromUser()).rejects.toThrow()
  })

  it('rejects malformed JSON-tree blocks (children not array)', async () => {
    await importH.fire(wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: { tag: 'xml', children: 'oops' } },
    }))
    await expect(importFilesFromUser()).rejects.toThrow()
  })

  it('rejects malformed JSON-tree blocks (child item is a number)', async () => {
    await importH.fire(wrapBundle({
      version: 2, grid: [], belts: [],
      pxtWorkspace: { ts: SAMPLE_TS, blocks: { tag: 'xml', children: [42] } },
    }))
    await expect(importFilesFromUser()).rejects.toThrow()
  })
})
