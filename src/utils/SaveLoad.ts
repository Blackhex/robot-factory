import { ALL_MACHINE_TYPES, type Direction, type MachineType, type SlotPosition } from '../game/types.ts'
import { Factory } from '../game/Factory.ts'

const SAVE_VERSION = 3
const SUPPORTED_SAVE_VERSIONS: ReadonlySet<number> = new Set<number>([2, 3])

/**
 * Pure v2→v3 migration: swap 'left'↔'right' on every belt's sourceSlot /
 * destinationSlot so saves authored under the old machine-facing slot
 * convention still connect to the same physical world cells under the new
 * input-observer convention. 'front' / 'back' pass through unchanged.
 */
export function migrateV2ToV3(save: FactorySave): FactorySave {
  const swap = (s: string): string => (s === 'left' ? 'right' : s === 'right' ? 'left' : s)
  return {
    ...save,
    version: 3,
    belts: save.belts.map(b => ({
      ...b,
      sourceSlot: swap(b.sourceSlot),
      destinationSlot: swap(b.destinationSlot),
    })),
  }
}

const VALID_MACHINE_TYPES: ReadonlySet<string> = new Set<string>([
  ...ALL_MACHINE_TYPES,
  'quality_checker', // legacy: silently dropped at load time (see loadFactory)
])

const VALID_DIRECTIONS: ReadonlySet<string> = new Set<Direction>(['north', 'south', 'east', 'west'])
const VALID_SLOTS: ReadonlySet<string> = new Set<SlotPosition>(['front', 'back', 'left', 'right'])

export interface FactorySave {
  version: number
  grid: { x: number; z: number; machineType: string; rotation: string; name?: string }[]
  belts: { sourceSlot: string; destinationSlot: string; path: [number, number][]; name?: string }[]
  pxtWorkspace: string
  levelId?: string
}

/** Serialize a Factory + workspace string into a saveable object. */
export function saveFactory(
  factory: Factory,
  workspace: string,
  levelId?: string,
): FactorySave {
  const grid = factory.getMachines().map((m) => ({
    x: m.x,
    z: m.z,
    machineType: m.type as string,
    rotation: m.rotation,
    ...(m.name ? { name: m.name } : {}),
  }))

  const belts = factory.getBelts().map((b) => ({
    sourceSlot: b.sourceSlot as string,
    destinationSlot: b.destinationSlot as string,
    path: b.path.map(p => [p.x, p.z] as [number, number]),
    ...(b.name ? { name: b.name } : {}),
  }))

  const save: FactorySave = {
    version: SAVE_VERSION,
    grid,
    belts,
    pxtWorkspace: workspace,
  }

  if (levelId !== undefined) {
    save.levelId = levelId
  }

  return save
}

/** Recreate a Factory from a save object. */
export function loadFactory(
  save: FactorySave,
): { factory: Factory; workspace: string; levelId?: string } {
  validateSave(save)

  const effectiveSave = save.version === 2 ? migrateV2ToV3(save) : save

  const droppedCells = new Set<string>()
  const survivingGrid = effectiveSave.grid.filter(entry => {
    if (entry.machineType === 'quality_checker') {
      droppedCells.add(`${entry.x},${entry.z}`)
      return false
    }
    return true
  })
  const survivingBelts = effectiveSave.belts.filter(belt => {
    if (belt.path.length === 0) return true
    const src = belt.path[0]
    const dst = belt.path[belt.path.length - 1]
    if (droppedCells.has(`${src[0]},${src[1]}`)) return false
    if (droppedCells.has(`${dst[0]},${dst[1]}`)) return false
    return true
  })

  const factory = new Factory()

  factory.restoreState(
    survivingGrid.map(entry => ({ x: entry.x, z: entry.z, type: entry.machineType as MachineType, rotation: entry.rotation as Direction, ...(typeof (entry as Record<string, unknown>).name === 'string' ? { name: (entry as Record<string, unknown>).name as string } : {}) })),
    survivingBelts.map(belt => ({
      sourceSlot: belt.sourceSlot as SlotPosition,
      destinationSlot: belt.destinationSlot as SlotPosition,
      path: belt.path.map(p => ({ x: p[0], z: p[1] })),
      ...(typeof (belt as Record<string, unknown>).name === 'string' ? { name: (belt as Record<string, unknown>).name as string } : {}),
    })),
  )

  const result: { factory: Factory; workspace: string; levelId?: string } = {
    factory,
    workspace: save.pxtWorkspace,
  }

  if (save.levelId !== undefined) {
    result.levelId = save.levelId
  }

  return result
}

/** Persist a save to localStorage. */
export function saveToLocalStorage(key: string, save: FactorySave): void {
  localStorage.setItem(key, JSON.stringify(save))
}

/** Load a save from localStorage, or null if not found / invalid. */
export function loadFromLocalStorage(key: string): FactorySave | null {
  const raw = localStorage.getItem(key)
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    validateSave(parsed)
    return parsed as FactorySave
  } catch {
    return null
  }
}

interface XmlJsonNode {
  tag: string
  attrs?: Record<string, string>
  children?: (XmlJsonNode | string)[]
}

/**
 * Convert an XML string into a generic JSON tree of `{ tag, attrs?, children? }`
 * nodes. Element and text nodes are preserved; other node types are skipped.
 */
function xmlStringToJsonTree(xml: string): XmlJsonNode {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error(`Invalid XML: ${parserError.textContent ?? 'parse error'}`)
  }
  const root = doc.documentElement
  if (!root) {
    throw new Error('Invalid XML: no root element')
  }
  return elementToJsonTree(root)
}

function elementToJsonTree(el: Element): XmlJsonNode {
  const node: XmlJsonNode = { tag: el.tagName }
  if (el.attributes.length > 0) {
    const attrs: Record<string, string> = {}
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes.item(i)!
      attrs[a.name] = a.value
    }
    node.attrs = attrs
  }
  if (el.childNodes.length > 0) {
    const children: (XmlJsonNode | string)[] = []
    el.childNodes.forEach((n) => {
      if (n.nodeType === 1) {
        children.push(elementToJsonTree(n as Element))
      } else if (n.nodeType === 3) {
        children.push(n.nodeValue ?? '')
      }
    })
    if (children.length > 0) {
      node.children = children
    }
  }
  return node
}

/**
 * Convert a JSON tree back to an XML string. Validates the tree shape
 * strictly and throws a descriptive error on any violation.
 */
function jsonTreeToXmlString(node: unknown): string {
  const doc = document.implementation.createDocument(null, null, null)
  const root = jsonTreeToElement(node, doc)
  doc.appendChild(root)
  return new XMLSerializer().serializeToString(doc)
}

function jsonTreeToElement(node: unknown, doc: Document): Element {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error('JSON tree node must be an object with a string "tag"')
  }
  const n = node as { tag?: unknown; attrs?: unknown; children?: unknown }
  if (typeof n.tag !== 'string') {
    throw new Error('JSON tree node must have a string "tag"')
  }
  const el = doc.createElement(n.tag)
  if (n.attrs !== undefined) {
    if (n.attrs === null || typeof n.attrs !== 'object' || Array.isArray(n.attrs)) {
      throw new Error(`JSON tree node "${n.tag}": attrs must be a plain object`)
    }
    for (const [k, v] of Object.entries(n.attrs as Record<string, unknown>)) {
      if (typeof v !== 'string') {
        throw new Error(`JSON tree node "${n.tag}": attr "${k}" must be a string`)
      }
      el.setAttribute(k, v)
    }
  }
  if (n.children !== undefined) {
    if (!Array.isArray(n.children)) {
      throw new Error(`JSON tree node "${n.tag}": children must be an array`)
    }
    for (const child of n.children) {
      if (typeof child === 'string') {
        el.appendChild(doc.createTextNode(child))
      } else if (child !== null && typeof child === 'object') {
        el.appendChild(jsonTreeToElement(child, doc))
      } else {
        throw new Error(
          `JSON tree node "${n.tag}": child must be a string or a node object`,
        )
      }
    }
  }
  return el
}

/**
 * Return a shallow clone of `save` with `pxtWorkspace` expanded to a
 * `{ ts, blocks }` object when the stored string is parseable into that
 * shape. `blocks` is converted to a JSON-tree form. Defensive: never
 * throws — falls back to the raw string on any error.
 */
function expandPxtWorkspaceForExport(save: FactorySave): unknown {
  let expanded: unknown = save.pxtWorkspace
  try {
    const parsed: unknown = JSON.parse(save.pxtWorkspace)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as { ts?: unknown }).ts === 'string' &&
      typeof (parsed as { blocks?: unknown }).blocks === 'string'
    ) {
      const p = parsed as { ts: string; blocks: string }
      try {
        expanded = { ts: p.ts, blocks: xmlStringToJsonTree(p.blocks) }
      } catch {
        expanded = { ts: p.ts, blocks: p.blocks }
      }
    }
  } catch {
    // leave as raw string
  }
  return { ...save, pxtWorkspace: expanded }
}

/**
 * If `parsed.pxtWorkspace` is an object with string `ts` and string `blocks`,
 * collapse it back to a JSON-stringified workspace so the rest of the
 * pipeline (validateSave, in-memory FactorySave) keeps working with strings.
 * Throws on a malformed object form (wrong/missing fields).
 */
function normalizePxtWorkspaceForImport(parsed: unknown): unknown {
  if (parsed === null || typeof parsed !== 'object') return parsed
  const obj = parsed as Record<string, unknown>
  const ws = obj.pxtWorkspace
  if (ws === null || typeof ws !== 'object') return parsed

  const wsObj = ws as { ts?: unknown; blocks?: unknown }
  if (typeof wsObj.ts !== 'string') {
    throw new Error(
      'Save data: pxtWorkspace.ts must be a string',
    )
  }
  let blocksString: string
  if (typeof wsObj.blocks === 'string') {
    blocksString = wsObj.blocks
  } else if (wsObj.blocks !== null && typeof wsObj.blocks === 'object' && !Array.isArray(wsObj.blocks)) {
    blocksString = jsonTreeToXmlString(wsObj.blocks)
  } else {
    throw new Error(
      'Save data: pxtWorkspace.blocks must be a string (XML) or a JSON tree object',
    )
  }
  return { ...obj, pxtWorkspace: JSON.stringify({ ts: wsObj.ts, blocks: blocksString }) }
}

export interface BundleSave {
  version: 1
  type: 'bundle'
  projects: { name: string; save: FactorySave }[]
}

const BUNDLE_VERSION = 1

/**
 * Sanitize a user-provided name into a safe filename stem. Replaces any
 * character not in [A-Za-z0-9._-] with `-`, collapses runs of `-`, trims
 * leading/trailing `-`. Returns `factory` if the result is empty.
 */
function sanitizeFilename(name: string): string {
  const replaced = name.replace(/[^A-Za-z0-9._-]/g, '-')
  const collapsed = replaced.replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  return collapsed.length === 0 ? 'factory' : collapsed
}

/**
 * Trigger a JSON download of a multi-project bundle. When `entries.length
 * === 1` the filename is derived from the (sanitized) entry name; otherwise
 * a timestamped `factory-bundle-<ts>.json` is used.
 */
export function exportBundleToFile(entries: { name: string; save: FactorySave }[]): void {
  const bundle = {
    version: BUNDLE_VERSION,
    type: 'bundle' as const,
    projects: entries.map(e => ({ name: e.name, save: expandPxtWorkspaceForExport(e.save) })),
  }
  const json = JSON.stringify(bundle, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const filename = entries.length === 1
    ? `${sanitizeFilename(entries[0]!.name)}.json`
    : `factory-bundle-${Date.now()}.json`

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Trigger a JSON download of a single save, written as a single-entry
 * bundle envelope. Filename is derived from the (sanitized) `name`.
 */
export function exportToFile(save: FactorySave, name: string): void {
  exportBundleToFile([{ name, save }])
}

/**
 * Parse a bundle envelope. Throws a descriptive Error on any schema
 * violation. Returns the flattened `{ name, save }` entries with
 * `pxtWorkspace` normalized back to a string and each save validated.
 */
function parseBundleEnvelope(parsed: unknown): { name: string; save: FactorySave }[] {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Save file must be a bundle envelope object')
  }
  const obj = parsed as { version?: unknown; type?: unknown; projects?: unknown }
  if (obj.type !== 'bundle') {
    throw new Error('Save file must have type: "bundle"')
  }
  if (typeof obj.version !== 'number' || obj.version !== BUNDLE_VERSION) {
    throw new Error(
      `Unsupported bundle version: ${String(obj.version)} (expected ${BUNDLE_VERSION})`,
    )
  }
  if (!Array.isArray(obj.projects)) {
    throw new Error('Save file: bundle.projects must be an array')
  }
  const entries: { name: string; save: FactorySave }[] = []
  for (const proj of obj.projects as unknown[]) {
    if (proj === null || typeof proj !== 'object') {
      throw new Error('Bundle project entry must be an object')
    }
    const p = proj as { name?: unknown; save?: unknown }
    if (typeof p.name !== 'string') {
      throw new Error('Bundle project entry must have a string name')
    }
    const normalizedSave = normalizePxtWorkspaceForImport(p.save)
    validateSave(normalizedSave)
    entries.push({ name: p.name, save: normalizedSave as FactorySave })
  }
  return entries
}

/**
 * Open a file picker and load a single project from a single-entry bundle
 * envelope. Rejects if the file is not a bundle, the version mismatches,
 * or `projects.length !== 1`.
 */
export function importFromFile(): Promise<{ name: string; save: FactorySave }> {
  return new Promise<{ name: string; save: FactorySave }>((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'

    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        reject(new Error('No file selected'))
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed: unknown = JSON.parse(reader.result as string)
          const entries = parseBundleEnvelope(parsed)
          if (entries.length !== 1) {
            throw new Error('Expected a single-project bundle')
          }
          resolve(entries[0]!)
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Invalid save file'))
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })

    input.click()
  })
}

/**
 * Open a file picker (multi-select) and load saves from one or more bundle
 * envelopes. Raw `FactorySave` files are rejected. Results are flattened
 * preserving file order, then bundle-internal order. All-or-nothing: any
 * parse error or invalid schema rejects the whole pick.
 */
export function importFilesFromUser(): Promise<{ name: string; save: FactorySave }[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.multiple = true

    input.addEventListener('change', () => {
      const files = input.files
      if (!files || files.length === 0) {
        reject(new Error('No file selected'))
        return
      }

      const fileArray = Array.from(files)
      Promise.all(fileArray.map(file => file.text()))
        .then(texts => {
          const entries: { name: string; save: FactorySave }[] = []
          for (const text of texts) {
            const parsed: unknown = JSON.parse(text)
            entries.push(...parseBundleEnvelope(parsed))
          }
          resolve(entries)
        })
        .catch(err => {
          reject(err instanceof Error ? err : new Error('Invalid save file'))
        })
    })

    input.click()
  })
}

/** Validate that a parsed object conforms to the FactorySave schema. */
function validateSave(data: unknown): asserts data is FactorySave {
  if (data === null || typeof data !== 'object') {
    throw new Error('Save data must be an object')
  }

  const obj = data as Record<string, unknown>

  if (typeof obj.version !== 'number' || !SUPPORTED_SAVE_VERSIONS.has(obj.version)) {
    throw new Error(
      `Unsupported save version: ${String(obj.version)} (expected ${SAVE_VERSION})`,
    )
  }

  if (!Array.isArray(obj.grid)) {
    throw new Error('Save data: grid must be an array')
  }

  for (const entry of obj.grid as unknown[]) {
    if (entry === null || typeof entry !== 'object') {
      throw new Error('Save data: grid entry must be an object')
    }
    const e = entry as Record<string, unknown>
    if (typeof e.x !== 'number' || typeof e.z !== 'number') {
      throw new Error('Save data: grid entry must have numeric x and z')
    }
    if (typeof e.machineType !== 'string' || !VALID_MACHINE_TYPES.has(e.machineType)) {
      throw new Error(`Save data: invalid machineType "${String(e.machineType)}"`)
    }
    if (typeof e.rotation !== 'string' || !VALID_DIRECTIONS.has(e.rotation)) {
      throw new Error('Save data: grid entry must have a valid Direction rotation')
    }
  }

  if (!Array.isArray(obj.belts)) {
    throw new Error('Save data: belts must be an array')
  }

  for (const belt of obj.belts as unknown[]) {
    if (belt === null || typeof belt !== 'object') {
      throw new Error('Save data: belt entry must be an object')
    }
    const b = belt as Record<string, unknown>
    if (typeof b.sourceSlot !== 'string' || !VALID_SLOTS.has(b.sourceSlot)) {
      throw new Error('Save data: belt must have a valid sourceSlot')
    }
    if (typeof b.destinationSlot !== 'string' || !VALID_SLOTS.has(b.destinationSlot)) {
      throw new Error('Save data: belt must have a valid destinationSlot')
    }
    if (!Array.isArray(b.path) || b.path.length < 2) {
      throw new Error('Save data: belt.path must be an array with at least 2 entries')
    }
    for (const p of b.path as unknown[]) {
      if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number') {
        throw new Error('Save data: belt.path entries must be [number, number]')
      }
    }
  }

  if (typeof obj.pxtWorkspace !== 'string') {
    throw new Error('Save data: pxtWorkspace must be a string')
  }

  if (obj.levelId !== undefined && typeof obj.levelId !== 'string') {
    throw new Error('Save data: levelId must be a string if present')
  }
}
