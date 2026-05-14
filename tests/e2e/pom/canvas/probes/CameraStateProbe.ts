import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export type CameraVec = { x: number; y: number; z: number }

export type CameraState = {
  position: CameraVec
  target: CameraVec
  distance: number
}

/**
 * Reads the orbit camera's runtime state (position + target + distance)
 * via the existing `window.__sceneManager` debug hook. Used by camera
 * keyboard-pan E2E specs to assert that pressing WSAD shifts both the
 * camera position and the orbit target by the same delta (rigid pan).
 *
 * Also offers small focus utilities used to ensure the active element
 * is or is not an editable input before dispatching keyboard events.
 */
export class CameraStateProbe {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Read the current camera position, orbit target, and orbit distance. */
  async getCameraState(): Promise<CameraState> {
    return this.page.evaluate(() => {
      const sm = (window as any).__sceneManager
      if (!sm) throw new Error('CameraStateProbe: window.__sceneManager not exposed')
      const camera = sm.getCamera?.()
      const controls = sm.getControls?.()
      if (!camera) throw new Error('CameraStateProbe: scene manager has no camera')
      if (!controls) throw new Error('CameraStateProbe: scene manager has no controls')
      const cp = camera.position
      const tp = controls.target
      const dx = cp.x - tp.x
      const dy = cp.y - tp.y
      const dz = cp.z - tp.z
      return {
        position: { x: cp.x, y: cp.y, z: cp.z },
        target: { x: tp.x, y: tp.y, z: tp.z },
        distance: Math.sqrt(dx * dx + dy * dy + dz * dz),
      }
    })
  }

  /**
   * Assert that two camera states match within `epsilon` on every
   * component (`position.{x,y,z}`, `target.{x,y,z}`, `distance`).
   * Used as the "camera did not change" check in inhibit tests.
   */
  async expectCameraStateApproxEqual(
    actual: CameraState,
    expected: CameraState,
    epsilon = 0.01,
  ): Promise<void> {
    expect(Math.abs(actual.position.x - expected.position.x)).toBeLessThanOrEqual(epsilon)
    expect(Math.abs(actual.position.y - expected.position.y)).toBeLessThanOrEqual(epsilon)
    expect(Math.abs(actual.position.z - expected.position.z)).toBeLessThanOrEqual(epsilon)
    expect(Math.abs(actual.target.x - expected.target.x)).toBeLessThanOrEqual(epsilon)
    expect(Math.abs(actual.target.y - expected.target.y)).toBeLessThanOrEqual(epsilon)
    expect(Math.abs(actual.target.z - expected.target.z)).toBeLessThanOrEqual(epsilon)
    expect(Math.abs(actual.distance - expected.distance)).toBeLessThanOrEqual(epsilon)
  }

  /**
   * Move focus off any editable element so subsequent `page.keyboard`
   * presses are NOT routed to a text input. Targets the same canvas the
   * production camera-pan listener attaches to (`window`-level keydown).
   */
  async focusCanvas(): Promise<void> {
    await this.page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      if (active && active !== document.body) {
        try { active.blur() } catch { /* ignore */ }
      }
    })
    // A click on the canvas guarantees the page has been interacted with
    // so that synthetic key events are dispatched at the document level.
    const canvas = this.page.locator('#canvas-container canvas')
    await canvas.waitFor()
    const box = await canvas.boundingBox()
    if (!box) throw new Error('focusCanvas: canvas has no bounding box')
    // Click a corner pixel that is unlikely to hit a placed machine: the
    // top-left of the canvas. We don't care which world cell — the goal
    // is only to ensure no INPUT/TEXTAREA/SELECT/contenteditable owns
    // focus when the keyboard events fire.
    await this.page.mouse.click(box.x + 4, box.y + 4)
    await this.page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      if (active && active !== document.body) {
        const tag = active.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) {
          try { active.blur() } catch { /* ignore */ }
        }
      }
    })
  }

  /** Returns the tag name of the current `document.activeElement`. */
  async getActiveElementTag(): Promise<string> {
    return this.page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return el ? el.tagName : ''
    })
  }

  /**
   * Hold a single key down for `durationMs` then release it. Wraps the
   * `page.keyboard.down`/`waitForTimeout`/`page.keyboard.up` triplet so
   * specs do not need to repeat the hold/wait/release dance.
   */
  async holdKey(key: string, durationMs: number): Promise<void> {
    await this.page.keyboard.down(key)
    await this.page.waitForTimeout(durationMs)
    await this.page.keyboard.up(key)
    // Let one more render frame elapse so the OrbitControls update is
    // reflected in `controls.target` before the next state read.
    await this.page.waitForTimeout(50)
  }

  /**
   * Hold `modifier` together with `key` for `durationMs`. Used to verify
   * that the camera-pan listener ignores keystrokes when a modifier is
   * held (Ctrl / Meta / Alt).
   */
  async holdKeyWithModifier(modifier: string, key: string, durationMs: number): Promise<void> {
    await this.page.keyboard.down(modifier)
    await this.page.keyboard.down(key)
    await this.page.waitForTimeout(durationMs)
    await this.page.keyboard.up(key)
    await this.page.keyboard.up(modifier)
    await this.page.waitForTimeout(50)
  }

  /**
   * Block until the orbit camera is *settled* — i.e. `quietFrames`
   * consecutive rendered frames agree on every component of
   * `camera.position` and `controls.target` to within `epsilon`.
   *
   * WHY this exists: entering the sandbox (or any level) calls
   * `editorViewport.refitCameraToCurrentLevel()`, which kicks off a
   * `CameraController.zoomToFit` transition that interpolates the
   * camera for ~800 ms with `easeInOutCubic` (zero velocity at both
   * endpoints). The WSAD pan controller's contract is to
   * `cancelTransition()` on the first held-key frame (manual control
   * overrides programmatic). If a spec captures a baseline `origin`
   * state while the fit transition is still running and then presses a
   * key, the *first* measured key delta absorbs the leftover lerp step,
   * making it asymmetric vs. subsequent key deltas captured from a
   * fully-settled camera. That tiny (~0.05–0.2u) asymmetry breaks
   * `toBeCloseTo(..., 1)` perpendicularity / opposite-direction checks.
   *
   * Sampling on `requestAnimationFrame` (not on a wall-clock interval)
   * is essential: it guarantees we observe actual rendered frames, so
   * (a) we don't falsely settle while the page hasn't started rendering
   * yet, and (b) consecutive samples reflect the actual per-frame lerp
   * step from `CameraController.update(dt)`. We deliberately do NOT
   * reach into `CameraController.transition` (a private field); the
   * agree-N-frames-in-a-row sample test is the correct test-layer
   * signal that no animation is in flight.
   */
  async waitUntilSettled(options?: {
    timeoutMs?: number
    quietFrames?: number
    epsilon?: number
  }): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? 2000
    const quietFrames = options?.quietFrames ?? 10
    const epsilon = options?.epsilon ?? 1e-4
    await this.page.evaluate(
      ({ timeoutMs, quietFrames, epsilon }) => {
        return new Promise<void>((resolve, reject) => {
          const sm = (window as any).__sceneManager
          if (!sm) { reject(new Error('waitUntilSettled: __sceneManager not exposed')); return }
          const camera = sm.getCamera?.()
          const controls = sm.getControls?.()
          if (!camera || !controls) { reject(new Error('waitUntilSettled: camera/controls missing')); return }
          let last: number[] | null = null
          let quiet = 0
          const start = performance.now()
          const tick = (): void => {
            if (performance.now() - start > timeoutMs) {
              reject(new Error(`waitUntilSettled: timed out after ${timeoutMs}ms`))
              return
            }
            const cp = camera.position
            const tp = controls.target
            const sample = [cp.x, cp.y, cp.z, tp.x, tp.y, tp.z]
            if (last) {
              let agree = true
              for (let i = 0; i < 6; i++) {
                if (Math.abs(sample[i] - last[i]) > epsilon) { agree = false; break }
              }
              if (agree) quiet += 1
              else quiet = 0
              if (quiet >= quietFrames) { resolve(); return }
            }
            last = sample
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        })
      },
      { timeoutMs, quietFrames, epsilon },
    )
  }
}
