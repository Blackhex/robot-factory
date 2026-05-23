import type { Item } from './Item.ts'
import { createItem, createAssembly } from './Item.ts'
import type { Recipe } from './Recipe.ts'
import type {
  ItemType,
  MachineOutputPort,
  MachineState,
  MachineType,
} from './types.ts'
import { SLOT_FIELD, SPLITTER_SIDE_TO_PORT, SPLITTER_SIDE_BIT, SPLITTER_SIDES_IN_BIT_ORDER } from './types.ts'
import { defectProbability } from './Defect.ts'

/**
 * Structural view of the `Machine` class (declared in `./Machine.ts`)
 * that the behavior strategies need to read and mutate. Defined here
 * (rather than imported from the class module) to break what would
 * otherwise be a source-level circular dependency between `Machine.ts`
 * and `MachineBehaviors.ts` — the Architecture test treats every
 * `import` (including `import type` and dynamic imports) as a graph
 * edge and rejects cycles inside `src/game/`.
 *
 * The `Machine` class structurally satisfies this shape, so dispatch
 * from `Machine.tick()` / `Machine.canConsume()` passes `this` directly
 * without any casts.
 */
export interface Machine {
  readonly id: string
  readonly machineType: MachineType
  state: MachineState
  currentRecipe: Recipe | null
  processingTimer: number
  readonly inputSlots: Item[]
  readonly maxInputSlots: number
  outputSlot: Item | null
  secondaryOutputSlot: Item | null
  tertiaryOutputSlot: Item | null
  /** Splitter routing config: bitfield (see {@link SPLITTER_SIDE_BIT}); default {@link SPLITTER_ALL_SIDES_BITS}. */
  outputSidesConfig: number
  /** Splitter round-robin index; advanced once per successful park, never on a failed park. */
  routingCounter: number
  /** Per-item routing override map: itemId → sides bitmask. Consumed by tickSplitter. */
  readonly perItemRouteOverrides: Map<string, number>
  itemsProduced: number
  enabled: boolean
  speed: number
  /**
   * Transient: set during `consumeInputs` if any consumed input was
   * defective. Read in `produceOutput` so assembler and painter
   * propagate defects across the processing-timer gap. Reset to `false`
   * immediately after `produceOutput` completes.
   */
  pendingDefectFromInput: boolean
}

/**
 * Per-tick environment passed to {@link MachineBehavior.tick}, giving
 * behaviors read-only access to simulation-level wiring they cannot
 * see from a `Machine` alone. The splitter consults
 * {@link MachineTickEnv.isOutputConnected} to skip output sides that
 * have no downstream belt; other behaviors ignore it.
 *
 * Defined here (not in `Simulation.ts`) so the behavior strategies
 * stay decoupled from `Simulation` and the Architecture cycle guard
 * inside `src/game/` is respected.
 */
export interface MachineTickEnv {
  /** True iff the given machine's output `port` has a connected downstream belt. */
  isOutputConnected(machineId: string, port: MachineOutputPort): boolean
}

/**
 * Test-only {@link MachineTickEnv} that reports every output port as
 * connected. Production code constructs a real env in
 * `Simulation.updateMachines`.
 */
export const ALL_OUTPUTS_CONNECTED_ENV: MachineTickEnv = Object.freeze({
  isOutputConnected: () => true,
})

/**
 * Strategy interface for per-machine-type tick + canConsume behavior.
 *
 * Each `MachineType` has exactly one `MachineBehavior` registered in
 * {@link MACHINE_BEHAVIORS}. `Machine.tick()` and `Machine.canConsume()`
 * are thin dispatchers that look up the behavior by `machine.machineType`
 * and forward to it.
 */
export interface MachineBehavior {
  /** Advance the machine state for one tick. The `rng` is consulted by
   *  defect-rolling behaviors (part_fabricator, assembler, painter); other
   *  behaviors ignore it. The `env` exposes simulation-level wiring (e.g.,
   *  output-belt connectivity) consulted by the splitter; other behaviors
   *  ignore it. */
  tick(machine: Machine, rng: () => number, env: MachineTickEnv): void
  /** Whether this machine accepts the given item type at all (regardless of slot capacity). */
  canConsume(machine: Machine, itemType: ItemType): boolean
  /** Whether this machine has room for `itemType` right now. Combines slot
   *  capacity with any per-type quota the current recipe imposes. */
  canAcceptItemType(machine: Machine, itemType: ItemType): boolean
}

// --- Default tick (part_fabricator, assembler, painter) ---

function tickDefault(m: Machine, rng: () => number): void {
  switch (m.state) {
    case 'idle':
      tryStartProcessing(m)
      break
    case 'processing':
      m.processingTimer--
      if (m.processingTimer <= 0) {
        if (m.outputSlot === null) {
          produceOutput(m, rng)
          m.state = 'idle'
          tryStartProcessing(m)
        } else {
          m.state = 'blocked'
        }
      }
      break
    case 'blocked':
      if (m.outputSlot === null) {
        produceOutput(m, rng)
        m.state = 'idle'
        tryStartProcessing(m)
      }
      break
  }
}

// --- Splitter tick ---
//
// Round-robin only over configured sides whose downstream belt is
// connected. If zero configured sides are connected (or none are
// configured) the splitter blocks: no park, no counter advance, no
// input drain — the held item routes next tick when a belt comes up.
// Counter advances ONLY on a successful park; a failed park sets
// state='blocked' and re-attempts the SAME side next tick.

function tickSplitter(m: Machine, _rng: () => number, env: MachineTickEnv): void {
  while (m.inputSlots.length > 0) {
    const nextItem = m.inputSlots[0]
    const override = m.perItemRouteOverrides.get(nextItem.id)
    const bitmask = override !== undefined ? override : m.outputSidesConfig
    const configured = SPLITTER_SIDES_IN_BIT_ORDER.filter(
      (s) => (bitmask & SPLITTER_SIDE_BIT[s]) !== 0,
    )
    const connected = configured.filter((s) =>
      env.isOutputConnected(m.id, SPLITTER_SIDE_TO_PORT[s]),
    )
    if (connected.length === 0) {
      m.state = 'blocked'
      return
    }
    const side = override !== undefined
      ? connected[0]
      : connected[m.routingCounter % connected.length]
    const port = SPLITTER_SIDE_TO_PORT[side]
    if (!parkInOutput(m, port, () => m.inputSlots.shift()!)) {
      m.state = 'blocked'
      return
    }
    if (override !== undefined) {
      m.perItemRouteOverrides.delete(nextItem.id)
    } else {
      m.routingCounter += 1
    }
  }
  m.state = 'idle'
}

// --- Recycler tick ---

function tickRecycler(m: Machine, _rng: () => number): void {
  switch (m.state) {
    case 'idle':
      if (m.inputSlots.length > 0) {
        m.inputSlots.shift() // consume the input
        m.processingTimer = scaledTicks(3, m.speed)
        m.state = 'processing'
      }
      break
    case 'processing':
      m.processingTimer--
      if (m.processingTimer <= 0) {
        if (parkInOutput(m, 'primary', () => createItem('raw_material'))) {
          m.state = 'idle'
        } else {
          m.state = 'blocked'
        }
      }
      break
    case 'blocked':
      if (parkInOutput(m, 'primary', () => createItem('raw_material'))) {
        m.state = 'idle'
      }
      break
  }
}

// --- Shared helpers ---

/**
 * Try to park an item into the machine's primary or secondary output slot.
 *
 * The `produce` thunk is invoked **lazily**, only when the target slot is
 * empty. This preserves observable behavior at sites that source the item
 * from the input queue (`m.inputSlots.shift()!`) or that allocate a fresh
 * `Item` (whose id counter is a side effect of `createItem` / `createAssembly`):
 * a blocked slot must NOT consume the input or burn an item id.
 *
 * Returns `true` when the slot was empty and the item was parked, `false`
 * when the slot was already occupied (caller should set `state = 'blocked'`).
 */
function parkInOutput(
  m: Machine,
  slot: MachineOutputPort,
  produce: () => Item,
): boolean {
  const field = SLOT_FIELD[slot]
  if (m[field] !== null) return false
  m[field] = produce()
  m.itemsProduced++
  return true
}

function tryStartProcessing(m: Machine): void {
  if (!m.currentRecipe) return
  if (!hasRequiredInputs(m)) return

  consumeInputs(m)
  m.processingTimer = scaledTicks(m.currentRecipe.processingTicks, m.speed)
  m.state = 'processing'
}

function hasRequiredInputs(m: Machine): boolean {
  const recipe = m.currentRecipe
  if (!recipe) return false

  // Fabricators have no inputs
  if (recipe.inputs.length === 0) return true

  // Check each required input
  const available = new Map<ItemType, number>()
  for (const item of m.inputSlots) {
    available.set(item.type, (available.get(item.type) ?? 0) + 1)
  }

  for (const input of recipe.inputs) {
    const count = available.get(input.type) ?? 0
    if (count < input.quantity) return false
  }

  return true
}

function consumeInputs(m: Machine): void {
  const recipe = m.currentRecipe
  if (!recipe || recipe.inputs.length === 0) return

  let anyDefective = false
  for (const input of recipe.inputs) {
    let remaining = input.quantity
    for (let i = m.inputSlots.length - 1; i >= 0 && remaining > 0; i--) {
      if (m.inputSlots[i].type === input.type) {
        if (m.inputSlots[i].isDefective) anyDefective = true
        m.inputSlots.splice(i, 1)
        remaining--
      }
    }
  }
  m.pendingDefectFromInput = anyDefective
}

/**
 * Decide whether the about-to-be-produced output is defective.
 *
 * - If any consumed input was defective, the output is always defective
 *   (propagation; no rng call).
 * - Otherwise, roll: defective iff `rng() < defectProbability(m.speed)`.
 *
 * Exactly zero or one rng call per invocation.
 */
function evaluateDefect(
  m: Machine,
  rng: () => number,
  hasInputDefect: boolean,
): boolean {
  if (hasInputDefect) return true
  return rng() < defectProbability(m.speed)
}

function produceOutput(m: Machine, rng: () => number): void {
  const recipe = m.currentRecipe
  if (!recipe || recipe.outputs.length === 0) return

  const output = recipe.outputs[0]
  const hasInputDefect = m.pendingDefectFromInput

  // part_fabricator (no inputs): roll only.
  // assembler (inputs > 0, output is assembly): propagate + roll.
  // painter (inputs > 0, output is single item): propagate + roll.
  let item: Item
  if (recipe.inputs.length > 0) {
    item = createAssembly(output.type, [])
  } else {
    item = createItem(output.type)
  }

  item.isDefective = evaluateDefect(m, rng, hasInputDefect)
  m.outputSlot = item
  m.itemsProduced++
  m.pendingDefectFromInput = false
}

// --- canConsume strategies ---

function canConsumeAlways(_m: Machine, _t: ItemType): boolean {
  return true
}

function canConsumeWhenEnabled(m: Machine, _t: ItemType): boolean {
  return m.enabled
}

/**
 * Recipe-driven canConsume used by part_fabricator / assembler / painter.
 * Accepts only item types listed in the currently-set recipe inputs. With
 * no recipe set or a zero-input recipe, nothing is consumable.
 */
function canConsumeRecipeDriven(m: Machine, itemType: ItemType): boolean {
  const recipe = m.currentRecipe
  if (recipe === null) return false
  if (recipe.inputs.length === 0) return false
  return recipe.inputs.some((i) => i.type === itemType)
}

// --- canAcceptItemType strategies ---

function canAcceptItemTypeAlways(_m: Machine, _t: ItemType): boolean {
  return true
}

function canAcceptItemTypeWhenSlotFree(m: Machine, _t: ItemType): boolean {
  return m.inputSlots.length < m.maxInputSlots
}

/**
 * Recipe-aware: a free input slot AND, if a recipe is set, the per-type
 * quota for `itemType` has not yet been reached. Without a recipe, falls
 * back to a plain slot-capacity check.
 */
function canAcceptItemTypeRecipeDriven(m: Machine, itemType: ItemType): boolean {
  if (m.inputSlots.length >= m.maxInputSlots) return false
  const recipe = m.currentRecipe
  if (recipe === null) return true
  const required = recipe.inputs.find((i) => i.type === itemType)
  if (required === undefined) return false
  let have = 0
  for (const slot of m.inputSlots) {
    if (slot.type === itemType) have++
  }
  return have < required.quantity
}

/**
 * Scale a base processing duration by the machine's speed multiplier.
 * The `safeSpeed` guard is defense in depth: the block validator clamps
 * speed to 1..10, but a hand-typed `factory.setMachineSpeed("m", 0)`
 * from the fallback editor would otherwise divide by zero.
 */
function scaledTicks(baseTicks: number, speed: number): number {
  const safeSpeed = speed > 0 ? speed : 1
  return Math.max(1, Math.ceil(baseTicks / safeSpeed))
}

// --- Behavior objects ---

const partFabricatorBehavior: MachineBehavior = {
  tick: (m, rng) => tickDefault(m, rng),
  canConsume: (m, t) => canConsumeRecipeDriven(m, t),
  canAcceptItemType: (m, t) => canAcceptItemTypeRecipeDriven(m, t),
}
const assemblerBehavior: MachineBehavior = {
  tick: (m, rng) => tickDefault(m, rng),
  canConsume: (m, t) => canConsumeRecipeDriven(m, t),
  canAcceptItemType: (m, t) => canAcceptItemTypeRecipeDriven(m, t),
}
const painterBehavior: MachineBehavior = {
  tick: (m, rng) => tickDefault(m, rng),
  canConsume: (m, t) => canConsumeRecipeDriven(m, t),
  canAcceptItemType: (m, t) => canAcceptItemTypeRecipeDriven(m, t),
}
const splitterBehavior: MachineBehavior = {
  tick: tickSplitter,
  canConsume: canConsumeAlways,
  canAcceptItemType: canAcceptItemTypeWhenSlotFree,
}
const recyclerBehavior: MachineBehavior = {
  tick: tickRecycler,
  canConsume: canConsumeAlways,
  canAcceptItemType: canAcceptItemTypeWhenSlotFree,
}
const factoryOutputBehavior: MachineBehavior = {
  tick: (_m, _rng) => {},
  canConsume: canConsumeWhenEnabled,
  canAcceptItemType: canAcceptItemTypeAlways,
}

export const MACHINE_BEHAVIORS: Record<MachineType, MachineBehavior> = {
  part_fabricator: partFabricatorBehavior,
  assembler: assemblerBehavior,
  painter: painterBehavior,
  splitter: splitterBehavior,
  recycler: recyclerBehavior,
  factory_output: factoryOutputBehavior,
}
