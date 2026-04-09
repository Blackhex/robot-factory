import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface CameraTransition {
  startPosition: THREE.Vector3
  endPosition: THREE.Vector3
  startTarget: THREE.Vector3
  endTarget: THREE.Vector3
  elapsed: number
  duration: number
}

interface ShakeState {
  intensity: number
  elapsed: number
  duration: number
  offset: THREE.Vector3
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export class CameraController {
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private transition: CameraTransition | null = null
  private shake: ShakeState | null = null
  private defaultPosition: THREE.Vector3
  private defaultTarget: THREE.Vector3

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera
    this.controls = controls
    this.defaultPosition = camera.position.clone()
    this.defaultTarget = controls.target.clone()
  }

  focusPosition(target: THREE.Vector3, duration = 0.8): void {
    const direction = new THREE.Vector3()
      .subVectors(this.camera.position, this.controls.target)
      .normalize()
    const distance = this.camera.position.distanceTo(this.controls.target)
    const endPosition = target.clone().addScaledVector(direction, distance * 0.6)

    this.transition = {
      startPosition: this.camera.position.clone(),
      endPosition,
      startTarget: this.controls.target.clone(),
      endTarget: target.clone(),
      elapsed: 0,
      duration,
    }
  }

  resetView(duration = 0.8): void {
    this.transition = {
      startPosition: this.camera.position.clone(),
      endPosition: this.defaultPosition.clone(),
      startTarget: this.controls.target.clone(),
      endTarget: this.defaultTarget.clone(),
      elapsed: 0,
      duration,
    }
  }

  zoomToFit(width: number, height: number, duration = 0.8): void {
    const fov = this.camera.fov * (Math.PI / 180)
    const maxDim = Math.max(width, height)
    const distance = maxDim / (2 * Math.tan(fov / 2)) * 1.2

    const center = new THREE.Vector3(0, 0, 0)
    const endPosition = new THREE.Vector3(distance * 0.7, distance * 0.7, distance * 0.7)

    this.transition = {
      startPosition: this.camera.position.clone(),
      endPosition,
      startTarget: this.controls.target.clone(),
      endTarget: center,
      elapsed: 0,
      duration,
    }
  }

  startShake(intensity = 0.15): void {
    this.shake = {
      intensity,
      elapsed: 0,
      duration: 0.3,
      offset: new THREE.Vector3(),
    }
  }

  update(dt: number): void {
    if (this.transition) {
      this.transition.elapsed += dt
      const t = Math.min(this.transition.elapsed / this.transition.duration, 1)
      const eased = easeInOutCubic(t)

      this.camera.position.lerpVectors(
        this.transition.startPosition,
        this.transition.endPosition,
        eased,
      )
      this.controls.target.lerpVectors(
        this.transition.startTarget,
        this.transition.endTarget,
        eased,
      )

      if (t >= 1) {
        this.transition = null
      }
    }

    if (this.shake) {
      // Remove previous offset
      this.camera.position.sub(this.shake.offset)

      this.shake.elapsed += dt
      if (this.shake.elapsed >= this.shake.duration) {
        this.shake = null
      } else {
        const decay = 1 - this.shake.elapsed / this.shake.duration
        const intensity = this.shake.intensity * decay
        this.shake.offset.set(
          (Math.random() - 0.5) * 2 * intensity,
          (Math.random() - 0.5) * 2 * intensity,
          (Math.random() - 0.5) * 2 * intensity,
        )
        this.camera.position.add(this.shake.offset)
      }
    }
  }
}
