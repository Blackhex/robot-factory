/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { initI18n } from '../../../src/i18n/i18n'
import { HUD } from '../../../src/ui/HUD'

beforeAll(async () => {
  await initI18n()
})

describe('HUD', () => {
  let parent: HTMLDivElement

  beforeEach(() => {
    // GIVEN a fresh parent element with a HUD rendered inside
    parent = document.createElement('div')
    new HUD(parent)
  })

  it('should NOT contain any control buttons (.ui-hud-controls)', () => {
    // WHEN we query for hud controls
    // THEN none exist
    expect(parent.querySelector('.ui-hud-controls')).toBeNull()
  })

  it('should NOT contain any .ui-hud-btn elements', () => {
    // WHEN we query for hud buttons
    // THEN there are none
    expect(parent.querySelectorAll('.ui-hud-btn').length).toBe(0)
  })

  it('should have metrics elements', () => {
    // WHEN we query for metrics
    const metrics = parent.querySelector('.ui-hud-metrics')
    const values = parent.querySelectorAll('.ui-hud-metric-value')

    // THEN the metrics container exists with 4 values (items, robots, time, quality)
    expect(metrics).not.toBeNull()
    expect(values.length).toBe(4)
  })

  it('should have level name element', () => {
    // WHEN we query for the level name
    // THEN it exists
    expect(parent.querySelector('.ui-hud-level')).not.toBeNull()
  })
})
