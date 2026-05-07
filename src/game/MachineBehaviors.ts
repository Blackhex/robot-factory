import type { Item } from './Item.ts'
import { createItem, createAssembly } from './Item.ts'
import type { Recipe } from './Recipe.ts'
import type {
  ItemType,
  MachineState,
  MachineType,
  SplitterCondition,
} from './types.ts'
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
  readonly machineType: MachineType
  state: MachineState
  currentRecipe: Recipe | null
  processingTimer: number
  readonly inputSlots: Item[]
  outputSlot: Item | null
  secondaryOutputSlot: Item | null
  qualityThreshold: number
  splitterCondition: SplitterCondition | null
  splitterCounter: number
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
   *  behaviors ignore it. */
  tick(machine: Machine, rng: () => number): void
  /** Whether this machine accepts the given item type at all (regardless of slot capacity). */
  canConsume(machine: Machine, itemType: ItemType): boolean
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

// --- QualityChecker tick ---

function tickQualityChecker(m: Machine, _rng: () => number): void {
  switch (m.state) {
    case 'idle':
      if (m.inputSlots.length > 0) {
        m.processingTimer = 1
        m.state = 'processing'
      }
      break
    case 'processing':
      m.processingTimer--
      if (m.processingTimer <= 0) {
        tryRouteCheckedItem(m)
      }
      break
    case 'blocked':
      tryRouteCheckedItem(m)
      break
  }
}

function tryRouteCheckedItem(m: Machine): void {
  if (m.inputSlots.length === 0) {
    m.state = 'idle'
    return
  }

  const item = m.inputSlots[0]
  const slot: 'primary' | 'secondary' =
    item.quality >= m.qualityThreshold ? 'primary' : 'secondary'

  if (parkInOutput(m, slot, () => m.inputSlots.shift()!)) {
    m.state = 'idle'
  } else {
    m.state = 'blocked'
  }
}

// --- Splitter tick ---
// TODO: 3-output routing will be handled at the simulation layer

function tickSplitter(m: Machine, _rng: () => number): void {
  switch (m.state) {
    case 'idle':
      if (m.inputSlots.length > 0) {
        tryRouteSplitterItem(m)
      }
      break
    case 'blocked':
      tryRouteSplitterItem(m)
      break
  }
}

function tryRouteSplitterItem(m: Machine): void {
  if (m.inputSlots.length === 0) {
    m.state = 'idle'
    return
  }

  const item = m.inputSlots[0]
  const slot = evaluateSplitterCondition(m, item)

  if (parkInOutput(m, slot, () => m.inputSlots.shift()!)) {
    m.state = 'idle'
  } else {
    m.state = 'blocked'
  }
}

function evaluateSplitterCondition(m: Machine, _item: Item): 'primary' | 'secondary' {
  if (!m.splitterCondition) return 'primary'

  switch (m.splitterCondition.conditionType) {
    case 'by_item_type':
      return _item.type === m.splitterCondition.itemType ? 'primary' : 'secondary'
    case 'by_quality':
      return _item.quality >= (m.splitterCondition.qualityThreshold ?? 80)
        ? 'primary'
        : 'secondary'
    case 'alternating':
      m.splitterCounter++
      return m.splitterCounter % 2 === 1 ? 'primary' : 'secondary'
    default:
      return 'primary'
  }
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
  slot: 'primary' | 'secondary',
  produce: () => Item,
): boolean {
  if (slot === 'primary') {
    if (m.outputSlot === null) {
      m.outputSlot = produce()
      return true
    }
  } else {
    if (m.secondaryOutputSlot === null) {
      m.secondaryOutputSlot = produce()
      return true
    }
  }
  return false
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
}
const assemblerBehavior: MachineBehavior = {
  tick: (m, rng) => tickDefault(m, rng),
  canConsume: (m, t) => canConsumeRecipeDriven(m, t),
}
const painterBehavior: MachineBehavior = {
  tick: (m, rng) => tickDefault(m, rng),
  canConsume: (m, t) => canConsumeRecipeDriven(m, t),
}
const qualityCheckerBehavior: MachineBehavior = {
  tick: tickQualityChecker,
  canConsume: canConsumeWhenEnabled,
}
const splitterBehavior: MachineBehavior = {
  tick: tickSplitter,
  canConsume: canConsumeAlways,
}
const recyclerBehavior: MachineBehavior = {
  tick: tickRecycler,
  canConsume: canConsumeAlways,
}
const factoryOutputBehavior: MachineBehavior = {
  tick: (_m, _rng) => {},
  canConsume: canConsumeWhenEnabled,
}

export const MACHINE_BEHAVIORS: Record<MachineType, MachineBehavior> = {
  part_fabricator: partFabricatorBehavior,
  assembler: assemblerBehavior,
  painter: painterBehavior,
  quality_checker: qualityCheckerBehavior,
  splitter: splitterBehavior,
  recycler: recyclerBehavior,
  factory_output: factoryOutputBehavior,
}
