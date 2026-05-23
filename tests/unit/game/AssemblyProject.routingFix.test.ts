/**
 * RED — End-to-end routing for the Assembly-project layout under the
 * NEW input-observer-relative slot convention.
 *
 * Setup (mirrors `projects/Assembly.json`):
 *   Splitter      at (9, 6) rotation 'north'
 *   Recycler      at (12, 6) rotation 'east'
 *   FactoryOutput at (9, 3) rotation 'north' (the Shipper)
 *
 *   East belt:  Splitter → Recycler (physical +x direction)
 *   North belt: Splitter → Shipper  (physical -z direction)
 *
 * The belts are placed via `Factory.placeBelt` with EXPLICIT physical
 * offsets ({+1, 0} for east, {0, -1} for north). The Factory then
 * derives the symbolic `sourceSlot` name via `offsetToSlotPosition`.
 *
 * Under the OLD (machine-facing) convention, offset {+1, 0} on a
 * north-rotated splitter resolves to `'left'`, which
 * `FactorySimulationSync` registers on the splitter's `tertiary`
 * output port. When the player programs "route to right" the
 * splitter routes via `SPLITTER_SIDE_BIT.right → secondary` — but
 * the secondary port has no belt → the item is parked in
 * `secondaryOutputSlot` and never reaches the Recycler.
 *
 * Under the NEW (input-observer-relative) convention, offset
 * {+1, 0} on a north-rotated splitter resolves to `'right'`, which
 * registers on the `secondary` port. "Route to right" then reaches
 * the east belt and arrives at the Recycler. Same for the north
 * belt + forward / primary / Shipper.
 *
 * These tests MUST fail at RED for both items because the east
 * belt is registered on the wrong simulation port. They will pass
 * once GREEN flips `slotPositionBaseOffset`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Factory } from '../../../src/game/Factory'
import { Simulation } from '../../../src/game/Simulation'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import {
  SPLITTER_SIDE_BIT,
  type SimulationCommand,
  type SimulationEvent,
} from '../../../src/game/types'

const SPLITTER_ID = 'splitter_under_test'
const RECYCLER_ID = 'recycler_east'
const SHIPPER_ID = 'shipper_north'

/**
 * Build the user-reproduced layout. Factory mirrors the physical
 * placement; Simulation gets matching Machine instances + the
 * belts derived from the Factory.
 */
function setupAssemblyLayout(): {
  factory: Factory
  sim: Simulation
  deliveries: Array<{ itemId: string; machineId: string }>
} {
  const factory = new Factory(20, 20)
  const sim = new Simulation(10, () => 0.5)

  const splitter = factory.placeMachine(9, 6, 'splitter', 'north')!
  const recycler = factory.placeMachine(12, 6, 'recycler', 'east')!
  const shipper = factory.placeMachine(9, 3, 'factory_output', 'north')!

  expect(splitter).not.toBeNull()
  expect(recycler).not.toBeNull()
  expect(shipper).not.toBeNull()

  // Mirror the machines into the sim BEFORE attaching, so that
  // `setMachineOutputBelt` from the sync has a target to anchor on.
  for (const info of factory.getMachines()) {
    const m = new Machine(info.id, info.type)
    m.start()
    sim.addMachine(m)
    sim.setMachinePosition(info.id, info.x, info.z)
  }

  factory.attachSimulation({
    addBelt: (belt: ConveyorBelt) => sim.addBelt(belt),
    removeBelt: (id: string) => sim.removeBelt(id),
    getBelt: (id: string) => sim.getBelt(id),
    setMachineOutputBelt: (machineId, beltId, port) =>
      sim.setMachineOutputBelt(machineId, beltId, port),
    setMachinePosition: (machineId, x, z) => sim.setMachinePosition(machineId, x, z),
  })

  // East belt: splitter slot {+1, 0} → recycler slot {-1, 0}.
  // Under NEW convention, splitter's `'right'` resolves to offset
  // {+1, 0} when rotated north — placing the east belt on `'right'`.
  const eastPlaced = factory.placeBelt(
    splitter,
    { x: +1, z: 0 },
    recycler,
    { x: -1, z: 0 },
  )
  expect(eastPlaced, 'east belt (splitter → recycler) failed to place').toBe(true)

  // North belt: splitter slot {0, -1} → shipper slot {0, +1}.
  // Under both conventions this is `'front'` → `'back'`.
  const northPlaced = factory.placeBelt(
    splitter,
    { x: 0, z: -1 },
    shipper,
    { x: 0, z: +1 },
  )
  expect(northPlaced, 'north belt (splitter → shipper) failed to place').toBe(true)

  const deliveries: Array<{ itemId: string; machineId: string }> = []
  sim.on('item_delivered', (event: SimulationEvent) => {
    deliveries.push({
      itemId: event.data.itemId as string,
      machineId: event.data.machineId as string,
    })
  })

  return { factory, sim, deliveries }
}

function tickUntil(sim: Simulation, predicate: () => boolean, maxTicks: number): void {
  for (let i = 0; i < maxTicks && !predicate(); i++) {
    sim.tick()
  }
}

function routeCommand(
  machineId: string,
  itemId: string,
  side: 'right' | 'forward' | 'left',
): SimulationCommand {
  return {
    type: 'ROUTE_CURRENT_ITEM_TO',
    machineId,
    itemId,
    sidesBitmask: SPLITTER_SIDE_BIT[side],
  }
}

describe('Assembly project routing — defective east, valid north (new slot convention)', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  // Rename machine IDs to deterministic constants for clearer
  // assertions. Factory generates `machine_N` style ids; we re-fetch
  // the actual ids out of factory.getMachines() inside each test.
  function getActualIds(factory: Factory): { splitterId: string; recyclerId: string; shipperId: string } {
    const machines = factory.getMachines()
    const splitter = machines.find((m) => m.type === 'splitter')!
    const recycler = machines.find((m) => m.type === 'recycler')!
    const shipper = machines.find((m) => m.type === 'factory_output')!
    return { splitterId: splitter.id, recyclerId: recycler.id, shipperId: shipper.id }
  }
  void SPLITTER_ID
  void RECYCLER_ID
  void SHIPPER_ID

  it('routes a defective item via ROUTE_CURRENT_ITEM_TO(right) east to the Recycler', () => {
    const { factory, sim, deliveries } = setupAssemblyLayout()
    const { splitterId, recyclerId } = getActualIds(factory)
    const splitter = sim.getMachine(splitterId)!

    const defective = createItem('wheel_small')
    defective.isDefective = true

    sim.enqueueCommand(routeCommand(splitterId, defective.id, 'right'))
    expect(splitter.addInput(defective)).toBe(true)

    tickUntil(sim, () => deliveries.some((d) => d.itemId === defective.id), 300)

    const delivery = deliveries.find((d) => d.itemId === defective.id)
    expect(
      delivery,
      'defective item was never delivered to any machine — splitter likely routed it to a port with no belt registered',
    ).toBeDefined()
    expect(
      delivery!.machineId,
      'defective item must arrive at the Recycler (east of splitter)',
    ).toBe(recyclerId)
  })

  it('routes a valid item via ROUTE_CURRENT_ITEM_TO(forward) north to the Shipper', () => {
    const { factory, sim, deliveries } = setupAssemblyLayout()
    const { splitterId, shipperId } = getActualIds(factory)
    const splitter = sim.getMachine(splitterId)!

    const valid = createItem('wheel_small')
    expect(valid.isDefective).toBe(false)

    sim.enqueueCommand(routeCommand(splitterId, valid.id, 'forward'))
    expect(splitter.addInput(valid)).toBe(true)

    tickUntil(sim, () => deliveries.some((d) => d.itemId === valid.id), 300)

    const delivery = deliveries.find((d) => d.itemId === valid.id)
    expect(
      delivery,
      'valid item was never delivered — splitter could not park on the forward port belt',
    ).toBeDefined()
    expect(
      delivery!.machineId,
      'valid item must arrive at the Shipper (north of splitter)',
    ).toBe(shipperId)
  })

  it('both items in flight together: defective lands at Recycler AND valid lands at Shipper', () => {
    const { factory, sim, deliveries } = setupAssemblyLayout()
    const { splitterId, recyclerId, shipperId } = getActualIds(factory)
    const splitter = sim.getMachine(splitterId)!

    const defective = createItem('wheel_small')
    defective.isDefective = true
    const valid = createItem('wheel_small')

    sim.enqueueCommand(routeCommand(splitterId, defective.id, 'right'))
    sim.enqueueCommand(routeCommand(splitterId, valid.id, 'forward'))
    expect(splitter.addInput(defective)).toBe(true)
    expect(splitter.addInput(valid)).toBe(true)

    tickUntil(
      sim,
      () =>
        deliveries.some((d) => d.itemId === defective.id) &&
        deliveries.some((d) => d.itemId === valid.id),
      400,
    )

    const defectiveDelivery = deliveries.find((d) => d.itemId === defective.id)
    const validDelivery = deliveries.find((d) => d.itemId === valid.id)

    expect(defectiveDelivery, 'defective item was never delivered').toBeDefined()
    expect(validDelivery, 'valid item was never delivered').toBeDefined()
    expect(defectiveDelivery!.machineId).toBe(recyclerId)
    expect(validDelivery!.machineId).toBe(shipperId)
  })
})
