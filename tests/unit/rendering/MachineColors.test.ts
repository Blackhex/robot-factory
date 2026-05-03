/**
 * Visual regression tests for MACHINE_COLORS in src/rendering/RenderingAssets.ts.
 *
 * These tests pin two requirements:
 *   1. factory_output and assembler must live in distinct hue families
 *      (hue distance > 30°) so they are visually distinguishable on the grid.
 *      Today both are green (~120°) which makes them easy to confuse.
 *   2. All machine colors must be pairwise distinct (sanity guard).
 *
 * No Three.js import — we assert against the pure data export only.
 */
import { describe, it, expect } from 'vitest'
import { MACHINE_COLORS } from '../../../src/rendering/RenderingAssets'

/** Convert a 24-bit RGB hex to HSL hue in degrees [0, 360). */
function hueDegrees(hex: number): number {
  const r = ((hex >> 16) & 0xff) / 255
  const g = ((hex >> 8) & 0xff) / 255
  const b = (hex & 0xff) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0
  let h: number
  if (max === r) {
    h = ((g - b) / delta) % 6
  } else if (max === g) {
    h = (b - r) / delta + 2
  } else {
    h = (r - g) / delta + 4
  }
  h *= 60
  if (h < 0) h += 360
  return h
}

/** Smallest signed hue distance on the 360° circle. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

describe('MACHINE_COLORS visual regressions', () => {
  it('factory_output is in a different hue family from assembler (>30° apart)', () => {
    const factoryOutputHue = hueDegrees(MACHINE_COLORS.factory_output)
    const assemblerHue = hueDegrees(MACHINE_COLORS.assembler)
    const distance = hueDistance(factoryOutputHue, assemblerHue)
    expect(distance).toBeGreaterThan(30)
  })

  it('all machine colors are pairwise distinct', () => {
    const entries = Object.entries(MACHINE_COLORS)
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [typeA, colorA] = entries[i]
        const [typeB, colorB] = entries[j]
        expect(
          colorA,
          `${typeA} (0x${colorA.toString(16)}) collides with ${typeB} (0x${colorB.toString(16)})`,
        ).not.toBe(colorB)
      }
    }
  })
})
