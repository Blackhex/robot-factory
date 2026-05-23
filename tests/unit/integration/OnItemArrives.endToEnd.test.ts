/**
 * Task E3 (RED) — End-to-end coverage for the generalized item-arrival
 * event hat wired across the editor / sim layer boundary.
 *
 * Wires the layers as the player would experience them — interpreter
 * (`events.onItemArrives` registration + `routeItemsTo` body
 * call) → simulation `setItemArrivalBridge` → delivery engine fires
 * the bridge on every machine input arrival → returned
 * `SET_OUTPUT_SIDES` command flows through the queue → dispatcher
 * mutates the targeted splitter's `outputSidesConfig`.
 *
 * Companion unit-level coverage:
 *   - Sim bridge mechanism:
 *     `tests/unit/game/Simulation.itemArrivalBridge.test.ts`
 *   - Interpreter trigger:
 *     `tests/unit/editor/BlockInterpreter.triggerOnItemArrives.test.ts`
 *
 * MUST FAIL against the current codebase because:
 *   - `Simulation.setItemArrivalBridge` does not exist.
 *   - `BlockInterpreter.triggerOnItemArrives` does not exist.
 *   - The simulation does not invoke any item-arrival bridge.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'
import { Simulation } from '../../../src/game/Simulation'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { getRecipeById } from '../../../src/game/Recipe'
import {
  SPLITTER_SIDE_BIT,
  SPLITTER_ALL_SIDES_BITS,
  type SimulationCommand,
} from '../../../src/game/types'
import type { Item } from '../../../src/game/Item'

// --- Narrow accessors ---------------------------------------------------

type ItemArrivalBridgeFn = (machineId: string, item: Item) => SimulationCommand[]

function setItemArrivalBridge(
  sim: Simulation,
  bridge: ItemArrivalBridgeFn | null,
): void {
  const fn = (
    sim as unknown as {
      setItemArrivalBridge?: (b: ItemArrivalBridgeFn | null) => void
    }
  ).setItemArrivalBridge
  if (typeof fn !== 'function') {
    throw new TypeError('Simulation.setItemArrivalBridge is not a function')
  }
  fn.call(sim, bridge)
}

function callTriggerOnItemArrives(
  interpreter: BlockInterpreter,
  machineId: string,
  item: Item,
): SimulationCommand[] {
  const fn = (
    interpreter as unknown as {
      triggerOnItemArrives?: (machineId: string, item: Item) => SimulationCommand[]
    }
  ).triggerOnItemArrives
  if (typeof fn !== 'function') {
    throw new TypeError('BlockInterpreter.triggerOnItemArrives is not a function')
  }
  return fn.call(interpreter, machineId, item)
}

describe('Item-arrival bridge — end-to-end (interpreter ⇄ sim)', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('item arriving at non-splitter machine triggers handler that updates splitter config; later arrival at splitter has no handler', () => {
    // GIVEN — the editor program registers `on item arrives at Machine.A`
    // (assembler) with a body that updates Machine.B (splitter) to
    // route Right. The PXT block (id `factory_on_item_arrives`) fires
    // for ANY machine, so registering it for an assembler is intentional.
    const interpreter = new BlockInterpreter()
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        machines.routeItemsTo(Machine.B, SplitterOutputs.Right)
      })
    `)

    const sim = new Simulation()

    // Machine.A → machine_1 (assembler that accepts wheels via
    // assemble_drivetrain_basic recipe). Place at (1,0) at the end of
    // belt b1.
    const assembler = new Machine('machine_1', 'assembler')
    const recipe = getRecipeById('assemble_drivetrain_basic')
    if (!recipe) throw new Error('assemble_drivetrain_basic recipe not found')
    assembler.setRecipe(recipe)
    sim.addMachine(assembler)
    sim.setMachinePosition('machine_1', 1, 0)

    // Machine.B → machine_2 (splitter); the bridge handler will
    // update its outputSidesConfig via SET_OUTPUT_SIDES.
    const splitter = new Machine('machine_2', 'splitter')
    sim.addMachine(splitter)
    expect(splitter.outputSidesConfig).toBe(SPLITTER_ALL_SIDES_BITS)

    // Belt b1 from (0,0) → (1,0) feeds the assembler. One wheel at
    // position 1.0 so a single tick triggers delivery.
    const beltToAssembler = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
    sim.addBelt(beltToAssembler)
    const wheel = createItem('wheel_small')
    beltToAssembler.addItem(wheel)
    wheel.positionOnBelt = 1.0

    // WHEN — wire the bridge: every machine arrival in the sim asks
    // the interpreter for the registered handler's commands.
    setItemArrivalBridge(sim, (machineId, item) =>
      callTriggerOnItemArrives(interpreter, machineId, item),
    )

    // Tick 1 — belt advances + delivery to the assembler triggers the
    // bridge. The bridge runs the handler (registered for machine_1),
    // which emits SET_OUTPUT_SIDES{machine_2, Right}. That command is
    // enqueued but NOT yet dispatched (queueRunner runs at the START
    // of each tick).
    sim.tick()
    expect(assembler.inputSlots.length).toBeGreaterThanOrEqual(1)
    expect(splitter.outputSidesConfig).toBe(SPLITTER_ALL_SIDES_BITS)

    // Tick 2 — queueRunner drains the SET_OUTPUT_SIDES command.
    sim.tick()
    expect(splitter.outputSidesConfig).toBe(SPLITTER_SIDE_BIT.right)

    // THEN — verify the "no second command" leg. Cause an item to
    // arrive at the splitter directly (via a separate belt) and ensure
    // the bridge invocation for `machine_2` finds no registered
    // handler, so nothing further gets enqueued.
    const beltToSplitter = new ConveyorBelt('b2', 0, 1, 1, 1, 1.0)
    sim.addBelt(beltToSplitter)
    sim.setMachinePosition('machine_2', 1, 1)
    const wheel2 = createItem('wheel_small')
    beltToSplitter.addItem(wheel2)
    wheel2.positionOnBelt = 1.0

    // Snapshot the splitter's config before the next tick. If a stray
    // command got enqueued, the next tick would mutate it.
    const snapshotBefore = splitter.outputSidesConfig

    sim.tick() // delivery to splitter — bridge fires for machine_2
    sim.tick() // any enqueued commands would apply now

    expect(splitter.outputSidesConfig).toBe(snapshotBefore)
    expect(splitter.outputSidesConfig).toBe(SPLITTER_SIDE_BIT.right)
  })
})
