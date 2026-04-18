/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

// =============================================================================
// Horizontal viewport centering — tooltip should always be centered on the
// visible viewport horizontally, regardless of target X or `position`. This
// avoids the tooltip being hidden behind side panels (e.g. the editor) when
// the target spans the full canvas width.
// =============================================================================
describe('TutorialOverlay — horizontal viewport centering', () => {
  let parent: HTMLDivElement
  let overlay: TutorialOverlay
  const MARGIN = 8
  // jsdom default viewport
  const VIEWPORT_W = 1024
  // Tooltip fallback width used by production code when offsetWidth is 0
  const TOOLTIP_W = 300
  const TOOLTIP_H = 150
  const GAP = 16
  // Expected centered X for fallback-width tooltip on default viewport
  const EXPECTED_CENTER_LEFT = (VIEWPORT_W - TOOLTIP_W) / 2 // 362

  function expectApprox(actual: number, expected: number, tolerance = 2): void {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
  }

  function parsePxLocal(value: string): number {
    if (value.endsWith('px')) return parseFloat(value)
    return NaN
  }

  function makeTarget(
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

  beforeEach(() => {
    parent = document.createElement('div')
    document.body.appendChild(parent)
    overlay = new TutorialOverlay(parent)
  })

  afterEach(() => {
    overlay.dispose()
    document.querySelectorAll('[id^="hcenter-"]').forEach(el => el.remove())
    parent.remove()
  })

  function getTooltip(): HTMLDivElement {
    return parent.querySelector('.ui-tutorial-tooltip') as HTMLDivElement
  }

  it('centers tooltip horizontally on viewport for position "top" regardless of target X', () => {
    // Target sits on the right side of the viewport (center x=850)
    makeTarget('hcenter-top', {
      top: 200, bottom: 240, left: 700, right: 1000, width: 300, height: 40,
    })
    const steps: TutorialStep[] = [
      { messageKey: 'tutorial.step1', highlightSelector: '#hcenter-top', position: 'top' },
    ]
    overlay.loadTutorial(steps)
    overlay.start()

    const tooltip = getTooltip()
    const left = parsePxLocal(tooltip.style.left)
    const top = parsePxLocal(tooltip.style.top)

    // Horizontally centered on viewport, NOT on target (target-center would be 700)
    expectApprox(left, EXPECTED_CENTER_LEFT)
    // Vertically anchored to target: rect.top - gap - tooltipHeight = 200 - 16 - 150 = 34
    expectApprox(top, 200 - GAP - TOOLTIP_H)
  })

  it('centers tooltip horizontally on viewport for position "bottom"', () => {
    // Target on the far left of viewport (center x=100)
    makeTarget('hcenter-bottom', {
      top: 100, bottom: 140, left: 0, right: 200, width: 200, height: 40,
    })
    const steps: TutorialStep[] = [
      { messageKey: 'tutorial.step1', highlightSelector: '#hcenter-bottom', position: 'bottom' },
    ]
    overlay.loadTutorial(steps)
    overlay.start()

    const tooltip = getTooltip()
    const left = parsePxLocal(tooltip.style.left)
    const top = parsePxLocal(tooltip.style.top)

    expectApprox(left, EXPECTED_CENTER_LEFT)
    // rect.bottom + gap = 140 + 16 = 156
    expectApprox(top, 140 + GAP)
  })

  it('centers tooltip horizontally on viewport for position "left"', () => {
    makeTarget('hcenter-left', {
      top: 300, bottom: 400, left: 800, right: 900, width: 100, height: 100,
    })
    const steps: TutorialStep[] = [
      { messageKey: 'tutorial.step1', highlightSelector: '#hcenter-left', position: 'left' },
    ]
    overlay.loadTutorial(steps)
    overlay.start()

    const tooltip = getTooltip()
    const left = parsePxLocal(tooltip.style.left)
    const top = parsePxLocal(tooltip.style.top)

    // Horizontally viewport-centered, NOT placed to the left of target
    expectApprox(left, EXPECTED_CENTER_LEFT)
    // Vertically centered on target: 300 + 50 - 75 = 275
    expectApprox(top, 300 + 100 / 2 - TOOLTIP_H / 2)
  })

  it('centers tooltip horizontally on viewport for position "right"', () => {
    makeTarget('hcenter-right', {
      top: 100, bottom: 200, left: 50, right: 150, width: 100, height: 100,
    })
    const steps: TutorialStep[] = [
      { messageKey: 'tutorial.step1', highlightSelector: '#hcenter-right', position: 'right' },
    ]
    overlay.loadTutorial(steps)
    overlay.start()

    const tooltip = getTooltip()
    const left = parsePxLocal(tooltip.style.left)
    const top = parsePxLocal(tooltip.style.top)

    expectApprox(left, EXPECTED_CENTER_LEFT)
    // Vertically centered on target = 100 + 50 - 75 = 75; clamped to MARGIN if needed
    expect(top).toBeGreaterThanOrEqual(MARGIN)
    expect(top).toBeLessThanOrEqual(100 + 100 / 2 - TOOLTIP_H / 2 < MARGIN ? MARGIN : 100 + 100 / 2 - TOOLTIP_H / 2)
  })
})

// =============================================================================
// CSS contract — tooltip must stack above the editor panel.
// jsdom does not auto-load `src/style.css`, so we read the source file and
// assert the contract directly. This guards against regressions where the
// tooltip's z-index drops below the editor (causing it to render hidden).
// =============================================================================
describe('TutorialOverlay — z-index / stacking', () => {
  const cssPath = resolve(__dirname, '../../../src/style.css')
  const css = readFileSync(cssPath, 'utf-8')

  /** Find the z-index value declared inside a CSS rule whose selector matches `selectorRegex`. */
  function findZIndex(selectorRegex: RegExp): number {
    const ruleMatch = css.match(new RegExp(selectorRegex.source + '\\s*\\{([^}]*)\\}', 'm'))
    expect(ruleMatch, `expected CSS rule matching ${selectorRegex} not found`).not.toBeNull()
    const body = ruleMatch![1]
    const zMatch = body.match(/z-index\s*:\s*(\d+)/)
    expect(zMatch, `expected z-index declaration in rule ${selectorRegex}`).not.toBeNull()
    return parseInt(zMatch![1], 10)
  }

  it('.ui-tutorial-tooltip has z-index >= 200 (above editor stacking context)', () => {
    // Source-based contract guard: jsdom doesn't load CSS, so we assert the
    // declared value in src/style.css directly.
    const tooltipZ = findZIndex(/\.ui-tutorial-tooltip/)
    expect(tooltipZ).toBeGreaterThanOrEqual(200)
  })

  it('.ui-tutorial-tooltip stacks above #editor-container', () => {
    const tooltipZ = findZIndex(/\.ui-tutorial-tooltip/)
    const editorZ = findZIndex(/#editor-container(?!\.)/)
    expect(editorZ).toBeLessThan(tooltipZ)
  })
})
