import type { SimulationCommand } from '../game/types'

const MAX_OPERATIONS = 10_000
const MAX_CALL_DEPTH = 100

// --- Enum-to-ID lookup arrays (index = enum numeric value) ---------------

const MACHINE_IDS: string[] = [
  'machine_1', 'machine_2', 'machine_3', 'machine_4',
  'machine_5', 'machine_6', 'machine_7', 'machine_8',
]

const RECIPE_IDS: string[] = [
  'wheel_press_small', 'wheel_press_medium', 'wheel_press_large',
  'sensor_fab_proximity', 'sensor_fab_camera', 'sensor_fab_lidar',
  'battery_assembly_standard', 'battery_assembly_high',
  'chassis_stamper_light', 'chassis_stamper_heavy',
  'circuit_printer_basic', 'circuit_printer_advanced',
  'assemble_drivetrain_basic', 'assemble_drivetrain_advanced',
  'assemble_sensor_array_basic', 'assemble_sensor_array_advanced',
  'assemble_power_unit_standard', 'assemble_power_unit_high',
  'assemble_robot_explorer', 'assemble_robot_worker', 'assemble_robot_guardian',
]

const BELT_IDS: string[] = [
  'belt_1', 'belt_2', 'belt_3', 'belt_4',
  'belt_5', 'belt_6', 'belt_7', 'belt_8',
]

// --- Enum name-to-number maps (for string args from fallback textarea) ---

const MACHINE_NAME_MAP: Record<string, number> = {
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7,
}

const PART_TYPE_NAME_MAP: Record<string, number> = {
  WheelSmall: 0, WheelMedium: 1, WheelLarge: 2,
  SensorProximity: 3, SensorCamera: 4, SensorLidar: 5,
  BatteryStandard: 6, BatteryHighCapacity: 7,
  ChassisLight: 8, ChassisHeavy: 9,
  CircuitBasic: 10, CircuitAdvanced: 11,
  DrivetrainBasic: 12, DrivetrainAdvanced: 13,
  SensorArrayBasic: 14, SensorArrayAdvanced: 15,
  PowerUnitStandard: 16, PowerUnitHigh: 17,
  RawMaterial: 18,
  RobotExplorer: 19, RobotWorker: 20, RobotGuardian: 21,
}

const RECIPE_NAME_MAP: Record<string, number> = {
  WheelPressSmall: 0, WheelPressMedium: 1, WheelPressLarge: 2,
  SensorFabProximity: 3, SensorFabCamera: 4, SensorFabLidar: 5,
  BatteryAssemblyStandard: 6, BatteryAssemblyHigh: 7,
  ChassisStamperLight: 8, ChassisStamperHeavy: 9,
  CircuitPrinterBasic: 10, CircuitPrinterAdvanced: 11,
  AssembleDrivetrainBasic: 12, AssembleDrivetrainAdvanced: 13,
  AssembleSensorArrayBasic: 14, AssembleSensorArrayAdvanced: 15,
  AssemblePowerUnitStandard: 16, AssemblePowerUnitHigh: 17,
  AssembleRobotExplorer: 18, AssembleRobotWorker: 19, AssembleRobotGuardian: 20,
}

const BELT_NAME_MAP: Record<string, number> = {
  Belt1: 0, Belt2: 1, Belt3: 2, Belt4: 3,
  Belt5: 4, Belt6: 5, Belt7: 6, Belt8: 7,
}

// --- Enum objects provided to executed code (for fallback textarea) -------

const MachineEnum: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7 }
const PartTypeEnum: Record<string, number> = { ...PART_TYPE_NAME_MAP }
const RecipeEnum: Record<string, number> = { ...RECIPE_NAME_MAP }
const BeltEnum: Record<string, number> = { ...BELT_NAME_MAP }
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
 * variables_, functions_, events, factory) and enum objects (Machine,
 * PartType, Recipe, Belt, FactoryCondition) to the executed code.
 *
 * Enforces a hard cap of 10,000 operations per interpret() call.
 * Variable store persists across calls; use reset() to clear it.
 */
export class BlockInterpreter {
  private commands: SimulationCommand[] = []
  private opCount = 0
  private overflow = false
  private variables = new Map<string, number>()
  private procedures = new Map<string, () => void>()
  private eventHandlers = new Map<string, () => void>()
  private callDepth = 0
  private dynamicMachines: Array<{slotIndex: number, id: string, name: string}> = []
  private dynamicBelts: Array<{slotIndex: number, id: string}> = []

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
    routeTo: (target: unknown) => {
      if (this.guardOverflow()) return
      this.commands.push({ type: 'ROUTE_TO', targetId: this.resolveMachineId(target) })
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
  }

  private readonly logicNs = {
    ifQuality: (_threshold: unknown, body: () => void) => {
      body()
    },
    ifItemType: (_itemType: unknown, body: () => void) => {
      body()
    },
  }

  private readonly variablesNs = {
    setVariable: (name: unknown, value: unknown) => {
      if (this.guardOverflow()) return
      const n = String(name)
      if (n) this.variables.set(n, Number(value) || 0)
    },
    changeVariable: (name: unknown, delta: unknown) => {
      if (this.guardOverflow()) return
      const n = String(name)
      if (n) {
        const current = this.variables.get(n) ?? 0
        this.variables.set(n, current + (Number(delta) || 0))
      }
    },
  }

  private readonly functionsNs = {
    defineProcedure: (name: unknown, body: () => void) => {
      const n = String(name)
      if (n && typeof body === 'function') {
        this.procedures.set(n, body)
      }
    },
    callProcedure: (name: unknown) => {
      if (this.guardOverflow()) return
      const n = String(name)
      const proc = this.procedures.get(n)
      if (proc && this.callDepth < MAX_CALL_DEPTH) {
        this.callDepth++
        proc()
        this.callDepth--
      }
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
   */
  private readonly factoryNs = {
    PartType: PartTypeEnum,
    Machine: MachineEnum,
    Recipe: RecipeEnum,
    Belt: BeltEnum,
    FactoryCondition: FactoryConditionEnum,
    setRecipe: (machine: unknown, recipe: unknown) => {
      this.machinesNs.setRecipe(machine, recipe)
    },
    startMachine: (machine: unknown) => {
      this.machinesNs.startMachine(machine)
    },
    stopMachine: (machine: unknown) => {
      this.machinesNs.stopMachine(machine)
    },
    setBeltSpeed: (belt: unknown, speed: unknown) => {
      this.beltsNs.setBeltSpeed(belt, speed)
    },
    routeTo: (target: unknown) => {
      this.beltsNs.routeTo(target)
    },
    repeatTimes: (count: unknown, body: () => void) => {
      this.loopsNs.repeatTimes(count, body)
    },
    whileCondition: (condition: unknown, body: () => void) => {
      this.loopsNs.whileCondition(condition, body)
    },
    ifQuality: (threshold: unknown, body: () => void) => {
      this.logicNs.ifQuality(threshold, body)
    },
    ifItemType: (itemType: unknown, body: () => void) => {
      this.logicNs.ifItemType(itemType, body)
    },
    setVariable: (name: unknown, value: unknown) => {
      this.variablesNs.setVariable(name, value)
    },
    changeVariable: (name: unknown, delta: unknown) => {
      this.variablesNs.changeVariable(name, delta)
    },
    defineProcedure: (name: unknown, body: () => void) => {
      this.functionsNs.defineProcedure(name, body)
    },
    callProcedure: (name: unknown) => {
      this.functionsNs.callProcedure(name)
    },
    onOrderReceived: (body: () => void) => {
      this.eventsNs.onOrderReceived(body)
    },
    onBeltJam: (body: () => void) => {
      this.eventsNs.onBeltJam(body)
    },
    onMachineIdle: (machine: unknown, body: () => void) => {
      this.eventsNs.onMachineIdle(machine, body)
    },
    setQualityThreshold: (machine: unknown, threshold: unknown) => {
      this.machinesNs.setQualityThreshold(machine, threshold)
    },
  }

  // --- Public API --------------------------------------------------------

  interpret(source: string): SimulationCommand[] {
    this.opCount = 0
    this.overflow = false
    this.commands = []
    this.procedures.clear()
    this.eventHandlers.clear()
    this.callDepth = 0

    const clean = this.stripComments(source)

    try {
      const fn = new Function(
        'machines', 'recipes', 'belts', 'loops', 'logic',
        'variables_', 'functions_', 'events', 'factory',
        'Machine', 'PartType', 'Recipe', 'Belt', 'FactoryCondition',
        '"use strict";\n' + clean,
      )
      fn(
        this.machinesNs, this.recipesNs, this.beltsNs, this.loopsNs, this.logicNs,
        this.variablesNs, this.functionsNs, this.eventsNs, this.factoryNs,
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

  getVariable(name: string): number {
    return this.variables.get(name) ?? 0
  }

  reset(): void {
    this.overflow = false
    this.opCount = 0
    this.variables.clear()
    this.procedures.clear()
    this.eventHandlers.clear()
    this.callDepth = 0
  }

  // --- Dynamic machine/belt list management ------------------------------

  setMachineList(machines: Array<{slotIndex: number, id: string, name: string}>): void {
    this.dynamicMachines = [...machines]
  }

  setBeltList(belts: Array<{slotIndex: number, id: string}>): void {
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
