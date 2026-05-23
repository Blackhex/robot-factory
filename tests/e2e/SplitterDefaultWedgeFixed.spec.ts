import { test, expect } from './pom'
import { enterSandbox } from './pom/scenarios/SandboxFactoryScenario'

// Regression for the splitter "default-config + orphan-side" wedge bug.
//
// Topology under test:
//   Fabricator (Machine.A) → belt → Splitter (Machine.B) → belt → factory_output (Machine.C)
//
// The splitter has its DEFAULT `outputSidesConfig` value (7 = all three
// sides — Left, Forward, Right — enabled for round-robin). The player
// installs NO `route items to` block and NO `on item arrives` handler;
// the program just sets the fabricator's recipe and starts every machine.
//
// With the default rotation, only the splitter's Forward (primary) side
// has a downstream belt — the Left (tertiary) and Right (secondary)
// slots are orphaned.
//
// Pre-fix behaviour (the bug): `tickSplitter` honoured `outputSidesConfig`
// directly. With config=7 the round-robin cycled Left → Forward → Right,
// parking items into the orphan tertiary/secondary slots and never
// draining them. After the first cycle (~3 items, only 1 of which
// reached the belt), the splitter wedged forever because the unconnected
// output slots stayed occupied. Upstream Fabricator back-pressure made
// production stop entirely.
//
// Post-fix behaviour: `tickSplitter` now intersects `outputSidesConfig`
// with the CONNECTED side set (provided via `MachineTickEnv.isOutputConnected`
// from `Simulation.updateMachines`). With only Forward wired, every item
// routes through Forward and items flow continuously.
test.use({ viewport: { width: 1280, height: 800 } })

const FAB_X = 8
const FAB_Z = 10
const SPLITTER_X = 11
const SPLITTER_Z = 10
const OUTPUT_X = 14
const OUTPUT_Z = 10

const TEST_TIMEOUT_MS = 120_000
const DELIVERY_TIMEOUT_MS = 60_000
const MIN_DELIVERED_POST_FIX = 5

// No `route items to` and no `on item arrives` — this is what makes the
// splitter rely on its default `outputSidesConfig=7` and exercise the
// orphan-slot skip path under test.
const PROGRAM_DEFAULT_SPLITTER = [
  'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)',
  'machines.startMachine(Machine.A)',
  'machines.startMachine(Machine.B)',
  'machines.startMachine(Machine.C)',
].join('\n')

test.describe('Splitter default-config wedge — orphan sides skipped', () => {
  test('Splitter with default config and only one wired output keeps items flowing', async ({
    mainMenu, toolbar, grid, editorPanel, probe, hud,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)

    // -------- Enter Sandbox + place the three machines ---------------------
    await enterSandbox(mainMenu, toolbar)
    await grid.expectCanvasVisible()

    expect(await probe.placeMachineDirect(FAB_X, FAB_Z, 'part_fabricator')).toBe(true)
    expect(await probe.placeMachineDirect(SPLITTER_X, SPLITTER_Z, 'splitter')).toBe(true)
    expect(await probe.placeMachineDirect(OUTPUT_X, OUTPUT_Z, 'factory_output')).toBe(true)

    const machines = await probe.getMachines()
    const fabricator = machines.find((m) => m.type === 'part_fabricator')
    const splitter = machines.find((m) => m.type === 'splitter')
    const factoryOutput = machines.find((m) => m.type === 'factory_output')
    expect(fabricator, 'Fabricator must exist').toBeTruthy()
    expect(splitter, 'Splitter must exist').toBeTruthy()
    expect(factoryOutput, 'factory_output must exist').toBeTruthy()

    // -------- Belts: fab → splitter, splitter → factory_output --------------
    // With default rotation, the splitter→output belt (going east) anchors
    // on the splitter's "front" slot → primary port. Its "right" (south →
    // secondary) and "left" (north → tertiary) output slots are unwired.
    expect(await probe.placeBeltViaTestApi(FAB_X, FAB_Z, SPLITTER_X, SPLITTER_Z)).toBe(true)
    expect(await probe.placeBeltViaTestApi(SPLITTER_X, SPLITTER_Z, OUTPUT_X, OUTPUT_Z)).toBe(true)
    expect(await probe.getBeltCount()).toBeGreaterThanOrEqual(2)

    // -------- Install the no-routing program -------------------------------
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectFallbackTextareaAttached()
    await editorPanel.setFallbackProgramViaValueAssignment(PROGRAM_DEFAULT_SPLITTER)
    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    // -------- Arm the output-delivery recorder and start the simulation ----
    await probe.resetOutputDeliveryRecording()
    await probe.startOutputDeliveryRecording()

    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()
    await hud.expectVisible()

    // -------- Splitter must remain on its DEFAULT config ------------------
    // The fix changes `tickSplitter` semantics, NOT the persistent config.
    // The player's program installs no `routeItemsTo` call, so the splitter's
    // `outputSidesConfig` must stay at the default value (7 = all sides).
    // This locks in that the test exercises the orphan-skip path inside
    // `tickSplitter` rather than a player-set bitmask.
    const splitterSnap = await probe.readDiagnosticSnapshot()
    const splitterDiag = splitterSnap.machines.find((m: any) => m.id === splitter!.id)
    expect(
      splitterDiag?.outputSidesConfig,
      'Splitter must run with default outputSidesConfig=7 (all sides) so this regression exercises the orphan-skip path',
    ).toBe(7)

    // -------- Continuous delivery via the single wired side -----------------
    // Pre-fix: at most 1 item reached the output before the splitter parked
    // items into the unconnected tertiary/secondary slots and wedged.
    // Post-fix: items flow indefinitely via the single wired (Forward)
    // side, so the delivered count keeps growing.
    await expect.poll(
      async () => {
        const deliveries = await probe.readOutputDeliveries()
        return deliveries.filter((d) => d.machineId === factoryOutput!.id).length
      },
      {
        message:
          `Expected at least ${MIN_DELIVERED_POST_FIX} items delivered to factory_output through ` +
          'the splitter\'s only wired (Forward) side. Pre-fix, the splitter ran round-robin over ' +
          'all three sides per `outputSidesConfig=7`, parked items into the unconnected Left and ' +
          'Right output slots, and wedged after at most one delivery; post-fix, `tickSplitter` ' +
          'intersects the configured sides with the connected set and skips orphans.',
        timeout: DELIVERY_TIMEOUT_MS,
        intervals: [500],
      },
    ).toBeGreaterThanOrEqual(MIN_DELIVERED_POST_FIX)

    // -------- And the splitter must not be wedged ---------------------------
    // After deliveries have started flowing, the splitter must not be stuck
    // in 'blocked' with both orphan output slots filled — that is the exact
    // wedge state the fix prevents.
    const finalSnap = await probe.readDiagnosticSnapshot()
    const finalSplitter = finalSnap.machines.find((m: any) => m.id === splitter!.id)
    const wedged =
      finalSplitter?.state === 'blocked' &&
      finalSplitter?.secondaryOutputSlotType !== null &&
      finalSplitter?.tertiaryOutputSlotType !== null
    expect(
      wedged,
      'Splitter must not be wedged with both orphan output slots full — that is the pre-fix failure mode',
    ).toBe(false)
  })
})
