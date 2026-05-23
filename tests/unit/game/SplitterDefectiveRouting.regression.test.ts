/**
 * Regression: Splitter `on item arrives` defective routing (bug from
 * user's projects/Assembly.json).
 *
 * Handler shape under test (mirrors Assembly.json):
 *   events.onItemArrives(Machine.E, () => {
 *     if (logic.currentItemIsDefective()) {
 *       machines.routeItemsTo(Machine.E, SplitterOutputs.Right)
 *     } else {
 *       machines.routeItemsTo(Machine.E, SplitterOutputs.Left)
 *     }
 *   })
 *
 * End-to-end wiring exercised:
 *   1. Item lands on splitter's input via a belt → ItemDeliveryEngine
 *      pushes an `arrival` record.
 *   2. Simulation.runDelivery calls the item-arrival bridge with
 *      (machineId, item).
 *   3. Bridge → BlockInterpreter.triggerOnItemArrives reads
 *      item.isDefective and emits a SET_OUTPUT_SIDES command.
 *   4. queueRunner applies SET_OUTPUT_SIDES on the next tick BEFORE
 *      tickSplitter routes the queued input.
 *   5. Splitter parks the item in the correct output slot (secondary
 *      for Right, tertiary for Left), which transferMachineOutputs
 *      moves onto the corresponding output belt.
 *
 * Assertion: defective items must reach the RIGHT belt; clean items
 * must reach the LEFT belt. Per-item, NOT a sticky state from the
 * first item.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Simulation } from '../../../src/game/Simulation'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'
import type { Item } from '../../../src/game/Item'

const SPLITTER_ID = 'machine_5' // Machine.E → machine_5 (resolveMachineId convention)

interface Fixture {
  sim: Simulation
  interpreter: BlockInterpreter
  splitter: Machine
  inputBelt: ConveyorBelt
  rightBelt: ConveyorBelt
  leftBelt: ConveyorBelt
}

/**
 * Build: input belt (0,0)→(1,0) → splitter at (1,0) →
 *        right belt (1,0)→(2,0)  (port: secondary)
 *        left  belt (1,0)→(1,1)  (port: tertiary)
 */
function setupSplitterFixture(): Fixture {
  const sim = new Simulation()
  const interpreter = new BlockInterpreter()

  // Register the handler exactly as Assembly.json emits it.
  interpreter.interpret(`
    events.onItemArrives(Machine.E, () => {
      if (logic.currentItemIsDefective()) {
        machines.routeItemsTo(Machine.E, SplitterOutputs.Right)
      } else {
        machines.routeItemsTo(Machine.E, SplitterOutputs.Left)
      }
    })
  `)

  sim.setItemArrivalBridge((machineId, item) =>
    interpreter.triggerOnItemArrives(machineId, item),
  )

  const splitter = new Machine(SPLITTER_ID, 'splitter')
  // Matches production: Assembly.json calls `machines.startMachine(Machine.E)`.
  // Without start(), `Machine.tick()` early-returns and items pile up in the
  // input slot — so any "items not routed" failure here is the routing logic,
  // not a missing start.
  splitter.start()
  sim.addMachine(splitter)
  sim.setMachinePosition(SPLITTER_ID, 1, 0)

  const inputBelt = new ConveyorBelt('belt_in', 0, 0, 1, 0, 1.0)
  const rightBelt = new ConveyorBelt('belt_right', 1, 0, 2, 0, 1.0)
  const leftBelt = new ConveyorBelt('belt_left', 1, 0, 1, 1, 1.0)
  sim.addBelt(inputBelt)
  sim.addBelt(rightBelt)
  sim.addBelt(leftBelt)

  // Wire output ports — splitter routing maps:
  //   right side  → secondary port
  //   left side   → tertiary port
  //   forward     → primary
  sim.setMachineOutputBelt(SPLITTER_ID, 'belt_right', 'secondary')
  sim.setMachineOutputBelt(SPLITTER_ID, 'belt_left', 'tertiary')

  return { sim, interpreter, splitter, inputBelt, rightBelt, leftBelt }
}

function placeReadyItem(belt: ConveyorBelt, item: Item): void {
  belt.addItem(item)
  item.positionOnBelt = 1.0 // ready for delivery on next tick
}

function beltContainsId(belt: ConveyorBelt, itemId: string): boolean {
  return belt.getItems().some((i) => i.id === itemId)
}

/**
 * Tick repeatedly until the item appears on a downstream output belt
 * (or `maxTicks` elapses — guards against infinite loops if the bug
 * silently drops items).
 */
function tickUntilRouted(fix: Fixture, itemId: string, maxTicks = 10): {
  rightHit: boolean
  leftHit: boolean
  ticksUsed: number
} {
  for (let i = 0; i < maxTicks; i++) {
    fix.sim.tick()
    const onRight = beltContainsId(fix.rightBelt, itemId)
    const onLeft = beltContainsId(fix.leftBelt, itemId)
    if (onRight || onLeft) return { rightHit: onRight, leftHit: onLeft, ticksUsed: i + 1 }
  }
  return { rightHit: false, leftHit: false, ticksUsed: maxTicks }
}

describe('Splitter defective routing — Assembly.json regression', () => {
  let fix: Fixture

  beforeEach(() => {
    resetItemIdCounter()
    fix = setupSplitterFixture()
  })

  it('routes a defective item out the RIGHT port', () => {
    const defective = createItem('wheel_small')
    defective.isDefective = true
    placeReadyItem(fix.inputBelt, defective)

    const result = tickUntilRouted(fix, defective.id)

    expect(result.rightHit, `defective item ${defective.id} did not reach RIGHT belt (leftHit=${result.leftHit}, ticks=${result.ticksUsed})`).toBe(true)
    expect(result.leftHit).toBe(false)
  })

  it('routes a non-defective item out the LEFT port', () => {
    const clean = createItem('wheel_small') // isDefective defaults to false
    placeReadyItem(fix.inputBelt, clean)

    const result = tickUntilRouted(fix, clean.id)

    expect(result.leftHit, `clean item ${clean.id} did not reach LEFT belt (rightHit=${result.rightHit}, ticks=${result.ticksUsed})`).toBe(true)
    expect(result.rightHit).toBe(false)
  })

  it('routes per-item: defective→Right then clean→Left does NOT leak state', () => {
    // First: defective — should go Right.
    const defective = createItem('wheel_small')
    defective.isDefective = true
    placeReadyItem(fix.inputBelt, defective)
    const firstResult = tickUntilRouted(fix, defective.id)
    expect(firstResult.rightHit, 'defective item should exit RIGHT').toBe(true)

    // Second: clean — must now go Left (not stuck on Right from prior cfg).
    const clean = createItem('wheel_small')
    placeReadyItem(fix.inputBelt, clean)
    const secondResult = tickUntilRouted(fix, clean.id)

    expect(secondResult.leftHit, `clean item ${clean.id} should exit LEFT; rightHit=${secondResult.rightHit}`).toBe(true)
    expect(secondResult.rightHit).toBe(false)
  })

  // -------------------------------------------------------------------
  // Simultaneous arrival — two items arrive at the splitter in the
  // SAME tick (via two converging input belts). The decision must be
  // per-item: defective→Right, clean→Left. The current implementation
  // makes routing a sticky `outputSidesConfig` bitfield mutated by the
  // last bridge call, so both queued items get routed together to
  // whichever side was set last — this is the user's reported bug
  // ("defective items continue going to the same side as non-defective").
  // -------------------------------------------------------------------
  it('routes per-item when defective + clean arrive in the SAME tick (converging input belts)', () => {
    // Add a second input belt from (1, -1) → (1, 0) so both belts feed
    // the splitter at (1,0) simultaneously.
    const inputBelt2 = new ConveyorBelt('belt_in2', 1, -1, 1, 0, 1.0)
    fix.sim.addBelt(inputBelt2)

    const defective = createItem('wheel_small')
    defective.isDefective = true
    placeReadyItem(fix.inputBelt, defective)

    const clean = createItem('wheel_small')
    placeReadyItem(inputBelt2, clean)

    // Run until both items have exited the splitter onto an output belt
    // (or maxTicks elapses). Track each item independently.
    const seen = { defectiveRight: false, defectiveLeft: false, cleanRight: false, cleanLeft: false }
    for (let i = 0; i < 12; i++) {
      fix.sim.tick()
      if (beltContainsId(fix.rightBelt, defective.id)) seen.defectiveRight = true
      if (beltContainsId(fix.leftBelt, defective.id)) seen.defectiveLeft = true
      if (beltContainsId(fix.rightBelt, clean.id)) seen.cleanRight = true
      if (beltContainsId(fix.leftBelt, clean.id)) seen.cleanLeft = true
      if ((seen.defectiveRight || seen.defectiveLeft) && (seen.cleanRight || seen.cleanLeft)) break
    }

    expect(
      seen.defectiveRight,
      `defective item ${defective.id} did not exit RIGHT (defectiveLeft=${seen.defectiveLeft})`,
    ).toBe(true)
    expect(seen.defectiveLeft).toBe(false)
    expect(
      seen.cleanLeft,
      `clean item ${clean.id} did not exit LEFT (cleanRight=${seen.cleanRight})`,
    ).toBe(true)
    expect(seen.cleanRight).toBe(false)
  })
})
