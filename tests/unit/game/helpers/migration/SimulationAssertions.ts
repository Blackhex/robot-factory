import { expect } from 'vitest'
import { Factory } from '../../../../../src/game/Factory'
import { Simulation } from '../../../../../src/game/Simulation'

function expectedSimSegmentIds(factory: Factory): Set<string> {
  const ids = new Set<string>()
  for (const info of factory.getBelts()) {
    for (let i = 0; i < info.path.length - 1; i++) {
      ids.add(`${info.id}_seg${i}`)
    }
  }
  return ids
}

export function expectSimBeltsMatchFactory(
  factory: Factory,
  sim: Simulation,
): void {
  const expected = expectedSimSegmentIds(factory)
  const actual = new Set<string>(sim.getBelts().keys())
  for (const id of actual) {
    expect(
      expected.has(id),
      `sim has stale belt segment "${id}" with no matching factory belt`,
    ).toBe(true)
  }
  for (const id of expected) {
    expect(
      actual.has(id),
      `sim is missing belt segment "${id}" present in factory`,
    ).toBe(true)
  }
}