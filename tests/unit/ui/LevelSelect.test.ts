/**
 * @vitest-environment jsdom
 *
 * RED tests pinning the UX-8 changes to the Level Select screen:
 *
 *   1. Star summary collapses from 9 individual stars to a 3-slot summary
 *      where slot `i` is filled iff `totalStars >= (i + 1) * 3`.
 *
 *   2. Locked card description has improved contrast — the `.ui-level-card--locked`
 *      rule must NOT dim the whole card via `opacity: 0.45` on the parent.
 *      Effective opacity must be >= 0.6.
 *
 * The opacity assertion is a static-source check against `src/style.css`
 * because jsdom does not load external stylesheets and `getComputedStyle`
 * returns an empty string for the `opacity` property in this environment.
 */

import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import i18next from 'i18next'
import { initI18n } from '../../../src/i18n/i18n'
import { LevelSelect } from '../../../src/ui/LevelSelect'
import { getLevelByNumber, type LevelDefinition } from '../../../src/game/Level'

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function readStyleCss(): string {
  const path = join(__dirname, '..', '..', '..', 'src', 'style.css')
  return readFileSync(path, 'utf-8')
}

/**
 * Extract the value of the `opacity` declaration inside the `.ui-level-card--locked`
 * rule block of `src/style.css`. Returns `null` if the rule has no opacity
 * declaration.
 */
function getLockedCardOpacityFromCss(css: string): number | null {
  // Match the block from `.ui-level-card--locked {` up to the closing `}`
  const match = css.match(/\.ui-level-card--locked\s*\{([^}]*)\}/)
  if (!match) {
    throw new Error('Could not find .ui-level-card--locked rule in src/style.css')
  }
  const body = match[1]
  const opacityMatch = body.match(/(?:^|;|\s)opacity\s*:\s*([0-9.]+)\s*(?:;|$)/)
  if (!opacityMatch) {
    return null
  }
  return parseFloat(opacityMatch[1])
}

function countStars(card: HTMLElement): { total: number; filled: number; empty: number } {
  const stars = card.querySelectorAll<HTMLElement>('.ui-star')
  let filled = 0
  let empty = 0
  stars.forEach((s) => {
    if (s.classList.contains('ui-star--filled')) filled++
    else if (s.classList.contains('ui-star--empty')) empty++
  })
  return { total: stars.length, filled, empty }
}

function getLevelCards(parent: HTMLElement): HTMLElement[] {
  return Array.from(parent.querySelectorAll<HTMLElement>('.ui-level-card'))
}

// -----------------------------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------------------------

let parent: HTMLDivElement
let select: LevelSelect
let level1Id: string

beforeAll(async () => {
  await initI18n()
  const level1 = getLevelByNumber(1) as LevelDefinition
  const level2 = getLevelByNumber(2) as LevelDefinition
  expect(level1).toBeDefined()
  expect(level2).toBeDefined()
  level1Id = level1.id
})

beforeEach(async () => {
  if (i18next.language !== 'en') {
    await i18next.changeLanguage('en')
  }
  parent = document.createElement('div')
  document.body.appendChild(parent)
  select = new LevelSelect(parent)
  select.show()
})

afterEach(() => {
  select.dispose()
  parent.remove()
})

// -----------------------------------------------------------------------------
// 1. Star summary — 3 slots, threshold every 3 stars
// -----------------------------------------------------------------------------

describe('LevelSelect — star summary uses 3 slots', () => {
  it('level 1 card with 9 stars renders exactly 3 filled stars', () => {
    select.updateProgress(new Map([[level1Id, 9]]))
    const cards = getLevelCards(parent)
    const card = cards[0]
    const counts = countStars(card)
    expect(counts.total).toBe(3)
    expect(counts.filled).toBe(3)
    expect(counts.empty).toBe(0)
  })

  it('level 1 card with 6 stars renders 2 filled and 1 empty (3 total)', () => {
    select.updateProgress(new Map([[level1Id, 6]]))
    const card = getLevelCards(parent)[0]
    const counts = countStars(card)
    expect(counts.total).toBe(3)
    expect(counts.filled).toBe(2)
    expect(counts.empty).toBe(1)
  })

  it('level 1 card with 3 stars renders 1 filled and 2 empty (3 total)', () => {
    select.updateProgress(new Map([[level1Id, 3]]))
    const card = getLevelCards(parent)[0]
    const counts = countStars(card)
    expect(counts.total).toBe(3)
    expect(counts.filled).toBe(1)
    expect(counts.empty).toBe(2)
  })

  it('level 1 card with 2 stars renders 0 filled and 3 empty (3 total)', () => {
    select.updateProgress(new Map([[level1Id, 2]]))
    const card = getLevelCards(parent)[0]
    const counts = countStars(card)
    expect(counts.total).toBe(3)
    expect(counts.filled).toBe(0)
    expect(counts.empty).toBe(3)
  })

  it('level 1 card with 0 stars renders 3 empty stars (canonical behaviour)', () => {
    select.updateProgress(new Map([[level1Id, 0]]))
    const card = getLevelCards(parent)[0]
    const counts = countStars(card)
    expect(counts.total).toBe(3)
    expect(counts.filled).toBe(0)
    expect(counts.empty).toBe(3)
  })
})

// -----------------------------------------------------------------------------
// 2. Locked card description contrast
// -----------------------------------------------------------------------------

describe('LevelSelect — locked card has readable description contrast', () => {
  it('locked card opacity rule in src/style.css is at least 0.6', () => {
    // GIVEN the level 2 card is locked when no progress exists on level 1
    select.updateProgress(new Map())
    const cards = getLevelCards(parent)
    const lockedCard = cards[1]
    expect(lockedCard.classList.contains('ui-level-card--locked')).toBe(true)

    // The locked card must contain a description element to dim
    const desc = lockedCard.querySelector<HTMLElement>('.ui-level-card-desc')
    expect(desc).not.toBeNull()

    // Static-source assertion: parent `.ui-level-card--locked` rule must not
    // dim its children via `opacity` below the readable threshold.
    const css = readStyleCss()
    const opacity = getLockedCardOpacityFromCss(css)

    // Either no opacity declaration on the parent (preferred — dim via color)
    // or an opacity value >= 0.6.
    if (opacity !== null) {
      expect(opacity).toBeGreaterThanOrEqual(0.6)
    }
  })
})
