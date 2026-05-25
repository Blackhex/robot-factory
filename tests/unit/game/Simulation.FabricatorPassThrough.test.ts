import { describe, it, expect, beforeEach } from 'vitest'
import { resetItemIdCounter } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { Simulation } from '../../../src/game/Simulation'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'

// Integration coverage for the USER-CONFIRMED requirement change:
// a Fabricator passes through arrivals of its configured output type
// (NOT a Game Over), but arrivals of any other type — or any arrival
// at all when no recipe is set — remain a Game Over of reason
// 'unconsumable_input'.

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

function tickN(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) sim.tick()
}

interface Handles {
  sim: Simulation
  src: Machine
  dst: Machine
  belt: ConveyorBelt
}

/**
 * Build a sim with `src` (fabricator producing `srcRecipeId`) feeding
 * `dst` (a Fabricator optionally configured for `dstRecipeId`).
 *
 *   src(0,0) ── b1 ── dst(1,0)
 */
function buildFabricatorPipeline(
  srcRecipeId: string,
  dstRecipeId: string | null,
): Handles {
  const sim = new Simulation()
  const src = new Machine('src', 'part_fabricator')
  src.setRecipe(recipe(srcRecipeId))
  src.start()

  const dst = new Machine('dst', 'part_fabricator')
  if (dstRecipeId !== null) {
    dst.setRecipe(recipe(dstRecipeId))
    dst.start()
  }

  sim.addMachine(src)
  sim.addMachine(dst)
  sim.setMachinePosition('src', 0, 0)
  sim.setMachinePosition('dst', 1, 0)
  const belt = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
  sim.addBelt(belt)
  sim.setMachineOutputBelt('src', 'b1')

  return { sim, src, dst, belt }
}

describe('Simulation: Fabricator pass-through (integration)', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('does NOT trip game-over when an output-type item arrives at a configured Fabricator; the matching item ends up in the output slot (queued first, then moved on a subsequent tick)', () => {
    // GIVEN — destination Fabricator is configured for wheel_press_small;
    // source produces wheel_small (matches dst's output type).
    const { sim, dst } = buildFabricatorPipeline('wheel_press_small', 'wheel_press_small')

    // WHEN — long enough for the source to produce + belt to deliver one
    // item, then for `dst` to run another tick that moves the queued
    // matching input into its output slot.
    tickN(sim, 50)

    // THEN — no game-over.
    expect(sim.gameOver).toBeNull()
    expect(sim.paused).toBe(false)

    // THEN — output slot holds a wheel_small (moved from the input queue
    // by the prefer-consume rule).
    expect(dst.outputSlot).not.toBeNull()
    expect(dst.outputSlot!.type).toBe('wheel_small')

    // THEN — any further deliveries queue in inputSlots (matching items
    // now queue instead of being rejected by output-slot backpressure).
    // Bounded by capacity, never exceeded.
    expect(dst.inputSlots.length).toBeLessThanOrEqual(dst.maxInputSlots)
    for (const item of dst.inputSlots) {
      expect(item.type).toBe('wheel_small')
    }

    // THEN — destination never entered a processing cycle: with matching
    // items always available, the prefer-consume rule keeps it idle.
    expect(['idle', 'blocked']).toContain(dst.state)
    expect(dst.processingTimer).toBe(0)
  })

  it('trips game-over with reason="unconsumable_input" when a non-output-type item arrives at a configured Fabricator', () => {
    // GIVEN — destination Fabricator is configured for wheel_press_small
    // (output type wheel_small); source produces wheel_medium.
    const { sim, dst } = buildFabricatorPipeline('wheel_press_medium', 'wheel_press_small')

    // WHEN
    tickN(sim, 50)

    // THEN
    expect(sim.gameOver).not.toBeNull()
    expect(sim.gameOver!.reason).toBe('unconsumable_input')
    expect(sim.gameOver!.machineId).toBe(dst.id)
    expect(sim.gameOver!.itemType).toBe('wheel_medium')
    expect(sim.paused).toBe(true)
  })

  it('trips game-over with reason="unconsumable_input" when ANY item arrives at a Fabricator with no recipe set', () => {
    // GIVEN — destination Fabricator has NO recipe; source produces wheel_small.
    const { sim, dst } = buildFabricatorPipeline('wheel_press_small', null)
    expect(dst.currentRecipe).toBeNull()

    // WHEN
    tickN(sim, 50)

    // THEN
    expect(sim.gameOver).not.toBeNull()
    expect(sim.gameOver!.reason).toBe('unconsumable_input')
    expect(sim.gameOver!.machineId).toBe(dst.id)
    expect(sim.gameOver!.itemType).toBe('wheel_small')
    expect(sim.paused).toBe(true)
  })
})
