/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest'
import { initI18n } from '../../../src/i18n/i18n'
import { TutorialOverlay, type TutorialStep } from '../../../src/ui/TutorialOverlay'

beforeAll(async () => {
  await initI18n()
})

/**
 * Helper: create a DOM element with a mocked getBoundingClientRect.
 */
function createMockTarget(
  id: string,
  rect: { top: number; bottom: number; left: number; right: number; width: number; height: number },
): HTMLDivElement {
  const el = document.createElement('div')
  el.id = id
  el.getBoundingClientRect = () => ({
    ...rect,
    x: rect.left,
    y: rect.top,
    toJSON() { return this },
  })
  document.body.appendChild(el)
  return el
}

/** Parse a pixel value like "512px" → 512, or a percentage like "50%" → NaN */
function parsePx(value: string): number {
  if (value.endsWith('px')) return parseFloat(value)
  return NaN
}

describe('TutorialOverlay — tooltip positioning', () => {
  let parent: HTMLDivElement
  let overlay: TutorialOverlay
  const MARGIN = 8

  beforeEach(() => {
    parent = document.createElement('div')
    document.body.appendChild(parent)
    overlay = new TutorialOverlay(parent)
  })

  afterEach(() => {
    overlay.dispose()
    // Remove any mock target elements
    document.querySelectorAll('[id^="mock-"]').forEach(el => el.remove())
    parent.remove()
  })

  function getTooltip(): HTMLDivElement {
    return parent.querySelector('.ui-tutorial-tooltip') as HTMLDivElement
  }

  // ---------------------------------------------------------------------------
  // 1. Tooltip clamping — position 'top' on full-viewport element
  // ---------------------------------------------------------------------------
  describe('viewport clamping', () => {
    it('should clamp tooltip to viewport when position is "top" on a full-viewport element', () => {
      // GIVEN a target element that fills the entire viewport (top=0)
      createMockTarget('mock-canvas', {
        top: 0, bottom: 768, left: 0, right: 1024, width: 1024, height: 768,
      })

      const steps: TutorialStep[] = [
        { messageKey: 'tutorial.step1', highlightSelector: '#mock-canvas', position: 'top' },
      ]
      overlay.loadTutorial(steps)

      // WHEN the overlay starts
      overlay.start()

      // THEN the tooltip top should be >= MARGIN (not negative / off-screen)
      const tooltip = getTooltip()
      const topValue = parsePx(tooltip.style.top)
      expect(topValue).toBeGreaterThanOrEqual(MARGIN)
    })

    // -------------------------------------------------------------------------
    // 2. Tooltip clamping — position 'left' on leftmost element
    // -------------------------------------------------------------------------
    it('should clamp tooltip to viewport when position is "left" on a left-edge element', () => {
      // GIVEN a target element at the left edge of the viewport
      createMockTarget('mock-sidebar', {
        top: 100, bottom: 300, left: 0, right: 60, width: 60, height: 200,
      })

      const steps: TutorialStep[] = [
        { messageKey: 'tutorial.step1', highlightSelector: '#mock-sidebar', position: 'left' },
      ]
      overlay.loadTutorial(steps)

      // WHEN the overlay starts
      overlay.start()

      // THEN the tooltip left should be >= MARGIN (not pushed off-screen to the left)
      const tooltip = getTooltip()
      const leftValue = parsePx(tooltip.style.left)
      expect(leftValue).toBeGreaterThanOrEqual(MARGIN)
    })

    // -------------------------------------------------------------------------
    // 3. Tooltip clamping — position 'bottom' on bottom element
    // -------------------------------------------------------------------------
    it('should clamp tooltip when position is "bottom" near the bottom of viewport', () => {
      // GIVEN a target element whose bottom edge is flush with the viewport bottom
      createMockTarget('mock-statusbar', {
        top: 740, bottom: 768, left: 0, right: 1024, width: 1024, height: 28,
      })

      const steps: TutorialStep[] = [
        { messageKey: 'tutorial.step1', highlightSelector: '#mock-statusbar', position: 'bottom' },
      ]
      overlay.loadTutorial(steps)

      // WHEN the overlay starts
      overlay.start()

      // THEN the tooltip top should place it within viewport
      // rect.bottom(768) + 16 = 784 which exceeds typical viewport height
      // With clamping the tooltip should be visible (top <= viewport - MARGIN - some tooltip height)
      const tooltip = getTooltip()
      const topValue = parsePx(tooltip.style.top)
      // At minimum the raw value should be <= 768 - MARGIN; currently it's 784
      expect(topValue).toBeLessThanOrEqual(768 - MARGIN)
    })

    // -------------------------------------------------------------------------
    // 4. Tooltip clamping — position 'right' on rightmost element
    // -------------------------------------------------------------------------
    it('should clamp tooltip when position is "right" near the right edge of viewport', () => {
      // GIVEN a target element whose right edge is flush with the viewport right
      createMockTarget('mock-panel', {
        top: 100, bottom: 400, left: 964, right: 1024, width: 60, height: 300,
      })

      const steps: TutorialStep[] = [
        { messageKey: 'tutorial.step1', highlightSelector: '#mock-panel', position: 'right' },
      ]
      overlay.loadTutorial(steps)

      // WHEN the overlay starts
      overlay.start()

      // THEN the tooltip left should not exceed the viewport right edge minus margin
      // rect.right(1024) + 16 = 1040 which exceeds viewport
      const tooltip = getTooltip()
      const leftValue = parsePx(tooltip.style.left)
      expect(leftValue).toBeLessThanOrEqual(1024 - MARGIN)
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Hidden element fallback — zero dimensions
  // ---------------------------------------------------------------------------
  describe('hidden element fallback', () => {
    it('should center tooltip when highlighted element has zero dimensions', () => {
      // GIVEN a target element that exists but has zero dimensions (e.g. display:none)
      createMockTarget('mock-hidden', {
        top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0,
      })

      const steps: TutorialStep[] = [
        { messageKey: 'tutorial.step1', highlightSelector: '#mock-hidden', position: 'top' },
      ]
      overlay.loadTutorial(steps)

      // WHEN the overlay starts
      overlay.start()

      // THEN the tooltip should be centered (50% / 50%) instead of positioned at (0,0)
      const tooltip = getTooltip()
      expect(tooltip.style.top).toBe('50%')
      expect(tooltip.style.left).toBe('50%')
      expect(tooltip.style.transform).toContain('translate(-50%, -50%)')
    })

    // -------------------------------------------------------------------------
    // 6. Non-existent element fallback
    // -------------------------------------------------------------------------
    it('should center tooltip when highlightSelector matches no element', () => {
      // GIVEN no element matching the selector exists
      const steps: TutorialStep[] = [
        { messageKey: 'tutorial.step1', highlightSelector: '#does-not-exist', position: 'right' },
      ]
      overlay.loadTutorial(steps)

      // WHEN the overlay starts
      overlay.start()

      // THEN the tooltip should be centered
      const tooltip = getTooltip()
      expect(tooltip.style.top).toBe('50%')
      expect(tooltip.style.left).toBe('50%')
      expect(tooltip.style.transform).toContain('translate(-50%, -50%)')
    })
  })

  // ---------------------------------------------------------------------------
  // Spotlight click-through
  // ---------------------------------------------------------------------------
  describe('spotlight click-through', () => {
    it('backdrop should have pointer-events none when spotlight is active', () => {
      // GIVEN a visible target element with non-zero dimensions
      createMockTarget('mock-target', {
        top: 100, bottom: 200, left: 100, right: 300, width: 200, height: 100,
      })

      const steps: TutorialStep[] = [
        { messageKey: 'tutorial.step1', highlightSelector: '#mock-target', position: 'top' },
      ]
      overlay.loadTutorial(steps)

      // WHEN the overlay starts (spotlight is active on the target)
      overlay.start()

      // THEN the backdrop should allow clicks to pass through
      const backdrop = parent.querySelector('.ui-tutorial-backdrop') as HTMLDivElement
      expect(backdrop).not.toBeNull()
      expect(backdrop.style.pointerEvents).toBe('none')
    })

    it('backdrop should have pointer-events auto when no spotlight', () => {
      // GIVEN a step with no highlightSelector
      const steps: TutorialStep[] = [
        { messageKey: 'tutorial.step1', position: 'bottom' },
      ]
      overlay.loadTutorial(steps)

      // WHEN the overlay starts (no spotlight)
      overlay.start()

      // THEN the backdrop should block clicks (default or 'auto')
      const backdrop = parent.querySelector('.ui-tutorial-backdrop') as HTMLDivElement
      expect(backdrop).not.toBeNull()
      expect(backdrop.style.pointerEvents).not.toBe('none')
    })
  })
})

// =============================================================================
// Back (previous step) navigation
// =============================================================================
describe('TutorialOverlay — back navigation', () => {
  let parent: HTMLDivElement
  let overlay: TutorialOverlay

  const sampleSteps: TutorialStep[] = [
    { messageKey: 'tutorial.level1_step1', position: 'bottom' },
    { messageKey: 'tutorial.level1_step2', position: 'bottom' },
    { messageKey: 'tutorial.level1_step3', position: 'bottom' },
  ]

  beforeEach(() => {
    parent = document.createElement('div')
    document.body.appendChild(parent)
    overlay = new TutorialOverlay(parent)
  })

  afterEach(() => {
    overlay.dispose()
    parent.remove()
  })

  function getTooltipText(): string {
    const el = parent.querySelector('.ui-tutorial-text') as HTMLDivElement
    return el?.textContent ?? ''
  }

  function getCounter(): string {
    const el = parent.querySelector('.ui-tutorial-counter') as HTMLSpanElement
    return el?.textContent ?? ''
  }

  function getNextBtnText(): string {
    const btn = parent.querySelector('.ui-tutorial-btn--next') as HTMLButtonElement
    return btn?.textContent ?? ''
  }

  function getBackBtn(): HTMLButtonElement | null {
    return parent.querySelector('.ui-tutorial-btn--back') as HTMLButtonElement | null
  }

  // ---------------------------------------------------------------------------
  // 1. prevStep() on step 0 stays on step 0
  // ---------------------------------------------------------------------------
  it('prevStep() on step 0 should stay on step 0', () => {
    // GIVEN tutorial started at step 0
    overlay.loadTutorial(sampleSteps)
    overlay.start()
    expect(getCounter()).toBe('1 / 3')

    // WHEN prevStep() is called on step 0
    overlay.prevStep()

    // THEN it should remain on step 0
    expect(getCounter()).toBe('1 / 3')
    expect(getTooltipText()).toBe(
      'Welcome! Double-click on the grid to place your first machine — a Fabricator.',
    )
  })

  // ---------------------------------------------------------------------------
  // 2. After nextStep() + prevStep(), overlay shows step 0 content
  // ---------------------------------------------------------------------------
  it('after nextStep() + prevStep(), overlay shows step 0 content', () => {
    // GIVEN tutorial started and advanced to step 1
    overlay.loadTutorial(sampleSteps)
    overlay.start()
    overlay.nextStep()
    expect(getCounter()).toBe('2 / 3')

    // WHEN prevStep() is called
    overlay.prevStep()

    // THEN overlay should show step 0 content
    expect(getCounter()).toBe('1 / 3')
    expect(getTooltipText()).toBe(
      'Welcome! Double-click on the grid to place your first machine — a Fabricator.',
    )
  })

  // ---------------------------------------------------------------------------
  // 3. Back button is hidden on first step
  // ---------------------------------------------------------------------------
  it('back button should be hidden on first step', () => {
    // GIVEN tutorial started at step 0
    overlay.loadTutorial(sampleSteps)
    overlay.start()

    // THEN back button should not be visible
    const backBtn = getBackBtn()
    expect(backBtn).not.toBeNull()
    expect(backBtn!.style.display).toBe('none')
  })

  // ---------------------------------------------------------------------------
  // 4. Back button is visible on step 1+
  // ---------------------------------------------------------------------------
  it('back button should be visible on step 1+', () => {
    // GIVEN tutorial started and advanced to step 1
    overlay.loadTutorial(sampleSteps)
    overlay.start()
    overlay.nextStep()

    // THEN back button should be visible
    const backBtn = getBackBtn()
    expect(backBtn).not.toBeNull()
    expect(backBtn!.style.display).not.toBe('none')
  })

  // ---------------------------------------------------------------------------
  // 5. After going back from last step, Next button shows "Next" not "Finish"
  // ---------------------------------------------------------------------------
  it('after going back from last step, Next button text is "Next" not "Finish"', () => {
    // GIVEN tutorial advanced to the last step
    overlay.loadTutorial(sampleSteps)
    overlay.start()
    overlay.nextStep() // step 1
    overlay.nextStep() // step 2 (last)
    expect(getNextBtnText()).toBe('Finish')

    // WHEN prevStep() is called
    overlay.prevStep()

    // THEN Next button text should be "Next", not "Finish"
    expect(getNextBtnText()).toBe('Next')
    expect(getCounter()).toBe('2 / 3')
  })
})
