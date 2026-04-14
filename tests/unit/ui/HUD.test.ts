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

  it('should display outputsDelivered instead of itemsProduced', () => {
    // GIVEN a fresh parent with its own HUD instance
    const ownParent = document.createElement('div')
    const hud = new HUD(ownParent)

    // WHEN update is called with both itemsProduced and outputsDelivered
    hud.update({
      itemsProduced: 5,
      robotsCompleted: 0,
      timeElapsed: 0,
      qualityPercent: 100,
      outputsDelivered: 3,
    })

    // THEN the first metric value (items counter) should show outputsDelivered (3), not itemsProduced (5)
    const values = ownParent.querySelectorAll('.ui-hud-metric-value')
    expect(values[0].textContent).toBe('3')
  })

  it('should use hud.items_delivered label for the first metric', () => {
    // WHEN we query the first metric label
    const labels = parent.querySelectorAll('.ui-hud-metric-label')

    // THEN the first label should show "Items Delivered" (en translation of hud.items_delivered)
    expect(labels[0].textContent).toBe('Items Delivered')
    // AND the label should store the correct i18n key for language switching
    expect((labels[0] as HTMLElement).dataset.i18nKey).toBe('hud.items_delivered')
  })

  it('should format time as minutes:seconds with zero-padded seconds', () => {
    // GIVEN a fresh HUD
    const ownParent = document.createElement('div')
    const hud = new HUD(ownParent)

    // WHEN update is called with 125 seconds elapsed
    hud.update({
      itemsProduced: 0,
      robotsCompleted: 0,
      timeElapsed: 125,
      qualityPercent: 100,
      outputsDelivered: 0,
    })

    // THEN formatted time should be "2:05"
    const values = ownParent.querySelectorAll('.ui-hud-metric-value')
    expect(values[2].textContent).toBe('2:05')
  })
})
