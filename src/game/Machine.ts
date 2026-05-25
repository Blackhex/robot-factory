import type { MachineOutputPort, MachineState, MachineType, ItemType } from './types.ts'
import { SLOT_FIELD, SPLITTER_ALL_SIDES_BITS } from './types.ts'
import type { Item } from './Item.ts'
import type { Recipe } from './Recipe.ts'
import { MACHINE_BEHAVIORS, type MachineTickEnv } from './MachineBehaviors.ts'

/**
 * Per-type tick + canConsume logic lives in `MachineBehaviors.ts` as a
 * strategy registry keyed by `machineType`. To let those plain functions
 * read and mutate machine state without a wide getter/setter surface,
 * the relevant fields and helpers are intentionally package-internal:
 * they have no `private`/`public` modifier instead of `private`. Treat
 * them as internal-to-`src/game/` — outside callers should still use the
 * public methods (`tick`, `canConsume`, `addInput`, `takeOutput`, …).
 */
export class Machine {
  readonly id: string
  readonly machineType: MachineType
  state: MachineState = 'idle'
  currentRecipe: Recipe | null = null
  processingTimer = 0
  readonly inputSlots: Item[] = []
  outputSlot: Item | null = null
  readonly maxInputSlots: number
  consumedItems = 0
  itemsProduced = 0
  enabled = false

  // Multi-output support (Splitter)
  secondaryOutputSlot: Item | null = null
  tertiaryOutputSlot: Item | null = null

  // Splitter routing config: bitfield (see SPLITTER_SIDE_BIT in types.ts). Default = all sides.
  outputSidesConfig = SPLITTER_ALL_SIDES_BITS
  // Splitter round-robin index into the enabled-sides list.
  routingCounter = 0
  // Per-item routing override: itemId → sides bitmask. Populated by
  // SET_OUTPUT_SIDES commands carrying an itemId (emitted from inside
  // `on item arrives` handlers). Consumed once by tickSplitter when
  // the matching item is parked, so simultaneous arrivals at the same
  // splitter route deterministically per item rather than via the
  // last-write-wins sticky `outputSidesConfig`.
  readonly perItemRouteOverrides: Map<string, number> = new Map()

  // Configuration: scales processingTimer (preserved by clearRuntimeState).
  speed = 1

  /**
   * Transient: set during `consumeInputs` when any consumed input was
   * defective; read in `produceOutput` so assembler/painter can propagate
   * the defect flag through the processing-timer gap. Reset to `false`
   * immediately after `produceOutput` completes (next batch starts clean).
   * Always `false` for fabricators (no inputs).
   */
  pendingDefectFromInput = false

  /**
   * Set by `consumeInputs` to the Items removed from `inputSlots` for the
   * current cycle, ordered to match `recipe.inputs` (expanded by quantity).
   * Read by `produceOutput` to populate the assembly's `components`.
   */
  pendingComponents: Item[] = []

  /**
   * Set on the false→true edge of `enabled` (i.e., a real `start()` flip).
   * Consumed by `Simulation.updateMachines` after the machine ticks: if
   * the machine remained idle this tick (no real state change, no cycle
   * produced), Simulation emits a synthetic `machine_cycle_completed` so
   * "on machine idle" handlers fire for machines that boot enabled-but-
   * stuck-idle (e.g., assembler started with no inputs). Cleared every
   * tick that observes it, so the synthetic emit happens at most once
   * per `start()` call.
   */
  firstIdleAfterStartPending = false

  /** Recycler-only: queued items waiting to be parked into the primary output, one per tick. */
  readonly recyclerOutputQueue: Item[] = []

  constructor(id: string, machineType: MachineType, maxInputSlots = 3) {
    this.id = id
    this.machineType = machineType
    this.maxInputSlots = maxInputSlots
  }

  setRecipe(recipe: Recipe): void {
    this.currentRecipe = recipe
  }

  /** Enable processing on this machine. Does not modify currentRecipe. */
  start(): void {
    if (!this.enabled) {
      this.enabled = true
      this.firstIdleAfterStartPending = true
    }
  }

  /** Disable processing on this machine. Does not modify currentRecipe. */
  stop(): void {
    this.enabled = false
    this.firstIdleAfterStartPending = false
  }

  /**
   * Reset all in-flight runtime state (slots, timers, counters), preserving
   * configuration like recipe, id, and type.
   */
  clearRuntimeState(): void {
    this.inputSlots.length = 0
    this.outputSlot = null
    this.secondaryOutputSlot = null
    this.tertiaryOutputSlot = null
    this.state = 'idle'
    this.processingTimer = 0
    this.consumedItems = 0
    this.itemsProduced = 0
    this.enabled = false
    this.pendingDefectFromInput = false
    this.pendingComponents = []
    this.firstIdleAfterStartPending = false
    this.outputSidesConfig = SPLITTER_ALL_SIDES_BITS
    this.routingCounter = 0
    this.perItemRouteOverrides.clear()
    this.recyclerOutputQueue.length = 0
  }

  addInput(item: Item): boolean {
    if (this.machineType === 'factory_output') {
      if (!this.enabled) {
        return false
      }
      this.consumedItems++
      return true
    }
    if (!this.canAcceptItemType(item.type)) return false
    this.inputSlots.push(item)
    return true
  }

  takeOutput(): Item | null {
    const item = this.outputSlot
    this.outputSlot = null
    if (this.state === 'blocked') {
      this.state = 'idle'
    }
    return item
  }

  takeSecondaryOutput(): Item | null {
    const item = this.secondaryOutputSlot
    this.secondaryOutputSlot = null
    if (this.state === 'blocked') {
      this.state = 'idle'
    }
    return item
  }

  takeTertiaryOutput(): Item | null {
    const item = this.tertiaryOutputSlot
    this.tertiaryOutputSlot = null
    if (this.state === 'blocked') {
      this.state = 'idle'
    }
    return item
  }

  /** Port-indexed take: dispatches to the matching output slot. */
  takeFromPort(port: MachineOutputPort): Item | null {
    const field = SLOT_FIELD[port]
    const item = this[field]
    this[field] = null
    if (this.state === 'blocked') {
      this.state = 'idle'
    }
    return item
  }

  canAcceptInput(): boolean {
    if (this.machineType === 'factory_output') return true
    return this.inputSlots.length < this.maxInputSlots
  }

  /**
   * Recipe-aware: true iff the machine has at least one free input slot
   * AND, for recipe-driven machines with a recipe set, accepting `itemType`
   * would not exceed the recipe's required quantity for that type. For
   * machines without a recipe, or non-recipe-driven machine types
   * (factory_output, splitter, recycler), behaves like
   * {@link canAcceptInput}.
   *
   * Dispatches to the per-type strategy in {@link MACHINE_BEHAVIORS}.
   */
  canAcceptItemType(itemType: ItemType): boolean {
    return MACHINE_BEHAVIORS[this.machineType].canAcceptItemType(this, itemType)
  }

  /**
   * Whether this machine is willing to consume the given item type at all,
   * regardless of slot capacity. Used by the simulation to detect a fatal
   * mis-routing (item delivered to a machine that has no use for it).
   *
   * Dispatches to the per-type strategy in {@link MACHINE_BEHAVIORS}.
   */
  canConsume(itemType: ItemType): boolean {
    return MACHINE_BEHAVIORS[this.machineType].canConsume(this, itemType)
  }

  tick(rng: () => number, env: MachineTickEnv): void {
    // Single gate for all tickable machine types. factory_output is naturally
    // exempt because its registered behavior tick is a no-op.
    if (!this.enabled) return
    MACHINE_BEHAVIORS[this.machineType].tick(this, rng, env)
  }
}
