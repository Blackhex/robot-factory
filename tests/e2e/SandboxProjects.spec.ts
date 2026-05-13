import { test, expect } from './pom'
import { t, type Lang } from './pom/data/i18n'

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

test.describe('Sandbox — Projects panel: dblclick "+ New project" resets factory + program', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.clear() } catch { /* ignore */ }
    })
  })

  // Helper: place one machine on the grid and drop a non-trivial PXT block
  // so the destructive reset has something visible to wipe. Returns the
  // machine count and PXT workspace block count after seeding.
  async function seedFactoryAndProgram(
    grid: import('./pom/canvas/FactoryGridPage').FactoryGridPage,
    toolbar: import('./pom/screens/ToolbarPage').ToolbarPage,
    editorPanel: import('./pom/screens/EditorPanelPage').EditorPanelPage,
    pxt: import('./pom/editor/PxtEditorPage').PxtEditorPage,
    probe: import('./pom/canvas/SimulationProbe').SimulationProbe,
  ): Promise<{ machineCount: number; blockCount: number; blockTypes: string[] }> {
    await grid.expectCanvasVisible()
    await grid.dblClickCell({ x: 10, z: 10 })

    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForBlocklyWorkspaceVisible()
    await pxt.waitForToolboxInteractive()
    await pxt.addNonTrivialProgram()
    await pxt.normalizeWorkspaceShadows()
    await toolbar.clickEditor()
    await editorPanel.expectClosed()

    const machineCount = await probe.getMachineCount()
    const snapshot = await pxt.getWorkspaceBlocksSnapshot()
    expect(machineCount, 'precondition: at least one machine placed').toBeGreaterThan(0)
    expect(snapshot.count, 'precondition: workspace has more than just on-start').toBeGreaterThan(1)
    expect(snapshot.types).toContain('factory_start_machine')
    return { machineCount, blockCount: snapshot.count, blockTypes: snapshot.types }
  }

  test('Cancel preserves factory and PXT workspace', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid, editorPanel, pxt, probe,
  }) => {
    test.setTimeout(60_000)
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent(500)
    await toolbar.waitForCameraSettle()

    const seeded = await seedFactoryAndProgram(grid, toolbar, editorPanel, pxt, probe)

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.dblClickEmptyPlaceholder()
    await projectsPanel.expectConfirmModalTitle(t('en', 'projects.confirm_new_title'))

    await projectsPanel.cancelConfirm()
    await projectsPanel.expectNoModal()

    // Close panel so the editor opens in an unobstructed layout.
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()

    // Factory survived.
    expect(await probe.getMachineCount()).toBe(seeded.machineCount)

    // PXT workspace survived: re-open editor and snapshot blocks.
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForBlocklyWorkspaceVisible()
    const after = await pxt.getWorkspaceBlocksSnapshot()
    expect(after.count, 'block count unchanged after cancel').toBe(seeded.blockCount)
    expect(after.types).toContain('factory_start_machine')
  })

  test('Confirm clears factory and resets PXT workspace to on-start (EN)', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid, editorPanel, pxt, probe,
  }) => {
    test.setTimeout(60_000)
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent(500)
    await toolbar.waitForCameraSettle()

    await seedFactoryAndProgram(grid, toolbar, editorPanel, pxt, probe)

    // Re-open the editor BEFORE opening the Projects panel so the editor
    // (and its iframe) stays visible/attached during the destructive
    // reset. This isolates the test from any iframe-hidden quirks.
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForBlocklyWorkspaceVisible()

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.dblClickEmptyPlaceholder()
    await projectsPanel.expectConfirmModalTitle(t('en', 'projects.confirm_new_title'))

    await projectsPanel.confirmConfirm()
    await projectsPanel.expectNoModal()

    // Factory cleared.
    await expect.poll(() => probe.getMachineCount(), {
      message: 'machine count drops to zero after confirm',
      timeout: 10_000,
    }).toBe(0)
    await expect.poll(() => probe.getBeltCount(), {
      message: 'belt count drops to zero after confirm',
      timeout: 10_000,
    }).toBe(0)

    // The destructive reset triggers an async block-injection chain inside
    // PxtEditor (`loadWorkspaceXml` → `loadBlocksWithRegistrationReady`),
    // so poll until the workspace converges on the on-start-only state.
    await expect.poll(
      async () => (await pxt.getWorkspaceBlocksSnapshot()).types,
      {
        message: 'workspace converges to only the on-start block',
        timeout: 10_000,
      },
    ).toEqual(['pxt-on-start'])

    const after = await pxt.getWorkspaceBlocksSnapshot()
    expect(after.count, 'workspace contains exactly one block').toBe(1)
  })

  for (const lang of ['en', 'cs'] as Lang[]) {
    test(`Confirm modal uses the ${lang.toUpperCase()} translation of projects.confirm_new_title`, async ({
      mainMenu, toolbar, tutorial, projectsPanel, grid, editorPanel, pxt, probe,
    }) => {
      test.setTimeout(60_000)
      await mainMenu.open()
      // Switch to CS before entering sandbox so all subsequently-rendered
      // panels/labels start in the right language. The toolbar's lang
      // toggle defaults to flipping en ↔ cs.
      if (lang === 'cs') {
        await mainMenu.clickLanguageToggle()
        await mainMenu.expectHtmlLang('cs')
      }
      await mainMenu.clickSandbox()
      await toolbar.expectVisible()
      await tutorial.dismissIfPresent(500)
      await toolbar.waitForCameraSettle()

      await seedFactoryAndProgram(grid, toolbar, editorPanel, pxt, probe)

      await toolbar.clickProjects()
      await projectsPanel.expectOpen()
      await projectsPanel.dblClickEmptyPlaceholder()
      await projectsPanel.expectConfirmModalTitle(t(lang, 'projects.confirm_new_title'))
      await projectsPanel.cancelConfirm()
      await projectsPanel.expectNoModal()
    })
  }
})
