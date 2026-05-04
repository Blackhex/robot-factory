import type { Direction, GridPosition, MachineInfo, MachineType, SlotPosition } from './types'
import type { GridReader } from './GridReader'
import type { BeltRouter } from './BeltRouter'
import type { PlacementPlanOptions, PlacementPlanResult } from './PlacementPlanTypes'
import { rotationToFace, getSlotPositions, pickBestSlotOffset, slotPositionToOffset, offsetToSlotPosition } from './SlotUtils'
import { machineSlotPointsAtNeighbor } from './SlotBlocking'

export type { PlacementPlanOptions, PlacementPlanResult }

/**
 * The direct path bypasses slot constraints. When a specific source/target
 * slot is requested, ensure the direct path's endpoints actually align with
 * that slot under the given rotations — otherwise a wrong-slot direct path
 * could be accepted by the planner and then rejected by `placeBeltChain`'s
 * slot validation, breaking ghost/placement parity.
 *
 * Module-scope (not a per-iteration closure) so it isn't re-allocated on
 * every candidate rotation.
 */
function directPathHonoursSlots(
  dr: { path: GridPosition[], collides: boolean } | null,
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
    // Without an explicit slot, the path's first step must still correspond
    // to a valid slot of the requested type under `srcRotation`. Otherwise
    // committing the plan will fail slot validation in `placeBeltChain`.
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

/**
 * Options bag for {@link PlacementPlanner.computePlacementPlan}. All fields are
 * optional; callers may pass an empty object (or omit the argument entirely)
 * to use the defaults.
 */
// PlacementPlanOptions and PlacementPlanResult are defined in
// ./PlacementPlanTypes and re-exported above to keep a single source of truth.

export class PlacementPlanner {
  private readonly grid: GridReader
  private readonly router: BeltRouter

  constructor(
    grid: GridReader,
    router: BeltRouter,
  ) {
    this.grid = grid
    this.router = router
  }

  /** Resolve a machine at a position, checking virtualMachines first. */
  private resolveMachine(pos: GridPosition, virtualMachines?: ReadonlyMap<string, MachineInfo>): MachineInfo | null {
    const virtual = virtualMachines?.get(`${pos.x},${pos.z}`)
    if (virtual !== undefined) return virtual
    return this.grid.getMachineAt(pos.x, pos.z)
  }

  /** Check if a machine at a position has belt connections, respecting virtual machines and ignoreBeltIds. */
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
      tryReverseSlotType,
    } = opts ?? {}
    if (!this.grid.isInBounds(from.x, from.z) || !this.grid.isInBounds(to.x, to.z)) return null
    if (from.x === to.x && from.z === to.z) return null

    const sourceMachine = this.resolveMachine(from, virtualMachines)
    const targetMachine = this.resolveMachine(to, virtualMachines)
    if (!sourceMachine || !targetMachine) return null

    // Validate sourceSlotPosition (if provided) maps to a slot of the requested type.
    // Reject early so the call fails instead of silently picking a different slot.
    if (sourceSlotPosition) {
      const srcSlotList = sourceSlotType === 'input' ? sourceMachine.slots.inputs : sourceMachine.slots.outputs
      if (!srcSlotList.includes(sourceSlotPosition)) return null
    }

    // targetSlotPosition is a *preference*, not a hard constraint. When the
    // user clicked a slot of the WRONG type on the target machine (e.g. a
    // splitter 'left' output cell while dragging an output->input belt), skip
    // the primary attempt and fall back to body-mode picking on the same
    // target machine. The target's rotation is locked so we don't silently
    // rotate the machine away from the slot the user pointed at.
    if (targetSlotPosition) {
      const neededTgtType: 'input' | 'output' = sourceSlotType === 'output' ? 'input' : 'output'
      const tgtSlotList = neededTgtType === 'input' ? targetMachine.slots.inputs : targetMachine.slots.outputs
      if (!tgtSlotList.includes(targetSlotPosition)) {
        const lockedHasBelts = new Set<string>(forcedHasBelts ?? [])
        lockedHasBelts.add(`${to.x},${to.z}`)
        return this.computePlacementPlan(from, to, sourceSlotType, {
          ...opts,
          targetSlotPosition: undefined,
          forcedHasBelts: lockedHasBelts,
        })
      }
    }

    // Merge virtual machine positions and extra blocked cells
    let blockedPositions: ReadonlySet<string> | undefined
    if (virtualMachines || extraBlockedCells) {
      const merged = new Set<string>()
      if (virtualMachines) for (const key of virtualMachines.keys()) merged.add(key)
      if (extraBlockedCells) for (const key of extraBlockedCells) merged.add(key)
      blockedPositions = merged
    }

    const sourceHasBelts = this.resolveHasBelts(from, virtualMachines, ignoreBeltIds, forcedHasBelts)

    // Local closure mirroring the source-side half of `Factory.isSlotBlocked`
    // (Direction 2): a slot of `sourceMachine` at the candidate rotation MUST
    // NOT point directly at any neighboring machine. Delegated to the shared
    // `machineSlotPointsAtNeighbor` helper so this enforcement and
    // `Factory.isSlotBlocked`'s Direction-2 cannot drift apart. The lookup
    // closure consults virtualMachines + ignoreMachinePositions + the grid.
    const wouldViolateSlotBlocking = (rot: Direction): boolean =>
      machineSlotPointsAtNeighbor(
        { ...sourceMachine, rotation: rot },
        (gx, gz) => {
          if (ignoreMachinePositions?.has(`${gx},${gz}`)) return null
          return this.resolveMachine({ x: gx, z: gz }, virtualMachines)
        },
      )

    // Derive source auto-rotation for an unconnected source machine.
    let simSrcRotation: Direction = sourceMachine.rotation
    if (!fixedRotations && !sourceHasBelts) {
      // When sourceSlotPosition is provided, start the trial path from the
      // clicked source-slot CELL so the trial's last segment correctly reflects
      // how the belt will approach the target.
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
          // Constrain srcRotation so the requested slot faces the trial path's first step.
          // Mirrors the targetSlotPosition contract for source side.
          const off = slotPositionToOffset(sourceSlotPosition, sourceMachine.rotation)
          let dx = Math.sign(off.x)
          let dz = Math.sign(off.z)
          if (reverseAutoRotation) { dx = -dx; dz = -dz }
          simSrcRotation = dx !== 0 ? rotationToFace(dx, 0) : rotationToFace(0, dz)
        }
      }
    }

    // Build the list of source-rotation candidates to try.
    // - When the source has existing belts (or rotations are fixed), the rotation
    //   is locked: try only the originally-derived one.
    // - Otherwise, try the originally-derived rotation FIRST (preserving the
    //   prior behavior whenever it works); only fall back to the other 3 in a
    //   deterministic order if the original rotation produces no non-colliding
    //   plan. The same sourceSlotPosition resolves to a different offset per
    //   rotation (slots rotate with the machine), giving 4 distinct geometric
    //   attempts.
    const originalSrcRotation = simSrcRotation
    const neededTargetSlotType: 'input' | 'output' = sourceSlotType === 'output' ? 'input' : 'output'

    const canIterateSource = !fixedRotations && !sourceHasBelts
    const rotationOrder: Direction[] = ['south', 'east', 'north', 'west']
    const candidates: Direction[] = canIterateSource
      ? [originalSrcRotation, ...rotationOrder.filter((r) => r !== originalSrcRotation)]
      : [originalSrcRotation]

    // Hoisted invariant: target rotation is fixed across candidates, so its
    // free-slot probe doesn't change per iteration.
    const targetHasFreeSlots =
      this.grid.getFreeSlotsOfType(targetMachine, neededTargetSlotType, ignoreBeltIds).length > 0

    type Attempt = {
      slotResult: { path: GridPosition[], collides: boolean } | null
      directResult: { path: GridPosition[], collides: boolean } | null
      srcRotation: Direction
    }
    let bestNonColliding: { path: GridPosition[], collides: boolean, srcRotation: Direction } | null = null
    let firstAttempt: Attempt | null = null

    // Target rotation is preserved — never derived.
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]
      // Skip candidate rotations that would violate the same slot-blocking
      // constraint enforced by Factory.rotateMachine / isSlotBlocked.
      // Only enforced when the planner is actually free to pick the rotation
      // (i.e. the source has no existing belts and rotations are not fixed).
      if (canIterateSource && wouldViolateSlotBlocking(candidate)) {
        continue
      }
      const { slotResult, directResult } = this.evaluateCandidateRotation(
        candidate, from, to, sourceMachine, targetMachine, sourceSlotType,
        ignoreBeltIds, fixedRotations, ignoreMachinePositions, blockedPositions,
        sourceSlotPosition, targetSlotPosition, targetHasFreeSlots,
      )
      if (firstAttempt === null) firstAttempt = { slotResult, directResult, srcRotation: candidate }

      // Prefer slotResult; fall back to a slot-honoring directResult.
      // For fallback candidates (i > 0), the directResult must additionally
      // map to a valid slot of the candidate rotation (since the planner
      // didn't derive that rotation from the trial path, the path's first
      // step is not guaranteed to align with one of the candidate's slots).
      // For i === 0 the rotation was derived to match the trial path, so
      // the legacy lenient check is sufficient.
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
      // The originally-derived rotation (i === 0) wins all ties: if it produced
      // any non-colliding plan, stop iterating. The strict `<` above only
      // matters for deterministic tie-breaking among the fallback rotations
      // (i >= 1), which are tried in a fixed `rotationOrder`.
      //
      // Exception: when the user explicitly named a source/target slot, they
      // have implicitly accepted whatever rotation makes that slot work, so we
      // must explore all 4 candidates and pick the truly shortest path —
      // otherwise the original rotation can win with a long looping belt that
      // wraps around the source machine when a much shorter belt is available
      // by rotating it.
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
    if (targetSlotPosition !== undefined) {
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

    // No candidate produced a non-colliding plan — fall back to the originally-derived
    // rotation's colliding plan so the ghost still renders red.
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

  /**
   * Evaluate a single candidate source rotation: build a virtual source machine
   * with that rotation, compute the slot path, and (only when both sides have
   * free slots) the direct path. Returns both results so the caller can apply
   * its preference/tie-break policy.
   *
   * @param targetHasFreeSlots — hoisted invariant from the caller; target rotation
   *   doesn't change per candidate, so this probe is computed once.
   */
  private evaluateCandidateRotation(
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
  ): {
    slotResult: { path: GridPosition[], collides: boolean } | null
    directResult: { path: GridPosition[], collides: boolean } | null
  } {
    const simSource: MachineInfo = { ...sourceMachine, rotation: candidate }

    const slotResult = this.computeSlotPath(
      from, to, simSource, simTarget, sourceSlotType,
      ignoreBeltIds, fixedRotations, ignoreMachinePositions, blockedPositions,
      targetSlotPosition, sourceSlotPosition,
    )

    // Only compute direct path when both sides have free slots. Without that
    // guard, directPath bypasses slot validation and produces false-positive
    // non-colliding results (ghost preview shows green incorrectly).
    const sourceHasFreeSlots =
      this.grid.getFreeSlotsOfType(simSource, sourceSlotType, ignoreBeltIds).length > 0
    const directResult = (sourceHasFreeSlots && targetHasFreeSlots)
      ? this.computeDirectPath(from, to, ignoreBeltIds, ignoreMachinePositions, blockedPositions)
      : null

    return { slotResult, directResult }
  }

  /** Compute slot-based belt path without placing anything.
   *  Tries ALL valid (sourceSlot, targetSlot) pairs and picks the shortest
   *  non-colliding path. Falls back to shortest colliding path if none are clear.
   */
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

    let bestClear: { path: GridPosition[], collides: boolean } | null = null
    let bestColliding: { path: GridPosition[], collides: boolean } | null = null

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

  /** Compute the belt path for a specific (sourceSlot, targetSlot) pair. */
  private computeSlotPathForPair(
    from: GridPosition, to: GridPosition,
    sourceSlotOffset: GridPosition, targetSlotOffset: GridPosition,
    sourceSlotType: 'input' | 'output',
    ignoreBeltIds?: ReadonlySet<string>,
    fixedRotations?: boolean,
    ignoreMachinePositions?: ReadonlySet<string>,
    blockedPositions?: ReadonlySet<string>,
  ): { path: GridPosition[], collides: boolean } | null {
    const srcSlotCell = { x: from.x + sourceSlotOffset.x, z: from.z + sourceSlotOffset.z }
    const tgtSlotCell = { x: to.x + targetSlotOffset.x, z: to.z + targetSlotOffset.z }

    if (!this.grid.isInBounds(srcSlotCell.x, srcSlotCell.z) || !this.grid.isInBounds(tgtSlotCell.x, tgtSlotCell.z)) return null
    const srcSlotMachine = this.grid.getMachineAt(srcSlotCell.x, srcSlotCell.z)
    if (srcSlotMachine && !(srcSlotCell.x === to.x && srcSlotCell.z === to.z) && !ignoreMachinePositions?.has(`${srcSlotCell.x},${srcSlotCell.z}`)) return null
    const tgtSlotMachine = this.grid.getMachineAt(tgtSlotCell.x, tgtSlotCell.z)
    if (tgtSlotMachine && !(tgtSlotCell.x === from.x && tgtSlotCell.z === from.z) && !ignoreMachinePositions?.has(`${tgtSlotCell.x},${tgtSlotCell.z}`)) return null

    // Determine belt flow direction: output machine → input machine
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

    // Build full path: outputMachine → outputSlotCell → [middle] → inputSlotCell → inputMachine
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

    // Try with full direction constraints (slot-aligned L-paths)
    const constrained = this.router.findBestBeltPath(
      outputSlotCell, inputSlotCell, ignoreBeltIds,
      fixedRotations ? undefined : outDir,
      requiredLastDir,
      ignoreMachinePositions, blockedPositions,
    )

    // Build full path for constrained version
    const constrainedFull: GridPosition[] = [{ x: outputMachine.x, z: outputMachine.z }, ...constrained.path, { x: inputMachine.x, z: inputMachine.z }]
    const constrainedCollides = constrained.collides || this.router.wouldPathCollide(constrainedFull, ignoreBeltIds, ignoreMachinePositions, blockedPositions)

    // Also try without ANY direction constraints — produces shorter S-shaped paths
    // when slot directions force the path away from the target
    const relaxed = this.router.findBestBeltPath(
      outputSlotCell, inputSlotCell, ignoreBeltIds,
      undefined,
      undefined,
      ignoreMachinePositions, blockedPositions,
    )

    const relaxedFull: GridPosition[] = [{ x: outputMachine.x, z: outputMachine.z }, ...relaxed.path, { x: inputMachine.x, z: inputMachine.z }]
    const relaxedCollides = relaxed.collides || this.router.wouldPathCollide(relaxedFull, ignoreBeltIds, ignoreMachinePositions, blockedPositions)

    // Pick the shorter non-colliding full path
    if (!constrainedCollides && !relaxedCollides) {
      return constrainedFull.length <= relaxedFull.length
        ? { path: constrainedFull, collides: false }
        : { path: relaxedFull, collides: false }
    }
    if (!constrainedCollides) return { path: constrainedFull, collides: false }
    if (!relaxedCollides) return { path: relaxedFull, collides: false }
    // Both collide — prefer slot-direction-aligned path for correct ghost preview
    return { path: constrainedFull, collides: true }
  }

  /** Compute direct machine-to-machine belt path without placing anything. */
  computeDirectPath(
    from: GridPosition, to: GridPosition,
    ignoreBeltIds?: ReadonlySet<string>,
    ignoreMachinePositions?: ReadonlySet<string>,
    blockedPositions?: ReadonlySet<string>,
  ): { path: GridPosition[], collides: boolean } | null {
    const result = this.router.findBestBeltPath(from, to, ignoreBeltIds, undefined, undefined, ignoreMachinePositions, blockedPositions)
    if (result.path.length < 2) return null
    return result
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

  /**
   * Compute the belt path that reconnectChains would use for a given chain,
   * without actually placing anything. Used for ghost preview during drag.
   *
   * Delegates to computePlacementPlan with a virtual machine at (mx, mz)
   * so that ghost paths match the actual moveMachine/rotateMachine behavior.
   *
   * For multi-connection machines, simulates sequential reconnection:
   * the first reconnection auto-rotates the machine, and subsequent ones
   * use that rotation (matching moveMachine behavior).
   */
  computeReconnectPath(
    mx: number, mz: number,
    machineType: MachineType, rotation: Direction,
    otherEnd: GridPosition, machineIsSource: boolean,
    ignoreBeltIds?: ReadonlySet<string>,
    extraBlockedCells?: ReadonlySet<string>,
  ): { path: GridPosition[], collides: boolean } | null {
    // Detect rotation (machine already at position) vs move (machine at new position)
    const existingMachine = this.grid.getMachineAt(mx, mz)
    const isRotation = existingMachine !== null && existingMachine.type === machineType

    // For moves: if the target cell is occupied by a different machine, fail
    if (!isRotation && existingMachine !== null) return null

    const machinePos: GridPosition = { x: mx, z: mz }

    // Find the old machine position and all connections by inspecting ignoreBeltIds
    let oldMachinePos: GridPosition | null = null
    let ignoreMachinePositions: ReadonlySet<string> | undefined

    // Collect all belts connected to the moved machine (ordered same as moveMachine)
    type ConnInfo = { otherPos: GridPosition, isMachineSource: boolean }
    const allConnections: ConnInfo[] = []

    if (!isRotation && ignoreBeltIds && ignoreBeltIds.size > 0) {
      // Find the old position from any belt at the other endpoint
      const otherBelts = this.grid.getBeltsAt(otherEnd.x, otherEnd.z)
      for (const belt of otherBelts) {
        if (ignoreBeltIds.has(belt.id)) {
          const oldMachine = machineIsSource ? belt.sourceMachine : belt.destinationMachine
          oldMachinePos = { x: oldMachine.x, z: oldMachine.z }
          break
        }
      }

      if (oldMachinePos && (oldMachinePos.x !== mx || oldMachinePos.z !== mz)) {
        ignoreMachinePositions = new Set([`${oldMachinePos.x},${oldMachinePos.z}`])

        // Find ALL connections from belts at the old position (same order as moveMachine)
        const oldBelts = this.grid.getBeltsAt(oldMachinePos.x, oldMachinePos.z)
        for (const belt of oldBelts) {
          if (!ignoreBeltIds.has(belt.id)) continue
          const isSrc = belt.sourceMachine.x === oldMachinePos!.x && belt.sourceMachine.z === oldMachinePos!.z
          const other = isSrc ? belt.destinationMachine : belt.sourceMachine
          allConnections.push({ otherPos: { x: other.x, z: other.z }, isMachineSource: isSrc })
        }
      }
    }

    // Determine effective rotation for the virtual machine.
    // In moveMachine, reconnections happen sequentially: the first reconnection
    // auto-rotates the machine, and subsequent ones use that rotation.
    let effectiveRotation = rotation
    // For rotation cases, force the rotated machine to appear as "has belts"
    // to prevent auto-rotation (matching rotateMachine's lockedMachinePos behavior)
    let rotationForcedHasBelts: ReadonlySet<string> | undefined
    if (isRotation) {
      rotationForcedHasBelts = new Set([`${mx},${mz}`])
    }

    if (!isRotation && allConnections.length > 1) {
      // Check if this is NOT the first connection
      const firstConn = allConnections[0]
      const isFirstConnection = firstConn.otherPos.x === otherEnd.x &&
        firstConn.otherPos.z === otherEnd.z && firstConn.isMachineSource === machineIsSource

      if (!isFirstConnection) {
        // Simulate the first reconnection to get the machine's post-auto-rotation direction
        const firstVirtual: MachineInfo = {
          id: `virtual_${mx}_${mz}`,
          name: 'virtual',
          type: machineType,
          x: mx, z: mz,
          rotation,
          slots: getSlotPositions(machineType),
        }
        const firstVMs = new Map<string, MachineInfo>()
        firstVMs.set(`${mx},${mz}`, firstVirtual)

        let firstFrom: GridPosition, firstTo: GridPosition
        if (firstConn.isMachineSource) {
          firstFrom = machinePos
          firstTo = firstConn.otherPos
        } else {
          firstFrom = firstConn.otherPos
          firstTo = machinePos
        }

        // Try fixedRotations=true first (matching moveMachine behavior)
        let firstPlan = this.computePlacementPlan(
          firstFrom, firstTo, 'output',
          { ignoreBeltIds, fixedRotations: true, virtualMachines: firstVMs, ignoreMachinePositions },
        )
        if (!firstPlan || firstPlan.collides) {
          const fallback = this.computePlacementPlan(
            firstFrom, firstTo, 'output',
            { ignoreBeltIds, fixedRotations: false, virtualMachines: firstVMs, ignoreMachinePositions },
          )
          if (fallback) firstPlan = fallback
        }
        if (firstPlan) {
          // Extract the rotation assigned to the virtual machine position
          const isSource = firstConn.isMachineSource
          effectiveRotation = isSource
            ? (firstPlan.srcRotation ?? rotation)
            : rotation
        }
      }
    }

    // Create the virtual machine with the effective rotation
    const virtualMachine: MachineInfo = {
      id: `virtual_${mx}_${mz}`,
      name: 'virtual',
      type: machineType,
      x: mx, z: mz,
      rotation: effectiveRotation,
      slots: getSlotPositions(machineType),
    }
    const virtualMachines = new Map<string, MachineInfo>()
    virtualMachines.set(`${mx},${mz}`, virtualMachine)

    // For non-first connections, the machine has belts from prior reconnections.
    // Use forcedHasBelts so only the virtual machine's rotation is fixed,
    // while the other machine can still auto-rotate, and outDir constraints stay active.
    const isNonFirstConnection = !isRotation && allConnections.length > 1 &&
      !(allConnections[0].otherPos.x === otherEnd.x &&
        allConnections[0].otherPos.z === otherEnd.z &&
        allConnections[0].isMachineSource === machineIsSource)

    const forcedHasBelts = isNonFirstConnection
      ? new Set([`${mx},${mz}`]) as ReadonlySet<string>
      : undefined

    // Map to computePlacementPlan: moveMachine always uses sourceSlotType='output'
    let from: GridPosition, to: GridPosition
    if (machineIsSource) {
      from = machinePos
      to = otherEnd
    } else {
      from = otherEnd
      to = machinePos
    }

    // Try fixedRotations=true first (matching moveMachine/rotateMachine behavior),
    // fall back to false if no valid path exists
    const finalForcedHasBelts = forcedHasBelts ?? rotationForcedHasBelts
    let plan = this.computePlacementPlan(
      from, to, 'output',
      {
        ignoreBeltIds, fixedRotations: true, virtualMachines,
        ignoreMachinePositions, forcedHasBelts: finalForcedHasBelts, extraBlockedCells,
      },
    )
    if (!plan || plan.collides) {
      const fallbackPlan = this.computePlacementPlan(
        from, to, 'output',
        {
          ignoreBeltIds, fixedRotations: false, virtualMachines,
          ignoreMachinePositions, forcedHasBelts: finalForcedHasBelts, extraBlockedCells,
        },
      )
      if (fallbackPlan) plan = fallbackPlan
    }
    if (!plan) return null
    return { path: plan.path, collides: plan.collides }
  }
}
