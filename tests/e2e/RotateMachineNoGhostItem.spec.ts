import { test, expect } from './pom'
import {
  buildAndRunSandboxFactory,
  waitForRenderedBeltItems,
} from './pom/scenarios/SandboxFactoryScenario'

/**
 * RED-step regression spec for UX Minor #3 — "B4 ghost-item-after-rotate
 * regression spec".
 *
 * The earlier B4 fix landed via the probe-driven `rotateMachineDirect` API
 * (covered by `SandboxLiveEdit.spec.ts > rotating a machine mid-sim leaves
 * no rendered items off the current belt path`). That path bypasses pointer
 * input. THIS spec exercises the canonical USER gesture — double-click on
 * a machine cell — so any future regression in `GridDoubleClickHandler` or
 * the renderer's response to a gesture-driven rotate cannot slip past the
 * probe-only test.
 *
 * Per the task description: this spec is permitted to pass at the RED
 * step (the orchestrator's earlier fix already addresses this in code).
 * That is the explicit "anti-regression confirmation" outcome — the spec
 * is added as a permanent guard against renderer-side regressions.
 */

test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('Sandbox — Rotate machine via gesture must not leave ghost rendered items', () => {
  test('double-click rotate on producer keeps every rendered item on a current belt path', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(120000)

    // Build and run the standard sandbox factory: a part_fabricator wired to
    // a factory_output via a 3-cell belt, with a `WheelPressSmall` recipe
    // emitting items continuously.
    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)

    await waitForRenderedBeltItems(probe)
    expect(await probe.isRunning()).toBe(true)
    expect(await probe.isPaused()).toBe(false)

    // Sanity: rendered item meshes must lie on the current belt path BEFORE
    // the rotate gesture so any failure after the gesture is attributable
    // to the rotate path, not to a pre-existing ghost.
    await probe.expectCurrentBeltPathHasSegments('current belt path must exist before rotate')
    await probe.expectRenderedItemsOnCurrentBeltPath({
      context: 'Pre-rotate baseline:',
    })

    const machinesBefore = await probe.getMachines()
    const fabricator = machinesBefore.find((m) => m.type === 'part_fabricator')
    expect(fabricator, 'producer machine must exist before rotate').toBeTruthy()
    const fabCoord = { x: fabricator!.x, z: fabricator!.z }
    const rotationBefore = await probe.getMachineRotation(fabCoord.x, fabCoord.z)
    expect(rotationBefore, 'fabricator must have a known rotation before the gesture').toBeTruthy()

    // Canonical user gesture: double-click on the existing machine cell.
    // `GridDoubleClickHandler` rotates the machine clockwise by one quarter
    // turn on this gesture path.
    await grid.dblClickCell(fabCoord)

    // Wait until the rotation actually applied (sim → factory → renderer).
    await expect.poll(
      () => probe.getMachineRotation(fabCoord.x, fabCoord.z),
      { timeout: 5000, intervals: [100] },
    ).not.toBe(rotationBefore)

    // Settle one tick + animation frame so the renderer has applied the
    // post-rotate belt path and item-instance updates.
    await probe.flushAnimationFrame()
    await probe.settle(150)
    await probe.flushAnimationFrame()

    // Belt path must still exist after auto-reroute.
    await probe.expectCurrentBeltPathHasSegments(
      'belts must have been re-routed after the gesture-driven rotate',
    )

    // Core regression assertion: every rendered item-instance must lie on a
    // current belt path segment. A ghost mesh hovering at an old slot/path
    // position the simulation no longer reports would fail this check.
    await probe.expectRenderedItemsOnCurrentBeltPath({
      context: 'After gesture-driven rotate of the producer machine:',
    })

    // Renderer must self-heal: the in-flight item count should climb back
    // to the steady-state ≥3 within a couple of ticks.
    await expect(async () => {
      const live = await probe.readItemInstancePositions()
      expect(
        live.totalCount,
        `After gesture rotate, rendered item instance count must climb back to ≥3 ` +
          `(got ${live.totalCount}). Renderer must self-heal after belt re-route.`,
      ).toBeGreaterThanOrEqual(3)
    }).toPass({ timeout: 5000, intervals: [200] })

    // Double-check after self-heal: still no ghost meshes.
    await probe.expectRenderedItemsOnCurrentBeltPath({
      context: 'After gesture-driven rotate self-heal:',
    })
  })
})
