import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { Simulation } from '../../../src/game/Simulation'

/**
 * Tests for cell-uniform traversal time across mixed-length cells (full
 * straight cells L=1.0 and corner cells L≈0.871). Contract: every cell
 * is traversed in the same number of ticks regardless of its arc
 * length.
 *
 * Half-cells (L=0.5) do not exist as a topology case — every straight
 * cell is L=1.0 — so this test only exercises the two surviving cell
 * types. The ConveyorBelt class API itself still accepts arbitrary L
 * (covered separately by ConveyorBelt.driftAndLength).
 *
 * At speed 1, dt=0.1 → 10 ticks per cell for all surviving cell types.
 *
 * Handover overshoot is a plain normalized position (pos − 1.0), placed
 * directly on the receiving belt — no multiplication/division by arc
 * length.
 */

// Corner-cell arc length: 2*S + (π/2)*R where S=0.2, R=0.3.
const S = 0.2
const ARC_R = 0.3
const CORNER_LEN = 2 * S + (Math.PI / 2) * ARC_R // ≈ 0.871238898

describe('Simulation — cell-uniform traversal time across mixed-length cells', () => {
  let sim: Simulation

  beforeEach(() => {
    resetItemIdCounter()
    sim = new Simulation() // tickRate=10 → dt=0.1
  })

  it('all surviving cell types (full, corner) are traversed in exactly 10 ticks at speed 1', () => {
    // GIVEN: two independent belts — one full straight, one corner —
    // each with an item at position 0.
    const fullBelt = new ConveyorBelt('full', 2, 0, 3, 0, 1.0, 1.0)
    const cornerBelt = new ConveyorBelt('corner', 4, 0, 5, 0, 1.0, CORNER_LEN)

    sim.addBelt(fullBelt)
    sim.addBelt(cornerBelt)

    const itemFull = createItem('wheel_small')
    const itemCorner = createItem('wheel_small')

    fullBelt.insertItemAt(itemFull, 0)
    cornerBelt.insertItemAt(itemCorner, 0)

    // WHEN: 9 ticks — all items should be at position 0.9, NOT yet at 1.0
    for (let t = 0; t < 9; t++) sim.tick()

    // THEN: after 9 ticks, position = 9 × 0.1 = 0.9 for ALL cell types
    expect(itemFull.positionOnBelt).toBeCloseTo(0.9, 10)
    expect(itemCorner.positionOnBelt).toBeCloseTo(0.9, 10)

    // WHEN: 1 more tick (10 total)
    sim.tick()

    // THEN: after 10 ticks, position = 10 × 0.1 = 1.0 for ALL cell types
    expect(itemFull.positionOnBelt).toBeCloseTo(1.0, 10)
    expect(itemCorner.positionOnBelt).toBeCloseTo(1.0, 10)
  })

  it('overshoot is carried as plain normalized position across a corner→full handover', () => {
    // GIVEN: belt[0] L=CORNER_LEN, belt[1] L=1.0; speed=1, dt=0.1
    const belt0 = new ConveyorBelt('seg0', 0, 0, 1, 0, 1.0, CORNER_LEN)
    const belt1 = new ConveyorBelt('seg1', 1, 0, 2, 0, 1.0, 1.0)
    sim.addBelt(belt0)
    sim.addBelt(belt1)

    const item = createItem('wheel_small')
    belt0.insertItemAt(item, 0.95)

    // WHEN: one tick. advance: 0.95 + 0.1 = 1.05. Overshoot = 0.05.
    // acceptHandover on belt1: position = 0.05 (plain, no division).
    sim.tick()

    // THEN: item moved to belt1 at position 0.05
    expect(belt0.getItemCount()).toBe(0)
    expect(belt1.getItemCount()).toBe(1)
    expect(belt1.getItems()[0].positionOnBelt).toBeCloseTo(0.05, 10)
  })

  it('overshoot is carried as plain normalized position across a full→corner handover', () => {
    // GIVEN: belt[0] L=1.0, belt[1] L=CORNER_LEN; speed=1, dt=0.1
    const belt0 = new ConveyorBelt('seg0', 0, 0, 1, 0, 1.0, 1.0)
    const belt1 = new ConveyorBelt('seg1', 1, 0, 2, 0, 1.0, CORNER_LEN)
    sim.addBelt(belt0)
    sim.addBelt(belt1)

    const item = createItem('wheel_small')
    belt0.insertItemAt(item, 0.95)

    // WHEN: one tick. advance: 0.95 + 0.1 = 1.05. Overshoot = 0.05.
    // acceptHandover on belt1: position = 0.05 (plain, no division).
    sim.tick()

    // THEN: item moved to belt1 at position 0.05 (NOT 0.05/CORNER_LEN)
    expect(belt0.getItemCount()).toBe(0)
    expect(belt1.getItemCount()).toBe(1)
    expect(belt1.getItems()[0].positionOnBelt).toBeCloseTo(0.05, 10)
  })
})
