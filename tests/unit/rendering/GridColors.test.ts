/**
 * Visual regression tests for grid floor colors.
 *
 * These tests pin the requirement that grid lines are bright enough to be
 * visible on the dark factory floor. Today the colors are inline magic
 * numbers in FactoryRenderer.renderGrid() (0x444466 / 0x333355) and they
 * are too dim against the dark floor.
 *
 * The tests assert against a pure-data export `GRID_COLORS` from
 * src/rendering/RenderingAssets.ts. The constant does not yet exist —
 * extracting it (and bumping the values for contrast) is the production fix.
 *
 * No Three.js import — we assert against the pure data export only.
 */
import { describe, it, expect } from 'vitest'
import * as RenderingAssets from '../../../src/rendering/RenderingAssets'

/** Simple weighted brightness for a 24-bit RGB hex (Rec. 709 weights). */
function luminance(hex: number): number {
  const r = ((hex >> 16) & 0xff) / 255
  const g = ((hex >> 8) & 0xff) / 255
  const b = (hex & 0xff) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('GRID_COLORS visual regressions', () => {
  it('exports GRID_COLORS with major, minor, and floor numeric properties', () => {
    const grid = (RenderingAssets as { GRID_COLORS?: unknown }).GRID_COLORS
    expect(grid, 'GRID_COLORS must be exported from RenderingAssets').toBeDefined()
    expect(typeof grid).toBe('object')
    const g = grid as Record<string, unknown>
    expect(typeof g.major).toBe('number')
    expect(typeof g.minor).toBe('number')
    expect(typeof g.floor).toBe('number')
  })

  it('major grid line is brighter than 0.18 luminance', () => {
    const grid = (RenderingAssets as { GRID_COLORS?: { major: number } }).GRID_COLORS
    expect(grid).toBeDefined()
    expect(luminance(grid!.major)).toBeGreaterThan(0.18)
  })

  it('minor grid line is brighter than 0.10 luminance', () => {
    const grid = (RenderingAssets as { GRID_COLORS?: { minor: number } }).GRID_COLORS
    expect(grid).toBeDefined()
    expect(luminance(grid!.minor)).toBeGreaterThan(0.10)
  })

  it('major and minor grid lines are at least 0.05 apart in luminance', () => {
    const grid = (RenderingAssets as { GRID_COLORS?: { major: number; minor: number } })
      .GRID_COLORS
    expect(grid).toBeDefined()
    const delta = Math.abs(luminance(grid!.major) - luminance(grid!.minor))
    expect(delta).toBeGreaterThanOrEqual(0.05)
  })
})
