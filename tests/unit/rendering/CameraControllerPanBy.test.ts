/**
 * RED-step tests for the new `CameraController.panBy()` and
 * `CameraController.cancelTransition()` public methods that back the WSAD
 * keyboard camera-pan feature.
 *
 * The production methods are currently stubs that throw `not implemented`.
 * The GREEN step will replace the bodies; signatures stay the same.
 */
import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { describe, it, expect, beforeEach } from 'vitest'
import { CameraController } from '../../../src/rendering/CameraController'

interface FakeOrbitControls {
  target: THREE.Vector3
}

function createController(
  cameraPos = new THREE.Vector3(10, 10, 10),
  targetPos = new THREE.Vector3(0, 0, 0),
): { controller: CameraController; camera: THREE.PerspectiveCamera; controls: FakeOrbitControls } {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000)
  camera.position.copy(cameraPos)
  camera.lookAt(targetPos)
  const controls: FakeOrbitControls = { target: targetPos.clone() }
  const controller = new CameraController(
    camera,
    controls as unknown as OrbitControls,
  )
  return { controller, camera, controls }
}

describe('CameraController.panBy()', () => {
  let camera: THREE.PerspectiveCamera
  let controls: FakeOrbitControls
  let controller: CameraController

  beforeEach(() => {
    const built = createController()
    camera = built.camera
    controls = built.controls
    controller = built.controller
  })

  it('adds the delta to both camera.position and controls.target', () => {
    // GIVEN
    const startCamera = camera.position.clone()
    const startTarget = controls.target.clone()
    const delta = new THREE.Vector3(2, 0, -3)

    // WHEN
    controller.panBy(delta)

    // THEN
    expect(camera.position.x).toBeCloseTo(startCamera.x + 2, 6)
    expect(camera.position.y).toBeCloseTo(startCamera.y + 0, 6)
    expect(camera.position.z).toBeCloseTo(startCamera.z - 3, 6)
    expect(controls.target.x).toBeCloseTo(startTarget.x + 2, 6)
    expect(controls.target.y).toBeCloseTo(startTarget.y + 0, 6)
    expect(controls.target.z).toBeCloseTo(startTarget.z - 3, 6)
  })

  it('handles a second non-zero delta (deltas accumulate)', () => {
    // GIVEN
    const startCamera = camera.position.clone()
    const startTarget = controls.target.clone()

    // WHEN
    controller.panBy(new THREE.Vector3(1, 0, 0))
    controller.panBy(new THREE.Vector3(0, 0, 4))

    // THEN
    expect(camera.position.x).toBeCloseTo(startCamera.x + 1, 6)
    expect(camera.position.z).toBeCloseTo(startCamera.z + 4, 6)
    expect(controls.target.x).toBeCloseTo(startTarget.x + 1, 6)
    expect(controls.target.z).toBeCloseTo(startTarget.z + 4, 6)
  })

  it('handles a negative delta on every axis', () => {
    // GIVEN
    const startCamera = camera.position.clone()
    const startTarget = controls.target.clone()

    // WHEN
    controller.panBy(new THREE.Vector3(-5, -7, -9))

    // THEN
    expect(camera.position.x).toBeCloseTo(startCamera.x - 5, 6)
    expect(camera.position.y).toBeCloseTo(startCamera.y - 7, 6)
    expect(camera.position.z).toBeCloseTo(startCamera.z - 9, 6)
    expect(controls.target.x).toBeCloseTo(startTarget.x - 5, 6)
    expect(controls.target.y).toBeCloseTo(startTarget.y - 7, 6)
    expect(controls.target.z).toBeCloseTo(startTarget.z - 9, 6)
  })

  it('is a no-op for a zero delta', () => {
    // GIVEN
    const startCamera = camera.position.clone()
    const startTarget = controls.target.clone()

    // WHEN
    controller.panBy(new THREE.Vector3(0, 0, 0))

    // THEN
    expect(camera.position.x).toBeCloseTo(startCamera.x, 6)
    expect(camera.position.y).toBeCloseTo(startCamera.y, 6)
    expect(camera.position.z).toBeCloseTo(startCamera.z, 6)
    expect(controls.target.x).toBeCloseTo(startTarget.x, 6)
    expect(controls.target.y).toBeCloseTo(startTarget.y, 6)
    expect(controls.target.z).toBeCloseTo(startTarget.z, 6)
  })
})

describe('CameraController.cancelTransition()', () => {
  it('clears an in-flight transition started via focusPosition', () => {
    // GIVEN
    const { controller, camera, controls } = createController()
    controller.focusPosition(new THREE.Vector3(50, 0, 50), 1.0)

    // WHEN
    controller.cancelTransition()
    const cameraBefore = camera.position.clone()
    const targetBefore = controls.target.clone()
    controller.update(0.5)

    // THEN — no lerp progress because the transition was cancelled.
    expect(camera.position.x).toBeCloseTo(cameraBefore.x, 6)
    expect(camera.position.y).toBeCloseTo(cameraBefore.y, 6)
    expect(camera.position.z).toBeCloseTo(cameraBefore.z, 6)
    expect(controls.target.x).toBeCloseTo(targetBefore.x, 6)
    expect(controls.target.y).toBeCloseTo(targetBefore.y, 6)
    expect(controls.target.z).toBeCloseTo(targetBefore.z, 6)
  })

  it('is a no-op on a fresh controller (does not throw)', () => {
    // GIVEN
    const { controller } = createController()

    // WHEN + THEN
    expect(() => controller.cancelTransition()).not.toThrow()
  })
})
