import { RENDER_CELL_CAPACITY, RENDER_FP_EPS, beltKeyOf, type BeltRenderData } from './ItemArcResolver'

export interface TerminalEndHoldState {
  frontItemId: string
  epoch: number
}

export interface FlowAnalysisState {
  truthEpoch: number
  lastTruthSignature: string
  terminalEndHoldStates: Map<string, TerminalEndHoldState>
  previousCascadeBlockedByKey: Map<string, boolean>
}

export interface FlowAnalysisResult extends FlowAnalysisState {
  cascadeBlockedByKey: Map<string, boolean>
}

function buildTruthSignature(belts: ReadonlyArray<BeltRenderData>): string {
  let truthSignature = ''
  for (const belt of belts) {
    truthSignature += `${beltKeyOf(belt)}:`
    for (let i = 0; i < belt.items.length; i++) {
      const item = belt.items[i]
      let pos = item.position
      if (pos < 0) pos = 0
      else if (pos > 1) pos = 1
      truthSignature += `${item.id ?? `__idx${i}`}@${pos.toFixed(6)}|`
    }
    truthSignature += ';'
  }
  return truthSignature
}

export function analyzeItemRendererFlow(
  belts: ReadonlyArray<BeltRenderData>,
  state: FlowAnalysisState,
): FlowAnalysisResult {
  const truthSignature = buildTruthSignature(belts)
  const truthChanged = truthSignature !== state.lastTruthSignature
  const truthEpoch =
    truthChanged ? state.truthEpoch + 1 : state.truthEpoch

  const beltsByFromCell = new Map<string, BeltRenderData>()
  for (const belt of belts) {
    beltsByFromCell.set(`${belt.from.x},${belt.from.z}`, belt)
  }

  const nextTerminalEndHoldStates = new Map<string, TerminalEndHoldState>()
  const terminalSelfBlockedByKey = new Map<string, boolean>()
  for (const belt of belts) {
    const key = beltKeyOf(belt)
    const downstream = beltsByFromCell.get(`${belt.to.x},${belt.to.z}`)
    if (downstream || belt.items.length === 0) continue

    const frontItem = belt.items[belt.items.length - 1]
    if (frontItem.position < 1.0 - RENDER_FP_EPS) continue

    const frontItemId = frontItem.id ?? `__terminal_front_${key}_${belt.items.length - 1}`
    const prev = state.terminalEndHoldStates.get(key)
    const epoch = prev?.frontItemId === frontItemId ? prev.epoch : truthEpoch
    const backItem = belt.items[0]
    const isTerminalSaturated =
      belt.items.length >= RENDER_CELL_CAPACITY &&
      backItem !== undefined &&
      backItem.position <= RENDER_FP_EPS

    nextTerminalEndHoldStates.set(key, { frontItemId, epoch })
    terminalSelfBlockedByKey.set(
      key,
      isTerminalSaturated
        ? true
        : belt.allowsTerminalDrainGrace === true
        ? prev?.frontItemId === frontItemId && epoch < truthEpoch
        : true,
    )
  }

  const isBeltSelfBlocked = (belt: BeltRenderData): boolean => {
    if (belt.items.length === 0) return false
    const frontPos = belt.items[belt.items.length - 1].position
    if (frontPos < 1.0 - RENDER_FP_EPS) return false

    const key = beltKeyOf(belt)
    const downstream = beltsByFromCell.get(`${belt.to.x},${belt.to.z}`)
    if (!downstream) return terminalSelfBlockedByKey.get(key) ?? false
    return belt.items.length >= RENDER_CELL_CAPACITY
  }

  const cascadeBlockedByKey = new Map<string, boolean>()
  const computeCascadeBlocked = (belt: BeltRenderData, maxDepth: number): boolean => {
    if (isBeltSelfBlocked(belt)) return true
    if (maxDepth <= 0) return false

    const downstream = beltsByFromCell.get(`${belt.to.x},${belt.to.z}`)
    if (!downstream) return false
    return computeCascadeBlocked(downstream, maxDepth - 1)
  }

  for (const belt of belts) {
    const key = beltKeyOf(belt)
    const isBlocked = computeCascadeBlocked(belt, belts.length)
    const wasBlocked = state.previousCascadeBlockedByKey.get(key) ?? false
    const frontPos = belt.items[belt.items.length - 1]?.position
    const holdBlockedAtCellStart =
      wasBlocked &&
      !isBlocked &&
      frontPos !== undefined &&
      frontPos <= RENDER_FP_EPS &&
      truthChanged
    cascadeBlockedByKey.set(key, isBlocked || holdBlockedAtCellStart)
  }

  return {
    truthEpoch,
    lastTruthSignature: truthSignature,
    terminalEndHoldStates: nextTerminalEndHoldStates,
    previousCascadeBlockedByKey: cascadeBlockedByKey,
    cascadeBlockedByKey,
  }
}