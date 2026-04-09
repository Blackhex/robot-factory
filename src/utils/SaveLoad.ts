import type { Direction, MachineType, SlotPosition } from '../game/types.ts'
import { Factory } from '../game/Factory.ts'

const SAVE_VERSION = 2

const VALID_MACHINE_TYPES: ReadonlySet<string> = new Set<MachineType>([
  'part_fabricator',
  'assembler',
  'quality_checker',
  'painter',
  'recycler',
  'splitter',
])

const VALID_DIRECTIONS: ReadonlySet<string> = new Set<Direction>(['north', 'south', 'east', 'west'])
const VALID_SLOTS: ReadonlySet<string> = new Set<SlotPosition>(['front', 'back', 'left', 'right'])

export interface FactorySave {
  version: number
  grid: { x: number; z: number; machineType: string; rotation: string; name?: string }[]
  belts: { sourceSlot: string; destinationSlot: string; path: [number, number][] }[]
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

  const factory = new Factory()

  factory.restoreState(
    save.grid.map(entry => ({ x: entry.x, z: entry.z, type: entry.machineType as MachineType, rotation: entry.rotation as Direction, ...(typeof (entry as Record<string, unknown>).name === 'string' ? { name: (entry as Record<string, unknown>).name as string } : {}) })),
    save.belts.map(belt => ({
      sourceSlot: belt.sourceSlot as SlotPosition,
      destinationSlot: belt.destinationSlot as SlotPosition,
      path: belt.path.map(p => ({ x: p[0], z: p[1] })),
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

/** Trigger a JSON file download of the save data. */
export function exportToFile(save: FactorySave): void {
  const json = JSON.stringify(save, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `factory-save-${Date.now()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Open a file picker and load a save from a JSON file. */
export function importFromFile(): Promise<FactorySave> {
  return new Promise<FactorySave>((resolve, reject) => {
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
          validateSave(parsed)
          resolve(parsed as FactorySave)
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

/** Validate that a parsed object conforms to the FactorySave schema. */
function validateSave(data: unknown): asserts data is FactorySave {
  if (data === null || typeof data !== 'object') {
    throw new Error('Save data must be an object')
  }

  const obj = data as Record<string, unknown>

  if (typeof obj.version !== 'number' || obj.version !== SAVE_VERSION) {
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
