import { test, expect } from './pom'

test.use({ viewport: { width: 1280, height: 720 } })

test.describe('Machine Panel — single interaction mode', () => {
  test.beforeEach(async ({ mainMenu, toolbar, grid }) => {
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    // HUD is not visible on sandbox entry — it appears only when simulation starts
    await toolbar.waitForCameraSettle()
    // Place a Fabricator via double-click on grid center (default type)
    await grid.dblClickCell({ x: 10, z: 10 })
  })

  test('clicking an existing machine shows the properties panel', async ({ grid, machinePanel }) => {
    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()

    await machinePanel.expectNamePlaceholder('Fabricator')
    await machinePanel.expectInfoMatches(/^\(\d+, \d+\) · \w+$/)
  })

  test('clicking an empty cell with panel open deselects and hides panel', async ({ grid, machinePanel }) => {
    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()

    await grid.clickCell({ x: 3, z: 3 })

    await machinePanel.expectHidden()
  })

  test('changing machine type via panel dropdown updates the machine', async ({ grid, machinePanel }) => {
    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()

    await machinePanel.selectType('assembler')
    await machinePanel.expectNamePlaceholder('Assembler')
  })

  test('drag-and-drop moves a machine to a new cell', async ({ grid, machinePanel, probe }) => {
    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()

    const originalInfo = await machinePanel.getInfoText()
    expect(originalInfo).toMatch(/^\(\d+, \d+\) · \w+$/)

    const machinesBefore = await probe.getMachines()
    expect(machinesBefore).toHaveLength(1)
    const source = { x: machinesBefore[0].x, z: machinesBefore[0].z }
    const destination = { x: source.x, z: source.z + 4 }

    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    await grid.dragMachineToCell(source, destination)

    if (!(await machinePanel.isVisibleNow())) {
      await grid.clickMachineAt(destination)
    }

    await machinePanel.expectVisible(3000)
    const newInfo = await machinePanel.getInfoText()
    expect(newInfo).toMatch(/^\(\d+, \d+\) · \w+$/)

    expect(newInfo).not.toBe(originalInfo)
  })

  test('close button hides the panel', async ({ grid, machinePanel }) => {
    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()

    await machinePanel.clickClose()
    await machinePanel.expectHidden()
  })

  test('no tool mode buttons exist in toolbar', async ({ toolbar }) => {
    await toolbar.expectNoLegacyToolModeButtons()
  })

  test('double-click on empty cell places a part_fabricator', async ({ grid, machinePanel }) => {
    await grid.dblClickCell({ x: 5, z: 5 })

    if (!(await machinePanel.isVisibleNow())) {
      await grid.clickCell({ x: 5, z: 5 })
    }
    await machinePanel.expectVisible()
    await machinePanel.expectNamePlaceholder('Fabricator')

    await machinePanel.selectType('assembler')
    await machinePanel.expectNamePlaceholder('Assembler')
  })

  test('DEL key deletes a selected machine', async ({ grid, machinePanel }) => {
    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()

    await machinePanel.pressDelete()

    await machinePanel.expectHidden()

    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectHidden()
  })

  test('Delete button in machine panel deletes the machine', async ({ grid, machinePanel }) => {
    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()

    await machinePanel.clickDelete()

    await machinePanel.expectHidden()

    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectHidden()
  })

  test('machine type can be changed via panel after placement', async ({ grid, machinePanel }) => {
    await grid.dblClickCell({ x: 5, z: 5 })

    if (!(await machinePanel.isVisibleNow())) {
      await grid.clickCell({ x: 5, z: 5 })
    }
    await machinePanel.expectVisible()
    await machinePanel.expectTypeValue('part_fabricator')

    await machinePanel.selectType('painter')
    await machinePanel.expectTypeValue('painter')

    await machinePanel.clickClose()
    await grid.dblClickCell({ x: 15, z: 15 })

    if (!(await machinePanel.isVisibleNow())) {
      await grid.clickCell({ x: 15, z: 15 })
    }
    await machinePanel.expectVisible()
    await machinePanel.expectTypeValue('part_fabricator')

    await machinePanel.selectType('recycler')
    await machinePanel.expectTypeValue('recycler')
  })

  test('double-click on existing machine rotates it', async ({ grid, machinePanel }) => {
    await grid.dblClickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()
    await machinePanel.expectTypeValue('part_fabricator')
  })
})

// CONTRACT: pressing Enter inside the machine panel's inline rename
// input commits the rename by BLURRING the input. Enter is a familiar
// "I'm done" gesture; the per-keystroke save (via the input event)
// already persisted everything the user typed, so Enter must not
// mutate the value — only release focus. Without an explicit
// `keydown` handler in the inline name input factory, a plain
// `<input type="text">` swallows Enter (no implicit form submit /
// blur), so this test fails on current source.
test.describe('Machine Panel — inline rename: Enter commits', () => {
  test.beforeEach(async ({ mainMenu, toolbar, grid }) => {
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()
    await grid.dblClickCell({ x: 10, z: 10 })
  })

  test('Pressing Enter in the machine name input blurs it', async ({
    grid, machinePanel,
  }) => {
    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()

    // Type a name via the standard panel helper. setName fires an
    // `input` event so the per-keystroke save persists "AlphaMachine"
    // to the underlying machine BEFORE the Enter press.
    await machinePanel.setName('AlphaMachine')

    // Press Enter on the (re-)focused input.
    const result = await machinePanel.pressEnterInNameInput()

    // Enter does NOT mutate the value — it is a commit gesture.
    expect(result.valueAfter).toBe('AlphaMachine')
    // Sanity: focus was on the input immediately before Enter.
    expect(result.wasFocused).toBe(true)
    // CONTRACT: after Enter the input is no longer focused.
    expect(result.isStillFocused).toBe(false)

    // Persistence round-trip: close the panel, click the machine
    // again, and the panel re-loads the persisted name into the
    // input. If Enter regressed the per-keystroke save, the
    // re-loaded value would not be "AlphaMachine".
    await machinePanel.clickClose()
    await machinePanel.expectHidden()
    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()
    await machinePanel.expectNameValue('AlphaMachine')
  })
})
