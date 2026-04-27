import type { Direction, GridPosition, MachineInfo, MachineType } from './types'
import type { GridReader } from './GridReader'
import type { ComputePlacementPlan } from './PlacementPlanTypes'
import { getSlotPositions } from './SlotUtils'
import type { PlacementPathResult } from './PlacementPathEvaluator'

type ConnInfo = { otherPos: GridPosition, isMachineSource: boolean }

export class ReconnectPreviewPlanner {
  private readonly grid: GridReader
  private readonly computePlacementPlan: ComputePlacementPlan

  constructor(grid: GridReader, computePlacementPlan: ComputePlacementPlan) {
    this.grid = grid
    this.computePlacementPlan = computePlacementPlan
  }

  computeReconnectPath(
    mx: number, mz: number,
    machineType: MachineType, rotation: Direction,
    otherEnd: GridPosition, machineIsSource: boolean,
    ignoreBeltIds?: ReadonlySet<string>,
    extraBlockedCells?: ReadonlySet<string>,
  ): PlacementPathResult | null {
    const existingMachine = this.grid.getMachineAt(mx, mz)
    const isRotation = existingMachine !== null && existingMachine.type === machineType

    if (!isRotation && existingMachine !== null) return null

    const machinePos: GridPosition = { x: mx, z: mz }
    const { oldMachinePos, allConnections } = this.collectMoveConnections(
      machinePos, otherEnd, machineIsSource, isRotation, ignoreBeltIds,
    )
    const ignoreMachinePositions = oldMachinePos && (oldMachinePos.x !== mx || oldMachinePos.z !== mz)
      ? new Set([`${oldMachinePos.x},${oldMachinePos.z}`]) as ReadonlySet<string>
      : undefined

    let effectiveRotation = rotation
    const rotationForcedHasBelts = isRotation
      ? new Set([`${mx},${mz}`]) as ReadonlySet<string>
      : undefined

    if (!isRotation && allConnections.length > 1 && !isFirstConnection(allConnections[0], otherEnd, machineIsSource)) {
      effectiveRotation = this.previewRotationAfterFirstReconnect(
        mx, mz, machineType, rotation, machinePos, allConnections[0], ignoreBeltIds, ignoreMachinePositions,
      )
    }

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

    const isNonFirstConnection = !isRotation && allConnections.length > 1 &&
      !isFirstConnection(allConnections[0], otherEnd, machineIsSource)
    const forcedHasBelts = isNonFirstConnection
      ? new Set([`${mx},${mz}`]) as ReadonlySet<string>
      : undefined

    const from = machineIsSource ? machinePos : otherEnd
    const to = machineIsSource ? otherEnd : machinePos
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

  private collectMoveConnections(
    machinePos: GridPosition,
    otherEnd: GridPosition,
    machineIsSource: boolean,
    isRotation: boolean,
    ignoreBeltIds?: ReadonlySet<string>,
  ): { oldMachinePos: GridPosition | null, allConnections: ConnInfo[] } {
    let oldMachinePos: GridPosition | null = null
    const allConnections: ConnInfo[] = []
    if (isRotation || !ignoreBeltIds || ignoreBeltIds.size === 0) return { oldMachinePos, allConnections }

    const otherBelts = this.grid.getBeltsAt(otherEnd.x, otherEnd.z)
    for (const belt of otherBelts) {
      if (ignoreBeltIds.has(belt.id)) {
        const oldMachine = machineIsSource ? belt.sourceMachine : belt.destinationMachine
        oldMachinePos = { x: oldMachine.x, z: oldMachine.z }
        break
      }
    }

    if (oldMachinePos && (oldMachinePos.x !== machinePos.x || oldMachinePos.z !== machinePos.z)) {
      const oldBelts = this.grid.getBeltsAt(oldMachinePos.x, oldMachinePos.z)
      for (const belt of oldBelts) {
        if (!ignoreBeltIds.has(belt.id)) continue
        const isSrc = belt.sourceMachine.x === oldMachinePos.x && belt.sourceMachine.z === oldMachinePos.z
        const other = isSrc ? belt.destinationMachine : belt.sourceMachine
        allConnections.push({ otherPos: { x: other.x, z: other.z }, isMachineSource: isSrc })
      }
    }
    return { oldMachinePos, allConnections }
  }

  private previewRotationAfterFirstReconnect(
    mx: number, mz: number,
    machineType: MachineType,
    rotation: Direction,
    machinePos: GridPosition,
    firstConn: ConnInfo,
    ignoreBeltIds: ReadonlySet<string> | undefined,
    ignoreMachinePositions: ReadonlySet<string> | undefined,
  ): Direction {
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

    const firstFrom = firstConn.isMachineSource ? machinePos : firstConn.otherPos
    const firstTo = firstConn.isMachineSource ? firstConn.otherPos : machinePos

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
    if (!firstPlan) return rotation
    return firstConn.isMachineSource ? (firstPlan.srcRotation ?? rotation) : rotation
  }
}

function isFirstConnection(conn: ConnInfo, otherEnd: GridPosition, machineIsSource: boolean): boolean {
  return conn.otherPos.x === otherEnd.x &&
    conn.otherPos.z === otherEnd.z && conn.isMachineSource === machineIsSource
}