import { test, expect } from './pom'

// Wider viewport so the toolbar + Projects panel layout has room.
test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('Sandbox — Projects panel', () => {
  test.beforeEach(async ({ page }) => {
    // Start every test with an empty localStorage so the projects list is
    // deterministic. Must run before the app boots.
    await page.addInitScript(() => {
      try {
        localStorage.clear()
      } catch {
        /* ignore */
      }
    })
  })

  async function enterSandbox(
    mainMenu: import('./pom/screens/MainMenuPage').MainMenuPage,
    toolbar: import('./pom/screens/ToolbarPage').ToolbarPage,
    tutorial: import('./pom/screens/TutorialOverlayPage').TutorialOverlayPage,
  ): Promise<void> {
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent(500)
    await toolbar.waitForCameraSettle()
  }

  test('Projects button is visible in Sandbox mode', async ({
    mainMenu, toolbar, tutorial,
  }) => {
    await enterSandbox(mainMenu, toolbar, tutorial)
    await toolbar.expectProjectsButtonVisible()
  })

  test('Projects button is NOT visible in campaign levels', async ({
    mainMenu, levelSelect, toolbar, tutorial,
  }) => {
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickFirstUnlocked()
    await levelSelect.expectHidden()
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent(500)
    await toolbar.expectProjectsButtonHidden()
  })

  test('Clicking Projects opens the panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await enterSandbox(mainMenu, toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
  })

  test('Clicking Projects again closes the panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await enterSandbox(mainMenu, toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
  })

  test('Empty slot list shows only the empty placeholder', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await enterSandbox(mainMenu, toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotCount(0)
    await projectsPanel.expectEmptyPlaceholderCount(1)
  })

  test('Clicking the empty row\'s Save creates a new slot', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await enterSandbox(mainMenu, toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('MyProject')

    await projectsPanel.expectSlotPresent('MyProject')
    await projectsPanel.expectSlotCount(1)
  })

  test('Clicking a slot\'s inline Save overwrites it', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await enterSandbox(mainMenu, toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // First save creates "Alpha".
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Alpha')
    await projectsPanel.expectSlotPresent('Alpha')
    await projectsPanel.expectSlotCount(1)

    // Clicking Alpha's inline Save must overwrite — no rename, no
    // duplicate row, no prompt.
    await projectsPanel.clickSlotSave('Alpha')

    await projectsPanel.expectSlotPresent('Alpha')
    await projectsPanel.expectSlotCount(1)
  })

  test('Double-click slot loads it', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid,
  }) => {
    const errors = mainMenu.collectPageErrors()
    await enterSandbox(mainMenu, toolbar, tutorial)

    // Save current (empty) state as "Beta".
    await toolbar.clickProjects()
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Beta')
    await projectsPanel.expectSlotPresent('Beta')

    // Close panel, mutate state by placing a NEW machine.
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
    await grid.dblClickCell({ x: 10, z: 10 })

    // Reopen, double-click "Beta" to load.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.doubleClickSlot('Beta')

    // Loading must succeed: toolbar still visible and no JS errors thrown.
    await toolbar.expectVisible()
    expect(errors, 'no page errors after loading project').toEqual([])
  })

  test('Delete slot removes it from the list', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await enterSandbox(mainMenu, toolbar, tutorial)
    await toolbar.clickProjects()

    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Gamma')
    await projectsPanel.expectSlotPresent('Gamma')

    await projectsPanel.deleteSlot('Gamma')
    await projectsPanel.confirmConfirm()

    await projectsPanel.expectSlotAbsent('Gamma')
    await projectsPanel.expectSlotCount(0)
  })

  test('Import button is present in Projects panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await enterSandbox(mainMenu, toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectImportButtonVisible()
  })

  test('Export button is present in Projects panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await enterSandbox(mainMenu, toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectExportButtonVisible()
  })

  test('Multi-export bundles selected projects into one file', async ({
    page, mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await enterSandbox(mainMenu, toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // Save 2 projects.
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Alpha')
    await projectsPanel.expectSlotPresent('Alpha')

    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Beta')
    await projectsPanel.expectSlotPresent('Beta')

    // Select both via plain click + ctrl+click.
    await projectsPanel.clickSlot('Alpha')
    await projectsPanel.ctrlClickSlot('Beta')
    await projectsPanel.expectSlotsSelected(['Alpha', 'Beta'])

    // Click Export, capture the download.
    const downloadPromise = page.waitForEvent('download')
    await projectsPanel.clickExport()
    const download = await downloadPromise

    // Filename should follow the bundle convention.
    expect(download.suggestedFilename()).toMatch(/^factory-bundle-.*\.json$/)

    // Read the bundle JSON and assert structure.
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer)
    }
    const text = Buffer.concat(chunks).toString('utf8')
    const parsed = JSON.parse(text) as {
      version: number
      type: string
      projects: { name: string }[]
    }
    expect(parsed.type).toBe('bundle')
    expect(parsed.version).toBe(1)
    expect(parsed.projects).toHaveLength(2)
    const names = parsed.projects.map((p) => p.name).sort()
    expect(names).toEqual(['Alpha', 'Beta'])
  })
})
