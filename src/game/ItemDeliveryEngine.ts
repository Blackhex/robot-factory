import type { GameOverCause, GameOverInfo, SimulationEventType } from './types.ts'
import { getItemCategory } from './types.ts'
import { Machine } from './Machine.ts'
import { ConveyorBelt } from './ConveyorBelt.ts'
import type { Item } from './Item.ts'

function getUnconsumableInputCause(targetMachine: Machine): GameOverCause | undefined {
  if (!targetMachine.enabled) {
    switch (targetMachine.machineType) {
      case 'factory_output':
        return 'machine_disabled'
      default:
        break
    }
  }

  return undefined
}

/**
 * Dependency object accepted by `ItemDeliveryEngine`. The engine reads
 * from these accessors but does not own the underlying collections —
 * that ownership stays in `Simulation`.
 */
export interface ItemDeliveryEngineDeps {
  getBelts(): ReadonlyMap<string, ConveyorBelt>
  findMachineAt(x: number, z: number): Machine | undefined
  findBeltStartingAt(x: number, z: number): ConveyorBelt | undefined
}

/**
 * A single event the engine asks `Simulation` to emit. The engine does
 * not call into the simulation's emitter directly so that ordering and
 * the `currentTick` stamp on every event remain the responsibility of
 * `Simulation` (and so the engine stays cheap to test).
 */
export interface DeliveryEvent {
  type: SimulationEventType
  data: Record<string, unknown>
  tick?: number
}

export interface DeliveryResult {
  itemsDelivered: number
  outputsDelivered: number
  robotsProduced: number
  partsDelivered: number
  assembliesDelivered: number
  robotsDelivered: number
  defectsDiscarded: number
  newGameOver: GameOverInfo | null
  events: DeliveryEvent[]
  /**
   * Per-arrival record for every item consumed by a machine via
   * `Machine.addInput`, in delivery order. Powers the simulation's
   * item-arrival bridge.
   */
  arrivals: Array<{ machineId: string; item: Item }>
}

/**
 * Order-independent fixed-point delivery loop, extracted from
 * `Simulation.deliverItems` as part of the B-10 god-file split.
 *
 * For every belt with ready items, attempts delivery to either:
 *   1. a machine at the belt's destination cell, or
 *   2. another belt starting at the same cell (handover).
 *
 * A pass that frees at least one cell may unblock another delivery
 * upstream, so we iterate until no progress is made. Bounded by
 * `belts.length + 1` — each progressing pass frees at least one cell,
 * so convergence is guaranteed.
 *
 * The first attempt to deliver to a machine that cannot consume the
 * item type trips a fatal `unconsumable_input` game-over (echoed back
 * to `Simulation` via `newGameOver`).
 */
export class ItemDeliveryEngine {
  private readonly deps: ItemDeliveryEngineDeps

  constructor(deps: ItemDeliveryEngineDeps) {
    this.deps = deps
  }

  deliver(currentTick: number, existingGameOver: GameOverInfo | null): DeliveryResult {
    const result: DeliveryResult = {
      itemsDelivered: 0,
      outputsDelivered: 0,
      robotsProduced: 0,
      partsDelivered: 0,
      assembliesDelivered: 0,
      robotsDelivered: 0,
      defectsDiscarded: 0,
      newGameOver: existingGameOver,
      events: [],
      arrivals: [],
    }

    const belts = Array.from(this.deps.getBelts().values())
    let progress = true
    let safety = belts.length + 1
    while (progress && safety-- > 0) {
      progress = false
      for (const belt of belts) {
        const readyItems = belt.getReadyItems()
        for (const item of readyItems) {
          // First, try to deliver to a machine at the belt's destination
          const targetMachine = this.deps.findMachineAt(belt.toX, belt.toZ)
          if (targetMachine && targetMachine.canAcceptInput()) {
            // Fatal mis-routing: machine cannot consume this item type at
            // all (wrong recipe, disabled destination, no recipe, or
            // zero-input recipe). Trip game-over once and leave the item
            // parked at the belt end.
            if (!targetMachine.canConsume(item.type)) {
              if (result.newGameOver === null) {
                const cause = getUnconsumableInputCause(targetMachine)
                result.newGameOver = {
                  reason: 'unconsumable_input',
                  ...(cause ? { cause } : {}),
                  machineId: targetMachine.id,
                  itemId: item.id,
                  itemType: item.type,
                  tick: currentTick + 1,
                }
                result.events.push({
                  type: 'game_over',
                  tick: result.newGameOver.tick,
                  data: { ...result.newGameOver },
                })
              }
              continue
            }
            // Recipe-aware backpressure: right type for this machine, but
            // its per-type quota is already met. Leave the item on the belt;
            // it will retry next tick once `consumeInputs` frees space. No
            // game-over — this is the same shape as "all input slots full".
            if (!targetMachine.canAcceptItemType(item.type)) {
              continue
            }
            // Discard contract: defective items at the Shipper (factory_output)
            // are rejected at the dock — they count toward defect/quality
            // stats but not toward delivered outputs or robots produced.
            if (
              targetMachine.machineType === 'factory_output' &&
              item.isDefective
            ) {
              belt.removeItem(item.id)
              result.defectsDiscarded++
              result.events.push({
                type: 'item_discarded',
                data: {
                  itemId: item.id,
                  itemType: item.type,
                  machineId: targetMachine.id,
                  reason: 'defective',
                },
              })
              progress = true
              continue
            }
            targetMachine.addInput(item)
            result.arrivals.push({ machineId: targetMachine.id, item })
            belt.removeItem(item.id)
            result.itemsDelivered++
            result.events.push({
              type: 'item_delivered',
              data: {
                itemId: item.id,
                beltId: belt.id,
                machineId: targetMachine.id,
              },
            })
            if (targetMachine.machineType === 'factory_output') {
              result.outputsDelivered++
              const category = getItemCategory(item.type)
              switch (category) {
                case 'part':
                  result.partsDelivered++
                  break
                case 'assembly':
                  result.assembliesDelivered++
                  break
                case 'robot':
                  result.robotsDelivered++
                  result.robotsProduced++
                  break
                default: {
                  const _exhaustive: never = category
                  void _exhaustive
                }
              }
              result.events.push({
                type: 'output_delivered',
                data: {
                  itemId: item.id,
                  itemType: item.type,
                  machineId: targetMachine.id,
                },
              })
            }
            progress = true
            continue
          }

          // No machine (or machine full) — try to transfer to a belt starting here
          const nextBelt = this.deps.findBeltStartingAt(belt.toX, belt.toZ)
          if (nextBelt && nextBelt.id !== belt.id) {
            // Plain normalized position overshoot — no arc-length conversion.
            const overshoot = item.positionOnBelt - 1.0
            if (nextBelt.acceptHandover(item, overshoot)) {
              belt.removeItem(item.id)
              progress = true
            }
          }
          // If neither machine nor next belt, item stays (belt jam)
        }
      }
    }

    return result
  }
}
