import type { Direction, GridPosition, MachineInfo, MachineType } from './types'
import type { GridReader } from './Factory'
import type { BeltRouter } from './BeltRouter'
import { rotationToFace, getSlotPositions, pickBestSlotOffset } from './SlotUtils'

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
    ignoreBeltIds?: ReadonlySet<string>,
    fixedRotations?: boolean,
    virtualMachines?: ReadonlyMap<string, MachineInfo>,
    ignoreMachinePositions?: ReadonlySet<string>,
    forcedHasBelts?: ReadonlySet<string>,
  ): { path: GridPosition[], collides: boolean, srcRotation?: Direction, tgtRotation?: Direction } | null {
    if (!this.grid.isInBounds(from.x, from.z) || !this.grid.isInBounds(to.x, to.z)) return null
    if (from.x === to.x && from.z === to.z) return null

    const sourceMachine = this.resolveMachine(from, virtualMachines)
    const targetMachine = this.resolveMachine(to, virtualMachines)
    if (!sourceMachine || !targetMachine) return null

    // Virtual machine positions should block pathfinding (treat as occupied cells)
    const blockedPositions = virtualMachines ? new Set(virtualMachines.keys()) as ReadonlySet<string> : undefined

    const sourceHasBelts = this.resolveHasBelts(from, virtualMachines, ignoreBeltIds, forcedHasBelts)
    const targetHasBelts = this.resolveHasBelts(to, virtualMachines, ignoreBeltIds, forcedHasBelts)

    // Simulate auto-rotation for machines without belt connections
    let simSrcRotation: Direction = sourceMachine.rotation
    let simTgtRotation: Direction = targetMachine.rotation
    if (!fixedRotations && (!sourceHasBelts || !targetHasBelts)) {
      const trial = this.router.findBestBeltPath(from, to, ignoreBeltIds, undefined, undefined, ignoreMachinePositions, blockedPositions)
      if (trial.path.length >= 2) {
        const reverseAutoRotation = sourceSlotType === 'input'
        if (!sourceHasBelts) {
          let firstDx = Math.sign(trial.path[1].x - trial.path[0].x)
          let firstDz = Math.sign(trial.path[1].z - trial.path[0].z)
          if (reverseAutoRotation) { firstDx = -firstDx; firstDz = -firstDz }
          simSrcRotation = firstDx !== 0 ? rotationToFace(firstDx, 0) : rotationToFace(0, firstDz)
        }
        if (!targetHasBelts) {
          const lastIdx = trial.path.length - 1
          let lastDx = Math.sign(trial.path[lastIdx].x - trial.path[lastIdx - 1].x)
          let lastDz = Math.sign(trial.path[lastIdx].z - trial.path[lastIdx - 1].z)
          if (reverseAutoRotation) { lastDx = -lastDx; lastDz = -lastDz }
          simTgtRotation = lastDx !== 0 ? rotationToFace(lastDx, 0) : rotationToFace(0, lastDz)
        }
      }
    }

    // Create simulated machine infos with the computed rotations for slot resolution
    const simSource: MachineInfo = { ...sourceMachine, rotation: simSrcRotation }
    const simTarget: MachineInfo = { ...targetMachine, rotation: simTgtRotation }

    // Compute both slot-based and direct machine-to-machine paths
    const slotResult = this.computeSlotPath(from, to, simSource, simTarget, sourceSlotType, ignoreBeltIds, fixedRotations, ignoreMachinePositions, blockedPositions)
    const directResult = this.computeDirectPath(from, to, ignoreBeltIds, ignoreMachinePositions, blockedPositions)

    // Pick the shortest non-colliding path (direct paths avoid U-turns
    // when slot geometry forces a long detour around adjacent machines)
    const slotOk = slotResult && !slotResult.collides
    const directOk = directResult && !directResult.collides

    if (slotOk && directOk) {
      return { ...slotResult!, srcRotation: simSrcRotation, tgtRotation: simTgtRotation }
    }
    if (slotOk) {
      return { ...slotResult!, srcRotation: simSrcRotation, tgtRotation: simTgtRotation }
    }
    if (directOk) {
      return { ...directResult!, srcRotation: simSrcRotation, tgtRotation: simTgtRotation }
    }

    // Return colliding result for red ghost preview
    if (slotResult) {
      return { ...slotResult, srcRotation: simSrcRotation, tgtRotation: simTgtRotation }
    }
    if (directResult) {
      return { ...directResult, srcRotation: simSrcRotation, tgtRotation: simTgtRotation }
    }

    return null
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
  ): { path: GridPosition[], collides: boolean } | null {
    const neededTargetSlotType: 'input' | 'output' = sourceSlotType === 'output' ? 'input' : 'output'
    const sourceSlots = this.grid.getFreeSlotsOfType(simSource, sourceSlotType, ignoreBeltIds)
    const targetSlots = this.grid.getFreeSlotsOfType(simTarget, neededTargetSlotType, ignoreBeltIds)
    if (sourceSlots.length === 0 || targetSlots.length === 0) return null

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
    // Both collide — pick shorter for ghost preview
    return constrainedFull.length <= relaxedFull.length
      ? { path: constrainedFull, collides: true }
      : { path: relaxedFull, collides: true }
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
          firstFrom, firstTo, 'output', ignoreBeltIds, true, firstVMs, ignoreMachinePositions,
        )
        if (!firstPlan || firstPlan.collides) {
          const fallback = this.computePlacementPlan(
            firstFrom, firstTo, 'output', ignoreBeltIds, false, firstVMs, ignoreMachinePositions,
          )
          if (fallback) firstPlan = fallback
        }
        if (firstPlan) {
          // Extract the rotation assigned to the virtual machine position
          const isSource = firstConn.isMachineSource
          effectiveRotation = isSource
            ? (firstPlan.srcRotation ?? rotation)
            : (firstPlan.tgtRotation ?? rotation)
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
      from, to, 'output', ignoreBeltIds,
      true, virtualMachines, ignoreMachinePositions,
      finalForcedHasBelts,
    )
    if (!plan || plan.collides) {
      const fallbackPlan = this.computePlacementPlan(
        from, to, 'output', ignoreBeltIds,
        false, virtualMachines, ignoreMachinePositions,
        finalForcedHasBelts,
      )
      if (fallbackPlan) plan = fallbackPlan
    }
    if (!plan) return null
    return { path: plan.path, collides: plan.collides }
  }
}
