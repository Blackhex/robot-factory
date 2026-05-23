/**
 * Task B (RED): FactorySimulationSync — derive port from sourceSlot
 *
 * Pins the contract that `syncAddedBelt` chooses the third
 * `setMachineOutputBelt` argument (the output port) based on the
 * source machine type and the belt's source slot:
 *   - splitter:
 *       sourceSlot 'front' → 'primary'
 *       sourceSlot 'right' → 'secondary'
 *       sourceSlot 'left'  → 'tertiary'
 *   - all other machine types → 'primary' (their geometry only exposes
 *     a single output slot)
 *
 * The slot-position order mirrors `SlotUtils.ts` for splitter:
 *   `outputs: ['front', 'right', 'left']`
 *
 * Currently `syncAddedBelt` always calls `setMachineOutputBelt` with
 * the default port (omitting the third argument) → effectively
 * 'primary' for every belt. The splitter-side tests therefore fail
 * because the recorded port is 'primary' (or undefined → defaulted to
 * 'primary') instead of the expected 'secondary' / 'tertiary'.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { FactorySimulationSync } from '../../../src/game/FactorySimulationSync'
import type { FactorySimulationLike } from '../../../src/game/FactorySimulationSync'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import type { BeltInfo, MachineInfo, MachineOutputPort, MachineType, SlotPosition } from '../../../src/game/types'

interface OutputBeltCall {
  machineId: string
  beltId: string
  port: MachineOutputPort | undefined
}

function makeStubSim(): { sim: FactorySimulationLike; calls: OutputBeltCall[] } {
  const calls: OutputBeltCall[] = []
  const belts = new Map<string, ConveyorBelt>()
  const sim: FactorySimulationLike = {
    addBelt(belt) {
      belts.set(belt.id, belt)
    },
    removeBelt(id) {
      return belts.delete(id)
    },
    getBelt(id) {
      return belts.get(id)
    },
    setMachineOutputBelt(machineId, beltId, port) {
      calls.push({ machineId, beltId, port })
    },
    setMachinePosition() {
      /* no-op */
    },
  } as FactorySimulationLike
  return { sim, calls }
}

function makeMachineInfo(
  id: string,
  type: MachineType,
  x: number,
  z: number,
  outputs: SlotPosition[],
): MachineInfo {
  return {
    id,
    name: id,
    type,
    x,
    z,
    rotation: 'south',
    slots: {
      inputs: ['back'],
      outputs,
    },
  }
}

function makeBeltInfo(args: {
  id: string
  source: MachineInfo
  sourceSlot: SlotPosition
  destination: MachineInfo
  destinationSlot?: SlotPosition
}): BeltInfo {
  return {
    id: args.id,
    name: args.id,
    sourceMachine: args.source,
    sourceSlot: args.sourceSlot,
    destinationMachine: args.destination,
    destinationSlot: args.destinationSlot ?? 'back',
    path: [
      { x: args.source.x, z: args.source.z },
      { x: args.destination.x, z: args.destination.z },
    ],
  }
}

describe('FactorySimulationSync.syncAddedBelt — port derived from sourceSlot', () => {
  let sync: FactorySimulationSync
  let stub: ReturnType<typeof makeStubSim>

  beforeEach(() => {
    sync = new FactorySimulationSync()
    stub = makeStubSim()
    sync.attachSimulation(stub.sim)
  })

  function lastCallFor(machineId: string): OutputBeltCall {
    const calls = stub.calls.filter((c) => c.machineId === machineId)
    expect(calls.length, `expected setMachineOutputBelt to be called for ${machineId}`).toBeGreaterThan(0)
    return calls[calls.length - 1]
  }

  it('splitter front-slot belt → port "primary"', () => {
    const splitter = makeMachineInfo('s1', 'splitter', 0, 0, ['front', 'right', 'left'])
    const dest = makeMachineInfo('d1', 'assembler', 0, 1, ['front'])
    const belt = makeBeltInfo({ id: 'belt-front', source: splitter, sourceSlot: 'front', destination: dest })

    sync.syncAddedBelt(belt)

    const call = lastCallFor('s1')
    expect(call.beltId).toBe(ConveyorBelt.segmentIdFor('belt-front', 0))
    expect(call.port ?? 'primary').toBe<MachineOutputPort>('primary')
  })

  it('splitter right-slot belt → port "secondary"', () => {
    const splitter = makeMachineInfo('s1', 'splitter', 0, 0, ['front', 'right', 'left'])
    const dest = makeMachineInfo('d1', 'assembler', 1, 0, ['front'])
    const belt = makeBeltInfo({ id: 'belt-right', source: splitter, sourceSlot: 'right', destination: dest })

    sync.syncAddedBelt(belt)

    const call = lastCallFor('s1')
    expect(call.beltId).toBe(ConveyorBelt.segmentIdFor('belt-right', 0))
    expect(
      call.port,
      `expected port "secondary" for splitter right-slot belt, got "${String(call.port)}"`,
    ).toBe<MachineOutputPort>('secondary')
  })

  it('splitter left-slot belt → port "tertiary"', () => {
    const splitter = makeMachineInfo('s1', 'splitter', 0, 0, ['front', 'right', 'left'])
    const dest = makeMachineInfo('d1', 'assembler', -1, 0, ['front'])
    const belt = makeBeltInfo({ id: 'belt-left', source: splitter, sourceSlot: 'left', destination: dest })

    sync.syncAddedBelt(belt)

    const call = lastCallFor('s1')
    expect(call.beltId).toBe(ConveyorBelt.segmentIdFor('belt-left', 0))
    expect(
      call.port,
      `expected port "tertiary" for splitter left-slot belt, got "${String(call.port)}"`,
    ).toBe<MachineOutputPort>('tertiary')
  })

  it('non-splitter machine (part_fabricator) → always port "primary" regardless of sourceSlot', () => {
    const fab = makeMachineInfo('fab1', 'part_fabricator', 0, 0, ['front'])
    const dest = makeMachineInfo('d1', 'assembler', 0, 1, ['front'])
    const belt = makeBeltInfo({ id: 'belt-fab', source: fab, sourceSlot: 'front', destination: dest })

    sync.syncAddedBelt(belt)

    const call = lastCallFor('fab1')
    expect(call.port ?? 'primary').toBe<MachineOutputPort>('primary')
  })

  it('non-splitter machine (assembler) with explicit non-front sourceSlot still maps to "primary"', () => {
    // Hypothetical: even if a future machine type ever exposed multiple
    // outputs, only splitter is mapped to multi-port — guard the
    // narrow rule explicitly.
    const asm = makeMachineInfo('asm1', 'assembler', 0, 0, ['front'])
    const dest = makeMachineInfo('d1', 'painter', 1, 0, ['front'])
    const belt = makeBeltInfo({ id: 'belt-asm', source: asm, sourceSlot: 'right', destination: dest })

    sync.syncAddedBelt(belt)

    const call = lastCallFor('asm1')
    expect(call.port ?? 'primary').toBe<MachineOutputPort>('primary')
  })
})
