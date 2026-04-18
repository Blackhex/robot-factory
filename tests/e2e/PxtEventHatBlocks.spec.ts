import { test, expect, type Page } from '@playwright/test'

/**
 * E2E — Event registration blocks should be true "hat" blocks with the
 * Events-category color (PXT hue 50 → yellow).
 *
 * Under test (declared in `pxt-target/libs/robot-factory/factory.ts`):
 *   - factory_on_order_received
 *   - factory_on_belt_jam
 *   - factory_on_machine_idle
 *
 * Bug: all three currently have `//% handlerStatement=1` which renders them
 * as regular statement blocks (previous+next notches) with color=35
 * (orange-brown). Per the PXT blocks skill convention, Events should be
 * hue 50 and event-registration blocks should be hat-shaped (no
 * previousConnection/nextConnection).
 *
 * This spec is intentionally FAILING today (RED stage of TDD).
 */

const EVENT_BLOCK_TYPES = [
  'factory_on_order_received',
  'factory_on_belt_jam',
  'factory_on_machine_idle',
] as const

type EventBlockType = (typeof EVENT_BLOCK_TYPES)[number]

test.use({ viewport: { width: 1280, height: 800 } })

/**
 * Pre-seed localStorage so all levels up to (but not including) the target
 * 0-based `levelIndex` have one star — this unlocks the target level in the
 * LevelSelect UI. Mirrors the helper in `LevelFlow.spec.ts`.
 */
async function seedProgressAndGoto(page: Page, levelIndex: number) {
  const progressLevels: Record<string, number> = {}
  for (let i = 0; i < levelIndex; i++) {
    progressLevels[`level_${i + 1}`] = 1
  }
  await page.addInitScript((progress) => {
    localStorage.setItem('rf_progress', JSON.stringify({ levels: progress }))
  }, progressLevels)

  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas')
    return !!c && c.width > 0 && c.height > 0
  })
}

async function enterLevel(page: Page, levelIndex: number) {
  await seedProgressAndGoto(page, levelIndex)

  await page.locator('.ui-main-menu-btn--primary').click()
  await expect(page.locator('.ui-level-select')).toBeVisible()

  const unlocked = page.locator('.ui-level-card:not(.ui-level-card--locked)')
  await expect(unlocked.nth(levelIndex)).toBeVisible()
  await unlocked.nth(levelIndex).click()

  await expect(page.locator('.ui-toolbar')).toBeVisible()

  // Dismiss tutorial if present.
  const skipBtn = page.locator('.ui-tutorial-btn--skip')
  if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipBtn.click()
  }
}

async function openEditorAndWaitForBlockly(page: Page) {
  await page.locator('.ui-toolbar-btn--editor').click()
  await expect(page.locator('#editor-container')).toHaveClass(/open/)

  const iframe = page.locator('#editor-container .pxt-editor-iframe')
  await expect(iframe).toBeVisible({ timeout: 15000 })

  const pxtFrame = page.frameLocator('#editor-container .pxt-editor-iframe')
  await expect(pxtFrame.locator('.blocklySvg')).toBeAttached({ timeout: 15000 })
  await expect(
    pxtFrame.locator('.blocklyToolboxDiv .blocklyTreeRoot [role="treeitem"] .blocklyTreeLabel').first(),
  ).toBeVisible({ timeout: 15000 })
}

/**
 * Ensure Blockly has finished initializing inside the PXT iframe. Also
 * forces the Events category open once so PXT registers the event block
 * definitions on the global `Blockly.Blocks` registry.
 */
async function waitForBlocklyReady(page: Page) {
  const pxtFrame = page.frameLocator('#editor-container .pxt-editor-iframe')
  const eventsCat = pxtFrame
    .locator('.blocklyToolboxDiv .blocklyTreeRoot [role="treeitem"]', { hasText: 'Events' })
    .first()
  await expect(eventsCat).toBeVisible({ timeout: 15000 })
  await eventsCat.click()
  // Flyout rendered → Blockly definitions are guaranteed loaded.
  await expect(pxtFrame.locator('.blocklyFlyout .blocklyDraggable').first()).toBeAttached({
    timeout: 10000,
  })
}

/**
 * Instantiate each event block directly on the PXT main workspace and
 * read its structural info. Doing this on the main workspace (rather than
 * the flyout) avoids flyout rendering quirks — PXT sometimes skips
 * preview blocks for definitions whose non-handler parameters have no
 * shadow/default (e.g., `factory_on_machine_idle(machine: string, …)`),
 * but the block definition itself is still registered and can be
 * newBlock()'d directly.
 *
 * Returns a map keyed by block type. `color` is the hex string returned
 * by `block.getColour()`. `hasPrevious`/`hasNext` are booleans from
 * Blockly's connection API.
 */
async function readEventBlockInfo(page: Page): Promise<
  Record<
    EventBlockType,
    {
      registered: boolean
      hasPrevious: boolean
      hasNext: boolean
      color: string
    }
  >
> {
  const iframeEl = await page.locator('#editor-container .pxt-editor-iframe').elementHandle()
  expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()

  const result = await page.evaluate(
    ({ el, types }) => {
      const frame = el as HTMLIFrameElement
      const win = frame.contentWindow as any
      if (!win || !win.Blockly) throw new Error('Blockly not available on PXT iframe window')
      const ws = win.Blockly.mainWorkspace
      const out: Record<string, any> = {}
      for (const t of types) {
        const defined = !!(win.Blockly.Blocks && win.Blockly.Blocks[t])
        if (!defined) {
          out[t] = { registered: false, hasPrevious: false, hasNext: false, color: '' }
          continue
        }
        let b: any = null
        try {
          b = ws.newBlock(t)
        } catch (e) {
          out[t] = {
            registered: true,
            hasPrevious: false,
            hasNext: false,
            color: '',
            error: String(e),
          }
          continue
        }
        let color = ''
        try {
          color = typeof b.getColour === 'function' ? b.getColour() : ''
        } catch {
          /* ignore */
        }
        out[t] = {
          registered: true,
          hasPrevious: !!b.previousConnection,
          hasNext: !!b.nextConnection,
          color,
        }
        // Dispose so we don't pollute the workspace between probes.
        try {
          b.dispose(false)
        } catch {
          /* ignore */
        }
      }
      return out
    },
    { el: iframeEl!, types: EVENT_BLOCK_TYPES as unknown as string[] },
  )

  return result as Record<
    EventBlockType,
    { registered: boolean; hasPrevious: boolean; hasNext: boolean; color: string }
  >
}

/**
 * Convert a CSS color string ("#rrggbb" or "rgb(r,g,b)") to HSL hue in
 * degrees [0,360). Returns null if the string cannot be parsed.
 */
function colorToHue(color: string): number | null {
  if (!color) return null
  let r = 0
  let g = 0
  let b = 0
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
    r = +rgb[1]
    g = +rgb[2]
    b = +rgb[3]
  } else {
    return null
  }
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
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

// Level 7 is 0-based index 6.
const LEVEL_INDEX_EVENTS = 6

test.describe('PXT Event Registration Blocks — hat shape + Events color', () => {
  test.beforeEach(async ({ page }) => {
    await enterLevel(page, LEVEL_INDEX_EVENTS)
    await openEditorAndWaitForBlockly(page)
    await waitForBlocklyReady(page)
  })

  for (const blockType of EVENT_BLOCK_TYPES) {
    test(`${blockType} renders as a hat block (no previous/next connections)`, async ({ page }) => {
      const info = await readEventBlockInfo(page)
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

    test(`${blockType} uses the Events category color (hue ~50)`, async ({ page }) => {
      const info = await readEventBlockInfo(page)
      const entry = info[blockType]
      expect(entry.registered, `block ${blockType} is not registered in Blockly.Blocks`).toBe(true)

      const hue = colorToHue(entry.color)
      expect(
        hue,
        `Could not parse color "${entry.color}" for ${blockType} into an HSL hue.`,
      ).not.toBeNull()

      // PXT hue 50 → ~yellow. Accept [40, 60] to be robust against PXT's
      // internal HSV→RGB conversion rounding (MakeCode applies saturation
      // and value defaults, so the resulting hue shifts slightly).
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
