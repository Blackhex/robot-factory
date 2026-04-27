import type { BeltInfo, Direction, GridPosition, MachineInfo, SlotPosition } from './types'
import { offsetToSlotPosition, slotPositionToOffset } from './SlotUtils'
import type { PlacementPlanner } from './PlacementPlanner'
import type { FactoryQueries } from './FactoryQueries'

export interface PlaceBeltChainOptions {
  fixedRotations?: boolean
  lockedMachinePos?: GridPosition
  ignoreBeltIds?: ReadonlySet<string>
  targetSlotPosition?: SlotPosition
  sourceSlotPosition?: SlotPosition
  requireTargetSlotPosition?: boolean
  tryReverseSlotType?: boolean
}

export interface ComputeBeltFromSlotPathOptions {
  ignoreBeltIds?: ReadonlySet<string>
  fixedRotations?: boolean
  targetSlotPosition?: SlotPosition
  sourceSlotPosition?: SlotPosition
  requireTargetSlotPosition?: boolean
  tryReverseSlotType?: boolean
}

interface FactoryBeltPlacementHost {
  isInBounds(x: number, z: number): boolean
  hasBeltSegment(from: GridPosition, to: GridPosition, ignoreBeltIds?: ReadonlySet<string>): boolean
  isSlotFree(machine: MachineInfo, slotOffset: GridPosition): boolean
  getMachineAt(x: number, z: number): MachineInfo | null
  setMachineRotation(x: number, z: number, rotation: Direction): void
  nextBeltId(): string
  nextBeltName(): string
  registerBelt(belt: BeltInfo): void
}

export class FactoryBeltPlacement {
  private readonly host: FactoryBeltPlacementHost
  private readonly planner: PlacementPlanner
  private readonly queries: FactoryQueries

  constructor(
    host: FactoryBeltPlacementHost,
    planner: PlacementPlanner,
    queries: FactoryQueries,
  ) {
    this.host = host
    this.planner = planner
    this.queries = queries
  }

  placeBelt(
    sourceMachine: MachineInfo,
    sourceSlot: GridPosition,
    destinationMachine: MachineInfo,
    destinationSlot: GridPosition,
  ): boolean {
    const srcOutputOffsets = sourceMachine.slots.outputs.map(p => slotPositionToOffset(p, sourceMachine.rotation))
    const isValidOutput = srcOutputOffsets.some(o => o.x === sourceSlot.x && o.z === sourceSlot.z)
    if (!isValidOutput) return false

    const dstInputOffsets = destinationMachine.slots.inputs.map(p => slotPositionToOffset(p, destinationMachine.rotation))
    const isValidInput = dstInputOffsets.some(i => i.x === destinationSlot.x && i.z === destinationSlot.z)
    if (!isValidInput) return false

    if (!this.host.isSlotFree(sourceMachine, sourceSlot)) return false
    if (!this.host.isSlotFree(destinationMachine, destinationSlot)) return false

    const srcSlotCell = { x: sourceMachine.x + sourceSlot.x, z: sourceMachine.z + sourceSlot.z }
    const dstSlotCell = { x: destinationMachine.x + destinationSlot.x, z: destinationMachine.z + destinationSlot.z }

    if (!this.host.isInBounds(srcSlotCell.x, srcSlotCell.z)) return false
    if (!this.host.isInBounds(dstSlotCell.x, dstSlotCell.z)) return false

    const sameCell = srcSlotCell.x === dstSlotCell.x && srcSlotCell.z === dstSlotCell.z
    if (!sameCell && !areAdjacent(srcSlotCell, dstSlotCell)) return false

    const srcMachinePos = { x: sourceMachine.x, z: sourceMachine.z }
    const dstMachinePos = { x: destinationMachine.x, z: destinationMachine.z }

    const path: GridPosition[] = [srcMachinePos, srcSlotCell]
    if (!sameCell) {
      path.push(dstSlotCell)
    }
    path.push(dstMachinePos)

    for (let i = 0; i < path.length - 1; i++) {
      if (this.host.hasBeltSegment(path[i], path[i + 1])) return false
    }

    const srcSlotPos = offsetToSlotPosition(sourceSlot, sourceMachine.rotation)
    const dstSlotPos = offsetToSlotPosition(destinationSlot, destinationMachine.rotation)
    if (!srcSlotPos || !dstSlotPos) return false

    this.host.registerBelt({
      id: this.host.nextBeltId(),
      name: this.host.nextBeltName(),
      sourceMachine,
      sourceSlot: srcSlotPos,
      destinationMachine,
      destinationSlot: dstSlotPos,
      path,
    })
    return true
  }

  placeBeltChain(from: MachineInfo, to: MachineInfo, sourceSlotType: 'input' | 'output' = 'output', opts?: PlaceBeltChainOptions): boolean {
    const { fixedRotations, lockedMachinePos, ignoreBeltIds, targetSlotPosition, sourceSlotPosition, requireTargetSlotPosition, tryReverseSlotType = false } = opts ?? {}
    const savedFromRot = from.rotation
    const savedToRot = to.rotation
    const baseOpts = { fixedRotations, lockedMachinePos, ignoreBeltIds, targetSlotPosition, sourceSlotPosition, requireTargetSlotPosition, tryReverseSlotType }
    if (this.tryPlaceBeltWithIgnore(from, to, sourceSlotType, baseOpts)) {
      return true
    }

    this.host.setMachineRotation(from.x, from.z, savedFromRot)
    this.host.setMachineRotation(to.x, to.z, savedToRot)
    return false
  }

  computeBeltFromSlotPath(
    from: GridPosition, to: GridPosition,
    sourceSlotType: 'input' | 'output',
    opts?: ComputeBeltFromSlotPathOptions,
  ): { path: GridPosition[], collides: boolean } | null {
    const { ignoreBeltIds, fixedRotations, targetSlotPosition, sourceSlotPosition, requireTargetSlotPosition, tryReverseSlotType = false } = opts ?? {}
    const plannerOpts = { ignoreBeltIds, fixedRotations, targetSlotPosition, sourceSlotPosition, requireTargetSlotPosition, tryReverseSlotType }
    const plan = this.planner.computePlacementPlan(from, to, sourceSlotType, plannerOpts)
    if (plan && !plan.collides && this.isValidSlotPath(plan.path, effectiveSourceSlotType(sourceSlotType, plan.reversed))) {
      return { path: plan.path, collides: false }
    }

    if (plan) return { path: plan.path, collides: plan.collides }
    return null
  }

  private tryPlaceBeltWithIgnore(
    from: MachineInfo, to: MachineInfo,
    sourceSlotType: 'input' | 'output',
    opts?: PlaceBeltChainOptions,
  ): boolean {
    const { fixedRotations, lockedMachinePos, ignoreBeltIds, targetSlotPosition, sourceSlotPosition, requireTargetSlotPosition, tryReverseSlotType } = opts ?? {}
    const fromPos: GridPosition = { x: from.x, z: from.z }
    const toPos: GridPosition = { x: to.x, z: to.z }
    const forcedHasBelts = lockedMachinePos
      ? new Set([`${lockedMachinePos.x},${lockedMachinePos.z}`]) as ReadonlySet<string>
      : undefined
    const plan = this.planner.computePlacementPlan(fromPos, toPos, sourceSlotType, {
      ignoreBeltIds, fixedRotations, forcedHasBelts,
      targetSlotPosition, sourceSlotPosition, requireTargetSlotPosition, tryReverseSlotType,
    })

    if (!plan || plan.collides) return false

    const effectiveType = effectiveSourceSlotType(sourceSlotType, plan.reversed)
    const isFromLocked = lockedMachinePos && fromPos.x === lockedMachinePos.x && fromPos.z === lockedMachinePos.z

    if (!fixedRotations && !isFromLocked && plan.srcRotation !== undefined) {
      this.host.setMachineRotation(from.x, from.z, plan.srcRotation)
    }

    const path = plan.path
    const srcMachine = effectiveType === 'output' ? from : to
    const dstMachine = effectiveType === 'output' ? to : from

    const srcSlotOffset = { x: path[1].x - path[0].x, z: path[1].z - path[0].z }
    const dstSlotOffset = { x: path[path.length - 2].x - path[path.length - 1].x, z: path[path.length - 2].z - path[path.length - 1].z }
    const srcSlot = offsetToSlotPosition(srcSlotOffset, srcMachine.rotation)
    const dstSlot = offsetToSlotPosition(dstSlotOffset, dstMachine.rotation)
    if (!srcSlot || !dstSlot) return false
    if (!srcMachine.slots.outputs.includes(srcSlot) || !dstMachine.slots.inputs.includes(dstSlot)) return false

    if (!this.queries.isSlotFreeExcluding(srcMachine, srcSlotOffset, ignoreBeltIds) ||
      !this.queries.isSlotFreeExcluding(dstMachine, dstSlotOffset, ignoreBeltIds)) return false

    this.host.registerBelt({
      id: this.host.nextBeltId(),
      name: this.host.nextBeltName(),
      sourceMachine: srcMachine,
      sourceSlot: srcSlot,
      destinationMachine: dstMachine,
      destinationSlot: dstSlot,
      path: path.map(p => ({ x: p.x, z: p.z })),
    })
    return true
  }

  private isValidSlotPath(path: GridPosition[], sourceSlotType: 'input' | 'output'): boolean {
    if (path.length < 2) return false
    const srcMachine = sourceSlotType === 'output'
      ? this.host.getMachineAt(path[0].x, path[0].z)
      : this.host.getMachineAt(path[path.length - 1].x, path[path.length - 1].z)
    const dstMachine = sourceSlotType === 'output'
      ? this.host.getMachineAt(path[path.length - 1].x, path[path.length - 1].z)
      : this.host.getMachineAt(path[0].x, path[0].z)
    if (!srcMachine || !dstMachine) return false

    const srcSlotOffset = { x: path[1].x - path[0].x, z: path[1].z - path[0].z }
    const dstSlotOffset = { x: path[path.length - 2].x - path[path.length - 1].x, z: path[path.length - 2].z - path[path.length - 1].z }
    const srcSlot = offsetToSlotPosition(srcSlotOffset, srcMachine.rotation)
    const dstSlot = offsetToSlotPosition(dstSlotOffset, dstMachine.rotation)
    if (!srcSlot || !dstSlot) return false
    return srcMachine.slots.outputs.includes(srcSlot) && dstMachine.slots.inputs.includes(dstSlot)
  }
}

function effectiveSourceSlotType(sourceSlotType: 'input' | 'output', reversed: boolean | undefined): 'input' | 'output' {
  if (!reversed) return sourceSlotType
  return sourceSlotType === 'output' ? 'input' : 'output'
}

function areAdjacent(a: GridPosition, b: GridPosition): boolean {
  const dx = Math.abs(a.x - b.x)
  const dz = Math.abs(a.z - b.z)
  return (dx === 1 && dz === 0) || (dx === 0 && dz === 1)
}
