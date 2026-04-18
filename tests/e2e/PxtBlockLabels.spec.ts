import { test, expect, type Page } from '@playwright/test'

/**
 * E2E test: `factory_pick_machine` block label (the "machine instance" block).
 *
 * Bug reproduction: the block currently renders as
 *   "machine machine Part Fabricator 1"
 * because the block definition template is `block="machine %machine"` AND the
 * dropdown field itself displays the human-readable machine name (which, for
 * historical reasons, is prefixed by the enum label "machine ...").
 *
 * Expected behavior: the rendered text for the `factory_pick_machine` block
 * should contain the word "machine" AT MOST ONCE (either as the static prefix
 * OR inside the dropdown — not both).
 *
 * This spec is intentionally FAILING today (RED stage). It must be written
 * BEFORE any fix to the production code.
 */

test.use({ viewport: { width: 1280, height: 800 } })

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
  await page.waitForTimeout(200)
}

async function enterSandboxAndPlaceMachine(page: Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas')
    return !!c && c.width > 0 && c.height > 0
  })
  // Sandbox is the last button on the main menu in the default UI.
  await page.locator('.ui-main-menu-btn').last().click()
  await expect(page.locator('.ui-toolbar')).toBeVisible()
  await page.waitForTimeout(800)

  // Place a Fabricator (default type) at the center of the grid via
  // double-click. The UI flow triggers `syncFactoryToEditor`, which pushes
  // the machine list into the PXT editor dropdown.
  await dblClickGridCell(page, 10, 10)

  // Sanity: the factory now has at least one machine.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const gm = (window as any).__gameManager
          return gm?.factory?.getMachines()?.length ?? 0
        }),
      { timeout: 5000 },
    )
    .toBeGreaterThanOrEqual(1)
}

async function openEditorAndWaitForBlockly(page: Page) {
  await page.locator('.ui-toolbar-btn--editor').click()
  await expect(page.locator('#editor-container')).toHaveClass(/open/)
  const iframe = page.locator('#editor-container .pxt-editor-iframe')
  await expect(iframe).toBeVisible({ timeout: 15000 })
  const pxtFrame = page.frameLocator('#editor-container .pxt-editor-iframe')
  await expect(pxtFrame.locator('.blocklySvg')).toBeAttached({ timeout: 15000 })
  // Wait for the toolbox to be populated so the Machines category exists.
  await expect(
    pxtFrame.locator('.blocklyToolboxDiv .blocklyTreeRoot [role="treeitem"] .blocklyTreeLabel').first(),
  ).toBeVisible({ timeout: 15000 })
}

/**
 * Open the "Machines" toolbox category so its flyout is rendered, then read
 * the visible text of the `factory_pick_machine` flyout block via Blockly's
 * API (accessible on the iframe's window).
 */
async function readPickMachineBlockText(page: Page): Promise<string> {
  // Click the Machines category to open its flyout.
  const pxtFrame = page.frameLocator('#editor-container .pxt-editor-iframe')
  await pxtFrame
    .locator('.blocklyToolboxDiv .blocklyTreeRoot [role="treeitem"]', { hasText: 'Machines' })
    .first()
    .click()
  // Wait for the flyout to contain at least one block.
  await expect(pxtFrame.locator('.blocklyFlyout .blocklyDraggable').first()).toBeAttached({
    timeout: 10000,
  })

  // Poll: block.toString() becomes stable once the async machine-list patch
  // has re-rendered the flyout block.
  let text = ''
  await expect
    .poll(
      async () => {
        const iframeEl = await page.locator('#editor-container .pxt-editor-iframe').elementHandle()
        if (!iframeEl) return ''
        text = await page.evaluate((el) => {
          const frame = el as HTMLIFrameElement
          const win = frame.contentWindow as any
          if (!win || !win.Blockly) return ''
          const ws = win.Blockly.mainWorkspace
          const flyout = ws?.getFlyout?.()
          const flyoutWs = flyout?.getWorkspace?.()
          const blocks: any[] = flyoutWs?.getAllBlocks?.(false) ?? []
          const pick = blocks.find((b) => b.type === 'factory_pick_machine')
          if (!pick) return ''
          // Prefer `toString()` which returns the full human-readable text of
          // the block (field dropdown label + static words).
          try {
            return pick.toString?.() ?? ''
          } catch {
            return ''
          }
        }, iframeEl)
        return text
      },
      { timeout: 10000 },
    )
    .not.toEqual('')

  return text
}

test.describe('PXT Block Labels — factory_pick_machine ("machine instance" block)', () => {
  test('rendered block text contains the word "machine" at most once', async ({ page }) => {
    await enterSandboxAndPlaceMachine(page)
    await openEditorAndWaitForBlockly(page)

    const blockText = await readPickMachineBlockText(page)
    const matches = blockText.match(/\bmachine\b/gi) ?? []

    expect(
      matches.length,
      `Expected block text to contain the word "machine" at most once but got ${matches.length} occurrences. ` +
        `Full block text: "${blockText}"`,
    ).toBeLessThanOrEqual(1)
  })
})
