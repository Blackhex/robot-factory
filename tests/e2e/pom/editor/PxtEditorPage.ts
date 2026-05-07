import type { Page, Locator, FrameLocator } from '@playwright/test'
import { expect } from '@playwright/test'
import type {
  DropdownSnapshot,
  FlyoutBlockSnapshot,
  EventBlockInfoEntry,
} from '../types'

/**
 * Encapsulates ALL PXT/Blockly internals: iframe access, `Blockly.mainWorkspace`,
 * block creation, dropdown / flyout reading, toolbox category clicks,
 * drag-and-drop from the flyout. The only Page Object allowed to call
 * `page.evaluate()` against the PXT iframe contentWindow.
 */
export class PxtEditorPage {
  private readonly editorBtn: Locator
  private readonly editorContainer: Locator
  private readonly iframeLocator: Locator
  private readonly fallbackTextarea: Locator

  private readonly page: Page
  constructor(page: Page) {
    this.page = page
    this.editorBtn = page.locator('.ui-toolbar-btn--editor')
    this.editorContainer = page.locator('#editor-container')
    this.iframeLocator = page.locator('#editor-container .pxt-editor-iframe')
    this.fallbackTextarea = page.locator('.pxt-editor-fallback-textarea')
  }

  private pxtFrame(): FrameLocator {
    return this.page.frameLocator('#editor-container .pxt-editor-iframe')
  }

  // ---- Open / close --------------------------------------------------------

  async openIfClosed(): Promise<void> {
    if (!(await this.editorContainer.evaluate((el) => el.classList.contains('open')))) {
      await this.editorBtn.click()
    }
    await expect(this.editorContainer).toHaveClass(/open/)
  }

  async closeIfOpen(): Promise<void> {
    if (await this.editorContainer.evaluate((el) => el.classList.contains('open'))) {
      await this.editorBtn.click()
      await expect(this.editorContainer).not.toHaveClass(/open/)
    }
  }

  /** Open the editor and wait until Blockly + toolbox have rendered. */
  async openAndWaitForBlockly(): Promise<void> {
    await this.openIfClosed()
    await expect(this.iframeLocator).toBeVisible({ timeout: 15_000 })
    const pxt = this.pxtFrame()
    await expect(pxt.locator('.blocklySvg')).toBeAttached({ timeout: 15_000 })
    await expect(
      pxt.locator('.blocklyToolboxDiv .blocklyTreeRoot [role="treeitem"] .blocklyTreeLabel').first(),
    ).toBeVisible({ timeout: 15_000 })
  }

  /** Wait until the PXT iframe Blockly workspace has computed visibility:visible. */
  async waitForBlocklyWorkspaceVisible(timeoutMs = 20_000): Promise<void> {
    const frame = this.iframeLocator.contentFrame()
    if (!frame) throw new Error('PXT iframe is not attached')
    await expect(async () => {
      const vis = await frame.locator('.blocklySvg').evaluate(
        (el) => getComputedStyle(el).visibility,
      )
      expect(vis).toBe('visible')
    }).toPass({ timeout: timeoutMs, intervals: [500] })
  }

  /** Wait for the toolbox categories to become visible and interactive. */
  async waitForToolboxInteractive(timeoutMs = 15_000): Promise<void> {
    const frame = this.iframeLocator.contentFrame()
    if (!frame) throw new Error('PXT iframe is not attached')
    await expect(async () => {
      const vis = await frame
        .locator('.blocklyToolboxCategory, .blocklyTreeRow')
        .first()
        .evaluate((el) => getComputedStyle(el).visibility)
      expect(vis).toBe('visible')
    }).toPass({ timeout: timeoutMs, intervals: [500] })
    await expect(async () => {
      const count = await frame
        .locator('.blocklyToolboxCategory, .blocklyTreeRow')
        .count()
      expect(count).toBeGreaterThan(0)
    }).toPass({ timeout: 10_000, intervals: [500] })
  }

  // ---- Iframe / fallback presence ------------------------------------------

  async expectIframeVisible(timeout = 15_000): Promise<void> {
    await expect(this.iframeLocator).toBeVisible({ timeout })
  }

  async isPxtIframeVisible(timeoutMs = 3_000): Promise<boolean> {
    return this.iframeLocator.isVisible({ timeout: timeoutMs }).catch(() => false)
  }

  /** Force the fallback textarea to a given program string by direct value assignment. */
  async setFallbackProgramViaValueAssignment(code: string): Promise<void> {
    await this.fallbackTextarea.evaluate((el: HTMLTextAreaElement, c: string) => {
      el.value = c
    }, code)
  }

  async expectFallbackAttached(timeout = 8_000): Promise<void> {
    await expect(this.fallbackTextarea).toBeAttached({ timeout })
  }

  // ---- Toolbox + flyout ----------------------------------------------------

  async expectBlocklyAttached(timeout = 10_000): Promise<void> {
    await expect(this.pxtFrame().locator('.blocklySvg')).toBeAttached({ timeout })
  }

  async expectToolboxAttached(timeout = 10_000): Promise<void> {
    await expect(
      this.pxtFrame().locator('.blocklyToolboxDiv, .blocklyToolbox').first(),
    ).toBeAttached({ timeout })
  }

  /** Click a toolbox category by visible label (e.g. "Machines", "Events"). */
  async clickToolboxCategory(name: string): Promise<void> {
    await this.pxtFrame()
      .locator('.blocklyToolboxDiv .blocklyTreeRoot [role="treeitem"]', { hasText: name })
      .first()
      .click()
  }

  async openMachinesFlyout(): Promise<void> {
    await this.clickToolboxCategory('Machines')
    await expect(
      this.pxtFrame().locator('.blocklyFlyout .blocklyDraggable').first(),
    ).toBeAttached({ timeout: 10_000 })
    // Tiny grace period for async block re-render in the flyout.
    await this.page.waitForTimeout(150)
  }

  /** Click the Events category and wait for the flyout to render. */
  async openEventsCategory(): Promise<void> {
    const eventsCat = this.pxtFrame()
      .locator('.blocklyToolboxDiv .blocklyTreeRoot [role="treeitem"]', { hasText: 'Events' })
      .first()
    await expect(eventsCat).toBeVisible({ timeout: 15_000 })
    await eventsCat.click()
    await expect(
      this.pxtFrame().locator('.blocklyFlyout .blocklyDraggable').first(),
    ).toBeAttached({ timeout: 10_000 })
  }

  async clickToolboxCategoryByIndex(index: number): Promise<void> {
    const categories = this.pxtFrame().locator(
      '.blocklyToolboxCategory, .blocklyTreeRow',
    )
    await categories.nth(index).click()
    await expect(
      this.pxtFrame().locator('.blocklyFlyout text').first(),
    ).toBeAttached({ timeout: 10_000 })
  }

  /** Read the visible labels of the top-level toolbox categories, in order. */
  async getToolboxCategoryOrder(timeoutMs = 10_000): Promise<string[]> {
    const labels = this.pxtFrame().locator(
      '.blocklyToolboxDiv .blocklyTreeRoot [role="treeitem"] .blocklyTreeLabel',
    )
    let order: string[] = []
    await expect
      .poll(
        async () => {
          order = (await labels.allTextContents())
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
          return order.length
        },
        { timeout: timeoutMs },
      )
      .toBeGreaterThanOrEqual(7)
    return order
  }

  async expectToolboxTreeRootAttached(timeout = 15_000): Promise<void> {
    await expect(
      this.pxtFrame().locator('.blocklyToolboxDiv .blocklyTreeRoot'),
    ).toBeAttached({ timeout })
  }

  async expectFirstToolboxLabelVisible(timeout = 15_000): Promise<void> {
    await expect(
      this.pxtFrame()
        .locator('.blocklyToolboxDiv .blocklyTreeRoot [role="treeitem"] .blocklyTreeLabel')
        .first(),
    ).toBeVisible({ timeout })
  }

  // ---- Block creation / inspection on the main workspace -------------------

  async createStartMachineBlock(): Promise<string> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    const id = await this.page.evaluate((el) => {
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

  async readMachineDropdown(blockId: string): Promise<DropdownSnapshot> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate(
      ({ el, id }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) throw new Error('Blockly not available')
        const ws = win.Blockly.mainWorkspace
        const block = ws.getBlockById(id)
        if (!block) throw new Error(`Block ${id} not found on workspace`)
        const resolveMachineField = (hostBlock: any) => {
          const directField = hostBlock.getField?.('machine')
          if (directField) {
            return directField
          }

          const inputNames = ['machine', 'MACHINE']
          for (const inputName of inputNames) {
            const input = hostBlock.getInput?.(inputName)
            const targetBlock = input?.connection?.targetBlock?.()
            const targetField = targetBlock?.getField?.('machine')
            if (targetField) {
              return targetField
            }
          }

          for (const input of hostBlock.inputList ?? []) {
            const targetBlock = input?.connection?.targetBlock?.()
            const targetField = targetBlock?.getField?.('machine')
            if (targetField) {
              return targetField
            }
          }

          return null
        }

        const field = resolveMachineField(block)
        if (!field) throw new Error(`machine field not found on block ${id}`)
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
        const fieldValue: string =
          typeof field.getValue === 'function' ? String(field.getValue() ?? '') : ''
        const faceText: string =
          typeof field.getText === 'function' ? String(field.getText() ?? '') : ''
        return { optionLabels, fieldValue, faceText }
      },
      { el: iframeEl!, id: blockId },
    )
  }

  async readMachineFlyoutBlocks(types: readonly string[]): Promise<FlyoutBlockSnapshot[]> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate(
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
        const resolveMachineField = (hostBlock: any) => {
          const fieldNames = ['machine', 'MACHINE']
          const queue = [hostBlock]
          const visited = new Set<any>()

          while (queue.length > 0) {
            const block = queue.shift()
            if (!block || visited.has(block)) continue
            visited.add(block)

            for (const fieldName of fieldNames) {
              const field = block.getField?.(fieldName)
              if (field) return field
            }

            for (const input of block.inputList ?? []) {
              const targetBlock =
                input?.connection?.targetBlock?.() ?? block.getInputTargetBlock?.(input?.name)
              if (targetBlock && !visited.has(targetBlock)) {
                queue.push(targetBlock)
              }
            }
          }

          return null
        }

        return matches.map((b: any) => {
          const field = resolveMachineField(b)
          const apiText =
            field && typeof field.getText === 'function' ? String(field.getText() ?? '') : ''
          const apiValue =
            field && typeof field.getValue === 'function' ? String(field.getValue() ?? '') : ''
          let svgTexts: string[] = []
          try {
            const svg = b.getSvgRoot?.() as SVGElement | undefined
            if (svg) {
              svgTexts = Array.from(svg.querySelectorAll('text.blocklyText'))
                .map((n) => (n.textContent ?? '').replace(/\u00A0/g, ' ').trim())
                .filter((s) => s.length > 0)
            }
          } catch {
            svgTexts = []
          }
          return {
            id: b.id as string,
            type: b.type as string,
            apiText,
            apiValue,
            svgTexts,
          }
        })
      },
      { el: iframeEl!, types: types as unknown as string[] },
    )
  }

  /** Read the rendered text of `factory_pick_machine` in the open Machines flyout. */
  async readPickMachineBlockText(timeoutMs = 10_000): Promise<string> {
    let text = ''
    await expect
      .poll(
        async () => {
          const iframeEl = await this.iframeLocator.elementHandle()
          if (!iframeEl) return ''
          text = await this.page.evaluate((el) => {
            const frame = el as HTMLIFrameElement
            const win = frame.contentWindow as any
            if (!win || !win.Blockly) return ''
            const ws = win.Blockly.mainWorkspace
            const flyout = ws?.getFlyout?.()
            const flyoutWs = flyout?.getWorkspace?.()
            const blocks: any[] = flyoutWs?.getAllBlocks?.(false) ?? []
            const pick = blocks.find((b) => b.type === 'factory_pick_machine')
            if (!pick) return ''
            try {
              return pick.toString?.() ?? ''
            } catch {
              return ''
            }
          }, iframeEl)
          return text
        },
        { timeout: timeoutMs },
      )
      .not.toEqual('')
    return text
  }

  async readEventBlockInfo<T extends string>(
    types: readonly T[],
  ): Promise<Record<T, EventBlockInfoEntry>> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    const result = await this.page.evaluate(
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
          try {
            b.dispose(false)
          } catch {
            /* ignore */
          }
        }
        return out
      },
      { el: iframeEl!, types: types as unknown as string[] },
    )
    return result as Record<T, EventBlockInfoEntry>
  }

  // ---- Drag-and-drop from the flyout ---------------------------------------

  async dragBlockFromFlyout(blockTextSubstring: string, targetYOffset = 0): Promise<void> {
    const pxt = this.pxtFrame()
    const flyoutText = pxt
      .locator(`.blocklyFlyout text`)
      .filter({ hasText: blockTextSubstring })
      .first()
    await expect(flyoutText).toBeAttached({ timeout: 10_000 })

    const textRect = await flyoutText.evaluate((el: SVGTextElement) => {
      const rect = el.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })

    const iframeBox = await this.iframeLocator.boundingBox()
    if (!iframeBox || textRect.width === 0) {
      throw new Error(
        `Could not locate flyout block with text "${blockTextSubstring}"`,
      )
    }

    const fromX = iframeBox.x + textRect.x + textRect.width / 2
    const fromY = iframeBox.y + textRect.y + textRect.height / 2

    const wsBox = await pxt.locator('.blocklySvg').boundingBox()
    const toX = (wsBox?.x ?? iframeBox.x) + (wsBox?.width ?? 400) * 0.6
    const toY = (wsBox?.y ?? iframeBox.y) + 200 + targetYOffset

    await this.page.mouse.move(fromX, fromY)
    await this.page.mouse.down()
    await this.page.mouse.move(toX, toY, { steps: 20 })
    await this.page.mouse.up()
    await this.page.waitForTimeout(500)
  }

  /**
   * Snapshot of the live Blockly workspace contents — used for save/reload
   * round-trip assertions. `count` is the number of blocks on the main
   * workspace (excluding the flyout). `xml` is the full
   * `Blockly.Xml.workspaceToDom` text.
   */
  async getWorkspaceBlocksSnapshot(): Promise<{
    count: number
    types: string[]
    fieldValues: Record<string, string>
    xml: string
  }> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate((el) => {
      const win = (el as HTMLIFrameElement).contentWindow as any
      if (!win || !win.Blockly) throw new Error('Blockly not available on PXT iframe window')
      const ws = win.Blockly.mainWorkspace
      if (!ws) throw new Error('Blockly main workspace not available')
      const all: any[] = ws.getAllBlocks?.(false) ?? []
      const types: string[] = all.map((b: any) => String(b.type ?? '')).sort()
      const fieldValues: Record<string, string> = {}
      for (const b of all) {
        const inputs = b.inputList ?? []
        for (const input of inputs) {
          for (const f of input.fieldRow ?? []) {
            const name = typeof f.name === 'string' ? f.name : ''
            if (!name) continue
            try {
              const val = typeof f.getValue === 'function' ? f.getValue() : ''
              fieldValues[`${b.type}.${name}`] = String(val ?? '')
            } catch {
              /* ignore */
            }
          }
        }
      }
      let xml = ''
      try {
        const dom = win.Blockly.Xml.workspaceToDom(ws)
        xml = dom ? String(win.Blockly.Xml.domToText(dom) ?? '') : ''
      } catch {
        xml = ''
      }
      return { count: all.length, types, fieldValues, xml }
    }, iframeEl!)
  }

  /**
   * Add a non-trivial user-authored program to the workspace on top of the
   * default `on start`. Currently this drops a `factory_start_machine` block
   * onto the main workspace via the Blockly API. The block is initialized,
   * rendered, and serialized into the workspace XML by Blockly so it
   * participates in autosave.
   *
   * Returns the IDs of the blocks that were added.
   */
  async addNonTrivialProgram(): Promise<string[]> {
    const id = await this.createStartMachineBlock()
    return [id]
  }

  // ---- Layout / on-start visibility ---------------------------------------

  /**
   * Wait until the default `on start` (or first top-level) block has been
   * rendered onto the main workspace SVG with a non-zero bounding box.
   */
  async waitForOnStartBlockRendered(timeoutMs = 15_000): Promise<void> {
    await expect(async () => {
      const iframeEl = await this.iframeLocator.elementHandle()
      if (!iframeEl) throw new Error('PXT iframe not attached')
      const ready = await this.page.evaluate((el) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) return false
        const ws = win.Blockly.mainWorkspace
        const top: any[] = ws?.getTopBlocks?.(true) ?? []
        if (top.length === 0) return false
        const svg = top[0].getSvgRoot?.()
        if (!svg) return false
        const r = svg.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      }, iframeEl)
      expect(ready).toBe(true)
    }).toPass({ timeout: timeoutMs, intervals: [500] })
  }

  /**
   * Bounding rect of `.blocklyToolboxDiv` inside the PXT iframe, in
   * iframe-viewport coordinates.
   */
  async getToolboxRect(): Promise<{
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
  }> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate((el) => {
      const doc = (el as HTMLIFrameElement).contentDocument
      if (!doc) throw new Error('PXT iframe contentDocument unavailable')
      const tb = doc.querySelector('.blocklyToolboxDiv') as HTMLElement | null
      if (!tb) throw new Error('.blocklyToolboxDiv not found in PXT iframe')
      const r = tb.getBoundingClientRect()
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      }
    }, iframeEl!)
  }

  /**
   * Bounding rect of the first/`on start` block on the main workspace,
   * in iframe-viewport coordinates.
   */
  async getOnStartBlockRect(): Promise<{
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
  }> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate((el) => {
      const win = (el as HTMLIFrameElement).contentWindow as any
      if (!win || !win.Blockly) throw new Error('Blockly not available on PXT iframe window')
      const ws = win.Blockly.mainWorkspace
      const top: any[] = ws?.getTopBlocks?.(true) ?? []
      if (top.length === 0) throw new Error('No top-level blocks on main workspace')
      const onStart = top.find((b: any) => b?.type === 'pxt-on-start') ?? top[0]
      const svg: SVGElement | null = onStart.getSvgRoot?.() ?? null
      if (!svg) throw new Error('on-start block SVG root not available')
      const r = svg.getBoundingClientRect()
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      }
    }, iframeEl!)
  }

  /** Inner viewport size of the PXT iframe (window.innerWidth/innerHeight). */
  async getIframeViewportSize(): Promise<{ width: number; height: number }> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate((el) => {
      const win = (el as HTMLIFrameElement).contentWindow
      if (!win) throw new Error('PXT iframe contentWindow unavailable')
      return { width: win.innerWidth, height: win.innerHeight }
    }, iframeEl!)
  }
}
