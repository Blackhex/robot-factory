import { describe, it, expect, beforeEach } from 'vitest'
import { resetItemIdCounter } from '../../../src/game/Item'
import { createItem } from '../../../src/game/Item'
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
  src.start()
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

function expectDisabledDestinationGameOver(handles: PipelineHandles): void {
  const { sim, dst, belt, events } = handles

  expect(sim.gameOver).not.toBeNull()
  expect(sim.gameOver!.reason).toBe('unconsumable_input')
  expect(sim.gameOver!.cause).toBe('machine_disabled')
  expect(sim.gameOver!.machineId).toBe(dst.id)
  expect(sim.gameOver!.itemType).toBe('wheel_small')
  expect(sim.paused).toBe(true)

  expect(dst.inputSlots).toHaveLength(0)
  expect(dst.consumedItems).toBe(0)
  expect(sim.itemsDelivered).toBe(0)
  expect(sim.outputsDelivered).toBe(0)

  const gameOverEvents = events.filter((e) => e.type === 'game_over')
  expect(gameOverEvents).toHaveLength(1)
  expect(gameOverEvents[0].event.data['reason']).toBe('unconsumable_input')
  expect(gameOverEvents[0].event.data['cause']).toBe('machine_disabled')
  expect(gameOverEvents[0].event.data['machineId']).toBe(dst.id)

  const itemsOnBelt = belt.getItems()
  expect(itemsOnBelt.length).toBeGreaterThanOrEqual(1)
  const offending = itemsOnBelt.find((item) => item.id === sim.gameOver!.itemId)
  expect(offending).toBeDefined()
  expect(offending!.type).toBe('wheel_small')
  expect(offending!.positionOnBelt).toBeGreaterThanOrEqual(1.0 - 1e-9)
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
    expect(sim.gameOver!.cause).toBeUndefined()
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
    expect(sim.gameOver!.cause).toBeUndefined()
    expect(sim.gameOver!.machineId).toBe(dst.id)
    expect(sim.gameOver!.itemType).toBe('wheel_small')
    expect(sim.paused).toBe(true)
  })

  it('fires game_over when a disabled quality_checker is the belt destination', () => {
    // GIVEN — quality_checker defaults to enabled === false and must reject
    // the first delivered item until explicitly started.
    const handles = buildPipeline('quality_checker', null)

    // WHEN
    tickN(handles.sim, 50)

    // THEN
    expectDisabledDestinationGameOver(handles)
  })

  it('fires game_over when a disabled factory_output is the belt destination', () => {
    // GIVEN — intentional requirement change: Shipper is no longer a passive
    // always-on sink while disabled.
    const handles = buildPipeline('factory_output', null)

    // WHEN
    tickN(handles.sim, 50)

    // THEN
    expectDisabledDestinationGameOver(handles)
  })

  it('keeps Simulation.gameOver.tick aligned with the emitted game_over event tick for a disabled factory_output destination', () => {
    // GIVEN — the same disabled-destination path should report one tick
    // consistently in both the stored fatal state and the event stream.
    const { sim, events } = buildPipeline('factory_output', null)

    // WHEN
    tickN(sim, 50)

    // THEN
    expect(sim.gameOver).not.toBeNull()

    const gameOverEvents = events.filter((event) => event.type === 'game_over')
    expect(gameOverEvents).toHaveLength(1)
    expect(gameOverEvents[0].event.tick).toBe(sim.gameOver!.tick)
  })

  it('fires game_over for a defective item at a disabled factory_output instead of taking the enabled-shipper discard path', () => {
    // GIVEN — contrast with ShipperDiscardsDefective.test.ts: there the
    // shipper is explicitly started before a defective item arrives. Here the
    // shipper stays disabled, so the disabled-destination contract must win.
    const sim = new Simulation()
    const output = new Machine('out1', 'factory_output')
    sim.addMachine(output)
    sim.setMachinePosition('out1', 1, 0)

    const belt = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
    sim.addBelt(belt)

    const item = createItem('robot_worker')
    item.isDefective = true
    belt.addItem(item)

    const discardEvents: SimulationEvent[] = []
    const gameOverEvents: SimulationEvent[] = []
    sim.on('item_discarded', (event) => discardEvents.push(event))
    sim.on('game_over' as SimulationEventType, (event) => gameOverEvents.push(event))

    // WHEN — belt needs 10 ticks at dt=0.1 to reach the destination; use 11
    // so the first delivery attempt has definitely happened.
    tickN(sim, 11)

    // THEN — the first arriving item triggers the disabled-destination
    // failure, stays parked at the belt end, and is NOT discarded.
    expect(output.enabled).toBe(false)
    expect(sim.gameOver).not.toBeNull()
    expect(sim.gameOver).toEqual({
      reason: 'unconsumable_input',
      cause: 'machine_disabled',
      machineId: 'out1',
      itemId: item.id,
      itemType: 'robot_worker',
      tick: 10,
    })
    expect(sim.paused).toBe(true)
    expect(gameOverEvents).toHaveLength(1)
    expect(gameOverEvents[0].data).toEqual(sim.gameOver)

    const parked = belt.getItems().find((beltItem) => beltItem.id === item.id)
    expect(parked).toBeDefined()
    expect(parked!.positionOnBelt).toBeGreaterThanOrEqual(1.0 - 1e-9)
    expect(output.consumedItems).toBe(0)
    expect(sim.itemsDelivered).toBe(0)
    expect(sim.outputsDelivered).toBe(0)
    expect(sim.robotsProduced).toBe(0)
    expect(sim.defects).toBe(0)
    expect(discardEvents).toEqual([])
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

  describe('disabled pass-through machines that still accept input do not trigger game_over', () => {
    const passThroughTypes: MachineType[] = ['splitter', 'recycler']
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

// --- New rule: starting a recipe-required machine with no recipe is fatal ---

import * as TypesModule from '../../../src/game/types'

function captureGameOverEvents(sim: Simulation): SimulationEvent[] {
  const events: SimulationEvent[] = []
  sim.on('game_over' as SimulationEventType, (e) => events.push(e))
  return events
}

describe('isRecipeRequiredMachineType helper', () => {
  const recipeRequired: MachineType[] = [
    'part_fabricator',
    'assembler',
    'painter',
  ]
  const recipeOptional: MachineType[] = [
    'quality_checker',
    'splitter',
    'factory_output',
    'recycler',
  ]

  for (const type of recipeRequired) {
    it(`returns true for ${type}`, () => {
      const fn = (TypesModule as { isRecipeRequiredMachineType?: (t: MachineType) => boolean })
        .isRecipeRequiredMachineType
      expect(typeof fn).toBe('function')
      expect(fn!(type)).toBe(true)
    })
  }

  for (const type of recipeOptional) {
    it(`returns false for ${type}`, () => {
      const fn = (TypesModule as { isRecipeRequiredMachineType?: (t: MachineType) => boolean })
        .isRecipeRequiredMachineType
      expect(typeof fn).toBe('function')
      expect(fn!(type)).toBe(false)
    })
  }
})

describe('Simulation game-over on starting machine without recipe', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  const recipeRequiredTypes: MachineType[] = [
    'part_fabricator',
    'assembler',
    'painter',
  ]

  for (const type of recipeRequiredTypes) {
    it(`fires game_over after starting a ${type} with no recipe (one tick)`, () => {
      // GIVEN
      const sim = new Simulation()
      const machine = new Machine(`m_${type}`, type)
      sim.addMachine(machine)
      sim.setMachinePosition(machine.id, 0, 0)
      const events = captureGameOverEvents(sim)

      // WHEN
      machine.start()
      sim.tick()

      // THEN
      expect(sim.gameOver).not.toBeNull()
      expect(sim.gameOver!.reason).toBe('no_recipe')
      expect(sim.gameOver!.machineId).toBe(machine.id)
      expect((sim.gameOver as { itemId?: unknown }).itemId).toBeUndefined()
      expect((sim.gameOver as { itemType?: unknown }).itemType).toBeUndefined()
      expect(typeof sim.gameOver!.tick).toBe('number')
      expect(sim.paused).toBe(true)

      expect(events).toHaveLength(1)
      expect(events[0].data['reason']).toBe('no_recipe')
      expect(events[0].data['machineId']).toBe(machine.id)
      expect(events[0].data['itemId']).toBeUndefined()
      expect(events[0].data['itemType']).toBeUndefined()
    })
  }

  const nonRecipeTypes: MachineType[] = [
    'quality_checker',
    'splitter',
    'factory_output',
    'recycler',
  ]

  for (const type of nonRecipeTypes) {
    it(`does NOT fire game_over after starting a ${type} with no recipe`, () => {
      // GIVEN
      const sim = new Simulation()
      const machine = new Machine(`m_${type}`, type)
      sim.addMachine(machine)
      sim.setMachinePosition(machine.id, 0, 0)
      const events = captureGameOverEvents(sim)

      // WHEN
      machine.start()
      tickN(sim, 5)

      // THEN
      expect(sim.gameOver).toBeNull()
      expect(events).toHaveLength(0)
    })
  }

  it('does NOT fire game_over when recipe is set BEFORE start (part_fabricator)', () => {
    // GIVEN
    const sim = new Simulation()
    const machine = new Machine('m1', 'part_fabricator')
    machine.setRecipe(recipe('wheel_press_small'))
    sim.addMachine(machine)
    sim.setMachinePosition(machine.id, 0, 0)
    const events = captureGameOverEvents(sim)

    // WHEN
    machine.start()
    tickN(sim, 20)

    // THEN
    expect(sim.gameOver).toBeNull()
    expect(events).toHaveLength(0)
  })

  it('does NOT fire game_over for an added-but-never-started recipe-required machine', () => {
    // GIVEN — machine added without recipe and never started (enabled stays false).
    const sim = new Simulation()
    const machine = new Machine('m1', 'part_fabricator')
    sim.addMachine(machine)
    sim.setMachinePosition(machine.id, 0, 0)
    expect(machine.enabled).toBe(false)
    const events = captureGameOverEvents(sim)

    // WHEN
    tickN(sim, 200)

    // THEN
    expect(sim.gameOver).toBeNull()
    expect(events).toHaveLength(0)
  })

  it('does NOT fire game_over when START_MACHINE and SET_RECIPE are queued in the same tick', () => {
    // GIVEN
    const sim = new Simulation()
    const machine = new Machine('m1', 'part_fabricator')
    sim.addMachine(machine)
    sim.setMachinePosition(machine.id, 0, 0)
    const events = captureGameOverEvents(sim)

    // WHEN — both commands processed before the no-recipe scan.
    sim.enqueueCommands([
      { type: 'START_MACHINE', machineId: machine.id },
      { type: 'SET_RECIPE', machineId: machine.id, recipeId: 'wheel_press_small' },
    ])
    sim.tick()

    // THEN
    expect(sim.gameOver).toBeNull()
    expect(events).toHaveLength(0)
    expect(machine.currentRecipe).not.toBeNull()
  })

  it('emits game_over only ONCE when multiple recipe-required machines are started without recipes', () => {
    // GIVEN
    const sim = new Simulation()
    const a = new Machine('a', 'part_fabricator')
    const b = new Machine('b', 'assembler')
    const c = new Machine('c', 'painter')
    sim.addMachine(a)
    sim.addMachine(b)
    sim.addMachine(c)
    sim.setMachinePosition('a', 0, 0)
    sim.setMachinePosition('b', 1, 0)
    sim.setMachinePosition('c', 2, 0)
    const events = captureGameOverEvents(sim)

    // WHEN
    a.start()
    b.start()
    c.start()
    sim.tick()
    tickN(sim, 5)

    // THEN — first machine wins; subsequent ticks must not re-emit.
    expect(sim.gameOver).not.toBeNull()
    expect(sim.gameOver!.reason).toBe('no_recipe')
    expect(events).toHaveLength(1)
    expect(events[0].data['machineId']).toBe('a')
  })

  it('does not change gameOver or emit additional events on ticks after game over', () => {
    // GIVEN
    const sim = new Simulation()
    const machine = new Machine('m1', 'painter')
    sim.addMachine(machine)
    sim.setMachinePosition(machine.id, 0, 0)
    const events = captureGameOverEvents(sim)
    machine.start()
    sim.tick()
    expect(sim.gameOver).not.toBeNull()
    const snapshot = { ...sim.gameOver }

    // WHEN
    tickN(sim, 50)

    // THEN
    expect(sim.gameOver).toEqual(snapshot)
    expect(events).toHaveLength(1)
  })
})
