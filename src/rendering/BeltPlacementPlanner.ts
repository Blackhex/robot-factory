import type { Factory, MachineInfo } from '../game/Factory'
import type { GridPosition, SlotPosition } from '../game/types'

export type BeltSlotType = 'input' | 'output'

export type BeltPathPlan = { path: GridPosition[], collides: boolean }

type BeltPlacementStep = {
  slotType: BeltSlotType
  fixedRotations?: boolean
  tryReverseSlotType: boolean
}

export class BeltPlacementPlanner {
  private readonly factory: Factory

  constructor(factory: Factory) {
    this.factory = factory
  }

  computeBestPath(
    origin: GridPosition,
    target: GridPosition,
    slotType: BeltSlotType,
    ignoreBeltIds?: ReadonlySet<string>,
    targetSlotPosition?: SlotPosition,
    sourceSlotPosition?: SlotPosition,
  ): BeltPathPlan | null {
    const explicitSlot = !!sourceSlotPosition || !!targetSlotPosition
    return this.runPlacementLadder(
      slotType,
      explicitSlot,
      ({ slotType: stepSlotType, fixedRotations, tryReverseSlotType }) =>
        this.factory.computeBeltFromSlotPath(origin, target, stepSlotType, {
          ignoreBeltIds, fixedRotations, targetSlotPosition, sourceSlotPosition, tryReverseSlotType,
        }),
      (result) => !!result && !result.collides,
    )
  }

  tryPlaceChain(
    srcMachine: MachineInfo,
    dstMachine: MachineInfo,
    slotType: BeltSlotType,
    targetSlotPosition?: SlotPosition,
    sourceSlotPosition?: SlotPosition,
  ): boolean {
    const explicitSlot = !!sourceSlotPosition || !!targetSlotPosition
    const placed = this.runPlacementLadder(
      slotType,
      explicitSlot,
      ({ slotType: stepSlotType, fixedRotations, tryReverseSlotType }) =>
        this.factory.placeBeltChain(srcMachine, dstMachine, stepSlotType, {
          fixedRotations, targetSlotPosition, sourceSlotPosition, tryReverseSlotType,
        }),
      (result) => result === true,
    )
    return placed === true
  }

  private runPlacementLadder<T>(
    slotType: BeltSlotType,
    explicitSlot: boolean,
    attempt: (step: BeltPlacementStep) => T | null,
    isSuccess: (result: T | null) => boolean,
  ): T | null {
    let result = explicitSlot
      ? attempt({ slotType, tryReverseSlotType: true })
      : attempt({ slotType, fixedRotations: true, tryReverseSlotType: true })
    if (!isSuccess(result) && !explicitSlot) {
      const relaxed = attempt({ slotType, tryReverseSlotType: true })
      if (isSuccess(relaxed)) result = relaxed
    }
    if (!isSuccess(result) && !explicitSlot) {
      const reverseSlotType: BeltSlotType = slotType === 'input' ? 'output' : 'input'
      const reversed = attempt({ slotType: reverseSlotType, tryReverseSlotType: false })
      if (isSuccess(reversed)) result = reversed
    }
    return result
  }
}