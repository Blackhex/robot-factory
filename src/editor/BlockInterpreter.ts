import type { SimulationCommand } from '../game/types'

const MAX_OPERATIONS = 10_000
const MAX_CALL_DEPTH = 100

/** Maps PascalCase PartType enum values to snake_case ItemType strings. */
const PART_TYPE_MAP: Record<string, string> = {
  WheelSmall: 'wheel_small',
  WheelMedium: 'wheel_medium',
  WheelLarge: 'wheel_large',
  SensorProximity: 'sensor_proximity',
  SensorCamera: 'sensor_camera',
  SensorLidar: 'sensor_lidar',
  BatteryStandard: 'battery_standard',
  BatteryHighCapacity: 'battery_high_capacity',
  ChassisLight: 'chassis_light',
  ChassisHeavy: 'chassis_heavy',
  CircuitBasic: 'circuit_basic',
  CircuitAdvanced: 'circuit_advanced',
  DrivetrainBasic: 'drivetrain_basic',
  DrivetrainAdvanced: 'drivetrain_advanced',
  SensorArrayBasic: 'sensor_array_basic',
  SensorArrayAdvanced: 'sensor_array_advanced',
  PowerUnitStandard: 'power_unit_standard',
  PowerUnitHigh: 'power_unit_high',
  RobotExplorer: 'robot_explorer',
  RobotWorker: 'robot_worker',
  RobotGuardian: 'robot_guardian',
  RawMaterial: 'raw_material',
}

/** Maps Machine enum values to runtime machine IDs. */
const MACHINE_MAP: Record<string, string> = {
  A: 'machine_1', B: 'machine_2', C: 'machine_3', D: 'machine_4',
  E: 'machine_5', F: 'machine_6', G: 'machine_7', H: 'machine_8',
}

/** Maps Recipe enum values to recipe IDs matching Recipe.ts definitions. */
const RECIPE_MAP: Record<string, string> = {
  WheelPressSmall: 'wheel_press_small',
  WheelPressMedium: 'wheel_press_medium',
  WheelPressLarge: 'wheel_press_large',
  SensorFabProximity: 'sensor_fab_proximity',
  SensorFabCamera: 'sensor_fab_camera',
  SensorFabLidar: 'sensor_fab_lidar',
  BatteryAssemblyStandard: 'battery_assembly_standard',
  BatteryAssemblyHigh: 'battery_assembly_high',
  ChassisStamperLight: 'chassis_stamper_light',
  ChassisStamperHeavy: 'chassis_stamper_heavy',
  CircuitPrinterBasic: 'circuit_printer_basic',
  CircuitPrinterAdvanced: 'circuit_printer_advanced',
  AssembleDrivetrainBasic: 'assemble_drivetrain_basic',
  AssembleDrivetrainAdvanced: 'assemble_drivetrain_advanced',
  AssembleSensorArrayBasic: 'assemble_sensor_array_basic',
  AssembleSensorArrayAdvanced: 'assemble_sensor_array_advanced',
  AssemblePowerUnitStandard: 'assemble_power_unit_standard',
  AssemblePowerUnitHigh: 'assemble_power_unit_high',
  AssembleRobotExplorer: 'assemble_robot_explorer',
  AssembleRobotWorker: 'assemble_robot_worker',
  AssembleRobotGuardian: 'assemble_robot_guardian',
}

/** Maps Belt enum values to runtime belt IDs. */
const BELT_MAP: Record<string, string> = {
  Belt1: 'belt_1', Belt2: 'belt_2', Belt3: 'belt_3', Belt4: 'belt_4',
  Belt5: 'belt_5', Belt6: 'belt_6', Belt7: 'belt_7', Belt8: 'belt_8',
}

function resolvePartType(raw: string): string {
  const stripped = parseStringArg(raw)
  const name = stripped.replace(/^(factory\.|PartType\.)*/g, '')
  return PART_TYPE_MAP[name] ?? name
}

function resolveMachine(raw: string): string {
  const stripped = parseStringArg(raw)
  const name = stripped.replace(/^(Machine\.)/, '')
  return MACHINE_MAP[name] ?? stripped
}

function resolveRecipe(raw: string): string {
  const stripped = parseStringArg(raw)
  const name = stripped.replace(/^(Recipe\.)/, '')
  return RECIPE_MAP[name] ?? stripped
}

function resolveBelt(raw: string): string {
  const stripped = parseStringArg(raw)
  const name = stripped.replace(/^(Belt\.)/, '')
  return BELT_MAP[name] ?? stripped
}

function parseStringArg(raw: string): string {
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

interface FactoryCall {
  method: string
  argsRaw: string
}

/**
 * Parses PXT-compiled TypeScript source into SimulationCommand[].
 *
 * Recognises `factory.xxx(...)` calls line-by-line with brace-matching
 * for compound statements (repeat, if, events, procedures).
 *
 * Enforces a hard cap of 10 000 operations per interpret() call.
 * Variable store persists across calls; use reset() to clear it.
 */
export class BlockInterpreter {
  private opCount = 0
  private overflow = false
  private variables = new Map<string, number>()
  private procedures = new Map<string, string>()
  private eventHandlers = new Map<string, string>()
  private callDepth = 0

  /**
   * Parse TypeScript source and produce simulation commands.
   *
   * First pass registers procedure definitions and event handlers.
   * Second pass executes all other top-level factory calls.
   */
  interpret(source: string): SimulationCommand[] {
    this.opCount = 0
    this.overflow = false
    this.procedures.clear()
    this.eventHandlers.clear()
    this.callDepth = 0

    const clean = this.stripComments(source)
    const calls = this.extractTopLevelCalls(clean)

    // First pass: register definitions and event handlers
    for (const call of calls) {
      this.registerDefinition(call)
    }

    // Second pass: execute non-definition calls
    const commands: SimulationCommand[] = []
    for (const call of calls) {
      if (this.overflow) break
      if (this.isDefinitionCall(call.method)) continue
      this.executeCall(call, commands)
    }

    return commands
  }

  /** Alias kept for clarity in callers. */
  parseTypeScript(source: string): SimulationCommand[] {
    return this.interpret(source)
  }

  /**
   * Trigger a registered event handler and return the commands
   * produced by its body. Each trigger gets its own op budget.
   */
  triggerEvent(eventType: string): SimulationCommand[] {
    this.opCount = 0
    this.overflow = false

    const body = this.eventHandlers.get(eventType)
    if (!body) return []

    const commands: SimulationCommand[] = []
    this.executeBody(body, commands)
    return commands
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

  // --- private helpers ---------------------------------------------------

  private stripComments(source: string): string {
    return source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
  }

  /**
   * Extract top-level `namespace.method(args)` calls from source.
   * Recognises: machines., recipes., belts., loops., logic.,
   * variables_., functions_., events., and legacy factory.
   */
  private extractTopLevelCalls(source: string): FactoryCall[] {
    const calls: FactoryCall[] = []
    const prefixes = [
      'machines.', 'recipes.', 'belts.', 'loops.', 'logic.',
      'variables_.', 'functions_.', 'events.', 'factory.',
    ]

    let pos = 0
    while (pos < source.length) {
      // Find the earliest namespace prefix
      let earliest = -1
      let prefixLen = 0
      for (const prefix of prefixes) {
        const idx = source.indexOf(prefix, pos)
        if (idx !== -1 && (earliest === -1 || idx < earliest)) {
          earliest = idx
          prefixLen = prefix.length
        }
      }
      if (earliest === -1) break

      pos = earliest + prefixLen

      const nameMatch = source.substring(pos).match(/^(\w+)\s*\(/)
      if (!nameMatch) { pos++; continue }

      const method = nameMatch[1]
      pos += nameMatch[0].length

      // pos is right after the opening paren — find matching close
      const argsStart = pos
      let depth = 1

      while (pos < source.length && depth > 0) {
        const ch = source[pos]
        if (ch === '(') depth++
        else if (ch === ')') { depth--; if (depth === 0) break }
        else if (ch === '"' || ch === "'" || ch === '`') {
          const quote = ch
          pos++
          while (pos < source.length && source[pos] !== quote) {
            if (source[pos] === '\\') pos++
            pos++
          }
        }
        pos++
      }

      calls.push({ method, argsRaw: source.substring(argsStart, pos) })
      pos++ // skip closing paren
    }

    return calls
  }

  /** Execute a callback body (for repeat, if, etc.) without re-registering defs. */
  private executeBody(source: string, commands: SimulationCommand[]): void {
    const clean = this.stripComments(source)
    const calls = this.extractTopLevelCalls(clean)
    for (const call of calls) {
      if (this.overflow) break
      this.executeCall(call, commands)
    }
  }

  /** Extract the function body from an argsRaw string: `..., function () { BODY }` */
  private extractCallbackBody(argsRaw: string): string | null {
    let funcIdx = argsRaw.indexOf('function')
    if (funcIdx === -1) {
      // Try arrow function: `() => { ... }`
      funcIdx = argsRaw.indexOf('=>')
      if (funcIdx === -1) return null
    }

    const braceStart = argsRaw.indexOf('{', funcIdx)
    if (braceStart === -1) return null

    let depth = 1
    let pos = braceStart + 1

    while (pos < argsRaw.length && depth > 0) {
      const ch = argsRaw[pos]
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) break }
      else if (ch === '"' || ch === "'" || ch === '`') {
        const q = ch
        pos++
        while (pos < argsRaw.length && argsRaw[pos] !== q) {
          if (argsRaw[pos] === '\\') pos++
          pos++
        }
      }
      pos++
    }

    return argsRaw.substring(braceStart + 1, pos)
  }

  /** Extract simple (non-callback) arguments before the function keyword. */
  private extractSimpleArgs(argsRaw: string): string[] {
    // Cut off everything starting from 'function' or '=>'
    let cutoff = argsRaw.length
    const funcIdx = argsRaw.indexOf('function')
    const arrowIdx = argsRaw.indexOf('=>')

    if (funcIdx !== -1) {
      const comma = argsRaw.lastIndexOf(',', funcIdx)
      cutoff = comma !== -1 ? comma : 0
    } else if (arrowIdx !== -1) {
      const comma = argsRaw.lastIndexOf(',', arrowIdx)
      cutoff = comma !== -1 ? comma : 0
    }

    const simple = argsRaw.substring(0, cutoff).trim()
    if (!simple) return []

    return simple.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  }

  private isDefinitionCall(method: string): boolean {
    return (
      method === 'defineProcedure' ||
      method === 'onOrderReceived' ||
      method === 'onBeltJam' ||
      method === 'onMachineIdle'
    )
  }

  private registerDefinition(call: FactoryCall): void {
    const body = this.extractCallbackBody(call.argsRaw)

    switch (call.method) {
      case 'defineProcedure': {
        const args = this.extractSimpleArgs(call.argsRaw)
        const name = args.length >= 1 ? parseStringArg(args[0]) : ''
        if (name && body != null) {
          this.procedures.set(name, body)
        }
        break
      }
      case 'onOrderReceived':
        if (body != null) this.eventHandlers.set('order_received', body)
        break
      case 'onBeltJam':
        if (body != null) this.eventHandlers.set('belt_jam', body)
        break
      case 'onMachineIdle': {
        const args = this.extractSimpleArgs(call.argsRaw)
        const machine = args.length >= 1 ? resolveMachine(args[0]) : ''
        if (body != null) this.eventHandlers.set(`machine_idle_${machine}`, body)
        break
      }
    }
  }

  private executeCall(call: FactoryCall, commands: SimulationCommand[]): void {
    if (this.opCount >= MAX_OPERATIONS) {
      this.overflow = true
      return
    }
    this.opCount++

    switch (call.method) {
      // === Actions ===
      case 'producePart': {
        const args = this.extractSimpleArgs(call.argsRaw)
        let machineId = ''
        let partType = ''
        if (args.length >= 2) {
          machineId = resolveMachine(args[0])
          partType = resolvePartType(args[1])
        } else if (args.length === 1) {
          partType = resolvePartType(args[0])
        }
        commands.push({
          type: 'PRODUCE_PART',
          machineId,
          partType,
        } as SimulationCommand)
        break
      }

      case 'setRecipe': {
        const args = this.extractSimpleArgs(call.argsRaw)
        commands.push({
          type: 'SET_RECIPE',
          machineId: args.length >= 1 ? resolveMachine(args[0]) : '',
          recipeId: args.length >= 2 ? resolveRecipe(args[1]) : '',
        })
        break
      }

      case 'startMachine': {
        const args = this.extractSimpleArgs(call.argsRaw)
        commands.push({
          type: 'START_MACHINE',
          machineId: args.length >= 1 ? resolveMachine(args[0]) : '',
        })
        break
      }

      case 'stopMachine': {
        const args = this.extractSimpleArgs(call.argsRaw)
        commands.push({
          type: 'STOP_MACHINE',
          machineId: args.length >= 1 ? resolveMachine(args[0]) : '',
        })
        break
      }

      case 'setBeltSpeed': {
        const args = this.extractSimpleArgs(call.argsRaw)
        commands.push({
          type: 'SET_BELT_SPEED',
          beltId: args.length >= 1 ? resolveBelt(args[0]) : '',
          speed: args.length >= 2 ? Number(args[1]) || 1 : 1,
        })
        break
      }

      case 'routeTo': {
        const args = this.extractSimpleArgs(call.argsRaw)
        commands.push({
          type: 'ROUTE_TO',
          targetId: args.length >= 1 ? resolveMachine(args[0]) : '',
        })
        break
      }

      // === Loops ===
      case 'repeatTimes': {
        const args = this.extractSimpleArgs(call.argsRaw)
        const count = args.length >= 1 ? Number(args[0]) || 0 : 0
        const body = this.extractCallbackBody(call.argsRaw)
        if (body) {
          for (let i = 0; i < count; i++) {
            if (this.overflow) return
            this.executeBody(body, commands)
          }
        }
        break
      }

      case 'whileCondition': {
        const body = this.extractCallbackBody(call.argsRaw)
        if (body) {
          while (!this.overflow) {
            if (this.opCount >= MAX_OPERATIONS) {
              this.overflow = true
              return
            }
            this.executeBody(body, commands)
          }
        }
        break
      }

      // === Conditionals ===
      case 'ifQuality': {
        // Runtime condition — execute body by default
        const body = this.extractCallbackBody(call.argsRaw)
        if (body) this.executeBody(body, commands)
        break
      }

      case 'ifItemType': {
        // Runtime condition — execute body by default
        const body = this.extractCallbackBody(call.argsRaw)
        if (body) this.executeBody(body, commands)
        break
      }

      // === Variables ===
      case 'setVariable': {
        const args = this.extractSimpleArgs(call.argsRaw)
        const name = args.length >= 1 ? parseStringArg(args[0]) : ''
        const value = args.length >= 2 ? Number(args[1]) || 0 : 0
        if (name) this.variables.set(name, value)
        break
      }

      case 'changeVariable': {
        const args = this.extractSimpleArgs(call.argsRaw)
        const name = args.length >= 1 ? parseStringArg(args[0]) : ''
        const delta = args.length >= 2 ? Number(args[1]) || 0 : 0
        if (name) {
          const current = this.variables.get(name) ?? 0
          this.variables.set(name, current + delta)
        }
        break
      }

      // === Functions ===
      case 'callProcedure': {
        const args = this.extractSimpleArgs(call.argsRaw)
        const name = args.length >= 1 ? parseStringArg(args[0]) : ''
        const procBody = this.procedures.get(name)
        if (procBody && this.callDepth < MAX_CALL_DEPTH) {
          this.callDepth++
          this.executeBody(procBody, commands)
          this.callDepth--
        }
        break
      }

      default:
        break
    }
  }
}
