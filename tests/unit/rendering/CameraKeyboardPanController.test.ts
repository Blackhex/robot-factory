/**
 * @vitest-environment jsdom
 *
 * RED-step tests for `CameraKeyboardPanController` — the WSAD camera-pan
 * helper. The production class is currently a stub whose every method
 * throws `not implemented`; the GREEN step will replace the bodies.
 *
 * The tests use a fake `cameraController` (mock with `panBy` /
 * `cancelTransition` spies) plus a real `THREE.PerspectiveCamera` so the
 * controller's projected-forward / projected-right math has something
 * concrete to compute against.
 */
import * as THREE from 'three'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  CameraKeyboardPanController,
  PAN_SPEED_FACTOR,
  type CameraKeyboardPanDeps,
} from '../../../src/rendering/CameraKeyboardPanController'

interface MockCameraController {
  panBy: ReturnType<typeof vi.fn>
  cancelTransition: ReturnType<typeof vi.fn>
}

interface FakeWindow extends EventTarget {
  addEventListener: EventTarget['addEventListener']
  removeEventListener: EventTarget['removeEventListener']
  dispatchEvent: EventTarget['dispatchEvent']
}

interface Harness {
  cameraController: MockCameraController
  camera: THREE.PerspectiveCamera
  target: THREE.Vector3
  fakeWindow: FakeWindow
  activeElement: { value: Element | null }
  controller: CameraKeyboardPanController
}

function makeHarness(opts?: { cameraPos?: THREE.Vector3; target?: THREE.Vector3 }): Harness {
  const cameraPos = opts?.cameraPos ?? new THREE.Vector3(10, 10, 10)
  const target = opts?.target ?? new THREE.Vector3(0, 0, 0)

  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000)
  camera.position.copy(cameraPos)
  camera.lookAt(target)

  const cameraController: MockCameraController = {
    panBy: vi.fn(),
    cancelTransition: vi.fn(),
  }

  const eventTarget = new EventTarget()
  const fakeWindow: FakeWindow = {
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
  } as FakeWindow

  const activeElement: { value: Element | null } = { value: null }

  const deps: CameraKeyboardPanDeps = {
    cameraController: cameraController as unknown as CameraKeyboardPanDeps['cameraController'],
    getCamera: () => camera,
    getTarget: () => target,
    getActiveElement: () => activeElement.value,
    window: fakeWindow as unknown as Window,
  }

  const controller = new CameraKeyboardPanController(deps)

  return { cameraController, camera, target, fakeWindow, activeElement, controller }
}

function fireKeyDown(
  win: FakeWindow,
  code: string,
  init: KeyboardEventInit = {},
): void {
  win.dispatchEvent(new KeyboardEvent('keydown', { code, ...init }))
}

function fireKeyUp(win: FakeWindow, code: string): void {
  win.dispatchEvent(new KeyboardEvent('keyup', { code }))
}

function fireBlur(win: FakeWindow): void {
  win.dispatchEvent(new Event('blur'))
}

function makeStubElement(tagName: string, contentEditable?: 'true' | 'false'): Element {
  const el = document.createElement(tagName)
  if (contentEditable !== undefined) {
    el.setAttribute('contenteditable', contentEditable)
    Object.defineProperty(el, 'contentEditable', {
      configurable: true,
      get: () => contentEditable,
    })
  }
  return el
}

function expectedSingleAxisDelta(
  axis: 'forward' | 'right',
  sign: 1 | -1,
  cameraPos: THREE.Vector3,
  target: THREE.Vector3,
  dt: number,
): { x: number; z: number } {
  const camToTarget = cameraPos.distanceTo(target)
  const speed = PAN_SPEED_FACTOR * camToTarget

  const forward = new THREE.Vector3().subVectors(target, cameraPos)
  forward.y = 0
  forward.normalize()
  const right = new THREE.Vector3()
    .crossVectors(forward, new THREE.Vector3(0, 1, 0))
    .normalize()

  const dir = axis === 'forward' ? forward : right
  return {
    x: sign * dir.x * speed * dt,
    z: sign * dir.z * speed * dt,
  }
}

describe('CameraKeyboardPanController — pan geometry', () => {
  let h: Harness

  beforeEach(() => {
    h = makeHarness()
    h.controller.enable()
  })

  it('KeyW pans toward projected-forward by K * camTargetDist * dt', () => {
    // GIVEN
    const dt = 1.0
    const expected = expectedSingleAxisDelta(
      'forward',
      +1,
      h.camera.position,
      h.target,
      dt,
    )

    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW')
    h.controller.update(dt)

    // THEN
    expect(h.cameraController.panBy).toHaveBeenCalledTimes(1)
    const arg = h.cameraController.panBy.mock.calls[0][0] as THREE.Vector3
    expect(arg.x).toBeCloseTo(expected.x, 2)
    expect(arg.y).toBeCloseTo(0, 6)
    expect(arg.z).toBeCloseTo(expected.z, 2)
  })

  it('KeyS pans opposite of KeyW (same magnitude, negated)', () => {
    // GIVEN
    const dt = 1.0
    const expected = expectedSingleAxisDelta(
      'forward',
      -1,
      h.camera.position,
      h.target,
      dt,
    )

    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyS')
    h.controller.update(dt)

    // THEN
    expect(h.cameraController.panBy).toHaveBeenCalledTimes(1)
    const arg = h.cameraController.panBy.mock.calls[0][0] as THREE.Vector3
    expect(arg.x).toBeCloseTo(expected.x, 2)
    expect(arg.y).toBeCloseTo(0, 6)
    expect(arg.z).toBeCloseTo(expected.z, 2)
  })

  it('KeyA pans toward projected-right negated', () => {
    // GIVEN
    const dt = 1.0
    const expected = expectedSingleAxisDelta(
      'right',
      -1,
      h.camera.position,
      h.target,
      dt,
    )

    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyA')
    h.controller.update(dt)

    // THEN
    expect(h.cameraController.panBy).toHaveBeenCalledTimes(1)
    const arg = h.cameraController.panBy.mock.calls[0][0] as THREE.Vector3
    expect(arg.x).toBeCloseTo(expected.x, 2)
    expect(arg.y).toBeCloseTo(0, 6)
    expect(arg.z).toBeCloseTo(expected.z, 2)
  })

  it('KeyD pans toward projected-right', () => {
    // GIVEN
    const dt = 1.0
    const expected = expectedSingleAxisDelta(
      'right',
      +1,
      h.camera.position,
      h.target,
      dt,
    )

    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyD')
    h.controller.update(dt)

    // THEN
    expect(h.cameraController.panBy).toHaveBeenCalledTimes(1)
    const arg = h.cameraController.panBy.mock.calls[0][0] as THREE.Vector3
    expect(arg.x).toBeCloseTo(expected.x, 2)
    expect(arg.y).toBeCloseTo(0, 6)
    expect(arg.z).toBeCloseTo(expected.z, 2)
  })

  it('KeyW + KeyD held: net delta is the per-axis sum (NOT renormalized)', () => {
    // GIVEN — diagonal pan: magnitude should be ≈ √2 × single-key magnitude.
    const dt = 1.0
    const fwd = expectedSingleAxisDelta(
      'forward',
      +1,
      h.camera.position,
      h.target,
      dt,
    )
    const right = expectedSingleAxisDelta(
      'right',
      +1,
      h.camera.position,
      h.target,
      dt,
    )
    const expectedX = fwd.x + right.x
    const expectedZ = fwd.z + right.z
    const singleMag = Math.hypot(fwd.x, fwd.z)
    const sumMag = Math.hypot(expectedX, expectedZ)

    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW')
    fireKeyDown(h.fakeWindow, 'KeyD')
    h.controller.update(dt)

    // THEN
    expect(h.cameraController.panBy).toHaveBeenCalledTimes(1)
    const arg = h.cameraController.panBy.mock.calls[0][0] as THREE.Vector3
    expect(arg.x).toBeCloseTo(expectedX, 2)
    expect(arg.y).toBeCloseTo(0, 6)
    expect(arg.z).toBeCloseTo(expectedZ, 2)
    // Sanity: diagonal magnitude is √2 × single-axis magnitude.
    expect(sumMag / singleMag).toBeCloseTo(Math.SQRT2, 2)
  })

  it('KeyW + KeyS held: net delta is zero → panBy is not called', () => {
    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW')
    fireKeyDown(h.fakeWindow, 'KeyS')
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.panBy).not.toHaveBeenCalled()
  })
})

describe('CameraKeyboardPanController — lifecycle, focus, and modifiers', () => {
  let h: Harness

  beforeEach(() => {
    h = makeHarness()
    h.controller.enable()
  })

  it('update(dt) with no keys held does not call panBy', () => {
    // WHEN
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.panBy).not.toHaveBeenCalled()
  })

  it('keydown KeyW with focus on <input> is ignored', () => {
    // GIVEN
    h.activeElement.value = makeStubElement('input')

    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW')
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.panBy).not.toHaveBeenCalled()
  })

  it('keydown KeyW with focus on <textarea> is ignored', () => {
    // GIVEN
    h.activeElement.value = makeStubElement('textarea')

    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW')
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.panBy).not.toHaveBeenCalled()
  })

  it('keydown KeyW with focus on <select> is ignored', () => {
    // GIVEN
    h.activeElement.value = makeStubElement('select')

    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW')
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.panBy).not.toHaveBeenCalled()
  })

  it('keydown KeyW with focus on contentEditable element is ignored', () => {
    // GIVEN
    h.activeElement.value = makeStubElement('div', 'true')

    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW')
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.panBy).not.toHaveBeenCalled()
  })

  it('keydown KeyW with ctrlKey is ignored (and not registered as held)', () => {
    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW', { ctrlKey: true })
    h.controller.update(1.0)
    // Even after the modifier is gone, the key was never registered as held.
    fireKeyUp(h.fakeWindow, 'KeyW')
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.panBy).not.toHaveBeenCalled()
  })

  it('keydown KeyW with metaKey is ignored', () => {
    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW', { metaKey: true })
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.panBy).not.toHaveBeenCalled()
  })

  it('keydown KeyW with altKey is ignored', () => {
    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW', { altKey: true })
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.panBy).not.toHaveBeenCalled()
  })

  it('auto-repeat keydown does not compound — second press is a no-op', () => {
    // GIVEN
    const dt = 1.0
    const expected = expectedSingleAxisDelta(
      'forward',
      +1,
      h.camera.position,
      h.target,
      dt,
    )

    // WHEN — two keydowns without an intervening keyup, then one update.
    fireKeyDown(h.fakeWindow, 'KeyW')
    fireKeyDown(h.fakeWindow, 'KeyW')
    h.controller.update(dt)

    // THEN — exactly one panBy call, magnitude == single-press magnitude.
    expect(h.cameraController.panBy).toHaveBeenCalledTimes(1)
    const arg = h.cameraController.panBy.mock.calls[0][0] as THREE.Vector3
    expect(arg.x).toBeCloseTo(expected.x, 2)
    expect(arg.z).toBeCloseTo(expected.z, 2)
  })

  it('keyup KeyW releases the key (no panBy after release)', () => {
    // GIVEN — press + release in one window.
    fireKeyDown(h.fakeWindow, 'KeyW')
    fireKeyUp(h.fakeWindow, 'KeyW')

    // WHEN
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.panBy).not.toHaveBeenCalled()
  })

  it('window blur clears all held keys', () => {
    // GIVEN
    fireKeyDown(h.fakeWindow, 'KeyW')
    fireKeyDown(h.fakeWindow, 'KeyD')
    fireBlur(h.fakeWindow)

    // WHEN
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.panBy).not.toHaveBeenCalled()
  })

  it('disable() removes the listeners — subsequent keydowns do not register', () => {
    // GIVEN
    h.controller.disable()

    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW')
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.panBy).not.toHaveBeenCalled()
  })
})

describe('CameraKeyboardPanController — cancelTransition wiring', () => {
  let h: Harness

  beforeEach(() => {
    h = makeHarness()
    h.controller.enable()
  })

  it('calls cancelTransition on every frame a key is held with non-zero net delta', () => {
    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW')
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.cancelTransition).toHaveBeenCalledTimes(1)
    expect(h.cameraController.panBy).toHaveBeenCalledTimes(1)
  })

  it('does NOT call cancelTransition when no key is held', () => {
    // WHEN
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.cancelTransition).not.toHaveBeenCalled()
  })

  it('does NOT call cancelTransition when held keys cancel out (zero net delta)', () => {
    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW')
    fireKeyDown(h.fakeWindow, 'KeyS')
    h.controller.update(1.0)

    // THEN
    expect(h.cameraController.cancelTransition).not.toHaveBeenCalled()
    expect(h.cameraController.panBy).not.toHaveBeenCalled()
  })
})

describe('CameraKeyboardPanController — isPanning()', () => {
  let h: Harness

  beforeEach(() => {
    h = makeHarness()
    h.controller.enable()
  })

  it('returns false initially', () => {
    expect(h.controller.isPanning()).toBe(false)
  })

  it('returns true after KeyW keydown', () => {
    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW')

    // THEN
    expect(h.controller.isPanning()).toBe(true)
  })

  it('returns false again after keyup KeyW', () => {
    // GIVEN
    fireKeyDown(h.fakeWindow, 'KeyW')

    // WHEN
    fireKeyUp(h.fakeWindow, 'KeyW')

    // THEN
    expect(h.controller.isPanning()).toBe(false)
  })

  it('returns false when keys cancel out (W + S → zero net delta)', () => {
    // WHEN
    fireKeyDown(h.fakeWindow, 'KeyW')
    fireKeyDown(h.fakeWindow, 'KeyS')

    // THEN
    expect(h.controller.isPanning()).toBe(false)
  })
})
