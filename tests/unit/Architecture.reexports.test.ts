/**
 * Architecture guard tests pinning the absence of re-export pyramids.
 *
 * Single sources of truth:
 * - `MACHINE_COLORS` lives in `src/rendering/RenderingAssets.ts`.
 * - `CORNER_STRAIGHT_LEN` (and the related belt-geometry constants/helpers)
 *   live in `src/utils/BeltGeometry.ts`.
 *
 * No file in `src/rendering/` may re-export these symbols further, and all
 * consumers must import directly from the canonical modules.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const REPO_ROOT = resolve(__dirname, '..', '..')

function readSource(relPath: string): { content: string; lines: string[] } {
  const absolute = resolve(REPO_ROOT, relPath)
  const content = readFileSync(absolute, 'utf-8')
  return { content, lines: content.split(/\r?\n/) }
}

/** Return 1-based line numbers (with their text) where `pattern` matches. */
function matchingLines(lines: string[], pattern: RegExp): string[] {
  const hits: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      hits.push(`L${i + 1}: ${lines[i].trim()}`)
    }
  }
  return hits
}

/**
 * Find the physical line(s) that contain a named symbol inside an
 * `import { ... }` or `export { ... }` block originating in `relPath`.
 * Handles both single-line and multi-line brace blocks by joining the
 * brace span and recording every contributing line number.
 */
function findNamedImportSites(
  lines: string[],
  symbol: string,
): { lineNumbers: number[]; joined: string; from: string | null }[] {
  const sites: { lineNumbers: number[]; joined: string; from: string | null }[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const startsBlock = /^\s*(import|export)\b/.test(line) && /\{/.test(line) && !/\}/.test(line)
    if (startsBlock) {
      const blockLines: number[] = [i + 1]
      let j = i + 1
      let buf = line
      while (j < lines.length && !/\}/.test(lines[j])) {
        buf += '\n' + lines[j]
        blockLines.push(j + 1)
        j++
      }
      if (j < lines.length) {
        buf += '\n' + lines[j]
        blockLines.push(j + 1)
      }
      const symbolPattern = new RegExp(`\\b${symbol}\\b`)
      if (symbolPattern.test(buf)) {
        const fromMatch = buf.match(/from\s+['"]([^'"]+)['"]/)
        sites.push({
          lineNumbers: blockLines,
          joined: buf.replace(/\s+/g, ' ').trim(),
          from: fromMatch ? fromMatch[1] : null,
        })
      }
      i = j + 1
      continue
    }
    // Single-line import/export with braces or a default/namespace form.
    if (/^\s*(import|export)\b/.test(line)) {
      const symbolPattern = new RegExp(`\\b${symbol}\\b`)
      if (symbolPattern.test(line)) {
        const fromMatch = line.match(/from\s+['"]([^'"]+)['"]/)
        sites.push({
          lineNumbers: [i + 1],
          joined: line.trim(),
          from: fromMatch ? fromMatch[1] : null,
        })
      }
    }
    i++
  }
  return sites
}

describe('Architecture: re-export pyramids are forbidden', () => {
  describe('MACHINE_COLORS — single source of truth is src/rendering/RenderingAssets.ts', () => {
    it('src/rendering/FactoryRenderer.ts does NOT re-export MACHINE_COLORS', () => {
      const path = 'src/rendering/FactoryRenderer.ts'
      const { lines } = readSource(path)
      // Match `export { MACHINE_COLORS ... }` with or without a `from '...'` clause,
      // including multi-line export blocks.
      const reexport = /export\s*\{[^}]*\bMACHINE_COLORS\b[^}]*\}/s
      const fullSource = lines.join('\n')
      const matches = matchingLines(lines, /export\s*\{[^}]*\bMACHINE_COLORS\b/)
      expect(
        reexport.test(fullSource),
        `${path} re-exports MACHINE_COLORS — it must be imported directly from './RenderingAssets' by every consumer.\nOffending line(s):\n${matches.join('\n') || '(brace block spans multiple lines — see file)'}\n`,
      ).toBe(false)
    })
  })

  describe('CORNER_STRAIGHT_LEN — single source of truth is src/utils/BeltGeometry.ts', () => {
    it('src/rendering/BeltMeshRenderer.ts does NOT re-export CORNER_STRAIGHT_LEN', () => {
      const path = 'src/rendering/BeltMeshRenderer.ts'
      const { content, lines } = readSource(path)
      // Single-line OR multi-line `export { ... CORNER_STRAIGHT_LEN ... }` block.
      const reexport = /export\s*\{[^}]*\bCORNER_STRAIGHT_LEN\b[^}]*\}/s
      const matches = matchingLines(lines, /\bCORNER_STRAIGHT_LEN\b/)
      expect(
        reexport.test(content),
        `${path} re-exports CORNER_STRAIGHT_LEN — consumers must import it from '../utils/BeltGeometry' directly.\nLine(s) referencing CORNER_STRAIGHT_LEN:\n${matches.join('\n') || '(none)'}\n`,
      ).toBe(false)
    })

    it('src/rendering/BeltGeometry.ts does NOT re-export CORNER_STRAIGHT_LEN', () => {
      const path = 'src/rendering/BeltGeometry.ts'
      const { content, lines } = readSource(path)
      const reexport = /export\s*\{[^}]*\bCORNER_STRAIGHT_LEN\b[^}]*\}/s
      const matches = matchingLines(lines, /\bCORNER_STRAIGHT_LEN\b/)
      expect(
        reexport.test(content),
        `${path} re-exports CORNER_STRAIGHT_LEN — consumers must import it from '../utils/BeltGeometry' directly.\nLine(s) referencing CORNER_STRAIGHT_LEN:\n${matches.join('\n') || '(none)'}\n`,
      ).toBe(false)
    })
  })

  describe('Consumers import canonical symbols from canonical modules', () => {
    it("src/rendering/MachineDragPreviewController.ts imports MACHINE_COLORS from './RenderingAssets'", () => {
      const path = 'src/rendering/MachineDragPreviewController.ts'
      const { lines } = readSource(path)
      const sites = findNamedImportSites(lines, 'MACHINE_COLORS')
      expect(
        sites.length,
        `${path} has no import of MACHINE_COLORS — expected one from './RenderingAssets'.`,
      ).toBeGreaterThan(0)
      for (const site of sites) {
        expect(
          site.from,
          `${path} imports MACHINE_COLORS at L${site.lineNumbers.join(',')} but no source path was found: ${site.joined}`,
        ).not.toBeNull()
        expect(
          site.from,
          `${path} L${site.lineNumbers.join(',')} imports MACHINE_COLORS from '${site.from}'; expected './RenderingAssets'.\nOffending: ${site.joined}`,
        ).toBe('./RenderingAssets')
      }
    })

    it("src/rendering/GridInteraction.ts imports MACHINE_COLORS from './RenderingAssets'", () => {
      const path = 'src/rendering/GridInteraction.ts'
      const { lines } = readSource(path)
      const sites = findNamedImportSites(lines, 'MACHINE_COLORS')
      expect(
        sites.length,
        `${path} has no import of MACHINE_COLORS — expected one from './RenderingAssets'.`,
      ).toBeGreaterThan(0)
      for (const site of sites) {
        expect(
          site.from,
          `${path} imports MACHINE_COLORS at L${site.lineNumbers.join(',')} but no source path was found: ${site.joined}`,
        ).not.toBeNull()
        expect(
          site.from,
          `${path} L${site.lineNumbers.join(',')} imports MACHINE_COLORS from '${site.from}'; expected './RenderingAssets'.\nOffending: ${site.joined}`,
        ).toBe('./RenderingAssets')
      }
    })

    it("src/rendering/BeltPath.ts imports CORNER_STRAIGHT_LEN from '../utils/BeltGeometry'", () => {
      const path = 'src/rendering/BeltPath.ts'
      const { lines } = readSource(path)
      const sites = findNamedImportSites(lines, 'CORNER_STRAIGHT_LEN')
      expect(
        sites.length,
        `${path} has no import of CORNER_STRAIGHT_LEN — expected one from '../utils/BeltGeometry'.`,
      ).toBeGreaterThan(0)
      for (const site of sites) {
        expect(
          site.from,
          `${path} imports CORNER_STRAIGHT_LEN at L${site.lineNumbers.join(',')} but no source path was found: ${site.joined}`,
        ).not.toBeNull()
        expect(
          site.from,
          `${path} L${site.lineNumbers.join(',')} imports CORNER_STRAIGHT_LEN from '${site.from}'; expected '../utils/BeltGeometry'.\nOffending: ${site.joined}`,
        ).toBe('../utils/BeltGeometry')
      }
    })
  })
})
