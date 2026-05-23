/**
 * RED-step tests for Task D: Level 4 tutorial copy.
 *
 * `getTutorialSteps(4)` currently returns `[]` (placeholder for the
 * Splitter-based defect routing rewrite). Task D must replace it with
 * at least 4 steps that walk the player through the new mechanic.
 */
import { describe, it, expect } from 'vitest'
import { getTutorialSteps, type TutorialStep } from '../../../src/game/Tutorials'

describe('getTutorialSteps(4) — Level 4 (Quality Matters)', () => {
  const steps: TutorialStep[] = getTutorialSteps(4)

  it('T1: returns at least 4 steps', () => {
    expect(steps.length).toBeGreaterThanOrEqual(4)
  })

  it('T2: every step has a messageKey matching ^tutorial\\.level4_step\\d+$', () => {
    expect(steps.length).toBeGreaterThan(0)
    const re = /^tutorial\.level4_step\d+$/
    for (const step of steps) {
      expect(step.messageKey, `messageKey "${step.messageKey}" must match ${re}`).toMatch(re)
    }
  })

  it('T3: every step has a valid position value', () => {
    expect(steps.length).toBeGreaterThan(0)
    const allowed = new Set(['top', 'bottom', 'left', 'right'])
    for (const step of steps) {
      expect(allowed.has(step.position), `position "${step.position}" must be one of top|bottom|left|right`).toBe(true)
    }
  })

  it('T4: all messageKey values are unique within the array', () => {
    expect(steps.length).toBeGreaterThan(0)
    const keys = steps.map((s) => s.messageKey)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })

  it('T5: at least one step has a highlightSelector', () => {
    expect(steps.length).toBeGreaterThan(0)
    const withSelector = steps.filter((s) => typeof s.highlightSelector === 'string' && s.highlightSelector.length > 0)
    expect(withSelector.length).toBeGreaterThanOrEqual(1)
  })
})
