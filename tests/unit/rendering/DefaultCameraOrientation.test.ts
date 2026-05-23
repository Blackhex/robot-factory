/**
 * Locks down: the default camera placement sits in the west-south octant
 * (x<0, y>0, z>0) with symmetric |x|=y=z framing, and `zoomToFit` from that
 * default start preserves the same orientation and targets the origin.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createController, completeTransition } from './_helpers/cameraControllerHarness'

describe('SceneManager default camera position (source-static)', () => {
  // SceneManager can't be instantiated under jsdom (needs WebGL) — pattern
  // mirrors SceneManagerBackground.test.ts.
  const sourcePath = resolve(__dirname, '../../../src/rendering/SceneManager.ts')
  const source = readFileSync(sourcePath, 'utf8')

  it('should place the camera in the west-south octant (x<0, y>0, z>0)', () => {
    const match = source.match(
      /this\.camera\.position\.set\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/,
    )
    expect(
      match,
      'expected `this.camera.position.set(x, y, z)` in SceneManager.ts',
    ).not.toBeNull()
    const x = Number(match![1])
    const y = Number(match![2])
    const z = Number(match![3])

    expect(x, 'camera X must be negative (west half-space)').toBeLessThan(0)
    expect(y, 'camera Y must be positive (above the grid)').toBeGreaterThan(0)
    expect(z, 'camera Z must be positive (south half-space)').toBeGreaterThan(0)
  })

  it('should preserve the symmetric isometric framing (|x| = y = z)', () => {
    const match = source.match(
      /this\.camera\.position\.set\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/,
    )
    expect(match).not.toBeNull()
    const x = Number(match![1])
    const y = Number(match![2])
    const z = Number(match![3])
    expect(Math.abs(x)).toBe(y)
    expect(y).toBe(z)
  })
})

describe('CameraController.zoomToFit() default orientation', () => {
  it('places the camera in the west-south octant after the transition', () => {
    const { controller, camera } = createController()

    controller.zoomToFit(800, 600)
    completeTransition(controller)

    expect(camera.position.x, 'camera X must be negative (west)').toBeLessThan(0)
    expect(camera.position.y, 'camera Y must be positive (above)').toBeGreaterThan(0)
    expect(camera.position.z, 'camera Z must be positive (south)').toBeGreaterThan(0)
  })

  it('preserves the symmetric isometric framing (|x| = y = z)', () => {
    const { controller, camera } = createController()

    controller.zoomToFit(800, 600)
    completeTransition(controller)

    expect(Math.abs(camera.position.x)).toBeCloseTo(camera.position.y, 6)
    expect(camera.position.y).toBeCloseTo(camera.position.z, 6)
  })

  it('still targets the world origin after the transition', () => {
    const { controller, controls } = createController()

    controller.zoomToFit(800, 600)
    completeTransition(controller)

    expect(controls.target.x).toBeCloseTo(0, 6)
    expect(controls.target.y).toBeCloseTo(0, 6)
    expect(controls.target.z).toBeCloseTo(0, 6)
  })
})
