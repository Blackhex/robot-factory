import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'
import { BasePage } from '../BasePage'

/**
 * Main menu screen. Exposes navigation into the rest of the app.
 */
export class MainMenuPage extends BasePage {
  private readonly root: Locator
  private readonly title: Locator
  private readonly startBtn: Locator
  private readonly sandboxBtn: Locator
  private readonly anyMenuBtn: Locator

  constructor(page: Page) {
    super(page)
    this.root = page.locator('.ui-main-menu')
    this.title = page.locator('.ui-main-menu-title')
    this.startBtn = page.locator('.ui-main-menu-btn--primary')
    this.anyMenuBtn = page.locator('.ui-main-menu-btn')
    // Sandbox is the last main-menu button by convention.
    this.sandboxBtn = this.anyMenuBtn.last()
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

  /** Subscribe to page-level errors (caller drains the returned array after navigation). */
  collectPageErrors(): string[] {
    const errors: string[] = []
    this.page.on('pageerror', (err) => errors.push(err.message))
    return errors
  }
}
