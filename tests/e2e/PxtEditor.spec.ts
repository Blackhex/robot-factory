import { test, expect, type Page } from './pom'

interface ToolboxRowColor {
  ariaLabel: string
  label: string
  catColor: string
  inlineBg: string
}

async function readToolboxRowColors(page: Page): Promise<ToolboxRowColor[]> {
  const iframeLocator = page.locator('#editor-container .pxt-editor-iframe')
  const iframeEl = await iframeLocator.elementHandle()
  expect(iframeEl, 'PXT editor iframe element handle must be present').not.toBeNull()
  const rows = await page.evaluate((el) => {
    const doc = (el as HTMLIFrameElement).contentDocument
    if (!doc) return [] as ToolboxRowColor[]
    return Array.from(doc.querySelectorAll('.blocklyTreeRow')).map((row) => ({
      ariaLabel: (row as HTMLElement).getAttribute('aria-label') ?? '',
      label: (row.querySelector('.blocklyTreeLabel') as HTMLElement | null)?.textContent?.trim() ?? '',
      catColor: (row as HTMLElement).style.getPropertyValue('--cat-color') ?? '',
      inlineBg: (row as HTMLElement).style.backgroundColor ?? '',
    })) as ToolboxRowColor[]
  }, iframeEl!)
  return rows
}

function expectCatColorMatchesInlineBg(rows: ToolboxRowColor[], context: string): void {
  const rowDump = JSON.stringify(rows, null, 2)
  const rowsWithInlineBg = rows.filter((r) => r.inlineBg.trim() !== '')
  expect(
    rowsWithInlineBg.length,
    `Expected PXT to set inline background-color on toolbox rows (${context}). Rows: ${rowDump}`,
  ).toBeGreaterThan(0)
  for (const row of rowsWithInlineBg) {
    expect(
      normalizeColor(row.catColor),
      `Row "${row.label}" (aria="${row.ariaLabel}") --cat-color must match PXT's inline backgroundColor "${row.inlineBg}" (${context}). Rows: ${rowDump}`,
    ).toBe(normalizeColor(row.inlineBg))
  }
}

function normalizeColor(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return ''
  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (hex) {
    const v = hex[1]
    const r = parseInt(v.length === 3 ? v[0] + v[0] : v.slice(0, 2), 16)
    const g = parseInt(v.length === 3 ? v[1] + v[1] : v.slice(2, 4), 16)
    const b = parseInt(v.length === 3 ? v[2] + v[2] : v.slice(4, 6), 16)
    return `rgb(${r}, ${g}, ${b})`
  }
  const rgb = trimmed.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (rgb) return `rgb(${parseInt(rgb[1])}, ${parseInt(rgb[2])}, ${parseInt(rgb[3])})`
  return trimmed
}

const DEFAULT_CAT_COLORS = new Set(['', normalizeColor('#2e3140'), normalizeColor('#e0e0e6')])

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
    await toolbar.expectEditorButtonText('Code')
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
    await toolbar.expectEditorButtonText('Code')
    await toolbar.clickLanguageToggle()
    await toolbar.expectEditorButtonText('Kód')
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

  test('each toolbox category row has a category-specific --cat-color CSS variable', async ({
    mainMenu,
    levelSelect,
    toolbar,
    tutorial,
    editorPanel,
    pxt,
    page,
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

    // PXT's `coloredToolbox` writes a per-row inline desaturated bg matching
    // the flyout block headers; --cat-color must equal that bg (after
    // normalization) for every row that has one.
    const rows = await readToolboxRowColors(page)
    expectCatColorMatchesInlineBg(rows, 'EN locale')

    // At least 3 of the 7 categories must have a non-default, non-empty
    // --cat-color (regression guard against the "all gray" failure mode).
    const nonDefaultCount = rows.filter(
      ({ catColor }) => !DEFAULT_CAT_COLORS.has(normalizeColor(catColor)),
    ).length
    expect(
      nonDefaultCount,
      `Expected at least 3 toolbox rows with a non-default --cat-color, got ${nonDefaultCount}. ` +
        `Row data: ${JSON.stringify(rows, null, 2)}`,
    ).toBeGreaterThanOrEqual(3)
  })

  test('toolbox category rows keep --cat-color when editor loads in Czech', async ({
    mainMenu,
    levelSelect,
    toolbar,
    tutorial,
    editorPanel,
    pxt,
    page,
  }) => {
    // Seed Czech as the active app language BEFORE the app boots so the
    // PXT iframe mounts with lang=cs from the start (no mid-session toggle).
    await page.addInitScript(() => {
      try {
        localStorage.setItem('robot-factory.lang', 'cs')
      } catch {
        /* ignore */
      }
    })

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

    const rows = await readToolboxRowColors(page)
    expectCatColorMatchesInlineBg(rows, 'Czech locale')

    // Every category row must have a non-default, non-empty --cat-color
    // (regression guard against the "all gray" failure mode in Czech).
    const rowsWithDefaultColor = rows.filter(({ catColor }) =>
      DEFAULT_CAT_COLORS.has(normalizeColor(catColor)),
    )
    expect(
      rowsWithDefaultColor,
      `Every category row must have a non-default --cat-color, but some fell back to the default. Rows: ${JSON.stringify(rows, null, 2)}`,
    ).toEqual([])
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
    test.beforeEach(async ({ saves, mainMenu, levelSelect, toolbar, tutorial, pxt }, testInfo) => {
      // Under 8-worker parallel load this test's `waitForEventBlockShapeStable`
      // poll plus PXT bootstrap can exceed the default 30s budget.
      testInfo.setTimeout(60_000)
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
        const info = await pxt.waitForEventBlockShapeStable<EventBlockType>(EVENT_BLOCK_TYPES)
        const entry = info[blockType]
        expect(entry.registered, `block ${blockType} is not registered in Blockly.Blocks`).toBe(true)

        expect(
          entry.hasPrevious,
          `${blockType} should be a hat block but has a previousConnection (notch at top). ` +
            `Fix: remove \`//% handlerStatement=1\` from its declaration in ` +
            `pxt-target/libs/core/factory.ts.`,
        ).toBe(false)

        expect(
          entry.hasNext,
          `${blockType} should be a hat block but has a nextConnection (notch at bottom). ` +
            `Fix: remove \`//% handlerStatement=1\` from its declaration in ` +
            `pxt-target/libs/core/factory.ts.`,
        ).toBe(false)
      })

      test(`${blockType} uses the Events category color (hue ~50)`, async ({ pxt }) => {
        const info = await pxt.waitForEventBlockShapeStable<EventBlockType>(EVENT_BLOCK_TYPES)
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
            `Fix: change \`color=35\` → \`color=50\` in pxt-target/libs/core/factory.ts ` +
            `and the Events category \`colour: '35'\` → \`colour: '50'\` in src/editor/FactoryToolbox.ts.`,
        ).toBe(true)
      })
    }
  })
})

test.describe('Conditionals (Logic) category — custom predicate block colours', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  // Level 4 (0-based index 3) unlocks the Conditionals/Logic category,
  // which exposes both built-in PXT logic blocks (`controls_if`,
  // `logic_compare`) and the two custom factory predicates.
  const LEVEL_INDEX_CONDITIONALS = 3

  // PXT renders the Logic category at hex #cccc44 (the "Logic" palette
  // colour used by `controls_if` and `logic_compare`). Custom predicates
  // declared in `pxt-target/libs/core/factory.ts` MUST inherit the same
  // hex so they're visually indistinguishable from the built-ins in the
  // same category. A prior fix aligned the toolbox category colour but
  // left the per-block colour at #a5a55b (a desaturated/darker variant),
  // so blocks dragged onto the workspace still rendered off-palette.
  const EXPECTED_LOGIC_HEX = '#cccc44'

  const LOGIC_BLOCK_TYPES = [
    'controls_if',
    'logic_compare',
    'factory_current_item_defective',
    'factory_current_item_is',
  ] as const

  test('built-in and custom Logic predicates render at the same hex colour', async ({
    saves,
    mainMenu,
    levelSelect,
    toolbar,
    tutorial,
    pxt,
  }) => {
    // Four sequential flyout drags + colour reads, each gated on PXT's
    // post-bootstrap settle; default 30 s is exceeded under 8-worker load.
    test.setTimeout(90_000)
    await saves.seedProgressUpTo(LEVEL_INDEX_CONDITIONALS)
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickUnlocked(LEVEL_INDEX_CONDITIONALS)
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await pxt.openAndWaitForBlockly()
    // Wait for the post-install decompile echo to stabilize before the
    // first drag — otherwise PXT can reload the workspace mid-drag and
    // cancel the mousedown stream, leaving the drop a no-op and the
    // test stalls on `waitForTimeout(400)` until the 30 s test timeout.
    await pxt.waitForPxtBootstrapSettled()
    // PXT auto-renders the built-in `logic` namespace as a category
    // labelled "Logic" (see repo memory `pxt-namespace-auto-renders-as-
    // toolbox-category.md`); both `controls_if` / `logic_compare` and
    // the custom factory predicates land there. The category flyout is
    // re-opened inside the per-block loop below.

    const observed: Record<string, string> = {}
    for (const blockType of LOGIC_BLOCK_TYPES) {
      // Re-open the Logic category before each drag: Blockly auto-closes
      // the flyout once a block is dropped onto the workspace, and the
      // next drag needs the flyout populated to find its source block.
      await pxt.openCategoryFlyout('Logic')
      const blockId = await pxt.dragBlockOntoWorkspace(blockType)
      observed[blockType] = await pxt.readPlacedBlockColor(blockId)
    }

    for (const blockType of LOGIC_BLOCK_TYPES) {
      expect(
        observed[blockType],
        `Expected '${EXPECTED_LOGIC_HEX}' from ${blockType}, got '${observed[blockType]}'. ` +
          `All four Logic-category blocks must render at the exact same hex as PXT's ` +
          `built-in controls_if / logic_compare. Observed colours: ${JSON.stringify(observed)}. ` +
          `Fix: align the per-block \`color=\` directive in pxt-target/libs/core/factory.ts ` +
          `for factory_current_item_defective and factory_current_item_is with the Logic ` +
          `category hue (PXT Logic = ${EXPECTED_LOGIC_HEX}).`,
      ).toBe(EXPECTED_LOGIC_HEX)
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
      `${ctx}: dropdown should contain exactly one localized empty-state option. ` +
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
      `${ctx}: closed block face should show the localized empty placeholder. Got: "${snap.faceText}"`,
    ).toBe(EMPTY_LABEL)
  }

  test.describe('PXT machine dropdown — reflects factory state (empty / add / remove)', () => {
    test('full lifecycle: empty → add → name shown → remove → empty again', async ({
      saves, mainMenu, toolbar, probe, grid, machinePanel, pxt,
    }, testInfo) => {
      // Under 8-worker parallel load this lifecycle test (3 separate
      // PXT open/close cycles + machine placement/removal) can exceed
      // the default 30s budget.
      testInfo.setTimeout(60_000)
      // 1. Fresh sandbox, factory has 0 machines.
      await saves.clearOnNavigate()
      await mainMenu.open()
      await mainMenu.clickSandbox()
      await toolbar.expectVisible()
      await probe.settle(800)

      expect(await probe.getMachineCount(), 'sandbox should start with 0 machines').toBe(0)

      // 2. Open the PXT editor and wait for Blockly.
      await pxt.openAndWaitForBlockly()
      await pxt.waitForPxtReady()
      // Without this wait, under 8-worker parallel load `pxtReady`
      // may still be false when the test reads the dropdown — the
      // production `patchBlocklyDropdowns` gate then early-returns,
      // so `FieldDropdown.getOptions` falls back to PXT's raw enum
      // members ("A".."H","9".."64") and the empty-state assertion
      // fails with a stale-looking but actually unpatched list.
      await pxt.waitForMachineDropdownReady()

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
      await pxt.waitForPxtReady()
      await pxt.waitForMachineDropdownReady()

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
      await pxt.waitForPxtReady()
      await pxt.waitForMachineDropdownReady()

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
      // Gate the empty-state baseline on the production dropdown
      // patch being installed; see `factory_start_machine` test above
      // for the parallel-load race rationale.
      await pxt.waitForMachineDropdownReady()

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
          `[empty state] flyout block "${snap.type}".getField('machine').getText() should render the localized empty placeholder. Got: "${snap.apiText}"`,
        ).toBe(EMPTY_LABEL)
        expect(
          snap.svgTexts.join(' '),
          `[empty state] flyout block "${snap.type}" SVG should render the localized empty placeholder. Got: ${JSON.stringify(snap.svgTexts)}`,
        ).toContain(EMPTY_LABEL)
        expect(
          snap.svgTexts.join(' '),
          `[empty state] flyout block "${snap.type}" SVG must not carry the Czech reporter noun. Got: ${JSON.stringify(snap.svgTexts)}`,
        ).not.toContain('stroj')
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
            timeout: 15_000,
            intervals: [100, 250, 500],
            message:
              `flyout machine-dropdown blocks should update to "${placedName}" ` +
              `after placing the first machine, without closing the editor or the category`,
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
          snap.svgTexts.join(' '),
          `[after place] flyout block "${snap.type}" SVG must not carry the Czech reporter noun. Got: ${JSON.stringify(snap.svgTexts)}`,
        ).not.toContain('stroj')
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

  test.beforeEach(async ({ page }) => {
    // Start the round-trip with empty localStorage so the Projects list and
    // PXT workspace are deterministic. We clear AFTER an initial navigation
    // (avoiding `addInitScript`) so the PXT iframe's localStorage isn't wiped
    // each time it loads — that would break its workspace persistence and
    // the round-trip we're trying to verify.
    await page.goto('/')
    await page.evaluate(() => {
      try {
        localStorage.clear()
      } catch {
        /* ignore */
      }
    })
  })

  test('blocks added to the editor survive an explicit Save + page reload', async ({
    mainMenu,
    toolbar,
    tutorial,
    editorPanel,
    projectsPanel,
    pxt,
    page,
  }) => {
    const PROJECT_NAME = 'RoundTripTest'

    // 1. Enter Sandbox mode (explicit Save is only available there).
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent(500)
    await toolbar.waitForCameraSettle()

    // 2. Open the PXT editor and wait for Blockly to become interactive.
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForBlocklyWorkspaceVisible()
    await pxt.waitForToolboxInteractive()

    // 3. Add a non-trivial program on top of the default `on start`.
    await pxt.addNonTrivialProgram()
    // Materialize any default shadow blocks so the BEFORE snapshot matches
    // the post-load workspace state (PXT instantiates declared shadows when
    // a block is loaded from XML, but `ws.newBlock` does not).
    await pxt.normalizeWorkspaceShadows()

    // 4. Capture the BEFORE snapshot.
    const before = await pxt.getWorkspaceBlocksSnapshot()
    expect(
      before.count,
      `precondition: workspace must have more than just the default \`on start\` ` +
        `before reload — got ${before.count} blocks (${JSON.stringify(before.types)})`,
    ).toBeGreaterThan(1)
    expect(before.xml).not.toEqual('')

    // 5. Save via the Projects panel (Sandbox-only). Close the editor first
    // so the panel layout is unobstructed, then click empty placeholder,
    // accept the prompt with the project name, click Save.
    await toolbar.clickEditor()
    await editorPanel.expectClosed()
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.clickEmptyPlaceholderSave()
    await projectsPanel.fillPromptAndConfirm(PROJECT_NAME)
    await projectsPanel.expectSlotPresent(PROJECT_NAME)
    // Allow the async PXT workspace flush + localStorage write to settle.
    await page.waitForTimeout(500)

    // 6. Full browser reload.
    await mainMenu.reload()

    // 7. Navigate back to Sandbox mode.
    await mainMenu.expectVisible()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent(500)
    await toolbar.waitForCameraSettle()

    // 8. Open the Projects panel and load the saved slot via double-click.
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.expectSlotPresent(PROJECT_NAME)
    await projectsPanel.doubleClickSlot(PROJECT_NAME)
    // Close the panel before re-opening the editor so it doesn't overlap.
    await toolbar.expectVisible()

    // 9. Re-open the PXT editor and wait for Blockly to load the restored project.
    await toolbar.clickEditor()
    await editorPanel.expectOpen()
    await editorPanel.expectIframeVisible()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForBlocklyWorkspaceVisible()
    await pxt.waitForToolboxInteractive()
    // Give PXT a beat to import the saved project into the workspace.
    await page.waitForTimeout(1000)

    // 10. Capture the AFTER snapshot and assert round-trip equality.
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

test.describe('Splitter refactor: route_items_to / item predicates / on-item-arrives (Level 4)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  // Level 4 is the 0-based index 3 on the level-select carousel. Mirrors
  // the existing `LEVEL_INDEX_EVENTS = 6` pattern (= Level 7) used by the
  // event-hat tests above.
  const LEVEL_INDEX_SPLITTERS = 3

  // After the Splitter refactor (E1-E5):
  // - `factory_route_items_to` (replaces deleted `factory_route_current_item`)
  //   lives in the Machines PXT category at level >= 4.
  // - `factory_current_item_defective` and `factory_current_item_is` moved
  //   from the deleted Splitters category to Logic.
  // - `factory_on_item_arrives` (block id unchanged for save compat) stays
  //   in Events at level >= 4.
  const SPLITTER_REFACTOR_BLOCK_TYPES = [
    'factory_route_items_to',
    'factory_current_item_defective',
    'factory_current_item_is',
    'factory_on_item_arrives',
  ] as const

  // Block types that were deleted by the Splitter refactor and must no
  // longer appear in the live PXT block registry at any level.
  const DELETED_BLOCK_TYPES = ['factory_route_current_item'] as const

  test.beforeEach(async ({ saves, mainMenu, levelSelect, toolbar, tutorial, pxt }) => {
    await saves.seedProgressUpTo(LEVEL_INDEX_SPLITTERS)
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickUnlocked(LEVEL_INDEX_SPLITTERS)
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForToolboxInteractive()
  })

  test('Splitters toolbox category is no longer rendered at Level 4', async ({ pxt }) => {
    const categories = await pxt.getToolboxCategoryDetails()
    const names = categories.map((c) => c.name)
    expect(
      names,
      `expected the rendered PXT toolbox at Level 4 to NOT include a ` +
        `"Splitters" category — it was deleted by the Splitter refactor ` +
        `(E1-E5). The route-items block now lives in Machines and the ` +
        `current-item predicates moved to Logic. Got categories: ` +
        `${JSON.stringify(names)}`,
    ).not.toContain('Splitters')
  })

  test('all four splitter-refactor block types are registered in Blockly at Level 4', async ({
    pxt,
  }) => {
    const registered = await pxt.getRegisteredBlockTypes()
    const missing = SPLITTER_REFACTOR_BLOCK_TYPES.filter((t) => !registered.includes(t))
    expect(
      missing,
      `expected all post-refactor splitter / on-item-arrives block ` +
        `types to be registered in Blockly.Blocks at Level 4, but the ` +
        `following are missing from the live PXT iframe registry: ` +
        `${JSON.stringify(missing)}. ` +
        `Registered factory_* types: ` +
        `${JSON.stringify(registered.filter((t) => t.startsWith('factory_')))}`,
    ).toEqual([])

    const stillPresent = DELETED_BLOCK_TYPES.filter((t) => registered.includes(t))
    expect(
      stillPresent,
      `expected the following deleted block types to NOT be registered ` +
        `in Blockly.Blocks anymore (E1-E5 splitter refactor removed them): ` +
        `${JSON.stringify(stillPresent)}.`,
    ).toEqual([])
  })

  test('"route items of %machine to %sides" block appears in the Machines flyout at Level 4', async ({
    pxt,
  }) => {
    await pxt.openMachinesFlyout()
    const flyoutTypes = await pxt.getOpenFlyoutBlockTypes()
    expect(
      flyoutTypes,
      `expected the Machines flyout at Level 4 to expose the new ` +
        `factory_route_items_to block ("route items of %machine to ` +
        `%sides"), declared in pxt-target/libs/core/factory.ts under ` +
        `the machines namespace. Got flyout block types: ` +
        `${JSON.stringify(flyoutTypes)}`,
    ).toContain('factory_route_items_to')
  })

  test('"current item is defective" and "current item is %partType" predicates appear in the Logic flyout at Level 4', async ({
    pxt,
  }) => {
    await pxt.openCategoryFlyout('Logic')
    const flyoutTypes = await pxt.getOpenFlyoutBlockTypes()
    expect(
      flyoutTypes,
      `expected the Logic flyout at Level 4 to expose the ` +
        `factory_current_item_defective predicate, which moved from the ` +
        `deleted Splitters category to Logic in the splitter refactor. ` +
        `Got flyout block types: ${JSON.stringify(flyoutTypes)}`,
    ).toContain('factory_current_item_defective')
    expect(
      flyoutTypes,
      `expected the Logic flyout at Level 4 to expose the ` +
        `factory_current_item_is predicate ("current item is %partType"), ` +
        `which moved from the deleted Splitters category to Logic. ` +
        `Got flyout block types: ${JSON.stringify(flyoutTypes)}`,
    ).toContain('factory_current_item_is')
  })

  test('"on item arrives at" hat block appears in the Events flyout at Level 4', async ({
    pxt,
  }) => {
    await pxt.openEventsCategory()
    const flyoutTypes = await pxt.getOpenFlyoutBlockTypes()
    expect(
      flyoutTypes,
      `expected the Events flyout at Level 4 to expose the ` +
        `factory_on_item_arrives hat block ("on item arrives at %machine"), ` +
        `which is declared in pxt-target/libs/core/factory.ts and added ` +
        `to the Events category by FactoryToolbox at level >= 4. ` +
        `Got flyout block types: ${JSON.stringify(flyoutTypes)}`,
    ).toContain('factory_on_item_arrives')
  })
})

test.describe('event hat blocks — enabled after placement on workspace', () => {
  // Use a viewport large enough that the toolbox flyout shows all
  // event-category blocks without needing to scroll. The drag tests
  // below exercise the in-app drag-from-flyout interaction and the
  // load tests exercise the save/reload round-trip independently.
  test.use({ viewport: { width: 1280, height: 800 } })

  // Level 4 (0-based index 3) unlocks `factory_on_item_arrives` per
  // src/editor/FactoryToolbox.ts.
  const LEVEL_INDEX_ITEM_ARRIVES = 3
  // Level 7 (0-based index 6) unlocks the rest of the event hats incl.
  // `factory_on_machine_idle`.
  const LEVEL_INDEX_MACHINE_IDLE = 6

  test('factory_on_item_arrives is ENABLED (not grayed/striped) after being placed on the workspace at Level 4', async ({
    saves, mainMenu, levelSelect, toolbar, tutorial, pxt,
  }) => {
    await saves.seedProgressUpTo(LEVEL_INDEX_ITEM_ARRIVES)
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickUnlocked(LEVEL_INDEX_ITEM_ARRIVES)
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForToolboxInteractive()
    await pxt.openEventsCategory()

    const blockId = await pxt.dragHatBlockOntoWorkspace('factory_on_item_arrives')
    const info = await pxt.readPlacedBlockEnabledInfo(blockId)

    expect(info.blockExists, 'dragged factory_on_item_arrives block must exist on main workspace').toBe(true)

    expect(
      info.isEnabled,
      `factory_on_item_arrives hat block should be ENABLED after being ` +
        `placed on the workspace, but block.isEnabled() returned false. ` +
        `This is the symptom reported by the user: the "on item arrived at <machine>" ` +
        `block renders grayed out with the crossing/hatched disabled-pattern ` +
        `texture. Hypothesis: Blockly's default disableOrphans change ` +
        `listener marks the hat block as disabled because its hat ` +
        `classification is established by setStartHat(true) only AFTER ` +
        `the listener has run. ` +
        `SVG path classes seen on the block root: ${JSON.stringify(info.svgPathClasses)}. ` +
        `SVG fill refs seen on the block root: ${JSON.stringify(info.svgFillRefs)}.`,
    ).toBe(true)

    expect(
      info.hasDisabledClass,
      `factory_on_item_arrives hat block SVG must NOT carry the ` +
        `\`blocklyDisabled\` CSS class — its presence is what renders the ` +
        `grayed-out hatched texture the user reported. ` +
        `SVG path classes: ${JSON.stringify(info.svgPathClasses)}.`,
    ).toBe(false)

    expect(
      info.hasDisabledPatternRef,
      `factory_on_item_arrives hat block SVG must NOT reference a ` +
        `\`blocklyDisabledPattern…\` fill pattern — its presence is what ` +
        `paints the diagonal crossing/striped overlay on disabled blocks. ` +
        `SVG fill refs: ${JSON.stringify(info.svgFillRefs)}.`,
    ).toBe(false)
  })

  test('factory_on_machine_idle is ENABLED after being placed on the workspace at Level 7 (control)', async ({
    saves, mainMenu, levelSelect, toolbar, tutorial, pxt,
  }) => {
    await saves.seedProgressUpTo(LEVEL_INDEX_MACHINE_IDLE)
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickUnlocked(LEVEL_INDEX_MACHINE_IDLE)
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForToolboxInteractive()
    await pxt.openEventsCategory()

    const blockId = await pxt.dragHatBlockOntoWorkspace('factory_on_machine_idle')
    const info = await pxt.readPlacedBlockEnabledInfo(blockId)

    expect(info.blockExists, 'dragged factory_on_machine_idle block must exist on main workspace').toBe(true)

    expect(
      info.isEnabled,
      `factory_on_machine_idle hat block should be ENABLED after being ` +
        `placed on the workspace (control test: this block shares the same ` +
        `hat-strip patch as factory_on_item_arrives, so if it is also ` +
        `disabled the bug lives in the shared hat-shape / orphan-disable ` +
        `interaction rather than in the on-item-arrives definition). ` +
        `SVG path classes: ${JSON.stringify(info.svgPathClasses)}. ` +
        `SVG fill refs: ${JSON.stringify(info.svgFillRefs)}.`,
    ).toBe(true)

    expect(
      info.hasDisabledClass,
      `factory_on_machine_idle hat block SVG must NOT carry the ` +
        `\`blocklyDisabled\` CSS class. ` +
        `SVG path classes: ${JSON.stringify(info.svgPathClasses)}.`,
    ).toBe(false)

    expect(
      info.hasDisabledPatternRef,
      `factory_on_machine_idle hat block SVG must NOT reference a ` +
        `\`blocklyDisabledPattern…\` fill pattern. ` +
        `SVG fill refs: ${JSON.stringify(info.svgFillRefs)}.`,
    ).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Save/reload round-trip: a hat block persisted to project XML must render
  // ENABLED after the editor reopens.
  //
  // This is the path that actually reproduces the user-reported "disabled
  // hat block" bug on `main`. When a player has previously interacted with
  // the workspace in a way that flipped `block.disabled` (for example, the
  // historical disable-orphans race against `setStartHat(true)`), Blockly
  // serializes that flag into the saved XML as `disabled="true"`. The next
  // time the editor opens, `Blockly.Xml.domToWorkspace` faithfully reapplies
  // the disabled flag — there is no healing for top-level hat blocks — and
  // the block renders grayed/striped forever. The XML below mirrors the
  // shape of a real persisted workspace observed in the live dev server
  // (see manual reproduction in this PR's report). The hat block is the
  // sole top-level block; its handler is empty; its `machine` slot is
  // populated with the standard `factory_pick_machine` shadow.
  // ---------------------------------------------------------------------------
  const SAVED_XML_ITEM_ARRIVES =
    '<xml xmlns="https://developers.google.com/blockly/xml">' +
    '<block type="factory_on_item_arrives" id="hat_item_arrives_test" disabled="true" x="20" y="40">' +
    '<value name="machine">' +
    '<shadow type="factory_pick_machine" id="shadow_item_arrives_test" disabled="true">' +
    '<field name="machine">Machine.A</field>' +
    '</shadow>' +
    '</value>' +
    '</block>' +
    '</xml>'

  const SAVED_XML_MACHINE_IDLE =
    '<xml xmlns="https://developers.google.com/blockly/xml">' +
    '<block type="factory_on_machine_idle" id="hat_machine_idle_test" disabled="true" x="20" y="40">' +
    '<value name="machine">' +
    '<shadow type="factory_pick_machine" id="shadow_machine_idle_test" disabled="true">' +
    '<field name="machine">Machine.A</field>' +
    '</shadow>' +
    '</value>' +
    '</block>' +
    '</xml>'

  test('factory_on_item_arrives loaded from saved project XML must be ENABLED (not grayed/striped) when the editor reopens', async ({
    saves, mainMenu, levelSelect, toolbar, tutorial, pxt,
  }) => {
    await saves.seedProgressUpTo(LEVEL_INDEX_ITEM_ARRIVES)
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickUnlocked(LEVEL_INDEX_ITEM_ARRIVES)
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForToolboxInteractive()

    const blockId = await pxt.loadWorkspaceXmlReplacing(
      SAVED_XML_ITEM_ARRIVES,
      'factory_on_item_arrives',
    )
    const info = await pxt.readPlacedBlockEnabledInfo(blockId)

    expect(
      info.blockExists,
      'factory_on_item_arrives block must exist on main workspace after loading saved XML',
    ).toBe(true)

    expect(
      info.isEnabled,
      `factory_on_item_arrives loaded from saved project XML should be ` +
        `ENABLED — expected enabled, got disabled. A top-level event hat ` +
        `block (no parent, no previous connection) is always a valid ` +
        `handler root and must never render as disabled, regardless of ` +
        `whatever stale \`disabled="true"\` attribute is carried in the ` +
        `persisted XML from an earlier save. The user sees this as: ` +
        `"every time I reopen my project, my 'on item arrived' block is ` +
        `grayed out with the hatched/striped overlay". ` +
        `Diagnostic: ` +
        `block.isEnabled()=${info.isEnabled}, ` +
        `hasDisabledClass=${info.hasDisabledClass}, ` +
        `hasDisabledPatternRef=${info.hasDisabledPatternRef}. ` +
        `SVG fill refs: ${JSON.stringify(info.svgFillRefs)}.`,
    ).toBe(true)

    expect(
      info.hasDisabledClass,
      `factory_on_item_arrives loaded from saved project XML must NOT ` +
        `carry the \`blocklyDisabled\` CSS class on any of its SVG paths. ` +
        `SVG path classes: ${JSON.stringify(info.svgPathClasses)}.`,
    ).toBe(false)

    expect(
      info.hasDisabledPatternRef,
      `factory_on_item_arrives loaded from saved project XML must NOT ` +
        `reference the \`blocklyDisabledPattern…\` fill pattern (this is ` +
        `the diagonal-stripe overlay that paints the block as "grayed ` +
        `out / hatched" in the workspace). ` +
        `SVG fill refs: ${JSON.stringify(info.svgFillRefs)}.`,
    ).toBe(false)
  })

  test('factory_on_machine_idle loaded from saved project XML must be ENABLED (control)', async ({
    saves, mainMenu, levelSelect, toolbar, tutorial, pxt,
  }) => {
    await saves.seedProgressUpTo(LEVEL_INDEX_MACHINE_IDLE)
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickUnlocked(LEVEL_INDEX_MACHINE_IDLE)
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForToolboxInteractive()

    const blockId = await pxt.loadWorkspaceXmlReplacing(
      SAVED_XML_MACHINE_IDLE,
      'factory_on_machine_idle',
    )
    const info = await pxt.readPlacedBlockEnabledInfo(blockId)

    expect(
      info.blockExists,
      'factory_on_machine_idle block must exist on main workspace after loading saved XML',
    ).toBe(true)

    expect(
      info.isEnabled,
      `factory_on_machine_idle loaded from saved project XML should be ` +
        `ENABLED — expected enabled, got disabled. Control case for the ` +
        `sibling \`factory_on_item_arrives\` test: both hat block types ` +
        `share the same hat-strip patch, so if both fail the bug lives ` +
        `in the shared load-from-XML path; if only the other fails the ` +
        `bug is specific to \`factory_on_item_arrives\`. ` +
        `Diagnostic: ` +
        `block.isEnabled()=${info.isEnabled}, ` +
        `hasDisabledClass=${info.hasDisabledClass}, ` +
        `hasDisabledPatternRef=${info.hasDisabledPatternRef}. ` +
        `SVG fill refs: ${JSON.stringify(info.svgFillRefs)}.`,
    ).toBe(true)

    expect(
      info.hasDisabledClass,
      `factory_on_machine_idle loaded from saved project XML must NOT ` +
        `carry the \`blocklyDisabled\` CSS class. ` +
        `SVG path classes: ${JSON.stringify(info.svgPathClasses)}.`,
    ).toBe(false)

    expect(
      info.hasDisabledPatternRef,
      `factory_on_machine_idle loaded from saved project XML must NOT ` +
        `reference the \`blocklyDisabledPattern…\` fill pattern. ` +
        `SVG fill refs: ${JSON.stringify(info.svgFillRefs)}.`,
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Event hat decompile preserves machine argument AND handler body.
//
// Bug: PXT's compile traversal calls `setEnabled(false)` on descendants of
// 2-parameter event hat blocks (`factory_on_item_arrives`,
// `factory_on_machine_idle`) because they declare BOTH `hasHandler=true`
// AND `handlerStatement=true`. As a consequence the decompiler walks past
// the disabled `factory_pick_machine` shadow in the `machine` slot AND
// past every statement inside the HANDLER input, producing
// `events.onItemArrives(null, function () {\n\t\n})` — losing both the
// machine argument and the body. The BlockInterpreter then registers an
// empty handler, so the runtime never reacts to item arrivals at the
// configured machine.
//
// The fix lives in `src/editor/hatBlockShape.ts`: extend
// `patchBlockProtoSetEnabled` to refuse `setEnabled(false)` on any
// descendant of a hat block. These three tests (A + B + C) lock the
// expected post-fix shape.
test.describe('event hat decompile preserves machine arg and body', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  // Workspace XML for Test A: a single `factory_on_item_arrives` hat with
  // `Machine.A` in its picker slot and a single `factory_start_machine`
  // for `Machine.B` inside its HANDLER statement input.
  const XML_ON_ITEM_ARRIVES =
    '<xml xmlns="https://developers.google.com/blockly/xml">' +
      '<block type="factory_on_item_arrives" id="hatItemArrivesA" x="10" y="10">' +
        '<value name="machine">' +
          '<shadow type="factory_pick_machine" id="pickMachineForHatA">' +
            '<field name="machine">Machine.A</field>' +
          '</shadow>' +
        '</value>' +
        '<statement name="HANDLER">' +
          '<block type="factory_start_machine" id="startMachineInHandlerA">' +
            '<value name="machine">' +
              '<shadow type="factory_pick_machine" id="pickMachineInHandlerA">' +
                '<field name="machine">Machine.B</field>' +
              '</shadow>' +
            '</value>' +
          '</block>' +
        '</statement>' +
      '</block>' +
    '</xml>'

  // Same shape for Test B but with `factory_on_machine_idle`.
  const XML_ON_MACHINE_IDLE =
    '<xml xmlns="https://developers.google.com/blockly/xml">' +
      '<block type="factory_on_machine_idle" id="hatMachineIdleA" x="10" y="10">' +
        '<value name="machine">' +
          '<shadow type="factory_pick_machine" id="pickMachineForIdleHatA">' +
            '<field name="machine">Machine.A</field>' +
          '</shadow>' +
        '</value>' +
        '<statement name="HANDLER">' +
          '<block type="factory_start_machine" id="startMachineInIdleHandlerA">' +
            '<value name="machine">' +
              '<shadow type="factory_pick_machine" id="pickMachineInIdleHandlerA">' +
                '<field name="machine">Machine.B</field>' +
              '</shadow>' +
            '</value>' +
          '</block>' +
        '</statement>' +
      '</block>' +
    '</xml>'

  test('factory_on_item_arrives decompiles to events.onItemArrives(pickMachine(Machine.A), …) with startMachine(B) in body', async ({
    mainMenu, toolbar, tutorial, pxt,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await pxt.openAndWaitForBlockly()
    await pxt.waitForPxtReady()
    await pxt.waitForToolboxInteractive()
    await pxt.waitForPxtBootstrapSettled()

    await pxt.loadWorkspaceViaProductionPath(
      XML_ON_ITEM_ARRIVES,
      'factory_on_item_arrives',
    )
    const source = await pxt.compileBlocksToTs({
      blocksMustContain: ['factory_on_item_arrives'],
      tsMustContain: [
        'events.onItemArrives(machines.pickMachine(Machine.A)',
        'machines.startMachine(machines.pickMachine(Machine.B))',
      ],
    })

    expect(
      source,
      `factory_on_item_arrives must decompile its machine slot to ` +
        `\`machines.pickMachine(Machine.A)\` — NOT \`null\`. The bug ` +
        `(PXT compile pass disables descendants of 2-param event hats) ` +
        `makes the \`factory_pick_machine\` shadow disabled, so the ` +
        `decompiler emits \`null\` for the first argument. ` +
        `Captured main.ts: ${JSON.stringify(source)}`,
    ).toContain('events.onItemArrives(machines.pickMachine(Machine.A)')

    expect(
      source,
      `factory_on_item_arrives must decompile its HANDLER statement ` +
        `body to \`machines.startMachine(machines.pickMachine(Machine.B))\` — ` +
        `NOT an empty body. The bug disables every block under the HANDLER ` +
        `input so the decompiler skips them, producing ` +
        `\`function () {\\n\\t\\n}\`. ` +
        `Captured main.ts: ${JSON.stringify(source)}`,
    ).toContain('machines.startMachine(machines.pickMachine(Machine.B))')

    expect(
      source,
      `factory_on_item_arrives must NOT decompile to \`null\` as the ` +
        `machine argument. Captured main.ts: ${JSON.stringify(source)}`,
    ).not.toContain('events.onItemArrives(null')
  })

  test('factory_on_machine_idle decompiles to events.onMachineIdle(pickMachine(Machine.A), …) with startMachine(B) in body', async ({
    mainMenu, toolbar, tutorial, pxt,
  }) => {
    await mainMenu.enterSandbox(toolbar, tutorial)
    await pxt.openAndWaitForBlockly()
    await pxt.waitForPxtReady()
    await pxt.waitForToolboxInteractive()
    await pxt.waitForPxtBootstrapSettled()

    await pxt.loadWorkspaceViaProductionPath(
      XML_ON_MACHINE_IDLE,
      'factory_on_machine_idle',
    )
    const source = await pxt.compileBlocksToTs({
      blocksMustContain: ['factory_on_machine_idle'],
      tsMustContain: [
        'events.onMachineIdle(machines.pickMachine(Machine.A)',
        'machines.startMachine(machines.pickMachine(Machine.B))',
      ],
    })

    expect(
      source,
      `factory_on_machine_idle must decompile its machine slot to ` +
        `\`machines.pickMachine(Machine.A)\` — NOT \`null\`. Same root ` +
        `cause as the on-item-arrives sibling: both 2-param hats declare ` +
        `\`hasHandler=true\` AND \`handlerStatement=true\`, so PXT's ` +
        `compile pass disables their descendants and the decompiler ` +
        `skips them. ` +
        `Captured main.ts: ${JSON.stringify(source)}`,
    ).toContain('events.onMachineIdle(machines.pickMachine(Machine.A)')

    expect(
      source,
      `factory_on_machine_idle must decompile its HANDLER statement ` +
        `body to \`machines.startMachine(machines.pickMachine(Machine.B))\` — ` +
        `NOT an empty body. ` +
        `Captured main.ts: ${JSON.stringify(source)}`,
    ).toContain('machines.startMachine(machines.pickMachine(Machine.B))')

    expect(
      source,
      `factory_on_machine_idle must NOT decompile to \`null\` as the ` +
        `machine argument. Captured main.ts: ${JSON.stringify(source)}`,
    ).not.toContain('events.onMachineIdle(null')
  })

  test('Assembly.json splitter routing decompiles to a non-empty body that calls routeCurrentItemTo on both branches', async ({
    mainMenu, toolbar, tutorial, projectsPanel, pxt,
  }) => {
    // Read the bundled Assembly fixture from disk (Playwright tests run
    // in Node, so this is allowed in the spec — it is purely test-side
    // file I/O, not a runtime page evaluation).
    const fs = await import('node:fs')
    const path = await import('node:path')
    const fixturePath = path.resolve(process.cwd(), 'projects', 'Assembly.json')
    const fixtureContent = fs.readFileSync(fixturePath, 'utf8')

    // Derive the expected SplitterOutputs.* enum literals from the
    // fixture's own blocks-XML tree, so the assertion can't drift if a
    // teammate edits projects/Assembly.json. The fixture stores blocks
    // as a JSON tree of {tag, attrs, children} nodes mirroring Blockly
    // XML. Walk the tree, find the named `<statement>` (DO0 = defective
    // branch, ELSE = clean branch), then read the `side` field of its
    // descendant `factory_route_current_item_to` block.
    type FixtureNode = {
      tag?: string
      attrs?: Record<string, string>
      children?: Array<FixtureNode | string>
    }
    const findRouteSideInStatement = (statementName: string): string => {
      const findSide = (node: FixtureNode): string | undefined => {
        if (node.tag === 'block' && node.attrs?.type === 'factory_route_current_item_to') {
          for (const c of node.children ?? []) {
            if (
              typeof c === 'object' &&
              c.tag === 'field' &&
              c.attrs?.name === 'side'
            ) {
              const txt = c.children?.[0]
              if (typeof txt === 'string') return txt
            }
          }
        }
        for (const c of node.children ?? []) {
          if (typeof c === 'object') {
            const r = findSide(c)
            if (r) return r
          }
        }
        return undefined
      }
      let found: string | undefined
      const walk = (node: unknown): void => {
        if (found || node === null || typeof node !== 'object') return
        if (Array.isArray(node)) {
          for (const item of node) walk(item)
          return
        }
        const n = node as FixtureNode & Record<string, unknown>
        if (n.tag === 'statement' && n.attrs?.name === statementName) {
          found = findSide(n)
          if (found) return
        }
        for (const v of Object.values(n)) walk(v)
      }
      walk(JSON.parse(fixtureContent) as unknown)
      if (!found) {
        throw new Error(
          `Could not extract SplitterOutputs side for <statement name="${statementName}"> ` +
            `from projects/Assembly.json — fixture structure changed unexpectedly.`,
        )
      }
      return found
    }
    const defectiveSide = findRouteSideInStatement('DO0')
    const cleanSide = findRouteSideInStatement('ELSE')

    await mainMenu.enterSandbox(toolbar, tutorial)

    // Import the bundle as a slot, then load it via double-click. The
    // Projects panel does NOT auto-load on import; loading is the
    // dblclick contract (see SandboxProjects.spec.ts).
    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.importBundleFromString('Assembly.json', fixtureContent)
    await projectsPanel.expectSlotPresent('Assembly')
    await projectsPanel.doubleClickSlot('Assembly')

    // Close the panel and open the PXT editor so the load-pipeline can
    // re-decompile the project's blocks into main.ts.
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForPxtReady()
    // Wait for PXT to settle after loading the bundled project; under
    // parallel-worker load the bundled `main.ts` echo can race the
    // watchdog, leaving `lastPxtSource` stale.
    await pxt.waitForPxtBootstrapSettled()

    const source = await pxt.compileBlocksToTs({
      blocksMustContain: ['factory_on_item_arrives'],
      tsMustContain: [
        'events.onItemArrives(machines.pickMachine(Machine.E)',
        'routeCurrentItemTo',
      ],
    })

    expect(
      source,
      `Assembly.json's compiled main.ts must contain routeCurrentItemTo ` +
        `calls (post-fix the controls_if survives the hat body). ` +
        `Captured main.ts: ${JSON.stringify(source)}`,
    ).toContain('routeCurrentItemTo')

    expect(
      source,
      `Assembly.json's factory_on_item_arrives hat at Splitter ` +
        `Machine.E must decompile with its machine argument preserved ` +
        `as \`machines.pickMachine(Machine.E)\` — NOT \`null\`. The ` +
        `bug strips the picker shadow because PXT marks descendants of ` +
        `2-param event hats disabled before decompile. ` +
        `Captured main.ts: ${JSON.stringify(source)}`,
    ).toContain('events.onItemArrives(machines.pickMachine(Machine.E)')

    expect(
      source,
      `Assembly.json's HANDLER body for Machine.E must decompile to a ` +
        `\`controls_if\` calling \`logic.currentItemIsDefective()\`. ` +
        `The fixture's blocks XML wires the defective-item predicate to ` +
        `IF0, so the post-fix decompile must reference it. ` +
        `Captured main.ts: ${JSON.stringify(source)}`,
    ).toContain('logic.currentItemIsDefective()')

    expect(
      source,
      `Assembly.json's HANDLER body must decompile to route defective ` +
        `items to \`${defectiveSide}\` (the side stored in the ` +
        `fixture's DO0/defective branch). The bug drops the entire ` +
        `HANDLER body, so this call is missing on \`main\`. ` +
        `Captured main.ts: ${JSON.stringify(source)}`,
    ).toContain(`machines.routeCurrentItemTo(machines.pickMachine(Machine.E), ${defectiveSide})`)

    expect(
      source,
      `Assembly.json's HANDLER body must decompile to route ` +
        `non-defective items to \`${cleanSide}\` (the side stored in ` +
        `the fixture's ELSE branch). ` +
        `Captured main.ts: ${JSON.stringify(source)}`,
    ).toContain(`machines.routeCurrentItemTo(machines.pickMachine(Machine.E), ${cleanSide})`)

    expect(
      source,
      `Assembly.json's Splitter handler must NOT decompile to ` +
        `\`events.onItemArrives(null, …)\` — that is the exact symptom ` +
        `of the bug under test. ` +
        `Captured main.ts: ${JSON.stringify(source)}`,
    ).not.toContain('events.onItemArrives(null')
  })
})

// =====================================================================
// route_current_item shadow (moved from PxtRouteCurrentItemShadow.spec.ts)
// =====================================================================
test.describe('route_current_item shadow', () => {
  // Level 4 (0-based index 3) is the first level that exposes the Machines
  // category block `factory_route_current_item_to`. Mirrors the sibling
  // Splitter-refactor describe earlier in this file.
  const LEVEL_INDEX_SPLITTERS_ROUTE = 3

  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ saves, mainMenu, levelSelect, toolbar, tutorial, pxt }) => {
    await saves.seedProgressUpTo(LEVEL_INDEX_SPLITTERS_ROUTE)
    await mainMenu.open()
    await mainMenu.clickStartGame()
    await levelSelect.expectVisible()
    await levelSelect.clickUnlocked(LEVEL_INDEX_SPLITTERS_ROUTE)
    await toolbar.expectVisible()
    await tutorial.dismissIfPresent()
    await pxt.openAndWaitForBlockly()
    await pxt.waitForToolboxInteractive()
  })

  test('dragged "route current item" block renders the new "route current item of … to …" wording', async ({
    pxt,
  }) => {
    await pxt.openMachinesFlyout()
    await pxt.dragBlockFromFlyout('route current item')

    const rendered = await pxt.readWorkspaceBlocksRenderedText('factory_route_current_item_to')
    expect(
      rendered.length,
      `expected exactly one factory_route_current_item_to block on the ` +
        `workspace after dragging it out of the Machines flyout. ` +
        `Got: ${JSON.stringify(rendered)}`,
    ).toBe(1)

    const joined = rendered[0].joined
    expect(
      joined,
      `expected the dragged factory_route_current_item_to block to render ` +
        `the NEW wording "route current item of %machine to %side" — the ` +
        `block's own SVG label text must contain the substring ` +
        `"route current item of". Got rendered segments: ` +
        `${JSON.stringify(rendered[0].svgTexts)}`,
    ).toContain('route current item of')
    expect(
      joined,
      `expected the dragged factory_route_current_item_to block to render ` +
        `the side label "to" between %machine and %side. Got rendered ` +
        `segments: ${JSON.stringify(rendered[0].svgTexts)}`,
    ).toContain('to')
  })

  test('dragged "route current item" block has a factory_pick_machine shadow in its machine slot', async ({
    pxt,
  }) => {
    await pxt.openMachinesFlyout()
    await pxt.dragBlockFromFlyout('route current item')

    const consumers = await pxt.readPluggableConsumerBlocksFromLiveWorkspace(
      'factory_route_current_item_to',
      'machine',
    )
    expect(
      consumers.length,
      `expected the live workspace XML to contain exactly one ` +
        `factory_route_current_item_to entry after dragging it from the ` +
        `Machines flyout. Got: ${JSON.stringify(consumers)}`,
    ).toBe(1)
    const entry = consumers[0]
    expect(
      entry.hasValueInput,
      `expected the dragged factory_route_current_item_to block to expose ` +
        `a <value name="machine"> input slot so the machine-picker shadow ` +
        `can be attached. Got entry: ${JSON.stringify(entry)}`,
    ).toBe(true)
    expect(
      entry.slotChildType,
      `expected the machine slot of factory_route_current_item_to to be ` +
        `populated by a factory_pick_machine shadow (the Blockly-rendered ` +
        `machine dropdown). Instead the slot child type is ` +
        `${JSON.stringify(entry.slotChildType)} — a raw numeric/text input ` +
        `means PXT failed to attach the declared shadow because %name ` +
        `order in the block text disagrees with the (machine, side) ` +
        `signature. Full entry: ${JSON.stringify(entry)}`,
    ).toBe('factory_pick_machine')
    expect(
      entry.slotChildIsShadow,
      `expected the machine slot child to be a <shadow> (not a concrete ` +
        `<block>) so the player can swap in another machine-returning ` +
        `expression. Got entry: ${JSON.stringify(entry)}`,
    ).toBe(true)
  })
})

