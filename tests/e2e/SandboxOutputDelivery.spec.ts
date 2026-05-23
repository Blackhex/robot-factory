import { test, expect } from './pom'
import { buildAndRunSandboxFactory } from './pom/scenarios/SandboxFactoryScenario'

// Use a wide viewport so the PXT editor has enough room for the toolbox + workspace
test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('Sandbox — Output delivery recorder', () => {
  test('recorder can attach after being started before sandbox simulation exists', async ({
    mainMenu, toolbar, probe,
  }) => {
    await mainMenu.open()
    await probe.resetOutputDeliveryRecording()

    await probe.startOutputDeliveryRecording()
    const beforeSandbox = await probe.readOutputDeliveryRecorderState()
    expect(beforeSandbox.hasSimulation).toBe(false)
    expect(beforeSandbox.attachedFlag).toBe(false)
    expect(beforeSandbox.listenerCount).toBe(0)

    await mainMenu.clickSandbox()
    await toolbar.expectVisible()

    await probe.startOutputDeliveryRecording()
    const afterSandbox = await probe.readOutputDeliveryRecorderState()
    expect(afterSandbox.hasSimulation).toBe(true)
    expect(afterSandbox.attachedFlag).toBe(true)
    expect(afterSandbox.listenerCount).toBeGreaterThan(0)
  })
})

test.describe('Sandbox — Destination machine migration', () => {
  test('dragging the destination machine mid-sim preserves the same in-flight item', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(90000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)
    await probe.startOutputDeliveryRecording()

    const machinesBefore = await probe.getMachines()
    const fabricator = machinesBefore.find((m) => m.type === 'part_fabricator')
    const sink = machinesBefore.find((m) => m.type === 'factory_output')
    expect(fabricator, 'producer machine must exist before destination move').toBeTruthy()
    expect(sink, 'destination machine must exist before destination move').toBeTruthy()

    const inFlight = await probe.waitForBeltItem({
      minPositionOnBelt: 0.05,
      maxPositionOnBelt: 0.25,
      timeoutMs: 30000,
    })

    expect(await probe.isRunning()).toBe(true)
    expect(await probe.isPaused()).toBe(false)

    // After capturing inFlight, slow the simulation to 1 tick/sec (vs. the
    // default 10) for the drag → migration-verify window. The belt is only
    // 3 cells long, so under parallel-worker CPU contention the item can
    // drain past delivery before post-drag polling sees it. Game-time
    // semantics are preserved — only wall-clock throughput scales — so all
    // migration assertions are unaffected.
    const { migrated, movedSink } = await probe.withFastForward(1, async () => {
      const occupiedCells = new Set(machinesBefore.map((machine) => `${machine.x},${machine.z}`))
      const movedDestination = [1, 2, 3, 4, 5, 6, 7]
        .map((offset) => ({ x: sink!.x + offset, z: sink!.z }))
        .find((cell) =>
          cell.x >= 0 && cell.x < 20 &&
          cell.z >= 0 && cell.z < 20 &&
          !occupiedCells.has(`${cell.x},${cell.z}`),
        )
      expect(movedDestination, 'destination move needs an empty cell to the right').toBeTruthy()
      await grid.dragMachineToCell({ x: sink!.x, z: sink!.z }, movedDestination!)
      await probe.flushAnimationFrame()

      const machinesAfter = await probe.getMachines()
      const moved = machinesAfter.find((m) => m.id === sink!.id)
      expect(moved, 'same destination machine must still exist after drag').toBeTruthy()
      expect(moved!.x).toBeGreaterThan(sink!.x)
      expect(moved!.z).toBe(sink!.z)

      const beltsAfter = await probe.getBeltsDetailed()
      expect(
        beltsAfter.some((belt) =>
          belt.sourceX === fabricator!.x &&
          belt.sourceZ === fabricator!.z &&
          belt.destX === moved!.x &&
          belt.destZ === moved!.z,
        ),
        'belt must be recomputed to the moved destination machine',
      ).toBe(true)

      const migratedItem = await probe.waitForBeltItem({
        itemId: inFlight.id,
        timeoutMs: 15000,
      })
      expect(migratedItem.beltId).not.toBe(inFlight.beltId)

      return { migrated: migratedItem, movedSink: moved! }
    })
    void migrated
    void movedSink

    const delivered = await probe.waitForOutputDelivery(inFlight.id, sink!.id, 30000)
    expect(delivered.itemId).toBe(inFlight.id)
    expect(delivered.machineId).toBe(sink!.id)
  })
})