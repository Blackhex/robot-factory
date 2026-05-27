import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * The build/play toolbar at the top of the screen.
 */
export class ToolbarPage {
  private readonly root: Locator
  private readonly editorBtn: Locator
  private readonly startBtn: Locator
  private readonly pauseBtn: Locator
  private readonly restartBtn: Locator
  private readonly langBtn: Locator
  private readonly saveBtn: Locator
  private readonly projectsBtn: Locator
  private readonly toolbarSelect: Locator
  private readonly selectToolBtn: Locator
  private readonly placeMachineToolBtn: Locator
  private readonly removeToolBtn: Locator

  private readonly page: Page
  constructor(page: Page) {
    this.page = page
    this.root = page.locator('.ui-toolbar')
    this.editorBtn = page.locator('.ui-toolbar-btn--editor')
    this.startBtn = page.locator('.ui-toolbar-btn--start')
    this.pauseBtn = page.locator('.ui-toolbar-btn--pause')
    this.restartBtn = page.locator('.ui-toolbar-btn--restart')
    this.langBtn = page.locator('.ui-lang-btn')
    this.saveBtn = page.locator('.ui-toolbar button[data-i18n-key="toolbar.save"]')
    this.projectsBtn = page.locator('.ui-toolbar-btn--projects')
    this.toolbarSelect = page.locator('.ui-toolbar-select')
    this.selectToolBtn = page.locator('.ui-toolbar-btn[data-tool="select"]')
    this.placeMachineToolBtn = page.locator('.ui-toolbar-btn[data-tool="place_machine"]')
    this.removeToolBtn = page.locator('.ui-toolbar-btn[data-tool="remove"]')
  }

  async expectVisible(): Promise<void> {
    await expect(this.root).toBeVisible()
  }

  async expectHidden(): Promise<void> {
    await expect(this.root).toBeHidden()
  }

  async getBoundingBox(): Promise<{ x: number; y: number; width: number; height: number }> {
    await expect(this.root).toBeVisible()
    const box = await this.root.boundingBox()
    expect(box, 'toolbar has a bounding box').not.toBeNull()
    return box!
  }

  async expectEditorButtonVisible(): Promise<void> {
    await expect(this.editorBtn).toBeVisible()
  }

  async expectEditorButtonText(text: string): Promise<void> {
    await expect(this.editorBtn).toHaveText(text)
  }

  async clickEditor(): Promise<void> {
    await this.editorBtn.click()
  }

  async clickStart(): Promise<void> {
    await this.startBtn.click()
  }

  async expectStartButtonVisible(): Promise<void> {
    await expect(this.startBtn).toBeVisible()
  }

  async clickPause(): Promise<void> {
    await this.pauseBtn.click()
  }

  async expectPauseButtonVisible(): Promise<void> {
    await expect(this.pauseBtn).toBeVisible()
  }

  async expectPauseButtonText(text: string): Promise<void> {
    await expect(this.pauseBtn).toHaveText(text)
  }

  async clickRestart(): Promise<void> {
    await this.restartBtn.click()
  }

  async expectRestartButtonVisible(): Promise<void> {
    await expect(this.restartBtn).toBeVisible()
  }

  async clickLanguageToggle(): Promise<void> {
    await this.langBtn.click()
  }

  async clickSave(): Promise<void> {
    await expect(this.saveBtn).toBeVisible()
    await this.saveBtn.click()
  }

  async expectSaveButtonVisible(): Promise<void> {
    await expect(this.saveBtn).toBeVisible()
  }

  async expectLanguageButtonText(text: string): Promise<void> {
    await expect(this.langBtn).toHaveText(text)
  }

  async expectNoLegacySelect(): Promise<void> {
    await expect(this.toolbarSelect).toHaveCount(0)
  }

  async expectNoLegacyToolModeButtons(): Promise<void> {
    await expect(this.selectToolBtn).toHaveCount(0)
    await expect(this.placeMachineToolBtn).toHaveCount(0)
    await expect(this.removeToolBtn).toHaveCount(0)
  }

  /** Press the global "E" key shortcut for the editor. */
  async pressEditorShortcut(): Promise<void> {
    await this.page.keyboard.press('e')
  }

  /** Press the global "Q" key shortcut for the Projects panel. */
  async pressProjectsShortcut(): Promise<void> {
    await this.page.keyboard.press('q')
  }

  /** Press the global "F" key shortcut: start / pause / resume the simulation. */
  async pressSimulationToggleShortcut(): Promise<void> {
    await this.page.keyboard.press('f')
  }

  /** Press the global "R" key shortcut: restart the current simulation. */
  async pressSimulationRestartShortcut(): Promise<void> {
    await this.page.keyboard.press('r')
  }

  /** Press the global Space key shortcut: reset the camera view. */
  async pressResetViewShortcut(): Promise<void> {
    await this.page.keyboard.press(' ')
  }

  /** Press the global Escape key shortcut: back to the main menu. */
  async pressBackToMenuShortcut(): Promise<void> {
    await this.page.keyboard.press('Escape')
  }

  /** Move keyboard focus to the toolbar Start button. */
  async focusStartButton(): Promise<void> {
    await expect(this.startBtn).toBeVisible()
    await this.startBtn.focus()
    await expect(this.startBtn).toBeFocused()
  }

  /** Assert the Pause button shows the "paused" visual state (`is-paused` class). */
  async expectPauseButtonHasPausedClass(): Promise<void> {
    await expect(this.pauseBtn).toHaveClass(/is-paused/)
  }

  /** Assert the Pause button is in its non-paused (running) visual state. */
  async expectPauseButtonNoPausedClass(): Promise<void> {
    await expect(this.pauseBtn).not.toHaveClass(/is-paused/)
  }

  /** Read the current value of `window.scrollY`. */
  async readWindowScrollY(): Promise<number> {
    return this.page.evaluate(() => window.scrollY || document.documentElement.scrollTop || 0)
  }

  async clickProjects(): Promise<void> {
    await expect(this.projectsBtn).toBeVisible()
    await this.projectsBtn.click()
  }

  async expectProjectsButtonVisible(): Promise<void> {
    await expect(this.projectsBtn).toBeVisible()
  }

  async expectProjectsButtonHidden(): Promise<void> {
    await expect(this.projectsBtn).toHaveCount(0)
  }

  /** Assert the Projects toolbar button reflects the open panel state. */
  async expectProjectsButtonOpen(): Promise<void> {
    await expect(this.projectsBtn).toHaveClass(/is-panel-open/)
  }

  /** Assert the Projects toolbar button reflects the closed panel state. */
  async expectProjectsButtonClosed(): Promise<void> {
    await expect(this.projectsBtn).not.toHaveClass(/is-panel-open/)
  }

  /** Wait for the camera zoom-to-fit animation that runs after entering a level/sandbox. */
  async waitForCameraSettle(ms = 1200): Promise<void> {
    await this.page.waitForTimeout(ms)
  }
}
