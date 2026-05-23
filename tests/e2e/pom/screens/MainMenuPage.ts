import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'
import { BasePage } from '../BasePage'
import type { ToolbarPage } from './ToolbarPage'
import type { TutorialOverlayPage } from './TutorialOverlayPage'

/**
 * Main menu screen. Exposes navigation into the rest of the app.
 */
export class MainMenuPage extends BasePage {
  private readonly root: Locator
  private readonly title: Locator
  private readonly startBtn: Locator
  private readonly sandboxBtn: Locator
  private readonly anyMenuBtn: Locator
  private readonly langBtn: Locator

  constructor(page: Page) {
    super(page)
    this.root = page.locator('.ui-main-menu')
    this.title = page.locator('.ui-main-menu-title')
    this.startBtn = page.locator('.ui-main-menu-btn--primary')
    this.anyMenuBtn = page.locator('.ui-main-menu-btn')
    // Sandbox is the last main-menu button by convention.
    this.sandboxBtn = this.anyMenuBtn.last()
    // Language toggle is shared chrome — the canonical selector lives on the
    // toolbar but the same control is expected to be reachable from the main
    // menu and level select screens (UX requirement B2).
    this.langBtn = page.locator('.ui-lang-btn')
  }

  /**
   * Assert the language toggle is rendered, has a non-zero bounding box, and
   * is in the viewport on the main menu screen.
   */
  async expectLanguageToggleVisible(): Promise<void> {
    await expect(this.langBtn).toBeVisible()
    const box = await this.langBtn.boundingBox()
    expect(box, 'language toggle has a bounding box').not.toBeNull()
    expect(box!.width, 'language toggle width').toBeGreaterThan(0)
    expect(box!.height, 'language toggle height').toBeGreaterThan(0)
    const viewport = this.page.viewportSize()!
    expect(box!.x, 'language toggle x in viewport').toBeGreaterThanOrEqual(0)
    expect(box!.y, 'language toggle y in viewport').toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width, 'language toggle right edge in viewport')
      .toBeLessThanOrEqual(viewport.width)
    expect(box!.y + box!.height, 'language toggle bottom edge in viewport')
      .toBeLessThanOrEqual(viewport.height)
  }

  /** Click the language toggle (asserts visible first). */
  async clickLanguageToggle(): Promise<void> {
    await expect(this.langBtn).toBeVisible()
    await this.langBtn.click()
  }

  /** Read the current `<html lang>` attribute. */
  async getHtmlLang(): Promise<string> {
    return this.page.evaluate(() => document.documentElement.lang || '')
  }

  /** Assert the `<html lang>` attribute equals the given value. */
  async expectHtmlLang(lang: string): Promise<void> {
    await expect.poll(() => this.getHtmlLang()).toBe(lang)
  }

  /** Navigate to `/` and wait for the canvas to be ready. */
  async open(): Promise<void> {
    await this.goto()
  }

  /** Navigate to `/` (without canvas wait) — used by tests that re-navigate. */
  async navigate(): Promise<void> {
    await this.page.goto('/')
    await this.page.waitForSelector('canvas')
  }

  async expectVisible(): Promise<void> {
    await expect(this.root).toBeVisible()
  }

  async expectHidden(): Promise<void> {
    await expect(this.root).toBeHidden()
  }

  async expectTitle(text: string): Promise<void> {
    await expect(this.title).toHaveText(text)
  }

  async expectStartButtonVisible(): Promise<void> {
    await expect(this.startBtn).toBeVisible()
  }

  async expectStartButtonText(text: string): Promise<void> {
    await expect(this.startBtn).toHaveText(text)
  }

  async expectStartButtonEnabled(): Promise<void> {
    await expect(this.startBtn).toBeEnabled()
  }

  async clickStartGame(): Promise<void> {
    await expect(this.startBtn).toBeVisible()
    await this.startBtn.click()
  }

  /** Click the Sandbox entry (last main-menu button). */
  async clickSandbox(): Promise<void> {
    await expect(this.sandboxBtn).toBeVisible()
    await this.sandboxBtn.click()
  }

  /**
   * Full Sandbox entry flow: open the main menu, click Sandbox, wait for the
   * toolbar, dismiss the tutorial if present, and wait for the camera to settle.
   */
  async enterSandbox(toolbar: ToolbarPage, _tutorial: TutorialOverlayPage): Promise<void> {
    // Sandbox has no tutorial; no dismiss step needed.
    await this.open()
    await this.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()
  }

  /**
   * Fast-path Sandbox entry used by tests that do NOT assert the
   * MainMenu → Sandbox transition. Navigates to `/`, waits for the
   * dev-only `window.__gameManager` global to be set, then drives
   * `gameManager.enterSandbox()` directly — bypassing the main-menu
   * render + Sandbox button click. Preserves the post-conditions of
   * `enterSandbox` (toolbar visible, tutorial dismissed, camera settled).
   *
   * Requires `import.meta.env.DEV` (vite dev server). The CI dev
   * server matches that, but a production build would not expose
   * `__gameManager` — in that case fall back to `enterSandbox`.
   */
  async enterSandboxFast(toolbar: ToolbarPage, _tutorial: TutorialOverlayPage): Promise<void> {
    // Sandbox has no tutorial; no dismiss step needed.
    await this.open()
    await this.page.waitForFunction(
      () => Boolean((window as unknown as { __gameManager?: { enterSandbox?: () => void } }).__gameManager?.enterSandbox),
      undefined,
      { timeout: 15_000 },
    )
    await this.page.evaluate(() => {
      ;(window as unknown as { __gameManager: { enterSandbox: () => void } }).__gameManager.enterSandbox()
    })
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()
  }

  /** Subscribe to page-level errors (caller drains the returned array after navigation). */
  collectPageErrors(): string[] {
    const errors: string[] = []
    this.page.on('pageerror', (err) => errors.push(err.message))
    return errors
  }
}
