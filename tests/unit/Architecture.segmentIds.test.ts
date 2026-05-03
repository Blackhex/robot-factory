/**
 * Architecture guard tests pinning that the `${logicalId}_seg${N}` segment-id
 * convention is parsed via `ConveyorBelt.parseSegmentId` instead of ad-hoc
 * regex scattered across the codebase.
 *
 * These tests MUST fail today — `Simulation.ts` and `ItemRenderer.ts` both
 * contain literal `_seg<digits>` regex — and pass after the parsing logic
 * has been centralized on `ConveyorBelt`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'

const REPO_ROOT = resolve(__dirname, '..', '..')

function readSource(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), 'utf-8')
}

function listTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listTsFiles(full))
    } else if (st.isFile() && entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Strip JS/TS comments from a source string so that documentation references
 * to the segment-id convention (e.g. JSDoc using `${logicalId}_seg${N}`) do
 * not trip the substring guard. Naive but sufficient for our codebase.
 */
function stripComments(src: string): string {
  // Remove block comments first (non-greedy, multi-line)
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  // Then remove single-line comments
  out = out.replace(/\/\/.*/g, '')
  return out
}

describe('segment-id parsing is centralized on ConveyorBelt', () => {
  it('Simulation.ts does not contain ad-hoc segment-id regex', () => {
    const source = readSource('src/game/Simulation.ts')
    // Today the file contains a string-built regex of the form
    // `^${escaped}_seg\\d+$` — the literal characters `_seg\\d` (six chars
    // including two backslashes) appear in the source. After centralization
    // on `ConveyorBelt.parseSegmentId`, that substring must be gone.
    // The JS string literal `'_seg\\\\d'` represents the 6-char text `_seg\\d`.
    expect(source).not.toContain('_seg\\\\d')
    // Also reject any inline regex form with a single backslash.
    expect(source).not.toMatch(/_seg\\d/)
  })

  it('ItemRenderer.ts does not contain ad-hoc segment-id regex', () => {
    const source = readSource('src/rendering/ItemRenderer.ts')
    // Today: `belt.id.match(/^(.+)_seg(\d+)$/)` — neither the inline regex
    // form nor an escaped string equivalent is allowed.
    expect(source).not.toContain('_seg(\\d+)')
    expect(source).not.toContain('_seg(\\\\d+)')
  })

  it('no src/game/**/*.ts file other than ConveyorBelt.ts builds segment ids inline', () => {
    // The `${logicalId}_seg${N}` segment-id literal must be constructed only
    // via `ConveyorBelt.segmentIdFor(...)`. This guard rejects the substring
    // `_seg${` (the start of a template-literal inline segment-id build) in
    // every src/game/*.ts file except ConveyorBelt.ts itself. Comments are
    // stripped so JSDoc references to the convention don't trip the check.
    const gameDir = resolve(REPO_ROOT, 'src/game')
    const offenders: string[] = []
    for (const file of listTsFiles(gameDir)) {
      if (file.endsWith('ConveyorBelt.ts')) continue
      const code = stripComments(readFileSync(file, 'utf-8'))
      if (code.includes('_seg${')) {
        offenders.push(file.replace(REPO_ROOT, '').replace(/\\/g, '/'))
      }
    }
    expect(offenders, `Files build segment ids inline; use ConveyorBelt.segmentIdFor instead: ${offenders.join(', ')}`).toEqual([])
  })
})
