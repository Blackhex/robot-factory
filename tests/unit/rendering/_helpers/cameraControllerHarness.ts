import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CameraController } from '../../../../src/rendering/CameraController'

export interface FakeOrbitControls {
  target: THREE.Vector3
}

export interface CameraHarness {
  controller: CameraController
  camera: THREE.PerspectiveCamera
  controls: FakeOrbitControls
}

export interface CreateControllerOptions {
  cameraPos?: THREE.Vector3
  targetPos?: THREE.Vector3
}

export function createController(opts: CreateControllerOptions = {}): CameraHarness {
  const cameraPos = opts.cameraPos ?? new THREE.Vector3(-10, 10, 10)
  const targetPos = opts.targetPos ?? new THREE.Vector3(0, 0, 0)
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000)
  camera.position.copy(cameraPos)
  camera.lookAt(targetPos)
  const controls: FakeOrbitControls = { target: targetPos.clone() }
  const controller = new CameraController(
    camera,
    controls as unknown as OrbitControls,
  )
  return { controller, camera, controls }
}

export function completeTransition(controller: CameraController): void {
  for (let i = 0; i < 200; i++) {
    controller.update(0.05)
  }
}
