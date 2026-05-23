import { test, expect } from './pom'

// Level 4 (0-based index 3) is the first level that exposes the Machines
// category block `factory_route_current_item_to`. Mirrors the sibling
// Splitter-refactor describe in PxtEditor.spec.ts.
const LEVEL_INDEX_SPLITTERS = 3

test.describe('factory_route_current_item_to — block wording + machine-picker shadow', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

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
