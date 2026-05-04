import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import type { Item } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { Simulation } from '../../../src/game/Simulation'
import { getRecipeById } from '../../../src/game/Recipe'
import type {
  SimulationEvent,
  SimulationEventType,
} from '../../../src/game/types'

/**
 * Contract: defective items reaching a Shipper (`factory_output`) must be
 * DISCARDED. They count toward the simulation's defect/quality stats but
 * NOT toward delivered outputs or robots produced.
 *
 * RED-state expectations (these tests must FAIL today):
 *   - `'item_discarded'` is not yet a `SimulationEventType` (compile-time
 *     check via assignability — locked by `npx tsc --noEmit`).
 *   - `ItemDeliveryEngine.deliver` does not check `item.isDefective` for
 *     factory_output, so it currently bumps `outputsDelivered` /
 *     `robotsProduced` and emits `'item_delivered'` / `'output_delivered'`
 *     for defective items.
 *   - `Machine.addInput` blindly increments `consumedItems` for
 *     factory_output, so `output.consumedItems` is `1` (not `0`) for a
 *     defective delivery.
 *
 * Locked design choice (call out so the implementer doesn't drift):
 *   `result.itemsDelivered` is NOT incremented for a discarded defective
 *   item — "delivered" implies "successfully shipped", and a discarded
 *   item was rejected at the dock.
 */

function tickN(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) sim.tick()
}

function defective(item: Item): Item {
  // Item.isDefective is mutable on purpose (see src/game/Item.ts).
  item.isDefective = true
  return item
}

/**
 * Build a 1-cell belt feeding a `factory_output` at (1, 0). Mirrors the
 * setup pattern already used in tests/unit/game/Simulation.test.ts so we
 * stay consistent with existing factory_output coverage.
 */
function buildShipperFactory(sim: Simulation): {
  output: Machine
  belt: ConveyorBelt
} {
  const output = new Machine('out1', 'factory_output')
  sim.addMachine(output)
  sim.setMachinePosition('out1', 1, 0)
  const belt = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
  sim.addBelt(belt)
  return { output, belt }
}

interface CapturedEvents {
  delivered: SimulationEvent[]
  outputs: SimulationEvent[]
  discarded: SimulationEvent[]
}

function captureEvents(sim: Simulation): CapturedEvents {
  const captured: CapturedEvents = { delivered: [], outputs: [], discarded: [] }
  sim.on('item_delivered', (e) => captured.delivered.push(e))
  sim.on('output_delivered', (e) => captured.outputs.push(e))
  // Cast: 'item_discarded' is intentionally NOT yet in `SimulationEventType`.
  // This file's compile-time lock (test 6 below) is the canonical assertion.
  // At runtime, `Simulation.on` stores the handler in a Map keyed by string,
  // so the registration works even before the union is widened.
  sim.on('item_discarded' as SimulationEventType, (e) =>
    captured.discarded.push(e),
  )
  return captured
}

describe('Shipper (factory_output) discards defective items', () => {
  let sim: Simulation

  beforeEach(() => {
    resetItemIdCounter()
    sim = new Simulation()
  })

  it('discards a defective robot at factory_output (no delivery, defects++, item removed, item_discarded emitted)', () => {
    // GIVEN — Shipper at end of a 1-cell belt, defective robot on the belt
    const { output, belt } = buildShipperFactory(sim)
    const item = defective(createItem('robot_worker'))
    belt.addItem(item)
    const events = captureEvents(sim)

    // WHEN — 11 ticks for the belt to deliver the item
    tickN(sim, 11)

    // THEN — discard contract:
    //   * outputsDelivered NOT bumped
    //   * robotsProduced NOT bumped (even though it's a robot)
    //   * defects bumped by 1 (counts toward quality stats)
    //   * factory_output.consumedItems NOT bumped (rejected, not consumed)
    //   * itemsDelivered NOT bumped — locked design choice (see header)
    //   * belt is empty (item removed, no jam)
    //   * 'item_discarded' emitted; 'item_delivered' / 'output_delivered' NOT emitted
    expect(sim.outputsDelivered).toBe(0)
    expect(sim.robotsProduced).toBe(0)
    expect(sim.defects).toBe(1)
    expect(sim.itemsDelivered).toBe(0)
    expect(output.consumedItems).toBe(0)
    expect(belt.getItemCount()).toBe(0)
    expect(events.outputs).toHaveLength(0)
    expect(events.delivered).toHaveLength(0)
    expect(events.discarded).toHaveLength(1)
  })

  it('emits an item_discarded event with the locked payload shape { itemId, itemType, machineId, reason: "defective" }', () => {
    // GIVEN
    const { belt } = buildShipperFactory(sim)
    const item = defective(createItem('robot_explorer'))
    belt.addItem(item)
    const events = captureEvents(sim)

    // WHEN
    tickN(sim, 11)

    // THEN — payload shape is locked. `reason` is a string-literal so future
    // discard reasons (e.g. 'wrong_type', 'over_capacity') can extend without
    // touching this assertion.
    expect(events.discarded).toHaveLength(1)
    const data = events.discarded[0].data
    expect(data['itemId']).toBe(item.id)
    expect(data['itemType']).toBe('robot_explorer')
    expect(data['machineId']).toBe('out1')
    expect(data['reason']).toBe('defective')
  })

  it('delivers a clean robot at factory_output normally (regression — unchanged from today)', () => {
    // GIVEN — same Shipper setup, but the robot is NOT defective
    const { output, belt } = buildShipperFactory(sim)
    belt.addItem(createItem('robot_worker'))
    const events = captureEvents(sim)

    // WHEN
    tickN(sim, 11)

    // THEN — full delivery, no discard
    expect(sim.outputsDelivered).toBe(1)
    expect(sim.robotsProduced).toBe(1)
    expect(sim.defects).toBe(0)
    expect(sim.itemsDelivered).toBe(1)
    expect(output.consumedItems).toBe(1)
    expect(belt.getItemCount()).toBe(0)
    expect(events.delivered).toHaveLength(1)
    expect(events.outputs).toHaveLength(1)
    expect(events.discarded).toHaveLength(0)
  })

  it('accumulates correctly for a mixed delivery of 3 clean robots + 2 defective robots', () => {
    // GIVEN — Shipper at end of belt
    const { output, belt } = buildShipperFactory(sim)
    const events = captureEvents(sim)

    // WHEN — push 5 robots through sequentially: clean, defective, clean,
    // defective, clean. (Single-cell belt; we deliver each before pushing
    // the next, mirroring the existing multi-delivery pattern in
    // Simulation.test.ts → 'should count multiple deliveries to factory_output'.)
    belt.addItem(createItem('robot_worker'))
    tickN(sim, 11)
    belt.addItem(defective(createItem('robot_explorer')))
    tickN(sim, 11)
    belt.addItem(createItem('robot_guardian'))
    tickN(sim, 11)
    belt.addItem(defective(createItem('robot_worker')))
    tickN(sim, 11)
    belt.addItem(createItem('robot_explorer'))
    tickN(sim, 11)

    // THEN — counters accumulate correctly across the mix
    expect(sim.outputsDelivered).toBe(3)
    expect(sim.robotsProduced).toBe(3)
    expect(sim.defects).toBe(2)
    expect(sim.itemsDelivered).toBe(3)
    expect(output.consumedItems).toBe(3)
    expect(events.outputs).toHaveLength(3)
    expect(events.delivered).toHaveLength(3)
    expect(events.discarded).toHaveLength(2)

    // Existing stats math (Simulation.getStats().qualityPercent) must still
    // produce 60% once `defects` is incremented from this new path:
    //   robotsProduced / (robotsProduced + defects) = 3 / (3 + 2) = 60%
    expect(sim.getStats().qualityPercent).toBe(60)
  })

  it('regression: 1 clean robot + 1 defective robot at factory_output → qualityPercent === 50%', () => {
    // GIVEN
    const { belt } = buildShipperFactory(sim)

    // WHEN
    belt.addItem(createItem('robot_worker'))
    tickN(sim, 11)
    belt.addItem(defective(createItem('robot_worker')))
    tickN(sim, 11)

    // THEN — verifies that the existing `qualityPercent` formula
    // (`robotsProduced / (robotsProduced + defects) * 100`) still works
    // once the new factory_output discard path increments `defects`.
    expect(sim.robotsProduced).toBe(1)
    expect(sim.defects).toBe(1)
    expect(sim.getStats().qualityPercent).toBe(50)
  })

  it('discards a defective non-robot item (wheel_small) at factory_output', () => {
    // GIVEN — defective NON-robot item is also discarded at the Shipper.
    // Locks that the discard is keyed on `isDefective`, not on robot-ness.
    const { output, belt } = buildShipperFactory(sim)
    const item = defective(createItem('wheel_small'))
    belt.addItem(item)
    const events = captureEvents(sim)

    // WHEN
    tickN(sim, 11)

    // THEN
    expect(sim.outputsDelivered).toBe(0)
    expect(sim.robotsProduced).toBe(0) // wasn't a robot anyway, but lock it
    expect(sim.defects).toBe(1)
    expect(sim.itemsDelivered).toBe(0)
    expect(output.consumedItems).toBe(0)
    expect(belt.getItemCount()).toBe(0)
    expect(events.outputs).toHaveLength(0)
    expect(events.delivered).toHaveLength(0)
    expect(events.discarded).toHaveLength(1)
    expect(events.discarded[0].data['itemType']).toBe('wheel_small')
    expect(events.discarded[0].data['reason']).toBe('defective')
  })

  it('regression: a defective item delivered to a NON-Shipper consumer machine is NOT discarded', () => {
    // GIVEN — assembler accepts wheel_small (recipe assemble_drivetrain_basic
    // consumes wheel_small + circuit_basic). Defective-only-discard happens
    // ONLY at the Shipper; an assembler/painter/etc. accepts the item
    // normally so existing transformations (recycler, quality_checker, etc.)
    // don't break. Lock this so future devs don't accidentally add discard
    // logic to other machine types.
    const recipe = getRecipeById('assemble_drivetrain_basic')
    if (!recipe) throw new Error('assemble_drivetrain_basic recipe not found')

    const assembler = new Machine('asm1', 'assembler')
    assembler.setRecipe(recipe)
    sim.addMachine(assembler)
    sim.setMachinePosition('asm1', 1, 0)
    const belt = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
    sim.addBelt(belt)

    belt.addItem(defective(createItem('wheel_small')))
    const events = captureEvents(sim)

    // WHEN
    tickN(sim, 11)

    // THEN — normal delivery: item lands in inputSlots, no defects bump,
    // no item_discarded event. (Assembler is left disabled, so it doesn't
    // consume the input — keeps the assertion deterministic.)
    expect(assembler.inputSlots).toHaveLength(1)
    expect(assembler.inputSlots[0].type).toBe('wheel_small')
    expect(assembler.inputSlots[0].isDefective).toBe(true)
    expect(sim.defects).toBe(0)
    expect(sim.outputsDelivered).toBe(0)
    expect(sim.itemsDelivered).toBe(1)
    expect(belt.getItemCount()).toBe(0)
    expect(events.discarded).toHaveLength(0)
    // 'item_delivered' fires for all successful machine deliveries today;
    // we lock it for the assembler path so a future "discard at consumer"
    // misimplementation can't silently swap it.
    expect(events.delivered).toHaveLength(1)
    expect(events.outputs).toHaveLength(0)
  })

  it("locks 'item_discarded' as a member of the SimulationEventType union (compile-time)", () => {
    // Compile-time lock: this assignment ONLY type-checks once
    // 'item_discarded' is added to the `SimulationEventType` union in
    // src/game/types.ts. `npx tsc --noEmit` is the gate — vitest itself
    // uses esbuild and does NOT type-check, so the file currently runs at
    // runtime even before the union is widened. The runtime expectation
    // here is trivially satisfied; the real assertion is the type
    // annotation on `eventType`.
    const eventType: SimulationEventType = 'item_discarded'
    expect(eventType).toBe('item_discarded')
  })

  // -------------------------------------------------------------------------
  // No double-counting of defects across QC.secondary → Shipper
  //
  // CONTRACT (the bug this guards against):
  //   `Simulation.defects` must increment EXACTLY ONCE per defective item
  //   that travels `quality_checker → secondary belt → factory_output`.
  //
  // Today the engine double-counts:
  //   1. `Simulation.updateMachines` bumps `defects` whenever a
  //      quality_checker parks an item in `secondaryOutputSlot` —
  //      regardless of `item.isDefective`.
  //   2. `Simulation.runDelivery` bumps `defects` again via
  //      `result.defectsDiscarded` when the Shipper discards the same
  //      defective item (slice-3 contract above).
  //
  // The fix: in `updateMachines`, do NOT bump `defects` when the routed
  // secondary item is `isDefective === true` — defective items are
  // counted at the factory boundary (Shipper) instead. The CLEAN
  // low-quality QC.secondary path must keep bumping `defects` so the
  // existing quality-stats behavior survives.
  // -------------------------------------------------------------------------

  it('defects counts a defective item exactly once when it goes QC.secondary → Shipper (no double counting)', () => {
    // GIVEN — quality_checker at (1,0) whose SECONDARY output feeds a
    // belt landing on a factory_output (Shipper) at (3,0). Default
    // qualityThreshold is 80; we feed a defective item with quality=0
    // so the QC routes it to `secondary` AND the Shipper sees it as
    // defective. Position (1,0) for QC is unused at runtime here (we
    // pre-place into inputSlots) but mirrors the existing test pattern.
    const qc = new Machine('qc1', 'quality_checker')
    qc.start() // enable processing — Machine.tick early-exits when disabled
    sim.addMachine(qc)
    sim.setMachinePosition('qc1', 1, 0)

    const output = new Machine('out1', 'factory_output')
    sim.addMachine(output)
    sim.setMachinePosition('out1', 3, 0)

    const beltSecondary = new ConveyorBelt('b_qc_secondary', 2, 0, 3, 0, 1.0)
    sim.addBelt(beltSecondary)
    sim.setMachineOutputBelt('qc1', 'b_qc_secondary', 'secondary')

    // Pre-place a defective, low-quality item directly in QC's input
    // queue (avoids needing an upstream feeder belt — the contract under
    // test starts at the QC and ends at the Shipper).
    const item = defective(createItem('wheel_small', 0))
    qc.inputSlots.push(item)

    // WHEN — enough ticks for: QC route to secondary (1 idle→processing
    // tick + 1 processing→park tick) + transfer to belt + 10 belt
    // advances (speed 1.0, dt=0.1) + delivery. 25 is comfortable.
    tickN(sim, 25)

    // THEN — defects must be EXACTLY 1, not 2. The defective item went
    // through both bump sites; only one of them is the canonical count.
    // outputsDelivered / robotsProduced stay 0 (Shipper discards it).
    expect(sim.defects).toBe(1)
    expect(sim.outputsDelivered).toBe(0)
    expect(sim.robotsProduced).toBe(0)
  })

  it('defects still counts a CLEAN low-quality item routed via QC.secondary (regression)', () => {
    // GIVEN — same QC setup, but the item is NOT defective (just
    // low-quality). QC.secondary is wired to a Recycler — NOT a
    // Shipper — so the new factory_output discard path cannot fire.
    // The only `defects` bump available is the QC→secondary bump in
    // `updateMachines`, which the fix MUST preserve for clean items.
    const qc = new Machine('qc1', 'quality_checker')
    qc.start()
    sim.addMachine(qc)
    sim.setMachinePosition('qc1', 1, 0)

    const recycler = new Machine('rec1', 'recycler')
    sim.addMachine(recycler)
    sim.setMachinePosition('rec1', 3, 0)

    const beltSecondary = new ConveyorBelt('b_qc_secondary', 2, 0, 3, 0, 1.0)
    sim.addBelt(beltSecondary)
    sim.setMachineOutputBelt('qc1', 'b_qc_secondary', 'secondary')

    // Clean (isDefective=false) but quality=0 so QC still routes to
    // secondary. createItem defaults isDefective=false, so no override.
    qc.inputSlots.push(createItem('wheel_small', 0))

    // WHEN — only need enough ticks for the QC routing decision (the
    // `defects` bump happens in `updateMachines` the moment QC parks
    // the item in secondaryOutputSlot). 5 ticks is plenty.
    tickN(sim, 5)

    // THEN — existing QC behavior survives the fix: clean low-quality
    // items routed to secondary still increment `defects` by 1.
    expect(sim.defects).toBe(1)
  })
})
