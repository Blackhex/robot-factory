import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Static source-string verification of OrbitControls clamps in SceneManager.
 *
 * We avoid instantiating SceneManager (which requires a real WebGL context)
 * and instead read the source file, locate the `maxPolarAngle` assignment,
 * evaluate the right-hand side in a sandbox, and assert the clamp is tight
 * enough that the camera cannot rotate to a near-horizontal viewing angle.
 */
describe('SceneManager OrbitControls clamps', () => {
  const sourcePath = resolve(__dirname, '../../../src/rendering/SceneManager.ts')
  const source = readFileSync(sourcePath, 'utf8')

  it('should assign controls.maxPolarAngle exactly once in the source', () => {
    // GIVEN the SceneManager source
    // WHEN we count assignments to maxPolarAngle
    const matches = source.match(/maxPolarAngle\s*=/g) ?? []

    // THEN there is exactly one assignment so the clamp value is unambiguous
    expect(matches.length).toBe(1)
  })

  it('should clamp maxPolarAngle to <= 1.25 rad (~71.6°) so the camera cannot drop near-horizontal', () => {
    // GIVEN the assignment line in SceneManager.ts
    const match = source.match(/maxPolarAngle\s*=\s*([^\n;]+)/)
    expect(match, 'expected to find a `maxPolarAngle = ...` assignment in SceneManager.ts').not.toBeNull()

    // WHEN we evaluate the right-hand side as a numeric expression
    const rhs = match![1].trim()
    // The RHS in our own source file is a static numeric expression (e.g. `Math.PI / 2 - 0.05`).
    // Evaluating it here is safe: it is committed source code, not user input.
    const value = Function('"use strict"; return (' + rhs + ')')() as number

    // THEN the clamp keeps the camera tilted (cannot dip to ~horizontal)
    expect(typeof value).toBe('number')
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeLessThanOrEqual(1.25)
  })
})
