import { test, expect, clearStorageBeforeEach, CameraStateProbe } from './pom'
import type { CameraState } from './pom'

test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('Camera — keyboard pan (WSAD)', () => {
  clearStorageBeforeEach()

  /**
   * Helper: assert two camera states differ by the same delta on
   * `position` and `target` (rigid pan), with non-zero motion in the
   * world XZ plane and Y unchanged on both, and orbit distance unchanged.
   * Returns the (dx, dz) world-plane delta for direction comparisons.
   */
  function assertRigidXZPan(before: CameraState, after: CameraState, epsilon = 0.01): { dx: number; dz: number } {
    const posDx = after.position.x - before.position.x
    const posDy = after.position.y - before.position.y
    const posDz = after.position.z - before.position.z
    const tgtDx = after.target.x - before.target.x
    const tgtDy = after.target.y - before.target.y
    const tgtDz = after.target.z - before.target.z

    // Same delta on camera position and target → rigid pan.
    expect(Math.abs(posDx - tgtDx)).toBeLessThanOrEqual(epsilon)
    expect(Math.abs(posDy - tgtDy)).toBeLessThanOrEqual(epsilon)
    expect(Math.abs(posDz - tgtDz)).toBeLessThanOrEqual(epsilon)

    // Y unchanged on both.
    expect(Math.abs(posDy)).toBeLessThanOrEqual(epsilon)
    expect(Math.abs(tgtDy)).toBeLessThanOrEqual(epsilon)

    // Non-zero XZ motion.
    const planar = Math.sqrt(posDx * posDx + posDz * posDz)
    expect(planar).toBeGreaterThan(epsilon)

    // Orbit distance preserved.
    expect(Math.abs(after.distance - before.distance)).toBeLessThanOrEqual(epsilon)

    return { dx: posDx, dz: posDz }
  }

  /** Dot product of the XZ unit vectors of two world-plane deltas. */
  function directionDot(a: { dx: number; dz: number }, b: { dx: number; dz: number }): number {
    const lenA = Math.hypot(a.dx, a.dz)
    const lenB = Math.hypot(b.dx, b.dz)
    return (a.dx * b.dx + a.dz * b.dz) / (lenA * lenB)
  }

  test('W key pans the camera and target along projected-forward', async ({
    page, mainMenu, toolbar, tutorial, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()
    const camera = new CameraStateProbe(page)
    await camera.focusCanvas()

    await camera.waitUntilSettled()
    const before = await camera.getCameraState()
    await camera.holdKey('w', 300)
    const after = await camera.getCameraState()

    assertRigidXZPan(before, after)
  })

  test('S / A / D each pan the camera in mutually consistent directions', async ({
    page, mainMenu, toolbar, tutorial, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()
    const camera = new CameraStateProbe(page)
    await camera.focusCanvas()

    // Hold W → projected-forward delta.
    await camera.waitUntilSettled()
    const beforeW = await camera.getCameraState()
    await camera.holdKey('w', 300)
    const afterW = await camera.getCameraState()
    const dW = assertRigidXZPan(beforeW, afterW)

    // Hold S → should be opposite of W on the XZ plane.
    await camera.waitUntilSettled()
    const beforeS = await camera.getCameraState()
    await camera.holdKey('s', 300)
    const afterS = await camera.getCameraState()
    const dS = assertRigidXZPan(beforeS, afterS)

    // Hold D → projected-right delta.
    await camera.waitUntilSettled()
    const beforeD = await camera.getCameraState()
    await camera.holdKey('d', 300)
    const afterD = await camera.getCameraState()
    const dD = assertRigidXZPan(beforeD, afterD)

    // Hold A → should be opposite of D on the XZ plane.
    await camera.waitUntilSettled()
    const beforeA = await camera.getCameraState()
    await camera.holdKey('a', 300)
    const afterA = await camera.getCameraState()
    const dA = assertRigidXZPan(beforeA, afterA)

    // Each hold actually moved the camera meaningfully on the XZ plane.
    expect(Math.hypot(dW.dx, dW.dz)).toBeGreaterThan(0.5)
    expect(Math.hypot(dS.dx, dS.dz)).toBeGreaterThan(0.5)
    expect(Math.hypot(dD.dx, dD.dz)).toBeGreaterThan(0.5)
    expect(Math.hypot(dA.dx, dA.dz)).toBeGreaterThan(0.5)

    // S is opposite to W, A is opposite to D (within ~18°).
    expect(directionDot(dW, dS)).toBeLessThan(-0.95)
    expect(directionDot(dD, dA)).toBeLessThan(-0.95)

    // W (forward) is perpendicular to D (right) on the XZ plane.
    expect(Math.abs(directionDot(dW, dD))).toBeLessThan(0.1)
  })

  test('Camera does not pan while typing in the Sandbox project name input', async ({
    page, mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    const camera = new CameraStateProbe(page)

    // Sanity precondition: the listener IS active when canvas is focused.
    // If no production listener is wired this assertion fails first, which
    // is the correct RED signal for the whole spec.
    await camera.focusCanvas()
    await camera.waitUntilSettled()
    const sanityBefore = await camera.getCameraState()
    await camera.holdKey('w', 300)
    const sanityAfter = await camera.getCameraState()
    expect(
      Math.hypot(
        sanityAfter.position.x - sanityBefore.position.x,
        sanityAfter.position.z - sanityBefore.position.z,
      ),
    ).toBeGreaterThan(0.01)

    // Now create a project so the inline name `<input>` exists, focus it
    // by clicking the inline rename, then hold W and verify the camera
    // does NOT pan and the keystroke landed in the input.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('PanProj')
    await projectsPanel.expectSlotPresent('PanProj')

    // typeIntoSlotNameInput('PanProj', '') focuses the input and asserts
    // it is the active element without typing any characters.
    await projectsPanel.typeIntoSlotNameInput('PanProj', '')

    expect(await camera.getActiveElementTag()).toBe('INPUT')

    await camera.waitUntilSettled()
    const before = await camera.getCameraState()
    await camera.holdKey('w', 300)
    const after = await camera.getCameraState()

    // Camera unchanged.
    await camera.expectCameraStateApproxEqual(after, before)

    // The keystroke went to the input — its value now ends with "w".
    const valueAfter = await page.evaluate(() => {
      const input = document.querySelector(
        '.ui-projects-slot:not(.ui-projects-slot--empty) input.ui-projects-slot-name-input',
      ) as HTMLInputElement | null
      return input?.value ?? ''
    })
    expect(valueAfter.endsWith('w')).toBe(true)
  })

  test('Camera does not pan when modifier keys are held', async ({
    page, mainMenu, toolbar, tutorial, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()
    const camera = new CameraStateProbe(page)
    await camera.focusCanvas()

    // Sanity precondition: WSAD without modifier IS handled (RED-fail
    // signal here when no listener is wired yet).
    await camera.waitUntilSettled()
    const sanityBefore = await camera.getCameraState()
    await camera.holdKey('w', 300)
    const sanityAfter = await camera.getCameraState()
    expect(
      Math.hypot(
        sanityAfter.position.x - sanityBefore.position.x,
        sanityAfter.position.z - sanityBefore.position.z,
      ),
    ).toBeGreaterThan(0.01)

    // Use Alt+W: Ctrl+W closes the tab in many browsers and is therefore
    // unsafe here. Alt+W produces a keydown with `event.altKey === true`
    // which the production listener should treat as "modifier held → skip".
    await camera.waitUntilSettled()
    const before = await camera.getCameraState()
    await camera.holdKeyWithModifier('Alt', 'w', 300)
    const after = await camera.getCameraState()

    await camera.expectCameraStateApproxEqual(after, before)
  })
})
