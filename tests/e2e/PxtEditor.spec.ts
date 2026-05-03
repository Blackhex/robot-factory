import { test, expect } from './pom'

async function enterBuildPhase(
  mainMenu: import('./pom/screens/MainMenuPage').MainMenuPage,
  levelSelect: import('./pom/screens/LevelSelectPage').LevelSelectPage,
  toolbar: import('./pom/screens/ToolbarPage').ToolbarPage,
  tutorial: import('./pom/screens/TutorialOverlayPage').TutorialOverlayPage,
) {
  await mainMenu.open()
  await mainMenu.clickStartGame()
  await levelSelect.expectVisible()
  await levelSelect.clickFirstUnlocked()
  await toolbar.expectVisible()
  await tutorial.dismissIfPresent()
}

test.describe('PXT Editor — MakeCode Block Editor', () => {
  test.beforeEach(async ({ mainMenu, levelSelect, toolbar, tutorial }) => {
    await enterBuildPhase(mainMenu, levelSelect, toolbar, tutorial)
  })

  // --- Editor Panel Visibility ---

  test('"Open Editor" button is visible in toolbar', async ({ toolbar }) => {
    await toolbar.expectEditorButtonVisible()
    await toolbar.expectEditorButtonText('Open Editor')
  })

  test('clicking "Open Editor" opens the editor panel', async ({ toolbar, editorPanel }) => {
    await editorPanel.expectClosed()
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
  })

  test('clicking "Open Editor" again closes the editor panel', async ({ toolbar, editorPanel }) => {
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await toolbar.clickEditor()
    await editorPanel.expectClosed()
  })

  test('"E" key toggles the editor', async ({ toolbar, editorPanel }) => {
    await editorPanel.expectClosed()
    await toolbar.pressEditorShortcut()
    await editorPanel.expectOpen()
    await toolbar.pressEditorShortcut()
    await editorPanel.expectClosed()
  })

  // --- MakeCode PXT Editor loads in iframe ---

  test('PXT MakeCode editor loads in the iframe', async ({ toolbar, editorPanel }) => {
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    await editorPanel.expectFallbackHidden()
  })

  test('PXT editor iframe has non-zero dimensions', async ({ toolbar, editorPanel }) => {
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()

    const box = await editorPanel.getIframeBoundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(100)
    expect(box!.height).toBeGreaterThan(100)
  })

  test('editor panel is approximately 40% of viewport width', async ({ toolbar, editorPanel }) => {
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectContainerWidthAroundFractionOfViewport(0.4, 0.15)
  })

  test('PXT editor contains Blockly workspace inside iframe', async ({ toolbar, editorPanel, pxt }) => {
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    await pxt.expectBlocklyAttached()
  })

  test('PXT editor shows block categories in toolbox', async ({ toolbar, editorPanel, pxt }) => {
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    await pxt.expectToolboxAttached()
  })

  // --- Language Toggle ---

  test('language toggle updates editor button text to Czech', async ({ toolbar }) => {
    await toolbar.expectEditorButtonText('Open Editor')
    await toolbar.clickLanguageToggle()
    await toolbar.expectEditorButtonText('Otevřít editor')
  })

  // --- PXT iframe exists ---

  test('PXT iframe element is present in editor container', async ({ toolbar, editorPanel }) => {
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeAttached()
  })
})

test.describe('toolbox order', () => {
  test('toolbox shows expected top-level categories in order and no "Advanced"', async ({
    mainMenu,
    levelSelect,
    toolbar,
    tutorial,
    editorPanel,
    pxt,
  }) => {
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickFirstUnlocked()
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()

    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()

    await pxt.expectToolboxTreeRootAttached()
    await pxt.expectFirstToolboxLabelVisible()

    const order = await pxt.getToolboxCategoryOrder()
    expect(order).toEqual(['Machines', 'Belts', 'Loops', 'Logic', 'Events', 'Variables', 'Functions'])
    expect(order).not.toContain('Advanced')
  })
})

test.describe('block labels', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('rendered block text contains the word "machine" at most once', async ({
    mainMenu,
    toolbar,
    grid,
    probe,
    pxt,
  }) => {
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await probe.settle(800)

    // Place a Fabricator at the center of the grid via double-click.
    await grid.dblClickCell({ x: 10, z: 10 })

    await expect
      .poll(async () => probe.getMachineCountFromFactory(), { timeout: 5000 })
      .toBeGreaterThanOrEqual(1)

    await pxt.openAndWaitForBlockly()
    await pxt.openMachinesFlyout()

    const blockText = await pxt.readPickMachineBlockText()
    const matches = blockText.match(/\bmachine\b/gi) ?? []

    expect(
      matches.length,
      `Expected block text to contain the word "machine" at most once but got ${matches.length} occurrences. ` +
        `Full block text: "${blockText}"`,
    ).toBeLessThanOrEqual(1)
  })
})

test.describe('event hat blocks', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  const EVENT_BLOCK_TYPES = [
    'factory_on_order_received',
    'factory_on_belt_jam',
    'factory_on_machine_idle',
  ] as const

  type EventBlockType = (typeof EVENT_BLOCK_TYPES)[number]

  /** Convert a CSS color string to HSL hue in degrees [0, 360). */
  function colorToHue(color: string): number | null {
    if (!color) return null
    let r = 0, g = 0, b = 0
    const hex = color.trim().match(/^#([0-9a-f]{6})$/i)
    const hex3 = color.trim().match(/^#([0-9a-f]{3})$/i)
    const rgb = color.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
    if (hex) {
      r = parseInt(hex[1].slice(0, 2), 16)
      g = parseInt(hex[1].slice(2, 4), 16)
      b = parseInt(hex[1].slice(4, 6), 16)
    } else if (hex3) {
      r = parseInt(hex3[1][0] + hex3[1][0], 16)
      g = parseInt(hex3[1][1] + hex3[1][1], 16)
      b = parseInt(hex3[1][2] + hex3[1][2], 16)
    } else if (rgb) {
      r = +rgb[1]; g = +rgb[2]; b = +rgb[3]
    } else {
      return null
    }
    const rn = r / 255, gn = g / 255, bn = b / 255
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
    const d = max - min
    if (d === 0) return 0
    let h = 0
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
    return h
  }

  const LEVEL_INDEX_EVENTS = 6

  test.describe('PXT Event Registration Blocks — hat shape + Events color', () => {
    test.beforeEach(async ({ saves, mainMenu, levelSelect, toolbar, tutorial, pxt }) => {
      await saves.seedProgressUpTo(LEVEL_INDEX_EVENTS)
      await mainMenu.open()
      await mainMenu.clickStartGame()
      await levelSelect.expectVisible()
      await levelSelect.clickUnlocked(LEVEL_INDEX_EVENTS)
      await toolbar.expectVisible()
      await tutorial.dismissIfPresent()
      await pxt.openAndWaitForBlockly()
      await pxt.openEventsCategory()
    })

    for (const blockType of EVENT_BLOCK_TYPES) {
      test(`${blockType} renders as a hat block (no previous/next connections)`, async ({ pxt }) => {
        const info = await pxt.readEventBlockInfo<EventBlockType>(EVENT_BLOCK_TYPES)
        const entry = info[blockType]
        expect(entry.registered, `block ${blockType} is not registered in Blockly.Blocks`).toBe(true)

        expect(
          entry.hasPrevious,
          `${blockType} should be a hat block but has a previousConnection (notch at top). ` +
            `Fix: remove \`//% handlerStatement=1\` from its declaration in ` +
            `pxt-target/libs/robot-factory/factory.ts.`,
        ).toBe(false)

        expect(
          entry.hasNext,
          `${blockType} should be a hat block but has a nextConnection (notch at bottom). ` +
            `Fix: remove \`//% handlerStatement=1\` from its declaration in ` +
            `pxt-target/libs/robot-factory/factory.ts.`,
        ).toBe(false)
      })

      test(`${blockType} uses the Events category color (hue ~50)`, async ({ pxt }) => {
        const info = await pxt.readEventBlockInfo<EventBlockType>(EVENT_BLOCK_TYPES)
        const entry = info[blockType]
        expect(entry.registered, `block ${blockType} is not registered in Blockly.Blocks`).toBe(true)

        const hue = colorToHue(entry.color)
        expect(
          hue,
          `Could not parse color "${entry.color}" for ${blockType} into an HSL hue.`,
        ).not.toBeNull()

        expect(
          hue! >= 40 && hue! <= 60,
          `${blockType} expected to use Events category color (PXT hue 50, ~yellow). ` +
            `Got color "${entry.color}" with HSL hue ≈ ${hue!.toFixed(1)}°. ` +
            `The current definition uses \`color=35\` (orange-brown, hue ~35°). ` +
            `Fix: change \`color=35\` → \`color=50\` in pxt-target/libs/robot-factory/factory.ts ` +
            `and the Events category \`colour: '35'\` → \`colour: '50'\` in src/editor/FactoryToolbox.ts.`,
        ).toBe(true)
      })
    }
  })
})

test.describe('machine dropdown — empty state', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  const EMPTY_LABEL = '(no machines)'
  const FORBIDDEN_PLACEHOLDERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'foo']

  function assertOnlyEmptyPlaceholder(
    snap: { optionLabels: string[]; faceText: string },
    ctx: string,
  ) {
    expect(
      snap.optionLabels,
      `${ctx}: dropdown should contain exactly one option (the empty-state placeholder). ` +
        `Got: ${JSON.stringify(snap.optionLabels)}`,
    ).toEqual([EMPTY_LABEL])
    for (const forbidden of FORBIDDEN_PLACEHOLDERS) {
      expect(
        snap.optionLabels,
        `${ctx}: dropdown must not contain the default placeholder "${forbidden}". ` +
          `Got: ${JSON.stringify(snap.optionLabels)}`,
      ).not.toContain(forbidden)
    }
    expect(
      snap.faceText,
      `${ctx}: closed block face should display the empty-state placeholder. Got: "${snap.faceText}"`,
    ).toBe(EMPTY_LABEL)
  }

  test.describe('PXT machine dropdown — reflects factory state (empty / add / remove)', () => {
    test('full lifecycle: empty → add → name shown → remove → empty again', async ({
      saves, mainMenu, toolbar, probe, grid, machinePanel, pxt,
    }) => {
      // 1. Fresh sandbox, factory has 0 machines.
      await saves.clearOnNavigate()
      await mainMenu.open()
      await mainMenu.clickSandbox()
      await toolbar.expectVisible()
      await probe.settle(800)

      expect(await probe.getMachineCount(), 'sandbox should start with 0 machines').toBe(0)

      // 2. Open the PXT editor and wait for Blockly.
      await pxt.openAndWaitForBlockly()

      // 3. Add the `factory_start_machine` block to the workspace.
      const blockId = await pxt.createStartMachineBlock()

      // 4 + 5. Inspect the MACHINE dropdown.
      {
        const snap = await pxt.readMachineDropdown(blockId)
        assertOnlyEmptyPlaceholder(snap, 'initial empty state (0 machines)')
      }

      // 6. (Dropdown is read via API; nothing to close.)
      // 7. Add a machine.
      await pxt.closeIfOpen()
      await grid.dblClickCell({ x: 5, z: 10 })
      await expect
        .poll(async () => probe.getMachineCount(), { timeout: 5000 })
        .toBe(1)

      // The dblclick projection→cell raycast is approximate, so the placement
      // can land on a cell adjacent to (5, 10) under heavy parallel load.
      // The factual "where the machine is" comes from the simulation, not
      // from the requested coord — read it back so steps 8–13 follow the
      // real machine.
      const placedMachines = await probe.getMachines()
      expect(placedMachines, 'exactly one machine should be placed').toHaveLength(1)
      const placedMachine = placedMachines[0]
      const placedCoord = { x: placedMachine.x, z: placedMachine.z }

      const placedName = await probe.getFirstMachineDisplayName()
      expect(placedName, 'placed machine should expose a non-empty display name').toBeTruthy()

      await pxt.openAndWaitForBlockly()

      // 8 + 9. Re-open dropdown.
      {
        const snap = await pxt.readMachineDropdown(blockId)
        expect(
          snap.optionLabels,
          `after placing 1 machine: dropdown should contain exactly one option matching "${placedName}". ` +
            `Got: ${JSON.stringify(snap.optionLabels)}`,
        ).toEqual([placedName])
        expect(
          snap.optionLabels,
          'after placing 1 machine: empty-state placeholder must be gone',
        ).not.toContain(EMPTY_LABEL)

        // 10.
        expect(snap.faceText, 'closed block face should show the placed machine name').toBe(placedName)
        for (const forbidden of FORBIDDEN_PLACEHOLDERS) {
          expect(
            snap.faceText,
            `closed block face must not show the default placeholder "${forbidden}"`,
          ).not.toBe(forbidden)
        }
        expect(snap.faceText, 'closed block face must not show empty-state placeholder').not.toBe(EMPTY_LABEL)
      }

      // 11. Remove the machine.
      await pxt.closeIfOpen()
      await grid.clickMachineUntilSelected(placedCoord)
      await machinePanel.expectVisible()
      await machinePanel.pressDelete()
      await expect
        .poll(async () => probe.getMachineCount(), { timeout: 5000 })
        .toBe(0)

      await pxt.openAndWaitForBlockly()

      // 12 + 13.
      {
        const snap = await pxt.readMachineDropdown(blockId)
        assertOnlyEmptyPlaceholder(snap, 'after removing the last machine')
      }
    })
  })
})

test.describe('flyout updates on machine placement', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  const EMPTY_LABEL = '(no machines)'
  const FORBIDDEN_PLACEHOLDERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'foo']

  const MACHINE_BLOCK_TYPES = [
    'factory_start_machine',
    'factory_stop_machine',
    'factory_set_recipe',
    'factory_pick_machine',
    'factory_on_machine_idle',
  ] as const

  test.describe('PXT machine dropdown — flyout updates when first machine is placed', () => {
    test('open editor → open Machines flyout → place first machine → flyout blocks show new machine name', async ({
      saves, mainMenu, toolbar, probe, grid, pxt,
    }) => {
      // 1. Fresh sandbox, factory has 0 machines.
      await saves.clearOnNavigate()
      await mainMenu.open()
      await mainMenu.clickSandbox()
      await toolbar.expectVisible()
      await probe.settle(800)
      expect(await probe.getMachineCount(), 'sandbox should start with 0 machines').toBe(0)

      // 2. Open the PXT editor and wait for Blockly.
      await pxt.openAndWaitForBlockly()

      // 3. Open the "Machines" toolbox category so its flyout is rendered.
      await pxt.openMachinesFlyout()

      // 4. Empty-state baseline.
      const initial = await pxt.readMachineFlyoutBlocks(MACHINE_BLOCK_TYPES)
      expect(
        initial.length,
        `flyout should expose at least one machine-dropdown block; got types: ${initial
          .map((b) => b.type)
          .join(', ')}`,
      ).toBeGreaterThan(0)
      for (const snap of initial) {
        expect(
          snap.apiText,
          `[empty state] flyout block "${snap.type}".getField('machine').getText() should equal "${EMPTY_LABEL}". Got: "${snap.apiText}"`,
        ).toBe(EMPTY_LABEL)
        expect(
          snap.svgTexts,
          `[empty state] flyout block "${snap.type}" SVG should contain the empty-state label. Got: ${JSON.stringify(snap.svgTexts)}`,
        ).toContain(EMPTY_LABEL)
        for (const forbidden of FORBIDDEN_PLACEHOLDERS) {
          expect(
            snap.svgTexts,
            `[empty state] flyout block "${snap.type}" SVG must not contain default placeholder "${forbidden}". Got: ${JSON.stringify(snap.svgTexts)}`,
          ).not.toContain(forbidden)
        }
      }

      // 5. Place one machine WITHOUT closing the editor.
      await grid.dblClickCell({ x: 3, z: 5 })
      await expect
        .poll(async () => probe.getMachineCount(), { timeout: 5000 })
        .toBe(1)

      const placedName = await probe.getFirstMachineDisplayName()
      expect(placedName, 'placed machine should expose a non-empty display name').toBeTruthy()

      // 6. Within a reasonable poll window the flyout must update.
      await expect
        .poll(
          async () => {
            const snaps = await pxt.readMachineFlyoutBlocks(MACHINE_BLOCK_TYPES)
            return snaps.map((s) => ({
              type: s.type,
              apiText: s.apiText,
              svgTexts: s.svgTexts,
            }))
          },
          {
            timeout: 2000,
            message:
              `flyout machine-dropdown blocks should update to "${placedName}" within 2s ` +
              `of placing the first machine, without closing the editor or the category`,
          },
        )
        .toEqual(
          initial.map((s) => ({
            type: s.type,
            apiText: placedName,
            svgTexts: expect.arrayContaining([placedName]),
          })),
        )

      // 7. Final fine-grained assertions.
      const final = await pxt.readMachineFlyoutBlocks(MACHINE_BLOCK_TYPES)
      for (const snap of final) {
        expect(
          snap.svgTexts,
          `[after place] flyout block "${snap.type}" SVG must not still show the empty placeholder. Got: ${JSON.stringify(snap.svgTexts)}`,
        ).not.toContain(EMPTY_LABEL)
        expect(
          snap.apiText,
          `[after place] flyout block "${snap.type}".getField('machine').getText() should equal "${placedName}". Got: "${snap.apiText}"`,
        ).toBe(placedName)
        for (const forbidden of FORBIDDEN_PLACEHOLDERS) {
          expect(
            snap.svgTexts,
            `[after place] flyout block "${snap.type}" SVG must not contain default placeholder "${forbidden}". Got: ${JSON.stringify(snap.svgTexts)}`,
          ).not.toContain(forbidden)
        }
      }
    })
  })
})

test.describe('Save / Reload Round-Trip', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('blocks added to the editor survive an explicit Save + page reload', async ({
    mainMenu,
    levelSelect,
    toolbar,
    tutorial,
    editorPanel,
    pxt,
    page,
  }) => {
    // 1. Reach build phase on the first level.
    await enterBuildPhase(mainMenu, levelSelect, toolbar, tutorial)

    // 2. Open the PXT editor and wait for Blockly to become interactive.
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForBlocklyWorkspaceVisible()
    await pxt.waitForToolboxInteractive()

    // 3. Add a non-trivial program on top of the default `on start`.
    await pxt.addNonTrivialProgram()

    // 4. Capture the BEFORE snapshot.
    const before = await pxt.getWorkspaceBlocksSnapshot()
    expect(
      before.count,
      `precondition: workspace must have more than just the default \`on start\` ` +
        `before reload — got ${before.count} blocks (${JSON.stringify(before.types)})`,
    ).toBeGreaterThan(1)
    expect(before.xml).not.toEqual('')

    // 5. Trigger autosave via the toolbar Save button.
    await toolbar.clickSave()
    // Allow the async PXT workspace flush + localStorage write to settle.
    await page.waitForTimeout(500)

    // 6. Full browser reload.
    await mainMenu.reload()

    // 7. Navigate back to the same level.
    await mainMenu.expectVisible()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickFirstUnlocked()
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()

    // 8. Re-open the PXT editor and wait for Blockly to load the restored project.
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForBlocklyWorkspaceVisible()
    await pxt.waitForToolboxInteractive()
    // Give PXT a beat to import the saved project into the workspace.
    await page.waitForTimeout(1000)

    // 9. Capture the AFTER snapshot and assert round-trip equality.
    const after = await pxt.getWorkspaceBlocksSnapshot()

    expect(
      after.count,
      `block count must survive reload: had ${before.count} before ` +
        `(${JSON.stringify(before.types)}), got ${after.count} after ` +
        `(${JSON.stringify(after.types)})`,
    ).toBe(before.count)

    expect(
      after.types,
      `block types must survive reload: before=${JSON.stringify(before.types)} ` +
        `after=${JSON.stringify(after.types)}`,
    ).toEqual(before.types)

    expect(
      after.fieldValues,
      `block field values must survive reload: before=${JSON.stringify(before.fieldValues)} ` +
        `after=${JSON.stringify(after.fieldValues)}`,
    ).toEqual(before.fieldValues)
  })
})

test.describe('on-start block visibility', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ mainMenu, levelSelect, toolbar, tutorial, editorPanel, pxt }) => {
    await enterBuildPhase(mainMenu, levelSelect, toolbar, tutorial)
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForBlocklyWorkspaceVisible()
    await pxt.waitForToolboxInteractive()
    await pxt.waitForOnStartBlockRendered()
  })

  test('on-start block is fully visible (not occluded by toolbox)', async ({ pxt }) => {
    const toolboxRect = await pxt.getToolboxRect()
    const blockRect = await pxt.getOnStartBlockRect()
    // Allow up to 2 px tolerance for sub-pixel rounding.
    expect(
      blockRect.left,
      `on-start block must sit entirely to the right of the toolbox column. ` +
        `toolbox=${JSON.stringify(toolboxRect)} block=${JSON.stringify(blockRect)}`,
    ).toBeGreaterThanOrEqual(toolboxRect.right - 2)
  })

  test('toolbox renders at the left edge of the iframe', async ({ pxt }) => {
    const toolboxRect = await pxt.getToolboxRect()
    expect(
      toolboxRect.left,
      `toolbox must be flush with the left edge of the iframe — got left=${toolboxRect.left}`,
    ).toBe(0)
    expect(
      toolboxRect.width,
      `toolbox must have non-trivial width — got width=${toolboxRect.width}`,
    ).toBeGreaterThanOrEqual(100)
  })

  test('on-start block stays within the visible workspace area', async ({ pxt }) => {
    const blockRect = await pxt.getOnStartBlockRect()
    const viewport = await pxt.getIframeViewportSize()
    expect(
      blockRect.right,
      `on-start block must not be pushed off the right edge of the iframe viewport. ` +
        `block.right=${blockRect.right} viewport.width=${viewport.width}`,
    ).toBeLessThanOrEqual(viewport.width)
    expect(
      blockRect.bottom,
      `on-start block must not be pushed off the bottom edge of the iframe viewport. ` +
        `block.bottom=${blockRect.bottom} viewport.height=${viewport.height}`,
    ).toBeLessThanOrEqual(viewport.height)
  })
})
