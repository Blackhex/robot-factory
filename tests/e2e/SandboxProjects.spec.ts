import { test, expect, clearStorageBeforeEach } from './pom'
import { t, type Lang } from './pom/data/i18n'

// Wider viewport so the toolbar + Projects panel layout has room.
test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('Sandbox — Projects panel', () => {
  clearStorageBeforeEach()

  test('Projects button is visible in Sandbox mode', async ({
    mainMenu, toolbar, tutorial,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
  })

  test('Clicking Projects again closes the panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
  })

  test('Empty slot list shows only the empty placeholder', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotCount(0)
    await projectsPanel.expectEmptyPlaceholderCount(1)
  })

  test('Clicking the empty row\'s Save creates a new slot', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)

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
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectImportButtonVisible()
  })

  test('Export button is present in Projects panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectExportButtonVisible()
  })

  test('Multi-export bundles selected projects into one file', async ({
    page, mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)

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
    await mainMenu.enterSandbox(toolbar, tutorial)

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
    await mainMenu.enterSandbox(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    // Click an empty cell well away from the panel and the toolbar.
    await grid.clickCell({ x: 15, z: 15 })

    await projectsPanel.expectClosed()
  })

  test('clicking the toolbar Projects button while open closes the panel (toggle preserved)', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)

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
    await mainMenu.enterSandbox(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await projectsPanel.dragResizeHandle(40)

    await projectsPanel.expectOpen()
  })

  test('clicks inside the new-project confirm modal do not close the panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid, page,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)

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
    await mainMenu.enterSandbox(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await page.keyboard.press('Escape')

    await projectsPanel.expectClosed()
  })

  test('Escape closes a modal first; second Escape closes the panel', async ({
    mainMenu, toolbar, tutorial, projectsPanel, grid, page,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()

    await saveProjects(projectsPanel, ['Alpha', 'Beta', 'Gamma'])

    await projectsPanel.dragSlot('Beta', 'Alpha', 'before')

    expect(await projectsPanel.getProjectOrder()).toEqual(['Beta', 'Alpha', 'Gamma'])
  })

  test('multi-select drag preserves relative order of the selected rows', async ({
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)

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
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)
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
  }) => {
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

    await mainMenu.enterSandbox(toolbar, tutorial)
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

    await mainMenu.enterSandbox(toolbar, tutorial)
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

    await mainMenu.enterSandbox(toolbar, tutorial)
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

    await page.reload()

    await mainMenu.enterSandbox(toolbar, tutorial)
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

    await mainMenu.enterSandbox(toolbar, tutorial)
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

    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)

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
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    mainMenu, toolbar, tutorial, projectsPanel,
  }) => {
    await mainMenu.open()
    await mainMenu.clickLanguageToggle()
    await mainMenu.expectHtmlLang('cs')
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent(500)
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
    await mainMenu.enterSandbox(toolbar, tutorial)
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
    await mainMenu.enterSandbox(toolbar, tutorial)
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

