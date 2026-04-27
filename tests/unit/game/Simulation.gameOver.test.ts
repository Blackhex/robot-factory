import { describe, it, expect, beforeEach } from 'vitest'
import { resetItemIdCounter } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'
import { Simulation } from '../../../src/game/Simulation'
import type {
  MachineType,
  SimulationEvent,
  SimulationEventType,
} from '../../../src/game/types'

// --- Helpers ---

function tickN(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) {
    sim.tick()
  }
}

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

/**
 * Build a sim with a source fabricator, one belt segment, and a
 * destination machine. Source produces wheel_small. Caller chooses
 * destination type and recipe.
 *
 *   src(0,0) ── b1 ── dst(1,0)
 */
interface PipelineHandles {
  sim: Simulation
  src: Machine
  dst: Machine
  belt: ConveyorBelt
  events: { type: SimulationEventType | 'game_over'; event: SimulationEvent }[]
}

function buildPipeline(
  destType: MachineType,
  destRecipe: Recipe | null,
): PipelineHandles {
  const sim = new Simulation()
  const src = new Machine('src', 'part_fabricator')
  src.setRecipe(recipe('wheel_press_small'))
  const dst = new Machine('dst', destType)
  if (destRecipe !== null) {
    dst.setRecipe(destRecipe)
  }
  sim.addMachine(src)
  sim.addMachine(dst)
  sim.setMachinePosition('src', 0, 0)
  sim.setMachinePosition('dst', 1, 0)
  const belt = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
  sim.addBelt(belt)
  sim.setMachineOutputBelt('src', 'b1')

  // Capture every event that fires (including the new 'game_over' type).
  const events: { type: SimulationEventType | 'game_over'; event: SimulationEvent }[] = []
  const captured: (SimulationEventType | 'game_over')[] = [
    'item_produced',
    'item_delivered',
    'output_delivered',
    'machine_state_changed',
    'order_complete',
    'belt_jam',
    'machine_idle',
    'tick',
    'game_over',
  ]
  for (const t of captured) {
    sim.on(t as SimulationEventType, (e) => events.push({ type: t, event: e }))
  }

  return { sim, src, dst, belt, events }
}

// --- Tests ---

describe('Simulation game-over on unconsumable delivery', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('starts with sim.gameOver === null', () => {
    // GIVEN
    const sim = new Simulation()

    // THEN
    expect(sim.gameOver).toBeNull()
  })

  it('fires game_over when a belt delivers to a fabricator with no recipe', () => {
    // GIVEN — destination is a part_fabricator without any recipe.
    const { sim, dst, events } = buildPipeline('part_fabricator', null)

    // WHEN — run long enough for the source to produce + belt to deliver.
    //   wheel_press_small = 5 processing ticks; belt length 1.0 / speed 1.0
    //   at dt=0.1 ⇒ 10 ticks to traverse. 50 is comfortably enough.
    tickN(sim, 50)

    // THEN — game-over has been recorded.
    expect(sim.gameOver).not.toBeNull()
    expect(sim.gameOver!.reason).toBe('unconsumable_input')
    expect(sim.gameOver!.machineId).toBe(dst.id)
    expect(sim.gameOver!.itemType).toBe('wheel_small')
    expect(typeof sim.gameOver!.itemId).toBe('string')

    // THEN — sim is paused.
    expect(sim.paused).toBe(true)

    // THEN — exactly one game_over event was emitted.
    const gameOverEvents = events.filter((e) => e.type === 'game_over')
    expect(gameOverEvents).toHaveLength(1)
    expect(gameOverEvents[0].event.data['reason']).toBe('unconsumable_input')
    expect(gameOverEvents[0].event.data['machineId']).toBe(dst.id)
    expect(gameOverEvents[0].event.data['itemType']).toBe('wheel_small')

    // WHEN — run more ticks; sim is paused so they should be no-ops.
    const snapshot = { ...sim.gameOver }
    const tickAtPause = sim.currentTick
    tickN(sim, 100)

    // THEN — game-over snapshot unchanged, no new events fired,
    //         tick counter does not advance because sim.tick() is a no-op.
    expect(sim.gameOver).toEqual(snapshot)
    expect(sim.currentTick).toBe(tickAtPause)
    expect(events.filter((e) => e.type === 'game_over')).toHaveLength(1)
  })

  it('fires game_over when an assembler receives an item not in its recipe inputs', () => {
    // GIVEN — assemble_robot_worker requires chassis_heavy; the source
    //   produces wheel_small, which is NOT in that recipe's inputs.
    const dstRecipe = recipe('assemble_robot_worker')
    expect(dstRecipe.inputs.some((i) => i.type === 'wheel_small')).toBe(false)
    const { sim, dst } = buildPipeline('assembler', dstRecipe)

    // WHEN
    tickN(sim, 50)

    // THEN
    expect(sim.gameOver).not.toBeNull()
    expect(sim.gameOver!.reason).toBe('unconsumable_input')
    expect(sim.gameOver!.machineId).toBe(dst.id)
    expect(sim.gameOver!.itemType).toBe('wheel_small')
    expect(sim.paused).toBe(true)
  })

  it('does NOT fire game_over when the destination is factory_output', () => {
    // GIVEN
    const { sim, events } = buildPipeline('factory_output', null)

    // WHEN
    tickN(sim, 200)

    // THEN
    expect(sim.gameOver).toBeNull()
    expect(sim.paused).toBe(false)
    expect(events.filter((e) => e.type === 'game_over')).toHaveLength(0)

    // SANITY — at least one item should have been delivered to the output.
    expect(sim.outputsDelivered).toBeGreaterThan(0)
  })

  it('does NOT fire game_over when the destination accepts the item type', () => {
    // GIVEN — assemble_drivetrain_basic accepts wheel_small.
    const dstRecipe = recipe('assemble_drivetrain_basic')
    expect(dstRecipe.inputs.some((i) => i.type === 'wheel_small')).toBe(true)
    const { sim, events } = buildPipeline('assembler', dstRecipe)

    // WHEN
    tickN(sim, 200)

    // THEN
    expect(sim.gameOver).toBeNull()
    expect(sim.paused).toBe(false)
    expect(events.filter((e) => e.type === 'game_over')).toHaveLength(0)
  })

  it('leaves the offending item on the belt (not in destination input slots) after game_over', () => {
    // GIVEN — same fabricator-with-no-recipe destination as test 7.
    const { sim, dst, belt } = buildPipeline('part_fabricator', null)

    // WHEN
    tickN(sim, 50)

    // THEN — game-over fired.
    expect(sim.gameOver).not.toBeNull()

    // THEN — destination has NOT received the item.
    expect(dst.inputSlots).toHaveLength(0)

    // THEN — the offending item is still on the belt at its end.
    const itemsOnBelt = belt.getItems()
    expect(itemsOnBelt.length).toBeGreaterThanOrEqual(1)
    const offending = itemsOnBelt.find((i) => i.id === sim.gameOver!.itemId)
    expect(offending).toBeDefined()
    expect(offending!.type).toBe('wheel_small')
    // Item is parked at (or past) the end of the segment.
    expect(offending!.positionOnBelt).toBeGreaterThanOrEqual(1.0 - 1e-9)

    // THEN — no delivery counters incremented for it.
    expect(sim.itemsDelivered).toBe(0)
    expect(sim.outputsDelivered).toBe(0)
  })

  describe('pass-through machines never trigger game_over', () => {
    const passThroughTypes: MachineType[] = ['quality_checker', 'splitter', 'recycler']
    for (const type of passThroughTypes) {
      it(`destination=${type} does not fire game_over`, () => {
        // GIVEN
        const { sim, events } = buildPipeline(type, null)

        // WHEN
        tickN(sim, 200)

        // THEN
        expect(sim.gameOver).toBeNull()
        expect(sim.paused).toBe(false)
        expect(events.filter((e) => e.type === 'game_over')).toHaveLength(0)
      })
    }
  })
})
