import type { Machine } from '../game/Machine'
import type { ItemType } from '../game/types'
import type { BeltLike } from './BeltTopologyCache'

type BeltEndpoint = Pick<BeltLike, 'toX' | 'toZ'>

type FrontItem = {
  type: ItemType
}

type EndpointMachine = Pick<Machine, 'canAcceptInput' | 'canConsume'>

interface TerminalDrainGraceDeciderDeps {
  getMachineAt: (x: number, z: number) => { id: string } | null | undefined
  getMachineById: (id: string) => EndpointMachine | undefined
}

export type TerminalDrainGraceDecider = (
  belt: BeltEndpoint,
  frontItem: FrontItem | undefined,
) => boolean

export function createTerminalDrainGraceDecider(
  deps: TerminalDrainGraceDeciderDeps,
): TerminalDrainGraceDecider {
  return (belt, frontItem) => {
    if (!frontItem) return false

    const machineInfo = deps.getMachineAt(belt.toX, belt.toZ)
    if (!machineInfo) return false

    const machine = deps.getMachineById(machineInfo.id)
    return machine !== undefined &&
      machine.canAcceptInput() &&
      machine.canConsume(frontItem.type)
  }
}