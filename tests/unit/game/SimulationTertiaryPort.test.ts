/**
 * Task B (RED): Splitter tertiary port — Simulation wiring
 *
 * Pins the contract that:
 *   1. `setMachineOutputBelt(machineId, beltId, 'tertiary')` registers
 *      the tertiary belt independently of primary and secondary
 *      registrations (no overwrite across ports).
 *   2. `Simulation.tick()` drains a populated `tertiaryOutputSlot` to
 *      the registered tertiary belt during `transferMachineOutputs`.
 *   3. Back-pressure: a full tertiary belt leaves the item parked in
 *      `tertiaryOutputSlot` (mirrors primary / secondary semantics).
 *   4. `Simulation.reset()` clears the tertiary belt registration map
 *      alongside `primaryOutputBelts` / `secondaryOutputBelts`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Simulation } from '../../../src/game/Simulation'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'

const BELT_CELL_CAPACITY = ConveyorBelt.CELL_CAPACITY

describe('Simulation — tertiary output port (Splitter 3-port)', () => {
  let sim: Simulation
  let splitter: Machine
  let beltA: ConveyorBelt // primary
  let beltB: ConveyorBelt // secondary
  let beltC: ConveyorBelt // tertiary

  beforeEach(() => {
    resetItemIdCounter()
    sim = new Simulation()
    splitter = new Machine('splitter1', 'splitter')
    sim.addMachine(splitter)
    sim.setMachinePosition('splitter1', 0, 0)

    // Three independent belts leaving the splitter in three directions.
    beltA = new ConveyorBelt('beltA-seg-0', 0, 0, 0, 1, 1.0)
    beltB = new ConveyorBelt('beltB-seg-0', 0, 0, 1, 0, 1.0)
    beltC = new ConveyorBelt('beltC-seg-0', 0, 0, -1, 0, 1.0)
    sim.addBelt(beltA)
    sim.addBelt(beltB)
    sim.addBelt(beltC)
  })

  it('registers all three ports independently — tertiary registration is preserved across primary/secondary writes', () => {
    sim.setMachineOutputBelt('splitter1', 'beltC-seg-0', 'tertiary')
    sim.setMachineOutputBelt('splitter1', 'beltA-seg-0', 'primary')
    sim.setMachineOutputBelt('splitter1', 'beltB-seg-0', 'secondary')

    // Park one distinguishable item in each output slot.
    const itemP = createItem('wheel_small')
    const itemS = createItem('wheel_medium')
    const itemT = createItem('wheel_large')
    splitter.outputSlot = itemP
    splitter.secondaryOutputSlot = itemS
    splitter.tertiaryOutputSlot = itemT

    sim.tick()

    expect(beltA.getItems().map((i) => i.id), 'primary belt drained from outputSlot').toEqual([itemP.id])
    expect(beltB.getItems().map((i) => i.id), 'secondary belt drained from secondaryOutputSlot').toEqual([itemS.id])
    expect(
      beltC.getItems().map((i) => i.id),
      'tertiary belt MUST receive the item from tertiaryOutputSlot',
    ).toEqual([itemT.id])
  })

  it('tick() drains tertiaryOutputSlot to the registered tertiary belt and leaves primary/secondary belts untouched', () => {
    sim.setMachineOutputBelt('splitter1', 'beltC-seg-0', 'tertiary')

    const itemT = createItem('wheel_small')
    splitter.tertiaryOutputSlot = itemT

    sim.tick()

    expect(splitter.tertiaryOutputSlot, 'tertiary slot cleared after transfer').toBeNull()
    expect(beltC.getItems().map((i) => i.id), 'tertiary belt received the item').toEqual([itemT.id])
    expect(beltA.getItemCount(), 'primary belt untouched').toBe(0)
    expect(beltB.getItemCount(), 'secondary belt untouched').toBe(0)
  })

  it('back-pressure: when the tertiary belt is full, the item stays in tertiaryOutputSlot', () => {
    sim.setMachineOutputBelt('splitter1', 'beltC-seg-0', 'tertiary')

    // Saturate beltC up to its per-cell capacity. addItem always places
    // at positionOnBelt=0 with a min-spacing constraint, so we must
    // advance between adds to free up the head slot.
    for (let i = 0; i < BELT_CELL_CAPACITY; i++) {
      const filler = createItem('wheel_small')
      const accepted = beltC.addItem(filler)
      expect(accepted, `precondition: filler ${i} should fit`).toBe(true)
      // Push the item forward so the next add at position 0 has spacing.
      beltC.advance(1.0)
    }
    expect(beltC.addItem(createItem('wheel_small')), 'precondition: belt should now reject').toBe(false)

    const blocked = createItem('wheel_medium')
    splitter.tertiaryOutputSlot = blocked

    sim.tick()

    expect(
      splitter.tertiaryOutputSlot,
      'item must remain parked in tertiaryOutputSlot when belt is full',
    ).toBe(blocked)
  })

  it('reset() clears the tertiaryOutputBelts map alongside primaryOutputBelts/secondaryOutputBelts', () => {
    sim.setMachineOutputBelt('splitter1', 'beltC-seg-0', 'tertiary')

    sim.reset()

    // After reset, re-add machine + belt and assign tertiary slot. If the
    // tertiary registration map was NOT cleared, the stale entry would
    // still point at the old belt id and the new slot would be drained.
    const splitter2 = new Machine('splitter1', 'splitter')
    sim.addMachine(splitter2)
    sim.setMachinePosition('splitter1', 0, 0)
    const freshC = new ConveyorBelt('beltC-seg-0', 0, 0, -1, 0, 1.0)
    sim.addBelt(freshC)

    splitter2.tertiaryOutputSlot = createItem('wheel_small')

    sim.tick()

    expect(
      freshC.getItemCount(),
      'tertiary belt MUST NOT receive the item — registration map was supposed to be cleared by reset()',
    ).toBe(0)
    expect(
      splitter2.tertiaryOutputSlot,
      'tertiary slot must remain populated because no registration exists post-reset',
    ).not.toBeNull()
  })
})
