import { test, expect } from './pom'
import type { GridSize } from './pom/types'

// Wide viewport for the PXT editor + workspace.
test.use({ viewport: { width: 1920, height: 1080 } })

const LEVEL_INDEX_SPLITTERS = 3
const SIZE: GridSize = { width: 14, height: 14 }
const TEST_TIMEOUT_MS = 180_000
const DELIVERY_TIMEOUT_MS = 60_000

/**
 * RED — Per-item, synchronous routing via the new
 * `machines.routeCurrentItemTo(machine, side)` block.
 *
 * Mirrors `SplitterRoutingMechanic.spec.ts` at minimal scale but
 * differs in the player program:
 *   - The handler uses `routeCurrentItemTo`, NOT `routeItemsTo`.
 *   - The splitter's persistent `outputSidesConfig` MUST stay at the
 *     default `7` (Left | Forward | Right) — that is the whole point
 *     of the per-item directive (no sticky-config mutation).
 *   - Items still reach a factory_output through the splitter,
 *     proving the per-item override is honoured tick-by-tick.
 *
 * Layout (minimum needed to mirror the user's Assembly scenario):
 *
 *     Fabricator → Splitter (Machine.B) → factory_output
 *
 * One downstream belt off the splitter's Right side suffices for the
 * delivery proof; the handler always routes to Right for clean items.
 * (Defective items would route Forward — left unwired in this minimal
 * scaffold so a defective produced by the fabricator simply wedges
 * the splitter's Forward slot. The fabricator does not emit defectives
 * at this level without a dedicated recipe, so the deliveries
 * assertion stays clean.)
 *
 * The test FAILS against the current codebase because:
 *   - The PXT block `factory_route_current_item_to` does not exist,
 *     so `machines.routeCurrentItemTo` is undefined in the interpreter
 *     namespace and the handler body throws on the first arrival.
 *   - With no SET_OUTPUT_SIDES emitted and no per-item override
 *     enqueued, the splitter falls back to default round-robin and
 *     wedges into the two unconnected sides.
 */
const PROGRAM_ROUTE_CURRENT_RIGHT = [
  'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)',
  'machines.startMachine(Machine.A)',
  'machines.startMachine(Machine.B)',
  'machines.startMachine(Machine.C)',
  'events.onItemArrives(Machine.B, () => {',
  '  if (logic.currentItemIsDefective()) {',
  '    machines.routeCurrentItemTo(Machine.B, SplitterOutputs.Forward)',
  '  } else {',
  '    machines.routeCurrentItemTo(Machine.B, SplitterOutputs.Right)',
  '  }',
  '})',
].join('\n')

test.describe('Sandbox — routeCurrentItemTo synchronous per-item routing', () => {
  test('routeCurrentItemTo inside onItemArrives delivers items WITHOUT mutating sticky outputSidesConfig', async ({
    saves, mainMenu, levelSelect, toolbar, grid, machinePanel, tutorial,
    editorPanel, pxt, hud, probe,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)

    // -------- Navigate to splitter-eligible level --------------------------
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

    // -------- Dismiss tutorial ---------------------------------------------
    await tutorial.expectVisible(5000)
    await tutorial.clickNext()
    await tutorial.clickNext()
    await tutorial.clickNext()
    await tutorial.clickNext()
    await tutorial.expectHidden()

    // -------- Place: fabricator → splitter → factory_output ---------------
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

    expect(await probe.placeBeltViaTestApi(
      fabricator!.x, fabricator!.z, splitter!.x, splitter!.z,
    )).toBe(true)
    expect(await probe.placeBeltViaTestApi(
      splitter!.x, splitter!.z, factoryOutput!.x, factoryOutput!.z,
    )).toBe(true)
    expect(await probe.getBeltCount()).toBeGreaterThanOrEqual(2)

    // -------- Install program via PXT (or fallback textarea) ---------------
    await toolbar.clickEditor()
    await editorPanel.expectOpen()

    const isPxtLoaded = await pxt.isPxtIframeVisible(3000)
    if (isPxtLoaded) {
      await pxt.setFallbackProgramViaValueAssignment(PROGRAM_ROUTE_CURRENT_RIGHT)
    } else {
      await editorPanel.expectFallbackTextareaVisible()
      await editorPanel.fillFallbackProgram(PROGRAM_ROUTE_CURRENT_RIGHT)
    }
    await editorPanel.expectFallbackValue(PROGRAM_ROUTE_CURRENT_RIGHT)

    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    // -------- Run -----------------------------------------------------------
    await probe.resetOutputDeliveryRecording()
    await probe.startOutputDeliveryRecording()

    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()
    await hud.expectVisible()

    // -------- Failing assertion (A): items DO get delivered ----------------
    // The per-item override path enqueues a ROUTE_CURRENT_ITEM_TO command
    // per arrival → the splitter routes each item to the connected Right
    // belt → factory_output records the delivery. Without
    // `machines.routeCurrentItemTo` defined on the interpreter, the
    // handler body throws on first arrival, no override is enqueued,
    // and the splitter wedges within 1-2 items via default round-robin.
    await expect.poll(
      async () => {
        const deliveries = await probe.readOutputDeliveries()
        return deliveries.filter((d) => d.machineId === factoryOutput!.id).length
      },
      {
        message:
          'Expected at least 5 items delivered to factory_output via the per-item ' +
          'routeCurrentItemTo override. Today the block does not exist, the handler ' +
          'throws, and the splitter wedges with at most 2 deliveries before default ' +
          'round-robin parks items into the two unconnected output slots.',
        timeout: DELIVERY_TIMEOUT_MS,
        intervals: [500],
      },
    ).toBeGreaterThanOrEqual(5)

    // -------- Failing assertion (B): sticky config UNCHANGED --------------
    // `routeCurrentItemTo` MUST NOT mutate the splitter's persistent
    // `outputSidesConfig`. With the sticky path (`routeItemsTo`) the
    // value would flip from 7 (default, all sides) to 4 (Right only).
    // The per-item path leaves the field at 7 forever — that is the
    // user-visible discriminator between the two blocks.
    const snap = await probe.readDiagnosticSnapshot()
    const splitterSnap = snap.machines.find((m: { id: string }) => m.id === splitter!.id) as
      | { outputSidesConfig?: number }
      | undefined
    expect(
      splitterSnap?.outputSidesConfig,
      'routeCurrentItemTo must leave the sticky multiplex config at the default 7',
    ).toBe(7)
  })
})
