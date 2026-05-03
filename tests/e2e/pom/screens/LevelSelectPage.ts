import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Level select screen.
 */
export class LevelSelectPage {
  private readonly page: Page
  private readonly root: Locator
  private readonly allCards: Locator
  private readonly unlockedCards: Locator
  private readonly langBtn: Locator
  private readonly backBtn: Locator

  constructor(page: Page) {
    this.page = page
    this.root = page.locator('.ui-level-select')
    this.allCards = page.locator('.ui-level-card')
    this.unlockedCards = page.locator('.ui-level-card:not(.ui-level-card--locked)')
    // Language toggle is shared chrome — the canonical selector lives on the
    // toolbar but the same control is expected to be reachable from the level
    // select screen (UX requirement B2).
    this.langBtn = page.locator('.ui-lang-btn')
    this.backBtn = page.locator('.ui-level-select-back')
  }
  /** Assert the level card at the given 0-based index is in the locked state. */
  async expectLevelLocked(index: number): Promise<void> {
    const card = this.allCards.nth(index)
    await expect(card).toBeVisible()
    await expect(card).toHaveClass(/ui-level-card--locked/)
  }

  /** Assert the level card at the given 0-based index is NOT in the locked state. */
  async expectLevelUnlocked(index: number): Promise<void> {
    const card = this.allCards.nth(index)
    await expect(card).toBeVisible()
    await expect(card).not.toHaveClass(/ui-level-card--locked/)
  }

  /**
   * Count the filled stars on the level card at the given 0-based index.
   * Returns 0 when the card has no filled-star indicators.
   */
  async getFilledStarCount(index: number): Promise<number> {
    const card = this.allCards.nth(index)
    await expect(card).toBeVisible()
    return card.locator('.ui-star--filled').count()
  }

  /** Assert the level card at the given 0-based index shows zero filled stars. */
  async expectZeroStars(index: number): Promise<void> {
    const filled = await this.getFilledStarCount(index)
    expect(filled, `expected 0 filled stars on level card #${index}`).toBe(0)
  }

  async expectVisible(): Promise<void> {
    await expect(this.root).toBeVisible()
  }

  async expectHidden(): Promise<void> {
    await expect(this.root).toBeHidden()
  }

  async clickFirstUnlocked(): Promise<void> {
    await this.unlockedCards.first().click()
  }

  /** Click the unlocked card at the given 0-based index, after asserting it's visible. */
  async clickUnlocked(index: number): Promise<void> {
    await expect(this.unlockedCards.nth(index)).toBeVisible()
    await this.unlockedCards.nth(index).click()
  }

  /**
   * Assert the language toggle is rendered, has a non-zero bounding box, and
   * is in the viewport on the level select screen.
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

  /**
   * Assert the "Back to Menu" button is rendered, attached, has a non-zero
   * bounding box, and lies fully inside the current viewport WITHOUT any
   * caller-issued scroll. Fails if the button is positioned below the fold
   * or is clipped/occluded by an `overflow:hidden`/`scroll` ancestor.
   */
  async expectBackButtonInViewport(): Promise<void> {
    await expect(this.backBtn).toBeAttached()
    await expect(this.backBtn).toBeVisible()
    const box = await this.backBtn.boundingBox()
    expect(box, 'back button has a bounding box').not.toBeNull()
    expect(box!.width, 'back button width').toBeGreaterThan(0)
    expect(box!.height, 'back button height').toBeGreaterThan(0)
    const viewport = this.page.viewportSize()!
    expect(box!.x, 'back button x in viewport').toBeGreaterThanOrEqual(0)
    expect(box!.y, 'back button y in viewport').toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width, 'back button right edge in viewport')
      .toBeLessThanOrEqual(viewport.width)
    expect(
      box!.y + box!.height,
      `back button bottom (${box!.y + box!.height}) must be inside viewport height (${viewport.height})`,
    ).toBeLessThanOrEqual(viewport.height)

    // The button must also be reachable by hit-testing without scrolling — if
    // it is occluded by an `overflow:auto` ancestor that has scrolled it out
    // of view, `elementFromPoint` at the button's claimed center will not
    // return the button (or any of its descendants).
    const hits = await this.page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y) as Element | null
        if (!el) return false
        return !!el.closest('.ui-level-select-back')
      },
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
    )
    expect(
      hits,
      'back button center must hit-test as the back button (not occluded or scrolled out of view)',
    ).toBe(true)
  }

  /**
   * Click the Back to Menu button without first scrolling the page. Specs
   * that verify "the user can press Back without scrolling" should call
   * `expectBackButtonInViewport()` immediately before this method.
   */
  async clickBackWithoutScrolling(): Promise<void> {
    await expect(this.backBtn).toBeVisible()
    // Deliberately NOT calling `scrollIntoViewIfNeeded()` — the contract is
    // that the button is reachable in the initial layout.
    await this.backBtn.click()
  }
}
