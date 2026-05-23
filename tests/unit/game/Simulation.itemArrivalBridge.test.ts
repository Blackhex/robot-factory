/**
 * Task E3 (RED) — `Simulation.setItemArrivalBridge` + generalized
 * item-arrival bridge mechanism.
 *
 * Pins the new sim-side surface that pairs with
 * `tests/unit/editor/BlockInterpreter.triggerOnItemArrives.test.ts`:
 *
 *   - `Simulation.setItemArrivalBridge(bridge | null)` — public setter.
 *   - `ItemArrivalBridge = (machineId, item) => SimulationCommand[]`
 *     exported from `src/game/Simulation.ts`.
 *   - The simulation invokes the bridge whenever an item is consumed
 *     by a machine via belt → `Machine.addInput(item)` (the "item
 *     arrived" moment), regardless of machine type — assembler,
 *     splitter, recycler, factory_output, … all count.
 *   - Bridge fires once per individual arrival, not once per tick.
 *   - Commands returned by the bridge are enqueued on the simulation's
 *     command queue and applied at the start of the NEXT tick (the
 *     existing `queueRunner.tick()` order at the top of `tick()`).
 *   - Setting the bridge to `null` disables invocation; subsequent
 *     deliveries do not call any handler.
 *   - A throwing bridge does NOT crash the sim tick — it is caught,
 *     items continue to flow, subsequent deliveries succeed.
 *
 * These tests are written BEFORE the implementation lands and MUST
 * FAIL against the current codebase because:
 *   - `Simulation.setItemArrivalBridge` does not exist.
 *   - `ItemArrivalBridge` is not exported from `Simulation.ts`.
 *   - The simulation does not invoke any item-arrival bridge anywhere.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
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
import type { Recipe } from '../../../src/game/Recipe'
import type { Item } from '../../../src/game/Item'
// --- Compile-time pin: ItemArrivalBridge must be exported from Simulation.ts.
//
// Purely erased at runtime — its job is to break `tsc --noEmit` if the
// type isn't exported. The runtime invocation tests below cover the
// vitest-visible failure modes.
import type { ItemArrivalBridge } from '../../../src/game/Simulation'
const _itemArrivalBridgeTypePin: ItemArrivalBridge = (
  _machineId: string,
  _item: Item,
): SimulationCommand[] => []
void _itemArrivalBridgeTypePin

// --- Helpers -------------------------------------------------------------

function assemblerWheelRecipe(): Recipe {
  const r = getRecipeById('assemble_drivetrain_basic')
  if (!r) throw new Error('assemble_drivetrain_basic recipe not found')
  return r
}

/**
 * Set up a single belt → machine arrival fixture. Belt b1 runs from
 * (0,0) to (1,0); the machine sits at (1,0). One item is placed on
 * the belt at position 1.0 so a single `tick()` triggers delivery.
 */
function setupSingleArrival(
  sim: Simulation,
  machineId: string,
  machineType:
    | 'splitter'
    | 'recycler'
    | 'factory_output'
    | 'assembler',
): { machine: Machine; belt: ConveyorBelt; item: Item } {
  const belt = new ConveyorBelt('b1', 0, 0, 1, 0, 1.0)
  const machine = new Machine(machineId, machineType)
  if (machineType === 'assembler') {
    machine.setRecipe(assemblerWheelRecipe())
  }
  if (machineType === 'factory_output') {
    machine.start() // factory_output requires `enabled` to canConsume
  }
  sim.addBelt(belt)
  sim.addMachine(machine)
  sim.setMachinePosition(machineId, 1, 0)
  // wheel_small is acceptable to: splitter (always), recycler (always),
  // factory_output (always), assembler with assemble_drivetrain_basic.
  const item = createItem('wheel_small')
  belt.addItem(item)
  item.positionOnBelt = 1.0 // ready immediately — saves 11 ticks of advance
  return { machine, belt, item }
}

// --- Tests ---------------------------------------------------------------

describe('Simulation — item-arrival bridge', () => {
  let sim: Simulation

  beforeEach(() => {
    resetItemIdCounter()
    sim = new Simulation()
  })

  // -------------------------------------------------------------------
  // Item 1 — `setItemArrivalBridge` is a public method on Simulation.
  // -------------------------------------------------------------------
  it('exposes setItemArrivalBridge as a public method', () => {
    expect(typeof (sim as unknown as { setItemArrivalBridge: unknown }).setItemArrivalBridge).toBe(
      'function',
    )
  })

  // -------------------------------------------------------------------
  // Item 3 — bridge fires when an item arrives at a machine input via
  // belt delivery. The contract is "one invocation per addInput()".
  // -------------------------------------------------------------------
  it('invokes the bridge with (machineId, item) when an item is delivered to a machine input', () => {
    const bridge = vi.fn<ItemArrivalBridge>(() => [])
    sim.setItemArrivalBridge(bridge)

    const { item } = setupSingleArrival(sim, 's1', 'splitter')

    sim.tick()

    expect(bridge).toHaveBeenCalledTimes(1)
    const call = bridge.mock.calls[0]
    expect(call[0]).toBe('s1')
    expect(call[1]).toBe(item)
    expect(call[1].id).toBe(item.id)
  })

  // -------------------------------------------------------------------
  // Item 4 — bridge fires for non-splitter machine types. Splitter is
  // included alongside non-splitter types to make the symmetry explicit.
  // (`painter` and `part_fabricator` are intentionally omitted: there
  // is no in-tree recipe that would let them accept any item via belt
  // delivery, so the fixture cannot be built without contriving a
  // synthetic recipe — and the contract is already pinned by the four
  // representative types below.)
  // -------------------------------------------------------------------
  it.each([
    ['splitter'],
    ['recycler'],
    ['factory_output'],
    ['assembler'],
  ] as const)(
    'fires the bridge when an item arrives at a %s (not just splitters)',
    (machineType) => {
      const bridge = vi.fn<ItemArrivalBridge>(() => [])
      sim.setItemArrivalBridge(bridge)

      setupSingleArrival(sim, 'm_' + machineType, machineType)

      sim.tick()

      expect(bridge).toHaveBeenCalledTimes(1)
      expect(bridge.mock.calls[0][0]).toBe('m_' + machineType)
    },
  )

  // -------------------------------------------------------------------
  // Item 5 — bridge fires once per individual arrival, not once per tick.
  // Three belts converge on a single factory_output (which has unlimited
  // input capacity), each carrying a wheel ready at position 1.0. After
  // one tick, all three items are delivered and the bridge fires three
  // times — once per arrival, in any order.
  // -------------------------------------------------------------------
  it('fires once per individual arrival (3 items in same tick → 3 invocations)', () => {
    const bridge = vi.fn<ItemArrivalBridge>(() => [])
    sim.setItemArrivalBridge(bridge)

    const sink = new Machine('sink', 'factory_output')
    sink.start()
    sim.addMachine(sink)
    sim.setMachinePosition('sink', 1, 0)

    const belts: ConveyorBelt[] = []
    const items: Item[] = []
    for (let i = 0; i < 3; i++) {
      // Source cells (0,0), (2,0), (1,1) all converge on (1,0).
      const fromX = i === 0 ? 0 : i === 1 ? 2 : 1
      const fromZ = i === 0 ? 0 : i === 1 ? 0 : 1
      const belt = new ConveyorBelt(`b_${i}`, fromX, fromZ, 1, 0, 1.0)
      sim.addBelt(belt)
      const item = createItem('wheel_small')
      belt.addItem(item)
      item.positionOnBelt = 1.0
      belts.push(belt)
      items.push(item)
    }

    sim.tick()

    expect(bridge).toHaveBeenCalledTimes(3)
    const arrivedIds = bridge.mock.calls
      .map((call: readonly unknown[]) => (call[1] as Item).id)
      .sort()
    const expectedIds = items.map((i) => i.id).sort()
    expect(arrivedIds).toEqual(expectedIds)
  })

  // -------------------------------------------------------------------
  // Item 6 — commands returned by the bridge are enqueued on the sim
  // queue. The dispatcher applies them at the start of the NEXT tick
  // (queueRunner.tick() runs before machine ticks). After one extra
  // tick, the splitter's `outputSidesConfig` reflects the bridge's
  // SET_OUTPUT_SIDES command.
  // -------------------------------------------------------------------
  it('enqueues bridge-returned commands; SET_OUTPUT_SIDES applies on the next tick', () => {
    const splitter = new Machine('splitter_target', 'splitter')
    sim.addMachine(splitter)

    // Sanity-pin the default before delivery.
    expect(splitter.outputSidesConfig).toBe(SPLITTER_ALL_SIDES_BITS)

    const bridge = vi.fn<ItemArrivalBridge>(() => [
      {
        type: 'SET_OUTPUT_SIDES',
        machineId: 'splitter_target',
        sidesBitmask: SPLITTER_SIDE_BIT.right,
      },
    ])
    sim.setItemArrivalBridge(bridge)

    setupSingleArrival(sim, 'arrival_machine', 'recycler')

    // Tick 1 — delivery happens; bridge fires; SET_OUTPUT_SIDES is enqueued
    // but NOT yet applied (queueRunner runs at the START of each tick).
    sim.tick()
    expect(bridge).toHaveBeenCalledTimes(1)

    // Tick 2 — queueRunner.tick() drains the queue; dispatcher updates
    // the splitter's config.
    sim.tick()
    expect(splitter.outputSidesConfig).toBe(SPLITTER_SIDE_BIT.right)
  })

  // -------------------------------------------------------------------
  // Item 7 — `setItemArrivalBridge(null)` clears the bridge. Subsequent
  // deliveries do not invoke any callback and the sim does not crash.
  // -------------------------------------------------------------------
  it('clearing the bridge with null disables invocation (no-op, no error)', () => {
    const bridge = vi.fn<ItemArrivalBridge>(() => [])
    sim.setItemArrivalBridge(bridge)

    setupSingleArrival(sim, 's1', 'splitter')

    sim.setItemArrivalBridge(null)

    expect(() => sim.tick()).not.toThrow()
    expect(bridge).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------
  // Item 8 — a bridge that throws does NOT crash the sim tick. The
  // exception is swallowed; items still flow on subsequent ticks; a
  // second arrival still triggers the bridge.
  // -------------------------------------------------------------------
  it('catches bridge exceptions; sim tick does not crash and items continue to flow', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let callCount = 0
    const bridge = vi.fn<ItemArrivalBridge>(() => {
      callCount++
      throw new Error('bridge boom')
    })
    sim.setItemArrivalBridge(bridge)

    const { machine, belt } = setupSingleArrival(sim, 's1', 'splitter')

    expect(() => sim.tick()).not.toThrow()

    // The arrival did happen — addInput() consumed the item BEFORE the
    // bridge fired (otherwise the throw would block delivery).
    expect(belt.isEmpty()).toBe(true)
    expect(machine.inputSlots).toHaveLength(1)
    expect(callCount).toBe(1)

    // Failure is surfaced, not silently swallowed.
    expect(errSpy).toHaveBeenCalled()
    const firstCallArgs = errSpy.mock.calls[0]
    expect(String(firstCallArgs[0])).toContain('arrival bridge')
    expect(firstCallArgs[1]).toMatchObject({
      source: 'arrival_bridge',
      machineId: 's1',
    })

    // A second arrival on the same fixture also fires the bridge — the
    // exception did not poison the bridge slot.
    const item2 = createItem('wheel_small')
    belt.addItem(item2)
    item2.positionOnBelt = 1.0

    expect(() => sim.tick()).not.toThrow()
    expect(callCount).toBe(2)

    errSpy.mockRestore()
  })
})
