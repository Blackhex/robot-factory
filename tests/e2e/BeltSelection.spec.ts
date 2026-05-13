import { test, expect } from './pom'

test.use({ viewport: { width: 1280, height: 720 } })

/**
 * E2E tests: belt selection, deselection, mutual exclusion, and deletion.
 */

async function placeMachinesAndBelt(
  probe: import('./pom/canvas/SimulationProbe').SimulationProbe,
  grid: import('./pom/canvas/FactoryGridPage').FactoryGridPage,
) {
  // Place two machines via double-click
  await grid.dblClickCell({ x: 8, z: 10 })
  await grid.clickCell({ x: 1, z: 1 }) // deselect

  await grid.dblClickCell({ x: 12, z: 10 })
  await grid.clickCell({ x: 1, z: 1 }) // deselect

  const result = await probe.placeBeltChainViaFactoryUsingMachineRefs()
  if (!result || !result.placed || result.beltCount === 0) {
    throw new Error(`Belt placement failed: ${JSON.stringify(result)}`)
  }

  await probe.forceRendererUpdate()
  await probe.settle(500)

  return { machineA: result.machineA, machineB: result.machineB }
}

test.describe('Belt Selection — selection, deselection, deletion', () => {
  test.beforeEach(async ({ mainMenu, toolbar }) => {
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()
  })

  test('clicking on a belt segment selects it and shows belt panel', async ({
    probe, grid, belt, beltPanel,
  }) => {
    await placeMachinesAndBelt(probe, grid)

    await beltPanel.expectHidden()

    await belt.click()

    await beltPanel.expectVisible(3000)
  })

  test('clicking on empty cell deselects belt and hides belt panel', async ({
    probe, grid, belt, beltPanel,
  }) => {
    await placeMachinesAndBelt(probe, grid)

    await belt.click()
    await beltPanel.expectVisible(3000)

    await grid.clickCell({ x: 2, z: 2 })

    await beltPanel.expectHidden()
  })

  test('selecting a machine hides the belt panel', async ({
    probe, grid, belt, beltPanel, machinePanel,
  }) => {
    const { machineA } = await placeMachinesAndBelt(probe, grid)

    await belt.click()
    await beltPanel.expectVisible(3000)

    await grid.clickMachineAt(machineA)

    await beltPanel.expectHidden()
    await machinePanel.expectVisible()
  })

  test('selecting a belt hides the machine panel', async ({
    probe, grid, belt, beltPanel, machinePanel,
  }) => {
    const { machineA } = await placeMachinesAndBelt(probe, grid)

    await grid.clickMachineAt(machineA)
    await machinePanel.expectVisible()

    await belt.click()

    await machinePanel.expectHidden()
    await beltPanel.expectVisible(3000)
  })

  test('double-clicking on a belt does NOT place a machine or rotate', async ({
    probe, grid, belt, machinePanel,
  }) => {
    await placeMachinesAndBelt(probe, grid)

    const machineCountBefore = await probe.getMachineCountFromFactory()

    await belt.dblClick()

    const machineCountAfter = await probe.getMachineCountFromFactory()

    expect(machineCountAfter).toBe(machineCountBefore)
    await machinePanel.expectHidden()
  })

  test('DEL key when belt is selected removes the belt', async ({
    probe, grid, belt, beltPanel,
  }) => {
    await placeMachinesAndBelt(probe, grid)

    const beltCountBefore = await probe.getBeltCountFromFactory()
    expect(beltCountBefore).toBeGreaterThan(0)

    await belt.click()
    await beltPanel.expectVisible(3000)

    await beltPanel.pressDelete()

    await beltPanel.expectHidden()

    const beltCountAfter = await probe.getBeltCountFromFactory()
    expect(beltCountAfter).toBeLessThan(beltCountBefore)
  })

  test('belt panel delete button removes the belt', async ({
    probe, grid, belt, beltPanel,
  }) => {
    await placeMachinesAndBelt(probe, grid)

    const beltCountBefore = await probe.getBeltCountFromFactory()
    expect(beltCountBefore).toBeGreaterThan(0)

    await belt.click()
    await beltPanel.expectVisible(3000)

    await beltPanel.clickDelete()

    await beltPanel.expectHidden()

    const beltCountAfter = await probe.getBeltCountFromFactory()
    expect(beltCountAfter).toBeLessThan(beltCountBefore)
  })
})

/**
 * Reproduction: dragging from a machine's GREEN OUTPUT slot mesh and dropping
 * on another machine's body should auto-rotate the source machine so its
 * output points toward the drop target, then draw a belt from the source's
 * (now rotated) output to the target's input.
 *
 * Screenshot scenario (April 2026 user report):
 *   - Top Fabricator (TF) east at (10, 3); Bottom Fabricator (BF) east at (10, 15).
 *   - Pre-existing belt connecting TF.front (east) to BF.back (west).
 *   - Middle Fabricator (MF) at (5, 5) with rotation 'south' — UNCONNECTED.
 *     Its green output slot therefore lives on the SOUTH face (camera-visible).
 *   - Drop-target machine D at (8, 5) rotation 'east' — its orange input
 *     ('back') faces west at cell (7, 5), so once MF auto-rotates east, the
 *     resulting belt is a single segment MF.front → D.back.
 *   - User drags MF's green south-side output mesh onto D's body.
 *
 * Expected: MF auto-rotates from 'south' to 'east' (the unique strictly
 * shortest direction toward D's input), and a new belt with
 * sourceSlot='front' is created from MF to D.
 */
test.describe('Belt drawing — drag from output slot auto-rotates source machine', () => {
  test.beforeEach(async ({ mainMenu, toolbar }) => {
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()
  })

  test('dragging MF.output (south-facing) onto D rotates MF and draws a belt', async ({
    probe, grid,
  }) => {
    // Place TF, BF, MF, D directly via the factory (no UI dependency for setup).
    expect(await probe.placeMachineDirect(10, 3, 'part_fabricator')).toBe(true)
    expect(await probe.placeMachineDirect(10, 15, 'part_fabricator')).toBe(true)
    expect(await probe.placeMachineDirect(5, 5, 'part_fabricator')).toBe(true)
    expect(await probe.placeMachineDirect(8, 5, 'part_fabricator')).toBe(true)

    // Rotate TF/BF to east (default placement is 'south').
    expect(await probe.setMachineRotationDirect(10, 3, 'east')).toBe(true)
    expect(await probe.setMachineRotationDirect(10, 15, 'west')).toBe(true)
    // MF starts 'south' (default) — output on the south face, which is
    // camera-visible from the fixed isometric camera at (15, 15, 15).
    expect(await probe.setMachineRotationDirect(5, 5, 'south')).toBe(true)
    // D rotation 'east' so its input ('back') faces west — free at (7, 5).
    // This makes the east-facing MF→D belt strictly shortest, forcing
    // auto-rotation away from the equally-feasible south path.
    expect(await probe.setMachineRotationDirect(8, 5, 'east')).toBe(true)

    // Pre-existing belt TF → BF (matches the screenshot).
    expect(await probe.placeBeltChainBetween(10, 3, 10, 15)).toBe(true)
    await probe.forceRendererUpdate()
    await probe.settle(300)

    // Sanity: MF is currently 'south' and unconnected.
    expect(await probe.getMachineRotation(5, 5)).toBe('south')
    const beltsBefore = await probe.getBeltsDetailed()
    const mfBeltsBefore = beltsBefore.filter(
      (b) =>
        (b.sourceX === 5 && b.sourceZ === 5) ||
        (b.destX === 5 && b.destZ === 5),
    )
    expect(mfBeltsBefore.length).toBe(0)
    const beltCountBefore = beltsBefore.length

    // The actual user action under test: pointer-event drag from MF's GREEN
    // output slot mesh (currently on the south face) onto D's body at (8, 5).
    await grid.dragFromMachineSlotToMachine({ x: 5, z: 5 }, 'output', { x: 8, z: 5 })
    await probe.settle(300)

    // Expected outcome.
    const rotationAfter = await probe.getMachineRotation(5, 5)
    expect(rotationAfter).not.toBe('south')
    // Positive assertion: D's input lies west at (7,5), so the unique
    // shortest path from MF's output is straight east — auto-rotate must
    // land on 'east'.
    expect(rotationAfter).toBe('east')

    const beltsAfter = await probe.getBeltsDetailed()
    expect(beltsAfter.length).toBe(beltCountBefore + 1)

    const newBelt = beltsAfter.find(
      (b) => b.sourceX === 5 && b.sourceZ === 5 && b.destX === 8 && b.destZ === 5,
    )
    expect(newBelt, `Expected a new belt from MF(5,5) → D(8,5). Belts after: ${JSON.stringify(beltsAfter)}`).toBeDefined()
    expect(newBelt!.sourceSlot).toBe('front')
  })
})

// CONTRACT: pressing Enter inside the belt panel's inline rename input
// commits the rename by BLURRING the input. Enter is a familiar
// "I'm done" gesture; the per-keystroke save (via the input event)
// already persisted everything the user typed, so Enter must not
// mutate the value — only release focus. Without an explicit
// `keydown` handler in the inline name input factory, a plain
// `<input type="text">` swallows Enter (no implicit form submit /
// blur), so this test fails on current source.
test.describe('Belt Panel — inline rename: Enter commits', () => {
  test.beforeEach(async ({ mainMenu, toolbar }) => {
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()
  })

  test('Pressing Enter in the belt name input blurs it', async ({
    probe, grid, belt, beltPanel,
  }) => {
    await placeMachinesAndBelt(probe, grid)

    await belt.click()
    await beltPanel.expectVisible(3000)

    // Type a name via the panel helper. setName fires an `input`
    // event so the per-keystroke save persists "AlphaBelt" to the
    // underlying belt BEFORE the Enter press.
    await beltPanel.setName('AlphaBelt')

    // Press Enter on the (re-)focused input.
    const result = await beltPanel.pressEnterInNameInput()

    // Enter does NOT mutate the value — it is a commit gesture.
    expect(result.valueAfter).toBe('AlphaBelt')
    // Sanity: focus was on the input immediately before Enter.
    expect(result.wasFocused).toBe(true)
    // CONTRACT: after Enter the input is no longer focused.
    expect(result.isStillFocused).toBe(false)

    // Persistence round-trip: deselect by clicking an empty cell,
    // then re-click the belt. The panel re-loads the persisted name
    // into the input. If Enter regressed the per-keystroke save, the
    // re-loaded value would not be "AlphaBelt".
    await grid.clickCell({ x: 2, z: 2 })
    await beltPanel.expectHidden()
    await belt.click()
    await beltPanel.expectVisible(3000)
    await beltPanel.expectNameValue('AlphaBelt')
  })
})

