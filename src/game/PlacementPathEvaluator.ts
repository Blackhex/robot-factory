import type { Direction, GridPosition, MachineInfo, SlotPosition } from './types'
import type { GridReader } from './GridReader'
import type { BeltRouter } from './BeltRouter'
import { offsetToSlotPosition, slotPositionToOffset } from './SlotUtils'

export type PlacementPathResult = { path: GridPosition[], collides: boolean }

export interface CandidateRotationEvaluation {
  slotResult: PlacementPathResult | null
  directResult: PlacementPathResult | null
}

/**
 * The direct path bypasses slot constraints. When a specific source/target
 * slot is requested, ensure the direct path's endpoints actually align with
 * that slot under the given rotations.
 */
export function directPathHonoursSlots(
  dr: PlacementPathResult | null,
  sourceSlotPosition: SlotPosition | undefined,
  targetSlotPosition: SlotPosition | undefined,
  srcRotation: Direction,
  tgtRotation: Direction,
  sourceMachine?: MachineInfo,
  targetMachine?: MachineInfo,
  sourceSlotType?: 'input' | 'output',
): boolean {
  if (!dr || dr.path.length < 2) return false
  if (sourceSlotPosition) {
    const expected = slotPositionToOffset(sourceSlotPosition, srcRotation)
    const actual = { x: dr.path[1].x - dr.path[0].x, z: dr.path[1].z - dr.path[0].z }
    if (actual.x !== expected.x || actual.z !== expected.z) return false
  } else if (sourceMachine && sourceSlotType) {
    const actual = { x: dr.path[1].x - dr.path[0].x, z: dr.path[1].z - dr.path[0].z }
    const slot = offsetToSlotPosition(actual, srcRotation)
    const allowed = sourceSlotType === 'input' ? sourceMachine.slots.inputs : sourceMachine.slots.outputs
    if (!slot || !allowed.includes(slot)) return false
  }
  if (targetSlotPosition) {
    const expected = slotPositionToOffset(targetSlotPosition, tgtRotation)
    const last = dr.path.length - 1
    const actual = { x: dr.path[last - 1].x - dr.path[last].x, z: dr.path[last - 1].z - dr.path[last].z }
    if (actual.x !== expected.x || actual.z !== expected.z) return false
  } else if (targetMachine && sourceSlotType) {
    const last = dr.path.length - 1
    const actual = { x: dr.path[last - 1].x - dr.path[last].x, z: dr.path[last - 1].z - dr.path[last].z }
    const slot = offsetToSlotPosition(actual, tgtRotation)
    const targetSlotType = sourceSlotType === 'output' ? 'input' : 'output'
    const allowed = targetSlotType === 'input' ? targetMachine.slots.inputs : targetMachine.slots.outputs
    if (!slot || !allowed.includes(slot)) return false
  }
  return true
}

export class PlacementPathEvaluator {
  private readonly grid: GridReader
  private readonly router: BeltRouter

  constructor(grid: GridReader, router: BeltRouter) {
    this.grid = grid
    this.router = router
  }

  evaluateCandidateRotation(
    candidate: Direction,
    from: GridPosition, to: GridPosition,
    sourceMachine: MachineInfo, simTarget: MachineInfo,
    sourceSlotType: 'input' | 'output',
    ignoreBeltIds: ReadonlySet<string> | undefined,
    fixedRotations: boolean | undefined,
    ignoreMachinePositions: ReadonlySet<string> | undefined,
    blockedPositions: ReadonlySet<string> | undefined,
    sourceSlotPosition: SlotPosition | undefined,
    targetSlotPosition: SlotPosition | undefined,
    targetHasFreeSlots: boolean,
  ): CandidateRotationEvaluation {
    const simSource: MachineInfo = { ...sourceMachine, rotation: candidate }

    const slotResult = this.computeSlotPath(
      from, to, simSource, simTarget, sourceSlotType,
      ignoreBeltIds, fixedRotations, ignoreMachinePositions, blockedPositions,
      targetSlotPosition, sourceSlotPosition,
    )

    const sourceHasFreeSlots =
      this.grid.getFreeSlotsOfType(simSource, sourceSlotType, ignoreBeltIds).length > 0
    const directResult = (sourceHasFreeSlots && targetHasFreeSlots)
      ? this.computeDirectPath(from, to, ignoreBeltIds, ignoreMachinePositions, blockedPositions)
      : null

    return { slotResult, directResult }
  }

  computeSlotPath(
    from: GridPosition, to: GridPosition,
    simSource: MachineInfo, simTarget: MachineInfo,
    sourceSlotType: 'input' | 'output',
    ignoreBeltIds?: ReadonlySet<string>,
    fixedRotations?: boolean,
    ignoreMachinePositions?: ReadonlySet<string>,
    blockedPositions?: ReadonlySet<string>,
    targetSlotPosition?: SlotPosition,
    sourceSlotPosition?: SlotPosition,
  ): PlacementPathResult | null {
    const neededTargetSlotType: 'input' | 'output' = sourceSlotType === 'output' ? 'input' : 'output'
    let sourceSlots = this.grid.getFreeSlotsOfType(simSource, sourceSlotType, ignoreBeltIds)
    let targetSlots = this.grid.getFreeSlotsOfType(simTarget, neededTargetSlotType, ignoreBeltIds)
    if (sourceSlots.length === 0 || targetSlots.length === 0) return null

    if (sourceSlotPosition) {
      const desiredOffset = slotPositionToOffset(sourceSlotPosition, simSource.rotation)
      const filtered = sourceSlots.filter(s => s.x === desiredOffset.x && s.z === desiredOffset.z)
      if (filtered.length === 0) return null
      sourceSlots = filtered
    }

    if (targetSlotPosition) {
      const desiredOffset = slotPositionToOffset(targetSlotPosition, simTarget.rotation)
      const filtered = targetSlots.filter(s => s.x === desiredOffset.x && s.z === desiredOffset.z)
      if (filtered.length === 0) return null
      targetSlots = filtered
    }

    let bestClear: PlacementPathResult | null = null
    let bestColliding: PlacementPathResult | null = null

    for (const sourceSlotOffset of sourceSlots) {
      for (const targetSlotOffset of targetSlots) {
        const result = this.computeSlotPathForPair(
          from, to, sourceSlotOffset, targetSlotOffset, sourceSlotType, ignoreBeltIds, fixedRotations, ignoreMachinePositions, blockedPositions,
        )
        if (!result) continue

        if (!result.collides) {
          if (!bestClear || result.path.length < bestClear.path.length) {
            bestClear = result
          }
        } else {
          if (!bestColliding || result.path.length < bestColliding.path.length) {
            bestColliding = result
          }
        }
      }
    }

    return bestClear ?? bestColliding ?? null
  }

  computeDirectPath(
    from: GridPosition, to: GridPosition,
    ignoreBeltIds?: ReadonlySet<string>,
    ignoreMachinePositions?: ReadonlySet<string>,
    blockedPositions?: ReadonlySet<string>,
  ): PlacementPathResult | null {
    const result = this.router.findBestBeltPath(from, to, ignoreBeltIds, undefined, undefined, ignoreMachinePositions, blockedPositions)
    if (result.path.length < 2) return null
    return result
  }

  private computeSlotPathForPair(
    from: GridPosition, to: GridPosition,
    sourceSlotOffset: GridPosition, targetSlotOffset: GridPosition,
    sourceSlotType: 'input' | 'output',
    ignoreBeltIds?: ReadonlySet<string>,
    fixedRotations?: boolean,
    ignoreMachinePositions?: ReadonlySet<string>,
    blockedPositions?: ReadonlySet<string>,
  ): PlacementPathResult | null {
    const srcSlotCell = { x: from.x + sourceSlotOffset.x, z: from.z + sourceSlotOffset.z }
    const tgtSlotCell = { x: to.x + targetSlotOffset.x, z: to.z + targetSlotOffset.z }

    if (!this.grid.isInBounds(srcSlotCell.x, srcSlotCell.z) || !this.grid.isInBounds(tgtSlotCell.x, tgtSlotCell.z)) return null
    const srcSlotMachine = this.grid.getMachineAt(srcSlotCell.x, srcSlotCell.z)
    if (srcSlotMachine && !(srcSlotCell.x === to.x && srcSlotCell.z === to.z) && !ignoreMachinePositions?.has(`${srcSlotCell.x},${srcSlotCell.z}`)) return null
    const tgtSlotMachine = this.grid.getMachineAt(tgtSlotCell.x, tgtSlotCell.z)
    if (tgtSlotMachine && !(tgtSlotCell.x === from.x && tgtSlotCell.z === from.z) && !ignoreMachinePositions?.has(`${tgtSlotCell.x},${tgtSlotCell.z}`)) return null

    let outputMachine: GridPosition
    let outputSlotCell: GridPosition
    let inputSlotCell: GridPosition
    let inputMachine: GridPosition

    if (sourceSlotType === 'output') {
      outputMachine = from; outputSlotCell = srcSlotCell
      inputSlotCell = tgtSlotCell; inputMachine = to
    } else {
      outputMachine = to; outputSlotCell = tgtSlotCell
      inputSlotCell = srcSlotCell; inputMachine = from
    }

    const fullPath: GridPosition[] = [{ x: outputMachine.x, z: outputMachine.z }]

    if (outputSlotCell.x === inputSlotCell.x && outputSlotCell.z === inputSlotCell.z) {
      fullPath.push({ x: outputSlotCell.x, z: outputSlotCell.z })
      fullPath.push({ x: inputMachine.x, z: inputMachine.z })
      return { path: fullPath, collides: this.router.wouldPathCollide(fullPath, ignoreBeltIds, ignoreMachinePositions, blockedPositions) }
    }

    if (outputSlotCell.x === inputMachine.x && outputSlotCell.z === inputMachine.z) {
      fullPath.push({ x: outputSlotCell.x, z: outputSlotCell.z })
      return { path: fullPath, collides: this.router.wouldPathCollide(fullPath, ignoreBeltIds, ignoreMachinePositions, blockedPositions) }
    }

    const outDir: GridPosition = { x: outputSlotCell.x - outputMachine.x, z: outputSlotCell.z - outputMachine.z }
    const inDir: GridPosition = { x: inputSlotCell.x - inputMachine.x, z: inputSlotCell.z - inputMachine.z }
    const requiredLastDir = { x: -inDir.x, z: -inDir.z }

    const constrained = this.router.findBestBeltPath(
      outputSlotCell, inputSlotCell, ignoreBeltIds,
      fixedRotations ? undefined : outDir,
      requiredLastDir,
      ignoreMachinePositions, blockedPositions,
    )

    const constrainedFull: GridPosition[] = [{ x: outputMachine.x, z: outputMachine.z }, ...constrained.path, { x: inputMachine.x, z: inputMachine.z }]
    const constrainedCollides = constrained.collides || this.router.wouldPathCollide(constrainedFull, ignoreBeltIds, ignoreMachinePositions, blockedPositions)

    const relaxed = this.router.findBestBeltPath(
      outputSlotCell, inputSlotCell, ignoreBeltIds,
      undefined,
      undefined,
      ignoreMachinePositions, blockedPositions,
    )

    const relaxedFull: GridPosition[] = [{ x: outputMachine.x, z: outputMachine.z }, ...relaxed.path, { x: inputMachine.x, z: inputMachine.z }]
    const relaxedCollides = relaxed.collides || this.router.wouldPathCollide(relaxedFull, ignoreBeltIds, ignoreMachinePositions, blockedPositions)

    if (!constrainedCollides && !relaxedCollides) {
      return constrainedFull.length <= relaxedFull.length
        ? { path: constrainedFull, collides: false }
        : { path: relaxedFull, collides: false }
    }
    if (!constrainedCollides) return { path: constrainedFull, collides: false }
    if (!relaxedCollides) return { path: relaxedFull, collides: false }
    return { path: constrainedFull, collides: true }
  }
}