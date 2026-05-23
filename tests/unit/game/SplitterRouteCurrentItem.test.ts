/**
 * RED — `ROUTE_CURRENT_ITEM_TO` end-to-end through the splitter, via
 * the per-item override path. Pins the user-facing behaviour of the
 * new `machines.routeCurrentItemTo(machine, side)` block as it flows
 * from interpreter → command queue → dispatcher → splitter tick.
 *
 * Distinct from `SET_OUTPUT_SIDES` (the sticky multiplex config
 * already exercised by `tests/unit/game/SplitterEventHandler.test.ts`
 * and `tests/unit/integration/RouteItemsTo.endToEnd.test.ts`):
 *
 *   - The new command MUST NOT mutate `outputSidesConfig`.
 *   - The new command applies ONLY to the specific item whose
 *     `id === command.itemId`. Other items in `inputSlots` continue
 *     to follow the splitter's default round-robin behaviour.
 *
 * Written BEFORE the implementation lands and MUST FAIL against the
 * current codebase because the `ROUTE_CURRENT_ITEM_TO` command variant
 * does not exist in `SimulationCommand`, and no dispatcher case handles
 * it.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'
import { Machine } from '../../../src/game/Machine'
import { Simulation } from '../../../src/game/Simulation'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import {
  SPLITTER_ALL_SIDES_BITS,
  type SimulationCommand,
} from '../../../src/game/types'
import type { Item } from '../../../src/game/Item'

const SPLITTER_ID = 's1'

function wireOutputBelts(sim: Simulation, machineId: string): void {
  // Register sentinel belt ids on all three output ports so
  // `env.isOutputConnected` returns true for every side; the real
  // belts are not registered via `sim.addBelt`, so output slots are
  // not drained between ticks — letting tests inspect them in place.
  sim.setMachineOutputBelt(machineId, `${machineId}_bp`, 'primary')
  sim.setMachineOutputBelt(machineId, `${machineId}_bs`, 'secondary')
  sim.setMachineOutputBelt(machineId, `${machineId}_bt`, 'tertiary')
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

function clearSplitterOutputs(splitter: Machine): void {
  splitter.outputSlot = null
  splitter.secondaryOutputSlot = null
  splitter.tertiaryOutputSlot = null
}

describe('Splitter — routeCurrentItemTo per-item override', () => {
  let sim: Simulation
  let splitter: Machine
  let interpreter: BlockInterpreter

  beforeEach(() => {
    resetItemIdCounter()
    sim = new Simulation()
    splitter = new Machine(SPLITTER_ID, 'splitter')
    sim.addMachine(splitter)
    wireOutputBelts(sim, SPLITTER_ID)
    splitter.start()

    interpreter = new BlockInterpreter()
    // Handler programs `Machine.A` → resolves to `machine_1`. Register
    // the handler for SPLITTER_ID so our manual bridge call routes to
    // it directly. We do this by interpreting source that registers
    // the handler keyed by Machine.A (machine_1), then triggering with
    // 'machine_1' below. Bind SPLITTER_ID to 'machine_1' instead of
    // 's1' so the lookup matches.
    splitter // (assigned above)
  })

  // -------------------------------------------------------------------
  // Helper: register the canonical defective-vs-clean handler that
  // uses `routeCurrentItemTo`. Returns the trigger machine id the
  // handler is registered for ('machine_1').
  // -------------------------------------------------------------------
  function installDefectiveVsCleanHandler(): string {
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        if (logic.currentItemIsDefective()) {
          machines.routeCurrentItemTo(Machine.A, SplitterOutputs.Right)
        } else {
          machines.routeCurrentItemTo(Machine.A, SplitterOutputs.Forward)
        }
      })
    `)
    return 'machine_1'
  }

  // -------------------------------------------------------------------
  // S1 — Two items in the SAME tick: defective + clean. Per-item
  // routing must place defective on Right (secondary) and clean on
  // Forward (primary), regardless of arrival order in `inputSlots`.
  // -------------------------------------------------------------------
  it('S1: two items arriving same tick (defective + clean) each exit their handler-chosen side', () => {
    // Re-wire the splitter under id `machine_1` so the handler
    // registration (Machine.A → machine_1) matches the splitter the
    // commands target. Replace the beforeEach `s1` splitter with a
    // fresh `machine_1` splitter for this test.
    sim = new Simulation()
    splitter = new Machine('machine_1', 'splitter')
    sim.addMachine(splitter)
    wireOutputBelts(sim, 'machine_1')
    splitter.start()
    interpreter = new BlockInterpreter()

    const handlerMachineId = installDefectiveVsCleanHandler()
    expect(handlerMachineId).toBe('machine_1')

    const defective = createItem('wheel_small')
    defective.isDefective = true
    const cleanItem = createItem('wheel_small')

    // Both items arrive in the same delivery pass → bridge invoked
    // once per item → both ROUTE_CURRENT_ITEM_TO commands enqueued
    // BEFORE the splitter ticks them out.
    const defCmds = callTriggerOnItemArrives(interpreter, 'machine_1', defective)
    const cleanCmds = callTriggerOnItemArrives(interpreter, 'machine_1', cleanItem)
    sim.enqueueCommands([...defCmds, ...cleanCmds])

    // Add to inputSlots in arrival order. Clean arrives first → would
    // otherwise consume the round-robin slot 0 (Left under default
    // config), proving that per-item override beats sticky config.
    splitter.addInput(cleanItem)
    splitter.addInput(defective)

    sim.tick()

    // Defective → Right → secondary; clean → Forward → primary.
    expect(splitter.outputSlot, 'forward (primary) holds the clean item').toBe(cleanItem)
    expect(splitter.secondaryOutputSlot, 'right (secondary) holds the defective item').toBe(defective)
    expect(splitter.tertiaryOutputSlot, 'left (tertiary) must stay empty').toBeNull()
    expect(splitter.inputSlots).toHaveLength(0)
  })

  // -------------------------------------------------------------------
  // S2 — Interleaved 10 items across consecutive ticks. Each item's
  // own handler invocation chooses its side; the splitter must honour
  // each per-item override even though the default round-robin would
  // produce a different sequence.
  // -------------------------------------------------------------------
  it('S2: ten items interleaved defective/clean across ticks each exit their handler-chosen side', () => {
    sim = new Simulation()
    splitter = new Machine('machine_1', 'splitter')
    sim.addMachine(splitter)
    wireOutputBelts(sim, 'machine_1')
    splitter.start()
    interpreter = new BlockInterpreter()
    installDefectiveVsCleanHandler()

    type Slot = 'primary' | 'secondary' | 'tertiary'
    const observed: Slot[] = []

    for (let i = 0; i < 10; i++) {
      const isDefective = i % 2 === 0 // even = defective, odd = clean
      const item = createItem('wheel_small')
      item.isDefective = isDefective
      const cmds = callTriggerOnItemArrives(interpreter, 'machine_1', item)
      sim.enqueueCommands(cmds)
      splitter.addInput(item)
      sim.tick()

      let landed: Slot | null = null
      if (splitter.outputSlot === item) landed = 'primary'
      else if (splitter.secondaryOutputSlot === item) landed = 'secondary'
      else if (splitter.tertiaryOutputSlot === item) landed = 'tertiary'
      expect(
        landed,
        `iteration ${i} (${isDefective ? 'defective' : 'clean'}) must land in a single output slot`,
      ).not.toBeNull()
      observed.push(landed!)

      // Drain so the next tick has empty outputs.
      clearSplitterOutputs(splitter)
    }

    // Defective items → secondary (Right); clean items → primary (Forward).
    const expected: Slot[] = [
      'secondary', 'primary', 'secondary', 'primary', 'secondary',
      'primary', 'secondary', 'primary', 'secondary', 'primary',
    ]
    expect(observed).toEqual(expected)
  })

  // -------------------------------------------------------------------
  // S3 — Sticky `outputSidesConfig` is never mutated by the per-item
  // routing path. The whole point of the new block is to leave the
  // persistent config alone (unlike `routeItemsTo`).
  // -------------------------------------------------------------------
  it('S3: outputSidesConfig is unchanged after a run of routeCurrentItemTo-driven routing', () => {
    sim = new Simulation()
    splitter = new Machine('machine_1', 'splitter')
    sim.addMachine(splitter)
    wireOutputBelts(sim, 'machine_1')
    splitter.start()
    interpreter = new BlockInterpreter()
    installDefectiveVsCleanHandler()

    expect(splitter.outputSidesConfig).toBe(SPLITTER_ALL_SIDES_BITS)

    for (let i = 0; i < 5; i++) {
      const item = createItem('wheel_small')
      item.isDefective = i % 2 === 0
      const cmds = callTriggerOnItemArrives(interpreter, 'machine_1', item)
      sim.enqueueCommands(cmds)
      splitter.addInput(item)
      sim.tick()
      clearSplitterOutputs(splitter)
    }

    expect(
      splitter.outputSidesConfig,
      'routeCurrentItemTo must not touch the sticky multiplex config',
    ).toBe(SPLITTER_ALL_SIDES_BITS)
  })

  // -------------------------------------------------------------------
  // S4 — Multiple `routeCurrentItemTo` calls in the SAME handler: the
  // LAST call wins. Pinned per locked design decision (2).
  // -------------------------------------------------------------------
  it('S4: last routeCurrentItemTo call in the handler wins (override is overwritten)', () => {
    sim = new Simulation()
    splitter = new Machine('machine_1', 'splitter')
    sim.addMachine(splitter)
    wireOutputBelts(sim, 'machine_1')
    splitter.start()
    interpreter = new BlockInterpreter()

    // Handler routes the same item TWICE: first to Left, then to
    // Right. The Right (last) call must be the one that takes effect.
    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        machines.routeCurrentItemTo(Machine.A, SplitterOutputs.Left)
        machines.routeCurrentItemTo(Machine.A, SplitterOutputs.Right)
      })
    `)

    const item = createItem('wheel_small')
    const cmds = callTriggerOnItemArrives(interpreter, 'machine_1', item)
    sim.enqueueCommands(cmds)
    splitter.addInput(item)

    sim.tick()

    // Last call (Right → secondary) wins.
    expect(splitter.secondaryOutputSlot, 'right (secondary) holds the item from the LAST routeCurrentItemTo call').toBe(item)
    expect(splitter.tertiaryOutputSlot, 'left (tertiary) must stay empty — the first call was overwritten').toBeNull()
    expect(splitter.outputSlot, 'forward (primary) must stay empty').toBeNull()
    expect(splitter.inputSlots).toHaveLength(0)
  })

  // -------------------------------------------------------------------
  // S5 — Targeting a side with no connected downstream belt: the
  // splitter must BLOCK on that item (no silent fallback to another
  // connected side). Pinned per locked design decision (4).
  // -------------------------------------------------------------------
  it('S5: routing to an unconnected side blocks the splitter (no silent fallback)', () => {
    sim = new Simulation()
    splitter = new Machine('machine_1', 'splitter')
    sim.addMachine(splitter)
    // Wire ONLY Forward (primary) and Left (tertiary). Right
    // (secondary) is intentionally unconnected — `isOutputConnected`
    // returns false for that port.
    sim.setMachineOutputBelt('machine_1', 'machine_1_bp', 'primary')
    sim.setMachineOutputBelt('machine_1', 'machine_1_bt', 'tertiary')
    splitter.start()
    interpreter = new BlockInterpreter()

    interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        machines.routeCurrentItemTo(Machine.A, SplitterOutputs.Right)
      })
    `)

    const item = createItem('wheel_small')
    const cmds = callTriggerOnItemArrives(interpreter, 'machine_1', item)
    sim.enqueueCommands(cmds)
    splitter.addInput(item)

    sim.tick()

    // No silent fallback: the item is NOT routed to the connected
    // Forward or Left sides. It stays in inputSlots, splitter blocks.
    expect(splitter.outputSlot, 'forward (primary) must stay empty — no silent fallback').toBeNull()
    expect(splitter.secondaryOutputSlot, 'right (secondary) is unconnected — item cannot land here').toBeNull()
    expect(splitter.tertiaryOutputSlot, 'left (tertiary) must stay empty — no silent fallback').toBeNull()
    expect(splitter.inputSlots, 'item must remain in inputSlots while blocked').toContain(item)
    expect(splitter.state).toBe('blocked')
  })
})
