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

    // THEN the metrics container exists with 5 values
    // (parts, assemblies, robots, time, quality) — the legacy aggregate
    // "Items Delivered" row has been removed in favour of the per-category
    // breakdown (Parts / Assemblies / Robots).
    expect(metrics).not.toBeNull()
    expect(values.length).toBe(5)
  })

  it('should have level name element', () => {
    // WHEN we query for the level name
    // THEN it exists
    expect(parent.querySelector('.ui-hud-level')).not.toBeNull()
  })

  it('should render five metric rows in the order: Parts / Assemblies / Robots / Time / Quality', () => {
    // WHEN we query metric labels and read their i18n keys
    const labels = parent.querySelectorAll<HTMLElement>('.ui-hud-metric-label')

    // THEN labels resolve to the new per-category keys in the canonical
    // order; the legacy `hud.items_delivered` row is no longer rendered.
    expect(labels.length).toBe(5)
    expect(labels[0].dataset.i18nKey).toBe('hud.parts_delivered')
    expect(labels[1].dataset.i18nKey).toBe('hud.assemblies_delivered')
    expect(labels[2].dataset.i18nKey).toBe('hud.robots_completed')
    expect(labels[3].dataset.i18nKey).toBe('hud.time')
    expect(labels[4].dataset.i18nKey).toBe('hud.quality')
  })

  it('should NOT render the legacy hud.items_delivered row', () => {
    // WHEN we collect all metric label keys
    const labels = parent.querySelectorAll<HTMLElement>('.ui-hud-metric-label')
    const keys = Array.from(labels).map((l) => l.dataset.i18nKey)

    // THEN the legacy aggregate row is gone
    expect(keys).not.toContain('hud.items_delivered')
  })

  it('should write per-category values and formatted time/quality into the five rows', () => {
    // GIVEN a fresh HUD
    const ownParent = document.createElement('div')
    const hud = new HUD(ownParent)

    // WHEN update is called with the new HUDStats shape
    hud.update({
      partsDelivered: 7,
      assembliesDelivered: 3,
      robotsCompleted: 1,
      timeElapsed: 20,
      qualityPercent: 100,
      outputsDelivered: 11,
    })

    // THEN the five value cells in order show:
    //   "7", "3", "1", "0:20", "100%"
    const values = ownParent.querySelectorAll('.ui-hud-metric-value')
    expect(values.length).toBe(5)
    expect(values[0].textContent).toBe('7')
    expect(values[1].textContent).toBe('3')
    expect(values[2].textContent).toBe('1')
    expect(values[3].textContent).toBe('0:20')
    expect(values[4].textContent).toBe('100%')
  })

  it('should use hud.parts_delivered as the localised label of the first metric', () => {
    // WHEN we query the first metric label
    const labels = parent.querySelectorAll('.ui-hud-metric-label')

    // THEN the first label should show the English translation of
    // `hud.parts_delivered` ("Parts") — see src/locales/en.json.
    expect(labels[0].textContent).toBe('Parts')
    // AND the label should store the correct i18n key for language switching
    expect((labels[0] as HTMLElement).dataset.i18nKey).toBe('hud.parts_delivered')
  })

  it('should format time as minutes:seconds with zero-padded seconds', () => {
    // GIVEN a fresh HUD
    const ownParent = document.createElement('div')
    const hud = new HUD(ownParent)

    // WHEN update is called with 125 seconds elapsed
    hud.update({
      partsDelivered: 0,
      assembliesDelivered: 0,
      robotsCompleted: 0,
      timeElapsed: 125,
      qualityPercent: 100,
      outputsDelivered: 0,
    })

    // THEN formatted time should be "2:05" — index 3 of the five rows.
    const values = ownParent.querySelectorAll('.ui-hud-metric-value')
    expect(values[3].textContent).toBe('2:05')
  })
})
