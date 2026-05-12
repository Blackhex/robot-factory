import type { GameOverInfo, ItemType } from './types.ts'
import type { Machine } from './Machine.ts'
import type { ConveyorBelt } from './ConveyorBelt.ts'

export interface StarvationContext {
  getOutputBelt(machineId: string, port: 'primary' | 'secondary'): string | undefined
  getBelt(beltId: string): ConveyorBelt | undefined
  findMachineAt(x: number, z: number): Machine | undefined
  findBeltStartingAt(x: number, z: number): ConveyorBelt | undefined
}

function resolveConsumerMachine(
  startBelt: ConveyorBelt,
  context: StarvationContext,
): Machine | undefined {
  const visited = new Set<string>([startBelt.id])
  let current: ConveyorBelt = startBelt
  for (let hops = 0; hops < 10000; hops++) {
    const machine = context.findMachineAt(current.toX, current.toZ)
    if (machine) return machine
    const next = context.findBeltStartingAt(current.toX, current.toZ)
    if (!next) return undefined
    if (visited.has(next.id)) return undefined
    visited.add(next.id)
    current = next
  }
  return undefined
}

/**
 * Detect starvation: a machine that needs an input type which no
 * upstream-reachable machine (via the belt graph) has a recipe to
 * produce. First match wins. Pure: does not mutate or emit.
 */
export function detectStarvation(
  machines: Iterable<Machine>,
  context: StarvationContext,
  currentTick: number,
): GameOverInfo | null {
  const all: Machine[] = []
  for (const m of machines) all.push(m)

  // Build producer→consumer edges from the belt graph. Edges are
  // discovered through the context adapter only (no direct world reads).
  interface Edge { producer: Machine; consumer: Machine }
  const edges: Edge[] = []
  for (const producer of all) {
    for (const port of ['primary', 'secondary'] as const) {
      const beltId = context.getOutputBelt(producer.id, port)
      if (!beltId) continue
      const belt = context.getBelt(beltId)
      if (!belt) continue
      const consumer = resolveConsumerMachine(belt, context)
      if (!consumer) continue
      edges.push({ producer, consumer })
    }
  }

  for (const machine of all) {
    if (!machine.enabled) continue
    if (machine.currentRecipe === null) continue
    if (machine.inputSlots.length === 0) continue

    const recipe = machine.currentRecipe
    const tally = new Map<ItemType, number>()
    for (const item of machine.inputSlots) {
      tally.set(item.type, (tally.get(item.type) ?? 0) + 1)
    }

    for (const input of recipe.inputs) {
      const have = tally.get(input.type) ?? 0
      // Only types never delivered yet count as starved. If at least one
      // unit has arrived, the upstream has demonstrably produced it.
      if (have > 0) continue
      if (!upstreamCanProduce(machine, input.type, edges)) {
        return {
          reason: 'starvation',
          machineId: machine.id,
          itemType: input.type,
          tick: currentTick,
        }
      }
    }
  }
  return null
}

function upstreamCanProduce(
  target: Machine,
  type: ItemType,
  edges: ReadonlyArray<{ producer: Machine; consumer: Machine }>,
): boolean {
  const visited = new Set<string>([target.id])
  const stack: Machine[] = [target]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const edge of edges) {
      if (edge.consumer.id !== current.id) continue
      const producer = edge.producer
      if (visited.has(producer.id)) continue
      visited.add(producer.id)
      const recipe = producer.currentRecipe
      if (recipe !== null && producer.enabled) {
        for (const out of recipe.outputs) {
          if (out.type === type) return true
        }
      }
      stack.push(producer)
    }
  }
  return false
}
