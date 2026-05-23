import { test, expect, clearStorageBeforeEach } from './pom'
import { t, type Lang } from './pom/data/i18n'

// Wider viewport so the toolbar + Projects panel layout has room.
test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('Sandbox — Projects panel', () => {
  clearStorageBeforeEach()

  test('Projects button is visible in Sandbox mode', async ({
    mainMenu, toolbar, tutorial,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
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
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
  })

  test('Clicking Projects again closes the panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
  })

  test('Empty slot list shows only the empty placeholder', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotCount(0)
    await projectsPanel.expectEmptyPlaceholderCount(1)
  })

  test('Clicking the empty row\'s Save creates a new slot', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
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
    await mainMenu.enterSandboxFast(toolbar, tutorial)
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
    await mainMenu.enterSandboxFast(toolbar, tutorial)

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
    await mainMenu.enterSandboxFast(toolbar, tutorial)
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
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectImportButtonVisible()
  })

  test('Export button is present in Projects panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectExportButtonVisible()
  })

  test('Multi-export bundles selected projects into one file', async ({
    page, mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
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

test.describe('Sandbox — Projects panel: keyboard toggle (Q)', () => {
  clearStorageBeforeEach()

  test('Q opens the Projects panel in Sandbox', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()

    await projectsPanel.expectClosed()
    await toolbar.expectProjectsButtonClosed()
    const beforeBox = await grid.getCanvasContainerBoundingBox()
    expect(beforeBox, 'canvas container has a bounding box before opening projects').not.toBeNull()

    await projectsPanel.blurActiveElement()
    await toolbar.pressProjectsShortcut()

    await projectsPanel.expectOpen()
    await toolbar.expectProjectsButtonOpen()

    const afterBox = await grid.getCanvasContainerBoundingBox()
    expect(afterBox, 'canvas container has a bounding box after opening projects').not.toBeNull()
    expect(
      afterBox!.x,
      `canvas left edge (x=${afterBox!.x}) must move right of the pre-open ` +
        `left edge (x=${beforeBox!.x}) — the existing --rf-canvas-left reflow ` +
        `must run when Q opens the Projects panel.`,
    ).toBeGreaterThan(beforeBox!.x)
  })

  test('Q closes the Projects panel in Sandbox', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()

    const baseline = await grid.getCanvasContainerBoundingBox()
    expect(baseline, 'canvas container has a bounding box at the all-closed baseline').not.toBeNull()

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await toolbar.expectProjectsButtonOpen()
    const opened = await grid.getCanvasContainerBoundingBox()
    expect(opened, 'canvas container has a bounding box while projects are open').not.toBeNull()
    expect(opened!.width, 'canvas shrank when Projects opened').toBeLessThan(baseline!.width)

    await projectsPanel.blurActiveElement()
    await toolbar.pressProjectsShortcut()

    await projectsPanel.expectClosed()
    await toolbar.expectProjectsButtonClosed()
    await projectsPanel.expectResizeHandleHidden()

    const restored = await grid.getCanvasContainerBoundingBox()
    expect(restored, 'canvas container has a bounding box after closing').not.toBeNull()
    expect(
      Math.abs(restored!.x - baseline!.x),
      `canvas left edge (x=${restored!.x}) must restore to the baseline ` +
        `(x=${baseline!.x}) once Q closes the Projects panel.`,
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(restored!.width - baseline!.width),
      `canvas width (${restored!.width}) must restore to the baseline ` +
        `(${baseline!.width}) once Q closes the Projects panel.`,
    ).toBeLessThanOrEqual(1)
  })

  test('Q does NOT trigger while typing in a project-name input', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Test')
    await projectsPanel.expectSlotPresent('Test')

    await projectsPanel.focusSlotNameInput('Test')
    await projectsPanel.pressKey('End')
    await projectsPanel.pressKey('q')

    await projectsPanel.expectSlotName('Testq')
    await projectsPanel.expectOpen()
    await toolbar.expectProjectsButtonOpen()

    await projectsPanel.blurActiveElement()
    await toolbar.pressProjectsShortcut()
    await projectsPanel.expectClosed()
    await toolbar.expectProjectsButtonClosed()
  })

  test('Q is ignored on the main menu', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid,
  }) => {
    await mainMenu.open()
    await mainMenu.expectVisible()

    const before = await grid.getCanvasContainerBoundingBox()
    expect(before, 'canvas container has a bounding box on the main menu').not.toBeNull()

    await projectsPanel.blurActiveElement()
    await toolbar.pressProjectsShortcut()

    await projectsPanel.expectClosed()

    const after = await grid.getCanvasContainerBoundingBox()
    expect(after, 'canvas container has a bounding box after pressing Q on main menu').not.toBeNull()
    expect(
      Math.abs(after!.x - before!.x),
      `canvas left edge (x=${after!.x}) must not change when Q is pressed ` +
        `on the main menu (baseline x=${before!.x}).`,
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(after!.width - before!.width),
      `canvas width (${after!.width}) must not change when Q is pressed ` +
        `on the main menu (baseline width=${before!.width}).`,
    ).toBeLessThanOrEqual(1)

    await mainMenu.enterSandbox(toolbar, tutorial)
    await grid.waitReady()
    await projectsPanel.expectClosed()
    await projectsPanel.blurActiveElement()
    await toolbar.pressProjectsShortcut()
    await projectsPanel.expectOpen()
    await toolbar.expectProjectsButtonOpen()
  })
})

test.describe('Sandbox — Projects panel: dblclick "+ New project" resets factory + program', () => {
  clearStorageBeforeEach()

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
    await mainMenu.enterSandboxFast(toolbar, tutorial)

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
    await mainMenu.enterSandboxFast(toolbar, tutorial)

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
      mainMenu, toolbar, projectsPanel, grid, editorPanel, pxt, probe,
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

// REQUIREMENT: while the Projects panel is open in the Sandbox, clicks
// on the 3D canvas (or anywhere outside the panel that isn't a registered
// ignore element) and the Escape key must dismiss the panel. Clicks on
// the toolbar Projects button (toggle), the resize handle, or inside an
// open `.ui-modal-backdrop` must NOT cause an unwanted dismiss.
test.describe('Sandbox — Projects panel: outside click and Escape dismiss', () => {
  clearStorageBeforeEach()

  test('clicking the 3D canvas while panel is open closes the panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // Click an empty cell well away from the panel and the toolbar.
    await grid.clickCell({ x: 15, z: 15 })

    await projectsPanel.expectClosed()
  })

  test('clicking the toolbar Projects button while open closes the panel (toggle preserved)', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // First toggle: must close (NOT immediately re-open from a stray
    // outside-click handler firing on the same pointerdown).
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()

    // Second: must re-open. If the outside handler also fired, we'd
    // observe a flip-flop / failure here.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // Third: closes again.
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
  })

  test('dragging the resize handle does NOT close the panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.dragResizeHandle(40)

    await projectsPanel.expectOpen()
  })

  test('clicks inside the new-project confirm modal do not close the panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid, page,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)

    // Place a machine so that the dblclick on "+ New project" produces a
    // meaningful destructive confirmation.
    await grid.dblClickCell({ x: 10, z: 10 })

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.dblClickEmptyPlaceholder()
    await projectsPanel.expectConfirmModalTitle(t('en', 'projects.confirm_new_title'))

    // Click somewhere INSIDE the modal that is not a button (the title).
    // This must not dismiss the panel and must not close the modal.
    await page.locator('.ui-modal .ui-modal-title').click()

    await expect(page.locator('.ui-modal')).toHaveCount(1)
    await projectsPanel.expectOpen()

    await projectsPanel.cancelConfirm()
    await projectsPanel.expectNoModal()
    await projectsPanel.expectOpen()
  })

  test('pressing Escape while panel is open closes the panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel, page,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await page.keyboard.press('Escape')

    await projectsPanel.expectClosed()
  })

  test('Escape closes a modal first; second Escape closes the panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid, page,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await grid.dblClickCell({ x: 10, z: 10 })

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.dblClickEmptyPlaceholder()
    await projectsPanel.expectConfirmModalTitle(t('en', 'projects.confirm_new_title'))

    // First Escape: modal handles it (and stops it from also dismissing
    // the panel). Modal closes; panel stays open.
    await page.keyboard.press('Escape')
    await expect(page.locator('.ui-modal')).toHaveCount(0)
    await projectsPanel.expectOpen()

    // Second Escape: panel handles it now that the modal is gone.
    await page.keyboard.press('Escape')
    await projectsPanel.expectClosed()
  })
})

// REQUIREMENT: the Projects panel supports user-controlled ordering of
// saved-project rows. Each saved row exposes a drag handle (grip), the
// "+ New project" placeholder does NOT, and the row order can be
// rearranged by HTML5 drag-and-drop, by Alt+Arrow keyboard moves, and
// across multi-select drags. The new order persists to localStorage via
// `setSlotOrder` and survives a page reload. The placeholder is pinned
// to the bottom and dragging a row never triggers the destructive load
// flow.
test.describe('Sandbox — Projects panel: drag-and-drop reordering', () => {
  clearStorageBeforeEach()

  /** Save N named projects sequentially via the empty placeholder. */
  async function saveProjects(
    projectsPanel: import('./pom/screens/ProjectsPanelPage').ProjectsPanelPage,
    names: string[],
  ): Promise<void> {
    for (const name of names) {
      await projectsPanel.clickEmptyPlaceholderSave()
      await projectsPanel.fillPromptAndConfirm(name)
      await projectsPanel.expectSlotPresent(name)
    }
  }

  test('drag handle is present on saved-project rows but NOT on the "+ New project" placeholder', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await saveProjects(projectsPanel, ['Alpha'])

    // Saved rows expose the grip.
    await expect(projectsPanel.slotGrip('Alpha')).toBeVisible()
    // Placeholder must NOT have a grip.
    await expect(
      projectsPanel.placeholderGrip(),
      'placeholder row must not render a drag handle',
    ).toHaveCount(0)
  })

  test('dragging Beta above Alpha reorders the rendered list to ["Beta", "Alpha", "Gamma"]', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await saveProjects(projectsPanel, ['Alpha', 'Beta', 'Gamma'])

    await projectsPanel.dragSlot('Beta', 'Alpha', 'before')

    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Alpha', 'Gamma'])
  })

  test('multi-select drag preserves relative order of the selected rows', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await saveProjects(projectsPanel, ['Alpha', 'Beta', 'Gamma', 'Delta'])

    // Pick Alpha and Gamma — non-contiguous in the list — and drag the
    // pair below Delta. Their relative order in the dragged set
    // (Alpha-before-Gamma) must be preserved at the drop site.
    await projectsPanel.clickSlot('Alpha')
    await projectsPanel.ctrlClickSlot('Gamma')
    await projectsPanel.expectSlotsSelected(['Alpha', 'Gamma'])

    await projectsPanel.dragSlot('Gamma', 'Delta', 'after')

    expect(await projectsPanel.getProjectOrder()).toEqual([
      'Beta',
      'Delta',
      'Alpha',
      'Gamma',
    ])
  })

  test('"+ New project" placeholder stays pinned to the bottom even when a row is dropped onto it', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await saveProjects(projectsPanel, ['Alpha', 'Beta'])

    // Drop Alpha onto the placeholder. Production must clamp the drop to
    // the last real-slot index — Alpha lands as the last project, NOT
    // after the placeholder, and the placeholder remains last.
    await projectsPanel.dropOnPlaceholder('Alpha')

    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Alpha'])
    await projectsPanel.expectPlaceholderIsLast()
  })

  test('Alt+ArrowDown / Alt+ArrowUp reorder the focused slot row', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await saveProjects(projectsPanel, ['Alpha', 'Beta', 'Gamma'])

    // Sanity: starting order matches the save order.
    expect(await projectsPanel.getProjectOrder()).toEqual(['Alpha', 'Beta', 'Gamma'])

    await projectsPanel.pressKeyOnSlot('Alpha', 'ArrowDown', ['Alt'])
    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Alpha', 'Gamma'])

    await projectsPanel.pressKeyOnSlot('Alpha', 'ArrowDown', ['Alt'])
    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Gamma', 'Alpha'])

    await projectsPanel.pressKeyOnSlot('Alpha', 'ArrowUp', ['Alt'])
    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Alpha', 'Gamma'])

    await projectsPanel.pressKeyOnSlot('Alpha', 'ArrowUp', ['Alt'])
    expect(await projectsPanel.getProjectOrder()).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  test('keyboard reorder keeps focus on the moved row across consecutive Alt+Arrow presses', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await saveProjects(projectsPanel, ['Alpha', 'Beta', 'Gamma'])
    expect(await projectsPanel.getProjectOrder()).toEqual(['Alpha', 'Beta', 'Gamma'])

    // Focus Alpha exactly once. The whole point of this test is that
    // we never re-focus between key presses — the handler itself must
    // restore focus to the moved row, and that focus must SURVIVE the
    // subsequent panel re-render triggered by `wireProjectsPanel`.
    await projectsPanel.focusSlot('Alpha')
    expect(
      await projectsPanel.getFocusedSlotName(),
      'Alpha row should be focused after focusSlot()',
    ).toBe('Alpha')

    // First Alt+ArrowDown — Alpha moves down one position; focus must
    // STILL be on Alpha (not on <body>, not on Beta).
    await projectsPanel.pressKey('ArrowDown', ['Alt'])
    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Alpha', 'Gamma'])
    expect(
      await projectsPanel.getFocusedSlotName(),
      'after first Alt+ArrowDown, focus must follow the moved Alpha row',
    ).toBe('Alpha')

    // Second consecutive Alt+ArrowDown WITHOUT re-focusing. If the
    // first press dropped focus to <body>, the controller's
    // "focus is on a slot row" guard will silently drop this press.
    await projectsPanel.pressKey('ArrowDown', ['Alt'])
    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Gamma', 'Alpha'])
    expect(
      await projectsPanel.getFocusedSlotName(),
      'after second Alt+ArrowDown, focus must still follow the moved Alpha row',
    ).toBe('Alpha')

    // Two consecutive Alt+ArrowUp's — same invariant in reverse.
    await projectsPanel.pressKey('ArrowUp', ['Alt'])
    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Alpha', 'Gamma'])
    expect(
      await projectsPanel.getFocusedSlotName(),
      'after first Alt+ArrowUp, focus must follow the moved Alpha row',
    ).toBe('Alpha')

    await projectsPanel.pressKey('ArrowUp', ['Alt'])
    expect(await projectsPanel.getProjectOrder()).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(
      await projectsPanel.getFocusedSlotName(),
      'after second Alt+ArrowUp, focus must still follow the moved Alpha row',
    ).toBe('Alpha')
  })

  test('dragging a slot row does NOT trigger the destructive load flow', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid, probe,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)

    // Place a machine so that an accidental load (which clears the
    // factory back to the saved snapshot) would be observable as a
    // machine-count change.
    await grid.dblClickCell({ x: 10, z: 10 })
    const beforeCount = await probe.getMachineCount()
    expect(beforeCount).toBeGreaterThan(0)

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // Save the current factory under two names so we have two slots to
    // drag between.
    await saveProjects(projectsPanel, ['Alpha', 'Beta'])

    // Now place an extra machine to differentiate the live factory from
    // the saved snapshots. If onLoadSlot ever fires during the drag,
    // this extra machine will be wiped on reload.
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
    await grid.dblClickCell({ x: 12, z: 10 })
    const afterPlace = await probe.getMachineCount()
    expect(afterPlace).toBe(beforeCount + 1)

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.dragSlot('Beta', 'Alpha', 'before')

    // Drag must not trigger a load — live factory state is untouched.
    expect(await probe.getMachineCount()).toBe(afterPlace)
  })

  // ---------- live preview during drag --------------------------------
  // The visual feedback for an in-flight drag is the dragged row
  // animating into its would-be drop position INSIDE the list. These
  // tests pin the contract: mid-drag DOM order matches the order the
  // user would see if they released right now.

  test('mid-drag, the dragged row visually moves to its would-be drop position (live preview)', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await saveProjects(projectsPanel, ['Alpha', 'Beta', 'Gamma'])

    // Sanity: starting order matches the save order.
    expect(await projectsPanel.getProjectOrder()).toEqual(['Alpha', 'Beta', 'Gamma'])

    // Start dragging Alpha and pause with the pointer in the LOWER half
    // of Gamma's row — i.e. the would-be drop position is "after Gamma",
    // making Alpha the last real slot. Do NOT release yet.
    await projectsPanel.beginDragOver('Alpha', 'Gamma', 'bottom')

    // Live preview: the rendered slot order must already reflect the
    // post-drop arrangement BEFORE the pointer is released.
    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Gamma', 'Alpha'])

    // The "+ New project" placeholder must remain pinned at the bottom
    // even while the dragged row is parked above it.
    await projectsPanel.expectPlaceholderIsLast()

    // Release the pointer — the drop must keep the previewed order.
    await projectsPanel.endDrag()
    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Gamma', 'Alpha'])
  })

  test('cancelling an in-flight drag (release outside the panel) restores the original order', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await saveProjects(projectsPanel, ['Alpha', 'Beta', 'Gamma'])

    // Start the drag and confirm the live preview is in effect — this
    // is the precondition that makes "cancel restores" a meaningful
    // assertion (otherwise the order would never have changed).
    await projectsPanel.beginDragOver('Alpha', 'Gamma', 'bottom')
    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Gamma', 'Alpha'])

    // Cancel by releasing the pointer well outside the panel. No slot
    // row is under the pointer at release time, so the controller must
    // discard the previewed order rather than commit it.
    await projectsPanel.cancelDrag()

    expect(await projectsPanel.getProjectOrder()).toEqual(['Alpha', 'Beta', 'Gamma'])
    await projectsPanel.expectPlaceholderIsLast()
  })
})

// Persistence is split into its own describe so we can use a one-shot
// localStorage clear (sentinel in sessionStorage) instead of the standard
// per-test clear that would also wipe state on `page.reload()`.
test.describe('Sandbox — Projects panel: drag-and-drop reordering — persistence', () => {
  test('reordered list survives a page reload', async ({
    page, mainMenu, toolbar, tutorial, projectsPanel,
  }, testInfo) => {
    // Under 8-worker parallel load the sandbox-enter + 3 slot saves
    // + drag + page.reload + sandbox-re-enter sequence can exceed the
    // default 30s budget waiting on the Projects toolbar button click.
    testInfo.setTimeout(60_000)
    // Clear localStorage ONLY on the first navigation of this test. The
    // sentinel in sessionStorage (which survives a reload but is scoped
    // per-tab) prevents the post-reload navigation from also wiping the
    // saved slot order we are about to verify.
    await page.addInitScript(() => {
      const KEY = '__rf_e2e_reorder_persist_seeded__'
      try {
        if (!sessionStorage.getItem(KEY)) {
          localStorage.clear()
          sessionStorage.setItem(KEY, '1')
        }
      } catch {
        /* ignore */
      }
    })

    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // Save Alpha, Beta, Gamma — same fixture as the basic reorder test.
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      await projectsPanel.clickEmptyPlaceholderSave()
      await projectsPanel.fillPromptAndConfirm(name)
      await projectsPanel.expectSlotPresent(name)
    }

    await projectsPanel.dragSlot('Beta', 'Alpha', 'before')
    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Alpha', 'Gamma'])

    // Reload — `setSlotOrder` should have persisted the new order.
    await page.reload()

    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Alpha', 'Gamma'])
  })

  test('a live-preview drop persists the previewed order across reload', async ({
    page, mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await page.addInitScript(() => {
      const KEY = '__rf_e2e_live_preview_persist_seeded__'
      try {
        if (!sessionStorage.getItem(KEY)) {
          localStorage.clear()
          sessionStorage.setItem(KEY, '1')
        }
      } catch {
        /* ignore */
      }
    })

    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      await projectsPanel.clickEmptyPlaceholderSave()
      await projectsPanel.fillPromptAndConfirm(name)
      await projectsPanel.expectSlotPresent(name)
    }

    // Live-preview drag: Alpha → bottom-half of Gamma, then drop.
    await projectsPanel.beginDragOver('Alpha', 'Gamma', 'bottom')
    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Gamma', 'Alpha'])
    await projectsPanel.endDrag()
    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Gamma', 'Alpha'])

    // Confirm the post-drop synchronous order write has reached
    // localStorage before reloading the page — without this poll the
    // reload can race the in-page event loop turn that fires the
    // setSlotOrder callback after mouse.up.
    await projectsPanel.waitForPersistedSlotOrder(['Beta', 'Gamma', 'Alpha'])

    await page.reload()

    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Gamma', 'Alpha'])
  })

  test('a cancelled drag does NOT persist any reorder across reload', async ({
    page, mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await page.addInitScript(() => {
      const KEY = '__rf_e2e_cancel_persist_seeded__'
      try {
        if (!sessionStorage.getItem(KEY)) {
          localStorage.clear()
          sessionStorage.setItem(KEY, '1')
        }
      } catch {
        /* ignore */
      }
    })

    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      await projectsPanel.clickEmptyPlaceholderSave()
      await projectsPanel.fillPromptAndConfirm(name)
      await projectsPanel.expectSlotPresent(name)
    }

    // Mid-drag the live preview must show the would-be order…
    await projectsPanel.beginDragOver('Alpha', 'Gamma', 'bottom')
    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Gamma', 'Alpha'])

    // …but cancelling must restore the original order before commit,
    // so nothing is written to localStorage.
    await projectsPanel.cancelDrag()
    expect(await projectsPanel.getProjectOrder()).toEqual(['Alpha', 'Beta', 'Gamma'])

    await page.reload()

    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    expect(await projectsPanel.getProjectOrder()).toEqual(['Alpha', 'Beta', 'Gamma'])
  })
})

// REQUIREMENT: the unified export/import format. Single-project export
// uses the same bundle envelope as multi-export, with a sanitized-name
// filename. Import (single OR multi) silently creates a new slot per
// bundled entry without prompting and without touching the live factory.
// 0-selected export uses the loaded slot's name when one is loaded; if
// no slot is loaded, the user is prompted via `projects.export_name_title`.
test.describe('Sandbox — Projects panel: unified export/import format', () => {
  clearStorageBeforeEach()

  test('Single-project export uses bundle envelope and sanitized-name filename', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Alpha')
    await projectsPanel.expectSlotPresent('Alpha')

    await projectsPanel.clickSlot('Alpha')
    await projectsPanel.expectSlotsSelected(['Alpha'])

    const { filename, json } = await projectsPanel.exportAndCaptureDownload()

    expect(filename).toBe('Alpha.json')

    const parsed = json as {
      version: number
      type: string
      projects: { name: string; save: Record<string, unknown> }[]
    }
    expect(parsed.type).toBe('bundle')
    expect(parsed.version).toBe(1)
    expect(parsed.projects).toHaveLength(1)
    expect(parsed.projects[0]!.name).toBe('Alpha')

    const save = parsed.projects[0]!.save
    expect(save).toHaveProperty('version')
    expect(save).toHaveProperty('grid')
    expect(save).toHaveProperty('belts')
    expect(save).toHaveProperty('pxtWorkspace')
  })

  test('Round-trip export → delete → import preserves project name without prompting and leaves live factory intact', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid, probe, page,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)

    // Seed: place a single machine BEFORE saving so the bundled save
    // contains real factory state (not just an empty grid).
    await grid.dblClickCell({ x: 10, z: 10 })
    const seededMachineCount = await probe.getMachineCount()
    expect(seededMachineCount).toBeGreaterThan(0)

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Alpha')
    await projectsPanel.expectSlotPresent('Alpha')

    // Export Alpha — capture filename + JSON text for re-upload.
    await projectsPanel.clickSlot('Alpha')
    await projectsPanel.expectSlotsSelected(['Alpha'])
    const { filename, json } = await projectsPanel.exportAndCaptureDownload()
    expect(filename).toBe('Alpha.json')

    // Delete Alpha — the slot must vanish from the list.
    await projectsPanel.deleteSlot('Alpha')
    await projectsPanel.confirmConfirm()
    await projectsPanel.expectSlotAbsent('Alpha')

    // Mutate the live factory so we can verify import does NOT replace it.
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
    await grid.dblClickCell({ x: 12, z: 10 })
    const beforeImport = await probe.getMachineCount()
    expect(beforeImport).toBe(seededMachineCount + 1)

    // Re-import the captured bundle. NO prompt may appear — the new
    // slot must take its name straight from the bundle entry.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    let downloaded = false
    const onDownload = (): void => { downloaded = true }
    page.on('download', onDownload)
    try {
      await projectsPanel.importBundleFromString(filename, JSON.stringify(json))
      await projectsPanel.expectSlotPresent('Alpha')
      await projectsPanel.expectNoModal()
    } finally {
      page.off('download', onDownload)
    }
    expect(downloaded, 'importing must not trigger a download').toBe(false)

    // Live factory must be untouched — import only seeds slots.
    expect(await probe.getMachineCount()).toBe(beforeImport)
  })

  test('Multi-import creates one slot per bundled entry without prompting', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // Save Alpha and Beta. Use long, distinct names — single letters
    // collide with "Save"/"Delete" via Playwright's case-insensitive
    // hasText substring matcher (e.g. `hasText: 'A'` matches "Save").
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Alpha')
    await projectsPanel.expectSlotPresent('Alpha')

    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Beta')
    await projectsPanel.expectSlotPresent('Beta')

    // Multi-export both.
    await projectsPanel.clickSlot('Alpha')
    await projectsPanel.ctrlClickSlot('Beta')
    await projectsPanel.expectSlotsSelected(['Alpha', 'Beta'])
    const { filename, json } = await projectsPanel.exportAndCaptureDownload()
    expect(filename).toMatch(/^factory-bundle-.*\.json$/)

    // Delete both, then re-import the bundle.
    await projectsPanel.deleteSlot('Alpha')
    await projectsPanel.confirmConfirm()
    await projectsPanel.expectSlotAbsent('Alpha')
    await projectsPanel.deleteSlot('Beta')
    await projectsPanel.confirmConfirm()
    await projectsPanel.expectSlotAbsent('Beta')

    await projectsPanel.importBundleFromString(filename, JSON.stringify(json))
    await projectsPanel.expectNoModal()
    await projectsPanel.expectSlotPresent('Alpha')
    await projectsPanel.expectSlotPresent('Beta')
  })

  test('0-selected export prompts for a name when no slot is loaded (EN)', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // No slots, no selection, no last-loaded id.
    await projectsPanel.expectSlotCount(0)

    const { filename, json } =
      await projectsPanel.exportViaPromptAndCaptureDownload('QuickExport')

    expect(filename).toBe('QuickExport.json')
    const parsed = json as { type: string; projects: { name: string }[] }
    expect(parsed.type).toBe('bundle')
    expect(parsed.projects).toHaveLength(1)
    expect(parsed.projects[0]!.name).toBe('QuickExport')
  })

  test('0-selected export prompt uses the CS translation', async ({
    mainMenu, toolbar, projectsPanel,
  }) => {
    await mainMenu.open()
    await mainMenu.clickLanguageToggle()
    await mainMenu.expectHtmlLang('cs')
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.clickExport()
    await projectsPanel.expectPromptModalTitle(t('cs', 'projects.export_name_title'))
    await projectsPanel.cancelPrompt()
  })

  test('0-selected export: cancelling the prompt aborts with no download', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotCount(0)

    await projectsPanel.expectExportPromptCancelTriggersNoDownload(
      t('en', 'projects.export_name_title'),
    )
  })

  test('0-selected export: uses the currently-loaded slot name without prompting', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // Save Alpha; the save handler sets last-loaded to Alpha's id.
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Alpha')
    await projectsPanel.expectSlotPresent('Alpha')

    // Sanity: Alpha is not in the multi-selection set, so the export
    // path is the 0-selected branch (live factory), not the 1-selected
    // branch (named slot).
    await expect(
      projectsPanel.slotByName('Alpha'),
    ).not.toHaveClass(/is-selected/)

    // 0-selected export with a loaded slot must use the loaded slot's
    // name and trigger a download immediately — no prompt modal. If the
    // prompt path were ever taken, this call would hang on the download
    // wait until the test timed out.
    const { filename, json } = await projectsPanel.exportAndCaptureDownload()

    // After the download fires the production handler has already
    // returned; if a prompt had been shown it would still be in the DOM.
    await projectsPanel.expectNoModal()

    expect(filename).toBe('Alpha.json')
    const parsed = json as { projects: { name: string }[] }
    expect(parsed.projects[0]!.name).toBe('Alpha')
  })
})

// REQUIREMENT: the project name in each row of the Projects panel is a
// focusable, editable `<input>` (mirroring the live-input pattern used
// by the Machine and Belt name inputs). Typing persists on every
// keystroke — no Save / Confirm / Enter step. Clicking the input does
// NOT load the project; loading is dblclick on the row body.
test.describe('Sandbox — Projects panel: inline rename', () => {
  clearStorageBeforeEach()

  test('Project name is an editable input that persists every keystroke', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Original')
    await projectsPanel.expectSlotPresent('Original')

    // The slot's name MUST be an editable input — not plain text. Typing
    // fires `input` events that persist on every keystroke; no separate
    // Save / Confirm / Enter step is required.
    await projectsPanel.renameSlot('Original', 'Renamed')

    // Close + reopen the panel — the persisted name reflects the typed
    // value, so the re-rendered row shows "Renamed".
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.expectSlotName('Renamed')
  })

  test('Renaming and exporting uses the new name as the filename', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Original')
    await projectsPanel.expectSlotPresent('Original')

    await projectsPanel.renameSlot('Original', 'Renamed')

    // The save handler set last-loaded to the new slot's id; the
    // 0-selected export branch uses that slot's CURRENT (renamed) name
    // straight from storage — no prompt, no separate selection step.
    const { filename, json } = await projectsPanel.exportAndCaptureDownload()

    expect(filename).toBe('Renamed.json')
    const parsed = json as { projects: { name: string }[] }
    expect(parsed.projects).toHaveLength(1)
    expect(parsed.projects[0]!.name).toBe('Renamed')
  })

  test('Clicking the name input does not load the project', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid, probe,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)

    // Save the (currently empty) factory as "Project".
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Project')
    await projectsPanel.expectSlotPresent('Project')

    // Mutate the live factory AFTER saving so a stray load would be
    // observable as a machine-count change (the saved snapshot has 0
    // machines).
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
    await grid.dblClickCell({ x: 10, z: 10 })
    const beforeClick = await probe.getMachineCount()
    expect(beforeClick).toBeGreaterThan(0)

    // Re-open and click the slot's NAME INPUT — must not trigger a load
    // (load is dblclick on the row body) and must not transition scenes.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    const input = projectsPanel.slotNameInput('Project')
    await expect(input).toBeVisible()
    await input.click()

    // Live factory state is untouched — no load happened.
    expect(await probe.getMachineCount()).toBe(beforeClick)
    // No scene transition — toolbar still visible (still in sandbox/build).
    await toolbar.expectVisible()
    // Panel is still open after a click on the name input.
    await projectsPanel.expectOpen()
  })

  // CONTRACT: pressing Enter inside the inline rename input commits
  // the rename by BLURRING the input. Enter is a familiar "I'm done"
  // gesture; the per-keystroke save already persisted everything the
  // user typed, so Enter must not mutate the value — only release
  // focus. Without an explicit `keydown` handler in the inline name
  // input factory, a plain `<input type="text">` swallows Enter (no
  // implicit form submit / blur), so this test fails on current source.
  test('Pressing Enter in the project name input blurs it without changing the value', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Original')
    await projectsPanel.expectSlotPresent('Original')

    // Type "AB" character-by-character so each keystroke commits via
    // the wire layer; the final live + persisted name becomes
    // "OriginalAB".
    await projectsPanel.typeIntoSlotNameInput('Original', 'AB')

    // Press Enter on the now-focused input.
    const result = await projectsPanel.pressEnterInFirstSlotNameInput()

    // Enter does NOT mutate the value — it is a commit gesture.
    expect(result.valueAfter).toBe('OriginalAB')
    // Sanity: focus was on the input immediately before Enter.
    expect(result.wasFocused).toBe(true)
    // CONTRACT: after Enter the input is no longer focused.
    expect(result.isStillFocused).toBe(false)

    // Persistence regression guard: the per-keystroke save was not
    // disturbed by the Enter press — close + reopen the panel and the
    // re-rendered row still shows "OriginalAB".
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotName('OriginalAB')
  })

  // REGRESSION GUARD: previously the wire layer rebuilt the slot list
  // (`refreshSlots()`) on every per-keystroke `input` event, which
  // disposed the live `<input>` element and dropped focus after the
  // first character. Playwright's `.fill()` masked it (one bulk event);
  // real per-key typing surfaces it.
  test('Multi-keystroke typing keeps the input focused throughout', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('Original')
    await projectsPanel.expectSlotPresent('Original')

    // Type three characters one at a time; helper asserts the input
    // remains focused after every keystroke.
    await projectsPanel.typeIntoSlotNameInput('Original', 'XYZ')

    // After the sequence the live value reflects all three characters.
    // The wire layer mirrors the live name into the [value] attribute
    // per keystroke, so the input is now addressable by 'OriginalXYZ'.
    const input = projectsPanel.slotNameInput('OriginalXYZ')
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('OriginalXYZ')

    // Close + reopen — re-rendered row reads the persisted name.
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.expectSlotName('OriginalXYZ')
  })

  // REGRESSION GUARD: clearing the inline name input and blurring it
  // (Tab key) must NOT leave the row showing an empty name. The wire
  // layer drops empty/whitespace renames so the persisted name is
  // unchanged; the panel's blur handler restores the input's `.value`
  // back to that persisted name so the row never visually drops to
  // blank, and the SR mirror span follows along.
  test('Clearing the input and blurring restores the persisted name', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('PersistMe')
    await projectsPanel.expectSlotPresent('PersistMe')

    // Clear the input and blur via Tab. The wire ignores the empty
    // rename, so the slot's persisted name stays "PersistMe"; on blur
    // the panel restores the input's value to that persisted name.
    await projectsPanel.clearSlotNameInput('PersistMe')
    await projectsPanel.blurSlotNameInput('PersistMe')

    // Live `.value` of the (still-mounted) input is back to "PersistMe".
    const input = projectsPanel.slotNameInput('PersistMe')
    await expect(input).toHaveValue('PersistMe')

    // Close + reopen the panel — the persisted name in storage is
    // unchanged, so the re-rendered row also shows "PersistMe".
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.expectSlotName('PersistMe')
  })

  // REGRESSION GUARD: after a live (per-keystroke) inline rename, the
  // wire layer must mirror the LATEST committed name into both the
  // panel's cached slot and the row DOM (input.value, [value]
  // attribute, SR span). Otherwise, re-editing the same row, clearing,
  // and blurring would restore to the STALE original name (the value
  // captured at first render) instead of the latest committed name.
  test(
    'Re-editing after a committed live rename, then clearing and blurring, restores to the LATEST committed name (not the original)',
    async ({ mainMenu, toolbar, tutorial, projectsPanel }) => {
      await mainMenu.enterSandboxFast(toolbar, tutorial)
      await toolbar.clickProjects()
      await projectsPanel.expectOpen()

      await projectsPanel.clickEmptyPlaceholderSave()
      await projectsPanel.fillPromptAndConfirm('Original')
      await projectsPanel.expectSlotPresent('Original')

      // First edit pass: clear "Original" and type "Edited"
      // character-by-character. Each keystroke commits via the wire
      // layer so the row's live committed name becomes "Edited".
      // Note: clearing fires an empty-rename event which the wire
      // ignores, so the [value] attribute stays at "Original" until
      // the first non-empty keystroke commits — that's why the
      // `typeIntoSlotNameInput` first lookup is by "Original".
      await projectsPanel.clearSlotNameInput('Original')
      await projectsPanel.typeIntoSlotNameInput('Original', 'Edited')

      // Tab out — blur fires, the wire layer has already mirrored
      // "Edited" into the panel's cached slot and the DOM, so the
      // blur-restore reads the LIVE name (which equals the input's
      // current property value, so no visible change).
      await projectsPanel.blurSlotNameInput('Edited')

      // Second edit pass: re-click the same row's name input, clear
      // it, then blur. The wire ignores the empty rename, so the
      // persisted name stays "Edited"; the panel's blur-restore reads
      // the cached slot name — which MUST be "Edited" (the latest
      // committed name), NOT "Original" (the stale captured value).
      await projectsPanel.clearSlotNameInput('Edited')
      await projectsPanel.blurSlotNameInput('Edited')

      // Live `.value` of the still-mounted input is restored to the
      // LATEST committed name, not the original.
      const input = projectsPanel.slotNameInput('Edited')
      await expect(input).toHaveValue('Edited')
      // The [value] attribute mirror is also pinned to the latest
      // committed name (this is the second half of the wire fix).
      await expect(input).toHaveAttribute('value', 'Edited')
    },
  )
})

// The inline rename input must size to its text content so the
// editable / focusable area does not visually claim empty space to
// the right of a short project name. Rule: input width ≈ text
// content width (within padding/border tolerance), and always
// significantly less than the row width for short names.
test.describe('Sandbox — Projects panel: inline name input width', () => {
  clearStorageBeforeEach()

  test('inline name input width matches the rendered text width (not the full row width)', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // Use a long-enough project name so the rendered text width is
    // guaranteed to exceed the input's `min-width` floor (≥ 100 px),
    // which lets us assert the content-sizing equality directly.
    // Short names hit the min-width floor — that case is covered by
    // the dedicated min-width test below.
    const longName = 'My very long assembly project'
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm(longName)
    await projectsPanel.expectSlotPresent(longName)

    const m = await projectsPanel.measureFirstSlotNameInput()
    const expectedW = m.textW + m.padX + m.borderX

    expect(
      m.textW,
      `test precondition: chose name "${m.value}" expecting textW > 100 ` +
        `to exceed the min-width floor, but textW=${m.textW.toFixed(1)}. ` +
        `Pick a longer name in the test setup.`,
    ).toBeGreaterThan(100)

    expect(
      m.inputW,
      `inline name input is stretched to fill the row ` +
        `(inputW=${m.inputW.toFixed(1)}, rowW=${m.rowW.toFixed(1)}, ` +
        `expected text-content width ≈ ${expectedW.toFixed(1)} ` +
        `[textW=${m.textW.toFixed(1)} + padX=${m.padX.toFixed(1)} + borderX=${m.borderX.toFixed(1)}]). ` +
        `Update .ui-projects-slot-name-input CSS so its width tracks ` +
        `input.value, e.g. via "field-sizing: content" and "flex: 0 1 auto".`,
    ).toBeLessThanOrEqual(m.rowW * 0.5)

    expect(
      Math.abs(m.inputW - expectedW),
      `inline name input width does not match its text content ` +
        `(inputW=${m.inputW.toFixed(1)}, expected ≈ ${expectedW.toFixed(1)} ` +
        `[textW=${m.textW.toFixed(1)} + padX=${m.padX.toFixed(1)} + borderX=${m.borderX.toFixed(1)}], ` +
        `rowW=${m.rowW.toFixed(1)}). ` +
        `The input must size to its text content, not stretch to fill the row.`,
    ).toBeLessThanOrEqual(8)

    expect.soft(
      m.padX,
      `inline name input has unexpectedly large horizontal padding ` +
        `(padX=${m.padX.toFixed(1)} px). The visual focus underline / ` +
        `hover background should not extend past end-of-text. ` +
        `Use small or zero horizontal padding.`,
    ).toBeLessThanOrEqual(4)
  })

  test('inline name input has a minimum width so very short names remain a usable click target', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('AB')
    await projectsPanel.expectSlotPresent('AB')

    const m = await projectsPanel.measureFirstSlotNameInput()

    expect(
      m.minWidthPx,
      `inline name input has no usable min-width floor ` +
        `(computed min-width=${m.minWidthPx.toFixed(1)} px for value="${m.value}"). ` +
        `Very short names (e.g. "AB") must remain a clickable / focusable ` +
        `target — set min-width: 100px (or larger) on .ui-projects-slot-name-input.`,
    ).toBeGreaterThanOrEqual(100)

    expect(
      m.inputW,
      `inline name input is too narrow for short names ` +
        `(inputW=${m.inputW.toFixed(1)} px for value="${m.value}", ` +
        `min-width=${m.minWidthPx.toFixed(1)} px). ` +
        `The rendered width must respect the min-width floor (≥ 100 px) ` +
        `so short names remain a usable click / focus target.`,
    ).toBeGreaterThanOrEqual(100)
  })

  test('inline name input text is left-aligned', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('AB')
    await projectsPanel.expectSlotPresent('AB')

    const m = await projectsPanel.measureFirstSlotNameInput()

    expect(
      ['start', 'left'],
      `inline name input text is not left-aligned ` +
        `(computed text-align="${m.textAlign}" for value="${m.value}"). ` +
        `When the input is wider than its text (because of the min-width ` +
        `floor), the caret / text must begin at the LEFT edge — set ` +
        `text-align: start (or left) on .ui-projects-slot-name-input.`,
    ).toContain(m.textAlign)
  })

  test('inline name input grows when the project name grows and shrinks when it shrinks', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm('AB')
    await projectsPanel.expectSlotPresent('AB')

    const short = await projectsPanel.measureFirstSlotNameInput()
    expect(
      short.inputW,
      `for short name "AB" the input already fills the row ` +
        `(inputW=${short.inputW.toFixed(1)}, rowW=${short.rowW.toFixed(1)}). ` +
        `The input must size to its text content, not the row.`,
    ).toBeLessThanOrEqual(short.rowW * 0.85)

    await projectsPanel.renameSlot('AB', 'My very long assembly project')

    const long = await projectsPanel.measureFirstSlotNameInput()
    expect(
      long.inputW,
      `inline name input did not visibly grow when the name grew ` +
        `(short inputW=${short.inputW.toFixed(1)} for "${short.value}", ` +
        `long inputW=${long.inputW.toFixed(1)} for "${long.value}", ` +
        `rowW=${long.rowW.toFixed(1)}). ` +
        `Width must track input.value rather than being locked by flex stretch.`,
    ).toBeGreaterThan(short.inputW + 30)
    expect(
      long.inputW,
      `inline name input grew past 85% of the row width ` +
        `(inputW=${long.inputW.toFixed(1)}, rowW=${long.rowW.toFixed(1)}). ` +
        `It must remain bounded so siblings stay visible.`,
    ).toBeLessThanOrEqual(long.rowW * 0.85)

    await projectsPanel.renameSlot('My very long assembly project', 'AB')

    const back = await projectsPanel.measureFirstSlotNameInput()
    expect(
      back.inputW,
      `inline name input did not shrink back when the name shrank ` +
        `(long inputW=${long.inputW.toFixed(1)}, ` +
        `back inputW=${back.inputW.toFixed(1)} for "${back.value}"). ` +
        `Width must track input.value in both directions.`,
    ).toBeLessThan(long.inputW - 30)
    expect(
      Math.abs(back.inputW - short.inputW),
      `inline name input did not round-trip back to the short width ` +
        `(short inputW=${short.inputW.toFixed(1)}, back inputW=${back.inputW.toFixed(1)}). ` +
        `Width must be a pure function of input.value at the input's font.`,
    ).toBeLessThanOrEqual(6)
    expect(
      back.inputW,
      `after shrinking back, input occupies more than 85% of the row ` +
        `(inputW=${back.inputW.toFixed(1)}, rowW=${back.rowW.toFixed(1)}).`,
    ).toBeLessThanOrEqual(back.rowW * 0.85)
  })

  test('inline name input has the same left edge across all rows regardless of name length', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandboxFast(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // Save 3 projects with widely varying name widths so each row's
    // inline input renders at a noticeably different intrinsic width.
    // The long name's text width must clearly exceed the input's
    // ~100 px min-width floor so `field-sizing: content` actually
    // stretches the input — that is what exposes the alignment bug
    // when `.ui-projects-slot { justify-content: space-between }`
    // distributes leftover space across all gaps.
    const names = ['AB', 'Assembly', 'My Long Project Pipeline Name Here']
    for (const n of names) {
      await projectsPanel.clickEmptyPlaceholderSave()
      await projectsPanel.fillPromptAndConfirm(n)
      await projectsPanel.expectSlotPresent(n)
    }

    const measurements = await projectsPanel.measureAllSlotNameInputLefts()

    expect(
      measurements.length,
      `expected at least 3 saved-slot rows for the alignment check, ` +
        `got ${measurements.length}.`,
    ).toBeGreaterThanOrEqual(3)

    const lefts = measurements.map((m) => m.relativeLeftInRowPx)
    const minLeft = Math.min(...lefts)
    const maxLeft = Math.max(...lefts)
    const delta = maxLeft - minLeft

    const detail = measurements
      .map(
        (m) =>
          `"${m.value}" left=${m.relativeLeftInRowPx.toFixed(2)} ` +
          `(gripRight=${m.gripRightPx.toFixed(2)})`,
      )
      .join(', ')

    expect(
      delta,
      `inline name input left edges differ across rows — ${detail} — ` +
        `they should all share the same left edge so the column visually ` +
        `aligns. Δ=${delta.toFixed(2)} px (min=${minLeft.toFixed(2)}, ` +
        `max=${maxLeft.toFixed(2)}). The likely cause is ` +
        `\`.ui-projects-slot { justify-content: space-between }\` ` +
        `distributing leftover space across all gaps so the input's ` +
        `absolute x-position depends on its own width.`,
    ).toBeLessThanOrEqual(0.5)
  })
})
