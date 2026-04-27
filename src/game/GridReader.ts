import type { BeltInfo, GridPosition, MachineInfo } from './types'

/** Read-only interface for querying factory grid state. */
export interface GridReader {
  readonly width: number
  readonly height: number
  isInBounds(x: number, z: number): boolean
  getMachineAt(x: number, z: number): MachineInfo | null
  getBeltsAt(x: number, z: number): ReadonlyArray<BeltInfo>
  hasBeltSegment(from: GridPosition, to: GridPosition, ignoreBeltIds?: ReadonlySet<string>): boolean
  isSlotFree(machine: MachineInfo, slotOffset: GridPosition): boolean
  getFreeSlotsOfType(machine: MachineInfo, slotType: 'input' | 'output', ignoreBeltIds?: ReadonlySet<string>): GridPosition[]
  cellHasBeltsExcluding(x: number, z: number, ignoreBeltIds?: ReadonlySet<string>): boolean
  machineHasAnyBelts(x: number, z: number): boolean
}