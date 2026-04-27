import type { BeltInfo, Direction, GridPosition, MachineInfo, MachineType, SlotPosition } from './types'

export interface RestoredMachineState {
  x: number
  z: number
  type: MachineType
  rotation: Direction
  name?: string
}

export interface RestoredBeltState {
  sourceSlot: SlotPosition
  destinationSlot: SlotPosition
  path: GridPosition[]
  name?: string
}

export interface FactoryRestoreHost {
  getSlotBlockingEnabled(): boolean
  setSlotBlockingEnabled(enabled: boolean): void
  placeMachine(x: number, z: number, type: MachineType, rotation: Direction): MachineInfo | null
  renameMachine(x: number, z: number, name: string): boolean
  getMachineAt(x: number, z: number): MachineInfo | null
  registerRestoredBelt(belt: Omit<BeltInfo, 'id' | 'name'> & { name?: string }): void
}

export function restoreFactoryState(
  host: FactoryRestoreHost,
  machines: ReadonlyArray<RestoredMachineState>,
  belts: ReadonlyArray<RestoredBeltState>,
): void {
  const wasEnabled = host.getSlotBlockingEnabled()
  host.setSlotBlockingEnabled(false)
  try {
    for (const machine of machines) {
      host.placeMachine(machine.x, machine.z, machine.type, machine.rotation)
      if (machine.name) host.renameMachine(machine.x, machine.z, machine.name)
    }
  } finally {
    host.setSlotBlockingEnabled(wasEnabled)
  }

  for (const belt of belts) {
    if (belt.path.length < 2) continue
    const srcPos = belt.path[0]
    const dstPos = belt.path[belt.path.length - 1]
    const sourceMachine = host.getMachineAt(srcPos.x, srcPos.z)
    const destinationMachine = host.getMachineAt(dstPos.x, dstPos.z)
    if (!sourceMachine || !destinationMachine) continue

    host.registerRestoredBelt({
      name: belt.name,
      sourceMachine,
      sourceSlot: belt.sourceSlot,
      destinationMachine,
      destinationSlot: belt.destinationSlot,
      path: belt.path.map(p => ({ x: p.x, z: p.z })),
    })
  }
}