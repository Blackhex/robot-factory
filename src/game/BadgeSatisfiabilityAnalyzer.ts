import type { Machine } from './Machine.ts'
import type { ConveyorBelt } from './ConveyorBelt.ts'
import type { ItemType } from './types.ts'
import { getAllRecipes } from './Recipe.ts'

/**
 * Narrow read-only view onto the simulation that the static
 * recipe-dependency analyzer needs. Kept minimal so the analyzer
 * stays a pure function of program topology + assigned recipes —
 * not runtime inventory or `enabled` state.
 */
export interface SimulationReader {
  getMachine(id: string): Machine | undefined
  getMachines(): ReadonlyMap<string, Machine>
  getBelts(): ReadonlyMap<string, ConveyorBelt>
  getMachinePosition(id: string): { x: number; z: number } | undefined
}

/**
 * Returns true iff every required input type of the target machine's
 * currently-assigned recipe has at least one upstream producer
 * reachable via the configured belt topology, where:
 *   - A "producer" of type T is a machine whose `currentRecipe.outputs`
 *     contains T, OR a `recycler` when T is produced by ANY recipe in
 *     the game — the recycler can either pass-through/repair a basic
 *     part of type T or unpack an assembly that contains T as a component.
 *   - Splitters are transparent: the analyzer recurses upstream through
 *     them, since whatever feeds the splitter ultimately feeds the
 *     target.
 *   - Multi-cell belt chains are walked cell-by-cell: an intermediate
 *     cell containing only a belt segment (no machine) is followed
 *     through to its own incoming belts until a machine cell is hit.
 *   - Cycles are bounded by a visited-set keyed by cell.
 *
 * Inventory contents and `enabled` flags are intentionally ignored — the
 * answer must reflect program structure only.
 */
export function areRecipeDependenciesSatisfied(
  machineId: string,
  sim: SimulationReader,
): boolean {
  const target = sim.getMachine(machineId)
  if (!target) return true
  const recipe = target.currentRecipe
  if (recipe === null || recipe.inputs.length === 0) return true

  const machineIdByCell = new Map<string, string>()
  for (const id of sim.getMachines().keys()) {
    const p = sim.getMachinePosition(id)
    if (p) machineIdByCell.set(cellKey(p.x, p.z), id)
  }
  const beltsByDestCell = new Map<string, ConveyorBelt[]>()
  for (const belt of sim.getBelts().values()) {
    const k = cellKey(belt.toX, belt.toZ)
    let list = beltsByDestCell.get(k)
    if (list === undefined) {
      list = []
      beltsByDestCell.set(k, list)
    }
    list.push(belt)
  }

  for (const required of recipe.inputs) {
    if (!hasUpstreamProducer(machineId, required.type, sim, machineIdByCell, beltsByDestCell)) {
      return false
    }
  }
  return true
}

function hasUpstreamProducer(
  startMachineId: string,
  itemType: ItemType,
  sim: SimulationReader,
  machineIdByCell: ReadonlyMap<string, string>,
  beltsByDestCell: ReadonlyMap<string, ConveyorBelt[]>,
): boolean {
  const start = sim.getMachinePosition(startMachineId)
  if (!start) return false
  const visitedCells = new Set<string>([cellKey(start.x, start.z)])
  const stack: Array<{ x: number; z: number }> = [{ x: start.x, z: start.z }]

  while (stack.length > 0) {
    const cell = stack.pop()!
    const incoming = beltsByDestCell.get(cellKey(cell.x, cell.z))
    if (incoming === undefined) continue
    for (const belt of incoming) {
      const srcKey = cellKey(belt.fromX, belt.fromZ)
      if (visitedCells.has(srcKey)) continue
      visitedCells.add(srcKey)
      const sourceMachineId = machineIdByCell.get(srcKey)
      if (sourceMachineId === undefined) {
        // Belt-only intermediate cell — walk through it.
        stack.push({ x: belt.fromX, z: belt.fromZ })
        continue
      }
      const source = sim.getMachine(sourceMachineId)
      if (source === undefined) continue
      if (source.machineType === 'splitter') {
        stack.push({ x: belt.fromX, z: belt.fromZ })
        continue
      }
      if (source.machineType === 'recycler') {
        if (isProducibleByAnyRecipe(itemType)) return true
        continue
      }
      const outputs = source.currentRecipe?.outputs
      if (outputs && outputs.some((o) => o.type === itemType)) return true
    }
  }
  return false
}

function cellKey(x: number, z: number): string {
  return `${x},${z}`
}

function isProducibleByAnyRecipe(itemType: ItemType): boolean {
  for (const r of getAllRecipes()) {
    if (r.outputs.some((o) => o.type === itemType)) return true
  }
  return false
}
