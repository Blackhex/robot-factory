/**
 * Locks down: `CameraController.zoomToFit(...)` preserves the current orbit
 * direction around the target while resetting pan (target → origin) and
 * zoom (camera-target distance → framing distance).
 */
import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { createController, completeTransition } from './_helpers/cameraControllerHarness'

describe('CameraController.zoomToFit() preserves current rotation', () => {
  it('preserves rotation after orbit (azimuth): camera at (0, 15, 21.21)', () => {
    const startPos = new THREE.Vector3(0, 15, Math.sqrt(2) * 15)
    const { controller, camera, controls } = createController({ cameraPos: startPos })
    const expectedDir = startPos.clone().normalize()

    controller.zoomToFit(800, 600)
    completeTransition(controller)

    const actualDir = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .normalize()
    expect(actualDir.x).toBeCloseTo(expectedDir.x, 6)
    expect(actualDir.y).toBeCloseTo(expectedDir.y, 6)
    expect(actualDir.z).toBeCloseTo(expectedDir.z, 6)
    expect(camera.position.y, 'camera must remain above the ground').toBeGreaterThan(0)
    expect(controls.target.x).toBeCloseTo(0, 6)
    expect(controls.target.y).toBeCloseTo(0, 6)
    expect(controls.target.z).toBeCloseTo(0, 6)
  })

  it('preserves rotation after polar tilt: camera at (-21.21, 0, 21.21)', () => {
    const startPos = new THREE.Vector3(-Math.sqrt(2) * 15, 0, Math.sqrt(2) * 15)
    const { controller, camera, controls } = createController({ cameraPos: startPos })
    const expectedDir = startPos.clone().normalize()

    controller.zoomToFit(800, 600)
    completeTransition(controller)

    const actualDir = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .normalize()
    expect(actualDir.x).toBeCloseTo(expectedDir.x, 6)
    expect(actualDir.y).toBeCloseTo(expectedDir.y, 6)
    expect(actualDir.z).toBeCloseTo(expectedDir.z, 6)
    expect(controls.target.x).toBeCloseTo(0, 6)
    expect(controls.target.y).toBeCloseTo(0, 6)
    expect(controls.target.z).toBeCloseTo(0, 6)
  })

  it('resets pan even if target was offset (target ends at origin)', () => {
    const offset = new THREE.Vector3(5, 0, -3)
    const wsBase = new THREE.Vector3(-15, 15, 15)
    const startPos = wsBase.clone().add(offset)
    const startTarget = offset.clone()
    const { controller, camera, controls } = createController({
      cameraPos: startPos,
      targetPos: startTarget,
    })
    const expectedDir = wsBase.clone().normalize()

    controller.zoomToFit(800, 600)
    completeTransition(controller)

    expect(controls.target.x).toBeCloseTo(0, 6)
    expect(controls.target.y).toBeCloseTo(0, 6)
    expect(controls.target.z).toBeCloseTo(0, 6)
    const actualDir = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .normalize()
    expect(actualDir.x).toBeCloseTo(expectedDir.x, 6)
    expect(actualDir.y).toBeCloseTo(expectedDir.y, 6)
    expect(actualDir.z).toBeCloseTo(expectedDir.z, 6)
  })

  it('resets zoom: camera-target distance equals the framing distance regardless of start', () => {
    const wsDir = new THREE.Vector3(-1, 1, 1).normalize()
    const closePos = wsDir.clone().multiplyScalar(Math.sqrt(3) * 3)
    const defaultPos = wsDir.clone().multiplyScalar(Math.sqrt(3) * 15)

    const near = createController({ cameraPos: closePos })
    const def = createController({ cameraPos: defaultPos })

    near.controller.zoomToFit(800, 600)
    def.controller.zoomToFit(800, 600)
    completeTransition(near.controller)
    completeTransition(def.controller)

    const nearDist = new THREE.Vector3()
      .subVectors(near.camera.position, near.controls.target)
      .length()
    const defDist = new THREE.Vector3()
      .subVectors(def.camera.position, def.controls.target)
      .length()
    expect(nearDist).toBeCloseTo(defDist, 6)
  })

  it('back-compat: default WS start still yields x<0, y>0, z>0 and |x|=y=z', () => {
    const { controller, camera } = createController({
      cameraPos: new THREE.Vector3(-15, 15, 15),
    })

    controller.zoomToFit(800, 600)
    completeTransition(controller)

    expect(camera.position.x, 'camera X must be negative (west)').toBeLessThan(0)
    expect(camera.position.y, 'camera Y must be positive (above)').toBeGreaterThan(0)
    expect(camera.position.z, 'camera Z must be positive (south)').toBeGreaterThan(0)
    expect(Math.abs(camera.position.x)).toBeCloseTo(camera.position.y, 6)
    expect(camera.position.y).toBeCloseTo(camera.position.z, 6)
  })
})
