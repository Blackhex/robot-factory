import type { Direction, GridPosition, MachineInfo, MachineType, SlotPosition } from './types'
import type { GridReader } from './GridReader'
import type { BeltRouter } from './BeltRouter'
import type { PlacementPlanOptions, PlacementPlanResult } from './PlacementPlanTypes'
import { rotationToFace, pickBestSlotOffset, slotPositionToOffset } from './SlotUtils'
import { machineSlotPointsAtNeighbor } from './SlotBlocking'
import { directPathHonoursSlots, PlacementPathEvaluator } from './PlacementPathEvaluator'
import { ReconnectPreviewPlanner } from './ReconnectPreviewPlanner'

export type { PlacementPlanOptions, PlacementPlanResult } from './PlacementPlanTypes'

export class PlacementPlanner {
  private readonly grid: GridReader
  private readonly router: BeltRouter
  private readonly pathEvaluator: PlacementPathEvaluator
  private readonly reconnectPreviewPlanner: ReconnectPreviewPlanner

  constructor(
    grid: GridReader,
    router: BeltRouter,
  ) {
    this.grid = grid
    this.router = router
    this.pathEvaluator = new PlacementPathEvaluator(grid, router)
    this.reconnectPreviewPlanner = new ReconnectPreviewPlanner(
      grid,
      (from, to, sourceSlotType, opts) => this.computePlacementPlan(from, to, sourceSlotType, opts),
    )
  }

  private resolveMachine(pos: GridPosition, virtualMachines?: ReadonlyMap<string, MachineInfo>): MachineInfo | null {
    const virtual = virtualMachines?.get(`${pos.x},${pos.z}`)
    if (virtual !== undefined) return virtual
    return this.grid.getMachineAt(pos.x, pos.z)
  }

  private resolveHasBelts(
    pos: GridPosition,
    virtualMachines?: ReadonlyMap<string, MachineInfo>,
    ignoreBeltIds?: ReadonlySet<string>,
    forcedHasBelts?: ReadonlySet<string>,
  ): boolean {
    const key = `${pos.x},${pos.z}`
    if (forcedHasBelts?.has(key)) return true
    if (virtualMachines?.has(key)) return false
    if (ignoreBeltIds) return this.grid.cellHasBeltsExcluding(pos.x, pos.z, ignoreBeltIds)
    return this.grid.machineHasAnyBelts(pos.x, pos.z)
  }

  /**
   * Compute the full placement plan (path + rotations) for a belt chain between
   * source and target machines. This is the single source of truth used by both
   * `placeBeltChain` (which applies the plan) and `computeBeltFromSlotPath`
   * (which returns the plan for ghost preview).
   *
   * @param virtualMachines — optional map of "x,z" → MachineInfo overrides for
   *   machines not yet physically in the grid (e.g. during drag ghost preview).
   */
  computePlacementPlan(
    from: GridPosition, to: GridPosition,
    sourceSlotType: 'input' | 'output',
    opts?: PlacementPlanOptions,
  ): PlacementPlanResult | null {
    const {
      ignoreBeltIds,
      fixedRotations,
      virtualMachines,
      ignoreMachinePositions,
      forcedHasBelts,
      extraBlockedCells,
      targetSlotPosition,
      sourceSlotPosition,
      requireTargetSlotPosition,
      tryReverseSlotType,
    } = opts ?? {}
    if (!this.grid.isInBounds(from.x, from.z) || !this.grid.isInBounds(to.x, to.z)) return null
    if (from.x === to.x && from.z === to.z) return null

    const sourceMachine = this.resolveMachine(from, virtualMachines)
    const targetMachine = this.resolveMachine(to, virtualMachines)
    if (!sourceMachine || !targetMachine) return null

    if (sourceSlotPosition) {
      const srcSlotList = sourceSlotType === 'input' ? sourceMachine.slots.inputs : sourceMachine.slots.outputs
      if (!srcSlotList.includes(sourceSlotPosition)) return null
    }

    if (targetSlotPosition) {
      const neededTgtType: 'input' | 'output' = sourceSlotType === 'output' ? 'input' : 'output'
      const tgtSlotList = neededTgtType === 'input' ? targetMachine.slots.inputs : targetMachine.slots.outputs
      if (!tgtSlotList.includes(targetSlotPosition)) {
        if (requireTargetSlotPosition) return null
        const lockedHasBelts = new Set<string>(forcedHasBelts ?? [])
        lockedHasBelts.add(`${to.x},${to.z}`)
        return this.computePlacementPlan(from, to, sourceSlotType, {
          ...opts,
          targetSlotPosition: undefined,
          forcedHasBelts: lockedHasBelts,
        })
      }
    }

    let blockedPositions: ReadonlySet<string> | undefined
    if (virtualMachines || extraBlockedCells) {
      const merged = new Set<string>()
      if (virtualMachines) for (const key of virtualMachines.keys()) merged.add(key)
      if (extraBlockedCells) for (const key of extraBlockedCells) merged.add(key)
      blockedPositions = merged
    }

    const sourceHasBelts = this.resolveHasBelts(from, virtualMachines, ignoreBeltIds, forcedHasBelts)

    const wouldViolateSlotBlocking = (rot: Direction): boolean =>
      machineSlotPointsAtNeighbor(
        { ...sourceMachine, rotation: rot },
        (gx, gz) => {
          if (ignoreMachinePositions?.has(`${gx},${gz}`)) return null
          return this.resolveMachine({ x: gx, z: gz }, virtualMachines)
        },
      )

    let simSrcRotation: Direction = sourceMachine.rotation
    if (!fixedRotations && !sourceHasBelts) {
      const trialFrom: GridPosition = sourceSlotPosition
        ? (() => {
            const off = slotPositionToOffset(sourceSlotPosition, sourceMachine.rotation)
            return { x: from.x + off.x, z: from.z + off.z }
          })()
        : from
      const trial = this.router.findBestBeltPath(trialFrom, to, ignoreBeltIds, undefined, undefined, ignoreMachinePositions, blockedPositions)
      if (trial.path.length >= 2) {
        const reverseAutoRotation = sourceSlotType === 'input'
        if (!sourceSlotPosition) {
          let firstDx = Math.sign(trial.path[1].x - trial.path[0].x)
          let firstDz = Math.sign(trial.path[1].z - trial.path[0].z)
          if (reverseAutoRotation) { firstDx = -firstDx; firstDz = -firstDz }
          simSrcRotation = firstDx !== 0 ? rotationToFace(firstDx, 0) : rotationToFace(0, firstDz)
        } else {
          const off = slotPositionToOffset(sourceSlotPosition, sourceMachine.rotation)
          let dx = Math.sign(off.x)
          let dz = Math.sign(off.z)
          if (reverseAutoRotation) { dx = -dx; dz = -dz }
          simSrcRotation = dx !== 0 ? rotationToFace(dx, 0) : rotationToFace(0, dz)
        }
      }
    }

    const originalSrcRotation = simSrcRotation
    const neededTargetSlotType: 'input' | 'output' = sourceSlotType === 'output' ? 'input' : 'output'

    const canIterateSource = !fixedRotations && !sourceHasBelts
    const rotationOrder: Direction[] = ['south', 'east', 'north', 'west']
    const candidates: Direction[] = canIterateSource
      ? [originalSrcRotation, ...rotationOrder.filter((r) => r !== originalSrcRotation)]
      : [originalSrcRotation]

    const targetHasFreeSlots =
      this.grid.getFreeSlotsOfType(targetMachine, neededTargetSlotType, ignoreBeltIds).length > 0

    type Attempt = {
      slotResult: { path: GridPosition[], collides: boolean } | null
      directResult: { path: GridPosition[], collides: boolean } | null
      srcRotation: Direction
    }
    let bestNonColliding: { path: GridPosition[], collides: boolean, srcRotation: Direction } | null = null
    let firstAttempt: Attempt | null = null

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]
      if (canIterateSource && wouldViolateSlotBlocking(candidate)) {
        continue
      }
      const { slotResult, directResult } = this.pathEvaluator.evaluateCandidateRotation(
        candidate, from, to, sourceMachine, targetMachine, sourceSlotType,
        ignoreBeltIds, fixedRotations, ignoreMachinePositions, blockedPositions,
        sourceSlotPosition, targetSlotPosition, targetHasFreeSlots,
      )
      if (firstAttempt === null) firstAttempt = { slotResult, directResult, srcRotation: candidate }

      let candidateBest: { path: GridPosition[], collides: boolean } | null = null
      if (slotResult && !slotResult.collides) candidateBest = slotResult
      else if (directResult && !directResult.collides
        && directPathHonoursSlots(
          directResult, sourceSlotPosition, targetSlotPosition,
          candidate, targetMachine.rotation,
          i > 0 ? sourceMachine : undefined,
          i > 0 ? targetMachine : undefined,
          i > 0 ? sourceSlotType : undefined,
        )) {
        candidateBest = directResult
      }
      if (candidateBest && (!bestNonColliding || candidateBest.path.length < bestNonColliding.path.length)) {
        bestNonColliding = { ...candidateBest, srcRotation: candidate }
      }
      if (i === 0 && bestNonColliding && !sourceSlotPosition && !targetSlotPosition) break
    }

    if (bestNonColliding) {
      return { path: bestNonColliding.path, collides: false, srcRotation: bestNonColliding.srcRotation }
    }

    // BODY-MODE RETRY for explicit-slot drags.
    //
    // The user's `targetSlotPosition` is a *preference*. When no candidate
    // could place a clean belt to that exact slot (because it's occupied,
    // unreachable, or a different rotation candidate would be needed),
    // retry once with the slot constraint dropped — picking any free
    // complementary slot on the SAME target machine ("machine-body mode").
    //
    // The target's rotation is locked (forcedHasBelts) so the user's
    // explicit-slot click semantics are preserved: the target machine is
    // never auto-rotated when an explicit slot was provided.
    //
    // This runs BEFORE the reverse-slot last-resort fallback so a free
    // sibling slot on the same machine always wins over flipping dataflow
    // direction.
    if (targetSlotPosition !== undefined && !requireTargetSlotPosition) {
      const lockedHasBelts = new Set<string>(forcedHasBelts ?? [])
      lockedHasBelts.add(`${to.x},${to.z}`)
      const retry = this.computePlacementPlan(from, to, sourceSlotType, {
        ...opts,
        targetSlotPosition: undefined,
        forcedHasBelts: lockedHasBelts,
        tryReverseSlotType: false,
      })
      if (retry && !retry.collides) return retry
    }

    if (firstAttempt) {
      const fb = firstAttempt.slotResult ?? firstAttempt.directResult
      if (fb) return { ...fb, srcRotation: originalSrcRotation }
    }

    // LAST-RESORT reverse-slot-type fallback for explicit-slot drags.
    //
    // When the primary direction failed entirely (no candidate produced any
    // path, colliding or not) AND the cause is specifically that the target
    // machine has no free slot of the required complementary type, retry the
    // OPPOSITE flow (flip sourceSlotType). This covers the case where the
    // user clicked one machine's slot, but the only viable physical
    // connection is in the other direction (e.g. F2.input→F3 fails because
    // F3.output is consumed, but F2.output→F3.input is available).
    //
    // The guard `!targetHasFreeSlots` ensures we only reverse when the
    // failure is "no slot" — not "rotation/collision" — to avoid silently
    // inverting the user's intended dataflow direction when their requested
    // direction is geometrically blocked but semantically valid.
    if (tryReverseSlotType && !targetHasFreeSlots) {
      const reversedSlotType: 'input' | 'output' = sourceSlotType === 'output' ? 'input' : 'output'
      // Drop slot positions on the reverse attempt: it's a last resort, the
      // user's explicit slot choice no longer applies (different slot type
      // on the same machine), and we want maximum flexibility.
      const reversedPlan = this.computePlacementPlan(
        from, to, reversedSlotType,
        {
          ignoreBeltIds, fixedRotations, virtualMachines,
          ignoreMachinePositions, forcedHasBelts, extraBlockedCells,
          tryReverseSlotType: false,
        },
      )
      if (reversedPlan) {
        return { ...reversedPlan, reversed: true }
      }
    }

    return null
  }

  /** Compute slot-based belt path without placing anything. */
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
  ): { path: GridPosition[], collides: boolean } | null {
    return this.pathEvaluator.computeSlotPath(
      from, to, simSource, simTarget, sourceSlotType,
      ignoreBeltIds, fixedRotations, ignoreMachinePositions, blockedPositions,
      targetSlotPosition, sourceSlotPosition,
    )
  }

  /** Compute direct machine-to-machine belt path without placing anything. */
  computeDirectPath(
    from: GridPosition, to: GridPosition,
    ignoreBeltIds?: ReadonlySet<string>,
    ignoreMachinePositions?: ReadonlySet<string>,
    blockedPositions?: ReadonlySet<string>,
  ): { path: GridPosition[], collides: boolean } | null {
    return this.pathEvaluator.computeDirectPath(from, to, ignoreBeltIds, ignoreMachinePositions, blockedPositions)
  }

  /**
   * Resolve which slot on the target machine to connect to, given a source machine position.
   * Returns a slot OFFSET (relative to target machine), or null if no free slots.
   */
  resolveTargetSlot(sourceMachinePos: GridPosition, targetMachine: MachineInfo, sourceSlotType: 'input' | 'output'): GridPosition | null {
    const neededSlotType: 'input' | 'output' = sourceSlotType === 'output' ? 'input' : 'output'
    const freeSlots = this.grid.getFreeSlotsOfType(targetMachine, neededSlotType)
    if (freeSlots.length === 0) return null
    if (freeSlots.length === 1) return freeSlots[0]
    let best = freeSlots[0]
    let bestDist = Math.abs(targetMachine.x + best.x - sourceMachinePos.x) + Math.abs(targetMachine.z + best.z - sourceMachinePos.z)
    for (let i = 1; i < freeSlots.length; i++) {
      const s = freeSlots[i]
      const dist = Math.abs(targetMachine.x + s.x - sourceMachinePos.x) + Math.abs(targetMachine.z + s.z - sourceMachinePos.z)
      if (dist < bestDist) { best = s; bestDist = dist }
    }
    return best
  }

  /**
   * Pick the best source slot offset for the given slot type.
   */
  pickSourceSlot(sourceMachine: MachineInfo, slotType: 'input' | 'output', target: GridPosition): GridPosition | null {
    const freeSlots = this.grid.getFreeSlotsOfType(sourceMachine, slotType)
    return pickBestSlotOffset(freeSlots, sourceMachine.x, sourceMachine.z, target)
  }

  /** Compute the belt path that reconnectChains would use for ghost preview. */
  computeReconnectPath(
    mx: number, mz: number,
    machineType: MachineType, rotation: Direction,
    otherEnd: GridPosition, machineIsSource: boolean,
    ignoreBeltIds?: ReadonlySet<string>,
    extraBlockedCells?: ReadonlySet<string>,
  ): { path: GridPosition[], collides: boolean } | null {
    return this.reconnectPreviewPlanner.computeReconnectPath(
      mx, mz, machineType, rotation, otherEnd, machineIsSource, ignoreBeltIds, extraBlockedCells,
    )
  }
}
