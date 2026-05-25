import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import type { Item } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { ItemDeliveryEngine } from '../../../src/game/ItemDeliveryEngine'

/**
 * RED-state spec for the per-category delivery counts surfaced by
 * `ItemDeliveryEngine.DeliveryResult`:
 *
 *   - `partsDelivered`       — incremented for non-defective part items
 *                              delivered to a `factory_output`.
 *   - `assembliesDelivered`  — same, for assembly items.
 *   - `robotsDelivered`      — same, for robot items. Mirrors the
 *                              existing `robotsProduced` legacy counter.
 *
 * The legacy counters `outputsDelivered` and `robotsProduced` keep
 * their current semantics. Defective items routed to `factory_output`
 * still bump only `defectsDiscarded` — never any of the three new
 * category counters.
 */

function defective(item: Item): Item {
  item.isDefective = true
  return item
}

interface Harness {
  belt: ConveyorBelt
  output: Machine
  engine: ItemDeliveryEngine
}

/**
 * 1-cell belt from (0,0) → (1,0) feeding a `factory_output` at (1,0).
 * Items put on the belt are advanced to position 1.0 before each
 * `engine.deliver()` call so `belt.getReadyItems()` returns them.
 */
function buildHarness(): Harness {
  const belt = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
  const output = new Machine('out1', 'factory_output')
  output.start()
  const belts = new Map<string, ConveyorBelt>([[belt.id, belt]])
  const machines = new Map<string, { machine: Machine; x: number; z: number }>([
    [output.id, { machine: output, x: 1, z: 0 }],
  ])
  const engine = new ItemDeliveryEngine({
    getBelts: () => belts,
    findMachineAt: (x, z) => {
      for (const { machine, x: mx, z: mz } of machines.values()) {
        if (mx === x && mz === z) return machine
      }
      return undefined
    },
    findBeltStartingAt: (x, z) => {
      for (const b of belts.values()) {
        if (b.fromX === x && b.fromZ === z) return b
      }
      return undefined
    },
  })
  return { belt, output, engine }
}

function advanceBeltToEnd(belt: ConveyorBelt): void {
  // 11 ticks at default dt=0.1 with belt speed 1.0 is the same cadence
  // Simulation uses for delivery (see Simulation.test.ts and
  // ShipperDiscardsDefective.test.ts).
  for (let i = 0; i < 11; i++) belt.advance(0.1)
}

describe('ItemDeliveryEngine — per-category delivery counts', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('non-defective part (wheel_small) bumps partsDelivered and outputsDelivered', () => {
    // GIVEN
    const { belt, engine } = buildHarness()
    belt.addItem(createItem('wheel_small'))
    advanceBeltToEnd(belt)

    // WHEN
    const result = engine.deliver(0, null)

    // THEN
    expect(result.partsDelivered).toBe(1)
    expect(result.assembliesDelivered).toBe(0)
    expect(result.robotsDelivered).toBe(0)
    // Legacy counters unchanged
    expect(result.outputsDelivered).toBe(1)
    expect(result.robotsProduced).toBe(0)
    expect(result.defectsDiscarded).toBe(0)
  })

  it('non-defective part (wheel_small) bumps partsDelivered', () => {
    // GIVEN
    const { belt, engine } = buildHarness()
    belt.addItem(createItem('wheel_small'))
    advanceBeltToEnd(belt)

    // WHEN
    const result = engine.deliver(0, null)

    // THEN
    expect(result.partsDelivered).toBe(1)
    expect(result.assembliesDelivered).toBe(0)
    expect(result.robotsDelivered).toBe(0)
    expect(result.outputsDelivered).toBe(1)
  })

  it('non-defective assembly (drivetrain_basic) bumps assembliesDelivered', () => {
    // GIVEN
    const { belt, engine } = buildHarness()
    belt.addItem(createItem('drivetrain_basic'))
    advanceBeltToEnd(belt)

    // WHEN
    const result = engine.deliver(0, null)

    // THEN
    expect(result.partsDelivered).toBe(0)
    expect(result.assembliesDelivered).toBe(1)
    expect(result.robotsDelivered).toBe(0)
    expect(result.outputsDelivered).toBe(1)
    expect(result.robotsProduced).toBe(0)
  })

  it('non-defective robot (robot_worker) bumps robotsDelivered AND legacy robotsProduced', () => {
    // GIVEN
    const { belt, engine } = buildHarness()
    belt.addItem(createItem('robot_worker'))
    advanceBeltToEnd(belt)

    // WHEN
    const result = engine.deliver(0, null)

    // THEN
    expect(result.partsDelivered).toBe(0)
    expect(result.assembliesDelivered).toBe(0)
    expect(result.robotsDelivered).toBe(1)
    expect(result.outputsDelivered).toBe(1)
    // Legacy counter must continue to increment in parallel
    expect(result.robotsProduced).toBe(1)
  })

  it('defective part (wheel_small) bumps defectsDiscarded only — no category bump', () => {
    // GIVEN
    const { belt, engine } = buildHarness()
    belt.addItem(defective(createItem('wheel_small')))
    advanceBeltToEnd(belt)

    // WHEN
    const result = engine.deliver(0, null)

    // THEN
    expect(result.defectsDiscarded).toBe(1)
    expect(result.partsDelivered).toBe(0)
    expect(result.assembliesDelivered).toBe(0)
    expect(result.robotsDelivered).toBe(0)
    expect(result.outputsDelivered).toBe(0)
    expect(result.robotsProduced).toBe(0)
  })

  it('defective robot bumps defectsDiscarded only — no robotsDelivered bump', () => {
    // GIVEN
    const { belt, engine } = buildHarness()
    belt.addItem(defective(createItem('robot_worker')))
    advanceBeltToEnd(belt)

    // WHEN
    const result = engine.deliver(0, null)

    // THEN
    expect(result.defectsDiscarded).toBe(1)
    expect(result.robotsDelivered).toBe(0)
    expect(result.robotsProduced).toBe(0)
    expect(result.outputsDelivered).toBe(0)
  })
})
