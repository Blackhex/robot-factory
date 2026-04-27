import type * as THREE from 'three'
import type { Factory, MachineInfo } from '../game/Factory'
import { pickBestSlotOffset, slotPositionToOffset } from '../game/Factory'
import type { GridPosition, SlotPosition } from '../game/types'
import type { FactoryRenderer } from './FactoryRenderer'
import type { GridInteractionPreview, GridToWorld } from './GridInteractionPreview'
import { BeltDropTargetResolver } from './BeltDropTargetResolver'
import { BeltPlacementPlanner, type BeltPathPlan, type BeltSlotType } from './BeltPlacementPlanner'

export type BeltDragPreviewState = {
  origin: GridPosition
  sourceSlotType: BeltSlotType | null
  sourceSlotPosition: SlotPosition | null
  ignoreBeltIds: ReadonlySet<string>
}

export type BeltDragCommitState = BeltDragPreviewState & {
  raycastDropTarget: GridPosition | null
}

export class BeltDragInteraction {
  private readonly factory: Factory
  private readonly preview: GridInteractionPreview
  private readonly gridToWorld: GridToWorld
  private readonly onFactoryChanged: () => void
  private readonly dropTargetResolver: BeltDropTargetResolver
  private readonly placementPlanner: BeltPlacementPlanner

  constructor(options: {
    factory: Factory
    preview: GridInteractionPreview
    gridToWorld: GridToWorld
    getFactoryRenderer: () => FactoryRenderer | null
    onFactoryChanged: () => void
  }) {
    this.factory = options.factory
    this.preview = options.preview
    this.gridToWorld = options.gridToWorld
    this.onFactoryChanged = options.onFactoryChanged
    this.dropTargetResolver = new BeltDropTargetResolver({
      factory: options.factory,
      getFactoryRenderer: options.getFactoryRenderer,
    })
    this.placementPlanner = new BeltPlacementPlanner(options.factory)
  }

  showPreview(cell: GridPosition, raycaster: THREE.Raycaster, state: BeltDragPreviewState): void {
    this.preview.setHighlightStyle(0xff8844, 0.5)
    this.preview.hideMachineGhost()
    this.preview.clearGhostSlots()
    if (!state.sourceSlotType) return

    const targetSlotPosition = this.dropTargetResolver.resolveTargetSlotFromRaycast(raycaster, state.origin)
    const snapTarget = this.dropTargetResolver.findSnapTarget(cell, state.origin, state.sourceSlotType)
    const effectiveTarget = snapTarget ?? cell
    if (snapTarget && (snapTarget.x !== cell.x || snapTarget.z !== cell.z)) {
      this.preview.moveHighlight(this.gridToWorld(snapTarget.x, snapTarget.z))
    }

    const result = this.computeBestPath(
      state.origin,
      effectiveTarget,
      state.sourceSlotType,
      state.ignoreBeltIds,
      targetSlotPosition,
      state.sourceSlotPosition ?? undefined,
    )
    this.preview.clearGhostBelts()
    if (result) {
      this.preview.showGhostBeltPathFromPoints(result.path, result.collides)
      return
    }

    this.showFallbackGhost(state, effectiveTarget)
  }

  resolveDropTargetFromRaycast(raycaster: THREE.Raycaster, origin: GridPosition): GridPosition | null {
    return this.dropTargetResolver.resolveDropTargetFromRaycast(raycaster, origin)
  }

  commitDrop(cell: GridPosition, raycaster: THREE.Raycaster, state: BeltDragCommitState): void {
    const snapTarget = state.raycastDropTarget ??
      this.dropTargetResolver.findSnapTarget(cell, state.origin, state.sourceSlotType)
    const effectiveTarget = snapTarget ?? cell
    const sameCellSnap = effectiveTarget.x === state.origin.x && effectiveTarget.z === state.origin.z
    if (sameCellSnap || !snapTarget) return

    const srcMachine = this.factory.getMachineAt(state.origin.x, state.origin.z)
    const dstMachine = this.factory.getMachineAt(effectiveTarget.x, effectiveTarget.z)
    if (!srcMachine || !dstMachine) return

    const slotType = state.sourceSlotType ?? 'output'
    const targetSlotPosition = this.dropTargetResolver.resolveTargetSlotFromRaycast(raycaster, state.origin)
    const placed = this.tryPlaceChain(
      srcMachine,
      dstMachine,
      slotType,
      targetSlotPosition,
      state.sourceSlotPosition ?? undefined,
    )
    if (placed) this.onFactoryChanged()
  }

  computeBestPath(
    origin: GridPosition,
    target: GridPosition,
    slotType: BeltSlotType,
    ignoreBeltIds?: ReadonlySet<string>,
    targetSlotPosition?: SlotPosition,
    sourceSlotPosition?: SlotPosition,
  ): BeltPathPlan | null {
    return this.placementPlanner.computeBestPath(
      origin, target, slotType, ignoreBeltIds, targetSlotPosition, sourceSlotPosition,
    )
  }

  tryPlaceChain(
    srcMachine: MachineInfo,
    dstMachine: MachineInfo,
    slotType: BeltSlotType,
    targetSlotPosition?: SlotPosition,
    sourceSlotPosition?: SlotPosition,
  ): boolean {
    return this.placementPlanner.tryPlaceChain(
      srcMachine, dstMachine, slotType, targetSlotPosition, sourceSlotPosition,
    )
  }

  private showFallbackGhost(state: BeltDragPreviewState, effectiveTarget: GridPosition): void {
    const srcMachine = this.factory.getMachineAt(state.origin.x, state.origin.z)
    if (!srcMachine || !state.sourceSlotType) return

    const srcHasFreeOutput = this.factory.getFreeSlotsOfType(srcMachine, 'output', state.ignoreBeltIds).length > 0
    const srcHasFreeInput = this.factory.getFreeSlotsOfType(srcMachine, 'input', state.ignoreBeltIds).length > 0
    let noFreeSlots = !srcHasFreeOutput && !srcHasFreeInput

    const tgtMachine = this.factory.getMachineAt(effectiveTarget.x, effectiveTarget.z)
    if (!noFreeSlots && tgtMachine && (tgtMachine.x !== srcMachine.x || tgtMachine.z !== srcMachine.z)) {
      const tgtHasFreeInput = this.factory.getFreeSlotsOfType(tgtMachine, 'input', state.ignoreBeltIds).length > 0
      const tgtHasFreeOutput = this.factory.getFreeSlotsOfType(tgtMachine, 'output', state.ignoreBeltIds).length > 0
      const canConnect = (srcHasFreeOutput && tgtHasFreeInput) || (srcHasFreeInput && tgtHasFreeOutput)
      if (!canConnect) noFreeSlots = true
    }

    const slotList = (state.sourceSlotType === 'output' ? srcMachine.slots.outputs : srcMachine.slots.inputs)
      .map(position => slotPositionToOffset(position, srcMachine.rotation))
    const slotOff = pickBestSlotOffset(slotList, srcMachine.x, srcMachine.z, effectiveTarget)
    if (!slotOff) return

    const slotCell = { x: srcMachine.x + slotOff.x, z: srcMachine.z + slotOff.z }
    if (slotCell.x === effectiveTarget.x && slotCell.z === effectiveTarget.z) {
      this.preview.showGhostBeltPathFromPoints(
        [{ x: srcMachine.x, z: srcMachine.z }, slotCell],
        noFreeSlots,
      )
      return
    }

    const mid = this.factory.findBestBeltPath(slotCell, effectiveTarget, state.ignoreBeltIds, slotOff)
    this.preview.showGhostBeltPathFromPoints(
      [{ x: srcMachine.x, z: srcMachine.z }, ...mid.path],
      noFreeSlots || mid.collides,
    )
  }
}