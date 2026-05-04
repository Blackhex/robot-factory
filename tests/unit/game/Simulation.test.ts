import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { getRecipeById } from '../../../src/game/Recipe'
import { Simulation } from '../../../src/game/Simulation'
import type { Recipe } from '../../../src/game/Recipe'
import type { SimulationEvent } from '../../../src/game/types'

// --- Helpers ---

function tickN(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) {
    sim.tick()
  }
}

function wheelPressRecipe(): Recipe {
  const recipe = getRecipeById('wheel_press_small')
  if (!recipe) throw new Error('wheel_press_small recipe not found')
  return recipe
}

/**
 * Returns an assembler recipe whose inputs include `wheel_small` and
 * `circuit_basic`, used by belt→assembler delivery tests so the assembler
 * is willing to consume the items the test sends to it (avoids the
 * game-over trip wired into deliverItems()).
 */
function assemblerWheelAcceptingRecipe(): Recipe {
  const recipe = getRecipeById('assemble_drivetrain_basic')
  if (!recipe) throw new Error('assemble_drivetrain_basic recipe not found')
  return recipe
}

// --- Simulation tests ---

describe('Simulation', () => {
  let sim: Simulation

  beforeEach(() => {
    resetItemIdCounter()
    sim = new Simulation()
  })

  describe('tick counter', () => {
    it('should start at tick 0', () => {
      // THEN
      expect(sim.currentTick).toBe(0)
    })

    it('should increment tick after each tick()', () => {
      // WHEN
      sim.tick()

      // THEN
      expect(sim.currentTick).toBe(1)

      // WHEN
      sim.tick()

      // THEN
      expect(sim.currentTick).toBe(2)
    })
  })

  describe('entity management', () => {
    it('should add and retrieve machines', () => {
      // GIVEN
      const m = new Machine('m1', 'part_fabricator')

      // WHEN
      sim.addMachine(m)

      // THEN
      expect(sim.getMachine('m1')).toBe(m)
    })

    it('should remove machines', () => {
      // GIVEN
      const m = new Machine('m1', 'part_fabricator')
      sim.addMachine(m)

      // WHEN
      const result = sim.removeMachine('m1')

      // THEN
      expect(result).toBe(true)
      expect(sim.getMachine('m1')).toBeUndefined()
    })

    it('should add and retrieve belts', () => {
      // GIVEN
      const b = new ConveyorBelt('b1', 0, 0, 1, 0)

      // WHEN
      sim.addBelt(b)

      // THEN
      expect(sim.getBelt('b1')).toBe(b)
    })

    it('should remove belts', () => {
      // GIVEN
      const b = new ConveyorBelt('b1', 0, 0, 1, 0)
      sim.addBelt(b)

      // WHEN
      const result = sim.removeBelt('b1')

      // THEN
      expect(result).toBe(true)
      expect(sim.getBelt('b1')).toBeUndefined()
    })
  })

  describe('command execution', () => {
    it('should execute SET_RECIPE command', () => {
      // GIVEN
      const m = new Machine('m1', 'part_fabricator')
      sim.addMachine(m)

      // WHEN
      sim.enqueueCommand({
        type: 'SET_RECIPE',
        machineId: 'm1',
        recipeId: 'wheel_press_small',
      })
      sim.tick()

      // THEN
      expect(m.currentRecipe).not.toBeNull()
      expect(m.currentRecipe!.id).toBe('wheel_press_small')
    })

    it('should execute STOP_MACHINE command', () => {
      // GIVEN
      const m = new Machine('m1', 'part_fabricator')
      const recipe = wheelPressRecipe()
      m.setRecipe(recipe)
      m.start()
      sim.addMachine(m)

      // WHEN
      sim.enqueueCommand({ type: 'STOP_MACHINE', machineId: 'm1' })
      sim.tick()

      // THEN
      // Contract change: stop preserves recipe; see Machine.enabled.test.ts for the
      // canonical assertions. STOP_MACHINE flips `enabled` off but must NOT clear
      // `currentRecipe` so the machine can be re-started without re-issuing SET_RECIPE.
      expect(m.enabled).toBe(false)
      expect(m.currentRecipe).toBe(recipe)
    })

    it('should execute SET_BELT_SPEED command', () => {
      // GIVEN
      const b = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
      sim.addBelt(b)

      // WHEN
      sim.enqueueCommand({ type: 'SET_BELT_SPEED', beltId: 'b1', speed: 2.5 })
      sim.tick()

      // THEN
      expect(b.speed).toBe(2.5)
    })

    it('should process multiple enqueued commands in one tick', () => {
      // GIVEN
      const m1 = new Machine('m1', 'part_fabricator')
      const m2 = new Machine('m2', 'part_fabricator')
      sim.addMachine(m1)
      sim.addMachine(m2)

      // WHEN
      sim.enqueueCommands([
        { type: 'SET_RECIPE', machineId: 'm1', recipeId: 'wheel_press_small' },
        { type: 'SET_RECIPE', machineId: 'm2', recipeId: 'chassis_stamper_light' },
      ])
      sim.tick()

      // THEN
      expect(m1.currentRecipe!.id).toBe('wheel_press_small')
      expect(m2.currentRecipe!.id).toBe('chassis_stamper_light')
    })

    it('should clear command queue after processing', () => {
      // GIVEN
      const m = new Machine('m1', 'part_fabricator')
      sim.addMachine(m)
      sim.enqueueCommand({ type: 'SET_RECIPE', machineId: 'm1', recipeId: 'wheel_press_small' })
      sim.tick()

      // WHEN
      m.currentRecipe = null
      sim.tick()

      // THEN
      // If command was re-processed, recipe would be set; it should remain null
      expect(m.currentRecipe).toBeNull()
    })
  })

  describe('SET_BELT_SPEED on segmented belts', () => {
    // A logical belt drawn across multiple cells is registered in the
    // simulation as N independent ConveyorBelt segments with ids of the
    // form `${logicalId}_seg${i}` (see ConveyorBelt.fromBeltInfo and
    // GameManager.populateSimulation). The BlockInterpreter resolves
    // dropdown belt references to the LOGICAL id (e.g. `belt_X`), so
    // SET_BELT_SPEED commands carry a logical id, not a segment id.
    // The simulation must therefore propagate the speed change to every
    // matching segment, not only to a belt whose id is an exact match.

    it('should propagate SET_BELT_SPEED to every segment of a multi-cell belt', () => {
      // GIVEN a 3-cell belt registered as three segments under logical id `belt_X`
      const seg0 = new ConveyorBelt('belt_X_seg0', 0, 0, 1, 0, 1.0)
      const seg1 = new ConveyorBelt('belt_X_seg1', 1, 0, 2, 0, 1.0)
      const seg2 = new ConveyorBelt('belt_X_seg2', 2, 0, 3, 0, 1.0)
      sim.addBelt(seg0)
      sim.addBelt(seg1)
      sim.addBelt(seg2)

      // WHEN a SET_BELT_SPEED command is enqueued targeting the logical id
      sim.enqueueCommand({ type: 'SET_BELT_SPEED', beltId: 'belt_X', speed: 2.5 })
      sim.tick()

      // THEN every segment of the logical belt receives the new speed
      expect(sim.getBelt('belt_X_seg0')!.speed).toBe(2.5)
      expect(sim.getBelt('belt_X_seg1')!.speed).toBe(2.5)
      expect(sim.getBelt('belt_X_seg2')!.speed).toBe(2.5)
    })

    it('should still update a single belt registered under its exact id (no _seg suffix)', () => {
      // GIVEN a single belt registered with the exact id (no segments)
      const b = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
      sim.addBelt(b)

      // WHEN
      sim.enqueueCommand({ type: 'SET_BELT_SPEED', beltId: 'b1', speed: 3.0 })
      sim.tick()

      // THEN the single belt is updated by exact-id match
      expect(sim.getBelt('b1')!.speed).toBe(3.0)
    })

    it('should not match belts whose id only shares a numeric prefix (e.g. belt_1 vs belt_10_seg0)', () => {
      // GIVEN two unrelated belts whose ids share a numeric prefix:
      //   - `belt_1`        : exact-id target of the SET_BELT_SPEED command
      //   - `belt_10_seg0`  : segment of an unrelated logical belt `belt_10`
      // The segment-propagation regex is `^${escaped}_seg\d+$`, which must
      // anchor against the FULL logical id and therefore must NOT match
      // `belt_10_seg0` when the command targets `belt_1`.
      const exact = new ConveyorBelt('belt_1', 0, 0, 1, 0, 1.0)
      const unrelated = new ConveyorBelt('belt_10_seg0', 5, 0, 6, 0, 1.0)
      sim.addBelt(exact)
      sim.addBelt(unrelated)

      // WHEN
      sim.enqueueCommand({ type: 'SET_BELT_SPEED', beltId: 'belt_1', speed: 7 })
      sim.tick()

      // THEN the exact-id belt is updated and the unrelated belt is untouched
      expect(sim.getBelt('belt_1')!.speed).toBe(7)
      expect(sim.getBelt('belt_10_seg0')!.speed).toBe(1)
    })
  })

  describe('tick orchestration', () => {
    it('should tick machines during simulation tick', () => {
      // GIVEN
      const m = new Machine('m1', 'part_fabricator')
      m.setRecipe(wheelPressRecipe())
      m.start()
      sim.addMachine(m)

      // WHEN
      sim.tick()

      // THEN
      expect(m.state).toBe('processing')
    })

    it('should advance belts during simulation tick', () => {
      // GIVEN
      const b = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
      const item = createItem('wheel_small')
      b.addItem(item)
      sim.addBelt(b)

      // WHEN
      sim.tick()

      // THEN
      expect(item.positionOnBelt).toBeCloseTo(0.1)
    })

    it('should deliver items from belt to machine at destination', () => {
      // GIVEN
      const b = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
      const m = new Machine('m1', 'assembler')
      m.setRecipe(assemblerWheelAcceptingRecipe())
      sim.addBelt(b)
      sim.addMachine(m)
      sim.setMachinePosition('m1', 1, 0) // machine at belt destination
      const item = createItem('wheel_small')
      b.addItem(item)

      // WHEN
      // 11 ticks needed due to floating point (10 × 0.1 ≈ 0.999..., 11th caps to 1.0)
      tickN(sim, 11)

      // THEN
      expect(b.isEmpty()).toBe(true)
      expect(m.inputSlots).toHaveLength(1)
      expect(m.inputSlots[0].type).toBe('wheel_small')
    })

    it('should not deliver item when target machine is full', () => {
      // GIVEN
      const b = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
      const m = new Machine('m1', 'assembler', 1) // only 1 input slot
      sim.addBelt(b)
      sim.addMachine(m)
      sim.setMachinePosition('m1', 1, 0)
      m.addInput(createItem('wheel_small'))
      const beltItem = createItem('circuit_basic')
      b.addItem(beltItem)

      // WHEN
      tickN(sim, 11)

      // THEN
      expect(b.isEmpty()).toBe(false)
      expect(b.getReadyItems()).toHaveLength(1)
    })
  })

  describe('event emitter', () => {
    it('should emit tick events', () => {
      // GIVEN
      const events: SimulationEvent[] = []
      sim.on('tick', (e) => events.push(e))

      // WHEN
      sim.tick()

      // THEN
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('tick')
      expect(events[0].tick).toBe(0)
    })

    it('should emit machine_state_changed events', () => {
      // GIVEN
      const events: SimulationEvent[] = []
      sim.on('machine_state_changed', (e) => events.push(e))
      const m = new Machine('m1', 'part_fabricator')
      m.setRecipe(wheelPressRecipe())
      m.start()
      sim.addMachine(m)

      // WHEN
      sim.tick()

      // THEN
      expect(events.length).toBeGreaterThanOrEqual(1)
      expect(events[0].data['from']).toBe('idle')
      expect(events[0].data['to']).toBe('processing')
    })

    it('should emit item_produced events', () => {
      // GIVEN
      const events: SimulationEvent[] = []
      sim.on('item_produced', (e) => events.push(e))
      const m = new Machine('m1', 'part_fabricator')
      m.setRecipe(wheelPressRecipe()) // 5 ticks
      m.start()
      sim.addMachine(m)

      // WHEN
      // 1 tick start + 5 ticks processing
      tickN(sim, 6)

      // THEN
      const produced = events.filter((e) => e.data['machineId'] === 'm1')
      expect(produced.length).toBeGreaterThanOrEqual(1)
    })

    it('should emit item_delivered events', () => {
      // GIVEN
      const events: SimulationEvent[] = []
      sim.on('item_delivered', (e) => events.push(e))
      const b = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
      const m = new Machine('m1', 'assembler')
      m.setRecipe(assemblerWheelAcceptingRecipe())
      sim.addBelt(b)
      sim.addMachine(m)
      sim.setMachinePosition('m1', 1, 0)
      const item = createItem('wheel_small')
      b.addItem(item)

      // WHEN
      // 11 ticks for floating point belt arrival
      tickN(sim, 11)

      // THEN
      expect(events.length).toBeGreaterThanOrEqual(1)
      expect(events[0].data['beltId']).toBe('b1')
      expect(events[0].data['machineId']).toBe('m1')
    })

    it('should allow removing event handlers', () => {
      // GIVEN
      const events: SimulationEvent[] = []
      const handler = (e: SimulationEvent) => events.push(e)
      sim.on('tick', handler)
      sim.tick()
      expect(events).toHaveLength(1)

      // WHEN
      sim.off('tick', handler)
      sim.tick()

      // THEN
      expect(events).toHaveLength(1) // no new event
    })
  })

  describe('scoring accumulators', () => {
    it('should start with zero scores', () => {
      // THEN
      expect(sim.itemsProduced).toBe(0)
      expect(sim.robotsProduced).toBe(0)
      expect(sim.defects).toBe(0)
      expect(sim.totalIdleTicks).toBe(0)
    })

    it('should accumulate idle ticks for machine with recipe but idle', () => {
      // GIVEN
      const m = new Machine('m1', 'assembler')
      m.setRecipe(getRecipeById('assemble_drivetrain_basic')!)
      sim.addMachine(m)

      // WHEN
      // Machine has recipe but no inputs → stays idle
      sim.tick()

      // THEN
      expect(sim.totalIdleTicks).toBeGreaterThanOrEqual(1)
    })

    it('should not accumulate idle ticks for machine without recipe', () => {
      // GIVEN
      const m = new Machine('m1', 'assembler')
      sim.addMachine(m)

      // WHEN
      sim.tick()

      // THEN
      expect(sim.totalIdleTicks).toBe(0)
    })
  })

  describe('start/stop/pause lifecycle', () => {
    it('should not be running initially', () => {
      // THEN
      expect(sim.running).toBe(false)
      expect(sim.paused).toBe(false)
    })

    it('should be running after start()', () => {
      // WHEN
      sim.start()

      // THEN
      expect(sim.running).toBe(true)
      sim.stop()
    })

    it('should stop running after stop()', () => {
      // GIVEN
      sim.start()

      // WHEN
      sim.stop()

      // THEN
      expect(sim.running).toBe(false)
    })

    it('should be paused after pause()', () => {
      // GIVEN
      sim.start()

      // WHEN
      sim.pause()

      // THEN
      expect(sim.paused).toBe(true)
      sim.stop()
    })

    it('should resume after resume()', () => {
      // GIVEN
      sim.start()
      sim.pause()

      // WHEN
      sim.resume()

      // THEN
      expect(sim.paused).toBe(false)
      sim.stop()
    })

    it('should not double-start', () => {
      // GIVEN
      sim.start()

      // WHEN
      sim.start() // should be idempotent

      // THEN
      expect(sim.running).toBe(true)
      sim.stop()
    })
  })

  describe('reset()', () => {
    it('should clear all state on reset()', () => {
      // GIVEN
      const m = new Machine('m1', 'part_fabricator')
      sim.addMachine(m)
      sim.addBelt(new ConveyorBelt('b1', 0, 0, 1, 0))
      sim.tick()
      sim.tick()

      // WHEN
      sim.reset()

      // THEN
      expect(sim.currentTick).toBe(0)
      expect(sim.getMachine('m1')).toBeUndefined()
      expect(sim.getBelt('b1')).toBeUndefined()
      expect(sim.itemsProduced).toBe(0)
      expect(sim.totalIdleTicks).toBe(0)
    })
  })

  describe('empty factory', () => {
    it('should not crash when ticking empty simulation', () => {
      // WHEN / THEN
      expect(() => sim.tick()).not.toThrow()
      expect(sim.currentTick).toBe(1)
    })

    it('should not crash when ticking many times with no entities', () => {
      // WHEN / THEN
      expect(() => tickN(sim, 100)).not.toThrow()
      expect(sim.currentTick).toBe(100)
    })
  })

  describe('getStats()', () => {
    it('should return default stats for fresh simulation', () => {
      // WHEN
      const stats = sim.getStats()

      // THEN
      expect(stats.itemsProduced).toBe(0)
      expect(stats.robotsCompleted).toBe(0)
      expect(stats.timeElapsed).toBe(0)
      expect(stats.qualityPercent).toBe(100) // 100% when no items produced
    })

    it('should report correct timeElapsed based on tick count and tickRate', () => {
      // WHEN
      tickN(sim, 20) // 20 ticks at default tickRate=10 → 2.0 seconds

      // THEN
      const stats = sim.getStats()
      expect(stats.timeElapsed).toBeCloseTo(2.0)
    })

    it('should track itemsProduced count', () => {
      // GIVEN
      sim.itemsProduced = 5

      // THEN
      expect(sim.getStats().itemsProduced).toBe(5)
    })

    it('should track robotsCompleted count', () => {
      // GIVEN
      sim.robotsProduced = 3

      // THEN
      expect(sim.getStats().robotsCompleted).toBe(3)
    })

    it('should calculate quality percent correctly', () => {
      // GIVEN
      sim.robotsProduced = 8
      sim.defects = 2

      // THEN
      // total=10, quality = 8/10 * 100 = 80%
      expect(sim.getStats().qualityPercent).toBeCloseTo(80)
    })

    it('should return 100% quality when no robots or defects', () => {
      // GIVEN
      sim.robotsProduced = 0
      sim.defects = 0

      // THEN
      expect(sim.getStats().qualityPercent).toBe(100)
    })

    it('should handle all defects (0% quality)', () => {
      // GIVEN
      sim.robotsProduced = 0
      sim.defects = 5

      // THEN
      // total=5, quality = 0/5 * 100 = 0%
      expect(sim.getStats().qualityPercent).toBe(0)
    })
  })

  describe('factory_output delivery tracking', () => {
    it('should start with zero outputsDelivered', () => {
      // THEN
      expect(sim.outputsDelivered).toBe(0)
    })

    it('should track items delivered to factory_output', () => {
      // GIVEN
      const output = new Machine('out1', 'factory_output')
      sim.addMachine(output)
      sim.setMachinePosition('out1', 1, 0)
      const belt = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
      sim.addBelt(belt)
      const item = createItem('wheel_small')
      belt.addItem(item)

      // WHEN — 11 ticks for belt to deliver
      tickN(sim, 11)

      // THEN
      expect(sim.outputsDelivered).toBe(1)
    })

    it('should emit output_delivered event when item reaches factory_output', () => {
      // GIVEN
      const events: SimulationEvent[] = []
      sim.on('output_delivered', (e) => events.push(e))
      const output = new Machine('out1', 'factory_output')
      sim.addMachine(output)
      sim.setMachinePosition('out1', 1, 0)
      const belt = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
      sim.addBelt(belt)
      const item = createItem('wheel_small')
      belt.addItem(item)

      // WHEN
      tickN(sim, 11)

      // THEN
      expect(events).toHaveLength(1)
      expect(events[0].data['machineId']).toBe('out1')
      expect(events[0].data['itemType']).toBe('wheel_small')
    })

    it('should count multiple deliveries to factory_output', () => {
      // GIVEN
      const output = new Machine('out1', 'factory_output')
      sim.addMachine(output)
      sim.setMachinePosition('out1', 1, 0)
      const belt = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
      sim.addBelt(belt)

      // WHEN — deliver first item
      belt.addItem(createItem('wheel_small'))
      tickN(sim, 11)

      // deliver second item
      belt.addItem(createItem('circuit_basic'))
      tickN(sim, 11)

      // THEN
      expect(sim.outputsDelivered).toBe(2)
    })

    it('should reset outputsDelivered on reset()', () => {
      // GIVEN
      sim.outputsDelivered = 5

      // WHEN
      sim.reset()

      // THEN
      expect(sim.outputsDelivered).toBe(0)
    })
  })

  describe('robotsProduced tracking', () => {
    // Spec: `Simulation.robotsProduced` must increment by 1 each time a
    // robot-class item (ItemType starting with `robot_*`) is delivered to
    // a `factory_output` machine. Non-robot deliveries must NOT bump the
    // counter — only `outputsDelivered` (the existing all-items counter).

    it('should increment robotsProduced when a robot reaches factory_output', () => {
      // GIVEN — factory_output at the end of a 1-cell belt
      const output = new Machine('out1', 'factory_output')
      sim.addMachine(output)
      sim.setMachinePosition('out1', 1, 0)
      const belt = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
      sim.addBelt(belt)
      belt.addItem(createItem('robot_worker'))

      // WHEN — 11 ticks for belt to deliver (10 × 0.1 ≈ 0.999..., 11th caps to 1.0)
      tickN(sim, 11)

      // THEN — robotsProduced bumped, outputsDelivered also bumped (existing behavior)
      expect(sim.robotsProduced).toBe(1)
      expect(sim.outputsDelivered).toBe(1)
    })

    it('should NOT increment robotsProduced for non-robot items at factory_output', () => {
      // GIVEN — same setup, but the delivered item is a part, not a robot
      const output = new Machine('out1', 'factory_output')
      sim.addMachine(output)
      sim.setMachinePosition('out1', 1, 0)
      const belt = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
      sim.addBelt(belt)
      belt.addItem(createItem('wheel_small'))

      // WHEN
      tickN(sim, 11)

      // THEN — outputsDelivered still bumps (it counts ALL items), but robotsProduced does not
      expect(sim.outputsDelivered).toBe(1)
      expect(sim.robotsProduced).toBe(0)
    })

    it('should increment robotsProduced once per delivered robot (not per tick)', () => {
      // GIVEN — factory_output at the end of a belt
      const output = new Machine('out1', 'factory_output')
      sim.addMachine(output)
      sim.setMachinePosition('out1', 1, 0)
      const belt = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
      sim.addBelt(belt)

      // WHEN — push 3 robots through sequentially (single-cell belt only holds one at a time)
      belt.addItem(createItem('robot_worker'))
      tickN(sim, 11)
      belt.addItem(createItem('robot_explorer'))
      tickN(sim, 11)
      belt.addItem(createItem('robot_guardian'))
      tickN(sim, 11)

      // THEN — exactly 3 robots counted, regardless of how many ticks elapsed
      expect(sim.robotsProduced).toBe(3)
      expect(sim.outputsDelivered).toBe(3)
    })
  })

  describe('defects tracking', () => {
    // Spec: `Simulation.defects` must increment by 1 each time a
    // `quality_checker` machine routes an item to its `secondaryOutputSlot`
    // (the reject branch fired when `item.quality < machine.qualityThreshold`).
    // Splitter secondary outputs must NOT count as defects — only quality_checker.

    it('should increment defects when quality_checker routes an item to secondary output', () => {
      // GIVEN — quality_checker with threshold 50 and a low-quality item already in the input slot.
      // We seed via `addInput` so the test is independent of belt delivery timing.
      const qc = new Machine('qc1', 'quality_checker')
      qc.qualityThreshold = 50
      qc.start()
      qc.addInput(createItem('wheel_small', 30)) // quality < threshold → secondary
      sim.addMachine(qc)

      // WHEN — quality_checker takes 1 tick to start + 1 tick to route
      sim.tick() // idle → processing (timer=1)
      sim.tick() // timer=0, route to secondary

      // THEN — item ended up on secondary slot AND defects bumped exactly once
      expect(qc.secondaryOutputSlot).not.toBeNull()
      expect(qc.outputSlot).toBeNull()
      expect(sim.defects).toBe(1)
    })

    it('should NOT increment defects when quality_checker routes to primary (passing) output', () => {
      // GIVEN — same setup but item quality is above threshold → routes to primary
      const qc = new Machine('qc1', 'quality_checker')
      qc.qualityThreshold = 50
      qc.start()
      qc.addInput(createItem('wheel_small', 80)) // quality >= threshold → primary
      sim.addMachine(qc)

      // WHEN
      sim.tick()
      sim.tick()

      // THEN — primary slot populated, defects untouched
      expect(qc.outputSlot).not.toBeNull()
      expect(qc.secondaryOutputSlot).toBeNull()
      expect(sim.defects).toBe(0)
    })

    it('should increment defects once per rejected item (not per tick the item sits in secondary slot)', () => {
      // GIVEN — quality_checker with threshold 50
      const qc = new Machine('qc1', 'quality_checker')
      qc.qualityThreshold = 50
      qc.start()
      sim.addMachine(qc)

      // WHEN — push a low-quality item, route it, drain the secondary slot, then repeat.
      // Manually draining stands in for a connected secondary belt; the prevSecondary
      // bookkeeping in updateMachines is what guarantees "once per new item".
      qc.addInput(createItem('wheel_small', 30))
      sim.tick() // idle → processing
      sim.tick() // route to secondary → defects should be 1 here
      qc.takeSecondaryOutput() // drain so the next item can be routed

      qc.addInput(createItem('wheel_small', 30))
      sim.tick() // idle → processing
      sim.tick() // route to secondary → defects should be 2 here

      // Extra ticks while the item sits in the secondary slot must NOT re-bump defects.
      sim.tick()
      sim.tick()

      // THEN — exactly 2 rejections, one per rejected item
      expect(sim.defects).toBe(2)
    })
  })

  describe('clearInFlight()', () => {
    it('should remove all items from every belt', () => {
      // GIVEN
      const b1 = new ConveyorBelt('b1', 0, 0, 1, 0)
      const b2 = new ConveyorBelt('b2', 2, 0, 3, 0)
      sim.addBelt(b1)
      sim.addBelt(b2)
      b1.addItem(createItem('wheel_small'))
      b2.addItem(createItem('circuit_basic'))
      b2.addItem(createItem('chassis_light'))
      // sanity
      expect(b1.getItemCount()).toBe(1)
      expect(b2.getItemCount() + b1.getItemCount()).toBeGreaterThan(0)

      // WHEN
      sim.clearInFlight()

      // THEN
      expect(b1.getItemCount()).toBe(0)
      expect(b2.getItemCount()).toBe(0)
      expect(b1.isEmpty()).toBe(true)
      expect(b2.isEmpty()).toBe(true)
    })

    it('should reset machine input/output slots and state to idle', () => {
      // GIVEN
      const m = new Machine('m1', 'part_fabricator')
      sim.addMachine(m)
      m.addInput(createItem('wheel_small'))
      m.addInput(createItem('wheel_small'))
      m.outputSlot = createItem('chassis_light')
      m.secondaryOutputSlot = createItem('circuit_basic')
      m.state = 'processing'
      m.processingTimer = 5
      m.consumedItems = 3

      // WHEN
      sim.clearInFlight()

      // THEN
      expect(m.inputSlots.length).toBe(0)
      expect(m.outputSlot).toBeNull()
      expect(m.secondaryOutputSlot).toBeNull()
      expect(m.state).toBe('idle')
      expect(m.processingTimer).toBe(0)
      expect(m.consumedItems).toBe(0)
    })

    it('should preserve machines, belts, and output-belt connections', () => {
      // GIVEN
      const m = new Machine('m1', 'part_fabricator')
      const b = new ConveyorBelt('b1', 0, 0, 1, 0)
      sim.addMachine(m)
      sim.addBelt(b)
      sim.setMachineOutputBelt('m1', 'b1', 'primary')
      m.setRecipe(wheelPressRecipe())

      // WHEN
      sim.clearInFlight()

      // THEN — entities preserved
      expect(sim.getMachines().size).toBe(1)
      expect(sim.getMachine('m1')).toBe(m)
      expect(sim.getBelts().size).toBe(1)
      expect(sim.getBelt('b1')).toBe(b)

      // THEN — connection preserved (verified indirectly by running the pipeline)
      m.addInput(createItem('wheel_small'))
      m.addInput(createItem('wheel_small'))
      m.start()
      // Tick enough times for the part_fabricator to produce + transfer
      tickN(sim, 30)
      // If the connection was lost, no item would land on belt b1
      expect(b.getItemCount()).toBeGreaterThan(0)
    })

    it('should preserve machine recipe configuration', () => {
      // GIVEN
      const m = new Machine('m1', 'part_fabricator')
      sim.addMachine(m)
      const recipe = wheelPressRecipe()
      m.setRecipe(recipe)
      const qc = new Machine('qc1', 'quality_checker')
      qc.qualityThreshold = 42
      sim.addMachine(qc)
      const sp = new Machine('sp1', 'splitter')
      sp.splitterCondition = { conditionType: 'by_item_type', itemType: 'wheel_small' }
      sim.addMachine(sp)

      // WHEN
      sim.clearInFlight()

      // THEN
      expect(m.currentRecipe).not.toBeNull()
      expect(m.currentRecipe).toBe(recipe)
      expect(qc.qualityThreshold).toBe(42)
      expect(sp.splitterCondition).not.toBeNull()
      expect(sp.splitterCondition!.conditionType).toBe('by_item_type')
    })

    it('should clear the command queue', () => {
      // GIVEN
      const m = new Machine('m1', 'part_fabricator')
      sim.addMachine(m)
      // currentRecipe is null; enqueue a SET_RECIPE that would set it on next tick
      sim.enqueueCommand({
        type: 'SET_RECIPE',
        machineId: 'm1',
        recipeId: 'wheel_press_small',
      })

      // WHEN
      sim.clearInFlight()
      sim.tick()

      // THEN — queued SET_RECIPE was dropped, so recipe stays null
      expect(m.currentRecipe).toBeNull()
    })

    it('should reset stat counters and currentTick to 0', () => {
      // GIVEN
      sim.itemsProduced = 7
      sim.itemsDelivered = 3
      sim.outputsDelivered = 2
      sim.robotsProduced = 5
      sim.defects = 1
      sim.totalIdleTicks = 9
      sim.currentTick = 42

      // WHEN
      sim.clearInFlight()

      // THEN
      expect(sim.currentTick).toBe(0)
      expect(sim.itemsProduced).toBe(0)
      expect(sim.itemsDelivered).toBe(0)
      expect(sim.outputsDelivered).toBe(0)
      expect(sim.robotsProduced).toBe(0)
      expect(sim.defects).toBe(0)
      expect(sim.totalIdleTicks).toBe(0)
    })

    it('should stop the simulation if it was running', () => {
      // GIVEN
      sim.start()
      expect(sim.running).toBe(true)

      // WHEN
      sim.clearInFlight()

      // THEN
      expect(sim.running).toBe(false)
      expect(sim.paused).toBe(false)
    })
  })
})

// --- Integration tests ---

describe('Integration: full pipeline', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('should produce a part via fabricator, transport on belt, deliver to assembler', () => {
    // GIVEN
    const sim = new Simulation()
    const fabricator = new Machine('fab1', 'part_fabricator')
    fabricator.setRecipe(wheelPressRecipe()) // produces wheel_small in 5 ticks
    fabricator.start()
    sim.addMachine(fabricator)
    sim.setMachinePosition('fab1', 0, 0)
    const belt = new ConveyorBelt('belt1', 0, 0, 1, 0, 1.0)
    sim.addBelt(belt)
    const assembler = new Machine('asm1', 'assembler')
    assembler.setRecipe(assemblerWheelAcceptingRecipe())
    sim.addMachine(assembler)
    sim.setMachinePosition('asm1', 1, 0)

    // WHEN
    // Run fabricator until it produces (1 tick to start + 5 ticks processing = 6 ticks)
    tickN(sim, 6)
    expect(fabricator.outputSlot).not.toBeNull()
    // Manually move item from fabricator output to belt
    const item = fabricator.takeOutput()!
    belt.addItem(item)
    // Run belt until item reaches end (11 ticks for floating point)
    tickN(sim, 11)

    // THEN
    expect(belt.isEmpty()).toBe(true)
    expect(assembler.inputSlots).toHaveLength(1)
    expect(assembler.inputSlots[0].type).toBe('wheel_small')
  })

  it('should execute commands to set up and run a fabricator', () => {
    // GIVEN
    const sim = new Simulation()
    const m = new Machine('fab1', 'part_fabricator')
    sim.addMachine(m)

    // WHEN
    sim.enqueueCommand({
      type: 'SET_RECIPE',
      machineId: 'fab1',
      recipeId: 'wheel_press_small',
    })
    sim.enqueueCommand({ type: 'START_MACHINE', machineId: 'fab1' })
    // First tick processes command and starts the machine
    sim.tick()

    // THEN
    expect(m.currentRecipe).not.toBeNull()
    expect(m.state).toBe('processing')

    // WHEN
    // Wait for processing (5 ticks)
    tickN(sim, 5)

    // THEN
    expect(m.outputSlot).not.toBeNull()
    expect(m.outputSlot!.type).toBe('wheel_small')
  })
})

// --- QualityChecker tests ---

describe('QualityChecker', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('should route passing item to primary output', () => {
    // GIVEN
    const qc = new Machine('qc1', 'quality_checker')
    qc.start()
    // Default threshold = 80; item quality 90 → passes
    qc.addInput(createItem('wheel_small', 90))

    // WHEN
    qc.tick() // idle → processing (timer=1)
    qc.tick() // timer → 0, route item

    // THEN
    expect(qc.outputSlot).not.toBeNull()
    expect(qc.outputSlot!.quality).toBe(90)
    expect(qc.secondaryOutputSlot).toBeNull()
  })

  it('should route failing item to secondary output', () => {
    // GIVEN
    const qc = new Machine('qc1', 'quality_checker')
    qc.start()
    // Default threshold = 80; item quality 50 → fails
    qc.addInput(createItem('wheel_small', 50))

    // WHEN
    qc.tick() // idle → processing
    qc.tick() // route item

    // THEN
    expect(qc.outputSlot).toBeNull()
    expect(qc.secondaryOutputSlot).not.toBeNull()
    expect(qc.secondaryOutputSlot!.quality).toBe(50)
  })

  it('should use configurable threshold', () => {
    // GIVEN
    const qc = new Machine('qc1', 'quality_checker')
    qc.qualityThreshold = 60 // Lower threshold
    qc.start()
    // Item quality 70 → passes (>= 60)
    qc.addInput(createItem('wheel_small', 70))

    // WHEN
    qc.tick()
    qc.tick()

    // THEN
    expect(qc.outputSlot).not.toBeNull()
    expect(qc.outputSlot!.quality).toBe(70)
  })

  it('should process in exactly 1 tick', () => {
    // GIVEN
    const qc = new Machine('qc1', 'quality_checker')
    qc.start()
    qc.addInput(createItem('wheel_small', 90))

    // WHEN
    qc.tick() // idle → processing (timer=1)

    // THEN
    expect(qc.state).toBe('processing')

    // WHEN
    qc.tick() // timer → 0, routes item, back to idle

    // THEN
    expect(qc.state).toBe('idle')
  })

  it('should become blocked when output slot is full', () => {
    // GIVEN
    const qc = new Machine('qc1', 'quality_checker')
    qc.start()
    // Two passing items
    qc.addInput(createItem('wheel_small', 90))
    qc.addInput(createItem('wheel_small', 95))

    // WHEN
    qc.tick() // start processing first
    qc.tick() // route first to primary (outputSlot occupied)
    // Second item should start processing
    qc.tick() // start processing second
    qc.tick() // try to route second → outputSlot full → blocked

    // THEN
    expect(qc.state).toBe('blocked')
    expect(qc.outputSlot).not.toBeNull()
  })

  it('should treat item at exactly the threshold as passing', () => {
    // GIVEN
    const qc = new Machine('qc1', 'quality_checker')
    qc.qualityThreshold = 80
    qc.start()
    qc.addInput(createItem('wheel_small', 80)) // exactly at threshold → passes

    // WHEN
    qc.tick()
    qc.tick()

    // THEN
    expect(qc.outputSlot).not.toBeNull()
    expect(qc.secondaryOutputSlot).toBeNull()
  })
})

// --- Splitter tests ---

describe('Splitter', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('should route by item type — matching goes primary', () => {
    // GIVEN
    const sp = new Machine('sp1', 'splitter')
    sp.splitterCondition = { conditionType: 'by_item_type', itemType: 'wheel_small' }
    sp.start()
    sp.addInput(createItem('wheel_small'))

    // WHEN
    sp.tick() // instant routing (0-tick)

    // THEN
    expect(sp.outputSlot).not.toBeNull()
    expect(sp.outputSlot!.type).toBe('wheel_small')
    expect(sp.secondaryOutputSlot).toBeNull()
  })

  it('should route by item type — non-matching goes secondary', () => {
    // GIVEN
    const sp = new Machine('sp1', 'splitter')
    sp.splitterCondition = { conditionType: 'by_item_type', itemType: 'wheel_small' }
    sp.start()
    sp.addInput(createItem('circuit_basic'))

    // WHEN
    sp.tick()

    // THEN
    expect(sp.outputSlot).toBeNull()
    expect(sp.secondaryOutputSlot).not.toBeNull()
    expect(sp.secondaryOutputSlot!.type).toBe('circuit_basic')
  })

  it('should route by quality — high quality goes primary', () => {
    // GIVEN
    const sp = new Machine('sp1', 'splitter')
    sp.splitterCondition = { conditionType: 'by_quality', qualityThreshold: 70 }
    sp.start()
    sp.addInput(createItem('wheel_small', 90))

    // WHEN
    sp.tick()

    // THEN
    expect(sp.outputSlot).not.toBeNull()
    expect(sp.secondaryOutputSlot).toBeNull()
  })

  it('should route by quality — low quality goes secondary', () => {
    // GIVEN
    const sp = new Machine('sp1', 'splitter')
    sp.splitterCondition = { conditionType: 'by_quality', qualityThreshold: 70 }
    sp.start()
    sp.addInput(createItem('wheel_small', 50))

    // WHEN
    sp.tick()

    // THEN
    expect(sp.outputSlot).toBeNull()
    expect(sp.secondaryOutputSlot).not.toBeNull()
  })

  it('should alternate routing in alternating mode', () => {
    // GIVEN
    const sp = new Machine('sp1', 'splitter')
    sp.splitterCondition = { conditionType: 'alternating' }
    sp.start()

    // WHEN — first item → primary (counter=1, odd → primary)
    sp.addInput(createItem('wheel_small'))
    sp.tick()

    // THEN
    expect(sp.outputSlot).not.toBeNull()
    expect(sp.secondaryOutputSlot).toBeNull()

    // WHEN — second item → secondary (counter=2, even → secondary)
    sp.takeOutput()
    sp.addInput(createItem('wheel_small'))
    sp.tick()

    // THEN
    expect(sp.secondaryOutputSlot).not.toBeNull()
  })

  it('should route instantly with 0-tick processing', () => {
    // GIVEN
    const sp = new Machine('sp1', 'splitter')
    sp.splitterCondition = { conditionType: 'by_item_type', itemType: 'wheel_small' }
    sp.start()
    sp.addInput(createItem('wheel_small'))

    // WHEN
    // Splitter never enters 'processing' — it routes in idle state
    sp.tick()

    // THEN
    expect(sp.state).toBe('idle')
    expect(sp.outputSlot).not.toBeNull()
  })

  it('should default to primary when no condition set', () => {
    // GIVEN
    const sp = new Machine('sp1', 'splitter')
    sp.start()
    sp.addInput(createItem('wheel_small'))

    // WHEN
    sp.tick()

    // THEN
    expect(sp.outputSlot).not.toBeNull()
    expect(sp.secondaryOutputSlot).toBeNull()
  })
})

// --- Recycler tests ---

describe('Recycler', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('should convert any item to raw_material', () => {
    // GIVEN
    const recycler = new Machine('rec1', 'recycler')
    recycler.start()
    recycler.addInput(createItem('wheel_small', 30))

    // WHEN
    // 1 tick to start + 3 ticks processing = 4 ticks
    for (let i = 0; i < 4; i++) {
      recycler.tick()
    }

    // THEN
    expect(recycler.outputSlot).not.toBeNull()
    expect(recycler.outputSlot!.type).toBe('raw_material')
  })

  it('should take exactly 3 ticks to process', () => {
    // GIVEN
    const recycler = new Machine('rec1', 'recycler')
    recycler.start()
    recycler.addInput(createItem('circuit_basic'))

    // WHEN
    recycler.tick() // idle → processing (timer=3)

    // THEN
    expect(recycler.state).toBe('processing')

    // WHEN
    recycler.tick() // timer=2
    recycler.tick() // timer=1

    // THEN
    expect(recycler.state).toBe('processing')

    // WHEN
    recycler.tick() // timer=0 → produce, idle

    // THEN
    expect(recycler.outputSlot).not.toBeNull()
    expect(recycler.outputSlot!.type).toBe('raw_material')
  })

  it('should consume the input item on start', () => {
    // GIVEN
    const recycler = new Machine('rec1', 'recycler')
    recycler.start()
    recycler.addInput(createItem('wheel_small'))

    // WHEN
    recycler.tick() // consumes input, starts processing

    // THEN
    expect(recycler.inputSlots).toHaveLength(0)
  })

  it('should become blocked when output is full', () => {
    // GIVEN
    const recycler = new Machine('rec1', 'recycler')
    recycler.start()
    recycler.addInput(createItem('wheel_small'))
    recycler.addInput(createItem('circuit_basic'))

    // WHEN
    // Process first item (4 ticks)
    for (let i = 0; i < 4; i++) recycler.tick()
    expect(recycler.outputSlot).not.toBeNull()
    // Process second item — will finish but can't output → blocked
    for (let i = 0; i < 4; i++) recycler.tick()

    // THEN
    expect(recycler.state).toBe('blocked')
  })
})

// --- Multi-output & new commands in Simulation ---

describe('Simulation: machine subtypes & commands', () => {
  let sim: Simulation

  beforeEach(() => {
    resetItemIdCounter()
    sim = new Simulation()
  })

  it('should transfer secondary output to connected belt', () => {
    // GIVEN
    const qc = new Machine('qc1', 'quality_checker')
    qc.start()
    sim.addMachine(qc)
    const primaryBelt = new ConveyorBelt('bp', 0, 0, 1, 0)
    const secondaryBelt = new ConveyorBelt('bs', 0, 0, 0, 1)
    sim.addBelt(primaryBelt)
    sim.addBelt(secondaryBelt)
    sim.setMachineOutputBelt('qc1', 'bp', 'primary')
    sim.setMachineOutputBelt('qc1', 'bs', 'secondary')
    // Add a failing item (quality 50, default threshold 80)
    qc.addInput(createItem('wheel_small', 50))

    // WHEN
    // tick 1: idle → processing; tick 2: route → secondary output
    tickN(sim, 2)
    // tick 3: transferMachineOutputs moves item to secondaryBelt
    sim.tick()

    // THEN
    expect(secondaryBelt.getItemCount()).toBe(1)
    expect(primaryBelt.getItemCount()).toBe(0)
  })

  it('should transfer primary output to connected belt', () => {
    // GIVEN
    const qc = new Machine('qc1', 'quality_checker')
    qc.start()
    sim.addMachine(qc)
    const primaryBelt = new ConveyorBelt('bp', 0, 0, 1, 0)
    sim.addBelt(primaryBelt)
    sim.setMachineOutputBelt('qc1', 'bp', 'primary')
    // Add a passing item (quality 90)
    qc.addInput(createItem('wheel_small', 90))

    // WHEN
    tickN(sim, 3)

    // THEN
    expect(primaryBelt.getItemCount()).toBe(1)
  })

  it('should execute SET_QUALITY_THRESHOLD command', () => {
    // GIVEN
    const qc = new Machine('qc1', 'quality_checker')
    sim.addMachine(qc)

    // WHEN
    sim.enqueueCommand({
      type: 'SET_QUALITY_THRESHOLD',
      machineId: 'qc1',
      threshold: 50,
    })
    sim.tick()

    // THEN
    expect(qc.qualityThreshold).toBe(50)
  })

  it('should ignore SET_QUALITY_THRESHOLD for non-quality_checker', () => {
    // GIVEN
    const m = new Machine('m1', 'part_fabricator')
    sim.addMachine(m)

    // WHEN
    sim.enqueueCommand({
      type: 'SET_QUALITY_THRESHOLD',
      machineId: 'm1',
      threshold: 50,
    })
    sim.tick()

    // THEN
    // Should not crash, and threshold remains default on the fabricator
    expect(m.qualityThreshold).toBe(80)
  })

  it('should execute SET_SPLITTER_CONDITION command', () => {
    // GIVEN
    const sp = new Machine('sp1', 'splitter')
    sim.addMachine(sp)

    // WHEN
    sim.enqueueCommand({
      type: 'SET_SPLITTER_CONDITION',
      machineId: 'sp1',
      condition: { conditionType: 'by_item_type', itemType: 'wheel_small' },
    })
    sim.tick()

    // THEN
    expect(sp.splitterCondition).not.toBeNull()
    expect(sp.splitterCondition!.conditionType).toBe('by_item_type')
    expect(sp.splitterCondition!.itemType).toBe('wheel_small')
  })

  it('should ignore SET_SPLITTER_CONDITION for non-splitter', () => {
    // GIVEN
    const m = new Machine('m1', 'assembler')
    sim.addMachine(m)

    // WHEN
    sim.enqueueCommand({
      type: 'SET_SPLITTER_CONDITION',
      machineId: 'm1',
      condition: { conditionType: 'alternating' },
    })
    sim.tick()

    // THEN
    expect(m.splitterCondition).toBeNull()
  })

  it('should emit item_produced for secondary output', () => {
    // GIVEN
    const events: SimulationEvent[] = []
    sim.on('item_produced', (e) => events.push(e))
    const qc = new Machine('qc1', 'quality_checker')
    qc.start()
    sim.addMachine(qc)
    qc.addInput(createItem('wheel_small', 50)) // fails threshold

    // WHEN
    tickN(sim, 2)

    // THEN
    const secondaryEvents = events.filter((e) => e.data['output'] === 'secondary')
    expect(secondaryEvents.length).toBeGreaterThanOrEqual(1)
  })
})
