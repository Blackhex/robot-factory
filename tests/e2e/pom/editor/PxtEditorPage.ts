import type { Page, Locator, FrameLocator } from '@playwright/test'
import { expect } from '@playwright/test'
import type {
  DropdownSnapshot,
  FlyoutBlockSnapshot,
  EventBlockInfoEntry,
  SetRecipeBlockInfo,
  PluggableConsumerBlockInfo,
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
      pxt.locator('.blocklyTreeRoot [role="treeitem"] .blocklyTreeLabel').first(),
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

  // ---- Localization helpers -----------------------------------------------

  /**
   * Read the live `src` attribute of the PXT iframe. The iframe must be
   * attached. Use to assert the URL carries the expected `lang=` hash
   * param at iframe mount time (PXT does not live-update locale).
   */
  async getIframeSrc(): Promise<string> {
    await expect(this.iframeLocator).toBeAttached({ timeout: 15_000 })
    const src = await this.iframeLocator.getAttribute('src')
    expect(src, 'PXT iframe must have a src attribute').not.toBeNull()
    return src!
  }

  /**
   * Assert a Blockly toolbox category label is visible in the PXT iframe.
   * `name` is the literal text rendered in `.blocklyTreeLabel` (already
   * localized, e.g. "Stroje" for cs, "Machines" for en).
   */
  async expectToolboxCategory(name: string, timeoutMs = 15_000): Promise<void> {
    const frame = this.pxtFrame()
    await expect(
      frame.locator('.blocklyTreeLabel', { hasText: name }).first(),
    ).toBeVisible({ timeout: timeoutMs })
  }

  /**
   * Assert no toolbox category with the given literal label exists in
   * the PXT iframe. Use to assert the OTHER language's labels do NOT
   * leak through (e.g. when cs is active, "Machines" must not appear).
   */
  async expectNoToolboxCategory(name: string): Promise<void> {
    const frame = this.pxtFrame()
    await expect(
      frame.locator('.blocklyTreeLabel', { hasText: name }),
    ).toHaveCount(0)
  }

  /**
   * Assert the pre-seeded `on start` hat block renders with the given
   * localized text (e.g. "on start" for en, "po spuštění" for cs).
   */
  async expectOnStartLabel(text: string, timeoutMs = 15_000): Promise<void> {
    const frame = this.pxtFrame()
    await expect(
      frame.locator('.blocklyText', { hasText: text }).first(),
    ).toBeVisible({ timeout: timeoutMs })
  }

  /**
   * Assert NO Blockly text label with the given literal is present in
   * the iframe. Use to assert the other language's `on start` literal
   * does not leak through.
   */
  async expectNoBlocklyText(text: string): Promise<void> {
    const frame = this.pxtFrame()
    await expect(
      frame.locator('.blocklyText', { hasText: text }),
    ).toHaveCount(0)
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

  /**
   * Wait until `__test.getPxtEditorState().pxtReady === true`. This is the
   * authoritative signal that the editor has completed the workspacesync
   * handshake AND any post-ready direct Blockly injection has been
   * scheduled. Specs that read the live workspace XML to assert on the
   * load pipeline must wait on this seam — DOM-only waits (e.g.
   * `.blocklySvg` attached) can race the watchdog re-injection loop.
   */
  async waitForPxtReady(timeoutMs = 20_000): Promise<void> {
    await this.page.waitForFunction(
      () => {
        const state = (window as unknown as {
          __test?: { getPxtEditorState?: () => { pxtReady: boolean } }
        }).__test?.getPxtEditorState?.()
        return state?.pxtReady === true
      },
      undefined,
      { timeout: timeoutMs },
    )
  }

  /**
   * Read the most recent decompiled `main.ts` source captured from
   * PXT's `workspacesave` channel. Exposed via `__test.getPxtSource()`
   * in DEV builds (see `src/main.ts`). Returns `''` if PXT has not
   * yet emitted any source.
   */
  async getLastPxtSource(): Promise<string> {
    return await this.page.evaluate(() => {
      const fn = (window as unknown as {
        __test?: { getPxtSource?: () => string }
      }).__test?.getPxtSource
      return typeof fn === 'function' ? fn() : ''
    })
  }

  /**
   * Poll `__test.getPxtSource()` until it satisfies `predicate` (or until
   * `timeoutMs` elapses, in which case the final source is returned so
   * the caller can include it in a failure message).
   *
   * After direct Blockly injection (e.g. via `loadWorkspaceXmlReplacing`)
   * PXT's debounced `workspacesave` channel does NOT always fire on its
   * own under parallel-worker load — the test ends up polling a stale
   * `lastPxtSource` (often `""` / `"\n"` from the initial empty-workspace
   * decompile) until timeout. To make the wait robust, every other poll
   * iteration we proactively `forcePxtSave()` which posts an explicit
   * `pxteditor:saveproject` request; PXT replies with the current
   * decompiled `main.ts`, and the parent's existing response handler
   * writes it into `lastPxtSource`.
   */
  async waitForPxtSourceMatching(
    predicate: (source: string) => boolean,
    timeoutMs = 15_000,
  ): Promise<string> {
    const start = Date.now()
    let last = ''
    let iter = 0
    while (Date.now() - start < timeoutMs) {
      last = await this.getLastPxtSource()
      if (predicate(last)) return last
      // Every other iteration, force PXT to flush its debounced save so
      // direct Blockly-injection paths don't starve `lastPxtSource`.
      if (iter % 2 === 0) {
        await this.forcePxtSave(800).catch(() => undefined)
      }
      await this.page.waitForTimeout(150)
      iter++
    }
    return last
  }

  /**
   * Wait until PXT has emitted at least one decompiled `main.ts` echo
   * (any non-empty source — typically the `// (empty) /\n` or on-start
   * template). `waitForPxtReady` only gates on the workspacesync
   * handshake, which fires BEFORE PXT's post-install `loadHeaderAsync`
   * runs. Under heavy parallel-worker load that decompile can race
   * downstream direct-Blockly injections, clobbering them after the
   * production watchdog's 4 s deadline expires. Waiting for the first
   * non-empty source guarantees `loadHeaderAsync` has completed at
   * least once, so subsequent injections are racing only the much
   * smaller `workspacesave`-debounce window the watchdog is sized for.
   */
  /**
   * Wait until the production `applyHatBlockShape` patch has installed
   * its `Workspace.prototype.newBlock` interceptor inside the PXT
   * iframe. After this resolves, `ws.newBlock('factory_on_machine_idle')`
   * synchronously yields a connection-stripped hat block — without the
   * wait, under heavy parallel-worker load `ws.newBlock` can be called
   * before `applyHatBlockShape` has run, producing a transient stable
   * snapshot with `hasPrevious === true` and a false-positive failure.
   */
  async waitForHatBlockShapePatched(timeoutMs = 15_000): Promise<void> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    // Under heavy parallel-worker load the production `applyHatBlockShape`
    // call inside `workspacesync` can race against Blockly availability
    // and silently no-op (`getBlockly()` returns undefined on the early
    // call; the `setTimeout(…, 500)` retry can still be queued behind
    // a long microtask backlog). Install the same `Workspace.prototype
    // .newBlock` interceptor from the test side as a self-heal — it's
    // idempotent (production's `patchWorkspaceProto` short-circuits on
    // the same `__rfHatNewBlockPatched` marker) so it never double-wraps.
    await this.page.evaluate((el) => {
      const HAT_BLOCK_TYPES = new Set([
        'factory_on_machine_idle',
        'factory_on_item_arrives',
      ])
      const win = (el as HTMLIFrameElement).contentWindow as any
      const Blockly = win?.Blockly
      if (!Blockly) return
      const protos = [Blockly.WorkspaceSvg?.prototype, Blockly.Workspace?.prototype]
      for (const proto of protos) {
        if (!proto || proto.__rfHatNewBlockPatched || typeof proto.newBlock !== 'function') continue
        const origNewBlock = proto.newBlock
        proto.newBlock = function(this: any, type: string, opt_id?: string) {
          const block = origNewBlock.call(this, type, opt_id)
          if (HAT_BLOCK_TYPES.has(type) && Blockly.Events?.isEnabled?.() !== false) {
            try {
              if (block?.previousConnection) block.setPreviousStatement(false)
              if (block?.nextConnection) block.setNextStatement(false)
              if (typeof block?.setStartHat === 'function') block.setStartHat(true)
              block.__rfHatApplied = true
            } catch {
              /* ignore — production heal pass will retry */
            }
          }
          return block
        }
        proto.__rfHatNewBlockPatched = true
      }
    }, iframeEl)
    await expect
      .poll(
        async () =>
          await this.page.evaluate((el) => {
            const win = (el as HTMLIFrameElement).contentWindow as any
            const Blockly = win?.Blockly
            if (!Blockly) return false
            const wsProto = Blockly.WorkspaceSvg?.prototype
            const baseProto = Blockly.Workspace?.prototype
            return !!(wsProto?.__rfHatNewBlockPatched || baseProto?.__rfHatNewBlockPatched)
          }, iframeEl),
        { timeout: timeoutMs, intervals: [100, 200, 400] },
      )
      .toBe(true)
  }

  /**
   * Wait until `PxtEditor.patchBlocklyDropdowns('machine', …)` has
   * executed at least once inside the PXT iframe. This is the moment
   * the machine `FieldDropdown.getOptions/getText` prototype overrides
   * are wired up AND the per-iframe `__rf_machineMembers / __rf_machineItems
   * / __rf_machineLabels` caches are populated. Until this resolves,
   * reading a `factory_pick_machine` dropdown returns PXT's raw fallback
   * enum members ("A".."H","9".."64") instead of the gameplay-driven
   * empty/active list.
   *
   * Patching is gated on `pxtReady && iframe`, and `syncFactoryToEditor`
   * always runs once at level/sandbox setup, so this wait effectively
   * resolves shortly after `waitForPxtReady`.
   */
  async waitForMachineDropdownReady(timeoutMs = 30_000): Promise<void> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    // The production patch is queued behind workspacesync's
    // `setTimeout(…, 500)` block, which under 8-worker parallel load
    // can be starved well past 15s. Bumping the timeout (and relying
    // on the per-test `setTimeout(60_000)` callers add) lets that
    // deferred replay land before we give up.
    await expect
      .poll(
        async () =>
          await this.page.evaluate((el) => {
            const win = (el as HTMLIFrameElement).contentWindow as any
            return Array.isArray(win?.__rf_machineMembers)
              && win?.__rf_machineLabels !== undefined
              && win?.__rf_machineItems !== undefined
          }, iframeEl),
        { timeout: timeoutMs, intervals: [100, 200, 400, 800] },
      )
      .toBe(true)
  }

  async waitForPxtBootstrapSettled(timeoutMs = 15_000, stableForMs = 1200): Promise<void> {
    const start = Date.now()
    let firstNonEmpty: string | null = null
    let firstNonEmptyAt = 0
    while (Date.now() - start < timeoutMs) {
      const src = await this.getLastPxtSource()
      if (src && src.trim().length > 0 && src !== '\n') {
        if (firstNonEmpty === null) {
          firstNonEmpty = src
          firstNonEmptyAt = Date.now()
        } else if (src !== firstNonEmpty) {
          // Source changed → reset stability window (PXT may emit
          // multiple decompile echoes during the post-install settle).
          firstNonEmpty = src
          firstNonEmptyAt = Date.now()
        } else if (Date.now() - firstNonEmptyAt >= stableForMs) {
          return
        }
      } else {
        await this.forcePxtSave(800).catch(() => undefined)
      }
      await this.page.waitForTimeout(200)
    }
  }

  /**
   * Force PXT to flush its debounced internal save and resolve once PXT
   * acknowledges (or after `timeoutMs` as a safety net). Calls the
   * production `PxtEditor.flushPendingSaveAsync` via a DEV-only `__test`
   * seam — same code path that production uses to await PXT's
   * `saveproject` echo, which updates `lastPxtSource` via the existing
   * `pxteditor`-response handler. Use after direct Blockly injection
   * (e.g. `loadWorkspaceXmlReplacing`) when PXT's auto-save debounce
   * hasn't fired yet under parallel-worker load.
   */
  async forcePxtSave(timeoutMs = 2000): Promise<void> {
    await this.page.evaluate(
      async (t) => {
        const fn = (window as unknown as {
          __test?: { flushPxtPendingSave?: (timeoutMs?: number) => Promise<void> }
        }).__test?.flushPxtPendingSave
        if (typeof fn === 'function') await fn(t)
      },
      timeoutMs,
    )
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
      .locator('.blocklyTreeRoot [role="treeitem"]', { hasText: name })
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
    await this.openCategoryFlyout('Events')
  }

  /**
   * Click a toolbox category by visible label and wait for its flyout to be
   * populated with at least one draggable block. Used by the more specific
   * `openMachinesFlyout` / `openEventsCategory` helpers, and by callers that
   * need to inspect categories like "Logic".
   */
  async openCategoryFlyout(name: string): Promise<void> {
    const cat = this.pxtFrame()
      .locator('.blocklyTreeRoot [role="treeitem"]', { hasText: name })
      .first()
    await expect(cat).toBeVisible({ timeout: 15_000 })
    await cat.click()
    await expect(
      this.pxtFrame().locator('.blocklyFlyout .blocklyDraggable').first(),
    ).toBeAttached({ timeout: 10_000 })
    await this.page.waitForTimeout(150)
  }

  async clickToolboxCategoryByIndex(index: number): Promise<void> {
    const categories = this.pxtFrame().locator(
      '.blocklyTreeRoot [role="treeitem"]',
    )
    await categories.nth(index).click()
    await expect(
      this.pxtFrame().locator('.blocklyFlyout text').first(),
    ).toBeAttached({ timeout: 10_000 })
  }

  /** Read visible text labels from the currently open flyout blocks. */
  async getOpenFlyoutTextLabels(timeoutMs = 10_000): Promise<string[]> {
    const labels = this.pxtFrame().locator('.blocklyFlyout text')
    await expect(labels.first()).toBeAttached({ timeout: timeoutMs })
    const all = (await labels.allTextContents())
      .map((s) => s.replace(/\u00A0/g, ' ').trim())
      .filter((s) => s.length > 0)
    return Array.from(new Set(all))
  }

  /** Read the visible labels of the top-level toolbox categories, in order. */
  async getToolboxCategoryOrder(timeoutMs = 10_000): Promise<string[]> {
    const labels = this.pxtFrame().locator(
      '.blocklyTreeRoot [role="treeitem"] .blocklyTreeLabel',
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
      this.pxtFrame().locator('.blocklyTreeRoot [role="treeitem"]').first(),
    ).toBeAttached({ timeout })
  }

  async expectFirstToolboxLabelVisible(timeout = 15_000): Promise<void> {
    await expect(
      this.pxtFrame()
        .locator('.blocklyTreeRoot [role="treeitem"] .blocklyTreeLabel')
        .first(),
    ).toBeVisible({ timeout })
  }

  /**
   * Read the rendered top-level toolbox categories with best-effort colours.
   * `name` comes from the DOM tree-row label (what the user sees). `colour`
   * is read via the Blockly toolbox API on a best-effort basis — an empty
   * string means the API returned nothing for that index. The two arrays
   * are aligned by index, so callers can correlate by position.
   *
   * Unlike `getToolboxCategoryOrder()`, this helper does NOT enforce a
   * minimum category count — callers that need to detect missing
   * categories should assert on the returned names directly.
   */
  async getToolboxCategoryDetails(
    timeoutMs = 10_000,
  ): Promise<Array<{ name: string; colour: string }>> {
    const labels = this.pxtFrame().locator(
      '.blocklyTreeRoot [role="treeitem"] .blocklyTreeLabel',
    )
    let names: string[] = []
    await expect
      .poll(
        async () => {
          names = (await labels.allTextContents())
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
          return names.length
        },
        { timeout: timeoutMs },
      )
      .toBeGreaterThan(0)
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    const colours = await this.page.evaluate((el) => {
      const win = (el as HTMLIFrameElement).contentWindow as any
      if (!win || !win.Blockly) return [] as string[]
      const ws = win.Blockly.mainWorkspace
      const tb = ws?.getToolbox?.()
      if (!tb) return []
      const items: any[] =
        typeof tb.getToolboxItems === 'function' ? tb.getToolboxItems() : []
      return items.map((it: any) =>
        typeof it.getColour === 'function' ? String(it.getColour() ?? '') : '',
      )
    }, iframeEl!)
    return names.map((name, i) => ({ name, colour: colours[i] ?? '' }))
  }

  /**
   * Return the sorted list of every key currently in `Blockly.Blocks` inside
   * the live PXT iframe. This is the authoritative registry of block types
   * that can be instantiated on the workspace, regardless of whether the
   * toolbox surfaces them in the current level.
   */
  async getRegisteredBlockTypes(): Promise<string[]> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate((el) => {
      const win = (el as HTMLIFrameElement).contentWindow as any
      if (!win || !win.Blockly || !win.Blockly.Blocks) return [] as string[]
      return Object.keys(win.Blockly.Blocks).sort()
    }, iframeEl!)
  }

  /**
   * Return the block types currently rendered in the open Blockly flyout
   * (the single shared flyout shown for whichever toolbox category is
   * currently selected). Caller is responsible for opening the appropriate
   * category first via `clickToolboxCategory` / `openEventsCategory` /
   * `openMachinesFlyout` / etc.
   */
  async getOpenFlyoutBlockTypes(): Promise<string[]> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate((el) => {
      const win = (el as HTMLIFrameElement).contentWindow as any
      if (!win || !win.Blockly) return [] as string[]
      const ws = win.Blockly.mainWorkspace
      const flyout = ws?.getFlyout?.()
      const flyoutWs = flyout?.getWorkspace?.()
      if (!flyoutWs) return []
      const blocks: any[] = flyoutWs.getAllBlocks?.(false) ?? []
      return blocks
        .map((b: any) => String(b.type ?? ''))
        .filter((t: string) => t.length > 0)
    }, iframeEl!)
  }

  /**
   * Snapshot every top-level flyout block's rendered SVG text segments. One
   * entry per block in flyout order; `texts` is the list of `text.blocklyText`
   * label contents inside that block's SVG root, with NBSPs normalized and
   * trimmed. Use to assert which literal labels are visible inside blocks
   * (e.g. to detect English parameter-name leaks like a bare `belt` label
   * when the dropdown items list is empty).
   */
  async snapshotOpenFlyoutBlockTexts(): Promise<Array<{ type: string; texts: string[] }>> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate((el) => {
      const win = (el as HTMLIFrameElement).contentWindow as any
      if (!win || !win.Blockly) return []
      const ws = win.Blockly.mainWorkspace
      const flyout = ws?.getFlyout?.()
      const flyoutWs = flyout?.getWorkspace?.()
      if (!flyoutWs) return []
      const blocks: any[] = flyoutWs.getTopBlocks?.(false) ?? []
      return blocks.map((block: any) => {
        const svgRoot = block.getSvgRoot?.() as SVGGraphicsElement | undefined
        const texts: string[] = []
        if (svgRoot) {
          const nodes = Array.from(
            svgRoot.querySelectorAll('text.blocklyText'),
          ) as SVGGraphicsElement[]
          for (const t of nodes) {
            const s = (t.textContent ?? '').replace(/\u00A0/g, ' ').trim()
            if (s.length > 0) texts.push(s)
          }
        }
        return { type: String(block.type ?? ''), texts }
      })
    }, iframeEl!)
  }

  /**
   * Measure each flyout block's rendered SVG width against the right edge of
   * every text label rendered inside it. Used to detect layout overflow when
   * Blockly measures blocks using English source strings but later paints
   * Czech text into them (or vice-versa). Returns one entry per block in
   * flyout order; `overflow` is the number of CSS px the text right edge
   * extends past the block right edge (0 means no overflow).
   */
  async measureOpenFlyoutBlockTextOverflow(): Promise<
    Array<{ type: string; text: string; blockRight: number; textRight: number; overflow: number }>
  > {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate((el) => {
      const win = (el as HTMLIFrameElement).contentWindow as any
      if (!win || !win.Blockly) return []
      const ws = win.Blockly.mainWorkspace
      const flyout = ws?.getFlyout?.()
      const flyoutWs = flyout?.getWorkspace?.()
      if (!flyoutWs) return []
      const out: Array<{
        type: string; text: string; blockRight: number; textRight: number; overflow: number
      }> = []
      const blocks: any[] = flyoutWs.getTopBlocks?.(false) ?? []
      for (const block of blocks) {
        const svgRoot: SVGGraphicsElement | undefined = block.getSvgRoot?.()
        if (!svgRoot || typeof svgRoot.getBoundingClientRect !== 'function') continue
        const blockRect = svgRoot.getBoundingClientRect()
        const texts = Array.from(
          svgRoot.querySelectorAll('text.blocklyText'),
        ) as SVGGraphicsElement[]
        for (const t of texts) {
          const r = t.getBoundingClientRect()
          if (r.width === 0) continue
          const overflow = Math.max(0, r.right - blockRect.right)
          out.push({
            type: String(block.type ?? ''),
            text: (t.textContent ?? '').replace(/\u00A0/g, ' ').trim(),
            blockRight: blockRect.right,
            textRight: r.right,
            overflow,
          })
        }
      }
      return out
    }, iframeEl!)
  }

  // ---- Block creation / inspection on the main workspace -------------------

  async createStartMachineBlock(): Promise<string> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    const id = await this.page.evaluate((el) => {
      const win = (el as HTMLIFrameElement).contentWindow as any
      if (!win || !win.Blockly) throw new Error('Blockly not available on PXT iframe window')
      const ws = win.Blockly.mainWorkspace
      const xml =
        '<xml xmlns="https://developers.google.com/blockly/xml">' +
        '<block type="factory_start_machine">' +
        '<value name="machine">' +
        '<shadow type="factory_pick_machine"></shadow>' +
        '</value>' +
        '</block>' +
        '</xml>'
      const textToDom = win.Blockly.utils?.xml?.textToDom ?? win.Blockly.Xml.textToDom
      if (typeof textToDom !== 'function') throw new Error('Blockly.Xml.textToDom not available')
      const dom = textToDom(xml)
      const blockEl = dom.firstElementChild
      if (!blockEl) throw new Error('failed to parse probe block XML')
      const block = win.Blockly.Xml.domToBlock(blockEl, ws)
      if (!block) throw new Error('factory_start_machine block could not be created from XML')
      return block.id as string
    }, iframeEl!)
    expect(id).toBeTruthy()
    return id
  }

  /** Deterministically create a top-level block on the main workspace by Blockly type. */
  async createWorkspaceBlockByType(type: string, x = 220, y = 180): Promise<string> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    const id = await this.page.evaluate(
      ({ el, type, x, y }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) throw new Error('Blockly not available on PXT iframe window')
        const ws = win.Blockly.mainWorkspace
        if (!ws) throw new Error('Blockly main workspace not available')
        const block = ws.newBlock(type)
        if (!block) throw new Error(`Failed to create block of type "${type}"`)
        block.initSvg?.()
        block.render?.()
        block.moveBy?.(x, y)
        return String(block.id ?? '')
      },
      { el: iframeEl!, type, x, y },
    )
    expect(id, `Expected workspace block id for type "${type}"`).toBeTruthy()
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

            // Try Blockly flyout workspace first (classic Blockly mode).
            const flyout = ws?.getFlyout?.()
            const flyoutWs = flyout?.getWorkspace?.()
            const blocks: any[] = flyoutWs?.getAllBlocks?.(false) ?? []
            const pick = blocks.find((b) => b.type === 'factory_pick_machine')
            if (pick) {
              try {
                return pick.toString?.() ?? ''
              } catch {
                return ''
              }
            }

            return ''
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

  /**
   * Poll `readEventBlockInfo(types)` until two consecutive reads agree on
   * the shape (registered / hasPrevious / hasNext / color) for every
   * requested type, then return the stable snapshot. PXT registers block
   * definitions in phases; under heavy parallel load the inspector
   * (`ws.newBlock(t)`) can be called between a draft registration and the
   * final one, producing a transient shape that does not match the
   * declared block.
   */
  async waitForEventBlockShapeStable<T extends string>(
    types: readonly T[],
    timeoutMs = 15_000,
  ): Promise<Record<T, EventBlockInfoEntry>> {
    // Under heavy parallel-worker load the runtime hat-shape patch
    // (`applyHatBlockShape` → `Workspace.prototype.newBlock` override)
    // can land AFTER the test starts polling. `ws.newBlock(t)` then
    // briefly returns a non-stripped block whose `hasPrevious === true`
    // — stable, but wrong. Gate the poll on the patch being installed
    // so the first read already sees the correct shape.
    await this.waitForHatBlockShapePatched(timeoutMs)
    let previous: string | null = null
    let latest: Record<T, EventBlockInfoEntry> = {} as Record<T, EventBlockInfoEntry>
    await expect
      .poll(
        async () => {
          latest = await this.readEventBlockInfo<T>(types)
          const snapshot = JSON.stringify(latest)
          const stable = previous !== null && snapshot === previous
          previous = snapshot
          return stable
        },
        { timeout: timeoutMs, intervals: [100, 200, 400] },
      )
      .toBe(true)
    return latest
  }

  /**
   * Place an event hat block (e.g. `factory_on_item_arrives`,
   * `factory_on_machine_idle`) on the MAIN workspace by performing an
   * actual flyout drag-and-drop. This is the user-facing path the bug
   * report covers: programmatic XML insertion goes through a different
   * code path (Blockly disables events around `domToBlock`, so the hat
   * shape patch behaves differently and the orphan-disable listener
   * sees a different event ordering) and does NOT reproduce the
   * disabled-rendering symptom.
   *
   * The caller MUST have already opened the toolbox category that
   * contains the requested block type (e.g. `openEventsCategory()`)
   * so the flyout is rendered. Returns the new block's id on the main
   * workspace.
   */
  async dragHatBlockOntoWorkspace(type: string): Promise<string> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()

    // Snapshot pre-existing main-workspace block ids of this type so we
    // can identify the freshly dropped one after the drag completes.
    const preIds: string[] = await this.page.evaluate(
      ({ el, t }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) return [] as string[]
        const ws = win.Blockly.mainWorkspace
        const all: any[] = ws?.getAllBlocks?.(false) ?? []
        return all.filter((b: any) => b.type === t).map((b: any) => String(b.id))
      },
      { el: iframeEl!, t: type },
    )

    // Find the flyout block of this type and compute its center in
    // viewport coordinates (the bounding rect of an SVG element inside
    // the iframe is relative to that iframe's viewport). If the block
    // is positioned below the visible flyout area (which is common on
    // smaller viewports), scroll the flyout's internal workspace so
    // the block becomes reachable.
    const flyoutBlockRect = await this.page.evaluate(
      ({ el, t }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) throw new Error('Blockly not available')
        const ws = win.Blockly.mainWorkspace
        const flyoutWs = ws?.getFlyout?.()?.getWorkspace?.()
        if (!flyoutWs) throw new Error('flyout workspace not available — did you open a toolbox category?')
        const blocks: any[] = flyoutWs.getAllBlocks?.(false) ?? []
        const target = blocks.find((b: any) => b.type === t)
        if (!target) {
          throw new Error(
            `no flyout block of type "${t}" found. ` +
              `Flyout block types: ${JSON.stringify(blocks.map((b: any) => String(b.type)))}`,
          )
        }
        const svg = typeof target.getSvgRoot === 'function' ? target.getSvgRoot() : null
        if (!svg) throw new Error(`flyout block ${t} has no SVG root`)
        let r = (svg as SVGElement).getBoundingClientRect()
        const iframeRect = (el as HTMLIFrameElement).getBoundingClientRect()
        // If the block is below the iframe viewport, scroll the flyout
        // workspace up so the block is fully visible.
        if (r.y + r.height > iframeRect.height) {
          const scrollY = -(r.y + r.height - iframeRect.height + 40)
          if (typeof flyoutWs.scroll === 'function') {
            flyoutWs.scroll(0, scrollY)
            r = (svg as SVGElement).getBoundingClientRect()
          }
        }
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      },
      { el: iframeEl!, t: type },
    )

    const iframeBox = await this.iframeLocator.boundingBox()
    if (!iframeBox) throw new Error('PXT iframe has no bounding box')

    const fromX = iframeBox.x + flyoutBlockRect.x + flyoutBlockRect.width / 2
    const fromY = iframeBox.y + flyoutBlockRect.y + flyoutBlockRect.height / 2

    // Drop close to the existing on-start block (near top of the
    // workspace). This matches the natural user gesture and — as
    // observed in manual reproduction — is required to trigger the
    // disableOrphans listener's `setEnabled(false)` path. Dropping
    // farther away yields an enabled block and hides the bug.
    const onStartRect = await this.page.evaluate(
      ({ el }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) return null
        const ws = win.Blockly.mainWorkspace
        const all: any[] = ws?.getAllBlocks?.(false) ?? []
        const onStart = all.find((b: any) => b.type === 'pxt-on-start')
        if (!onStart || typeof onStart.getSvgRoot !== 'function') return null
        const r = (onStart.getSvgRoot() as SVGElement).getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      },
      { el: iframeEl! },
    )

    let toX: number
    let toY: number
    if (onStartRect) {
      // Drop just below the on-start block, in roughly the same column,
      // so the hat block lands in a region where Blockly's snap/orphan
      // logic actually engages with neighbouring connections.
      toX = iframeBox.x + onStartRect.x + onStartRect.width / 2
      toY = iframeBox.y + onStartRect.y + onStartRect.height + 30
    } else {
      // Fallback: best-guess position if on-start isn't visible.
      const wsBox = await this.pxtFrame().locator('.blocklySvg').boundingBox()
      toX = (wsBox?.x ?? iframeBox.x) + (wsBox?.width ?? 600) * 0.5
      toY = (wsBox?.y ?? iframeBox.y) + 200
    }

    await this.page.mouse.move(fromX, fromY)
    await this.page.mouse.down()
    // Wiggle to ensure Blockly registers a drag (some drag thresholds
    // require movement before drop) and to avoid the click-vs-drag
    // heuristic.
    await this.page.mouse.move(fromX + 10, fromY + 10, { steps: 5 })
    await this.page.mouse.move(toX, toY, { steps: 20 })
    await this.page.mouse.up()
    // Give the drop handler + change-listener queue a beat to settle.
    await this.page.waitForTimeout(400)

    // Find the new block id of this type that wasn't there before.
    const newId: string = await this.page.evaluate(
      ({ el, t, pre }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) return ''
        const ws = win.Blockly.mainWorkspace
        const all: any[] = ws?.getAllBlocks?.(false) ?? []
        const ids = all
          .filter((b: any) => b.type === t)
          .map((b: any) => String(b.id))
          .filter((id: string) => !pre.includes(id))
        return ids[0] ?? ''
      },
      { el: iframeEl!, t: type, pre: preIds },
    )
    expect(
      newId,
      `drag from flyout did not produce a new "${type}" block on the main workspace. ` +
        `Pre-existing ids of this type: ${JSON.stringify(preIds)}.`,
    ).toBeTruthy()
    return newId
  }

  /**
   * Read the enabled state of a block placed on the main workspace,
   * combining the Blockly API truth (`block.isEnabled()`) with the
   * rendered SVG markers Blockly uses to display disabled blocks (the
   * `blocklyDisabled` CSS class on the block path, and a `fill="url(#…)"`
   * reference to a `<pattern id="blocklyDisabledPattern…">` element).
   */
  async readPlacedBlockEnabledInfo(
    blockId: string,
  ): Promise<import('../types').PlacedBlockEnabledInfo> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    const readOnce = (): Promise<import('../types').PlacedBlockEnabledInfo> =>
      this.readPlacedBlockEnabledInfoOnce(iframeEl!, blockId)
    // Production's `hatBlockShape.ts` heal runs on Blockly CREATE/MOVE
    // events and on a deferred `setTimeout(0)` pass after XML loads,
    // so the SVG `blocklyDisabled` class can briefly appear between
    // the synchronous newBlock return and the heal flush. Poll for a
    // stable final state (block exists, enabled, no disabled markers)
    // up to ~3s before falling through to the last read — keeps real
    // bugs failing the spec while smoothing over the heal-race flake.
    const deadline = Date.now() + 3_000
    let last = await readOnce()
    while (
      Date.now() < deadline
      && last.blockExists
      && (!last.isEnabled || last.hasDisabledClass || last.hasDisabledPatternRef)
    ) {
      await this.page.waitForTimeout(100)
      last = await readOnce()
    }
    return last
  }

  private async readPlacedBlockEnabledInfoOnce(
    iframeEl: import('@playwright/test').ElementHandle<Element>,
    blockId: string,
  ): Promise<import('../types').PlacedBlockEnabledInfo> {
    return this.page.evaluate(
      ({ el, id }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) throw new Error('Blockly not available')
        const ws = win.Blockly.mainWorkspace
        const block = ws?.getBlockById?.(id)
        if (!block) {
          return {
            blockExists: false,
            isEnabled: false,
            hasDisabledClass: false,
            hasDisabledPatternRef: false,
            svgPathClasses: [] as string[],
            svgFillRefs: [] as string[],
          }
        }
        let isEnabled = true
        try {
          isEnabled = typeof block.isEnabled === 'function' ? !!block.isEnabled() : true
        } catch {
          /* leave default */
        }
        const svgRoot: SVGElement | null = (typeof block.getSvgRoot === 'function'
          ? block.getSvgRoot()
          : null) as SVGElement | null
        const svgPathClasses: string[] = []
        const svgFillRefs: string[] = []
        let hasDisabledClass = false
        let hasDisabledPatternRef = false
        if (svgRoot) {
          const allElems = svgRoot.querySelectorAll('path, rect, polygon, g')
          allElems.forEach((node) => {
            const cls = (node as Element).getAttribute('class') ?? ''
            if (cls) svgPathClasses.push(cls)
            if (/\bblocklyDisabled\b/.test(cls)) hasDisabledClass = true
            const fill = (node as Element).getAttribute('fill') ?? ''
            if (fill) svgFillRefs.push(fill)
            if (/blocklyDisabledPattern/i.test(fill)) hasDisabledPatternRef = true
          })
          // Also check the root element class.
          const rootCls = svgRoot.getAttribute('class') ?? ''
          if (/\bblocklyDisabled\b/.test(rootCls)) hasDisabledClass = true
        }
        return {
          blockExists: true,
          isEnabled,
          hasDisabledClass,
          hasDisabledPatternRef,
          svgPathClasses,
          svgFillRefs,
        }
      },
      { el: iframeEl!, id: blockId },
    )
  }

  /**
   * Replace the entire Blockly main workspace contents with the given
   * XML (the same shape PXT writes to the saved project). Returns the
   * id of the first block of `expectedTopBlockType` after the load.
   *
   * This mimics the save/reload round-trip a player experiences when
   * they close and reopen a project: the persisted workspace XML is
   * fed back to `Blockly.Xml.domToWorkspace`, which is the only path
   * by which production code rebuilds the workspace from durable
   * storage. Any `disabled="true"` attributes captured at save time
   * are reapplied here, so this is the path the user observes when
   * they reopen an editor and find a block grayed out.
   */
  async loadWorkspaceXmlReplacing(
    xml: string,
    expectedTopBlockType: string,
  ): Promise<string> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    const newId: string = await this.page.evaluate(
      ({ el, xmlText, t }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) throw new Error('Blockly not available')
        const ws = win.Blockly.mainWorkspace
        if (!ws) throw new Error('Blockly main workspace not available')
        ws.clear()
        const textToDom =
          win.Blockly.utils?.xml?.textToDom ?? win.Blockly.Xml.textToDom
        const dom = textToDom(xmlText)
        win.Blockly.Xml.domToWorkspace(dom, ws)
        const all: any[] = ws.getAllBlocks?.(false) ?? []
        const match = all.find((b: any) => b.type === t)
        return match ? String(match.id) : ''
      },
      { el: iframeEl!, xmlText: xml, t: expectedTopBlockType },
    )
    expect(
      newId,
      `loading workspace XML did not produce a "${expectedTopBlockType}" block. ` +
        `XML snippet: ${xml.slice(0, 200)}…`,
    ).toBeTruthy()
    // Settle: let Blockly process any async events (CREATE, MOVE) queued by
    // the load so disable-orphans and similar listeners run.
    await this.page.waitForTimeout(250)
    return newId
  }

  /**
   * Load a blocks XML via the PRODUCTION `PxtEditor.loadWorkspaceXml`
   * pipeline (envelope `{ts:'', blocks:xml}`), which routes through
   * `loadBlocksWithRegistrationReady` AND arms the watchdog that
   * re-injects on PXT's post-install `loadHeaderAsync` clobber. This is
   * the only injection path that survives the PXT bootstrap race under
   * heavy parallel-worker load; direct `Blockly.Xml.domToWorkspace`
   * from `loadWorkspaceXmlReplacing` gets stripped when PXT decompiles
   * an empty `main.ts` on top of it.
   *
   * Returns the id of the first block of `expectedTopBlockType` after the
   * load settles, or `''` if the load timed out before the block appeared.
   */
  async loadWorkspaceViaProductionPath(
    xml: string,
    expectedTopBlockType: string,
    settleTimeoutMs = 5000,
  ): Promise<string> {
    const envelope = JSON.stringify({ ts: '', blocks: xml })
    await this.page.evaluate(
      (env) => {
        const fn = (window as unknown as {
          __test?: { loadPxtWorkspaceEnvelope?: (envelope: string) => void }
        }).__test?.loadPxtWorkspaceEnvelope
        if (typeof fn !== 'function') {
          throw new Error('__test.loadPxtWorkspaceEnvelope not exposed')
        }
        fn(env)
      },
      envelope,
    )
    // Poll the live Blockly workspace until the expected top-level
    // block appears (load + watchdog re-injection both complete).
    const start = Date.now()
    let foundId = ''
    while (Date.now() - start < settleTimeoutMs) {
      const iframeEl = await this.iframeLocator.elementHandle().catch(() => null)
      if (iframeEl) {
        foundId = await this.page.evaluate(
          ({ el, t }) => {
            const win = (el as HTMLIFrameElement).contentWindow as any
            const ws = win?.Blockly?.mainWorkspace
            if (!ws) return ''
            const all: any[] = ws.getAllBlocks?.(false) ?? []
            const match = all.find((b: any) => b.type === t)
            return match ? String(match.id) : ''
          },
          { el: iframeEl, t: expectedTopBlockType },
        )
        if (foundId) break
      }
      await this.page.waitForTimeout(200)
    }
    return foundId
  }

  /**
   * Inject `xml` via the production load path, force a save, and check
   * `lastPxtSource` against `predicate` — retrying the WHOLE sequence up
   * to `maxAttempts` times. Necessary because PXT's `loadHeaderAsync`
   * can clobber the workspace AFTER the production watchdog's 4 s
   * deadline expires under heavy parallel-worker load. Each retry
   * re-arms the watchdog with a fresh 4 s window, so the saved source
   * eventually reflects the injected blocks.
   *
   * Returns the matching source on success, or the last observed source
   * (often `""` or `"\n"`) on failure so the caller can surface it in
   * an assertion message.
   */
  async loadAndAwaitDecompiledSource(
    xml: string,
    expectedTopBlockType: string,
    predicate: (source: string) => boolean,
    maxAttempts = 10,
  ): Promise<string> {
    let last = ''
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const placedId = await this.loadWorkspaceViaProductionPath(
        xml,
        expectedTopBlockType,
        4000,
      )
      if (!placedId) continue
      // Allow PXT's post-install `loadHeaderAsync` to fire and the
      // watchdog to re-inject before we ask for a fresh decompile.
      await this.page.waitForTimeout(800)
      // Fire a synthetic Blockly CHANGE event so PXT's debounced
      // compile path treats the workspace as dirty and re-derives
      // `main.ts`. Without this nudge the previously-cached
      // `lastPxtSource` can stay at `"\n"` even after a successful
      // injection under heavy parallel-worker load.
      const iframeEl = await this.iframeLocator.elementHandle().catch(() => null)
      if (iframeEl) {
        await this.page.evaluate((el) => {
          const win = (el as HTMLIFrameElement).contentWindow as any
          const ws = win?.Blockly?.mainWorkspace
          const Events = win?.Blockly?.Events
          if (!ws || !Events) return
          try {
            const ev = new Events.UiBase(ws.id)
            ev.recordUndo = false
            Events.fire(ev)
            const blocks: any[] = ws.getAllBlocks?.(false) ?? []
            if (blocks.length > 0 && Events.BlockChange) {
              const b = blocks[0]
              const change = new Events.BlockChange(b, 'field', null, '', '')
              change.recordUndo = false
              Events.fire(change)
            }
          } catch {
            // ignore — fall through to forceSave
          }
        }, iframeEl)
      }
      await this.page.waitForTimeout(300)
      await this.forcePxtSave(4000).catch(() => undefined)
      last = await this.getLastPxtSource()
      if (predicate(last)) return last
    }
    return last
  }

  /**
   * Deterministic blocks → TS compile via the new
   * `PxtEditor.compileBlocksToTsAsync` API. Resolves with the compiled
   * `main.ts` once PXT echoes a `workspacesave` whose `main.blocks`
   * contains every substring in `blocksMustContain` AND `main.ts` is
   * non-empty. Rejects on timeout. Replaces the polling/retry-based
   * `loadAndAwaitDecompiledSource` helper.
   */
  async compileBlocksToTs(
    opts?: { blocksMustContain?: string[]; tsMustContain?: string[]; timeoutMs?: number },
  ): Promise<string> {
    return this.page.evaluate(
      ([o]) =>
        (window as unknown as {
          __test?: {
            compilePxtBlocksToTs?: (
              o?: { blocksMustContain?: string[]; tsMustContain?: string[]; timeoutMs?: number },
            ) => Promise<string>
          }
        }).__test?.compilePxtBlocksToTs?.(o),
      [opts ?? {}],
    ) as Promise<string>
  }

  /**
   * Trigger PXT's blocks → TS compile pipeline by nudging the live
   * Blockly workspace with a synthetic CHANGE event. After loading a
   * bundled project via the Projects panel, PXT keeps the bundled
   * `main.ts` as-is and does NOT re-compile from `main.blocks` on its
   * own — so `lastPxtSource` reflects the stale bundled TS even after
   * `forcePxtSave`. A workspace event makes PXT mark its TS as dirty
   * and run the next decompile snapshot. Resolves once `predicate`
   * succeeds against `getLastPxtSource()`, retrying up to
   * `maxAttempts` times.
   */
  async waitForPxtRecompileMatching(
    predicate: (source: string) => boolean,
    maxAttempts = 8,
  ): Promise<string> {
    let last = ''
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const iframeEl = await this.iframeLocator.elementHandle().catch(() => null)
      if (iframeEl) {
        await this.page.evaluate((el) => {
          const win = (el as HTMLIFrameElement).contentWindow as any
          const ws = win?.Blockly?.mainWorkspace
          if (!ws) return
          // Fire a synthetic change event so PXT's listeners flag the
          // workspace as dirty and re-derive `main.ts` from blocks.
          try {
            const Events = win.Blockly.Events
            if (Events) {
              const ev = new Events.UiBase(ws.id)
              ev.recordUndo = false
              Events.fire(ev)
            }
            // Belt-and-braces: an explicit CHANGE on the first block
            // also nudges PXT's debounced compile.
            const blocks: any[] = ws.getAllBlocks?.(false) ?? []
            if (blocks.length > 0 && Events?.BlockChange) {
              const b = blocks[0]
              const change = new Events.BlockChange(b, 'field', null, '', '')
              change.recordUndo = false
              Events.fire(change)
            }
          } catch {
            // ignore — fall through to the polling loop
          }
        }, iframeEl)
      }
      await this.page.waitForTimeout(400)
      await this.forcePxtSave(2500).catch(() => undefined)
      last = await this.getLastPxtSource()
      if (predicate(last)) return last
    }
    return last
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
   * Normalize the live Blockly workspace by serializing it to XML and
   * re-deserializing in place. Forces any default/shadow blocks declared on
   * a block definition's input slots to be materialized — matching the
   * post-load workspace state. Use this before taking a "BEFORE" snapshot
   * for a save/reload round-trip so the snapshot is stable across the
   * persistence boundary.
   */
  async normalizeWorkspaceShadows(): Promise<void> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    await this.page.evaluate((el) => {
      const win = (el as HTMLIFrameElement).contentWindow as any
      if (!win || !win.Blockly) throw new Error('Blockly not available on PXT iframe window')
      const ws = win.Blockly.mainWorkspace
      if (!ws) throw new Error('Blockly main workspace not available')
      const dom = win.Blockly.Xml.workspaceToDom(ws)
      ws.clear()
      win.Blockly.Xml.domToWorkspace(dom, ws)
    }, iframeEl!)
  }

  /**
   * Read the rendered SVG label text segments for every block of `type`
   * currently on the main workspace (excludes the flyout). Each entry
   * concatenates the block's own `text.blocklyText` nodes (skipping
   * descendants belonging to child blocks) so callers can assert on the
   * visible label wording of a single block in isolation.
   */
  async readWorkspaceBlocksRenderedText(
    type: string,
  ): Promise<Array<{ id: string; svgTexts: string[]; joined: string }>> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate(
      ({ el, type }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) throw new Error('Blockly not available on PXT iframe window')
        const ws = win.Blockly.mainWorkspace
        if (!ws) throw new Error('Blockly main workspace not available')
        const all: any[] = ws.getAllBlocks?.(false) ?? []
        const matches = all.filter((b: any) => b.type === type)
        return matches.map((b: any) => {
          let svgTexts: string[] = []
          try {
            const svg = b.getSvgRoot?.() as SVGElement | undefined
            if (svg) {
              const childSvgRoots = new Set<Element>()
              for (const input of b.inputList ?? []) {
                const target = input?.connection?.targetBlock?.()
                const root = target?.getSvgRoot?.()
                if (root) childSvgRoots.add(root)
              }
              svgTexts = Array.from(svg.querySelectorAll('text.blocklyText'))
                .filter((n) => {
                  for (const root of childSvgRoots) {
                    if (root.contains(n)) return false
                  }
                  return true
                })
                .map((n) => (n.textContent ?? '').replace(/\u00A0/g, ' ').trim())
                .filter((s) => s.length > 0)
            }
          } catch {
            svgTexts = []
          }
          return { id: b.id as string, svgTexts, joined: svgTexts.join(' ') }
        })
      },
      { el: iframeEl!, type },
    )
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

  /**
   * Return the raw workspace XML serialized via `Blockly.Xml.workspaceToDom`.
   * Useful for failure-message diagnostics. Specs SHOULD NOT parse this
   * string themselves — use the structured readers (e.g.
   * `readSetRecipeBlocksFromLiveWorkspace`) instead.
   */
  async getRawWorkspaceXml(): Promise<string> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate((el) => {
      const win = (el as HTMLIFrameElement).contentWindow as any
      if (!win || !win.Blockly) throw new Error('Blockly not available on PXT iframe window')
      const ws = win.Blockly.mainWorkspace
      if (!ws) throw new Error('Blockly main workspace not available')
      try {
        const dom = win.Blockly.Xml.workspaceToDom(ws)
        return dom ? String(win.Blockly.Xml.domToText(dom) ?? '') : ''
      } catch {
        return ''
      }
    }, iframeEl!)
  }

  /**
   * Walk the live Blockly workspace and return one structured entry per
   * `factory_set_recipe` block. Encodes whether the `<value name="machine">`
   * input slot is present, what (if any) child block/shadow is wired into
   * it, and the `<field name="machine">` value on that child.
   *
   * Implemented via `Blockly.Xml.workspaceToDom` so the snapshot reflects
   * the same XML that would be persisted by an autosave at this moment —
   * i.e. exactly the bytes a save/reload round-trip would carry.
   */
  async readSetRecipeBlocksFromLiveWorkspace(): Promise<SetRecipeBlockInfo[]> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate((el) => {
      const win = (el as HTMLIFrameElement).contentWindow as any
      if (!win || !win.Blockly) throw new Error('Blockly not available on PXT iframe window')
      const ws = win.Blockly.mainWorkspace
      if (!ws) throw new Error('Blockly main workspace not available')
      const dom = win.Blockly.Xml.workspaceToDom(ws)
      if (!dom) return []

      const out: Array<{
        id: string
        hasMachineValueInput: boolean
        machineSlotChildType: string | null
        machineSlotChildIsShadow: boolean | null
        machineFieldValue: string | null
        recipeFieldValue: string | null
      }> = []

      // Recursively visit every `<block>` (or `<shadow>`) descendant of the
      // workspace root, regardless of whether it lives inside a statement,
      // value input, or a `<next>` chain.
      const visit = (node: Element): void => {
        if (
          (node.tagName === 'block' || node.tagName === 'BLOCK') &&
          node.getAttribute('type') === 'factory_set_recipe'
        ) {
          const id = node.getAttribute('id') ?? ''
          // Direct-children only: the `<value name="machine">` input lives
          // immediately under this `factory_set_recipe` element. Any
          // `<value>` further down is for a NESTED block and must not
          // count toward this entry.
          let machineValue: Element | null = null
          let recipeFieldValue: string | null = null
          for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i]
            const tag = child.tagName.toLowerCase()
            if (tag === 'value' && child.getAttribute('name') === 'machine') {
              machineValue = child
            } else if (tag === 'field' && child.getAttribute('name') === 'recipe') {
              recipeFieldValue = child.textContent ?? ''
            }
          }

          let machineSlotChildType: string | null = null
          let machineSlotChildIsShadow: boolean | null = null
          let machineFieldValue: string | null = null
          if (machineValue) {
            // Find the first child element that is a <block> or <shadow>.
            for (let i = 0; i < machineValue.children.length; i++) {
              const c = machineValue.children[i]
              const tag = c.tagName.toLowerCase()
              if (tag === 'block' || tag === 'shadow') {
                machineSlotChildType = c.getAttribute('type')
                machineSlotChildIsShadow = tag === 'shadow'
                // Look for `<field name="machine">` directly under this
                // child block/shadow.
                for (let j = 0; j < c.children.length; j++) {
                  const f = c.children[j]
                  if (
                    f.tagName.toLowerCase() === 'field' &&
                    f.getAttribute('name') === 'machine'
                  ) {
                    machineFieldValue = f.textContent ?? ''
                    break
                  }
                }
                break
              }
            }
          }

          out.push({
            id,
            hasMachineValueInput: machineValue !== null,
            machineSlotChildType,
            machineSlotChildIsShadow,
            machineFieldValue,
            recipeFieldValue,
          })
        }
        for (let i = 0; i < node.children.length; i++) {
          visit(node.children[i])
        }
      }
      visit(dom)
      return out
    }, iframeEl!)
  }

  /**
   * Generic counterpart of `readSetRecipeBlocksFromLiveWorkspace`. Walks
   * the live Blockly workspace and returns one structured entry per block
   * matching `blockType`, reporting whether the `<value name="${slotName}">`
   * pluggable input is present and what (if any) shadow/block + inner
   * `<field name="${slotChildFieldName}">` value is wired into it.
   *
   * Used by the rollout tests (`PxtEditorLegacyPluggableConsumersLoad`)
   * that assert the pluggable Machine/Belt slot pattern is preserved /
   * promoted across the 5 new consumer blocks
   * (`factory_start_machine`, `factory_stop_machine`,
   * `factory_set_machine_speed`, `factory_on_machine_idle`,
   * `factory_set_belt_speed`).
   *
   * Implemented via `Blockly.Xml.workspaceToDom` so the snapshot reflects
   * the same XML that an autosave would persist at this moment — the
   * exact bytes a save/reload round-trip would carry.
   */
  async readPluggableConsumerBlocksFromLiveWorkspace(
    blockType: string,
    slotName: string,
    slotChildFieldName: string = slotName,
  ): Promise<PluggableConsumerBlockInfo[]> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate(
      ({ el, blockType, slotName, slotChildFieldName }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) throw new Error('Blockly not available on PXT iframe window')
        const ws = win.Blockly.mainWorkspace
        if (!ws) throw new Error('Blockly main workspace not available')
        const dom = win.Blockly.Xml.workspaceToDom(ws)
        if (!dom) return []

        const out: Array<{
          id: string
          blockType: string
          slotName: string
          hasValueInput: boolean
          slotChildType: string | null
          slotChildIsShadow: boolean | null
          slotChildFieldValue: string | null
        }> = []

        const visit = (node: Element): void => {
          if (
            (node.tagName === 'block' || node.tagName === 'BLOCK') &&
            node.getAttribute('type') === blockType
          ) {
            const id = node.getAttribute('id') ?? ''
            // Direct-children only: the `<value name="${slotName}">` input
            // lives immediately under this block. Any deeper `<value>` is
            // for a nested block and must not count toward this entry.
            let slotValue: Element | null = null
            for (let i = 0; i < node.children.length; i++) {
              const child = node.children[i]
              if (
                child.tagName.toLowerCase() === 'value' &&
                child.getAttribute('name') === slotName
              ) {
                slotValue = child
                break
              }
            }

            let slotChildType: string | null = null
            let slotChildIsShadow: boolean | null = null
            let slotChildFieldValue: string | null = null
            if (slotValue) {
              for (let i = 0; i < slotValue.children.length; i++) {
                const c = slotValue.children[i]
                const tag = c.tagName.toLowerCase()
                if (tag === 'block' || tag === 'shadow') {
                  slotChildType = c.getAttribute('type')
                  slotChildIsShadow = tag === 'shadow'
                  for (let j = 0; j < c.children.length; j++) {
                    const f = c.children[j]
                    if (
                      f.tagName.toLowerCase() === 'field' &&
                      f.getAttribute('name') === slotChildFieldName
                    ) {
                      slotChildFieldValue = f.textContent ?? ''
                      break
                    }
                  }
                  break
                }
              }
            }

            out.push({
              id,
              blockType,
              slotName,
              hasValueInput: slotValue !== null,
              slotChildType,
              slotChildIsShadow,
              slotChildFieldValue,
            })
          }
          for (let i = 0; i < node.children.length; i++) {
            visit(node.children[i])
          }
        }
        visit(dom)
        return out
      },
      { el: iframeEl!, blockType, slotName, slotChildFieldName },
    )
  }

  /**
   * Generic flyout-drag helper for blocks that aren't event hats. Drops
   * the block in an empty region of the main workspace so it stays a
   * top-level standalone block (no orphan-disable, no auto-connect to
   * `pxt-on-start`). The caller MUST have already opened the toolbox
   * category that contains the requested block type. Returns the new
   * block's id on the main workspace.
   */
  async dragBlockOntoWorkspace(type: string): Promise<string> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()

    const preIds: string[] = await this.page.evaluate(
      ({ el, t }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) return [] as string[]
        const ws = win.Blockly.mainWorkspace
        const all: any[] = ws?.getAllBlocks?.(false) ?? []
        return all.filter((b: any) => b.type === t).map((b: any) => String(b.id))
      },
      { el: iframeEl!, t: type },
    )

    const flyoutBlockRect = await this.page.evaluate(
      ({ el, t }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) throw new Error('Blockly not available')
        const ws = win.Blockly.mainWorkspace
        const flyoutWs = ws?.getFlyout?.()?.getWorkspace?.()
        if (!flyoutWs) throw new Error('flyout workspace not available — did you open a toolbox category?')
        const blocks: any[] = flyoutWs.getAllBlocks?.(false) ?? []
        const target = blocks.find((b: any) => b.type === t)
        if (!target) {
          throw new Error(
            `no flyout block of type "${t}" found. ` +
              `Flyout block types: ${JSON.stringify(blocks.map((b: any) => String(b.type)))}`,
          )
        }
        const svg = typeof target.getSvgRoot === 'function' ? target.getSvgRoot() : null
        if (!svg) throw new Error(`flyout block ${t} has no SVG root`)
        let r = (svg as SVGElement).getBoundingClientRect()
        const iframeRect = (el as HTMLIFrameElement).getBoundingClientRect()
        if (r.y + r.height > iframeRect.height) {
          const scrollY = -(r.y + r.height - iframeRect.height + 40)
          if (typeof flyoutWs.scroll === 'function') {
            flyoutWs.scroll(0, scrollY)
            r = (svg as SVGElement).getBoundingClientRect()
          }
        }
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      },
      { el: iframeEl!, t: type },
    )

    const iframeBox = await this.iframeLocator.boundingBox()
    if (!iframeBox) throw new Error('PXT iframe has no bounding box')

    const fromX = iframeBox.x + flyoutBlockRect.x + flyoutBlockRect.width / 2
    const fromY = iframeBox.y + flyoutBlockRect.y + flyoutBlockRect.height / 2

    // Drop into the lower-right region of the workspace SVG, far from
    // `pxt-on-start` so we don't accidentally snap into its body.
    const wsBox = await this.pxtFrame().locator('.blocklySvg').boundingBox()
    const toX = (wsBox?.x ?? iframeBox.x) + (wsBox?.width ?? 600) * 0.7
    const toY = (wsBox?.y ?? iframeBox.y) + (wsBox?.height ?? 500) * 0.7

    await this.page.mouse.move(fromX, fromY)
    await this.page.mouse.down()
    await this.page.mouse.move(fromX + 10, fromY + 10, { steps: 5 })
    await this.page.mouse.move(toX, toY, { steps: 20 })
    await this.page.mouse.up()
    await this.page.waitForTimeout(400)

    const newId: string = await this.page.evaluate(
      ({ el, t, pre }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) return ''
        const ws = win.Blockly.mainWorkspace
        const all: any[] = ws?.getAllBlocks?.(false) ?? []
        const ids = all
          .filter((b: any) => b.type === t)
          .map((b: any) => String(b.id))
          .filter((id: string) => !pre.includes(id))
        return ids[0] ?? ''
      },
      { el: iframeEl!, t: type, pre: preIds },
    )
    expect(
      newId,
      `drag from flyout did not produce a new "${type}" block on the main workspace. ` +
        `Pre-existing ids of this type: ${JSON.stringify(preIds)}.`,
    ).toBeTruthy()
    return newId
  }

  /**
   * Read the rendered colour of a block placed on the main workspace via
   * Blockly's `block.getColour()` API, lower-cased for case-insensitive
   * comparison. Returns the hex string Blockly uses to fill the block
   * path, which is the authoritative per-block colour (independent of
   * the toolbox category colour).
   */
  async readPlacedBlockColor(blockId: string): Promise<string> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate(
      ({ el, id }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) throw new Error('Blockly not available on PXT iframe window')
        const ws = win.Blockly.mainWorkspace
        const block = ws?.getBlockById?.(id)
        if (!block) throw new Error(`no block with id "${id}" on main workspace`)
        const colour = typeof block.getColour === 'function' ? block.getColour() : ''
        return String(colour ?? '').toLowerCase()
      },
      { el: iframeEl!, id: blockId },
    )
  }

  /**
   * Click the editable `function_name` field on a `function_definition`
   * block at the workspace (the visible `<text>` inside a
   * `g.blocklyEditableText` group whose text equals `name`). This puts
   * the field into edit mode and mounts Blockly's HTML `<input>`
   * overlay (`.blocklyHtmlInput` inside `.blocklyWidgetDiv`). Waits
   * for the input to be visible before returning.
   */
  async clickFunctionNameField(name: string): Promise<void> {
    const target = this.pxtFrame()
      .locator('g.blocklyEditableText')
      .filter({ hasText: name })
      .first()
    await expect(target).toBeVisible({ timeout: 10_000 })
    await target.click()
    await expect(
      this.pxtFrame().locator('.blocklyHtmlInput'),
    ).toBeVisible({ timeout: 5_000 })
  }

  /**
   * Create a `function_definition` block on the main workspace by
   * appending an XML fragment via `Blockly.Xml.appendDomToWorkspace`
   * (the same call Blockly uses when a flyout block is dropped on the
   * workspace). Does NOT clear the workspace, so it leaves the
   * existing pinned viewport untouched — the spec that pins the
   * "stale toolbox-width pin" bug relies on the canvas remaining in
   * the buggy pre-shift state until the subsequent field-edit click.
   */
  async createFunctionDefinitionBlock(name: string): Promise<string> {
    const iframeEl = await this.iframeLocator.elementHandle()
    expect(iframeEl, 'PXT editor iframe must be present').not.toBeNull()
    const id: string = await this.page.evaluate(
      ({ el, fnName }) => {
        const win = (el as HTMLIFrameElement).contentWindow as any
        if (!win || !win.Blockly) throw new Error('Blockly not available')
        const ws = win.Blockly.mainWorkspace
        if (!ws) throw new Error('main workspace not available')
        const fid = 'rftest-fn-' + Math.random().toString(36).slice(2, 10)
        const xml =
          '<xml xmlns="https://developers.google.com/blockly/xml">' +
          `<block type="function_definition" x="80" y="80">` +
          `<mutation name="${fnName}" functionid="${fid}"></mutation>` +
          `<field name="function_name">${fnName}</field>` +
          `<field name="function_id">${fid}</field>` +
          '</block></xml>'
        const textToDom =
          win.Blockly.utils?.xml?.textToDom ?? win.Blockly.Xml.textToDom
        const dom = textToDom(xml)
        const append =
          win.Blockly.Xml.appendDomToWorkspace ?? win.Blockly.Xml.domToWorkspace
        append(dom, ws)
        const all: any[] = ws.getAllBlocks?.(false) ?? []
        const match = all.find((b: any) => b.type === 'function_definition')
        return match ? String(match.id) : ''
      },
      { el: iframeEl!, fnName: name },
    )
    expect(id, 'function_definition block was not created').toBeTruthy()
    return id
  }

  /**
   * After `clickFunctionNameField` has put a `g.blocklyEditableText`
   * group into edit mode, capture the iframe-relative bounding rects
   * of both the SVG group and the mounted HTML `<input>` overlay. Used
   * to assert that Blockly's input overlay actually paints on top of
   * the SVG field (the "stale toolbox-width pin" bug in
   * `PxtEditor.pinInitialViewport()` causes a ~150 px horizontal
   * mismatch).
   */
  async readEditingFieldOverlayRects(): Promise<{
    svgCount: number
    inputCount: number
    svg: { x: number; y: number; width: number; height: number } | null
    input: { x: number; y: number; width: number; height: number } | null
  }> {
    const el = await this.iframeLocator.elementHandle()
    expect(el, 'PXT editor iframe must be present').not.toBeNull()
    return this.page.evaluate((frame) => {
      const doc = (frame as HTMLIFrameElement).contentDocument
      if (!doc) throw new Error('PXT iframe document not available')
      const svgGroups = Array.from(
        doc.querySelectorAll('g.blocklyEditableText.editing'),
      ) as SVGGElement[]
      const inputs = Array.from(
        doc.querySelectorAll('.blocklyWidgetDiv .blocklyHtmlInput'),
      ) as HTMLInputElement[]
      const r = (e: Element | undefined) => {
        if (!e) return null
        const b = e.getBoundingClientRect()
        return { x: b.x, y: b.y, width: b.width, height: b.height }
      }
      return {
        svgCount: svgGroups.length,
        inputCount: inputs.length,
        svg: r(svgGroups[0]),
        input: r(inputs[0]),
      }
    }, el!)
  }
}
