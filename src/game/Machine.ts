import type { MachineState, MachineType, ItemType, SplitterCondition } from './types.ts'
import type { Item } from './Item.ts'
import type { Recipe } from './Recipe.ts'
import { MACHINE_BEHAVIORS } from './MachineBehaviors.ts'

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
  enabled = false

  // Multi-output support (QualityChecker, Splitter)
  secondaryOutputSlot: Item | null = null

  // QualityChecker configuration
  qualityThreshold = 80

  // Splitter configuration
  splitterCondition: SplitterCondition | null = null
  // Package-internal: read/written by MachineBehaviors.tickSplitter.
  splitterCounter = 0

  constructor(id: string, machineType: MachineType, maxInputSlots = 4) {
    this.id = id
    this.machineType = machineType
    this.maxInputSlots = maxInputSlots
  }

  setRecipe(recipe: Recipe): void {
    this.currentRecipe = recipe
  }

  /** Enable processing on this machine. Does not modify currentRecipe. */
  start(): void {
    this.enabled = true
  }

  /** Disable processing on this machine. Does not modify currentRecipe. */
  stop(): void {
    this.enabled = false
  }

  /**
   * Reset all in-flight runtime state (slots, timers, counters), preserving
   * configuration like recipe, qualityThreshold, splitterCondition, id, and type.
   */
  clearRuntimeState(): void {
    this.inputSlots.length = 0
    this.outputSlot = null
    this.secondaryOutputSlot = null
    this.state = 'idle'
    this.processingTimer = 0
    this.consumedItems = 0
    this.splitterCounter = 0
    this.enabled = false
  }

  addInput(item: Item): boolean {
    if (this.machineType === 'factory_output') {
      this.consumedItems++
      return true
    }
    if (this.inputSlots.length >= this.maxInputSlots) return false
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

  canAcceptInput(): boolean {
    if (this.machineType === 'factory_output') return true
    return this.inputSlots.length < this.maxInputSlots
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

  tick(): void {
    // Single gate for all tickable machine types. factory_output is naturally
    // exempt because its registered behavior tick is a no-op.
    if (!this.enabled) return
    MACHINE_BEHAVIORS[this.machineType].tick(this)
  }
}
