/**
 * Splitter routing — Simulation layer (Step 1 of contract migration).
 *
 * The per-item event-handler bridge that used to drive splitter routing
 * has been replaced by a persistent multi-output multiplex config: the
 * `route items to <sides>` block writes `Machine.outputSidesConfig`
 * (bitfield Left=1 | Forward=2 | Right=4) and the simulation routes
 * via that field plus a strict round-robin index `routingCounter`.
 *
 * Step 1 (this file): every test that used to set up the legacy
 * splitter-handler bridge is rewritten to set
 * `outputSidesConfig` to the equivalent bit so the SAME output-port
 * outcome is produced. Tests that only verified bridge plumbing
 * (call counts, last-write-wins, identity of the machineId/itemId
 * passed to the callback) lose meaning under the new contract and are
 * tracked as `it.todo` referencing Step 3, where new handler-driven
 * coverage will be added once the `route items to <sides>` block is
 * wired end-to-end through the interpreter.
 *
 * Per-side → port mapping (unchanged):
 *   Forward → primary  (`outputSlot`)
 *   Right   → secondary (`secondaryOutputSlot`)
 *   Left    → tertiary  (`tertiaryOutputSlot`)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Machine } from '../../../src/game/Machine'
import { Simulation } from '../../../src/game/Simulation'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { SPLITTER_SIDE_BIT } from '../../../src/game/types'

const LEFT = SPLITTER_SIDE_BIT.left
const FORWARD = SPLITTER_SIDE_BIT.forward
const RIGHT = SPLITTER_SIDE_BIT.right

/**
 * Mark every output port as "connected" so `Simulation.updateMachines`
 * passes `env.isOutputConnected(...) === true` for each side. The
 * connectedness check is `outputBelts[port].has(machineId)`, so calling
 * `setMachineOutputBelt` with a sentinel belt id is enough — the
 * matching `ConveyorBelt` is intentionally NOT registered via
 * `sim.addBelt`, which keeps `transferMachineOutputs` a no-op for these
 * ports (its `belts.get(beltId)` lookup returns undefined). Tests can
 * therefore continue to assert on `outputSlot` / `secondaryOutputSlot`
 * / `tertiaryOutputSlot` after `sim.tick()` without those slots being
 * drained into a real downstream belt.
 */
function wireOutputBelts(sim: Simulation, machineId: string): void {
  sim.setMachineOutputBelt(machineId, `${machineId}_bp`, 'primary')
  sim.setMachineOutputBelt(machineId, `${machineId}_bs`, 'secondary')
  sim.setMachineOutputBelt(machineId, `${machineId}_bt`, 'tertiary')
}

describe('Splitter routing via outputSidesConfig — Simulation layer', () => {
  let sim: Simulation
  let splitter: Machine

  beforeEach(() => {
    resetItemIdCounter()
    sim = new Simulation()
    splitter = new Machine('s1', 'splitter')
    sim.addMachine(splitter)
    wireOutputBelts(sim, 's1')
  })

  // -------------------------------------------------------------------
  // A1 — Forward routing when only Forward is enabled.
  // -------------------------------------------------------------------
  it('A1: routes to forward (primary) when outputSidesConfig=Forward only', () => {
    // GIVEN
    splitter.outputSidesConfig = FORWARD
    splitter.start()
    const item = createItem('wheel_small')
    splitter.addInput(item)

    // WHEN
    sim.tick()

    // THEN — item lands in the primary output slot; secondary and
    //        tertiary stay empty.
    expect(splitter.outputSlot).toBe(item)
    expect(splitter.secondaryOutputSlot).toBeNull()
    expect(splitter.tertiaryOutputSlot).toBeNull()
    expect(splitter.inputSlots).toHaveLength(0)
  })

  // -------------------------------------------------------------------
  // A2 — Forward-only routing preserves item identity.
  // -------------------------------------------------------------------
  it('A2: routes to forward (primary) and preserves item identity', () => {
    // GIVEN
    splitter.outputSidesConfig = FORWARD
    splitter.start()
    const item = createItem('wheel_small')
    splitter.addInput(item)

    // WHEN
    sim.tick()

    // THEN
    expect(splitter.outputSlot).toBe(item)
    expect(splitter.outputSlot!.id).toBe(item.id)
    expect(splitter.secondaryOutputSlot).toBeNull()
    expect(splitter.tertiaryOutputSlot).toBeNull()
  })

  // -------------------------------------------------------------------
  // A3 — Right-only config → secondary slot.
  // -------------------------------------------------------------------
  it('A3: routes to right (secondary) when outputSidesConfig=Right only', () => {
    // GIVEN
    splitter.outputSidesConfig = RIGHT
    splitter.start()
    const item = createItem('circuit_basic')
    splitter.addInput(item)

    // WHEN
    sim.tick()

    // THEN
    expect(splitter.secondaryOutputSlot).toBe(item)
    expect(splitter.outputSlot).toBeNull()
    expect(splitter.tertiaryOutputSlot).toBeNull()
    expect(splitter.inputSlots).toHaveLength(0)
  })

  // -------------------------------------------------------------------
  // A4 — Left-only config → tertiary slot.
  // -------------------------------------------------------------------
  it('A4: routes to left (tertiary) when outputSidesConfig=Left only', () => {
    // GIVEN
    splitter.outputSidesConfig = LEFT
    splitter.start()
    const item = createItem('circuit_basic')
    splitter.addInput(item)

    // WHEN
    sim.tick()

    // THEN
    expect(splitter.tertiaryOutputSlot).toBe(item)
    expect(splitter.outputSlot).toBeNull()
    expect(splitter.secondaryOutputSlot).toBeNull()
    expect(splitter.inputSlots).toHaveLength(0)
  })

  // -------------------------------------------------------------------
  // A5 — Splitter blocks when the chosen output is occupied.
  // -------------------------------------------------------------------
  it('A5: blocks when the chosen output slot is occupied; counter does NOT advance', () => {
    // GIVEN — secondary already holds an item; config requests Right.
    const occupant = createItem('wheel_small')
    splitter.secondaryOutputSlot = occupant
    splitter.outputSidesConfig = RIGHT
    splitter.start()
    const newItem = createItem('circuit_basic')
    splitter.addInput(newItem)
    const counterBefore = splitter.routingCounter

    // WHEN — first tick attempts the route; output is full → blocked.
    sim.tick()

    // THEN — splitter is blocked, input still holds the new item, and
    //        the secondary slot still holds the original occupant.
    expect(splitter.state).toBe('blocked')
    expect(splitter.secondaryOutputSlot).toBe(occupant)
    expect(splitter.inputSlots[0]).toBe(newItem)
    expect(splitter.outputSlot).toBeNull()
    expect(splitter.tertiaryOutputSlot).toBeNull()
    // Strict round-robin: counter must NOT advance on a failed park.
    expect(splitter.routingCounter).toBe(counterBefore)

    // WHEN — second tick with output still occupied: still blocked,
    //        same side re-attempted, counter still unchanged.
    sim.tick()

    // THEN
    expect(splitter.state).toBe('blocked')
    expect(splitter.secondaryOutputSlot).toBe(occupant)
    expect(splitter.routingCounter).toBe(counterBefore)
  })

  // -------------------------------------------------------------------
  // A6 — Splitter resumes after the chosen output drains.
  // -------------------------------------------------------------------
  it('A6: resumes after the chosen output drains; the queued item lands in secondary', () => {
    // GIVEN — set up the blocked scenario from A5.
    const occupant = createItem('wheel_small')
    splitter.secondaryOutputSlot = occupant
    splitter.outputSidesConfig = RIGHT
    splitter.start()
    const newItem = createItem('circuit_basic')
    splitter.addInput(newItem)
    sim.tick() // → blocked
    expect(splitter.state).toBe('blocked')

    // WHEN — drain the secondary slot.
    splitter.takeSecondaryOutput()

    // THEN — next tick: the queued input item lands in secondary; state
    //        returns to idle; counter advances by 1 on the successful park.
    const counterBefore = splitter.routingCounter
    sim.tick()

    expect(splitter.secondaryOutputSlot).toBe(newItem)
    expect(splitter.inputSlots).toHaveLength(0)
    expect(splitter.state).toBe('idle')
    expect(splitter.routingCounter).toBe(counterBefore + 1)
  })

  // -------------------------------------------------------------------
  // A7 — Stopped splitter does not consume input.
  // -------------------------------------------------------------------
  it('A7: a stopped (disabled) splitter does NOT consume input regardless of outputSidesConfig', () => {
    // GIVEN — splitter NOT started.
    splitter.outputSidesConfig = RIGHT
    expect(splitter.enabled).toBe(false)
    const item = createItem('wheel_small')
    splitter.addInput(item)

    // WHEN
    sim.tick()
    sim.tick()
    sim.tick()

    // THEN — no output produced, item still in input.
    expect(splitter.outputSlot).toBeNull()
    expect(splitter.secondaryOutputSlot).toBeNull()
    expect(splitter.tertiaryOutputSlot).toBeNull()
    expect(splitter.inputSlots[0]).toBe(item)
  })

  // -------------------------------------------------------------------
  // A8 — Defect flag preserved through routing (Left).
  // -------------------------------------------------------------------
  it('A8: a defective item routed to left lands in tertiary with isDefective=true preserved', () => {
    // GIVEN
    splitter.outputSidesConfig = LEFT
    splitter.start()
    const item = createItem('wheel_small', 30)
    item.isDefective = true
    splitter.addInput(item)

    // WHEN
    sim.tick()

    // THEN — same item identity, defect flag still true.
    expect(splitter.tertiaryOutputSlot).toBe(item)
    expect(splitter.tertiaryOutputSlot!.id).toBe(item.id)
    expect(splitter.tertiaryOutputSlot!.isDefective).toBe(true)
  })

  // -------------------------------------------------------------------
  // A9 — DELETED. The old test verified that an event handler invoking
  //     multiple `route` calls in one tick produced "last write wins"
  //     semantics in the bridge. Under the new persistent-config
  //     contract, routing is decided ONCE per item from the bitfield;
  //     there are no per-item decisions to overwrite. Coverage for
  //     "interpreter writes config; later writes overwrite earlier
  //     writes" belongs in Step 3 (`route items to <sides>` block end-
  //     to-end through the interpreter).
  // -------------------------------------------------------------------
  it.todo('A9: handler-driven multi-write semantics covered in Step 3 (route items to <sides> block)')

  // -------------------------------------------------------------------
  // A10 — Empty input + started splitter is a no-op.
  // -------------------------------------------------------------------
  it('A10: a started splitter with no input remains idle and unchanged', () => {
    // GIVEN
    splitter.outputSidesConfig = RIGHT
    splitter.start()
    expect(splitter.inputSlots).toHaveLength(0)
    const counterBefore = splitter.routingCounter

    // WHEN
    sim.tick()
    sim.tick()

    // THEN
    expect(splitter.state).toBe('idle')
    expect(splitter.outputSlot).toBeNull()
    expect(splitter.secondaryOutputSlot).toBeNull()
    expect(splitter.tertiaryOutputSlot).toBeNull()
    expect(splitter.routingCounter).toBe(counterBefore)
  })

  // -------------------------------------------------------------------
  // A11 — Two items in input → both routed in one tick.
  // -------------------------------------------------------------------
  it('A11: two items in input → both routed in one tick (Forward then Right via round-robin)', () => {
    // GIVEN — config enables Forward (bit 2) and Right (bit 4) only.
    //         Enabled list is built in numerical bit order: [forward, right].
    //         routingCounter starts at 0 → first item Forward, second item Right.
    splitter.outputSidesConfig = FORWARD | RIGHT
    splitter.start()
    const itemA = createItem('wheel_small')
    const itemB = createItem('circuit_basic')
    splitter.addInput(itemA)
    splitter.addInput(itemB)
    const counterBefore = splitter.routingCounter

    // WHEN
    sim.tick()

    // THEN — itemA → primary (forward), itemB → secondary (right).
    expect(splitter.outputSlot).toBe(itemA)
    expect(splitter.secondaryOutputSlot).toBe(itemB)
    expect(splitter.tertiaryOutputSlot).toBeNull()
    expect(splitter.inputSlots).toHaveLength(0)
    // Both successful parks → counter advances by exactly 2.
    expect(splitter.routingCounter).toBe(counterBefore + 2)
  })

  // -------------------------------------------------------------------
  // A12 — Splitter is a pass-through; defect flag never cleared.
  // -------------------------------------------------------------------
  it('A12: routing a defective item to ANY side preserves the defect flag', () => {
    const cases: Array<{ side: 'forward' | 'right' | 'left'; bit: number }> = [
      { side: 'forward', bit: FORWARD },
      { side: 'right', bit: RIGHT },
      { side: 'left', bit: LEFT },
    ]
    for (const { side, bit } of cases) {
      // GIVEN — fresh splitter per iteration.
      resetItemIdCounter()
      const localSim = new Simulation()
      const localSplitter = new Machine(`s_${side}`, 'splitter')
      localSim.addMachine(localSplitter)
      wireOutputBelts(localSim, `s_${side}`)
      localSplitter.outputSidesConfig = bit
      localSplitter.start()
      const item = createItem('wheel_small', 30)
      item.isDefective = true
      localSplitter.addInput(item)

      // WHEN
      localSim.tick()

      // THEN — locate which slot received the item; defect flag intact.
      const landed =
        side === 'forward' ? localSplitter.outputSlot
        : side === 'right' ? localSplitter.secondaryOutputSlot
        : localSplitter.tertiaryOutputSlot
      expect(landed, `routing to ${side} must populate the matching slot`).toBe(item)
      expect(landed!.isDefective).toBe(true)
    }
  })

  // -------------------------------------------------------------------
  // A13 — Splitter routes in the same tick the item arrives at input
  //       (no 1-tick processing delay).
  // -------------------------------------------------------------------
  it('A13: splitter routes in the SAME tick the item arrives at input (no 1-tick processing delay)', () => {
    // GIVEN
    splitter.outputSidesConfig = RIGHT
    splitter.start()
    const item = createItem('wheel_small')
    splitter.addInput(item)

    // WHEN — exactly one tick.
    sim.tick()

    // THEN — item is already routed; not still in input, not pending.
    expect(splitter.inputSlots).toHaveLength(0)
    expect(splitter.secondaryOutputSlot).toBe(item)
    expect(splitter.state).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// Belt transfer interaction: a splitter routed to a non-primary side
// must still hand its item off to the belt registered for that port.
// This catches a regression where the new routing path bypasses
// `transferMachineOutputs` for the secondary/tertiary ports.
// ---------------------------------------------------------------------------

describe('Splitter routing via outputSidesConfig — belt transfer', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('routes to right and the secondary belt receives the item on the next tick', () => {
    const sim = new Simulation()
    const splitter = new Machine('s1', 'splitter')
    sim.addMachine(splitter)

    const primaryBelt = new ConveyorBelt('bp', 0, 0, 1, 0)
    const secondaryBelt = new ConveyorBelt('bs', 0, 0, 0, 1)
    sim.addBelt(primaryBelt)
    sim.addBelt(secondaryBelt)
    sim.setMachineOutputBelt('s1', 'bp', 'primary')
    sim.setMachineOutputBelt('s1', 'bs', 'secondary')

    splitter.outputSidesConfig = RIGHT
    splitter.start()
    splitter.addInput(createItem('wheel_small'))

    // tick 1 routes to secondary; tick 2 transferMachineOutputs moves it.
    sim.tick()
    sim.tick()

    expect(secondaryBelt.getItemCount()).toBe(1)
    expect(primaryBelt.getItemCount()).toBe(0)
  })

  it('routes to left and the tertiary belt receives the item on the next tick', () => {
    const sim = new Simulation()
    const splitter = new Machine('s1', 'splitter')
    sim.addMachine(splitter)

    const tertiaryBelt = new ConveyorBelt('bt', 0, 0, -1, 0)
    sim.addBelt(tertiaryBelt)
    sim.setMachineOutputBelt('s1', 'bt', 'tertiary')

    splitter.outputSidesConfig = LEFT
    splitter.start()
    splitter.addInput(createItem('wheel_small'))

    sim.tick()
    sim.tick()

    expect(tertiaryBelt.getItemCount()).toBe(1)
  })
})
