import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Source-string tests pinning three extractions from `src/main.ts`:
 *
 *   1. The tutorial-step data table moves to a new module
 *      `src/game/Tutorials.ts` (data only, no UI/renderer dependencies).
 *   2. The `THREE.Vector3` import is removed from `main.ts`; spark emission
 *      goes through a new coordinate-form method on `ParticleEffects`
 *      (e.g. `emitSparksAt(x, y, z)`).
 *   3. The dev-only window seam (`__gameManager`, `__getFactoryRenderer`,
 *      `__sceneManager`) is gated by `import.meta.env.DEV`, the same way
 *      the existing `__test` block already is.
 */

const ROOT = resolve(__dirname, '..', '..', '..')
const MAIN_TS_PATH = resolve(ROOT, 'src', 'main.ts')
const TUTORIALS_TS_PATH = resolve(ROOT, 'src', 'game', 'Tutorials.ts')
const PARTICLE_EFFECTS_PATH = resolve(ROOT, 'src', 'rendering', 'ParticleEffects.ts')

function readSource(path: string): string {
  return readFileSync(path, 'utf8')
}

/**
 * Find the matching closing brace `}` for the opening brace at `openIdx`
 * (which must point at `{` in `source`). Returns the index of `}` or -1.
 */
function findMatchingBrace(source: string, openIdx: number): number {
  if (source[openIdx] !== '{') return -1
  let depth = 0
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Returns true iff every occurrence of `needle` in `source` lies inside the
 * body of an `if (import.meta.env.DEV) { ... }` block.
 */
function allOccurrencesInsideDevBlock(source: string, needle: string): boolean {
  const occurrences: number[] = []
  let from = 0
  while (true) {
    const idx = source.indexOf(needle, from)
    if (idx < 0) break
    occurrences.push(idx)
    from = idx + needle.length
  }
  if (occurrences.length === 0) return false

  // Locate every `if (import.meta.env.DEV) { ... }` block's [openBrace, closeBrace] range.
  const ifRegex = /if\s*\(\s*import\.meta\.env\.DEV\s*\)\s*\{/g
  const ranges: Array<[number, number]> = []
  let match: RegExpExecArray | null
  while ((match = ifRegex.exec(source)) !== null) {
    const openBrace = source.indexOf('{', match.index)
    if (openBrace < 0) continue
    const closeBrace = findMatchingBrace(source, openBrace)
    if (closeBrace < 0) continue
    ranges.push([openBrace, closeBrace])
  }

  return occurrences.every(occ =>
    ranges.some(([open, close]) => occ > open && occ < close),
  )
}

describe('main.ts extractions', () => {
  describe('1. Tutorial-step data extracted to src/game/Tutorials.ts', () => {
    it('src/game/Tutorials.ts exists', () => {
      expect(existsSync(TUTORIALS_TS_PATH)).toBe(true)
    })

    it('src/game/Tutorials.ts exports getTutorialSteps', () => {
      expect(existsSync(TUTORIALS_TS_PATH)).toBe(true)
      const source = readSource(TUTORIALS_TS_PATH)
      // Either `export function getTutorialSteps` or `export const getTutorialSteps`.
      expect(source).toMatch(/export\s+(?:function|const)\s+getTutorialSteps\b/)
    })

    it('src/main.ts no longer declares its own getTutorialSteps function', () => {
      const source = readSource(MAIN_TS_PATH)
      // Local declaration form must be gone (a separate `import { getTutorialSteps }`
      // is allowed and asserted by the next test).
      expect(source).not.toMatch(/\bfunction\s+getTutorialSteps\b/)
    })

    it('src/main.ts imports getTutorialSteps from a sibling module', () => {
      const source = readSource(MAIN_TS_PATH)
      expect(source).toMatch(/import\b[^;]*\bgetTutorialSteps\b[^;]*\bfrom\b/)
    })
  })

  describe('2. THREE import removed; spark emission via coordinate-form API', () => {
    it("src/main.ts does NOT import from 'three'", () => {
      const source = readSource(MAIN_TS_PATH)
      expect(source).not.toMatch(/\bfrom\s+['"]three['"]/)
    })

    it('src/main.ts does NOT construct new THREE.Vector3', () => {
      const source = readSource(MAIN_TS_PATH)
      expect(source).not.toMatch(/new\s+THREE\.Vector3\b/)
    })

    it('src/rendering/ParticleEffects.ts exposes a coordinate-form spark API (e.g. emitSparksAt)', () => {
      const source = readSource(PARTICLE_EFFECTS_PATH)
      // Accept any method whose name starts with `emitSparks` and takes
      // numeric coordinates rather than a Vector3 (e.g. `emitSparksAt(x, y, z)`,
      // `emitSparksXYZ(...)`, etc.).
      expect(source).toMatch(/\bemitSparks[A-Za-z]+\s*\([^)]*\bx\b[^)]*\by\b[^)]*\bz\b[^)]*\)/)
    })
  })

  describe('3. Dev-only window seam gated by import.meta.env.DEV', () => {
    it('every (window as any).__gameManager assignment lives inside an if (import.meta.env.DEV) block', () => {
      const source = readSource(MAIN_TS_PATH)
      expect(allOccurrencesInsideDevBlock(source, '__gameManager')).toBe(true)
    })

    it('every (window as any).__sceneManager assignment lives inside an if (import.meta.env.DEV) block', () => {
      const source = readSource(MAIN_TS_PATH)
      expect(allOccurrencesInsideDevBlock(source, '__sceneManager')).toBe(true)
    })

    it('every (window as any).__getFactoryRenderer assignment lives inside an if (import.meta.env.DEV) block', () => {
      const source = readSource(MAIN_TS_PATH)
      expect(allOccurrencesInsideDevBlock(source, '__getFactoryRenderer')).toBe(true)
    })
  })
})
