import { test, expect, type Page } from '@playwright/test'

/**
 * E2E test (RED stage): the `factory_start_machine` block's `MACHINE` dropdown
 * must reflect the current set of placed machines, including the empty case.
 *
 * BUG under test:
 *   "Adding the first or removing the last machine from the game does not
 *    update the machine selector. When there is no machine the selector
 *    should be empty."
 *
 * Expected behavior verified here (against i18n key `blocks.no_machines`,
 * English: "(no machines)"):
 *
 *   - With 0 machines the dropdown shows EXACTLY one option whose visible
 *     text is the empty-state placeholder. It must NOT contain the default
 *     enum-member labels ("A".."H", "M9".."M12", or the bare PXT placeholder
 *     "foo").
 *   - The closed block face (the dropdown's display text) shows the same
 *     placeholder.
 *   - After placing a machine the dropdown shows EXACTLY one option matching
 *     that machine's name and the closed face shows the same name.
 *   - After removing the last machine the empty-state is restored.
 *
 * Inspection strategy: we instantiate the block on the PXT main workspace via
 * Blockly's API and call `field.getOptions()` / `field.getText()` on the
 * MACHINE field. These are the exact arrays/strings Blockly renders when the
 * user clicks the field — calling them is equivalent to "open the dropdown
 * and read the menu" but is far less flaky than scripting an SVG click and
 * scraping `.blocklyDropDownDiv`. The bug, if present, manifests in the
 * underlying option list and field text regardless of how it is surfaced.
 */

test.use({ viewport: { width: 1280, height: 800 } })

const EMPTY_LABEL = '(no machines)'
const FORBIDDEN_PLACEHOLDERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'foo']

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function gridCellToScreenPos(page: Page, gx: number, gz: number) {
  return page.evaluate(
    ({ gx, gz }) => {
      const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const W = 20, H = 20
      const worldX = gx - W / 2 + 0.5, worldZ = gz - H / 2 + 0.5
      const fov = (50 * Math.PI) / 180
      const d = (Math.max(W, H) / (2 * Math.tan(fov / 2))) * 1.2
      const cx = d * 0.7, cy = d * 0.7, cz = d * 0.7
      const fl = Math.sqrt(cx * cx + cy * cy + cz * cz)
      const fx = -cx / fl, fy = -cy / fl, fz = -cz / fl
      let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0
      const rl = Math.sqrt(rx * rx + ry * ry + rz * rz)
      rx /= rl; ry /= rl; rz /= rl
      const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx
      const dx = worldX - cx, dy = 0 - cy, dz = worldZ - cz
      const vx = dx * rx + dy * ry + dz * rz
      const vy = dx * ux + dy * uy + dz * uz
      const vz_ = dx * fx + dy * fy + dz * fz
      const thf = Math.tan(fov / 2), asp = rect.width / rect.height
      const nx = vx / (-vz_ * thf * asp), ny = vy / (-vz_ * thf)
      return {
        x: Math.round(((nx + 1) / 2) * rect.width),
        y: Math.round(((1 - ny) / 2) * rect.height),
      }
    },
    { gx, gz },
  )
}

async function dblClickGridCell(page: Page, gx: number, gz: number) {
  const pos = await gridCellToScreenPos(page, gx, gz)
  await page.locator('#canvas-container canvas').dblclick({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(250)
}

async function clickGridCell(page: Page, gx: number, gz: number) {
  const pos = await gridCellToScreenPos(page, gx, gz)
  await page.locator('#canvas-container canvas').click({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(200)
}

/** Enter Sandbox with a guaranteed-empty factory (clears localStorage first). */
async function enterEmptySandbox(page: Page) {
  await page.addInitScript(() => {
    try { localStorage.clear() } catch { /* ignore */ }
  })
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas')
    return !!c && c.width > 0 && c.height > 0
  })
  // Sandbox is the last button on the main menu.
  await page.locator('.ui-main-menu-btn').last().click()
  await expect(page.locator('.ui-toolbar')).toBeVisible()
  await page.waitForTimeout(800)

  // Sanity: factory is empty.
  const count = await page.evaluate(() => {
    const t = (window as any).__test
    return t?.getMachines?.().length ?? -1
  })
  expect(count, 'sandbox should start with 0 machines').toBe(0)
}

async function openEditorAndWaitForBlockly(page: Page) {
  const editorBtn = page.locator('.ui-toolbar-btn--editor')
  const container = page.locator('#editor-container')
  if (!(await container.evaluate((el) => el.classList.contains('open')))) {
    await editorBtn.click()
  }
  await expect(container).toHaveClass(/open/)
  const iframe = page.locator('#editor-container .pxt-editor-iframe')
  await expect(iframe).toBeVisible({ timeout: 15000 })
  const pxtFrame = page.frameLocator('#editor-container .pxt-editor-iframe')
  await expect(pxtFrame.locator('.blocklySvg')).toBeAttached({ timeout: 15000 })
  // Wait for the toolbox to be populated.
  await expect(
    pxtFrame.locator('.blocklyToolboxDiv .blocklyTreeRoot [role="treeitem"] .blocklyTreeLabel').first(),
  ).toBeVisible({ timeout: 15000 })
}

async function closeEditorIfOpen(page: Page) {
  const container = page.locator('#editor-container')
  if (await container.evaluate((el) => el.classList.contains('open'))) {
    await page.locator('.ui-toolbar-btn--editor').click()
    await expect(container).not.toHaveClass(/open/)
  }
}

/**
 * Create a `factory_start_machine` block on the PXT main workspace and return
 * a stable handle (the block's id) so we can re-inspect it after factory
 * changes without re-creating it.
 */
async function createStartMachineBlock(page: Page): Promise<string> {
  const iframeEl = await page.locator('#editor-container .pxt-editor-iframe').elementHandle()
  expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
  const id = await page.evaluate((el) => {
    const win = (el as HTMLIFrameElement).contentWindow as any
    if (!win || !win.Blockly) throw new Error('Blockly not available on PXT iframe window')
    const ws = win.Blockly.mainWorkspace
    const b = ws.newBlock('factory_start_machine')
    if (!b) throw new Error('factory_start_machine block could not be created')
    if (typeof b.initSvg === 'function') b.initSvg()
    if (typeof b.render === 'function') b.render()
    return b.id as string
  }, iframeEl!)
  expect(id).toBeTruthy()
  return id
}

interface DropdownSnapshot {
  /** Visible labels of every option in the dropdown menu. */
  optionLabels: string[]
  /** The dropdown's machine value (enum key like "Machine.A"). */
  fieldValue: string
  /** Visible text on the closed block face for the MACHINE field. */
  faceText: string
}

async function readMachineDropdown(page: Page, blockId: string): Promise<DropdownSnapshot> {
  const iframeEl = await page.locator('#editor-container .pxt-editor-iframe').elementHandle()
  expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
  return page.evaluate(
    ({ el, id }) => {
      const win = (el as HTMLIFrameElement).contentWindow as any
      if (!win || !win.Blockly) throw new Error('Blockly not available')
      const ws = win.Blockly.mainWorkspace
      const block = ws.getBlockById(id)
      if (!block) throw new Error(`Block ${id} not found on workspace`)
      // Field name is lowercase 'machine' (matches the %machine arg in the
      // block definition `block="start machine %machine"`).
      const field = block.getField('machine')
      if (!field) throw new Error(`machine field not found on block ${id}`)
      // `getOptions()` is what Blockly calls to populate the menu when the
      // user clicks the field. Pass useCache=false to force a fresh read.
      let raw: any[] = []
      try {
        raw = typeof field.getOptions === 'function' ? field.getOptions(false) : []
      } catch {
        raw = typeof field.getOptions === 'function' ? field.getOptions() : []
      }
      const optionLabels: string[] = raw.map((o: any) => {
        if (Array.isArray(o)) {
          const head = o[0]
          if (typeof head === 'string') return head
          if (head && typeof head === 'object' && 'alt' in head) return String(head.alt ?? '')
          return ''
        }
        return ''
      })
      const fieldValue: string = typeof field.getValue === 'function' ? String(field.getValue() ?? '') : ''
      const faceText: string = typeof field.getText === 'function' ? String(field.getText() ?? '') : ''
      return { optionLabels, fieldValue, faceText }
    },
    { el: iframeEl!, id: blockId },
  )
}

function assertOnlyEmptyPlaceholder(snap: DropdownSnapshot, ctx: string) {
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

// ─── Spec ────────────────────────────────────────────────────────────────────

test.describe('PXT machine dropdown — reflects factory state (empty / add / remove)', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({
        path: `tests/e2e/screenshots/${testInfo.title.replace(/\s+/g, '-')}.png`,
        fullPage: true,
      }).catch(() => undefined)
    }
  })

  test('full lifecycle: empty → add → name shown → remove → empty again', async ({ page }) => {
    // 1. Fresh sandbox, factory has 0 machines.
    await enterEmptySandbox(page)

    // 2. Open the PXT editor and wait for Blockly.
    await openEditorAndWaitForBlockly(page)

    // 3. Add the `factory_start_machine` block to the workspace (the user
    //    would drag it from the Actions toolbox category).
    const blockId = await createStartMachineBlock(page)

    // 4 + 5. Inspect the MACHINE dropdown: exactly one option, the empty
    //    placeholder. None of the default enum placeholders may appear.
    {
      const snap = await readMachineDropdown(page, blockId)
      assertOnlyEmptyPlaceholder(snap, 'initial empty state (0 machines)')
    }

    // 6. (Dropdown is read via API; nothing to close.)
    // 7. Add a machine: close the editor first so the canvas is fully
    //    interactable, double-click to place a Fabricator, then re-open.
    await closeEditorIfOpen(page)
    await dblClickGridCell(page, 5, 10)
    await expect
      .poll(async () =>
        page.evaluate(() => (window as any).__test?.getMachines?.().length ?? 0),
      { timeout: 5000 })
      .toBe(1)

    // Read the machine's actual display name so we can compare against the
    // dropdown text (the production code derives the label from this name).
    const placedName = await page.evaluate(() => {
      const gm = (window as any).__gameManager
      const m = gm?.factory?.getMachines?.()[0]
      return (m?.name ?? m?.type ?? '') as string
    })
    expect(placedName, 'placed machine should expose a non-empty display name').toBeTruthy()

    await openEditorAndWaitForBlockly(page)

    // 8 + 9. Re-open the dropdown on the same block and assert it now
    //    contains exactly ONE option matching the new machine's name and
    //    the empty-state placeholder is gone.
    {
      const snap = await readMachineDropdown(page, blockId)
      expect(
        snap.optionLabels,
        `after placing 1 machine: dropdown should contain exactly one option matching "${placedName}". ` +
          `Got: ${JSON.stringify(snap.optionLabels)}`,
      ).toEqual([placedName])
      expect(
        snap.optionLabels,
        'after placing 1 machine: empty-state placeholder must be gone',
      ).not.toContain(EMPTY_LABEL)

      // 10. The closed face shows the new machine's name (not the placeholder
      //     and not "A"/"foo").
      expect(snap.faceText, 'closed block face should show the placed machine name').toBe(placedName)
      for (const forbidden of FORBIDDEN_PLACEHOLDERS) {
        expect(
          snap.faceText,
          `closed block face must not show the default placeholder "${forbidden}"`,
        ).not.toBe(forbidden)
      }
      expect(snap.faceText, 'closed block face must not show empty-state placeholder').not.toBe(EMPTY_LABEL)
    }

    // 11. Remove the machine: select it and press Delete.
    await closeEditorIfOpen(page)
    await clickGridCell(page, 5, 10)
    await expect(page.locator('.ui-machine-panel')).toBeVisible()
    await page.keyboard.press('Delete')
    await expect
      .poll(async () =>
        page.evaluate(() => (window as any).__test?.getMachines?.().length ?? 0),
      { timeout: 5000 })
      .toBe(0)

    await openEditorAndWaitForBlockly(page)

    // 12 + 13. Block face reverts to the empty placeholder; dropdown holds
    //    only the empty-state option.
    {
      const snap = await readMachineDropdown(page, blockId)
      assertOnlyEmptyPlaceholder(snap, 'after removing the last machine')
    }
  })
})
