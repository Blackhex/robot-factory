import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * B-8 god-file split: extract `BeltTopologyCache` from `ItemRenderer.ts`.
 *
 * The cache owns the per-belt topology data that `cacheBeltTopology`
 * builds (chains of segments + their per-cell arc lengths) and the
 * self-heal logic that `buildRenderData` uses when a belt's topology
 * changes mid-flight.
 *
 * These tests are pure source-string assertions. They MUST fail before
 * the extraction lands and pass after. Runtime regression coverage is
 * provided by the existing item-rendering test suite
 * (ItemRendererPositioning, ItemRendererMigrationStability,
 * ItemRendererBoundarySmooth, ItemRendererCrossCellUniformity, etc.).
 */

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..')
const CACHE_PATH = resolve(PROJECT_ROOT, 'src', 'rendering', 'BeltTopologyCache.ts')
const RENDERER_PATH = resolve(PROJECT_ROOT, 'src', 'rendering', 'ItemRenderer.ts')

function readSource(absPath: string): string {
  return readFileSync(absPath, 'utf8')
}

/**
 * Find the first `<methodName>(...) {` definition in `src` and return
 * the number of lines between the opening `{` and its matching `}`,
 * exclusive (i.e. the count of body lines). Returns `-1` if no
 * definition is found.
 *
 * Brace counting is intentionally simple: it tolerates `{` / `}` inside
 * strings/comments because the goal is only a coarse "is this a fat
 * body or a thin delegate" check, and the actual file under test is
 * code we control. If false positives ever bite, switch to a TS AST.
 */
function methodBodyLineCount(src: string, methodName: string): number {
  const re = new RegExp(`\\b${methodName}\\s*\\([^)]*\\)\\s*(?::[^\\{]*)?\\{`)
  const match = re.exec(src)
  if (!match) return -1
  const openIdx = src.indexOf('{', match.index + match[0].length - 1)
  if (openIdx === -1) return -1
  let depth = 1
  let i = openIdx + 1
  while (i < src.length && depth > 0) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (depth === 0) break
    i++
  }
  if (depth !== 0) return -1
  const between = src.slice(openIdx + 1, i)
  // Body line count = number of newlines between the braces minus 1
  // (the opening and closing lines themselves are excluded). For a
  // one-liner like `foo() { return 42 }` this returns 0.
  const newlines = (between.match(/\n/g) ?? []).length
  return Math.max(0, newlines - 1)
}

describe('B-8: BeltTopologyCache extraction from ItemRenderer', () => {
  it('creates src/rendering/BeltTopologyCache.ts', () => {
    expect(
      existsSync(CACHE_PATH),
      'Expected new file src/rendering/BeltTopologyCache.ts to exist',
    ).toBe(true)
  })

  it('BeltTopologyCache exports a class', async () => {
    if (!existsSync(CACHE_PATH)) {
      throw new Error(
        'src/rendering/BeltTopologyCache.ts does not exist yet — extraction not done',
      )
    }
    const mod = (await import('../../../src/rendering/BeltTopologyCache')) as Record<
      string,
      unknown
    >
    const exported = mod.BeltTopologyCache as unknown
    expect(typeof exported, 'BeltTopologyCache must be exported as a class').toBe(
      'function',
    )
  })

  it('ItemRenderer.ts references BeltTopologyCache', () => {
    const src = readSource(RENDERER_PATH)
    expect(
      src.includes('BeltTopologyCache'),
      'ItemRenderer.ts must reference BeltTopologyCache (import + usage)',
    ).toBe(true)
  })

  it('ItemRenderer.ts cacheBeltTopology is a thin delegate (≤ 8 body lines)', () => {
    const src = readSource(RENDERER_PATH)
    const bodyLines = methodBodyLineCount(src, 'cacheBeltTopology')
    expect(
      bodyLines,
      'Could not locate cacheBeltTopology(...) { ... } in ItemRenderer.ts',
    ).toBeGreaterThanOrEqual(0)
    expect(
      bodyLines,
      `cacheBeltTopology body must be ≤ 8 lines (a delegate to BeltTopologyCache); found ${bodyLines} lines. The topology-building logic must live in BeltTopologyCache, not in ItemRenderer.`,
    ).toBeLessThanOrEqual(8)
  })

  it('ItemRenderer.ts is strictly less than 420 lines', () => {
    const src = readSource(RENDERER_PATH)
    const lineCount = src.split(/\r?\n/).length
    expect(
      lineCount,
      `ItemRenderer.ts must be < 420 lines after the split; found ${lineCount}`,
    ).toBeLessThan(420)
  })
})
