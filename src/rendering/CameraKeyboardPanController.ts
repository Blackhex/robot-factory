import * as THREE from 'three'
import type { CameraController } from './CameraController'

/**
 * WSAD keyboard camera-pan controller.
 *
 * Public surface (signatures, names, and the `PAN_SPEED_FACTOR` constant)
 * is locked by `tests/unit/rendering/CameraKeyboardPanController.test.ts`.
 */

export const PAN_SPEED_FACTOR = 0.6

export interface CameraKeyboardPanDeps {
  cameraController: CameraController
  getCamera(): THREE.PerspectiveCamera
  getTarget(): THREE.Vector3
  getActiveElement?(): Element | null
  window?: Window
}

type PanCode = 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD'
const PAN_CODES: ReadonlySet<string> = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD'])

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  const ce = (el as HTMLElement).contentEditable
  if (ce === 'true' || ce === 'plaintext-only') return true
  return false
}

export class CameraKeyboardPanController {
  private readonly deps: CameraKeyboardPanDeps
  private readonly held: Set<PanCode> = new Set()
  private readonly window: Window
  private readonly getActiveElement: () => Element | null
  private listening = false

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!PAN_CODES.has(event.code)) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (isEditableTarget(this.getActiveElement())) return
    this.held.add(event.code as PanCode)
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (!PAN_CODES.has(event.code)) return
    this.held.delete(event.code as PanCode)
  }

  private readonly onBlur = (): void => {
    this.held.clear()
  }

  constructor(deps: CameraKeyboardPanDeps) {
    this.deps = deps
    this.window = deps.window ?? (window as Window)
    this.getActiveElement =
      deps.getActiveElement ?? ((): Element | null => document.activeElement)
  }

  enable(): void {
    if (this.listening) return
    this.listening = true
    this.window.addEventListener('keydown', this.onKeyDown as EventListener)
    this.window.addEventListener('keyup', this.onKeyUp as EventListener)
    this.window.addEventListener('blur', this.onBlur as EventListener)
  }

  disable(): void {
    if (!this.listening) return
    this.listening = false
    this.window.removeEventListener('keydown', this.onKeyDown as EventListener)
    this.window.removeEventListener('keyup', this.onKeyUp as EventListener)
    this.window.removeEventListener('blur', this.onBlur as EventListener)
    this.held.clear()
  }

  update(dt: number): void {
    if (this.held.size === 0) return

    const net = this.computeNetDirection()
    if (net === null) return

    const camera = this.deps.getCamera()
    const target = this.deps.getTarget()
    const camTargetDist = camera.position.distanceTo(target)
    const speed = PAN_SPEED_FACTOR * camTargetDist

    this.deps.cameraController.cancelTransition()
    this.deps.cameraController.panBy(net.multiplyScalar(speed * dt))
  }

  isPanning(): boolean {
    if (this.held.size === 0) return false
    return this.computeNetDirection() !== null
  }

  private computeNetDirection(): THREE.Vector3 | null {
    const camera = this.deps.getCamera()
    const target = this.deps.getTarget()

    const forward = new THREE.Vector3().subVectors(target, camera.position)
    forward.y = 0
    if (forward.lengthSq() < 1e-10) {
      forward.set(0, 0, -1)
    } else {
      forward.normalize()
    }

    const right = new THREE.Vector3()
      .crossVectors(forward, new THREE.Vector3(0, 1, 0))
      .normalize()

    const net = new THREE.Vector3()
    if (this.held.has('KeyW')) net.add(forward)
    if (this.held.has('KeyS')) net.addScaledVector(forward, -1)
    if (this.held.has('KeyD')) net.add(right)
    if (this.held.has('KeyA')) net.addScaledVector(right, -1)

    if (net.lengthSq() < 1e-10) return null
    return net
  }
}
