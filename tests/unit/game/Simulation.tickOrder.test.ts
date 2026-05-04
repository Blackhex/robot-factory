import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { Simulation } from '../../../src/game/Simulation'
import type { Recipe } from '../../../src/game/Recipe'

// --- Helpers ---

function tickN(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) {
    sim.tick()
  }
}

/** A minimal fabricator recipe with configurable processingTicks. */
function quickFabRecipe(ticks: number): Recipe {
  return {
    id: `test_fab_${ticks}t`,
    inputs: [],
    outputs: [{ type: 'wheel_small', quantity: 1 }],
    processingTicks: ticks,
    machineType: 'part_fabricator',
  }
}

/**
 * Build a chain of N belt segments along +X starting at (startX, 0).
 * Segment i runs from (startX+i, 0) → (startX+i+1, 0).
 */
function buildBeltChain(
  sim: Simulation,
  n: number,
  speed = 1.0,
  startX = 0,
): ConveyorBelt[] {
  const belts: ConveyorBelt[] = []
  for (let i = 0; i < n; i++) {
    const belt = new ConveyorBelt(
      `seg${i}`,
      startX + i,
      0,
      startX + i + 1,
      0,
      speed,
    )
    sim.addBelt(belt)
    belts.push(belt)
  }
  return belts
}

// --- Tests ---

describe('Simulation — tick order symmetry', () => {
  let sim: Simulation

  beforeEach(() => {
    resetItemIdCounter()
    sim = new Simulation() // tickRate=10, dt=0.1
  })

  it('machine-placed item starts at position 0 after the tick it was placed', () => {
    // GIVEN: fabricator with processingTicks=1 connected to a belt.
    const fab = new Machine('fab', 'part_fabricator')
    fab.setRecipe(quickFabRecipe(1))
    fab.start()
    sim.addMachine(fab)

    const belt = new ConveyorBelt('seg0', 0, 0, 1, 0, 1.0)
    sim.addBelt(belt)
    sim.setMachineOutputBelt('fab', 'seg0')

    // Tick 1: idle → start processing (timer=1).
    sim.tick()
    expect(belt.isEmpty()).toBe(true) // no item yet

    // Tick 2: timer-- → 0 → produce item. Transfer places on belt.
    // NEW order: transfer runs AFTER advance → item stays at pos=0.0.
    // OLD order: transfer runs BEFORE advance → item advanced to pos=0.1.
    sim.tick()

    // THEN: item should be at position 0, NOT 0.1.
    expect(belt.getItemCount()).toBe(1)
    const item = belt.getItems()[0]
    expect(item.type).toBe('wheel_small')
    expect(item.positionOnBelt).toBeCloseTo(0.0, 10)
  })

  it('machine-placed and handover items are at symmetric positions', () => {
    // GIVEN: fabricator → seg0 → seg1 (2-segment chain).
    // processingTicks=5: under the capacity-2 contract (MIN_SPACING=0.5)
    // the machine emits every 5 ticks at steady state because seg0 can hold
    // a second item once the leader has advanced ≥0.5.
    const fab = new Machine('fab', 'part_fabricator')
    fab.setRecipe(quickFabRecipe(5))
    fab.start()
    sim.addMachine(fab)

    const belts = buildBeltChain(sim, 2, 1.0, 0)
    sim.setMachineOutputBelt('fab', 'seg0')

    // NEW order timeline (capacity-2 contract, with FP-tolerant canFitAt):
    //   Call 6:   item1 produced → seg0 @ 0.0.
    //   Calls 7–10: item1 advances 0.1 → 0.4.
    //   Call 11:  advance moves item1 to 0.5; transfer adds item2 @ 0.0
    //             (gap 0.5 ≥ MIN_SPACING). seg0 = [item2@0.0, item1@0.5].
    //   Calls 12–15: pair advances together. The back item picks up sub-ulp
    //             FP drift from `cap = frontPos − MIN_SPACING` (e.g.
    //             0.6 − 0.5 = 0.09999…), reaching ~0.3999… on call 15.
    //   Call 16:  advance: item1 → 1.0; item2 → ~0.4999… (capped against
    //             item1's 1.0). Deliver hands item1 → seg1 @ 0.0. Transfer
    //             of item3 onto seg0 SUCCEEDS: canFitAt's 1e-9 tolerance
    //             absorbs the sub-ulp drift, so |0.4999… − 0| is treated as
    //             ≥ MIN_SPACING. ⇒ seg0 = [item3@0.0, item2@~0.5],
    //                                seg1 = [item1@0.0].
    //
    // The symmetric pair this test guards is (machine-placed item3 on seg0,
    // handed-over item1 on seg1) — both freshly arrived this tick at
    // position 0.0 of their respective segments.
    tickN(sim, 16)

    // THEN: seg0 holds the cap-2 pair (item2 + item3); seg1 holds item1.
    // CONTRACT CHANGE: ConveyorBelt.canFitAt tolerance fix (1e-9) eliminated
    // the asymmetric machine-injection cadence that previously REJECTED the
    // call-16 transfer of item3 (back item sat at 0.4999… < 0.5 strict).
    // Steady-state cadence is now uniform: machine emits every 5 ticks and
    // seg0 reaches its cap-2 occupancy. Previously this asserted
    // belts[0].getItemCount() === 1.
    expect(belts[0].getItemCount()).toBe(2)
    expect(belts[1].getItemCount()).toBe(1)

    // getItems() is sorted ascending by position: index [0] is the back
    // item. On seg0 that's the freshly machine-placed item3; on seg1 it's
    // the only (just-handed-over) item1. Both arrived at position 0.0 of
    // their segments this tick — that is the symmetric pair.
    const itemOnSeg0 = belts[0].getItems()[0]
    const itemOnSeg1 = belts[1].getItems()[0]

    // Key assertion: machine-placed and handover items are BOTH at 0.0,
    // i.e. genuinely symmetric. The bug previously forced the seg0 lead
    // to 0.5 (the cap-2 partner item2) because item3's transfer was
    // rejected, breaking symmetry.
    // CONTRACT CHANGE: previously asserted itemOnSeg0 ≈ 0.5 (the
    // captured reference was item2 at the cap-2 spacing slot, since
    // item3 never landed). With the FP tolerance fix, item3 lands at 0.0
    // and the symmetric (0.0, 0.0) pair is the correct contract.
    expect(itemOnSeg0.positionOnBelt).toBeCloseTo(0.0, 5)
    expect(itemOnSeg1.positionOnBelt).toBeCloseTo(0.0, 10)

    // One tick later: both captured items advance by 0.1 — symmetric
    // drift, as the test name promises.
    // CONTRACT CHANGE: previously asserted itemOnSeg0 ≈ 0.6 (item2's
    // advance from 0.5). Under the fix, the captured seg0 reference is
    // item3, which advances 0.0 → ~0.1.
    sim.tick()
    expect(itemOnSeg0.positionOnBelt).toBeCloseTo(0.1, 5)
    expect(itemOnSeg1.positionOnBelt).toBeCloseTo(0.1, 10)
  })

  it('items are exactly 0.5 cells apart in steady state', () => {
    // GIVEN: fabricator with processingTicks=5, 5-segment chain, speed=1.
    const fab = new Machine('fab', 'part_fabricator')
    fab.setRecipe(quickFabRecipe(5))
    fab.start()
    sim.addMachine(fab)

    const belts = buildBeltChain(sim, 5, 1.0, 0)
    sim.setMachineOutputBelt('fab', 'seg0')

    // WHEN: run 120 ticks to reach steady state.
    tickN(sim, 120)

    // THEN: collect all items across the chain and measure gaps.
    const positions: number[] = []
    for (let i = 0; i < belts.length; i++) {
      for (const item of belts[i].getItems()) {
        positions.push(i + item.positionOnBelt)
      }
    }
    positions.sort((a, b) => b - a) // descending (front item first)

    // At least 2 items needed to measure a gap.
    expect(positions.length).toBeGreaterThanOrEqual(2)

    // Every consecutive pair should be exactly MIN_ITEM_SPACING cells apart.
    for (let i = 0; i < positions.length - 1; i++) {
      const gap = positions[i] - positions[i + 1]
      // Capacity raised to 2 (min-spacing 0.5): steady-state spacing is 0.5 cells, not 1.0.
      expect(gap).toBeCloseTo(ConveyorBelt.MIN_ITEM_SPACING, 5)
    }
  })

  it('transferMachineOutputs runs after deliverItems', () => {
    // GIVEN: fabricator → seg0 → seg1.
    //   seg0 has an item at pos=0.9. Machine has an item ready in outputSlot.
    const fab = new Machine('fab', 'part_fabricator')
    fab.setRecipe(quickFabRecipe(1))
    sim.addMachine(fab)

    const seg0 = new ConveyorBelt('seg0', 0, 0, 1, 0, 1.0)
    const seg1 = new ConveyorBelt('seg1', 1, 0, 2, 0, 1.0)
    sim.addBelt(seg0)
    sim.addBelt(seg1)
    sim.setMachineOutputBelt('fab', 'seg0')

    // Manually place an item near the end of seg0.
    const existingItem = createItem('wheel_small')
    seg0.insertItemAt(existingItem, 0.9)

    // Manually put an item in the machine's output slot.
    const machineItem = createItem('wheel_small')
    fab.outputSlot = machineItem

    // WHEN: tick once.
    //   NEW order:
    //     advanceBelts:  existingItem 0.9 → 1.0.
    //     deliverItems:  existingItem handed to seg1 at 0.0. seg0 freed.
    //     transferOutputs: seg0 empty → machineItem placed at pos=0.0.
    //   OLD order:
    //     transferOutputs: seg0 occupied → FAIL. machineItem stays in slot.
    //     advanceBelts:  existingItem 0.9 → 1.0.
    //     deliverItems:  existingItem handed to seg1. seg0 freed.
    //     ⇒ machineItem still in outputSlot, seg0 empty.
    sim.tick()

    // THEN: existing item should have been delivered to seg1.
    expect(seg1.getItemCount()).toBe(1)
    expect(seg1.getItems()[0].id).toBe(existingItem.id)

    // THEN: machine's output item should now be on seg0 at pos=0.0.
    // OLD order fails here — machineItem is still in the machine's output slot.
    expect(seg0.getItemCount()).toBe(1)
    expect(seg0.getItems()[0].id).toBe(machineItem.id)
    expect(seg0.getItems()[0].positionOnBelt).toBeCloseTo(0.0, 10)

    // THEN: machine's output slot should be cleared.
    expect(fab.outputSlot).toBeNull()
  })
})
