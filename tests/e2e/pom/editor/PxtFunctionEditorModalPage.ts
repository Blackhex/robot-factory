import type { Page, Locator, FrameLocator, ElementHandle } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Computed-style snapshot of the PXT "Edit Function" / "Create a Function"
 * React modal (CSS class `.createfunction`), captured from inside the
 * embedded PXT iframe. All values are `getComputedStyle(...)` strings
 * (so colors are normalised to `rgb(r, g, b)` / `rgba(r, g, b, a)`).
 */
export interface FunctionModalStyleSnapshot {
  overlay: { backgroundColor: string }
  modal: { backgroundColor: string; color: string; borderColor: string; borderRadius: string }
  header: { backgroundColor: string; borderBottomColor: string; color: string }
  headerTitleColor: string
  content: { backgroundColor: string; color: string }
  actions: { backgroundColor: string; borderTopColor: string }
  doneButton: { backgroundColor: string; color: string; borderRadius: string }
  paramButton: {
    backgroundColor: string
    color: string
    borderColor: string
    borderRadius: string
  }
  closeIconColor: string
  injectedStyleTagCount: number
}

/**
 * POM for the PXT React "Edit Function" / "Create a function" modal
 * (DOM class `.ReactModal__Content.ui.modal.createfunction` inside the
 * PXT iframe). Encapsulates the iframe-internal Blockly API call that
 * mounts the modal AND the computed-style reads used for dark-theme
 * assertions.
 */
export class PxtFunctionEditorModalPage {
  private readonly iframeLocator: Locator
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
    this.iframeLocator = page.locator('#editor-container .pxt-editor-iframe')
  }

  private pxtFrame(): FrameLocator {
    return this.page.frameLocator('#editor-container .pxt-editor-iframe')
  }

  private async iframeEl(): Promise<ElementHandle<Element>> {
    const handle = await this.iframeLocator.elementHandle()
    expect(handle, 'PXT editor iframe must be present').not.toBeNull()
    return handle as ElementHandle<Element>
  }

  /**
   * Mount the PXT React function-editor modal by calling
   * `Blockly.Functions.createFunctionCallback_(mainWorkspace)` directly
   * inside the iframe. This is the same code path that runs when the
   * user clicks "Make a Function..." in the Functions toolbox flyout
   * or selects "Edit Function" on a function-definition block — both
   * end up in `Blockly.Functions.editFunctionExternalHandler`, which
   * PXT (`createFunction.ts`) wires up to render the
   * `CreateFunctionDialog` React component with DOM class
   * `.ReactModal__Content.ui.modal.createfunction`.
   *
   * Driving the modal via the Blockly API (instead of through the
   * toolbox flyout button) avoids flakiness from SVG button hit-testing
   * and Blockly's flyout open/close animations.
   */
  async openCreateFunctionModal(timeoutMs = 10_000): Promise<void> {
    const el = await this.iframeEl()
    await this.page.waitForFunction(
      (frame) => {
        const win = (frame as HTMLIFrameElement).contentWindow as unknown as {
          Blockly?: {
            Functions?: {
              createFunctionCallback_?: unknown
              editFunctionExternalHandler?: unknown
            }
            mainWorkspace?: unknown
          }
        }
        const B = win?.Blockly
        return Boolean(
          B?.Functions &&
            typeof B.Functions.createFunctionCallback_ === 'function' &&
            typeof B.Functions.editFunctionExternalHandler === 'function' &&
            B.mainWorkspace,
        )
      },
      el,
      { timeout: timeoutMs },
    )
    await this.page.evaluate((frame) => {
      const win = (frame as HTMLIFrameElement).contentWindow as unknown as {
        Blockly: {
          Functions: { createFunctionCallback_: (ws: unknown) => void }
          mainWorkspace: unknown
        }
      }
      win.Blockly.Functions.createFunctionCallback_(win.Blockly.mainWorkspace)
    }, el)
    await this.waitVisible(timeoutMs)
  }

  /**
   * Wait until the function-editor modal is mounted and the dimmer +
   * modal box are both attached. The `CreateFunctionDialog` is mounted
   * via `Util.delay(10)` followed by a React render, so a poll loop is
   * the right primitive (not a single `.waitFor()`).
   */
  async waitVisible(timeoutMs = 10_000): Promise<void> {
    const pxt = this.pxtFrame()
    await expect(pxt.locator('body.ReactModal__Body--open')).toBeAttached({ timeout: timeoutMs })
    await expect(
      pxt.locator('.ReactModal__Content.ui.modal.createfunction'),
    ).toBeVisible({ timeout: timeoutMs })
    await expect(
      pxt.locator('.ReactModal__Content.ui.modal.createfunction .header'),
    ).toBeAttached({ timeout: timeoutMs })
    await expect(
      pxt.locator('.ReactModal__Content.ui.modal.createfunction .content #functionEditorWorkspace'),
    ).toBeAttached({ timeout: timeoutMs })
  }

  /**
   * Capture computed styles for every element that the dark-theme
   * re-skin is expected to touch. Reads happen entirely inside the PXT
   * iframe via a single `page.evaluate(...)` so the spec layer never
   * needs `getComputedStyle` access.
   */
  async readStyleSnapshot(): Promise<FunctionModalStyleSnapshot> {
    const el = await this.iframeEl()
    return this.page.evaluate((frame) => {
      const doc = (frame as HTMLIFrameElement).contentDocument
      const win = (frame as HTMLIFrameElement).contentWindow
      if (!doc || !win) throw new Error('PXT iframe document not available')

      const q = <T extends Element>(sel: string): T => {
        const node = doc.querySelector(sel) as T | null
        if (!node) throw new Error(`Selector not found in PXT iframe: ${sel}`)
        return node
      }
      const cs = (n: Element) => win.getComputedStyle(n)

      const overlay = q('.ReactModal__Overlay.dimmer')
      const modal = q('.ReactModal__Content.ui.modal.createfunction')
      const header = q('.ReactModal__Content.ui.modal.createfunction > .header')
      const headerTitle = q(
        '.ReactModal__Content.ui.modal.createfunction > .header .header-title, ' +
          '.ReactModal__Content.ui.modal.createfunction > .header h3',
      )
      const content = q('.ReactModal__Content.ui.modal.createfunction > .content')
      const actions = q('.ReactModal__Content.ui.modal.createfunction > .actions')
      const doneBtn = q(
        '.ReactModal__Content.ui.modal.createfunction .actions button.ui.button.approve.positive, ' +
          '.ReactModal__Content.ui.modal.createfunction .actions button.ui.approve',
      )
      const paramBtn = q(
        '.ReactModal__Content.ui.modal.createfunction .content .horizontal.list button.ui.button',
      )
      const closeIcon = q(
        '.ReactModal__Content.ui.modal.createfunction .closeIcon, ' +
          '.ReactModal__Content.ui.modal.createfunction .close.icon',
      )

      const overlayCs = cs(overlay)
      const modalCs = cs(modal)
      const headerCs = cs(header)
      const headerTitleCs = cs(headerTitle)
      const contentCs = cs(content)
      const actionsCs = cs(actions)
      const doneCs = cs(doneBtn)
      const paramCs = cs(paramBtn)
      const closeCs = cs(closeIcon)

      const injectedStyleTagCount = Array.from(doc.head.querySelectorAll('style'))
        .filter((s) =>
          (s.textContent || '').includes(
            'CSS overrides injected into the PXT (MakeCode) iframe',
          ),
        ).length

      return {
        overlay: { backgroundColor: overlayCs.backgroundColor },
        modal: {
          backgroundColor: modalCs.backgroundColor,
          color: modalCs.color,
          borderColor: modalCs.borderTopColor,
          borderRadius: modalCs.borderTopLeftRadius,
        },
        header: {
          backgroundColor: headerCs.backgroundColor,
          borderBottomColor: headerCs.borderBottomColor,
          color: headerCs.color,
        },
        headerTitleColor: headerTitleCs.color,
        content: { backgroundColor: contentCs.backgroundColor, color: contentCs.color },
        actions: {
          backgroundColor: actionsCs.backgroundColor,
          borderTopColor: actionsCs.borderTopColor,
        },
        doneButton: {
          backgroundColor: doneCs.backgroundColor,
          color: doneCs.color,
          borderRadius: doneCs.borderTopLeftRadius,
        },
        paramButton: {
          backgroundColor: paramCs.backgroundColor,
          color: paramCs.color,
          borderColor: paramCs.borderTopColor,
          borderRadius: paramCs.borderTopLeftRadius,
        },
        closeIconColor: closeCs.color,
        injectedStyleTagCount,
      }
    }, el)
  }

  /**
   * Save a screenshot of the entire page (including the PXT iframe and
   * the modal mounted inside it) to `test-results/screenshots/`. Used
   * by the RED-step spec to give the GREEN reviewer a visual reference
   * for what the modal currently looks like.
   */
  async screenshot(relativePath: string): Promise<void> {
    await this.page.screenshot({ path: relativePath, fullPage: false })
  }
}
