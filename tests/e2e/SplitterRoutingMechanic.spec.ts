import { test, expect } from './pom'
import type { GridSize } from './pom/types'

// Use a wide viewport so the PXT editor has enough room for the toolbox + workspace
test.use({ viewport: { width: 1920, height: 1080 } })

const LEVEL_INDEX_SPLITTERS = 3
const SIZE: GridSize = { width: 14, height: 14 }
const TEST_TIMEOUT_MS = 180_000
const DELIVERY_TIMEOUT_MS = 60_000

// Player program: produce wheels at the fabricator (Machine.A), forward
// every item that lands at the splitter (Machine.B) out the Right side
// (the only side connected to a belt — see the layout below). The
// `events.onItemArrives` handler is the only mechanism that sets
// `outputSidesConfig` — without it, the splitter falls back to the
// default round-robin over all three sides (Left, Forward, Right) and
// parks items into unconnected output slots until those slots wedge.
const PROGRAM_ROUTE_RIGHT_ON_ARRIVAL = [
  'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)',
  'machines.startMachine(Machine.A)',
  'machines.startMachine(Machine.B)',
  'machines.startMachine(Machine.C)',
  'events.onItemArrives(Machine.B, () => {',
  '  machines.routeItemsTo(Machine.B, SplitterOutputs.Right)',
  '})',
].join('\n')

test.describe('Splitter routing — on-item-arrives → route-items-to bridge', () => {
  test('routeItemsTo invoked from onItemArrives delivers multiple items via the connected belt', async ({
    saves, mainMenu, levelSelect, toolbar, grid, machinePanel, tutorial,
    editorPanel, pxt, hud, probe,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)

    // -------- Navigate to Level 4 (splitter-eligible) -----------------------
    await saves.seedProgressUpTo(LEVEL_INDEX_SPLITTERS)
    await mainMenu.open()
    await mainMenu.expectStartButtonVisible()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickUnlocked(LEVEL_INDEX_SPLITTERS)
    await levelSelect.expectHidden()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()
    grid.useGrid(SIZE)
    await grid.expectCanvasVisible()

    // -------- Dismiss the 4-step tutorial -----------------------------------
    await tutorial.expectVisible(5000)
    await tutorial.clickNext()
    await tutorial.clickNext()
    await tutorial.clickNext()
    await tutorial.clickNext()
    await tutorial.expectHidden()

    // -------- Place machines: fabricator → splitter → factory_output --------
    await grid.dblClickCell({ x: 4, z: 7 })
    let machines = await probe.getMachines()
    expect(machines.length).toBe(1)
    expect(machines[0].type).toBe('part_fabricator')

    await grid.dblClickCell({ x: 7, z: 7 })
    await grid.clickCell({ x: 7, z: 7 })
    await machinePanel.expectVisible()
    await machinePanel.selectType('splitter')
    await machinePanel.expectTypeValue('splitter')
    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    await grid.dblClickCell({ x: 10, z: 7 })
    await grid.clickCell({ x: 10, z: 7 })
    await machinePanel.expectVisible()
    await machinePanel.selectType('factory_output')
    await machinePanel.expectTypeValue('factory_output')
    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    machines = await probe.getMachines()
    const fabricator = machines.find((m) => m.type === 'part_fabricator')
    const splitter = machines.find((m) => m.type === 'splitter')
    const factoryOutput = machines.find((m) => m.type === 'factory_output')
    expect(fabricator).toBeTruthy()
    expect(splitter).toBeTruthy()
    expect(factoryOutput).toBeTruthy()

    // -------- Connect belts: fabricator→splitter and splitter→output --------
    // The splitter→output belt occupies exactly ONE of the splitter's three
    // output slots. With the player's handler routing every item to the
    // connected side, all items flow through; without it (the bug under
    // test), the default round-robin parks items into the two unconnected
    // sides and wedges after the FIRST successful park to the connected belt.
    expect(await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, splitter!.x, splitter!.z,
    )).toBe(true)
    expect(await probe.placeBeltViaTestApi(
      splitter!.x, splitter!.z, factoryOutput!.x, factoryOutput!.z,
    )).toBe(true)
    expect(await probe.getBeltCount()).toBeGreaterThanOrEqual(2)

    // -------- Open editor & install the routing program --------------------
    await toolbar.clickEditor()
    await editorPanel.expectOpen()

    const isPxtLoaded = await pxt.isPxtIframeVisible(3000)
    if (isPxtLoaded) {
      await pxt.setFallbackProgramViaValueAssignment(PROGRAM_ROUTE_RIGHT_ON_ARRIVAL)
    } else {
      await editorPanel.expectFallbackTextareaVisible()
      await editorPanel.fillFallbackProgram(PROGRAM_ROUTE_RIGHT_ON_ARRIVAL)
    }
    await editorPanel.expectFallbackValue(PROGRAM_ROUTE_RIGHT_ON_ARRIVAL)

    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    // -------- Arm the output-delivery recorder and start the simulation -----
    await probe.resetOutputDeliveryRecording()
    await probe.startOutputDeliveryRecording()

    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()
    await hud.expectVisible()

    // -------- Failing assertion (A): handler actually fired ---------------
    // The DIRECT proof that the on-item-arrives → route-items-to bridge is
    // working end-to-end is that the splitter's persistent
    // `outputSidesConfig` flips from the default 7 (all sides round-robin)
    // to 4 (Right only = bit 4). The ONLY path that mutates this field is
    // the SET_OUTPUT_SIDES command dispatched from the player's handler;
    // if `PxtEditor.triggerOnItemArrives` is missing (the production bug),
    // the bridge in `wireSimulationEffects` returns `[]` for every arrival,
    // no SET_OUTPUT_SIDES is ever enqueued, and `outputSidesConfig` stays
    // at 7 forever — regardless of grid layout or belt drain timing.
    await expect.poll(
      async () => {
        const snap = await probe.readDiagnosticSnapshot()
        const s = snap.machines.find((m: any) => m.id === splitter!.id)
        return s?.outputSidesConfig ?? null
      },
      {
        message:
          'Expected splitter.outputSidesConfig to flip from default 7 to 4 (Right ' +
          'only) within the timeout. SET_OUTPUT_SIDES is dispatched only by the ' +
          'player\'s `routeItemsTo` call inside `events.onItemArrives`; if the ' +
          'PxtEditor.triggerOnItemArrives delegation is absent (the production bug), ' +
          'no SET_OUTPUT_SIDES is ever enqueued and the config stays at 7 forever.',
        timeout: DELIVERY_TIMEOUT_MS,
        intervals: [500],
      },
    ).toBe(4)

    // -------- Failing assertion (B): handler keeps firing -----------------
    // With the fix in place, items flow continuously via the connected
    // Right belt. Without the fix the assertion above already fails, but
    // we keep this end-to-end delivery check to pin the user-visible
    // symptom from the bug report: "only the first assembly reached the
    // goal; subsequent items wedged the splitter".
    await expect.poll(
      async () => {
        const deliveries = await probe.readOutputDeliveries()
        return deliveries.filter((d) => d.machineId === factoryOutput!.id).length
      },
      {
        message:
          'Expected at least 5 items delivered to factory_output via the splitter\'s ' +
          'Right side. The on-item-arrives → route-items-to bridge must dispatch a ' +
          'SET_OUTPUT_SIDES command for every arriving item; today the bridge silently ' +
          'returns [] because PxtEditor lacks a triggerOnItemArrives delegation, so the ' +
          'splitter wedges with at most 2 items reaching the connected belt.',
        timeout: DELIVERY_TIMEOUT_MS,
        intervals: [500],
      },
    ).toBeGreaterThanOrEqual(5)
  })
})
