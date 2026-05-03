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

/**
 * Optional viewport hint passed to {@link CameraController.zoomToFit}.
 *
 * When the canvas is partially obscured by an overlay (e.g. the PXT editor
 * panel docked to the right at narrow viewports), pass the canvas width and
 * the unobscured ("visible") sub-region width. The camera will then both
 * zoom out so the grid still fits horizontally inside `visibleWidth`, and
 * shift the target along the camera's screen-right axis so the grid centre
 * projects to the centre of the visible region instead of to the centre of
 * the full canvas.
 *
 * Both values are in CSS pixels relative to the canvas element. If
 * `visibleWidth >= canvasWidth` (or either is non-positive) the call
 * degrades to the legacy behaviour (centre-fit on the full canvas).
 */
export interface FitViewport {
  canvasWidth: number
  visibleWidth: number
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

  zoomToFit(
    width: number,
    height: number,
    viewportOrDuration?: FitViewport | number,
    durationArg = 0.8,
  ): void {
    let viewport: FitViewport | undefined
    let duration: number
    if (typeof viewportOrDuration === 'number') {
      viewport = undefined
      duration = viewportOrDuration
    } else {
      viewport = viewportOrDuration
      duration = durationArg
    }

    const fov = this.camera.fov * (Math.PI / 180)
    const halfFovTan = Math.tan(fov / 2)

    // When the editor (or any overlay) covers part of the canvas, expand
    // the effective fit horizontally so the grid still fits inside the
    // unobscured region. `horizontalScale = canvasWidth / visibleWidth`
    // (clamped to >= 1).
    const useViewport =
      viewport !== undefined &&
      viewport.canvasWidth > 0 &&
      viewport.visibleWidth > 0 &&
      viewport.visibleWidth < viewport.canvasWidth
    const horizontalScale = useViewport
      ? viewport!.canvasWidth / viewport!.visibleWidth
      : 1

    const effectiveWidth = width * horizontalScale
    const maxDim = Math.max(effectiveWidth, height)
    const distance = (maxDim / (2 * halfFovTan)) * 1.2

    const center = new THREE.Vector3(0, 0, 0)
    const endPosition = new THREE.Vector3(distance * 0.7, distance * 0.7, distance * 0.7)
    const endTarget = center.clone()

    if (useViewport) {
      // Shift target + position along the camera's screen-right axis so
      // the grid centre (world origin) projects to canvas-X =
      // visibleWidth / 2 instead of canvasWidth / 2.
      const aspect = this.camera.aspect
      // Camera-target distance for an isometric position scaled by 0.7 on
      // each axis: |(0.7d, 0.7d, 0.7d)| = 0.7 * d * sqrt(3).
      const camTargetDist = distance * 0.7 * Math.sqrt(3)
      const worldPerPixel =
        (2 * camTargetDist * halfFovTan * aspect) / viewport!.canvasWidth
      const pixelShift = (viewport!.canvasWidth - viewport!.visibleWidth) / 2

      // Camera right axis (world space) = normalize(forward × worldUp).
      const forward = new THREE.Vector3().subVectors(endTarget, endPosition)
      const camRight = new THREE.Vector3()
        .crossVectors(forward, new THREE.Vector3(0, 1, 0))
        .normalize()

      const worldShift = pixelShift * worldPerPixel
      endPosition.addScaledVector(camRight, worldShift)
      endTarget.addScaledVector(camRight, worldShift)
    }

    this.transition = {
      startPosition: this.camera.position.clone(),
      endPosition,
      startTarget: this.controls.target.clone(),
      endTarget,
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
