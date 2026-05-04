import type { SimulationCommand } from '../game/types'

const MAX_OPERATIONS = 10_000

// Simulation tick rate in Hz. Must stay in sync with `DEFAULT_TICK_RATE`
// in src/game/Simulation.ts. Duplicated locally (rather than imported)
// to keep the editor layer free of game-runtime imports per the
// architectural rule that src/editor/ does not depend on simulation
// internals beyond the shared command/type contracts.
const SIM_TICK_RATE_HZ = 10

// --- Canonical enum tables (single source of truth) ----------------------
//
// Each table is the ONLY place to add/remove members. The maps and arrays
// below are derived mechanically — adding a new member requires editing
// only the corresponding TABLE.

const MACHINE_TABLE = [
  { name: 'A', id: 'machine_1' },
  { name: 'B', id: 'machine_2' },
  { name: 'C', id: 'machine_3' },
  { name: 'D', id: 'machine_4' },
  { name: 'E', id: 'machine_5' },
  { name: 'F', id: 'machine_6' },
  { name: 'G', id: 'machine_7' },
  { name: 'H', id: 'machine_8' },
] as const

const RECIPE_TABLE = [
  { name: 'WheelPressSmall', id: 'wheel_press_small' },
  { name: 'WheelPressMedium', id: 'wheel_press_medium' },
  { name: 'WheelPressLarge', id: 'wheel_press_large' },
  { name: 'SensorFabProximity', id: 'sensor_fab_proximity' },
  { name: 'SensorFabCamera', id: 'sensor_fab_camera' },
  { name: 'SensorFabLidar', id: 'sensor_fab_lidar' },
  { name: 'BatteryAssemblyStandard', id: 'battery_assembly_standard' },
  { name: 'BatteryAssemblyHigh', id: 'battery_assembly_high' },
  { name: 'ChassisStamperLight', id: 'chassis_stamper_light' },
  { name: 'ChassisStamperHeavy', id: 'chassis_stamper_heavy' },
  { name: 'CircuitPrinterBasic', id: 'circuit_printer_basic' },
  { name: 'CircuitPrinterAdvanced', id: 'circuit_printer_advanced' },
  { name: 'AssembleDrivetrainBasic', id: 'assemble_drivetrain_basic' },
  { name: 'AssembleDrivetrainAdvanced', id: 'assemble_drivetrain_advanced' },
  { name: 'AssembleSensorArrayBasic', id: 'assemble_sensor_array_basic' },
  { name: 'AssembleSensorArrayAdvanced', id: 'assemble_sensor_array_advanced' },
  { name: 'AssemblePowerUnitStandard', id: 'assemble_power_unit_standard' },
  { name: 'AssemblePowerUnitHigh', id: 'assemble_power_unit_high' },
  { name: 'AssembleRobotExplorer', id: 'assemble_robot_explorer' },
  { name: 'AssembleRobotWorker', id: 'assemble_robot_worker' },
  { name: 'AssembleRobotGuardian', id: 'assemble_robot_guardian' },
] as const

const BELT_TABLE = [
  { name: 'Belt1', id: 'belt_1' },
  { name: 'Belt2', id: 'belt_2' },
  { name: 'Belt3', id: 'belt_3' },
  { name: 'Belt4', id: 'belt_4' },
  { name: 'Belt5', id: 'belt_5' },
  { name: 'Belt6', id: 'belt_6' },
  { name: 'Belt7', id: 'belt_7' },
  { name: 'Belt8', id: 'belt_8' },
] as const

const PART_TYPE_TABLE = [
  'WheelSmall', 'WheelMedium', 'WheelLarge',
  'SensorProximity', 'SensorCamera', 'SensorLidar',
  'BatteryStandard', 'BatteryHighCapacity',
  'ChassisLight', 'ChassisHeavy',
  'CircuitBasic', 'CircuitAdvanced',
  'DrivetrainBasic', 'DrivetrainAdvanced',
  'SensorArrayBasic', 'SensorArrayAdvanced',
  'PowerUnitStandard', 'PowerUnitHigh',
  'RawMaterial',
  'RobotExplorer', 'RobotWorker', 'RobotGuardian',
] as const

// --- Derived ID arrays (index = enum numeric value) ----------------------

const MACHINE_IDS: string[] = MACHINE_TABLE.map(e => e.id)
const RECIPE_IDS: string[] = RECIPE_TABLE.map(e => e.id)
const BELT_IDS: string[] = BELT_TABLE.map(e => e.id)

// --- Derived name-to-number maps (for string args from fallback textarea) -

const MACHINE_NAME_MAP: Record<string, number> = Object.fromEntries(
  MACHINE_TABLE.map((e, i) => [e.name, i]),
)
const RECIPE_NAME_MAP: Record<string, number> = Object.fromEntries(
  RECIPE_TABLE.map((e, i) => [e.name, i]),
)
const BELT_NAME_MAP: Record<string, number> = Object.fromEntries(
  BELT_TABLE.map((e, i) => [e.name, i]),
)
const PART_TYPE_NAME_MAP: Record<string, number> = Object.fromEntries(
  PART_TYPE_TABLE.map((n, i) => [n, i]),
)

// --- Enum objects provided to executed code (for fallback textarea) -------

const MachineEnum: Record<string, number> = MACHINE_NAME_MAP
const RecipeEnum: Record<string, number> = RECIPE_NAME_MAP
const BeltEnum: Record<string, number> = BELT_NAME_MAP
const PartTypeEnum: Record<string, number> = PART_TYPE_NAME_MAP
const FactoryConditionEnum: Record<string, number> = { BeltHasItems: 0, MachineIdle: 1, ItemsRemaining: 2 }

// --- Resolvers: handle number (enum value), string enum name, or passthrough ---

function resolveRecipeId(raw: unknown): string {
  if (typeof raw === 'number') return RECIPE_IDS[raw] ?? String(raw)
  const s = String(raw).replace(/^Recipe\./, '')
  if (s in RECIPE_NAME_MAP) return RECIPE_IDS[RECIPE_NAME_MAP[s]]
  return s
}



/**
 * Executes PXT-compiled TypeScript source via `new Function()` and
 * collects SimulationCommand[] produced by namespace method calls.
 *
 * Provides namespace objects (machines, recipes, belts, loops, logic,
 * events, factory) and enum objects (Machine,
 * PartType, Recipe, Belt, FactoryCondition) to the executed code.
 * User-defined procedures use the built-in PXT Functions category
 * and compile to native JS `function` declarations, which `new Function`
 * handles natively with no interpreter support required.
 *
 * Enforces a hard cap of 10,000 operations per interpret() call.
 */
export class BlockInterpreter {
  private commands: SimulationCommand[] = []
  private opCount = 0
  private overflow = false
  private eventHandlers = new Map<string, () => void>()
  private dynamicMachines: Array<{slotIndex: number, id: string, name: string}> = []
  private dynamicBelts: Array<{slotIndex: number, id: string, name?: string}> = []

  // --- Namespace objects -------------------------------------------------

  private readonly machinesNs = {
    startMachine: (machine: unknown) => {
      if (this.guardOverflow()) return
      this.commands.push({ type: 'START_MACHINE', machineId: this.resolveMachineId(machine) })
    },
    stopMachine: (machine: unknown) => {
      if (this.guardOverflow()) return
      this.commands.push({ type: 'STOP_MACHINE', machineId: this.resolveMachineId(machine) })
    },
    setRecipe: (machine: unknown, recipe: unknown) => {
      if (this.guardOverflow()) return
      this.commands.push({ type: 'SET_RECIPE', machineId: this.resolveMachineId(machine), recipeId: resolveRecipeId(recipe) })
    },
    setQualityThreshold: (machine: unknown, threshold: unknown) => {
      if (this.guardOverflow()) return
      this.commands.push({ type: 'SET_QUALITY_THRESHOLD', machineId: this.resolveMachineId(machine), threshold: Number(threshold) || 0 })
    },
    setMachineSpeed: (machine: unknown, speed: unknown) => {
      if (this.guardOverflow()) return
      this.commands.push({
        type: 'SET_MACHINE_SPEED',
        machineId: this.resolveMachineId(machine),
        speed: Number(speed) || 1,
      })
    },
    /**
     * Returns the selected machine value unchanged. Used as the
     * value-returning expression behind the `machine %machine` block,
     * letting users assign a Machine to a built-in Blockly variable.
     */
    pickMachine: (machine: unknown) => machine,
  }

  private readonly recipesNs = {
    setRecipe: (machine: unknown, recipe: unknown) => {
      this.machinesNs.setRecipe(machine, recipe)
    },
  }

  private readonly beltsNs = {
    setBeltSpeed: (belt: unknown, speed: unknown) => {
      if (this.guardOverflow()) return
      this.commands.push({ type: 'SET_BELT_SPEED', beltId: this.resolveBeltId(belt), speed: Number(speed) || 1 })
    },
  }

  private readonly loopsNs = {
    repeatTimes: (count: unknown, body: () => void) => {
      const n = Number(count) || 0
      for (let i = 0; i < n; i++) {
        if (this.overflow) return
        const before = this.opCount
        body()
        if (this.opCount === before && this.guardOverflow()) return
      }
    },
    whileCondition: (_condition: unknown, body: () => void) => {
      while (!this.overflow) {
        const before = this.opCount
        body()
        if (this.opCount === before && this.guardOverflow()) return
      }
    },
    wait: (ms: unknown) => {
      if (this.guardOverflow()) return
      const msNum = Number(ms)
      // Defensive: NaN / undefined / negative input → 0 ticks (no-op wait).
      const safeMs = Number.isFinite(msNum) && msNum > 0 ? msNum : 0
      // Ceil rounding so any positive ms produces at least one tick of delay.
      const ticks = safeMs === 0 ? 0 : Math.ceil(safeMs * SIM_TICK_RATE_HZ / 1000)
      this.commands.push({ type: 'WAIT', ticks })
    },
    waitTicks: (ticks: unknown) => {
      if (this.guardOverflow()) return
      const n = Number(ticks)
      // Defensive: NaN / undefined / negative input → 0 ticks (no-op wait).
      // Non-integer positive input is floored — ticks are integral by contract.
      const safeTicks = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
      this.commands.push({ type: 'WAIT', ticks: safeTicks })
    },
  }

  private readonly logicNs = {
    ifQuality: (_threshold: unknown, body: () => void) => {
      body()
    },
    ifItemType: (_itemType: unknown, body: () => void) => {
      body()
    },
  }

  private readonly eventsNs = {
    onOrderReceived: (body: () => void) => {
      if (typeof body === 'function') this.eventHandlers.set('order_received', body)
    },
    onBeltJam: (body: () => void) => {
      if (typeof body === 'function') this.eventHandlers.set('belt_jam', body)
    },
    onMachineIdle: (machine: unknown, body: () => void) => {
      if (typeof body === 'function') {
        this.eventHandlers.set(`machine_idle_${this.resolveMachineId(machine)}`, body)
      }
    },
  }

  /**
   * Legacy `factory.*` namespace — provides backward-compatible methods
   * that accept string arguments with quotes (e.g. `factory.startMachine("press_1")`).
   * Also exposes enum objects (e.g. `factory.PartType.SensorCamera`).
   *
   * Composed by spreading the underlying namespace objects. All members
   * of those namespaces are arrow-function class fields, so `this` is
   * lexically bound at construction time and survives the spread.
   */
  private readonly factoryNs = {
    ...this.machinesNs,
    ...this.beltsNs,
    ...this.loopsNs,
    ...this.logicNs,
    ...this.eventsNs,
    PartType: PartTypeEnum,
    Machine: MachineEnum,
    Recipe: RecipeEnum,
    Belt: BeltEnum,
    FactoryCondition: FactoryConditionEnum,
  }

  // --- Public API --------------------------------------------------------

  interpret(source: string): SimulationCommand[] {
    this.opCount = 0
    this.overflow = false
    this.commands = []
    this.eventHandlers.clear()

    const clean = this.stripComments(source)

    try {
      const fn = new Function(
        'machines', 'recipes', 'belts', 'loops', 'logic',
        'events', 'factory',
        'Machine', 'PartType', 'Recipe', 'Belt', 'FactoryCondition',
        '"use strict";\n' + clean,
      )
      fn(
        this.machinesNs, this.recipesNs, this.beltsNs, this.loopsNs, this.logicNs,
        this.eventsNs, this.factoryNs,
        MachineEnum, PartTypeEnum, RecipeEnum, BeltEnum, FactoryConditionEnum,
      )
    } catch {
      // Syntax errors or runtime errors — return whatever was collected
    }

    return this.commands
  }

  parseTypeScript(source: string): SimulationCommand[] {
    return this.interpret(source)
  }

  triggerEvent(eventType: string): SimulationCommand[] {
    this.opCount = 0
    this.overflow = false
    this.commands = []

    const handler = this.eventHandlers.get(eventType)
    if (!handler) return []

    try {
      handler()
    } catch {
      // Runtime errors — return whatever was collected
    }

    return this.commands
  }

  getOverflowOccurred(): boolean {
    return this.overflow
  }

  reset(): void {
    this.overflow = false
    this.opCount = 0
    this.eventHandlers.clear()
  }

  // --- Dynamic machine/belt list management ------------------------------

  setMachineList(machines: Array<{slotIndex: number, id: string, name: string}>): void {
    this.dynamicMachines = [...machines]
  }

  setBeltList(belts: Array<{slotIndex: number, id: string, name?: string}>): void {
    this.dynamicBelts = [...belts]
  }

  getMachineList(): Array<{slotIndex: number, id: string, name: string}> {
    return [...this.dynamicMachines]
  }

  // --- Private helpers ---------------------------------------------------

  private resolveMachineId(raw: unknown): string {
    if (typeof raw === 'number') {
      const dynamic = this.dynamicMachines.find(m => m.slotIndex === raw)
      if (dynamic) return dynamic.id
      return MACHINE_IDS[raw] ?? `machine_${raw + 1}`
    }
    const s = String(raw).replace(/^Machine\./, '')
    if (s in MACHINE_NAME_MAP) {
      const slot = MACHINE_NAME_MAP[s]
      const dynamic = this.dynamicMachines.find(m => m.slotIndex === slot)
      if (dynamic) return dynamic.id
      return MACHINE_IDS[slot]
    }
    // Name-based lookup in dynamic list
    const byName = this.dynamicMachines.find(m => m.name === s)
    if (byName) return byName.id
    return s
  }

  private resolveBeltId(raw: unknown): string {
    if (typeof raw === 'number') {
      const dynamic = this.dynamicBelts.find(b => b.slotIndex === raw)
      if (dynamic) return dynamic.id
      return BELT_IDS[raw] ?? `belt_${raw + 1}`
    }
    const s = String(raw).replace(/^Belt\./, '')
    if (s in BELT_NAME_MAP) {
      const slot = BELT_NAME_MAP[s]
      const dynamic = this.dynamicBelts.find(b => b.slotIndex === slot)
      if (dynamic) return dynamic.id
      return BELT_IDS[slot]
    }
    // Name-based lookup in dynamic list
    const byName = this.dynamicBelts.find(b => b.name === s)
    if (byName) return byName.id
    return s
  }

  private stripComments(source: string): string {
    return source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
  }

  private guardOverflow(): boolean {
    if (this.opCount >= MAX_OPERATIONS) {
      this.overflow = true
      return true
    }
    this.opCount++
    return false
  }
}
