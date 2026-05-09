import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Pins the Three.js scene background color to the UI `--rf-bg` token
 * (#0f1117) so the 3D viewport visually matches the darker app background.
 *
 * We can't instantiate SceneManager in jsdom (needs a real WebGL context),
 * and `scene` is private — so we statically verify the source assignment,
 * mirroring the approach used by SceneManagerControls.test.ts.
 */
describe('SceneManager scene background color', () => {
  const sourcePath = resolve(__dirname, '../../../src/rendering/SceneManager.ts')
  const source = readFileSync(sourcePath, 'utf8')

  it('should assign scene.background exactly once in the source', () => {
    const matches = source.match(/scene\.background\s*=/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('should set scene.background to the --rf-bg color (#0f1117)', () => {
    // GIVEN the scene.background assignment line in SceneManager.ts
    const match = source.match(/scene\.background\s*=\s*new\s+THREE\.Color\(\s*([^)]+?)\s*\)/)
    expect(match, 'expected `this.scene.background = new THREE.Color(<expr>)` in SceneManager.ts').not.toBeNull()

    // WHEN we evaluate the color expression as a number
    const rhs = match![1].trim()
    const value = Function('"use strict"; return (' + rhs + ')')() as number

    // THEN it equals the --rf-bg CSS token (#0f1117) defined in src/style.css
    expect(value).toBe(0x0f1117)
  })
})
