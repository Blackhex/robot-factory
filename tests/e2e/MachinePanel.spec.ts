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

  test('drag-and-drop moves a machine to a new cell', async ({ grid, machinePanel }) => {
    await grid.clickCell({ x: 10, z: 10 })
    await machinePanel.expectVisible()

    const originalInfo = await machinePanel.getInfoText()
    expect(originalInfo).toMatch(/^\(\d+, \d+\) · \w+$/)

    await machinePanel.clickClose()
    await machinePanel.expectHidden()

    await grid.dragCell({ x: 10, z: 10 }, { x: 10, z: 14 })

    if (!(await machinePanel.isVisibleNow())) {
      await grid.clickCell({ x: 10, z: 14 })
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
