import { test, expect, type Page } from '@playwright/test'

/**
 * E2E test (RED stage): when the PXT editor is OPEN with the "Machines"
 * toolbox category EXPANDED (so its flyout blocks are on screen), placing the
 * FIRST machine on the factory grid must update each flyout block's `machine`
 * dropdown — the visible label must change from the empty-state placeholder
 * "(no machines)" to the new machine's name.
 *
 * BUG under test:
 *   The patched dropdown options provider does compute the new machine list,
 *   but `block.render()` does not invalidate Blockly's cached field display
 *   text. As a result the flyout blocks keep rendering "(no machines)" until
 *   the flyout is destroyed and rebuilt (e.g. by collapsing+reopening the
 *   category, or closing+reopening the editor).
 *
 * This spec complements `pxt-machine-dropdown-empty.spec.ts`, which verifies
 * the underlying option list / closed-block face on the MAIN workspace. Here
 * we exercise the FLYOUT specifically, which has its own per-category block
 * cache.
 *
 * Inspection strategy: read each flyout block's `machine` field via two
 * independent paths and require both to agree:
 *   1. Blockly API on the iframe window — `getField('machine').getText()`.
 *   2. Rendered SVG — the field's `.blocklyText` <text> node content inside
 *      the `.blocklyFlyout` subtree of the iframe DOM.
 * The bug, if present, manifests in (2) regardless of what (1) returns.
 */

test.use({ viewport: { width: 1280, height: 800 } })

const EMPTY_LABEL = '(no machines)'
const FORBIDDEN_PLACEHOLDERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'foo']

/** All toolbox blocks that expose a `machine` dropdown field. */
const MACHINE_BLOCK_TYPES = [
  'factory_start_machine',
  'factory_stop_machine',
  'factory_set_recipe',
  'factory_pick_machine',
  'factory_on_machine_idle',
] as const

// ─── Helpers (mirrored from pxt-machine-dropdown-empty.spec.ts) ──────────────

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
  await page.locator('.ui-main-menu-btn').last().click()
  await expect(page.locator('.ui-toolbar')).toBeVisible()
  await page.waitForTimeout(800)

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
  await expect(
    pxtFrame.locator('.blocklyToolboxDiv .blocklyTreeRoot [role="treeitem"] .blocklyTreeLabel').first(),
  ).toBeVisible({ timeout: 15000 })
}

/**
 * Click the "Machines" toolbox category to open its flyout, then wait until
 * the flyout DOM has at least one draggable block.
 */
async function openMachinesFlyout(page: Page) {
  const pxtFrame = page.frameLocator('#editor-container .pxt-editor-iframe')
  await pxtFrame
    .locator('.blocklyToolboxDiv .blocklyTreeRoot [role="treeitem"]', { hasText: 'Machines' })
    .first()
    .click()
  await expect(pxtFrame.locator('.blocklyFlyout .blocklyDraggable').first()).toBeAttached({
    timeout: 10000,
  })
  // Tiny grace period for async block re-render in the flyout.
  await page.waitForTimeout(150)
}

interface FlyoutBlockSnapshot {
  /** Block id on the flyout workspace. */
  id: string
  /** Block type (e.g. `factory_start_machine`). */
  type: string
  /** Result of `block.getField('machine').getText()` — Blockly's logical text. */
  apiText: string
  /** Result of `block.getField('machine').getValue()` — current dropdown value. */
  apiValue: string
  /** All `<text class="blocklyText">` contents under the block's SVG group. */
  svgTexts: string[]
}

/**
 * Read every flyout block whose type is in MACHINE_BLOCK_TYPES, returning
 * both the Blockly-API view and the rendered-SVG view of the `machine` field.
 */
async function readMachineFlyoutBlocks(page: Page): Promise<FlyoutBlockSnapshot[]> {
  const iframeEl = await page.locator('#editor-container .pxt-editor-iframe').elementHandle()
  expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
  return page.evaluate(
    ({ el, types }) => {
      const win = (el as HTMLIFrameElement).contentWindow as any
      const doc = (el as HTMLIFrameElement).contentDocument
      if (!win || !win.Blockly || !doc) throw new Error('Blockly not available')
      const ws = win.Blockly.mainWorkspace
      const flyout = ws?.getFlyout?.()
      const flyoutWs = flyout?.getWorkspace?.()
      if (!flyoutWs) throw new Error('flyout workspace not available')
      const all: any[] = flyoutWs.getAllBlocks?.(false) ?? []
      const matches = all.filter((b: any) => types.includes(b.type))
      return matches.map((b: any) => {
        const field = b.getField?.('machine')
        const apiText = field && typeof field.getText === 'function' ? String(field.getText() ?? '') : ''
        const apiValue = field && typeof field.getValue === 'function' ? String(field.getValue() ?? '') : ''
        // Find the SVG group for this block and collect every blocklyText node.
        let svgTexts: string[] = []
        try {
          const svg = b.getSvgRoot?.() as SVGElement | undefined
          if (svg) {
            svgTexts = Array.from(svg.querySelectorAll('text.blocklyText'))
              // Blockly renders SVG <text> with NBSP (\u00A0) in place of
              // ordinary spaces. Normalize so labels compare cleanly against
              // the i18next strings (which use ASCII spaces).
              .map((n) => (n.textContent ?? '').replace(/\u00A0/g, ' ').trim())
              .filter((s) => s.length > 0)
          }
        } catch {
          svgTexts = []
        }
        return { id: b.id as string, type: b.type as string, apiText, apiValue, svgTexts }
      })
    },
    { el: iframeEl!, types: MACHINE_BLOCK_TYPES as unknown as string[] },
  )
}

// ─── Spec ────────────────────────────────────────────────────────────────────

test.describe('PXT machine dropdown — flyout updates when first machine is placed', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({
        path: `tests/e2e/screenshots/${testInfo.title.replace(/\s+/g, '-')}.png`,
        fullPage: true,
      }).catch(() => undefined)
    }
  })

  test('open editor → open Machines flyout → place first machine → flyout blocks show new machine name', async ({
    page,
  }) => {
    // 1. Fresh sandbox, factory has 0 machines.
    await enterEmptySandbox(page)

    // 2. Open the PXT editor and wait for Blockly. The editor pins to the
    //    right ~40% of the viewport, so the LEFT half of the canvas remains
    //    interactive — we will dblclick a left-side grid cell later without
    //    closing the editor.
    await openEditorAndWaitForBlockly(page)

    // 3. Open the "Machines" toolbox category so its flyout is rendered.
    await openMachinesFlyout(page)

    // 4. Empty-state baseline. Every machine-dropdown block in the flyout
    //    must show the empty-state placeholder, both via the Blockly API
    //    and in the rendered SVG. Forbidden default placeholders must not
    //    appear anywhere in the rendered text of these blocks.
    const initial = await readMachineFlyoutBlocks(page)
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

    // 5. WITHOUT closing the editor, place one machine on the grid by
    //    double-clicking a cell that lives on the LEFT half of the canvas
    //    (uncovered by the editor panel). Sandbox default placement is the
    //    Part Fabricator.
    await dblClickGridCell(page, 3, 5)
    await expect
      .poll(
        async () =>
          page.evaluate(() => (window as any).__test?.getMachines?.().length ?? 0),
        { timeout: 5000 },
      )
      .toBe(1)

    // The placed machine's display name is what the flyout dropdown should
    // now show. Read it directly from the GameManager.
    const placedName = await page.evaluate(() => {
      const gm = (window as any).__gameManager
      const m = gm?.factory?.getMachines?.()[0]
      return (m?.name ?? m?.type ?? '') as string
    })
    expect(placedName, 'placed machine should expose a non-empty display name').toBeTruthy()

    // 6. Within a reasonable poll window (the flyout must update without any
    //    further user interaction — no collapsing the category, no closing
    //    the editor), every machine-dropdown block in the flyout must show
    //    the new machine's name in BOTH its API text and its rendered SVG.
    //    The empty-state placeholder must be gone.
    await expect
      .poll(
        async () => {
          const snaps = await readMachineFlyoutBlocks(page)
          // Aggregate into a single comparable shape so the polled value is
          // stable and the failure message is informative.
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
        // We know the set of types we expect to see; build the expected
        // shape dynamically from the initial snapshot's types in declaration
        // order so a mismatch in count is also reported.
        initial.map((s) => ({
          type: s.type,
          apiText: placedName,
          svgTexts: expect.arrayContaining([placedName]),
        })),
      )

    // 7. Final fine-grained assertions on the latest snapshot: the empty-
    //    state placeholder and forbidden defaults must not appear anywhere
    //    in the rendered SVG of these blocks.
    const final = await readMachineFlyoutBlocks(page)
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
