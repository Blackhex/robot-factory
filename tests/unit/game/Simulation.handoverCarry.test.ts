import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { Simulation } from '../../../src/game/Simulation'

/**
 * RED tests for end-to-end belt handover overshoot-carry.
 *
 * Each tick: `transferMachineOutputs → advanceBelts → deliverItems`.
 * When an item finishes belt[A] mid-tick and is delivered to belt[B],
 * the position on belt[B] must equal `(prePos + speed*dt) - 1.0` — the
 * overshoot — NOT 0. Otherwise the renderer sees a "pause" at every
 * cell boundary and a long-running stream visibly distorts.
 */

/**
 * Build a chain of N belts laid out along +X starting from (startX, 0).
 * Belt i runs from (startX + i, 0) → (startX + i + 1, 0).
 */
function buildBeltChain(sim: Simulation, n: number, speed = 1.0, startX = 0): ConveyorBelt[] {
  const belts: ConveyorBelt[] = []
  for (let i = 0; i < n; i++) {
    const belt = new ConveyorBelt(`b${i}`, startX + i, 0, startX + i + 1, 0, speed)
    sim.addBelt(belt)
    belts.push(belt)
  }
  return belts
}

/**
 * Compute the global arc-length progress of an item across a chain of
 * belts: `index_of_current_belt + positionOnBelt`. Returns -1 if the
 * item is not on any belt in the chain.
 */
function globalProgress(belts: ConveyorBelt[], itemId: string): number {
  for (let i = 0; i < belts.length; i++) {
    const found = belts[i].getItems().find((it) => it.id === itemId)
    if (found) return i + found.positionOnBelt
  }
  return -1
}

describe('Simulation — belt handover carries overshoot', () => {
  let sim: Simulation

  beforeEach(() => {
    resetItemIdCounter()
    sim = new Simulation() // tickRate = 10 → dt = 0.1
  })

  it('should place the item on the next belt at the overshoot offset, not 0', () => {
    // GIVEN: a 2-belt chain with an item near the end of belt[0]
    const belts = buildBeltChain(sim, 2, /*speed*/ 1.0)
    const item = createItem('wheel_small')
    belts[0].insertItemAt(item, 0.95)

    // WHEN: one tick — speed*dt = 0.1, so the item crosses by 0.05
    sim.tick()

    // THEN: item must now sit on belt[1] at positionOnBelt 0.05
    expect(belts[0].getItemCount()).toBe(0)
    expect(belts[1].getItemCount()).toBe(1)
    expect(belts[1].getItems()[0].id).toBe(item.id)
    expect(belts[1].getItems()[0].positionOnBelt).toBeCloseTo(0.05, 10)
  })

  it('should advance a single item across two belts with constant per-tick delta', () => {
    // GIVEN: a 2-belt chain, item placed at start of belt[0]
    const belts = buildBeltChain(sim, 2, /*speed*/ 1.0)
    const item = createItem('wheel_small')
    belts[0].insertItemAt(item, 0)

    // WHEN: walk the item from start of belt[0] to past the end of
    // belt[1], capturing global progress every tick.
    const progressByTick: number[] = []
    progressByTick.push(globalProgress(belts, item.id))
    // 19 ticks: 0.0 → 1.9, item still on belt[1] (item is delivered to a
    // machine or stays on belt[1] since no machine at (2,0)). After tick
    // count > 20, item would try to deliver but no destination exists, so
    // it parks at end of belt[1].
    for (let t = 0; t < 19; t++) {
      sim.tick()
      const gp = globalProgress(belts, item.id)
      if (gp < 0) break
      progressByTick.push(gp)
    }

    // THEN: each consecutive tick must have advanced global progress by
    // EXACTLY 0.1 — no pauses at the belt[0]→belt[1] boundary.
    for (let i = 1; i < progressByTick.length; i++) {
      const delta = progressByTick[i] - progressByTick[i - 1]
      expect(delta).toBeCloseTo(0.1, 10)
    }
  })

  it('should preserve uniform spacing for a stream across a long belt chain', () => {
    // GIVEN: a 5-belt chain. We inject 3 items at start of belt[0]
    // exactly 10 ticks apart (one full cell of arc length apart) so they
    // all fit under the one-item-per-cell rule.
    const belts = buildBeltChain(sim, 5, /*speed*/ 1.0)
    const items = [
      createItem('wheel_small'),
      createItem('wheel_small'),
      createItem('wheel_small'),
    ]

    // Inject item 0 immediately, then one every 10 ticks.
    const injectionPlan: Array<{ tick: number; item: typeof items[number] }> = [
      { tick: 0, item: items[0] },
      { tick: 10, item: items[1] },
      { tick: 20, item: items[2] },
    ]

    // Run 50 ticks total. At each tick, perform any scheduled injection
    // BEFORE the tick advances belts (mirroring how a producer machine
    // would have its output transferred during transferMachineOutputs).
    for (let t = 0; t < 50; t++) {
      const due = injectionPlan.find((p) => p.tick === t)
      if (due) belts[0].insertItemAt(due.item, 0)
      sim.tick()
    }

    // WHEN: collect each item's global progress
    const progresses = items
      .map((it) => globalProgress(belts, it.id))
      .filter((gp) => gp >= 0)

    // THEN: all three items must still be on the chain (none delivered
    // since no destination machine exists at (5, 0)) AND their global
    // progress values must be exactly 1.0 apart, in order.
    expect(progresses).toHaveLength(3)
    // progresses[0] is the LEADING item (greatest global progress).
    const sorted = [...progresses].sort((a, b) => b - a)
    expect(sorted[0] - sorted[1]).toBeCloseTo(1.0, 10)
    expect(sorted[1] - sorted[2]).toBeCloseTo(1.0, 10)
  })

  it('should preserve uniform spacing across a chain regardless of belt insertion order', () => {
    // GIVEN: a 4-belt chain laid out (0,0)→(1,0)→(2,0)→(3,0)→(4,0),
    // but inserted into the simulation in REVERSE order (b3 first, b0
    // last). This pins the order-independence of deliverItems(): the
    // fixed-point delivery loop must NOT rely on Map insertion order.
    const speed = 1.0
    const b0 = new ConveyorBelt('b0', 0, 0, 1, 0, speed)
    const b1 = new ConveyorBelt('b1', 1, 0, 2, 0, speed)
    const b2 = new ConveyorBelt('b2', 2, 0, 3, 0, speed)
    const b3 = new ConveyorBelt('b3', 3, 0, 4, 0, speed)
    // Insert in reverse: b3, b2, b1, b0
    sim.addBelt(b3)
    sim.addBelt(b2)
    sim.addBelt(b1)
    sim.addBelt(b0)
    const belts = [b0, b1, b2, b3]

    const items = [
      createItem('wheel_small'),
      createItem('wheel_small'),
      createItem('wheel_small'),
    ]
    const injectionPlan: Array<{ tick: number; item: typeof items[number] }> = [
      { tick: 0, item: items[0] },
      { tick: 10, item: items[1] },
      { tick: 20, item: items[2] },
    ]

    // Run 40 ticks. No machine at (4,0) so items park on the chain.
    for (let t = 0; t < 40; t++) {
      const due = injectionPlan.find((p) => p.tick === t)
      if (due) belts[0].insertItemAt(due.item, 0)
      sim.tick()
    }

    // THEN: all three items still on the chain with exactly 1.0
    // arc-length spacing.
    const progresses = items
      .map((it) => globalProgress(belts, it.id))
      .filter((gp) => gp >= 0)
    expect(progresses).toHaveLength(3)
    const sorted = [...progresses].sort((a, b) => b - a)
    expect(sorted[0] - sorted[1]).toBeCloseTo(1.0, 10)
    expect(sorted[1] - sorted[2]).toBeCloseTo(1.0, 10)
  })

  it('should conserve total arc-length progress at slow speed across a handover', () => {
    // GIVEN: a 2-belt chain at speed 0.3 (so per-tick delta = 0.03).
    // Place an item at pos 0.99 on belt[0]. After one tick its raw
    // post-advance position is 1.02 — past the boundary by 0.02.
    const belts = buildBeltChain(sim, 2, /*speed*/ 0.3)
    const item = createItem('wheel_small')
    belts[0].insertItemAt(item, 0.99)
    const startProgress = globalProgress(belts, item.id) // 0.99

    // WHEN: one tick
    sim.tick()
    const afterProgress = globalProgress(belts, item.id)

    // THEN: total arc-length advanced must equal speed*dt = 0.03 EXACTLY
    // (modulo float epsilon). This is the no-information-loss invariant
    // — wherever the item ends up (still on belt[0] at 1.02 OR on belt[1]
    // at 0.02), its global progress must be 0.99 + 0.03 = 1.02.
    expect(afterProgress).toBeCloseTo(startProgress + 0.03, 10)
  })
})
