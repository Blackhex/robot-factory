import type {
  SimulationCommand,
  SimulationEvent,
  SimulationEventType,
} from './types.ts'
import { Machine } from './Machine.ts'
import { ConveyorBelt } from './ConveyorBelt.ts'
import { getRecipeById, getRecipeByOutputType } from './Recipe.ts'

type SimEventHandler = (event: SimulationEvent) => void

const DEFAULT_TICK_RATE = 10 // ticks per second

export interface SimulationStats {
  itemsProduced: number
  robotsCompleted: number
  timeElapsed: number
  qualityPercent: number
  outputsDelivered: number
}

export class Simulation {
  private machines: Map<string, Machine> = new Map()
  private belts: Map<string, ConveyorBelt> = new Map()
  private handlers: Map<SimulationEventType, SimEventHandler[]> = new Map()
  private commandQueue: SimulationCommand[] = []
  private intervalId: ReturnType<typeof setInterval> | null = null
  private _running = false
  private _paused = false

  currentTick = 0
  readonly tickRate: number

  // Scoring accumulators
  itemsProduced = 0
  itemsDelivered = 0
  outputsDelivered = 0
  robotsProduced = 0
  defects = 0
  totalIdleTicks = 0

  // Machine output → belt connections
  private primaryOutputBelts: Map<string, string> = new Map()
  private secondaryOutputBelts: Map<string, string> = new Map()

  constructor(tickRate = DEFAULT_TICK_RATE) {
    this.tickRate = tickRate
  }

  // --- Entity management ---

  addMachine(machine: Machine): void {
    this.machines.set(machine.id, machine)
  }

  removeMachine(id: string): boolean {
    return this.machines.delete(id)
  }

  getMachine(id: string): Machine | undefined {
    return this.machines.get(id)
  }

  getMachines(): ReadonlyMap<string, Machine> {
    return this.machines
  }

  addBelt(belt: ConveyorBelt): void {
    this.belts.set(belt.id, belt)
  }

  removeBelt(id: string): boolean {
    return this.belts.delete(id)
  }

  getBelt(id: string): ConveyorBelt | undefined {
    return this.belts.get(id)
  }

  getBelts(): ReadonlyMap<string, ConveyorBelt> {
    return this.belts
  }

  // --- Output belt connections ---

  setMachineOutputBelt(machineId: string, beltId: string, port: 'primary' | 'secondary' = 'primary'): void {
    if (port === 'primary') {
      this.primaryOutputBelts.set(machineId, beltId)
    } else {
      this.secondaryOutputBelts.set(machineId, beltId)
    }
  }

  // --- Command queue ---

  enqueueCommand(command: SimulationCommand): void {
    this.commandQueue.push(command)
  }

  enqueueCommands(commands: SimulationCommand[]): void {
    this.commandQueue.push(...commands)
  }

  // --- Simulation control ---

  start(): void {
    if (this._running) return
    this._running = true
    this._paused = false
    this.intervalId = setInterval(() => {
      if (!this._paused) {
        this.tick()
      }
    }, 1000 / this.tickRate)
  }

  stop(): void {
    this._running = false
    this._paused = false
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  pause(): void {
    this._paused = true
  }

  resume(): void {
    this._paused = false
  }

  get running(): boolean {
    return this._running
  }

  get paused(): boolean {
    return this._paused
  }

  // --- Tick ---

  tick(): void {
    this.processCommands()
    this.updateMachines()
    this.transferMachineOutputs()
    this.advanceBelts()
    this.deliverItems()
    this.updateScoring()
    this.emit('tick', { tick: this.currentTick })
    this.currentTick++
  }

  private processCommands(): void {
    const commands = this.commandQueue.splice(0)
    for (const command of commands) {
      this.executeCommand(command)
    }
  }

  executeCommand(command: SimulationCommand): void {
    switch (command.type) {
      case 'SET_RECIPE': {
        const machine = this.machines.get(command.machineId)
        const recipe = getRecipeById(command.recipeId)
        if (machine && recipe) {
          machine.setRecipe(recipe)
        }
        break
      }
      case 'START_MACHINE': {
        // Machine will auto-start processing on next tick if recipe + inputs ready
        break
      }
      case 'STOP_MACHINE': {
        const machine = this.machines.get(command.machineId)
        if (machine) {
          machine.currentRecipe = null
        }
        break
      }
      case 'PRODUCE_PART': {
        const machine = this.machines.get(command.machineId)
        const recipe =
          getRecipeById(command.partType) ??
          getRecipeByOutputType(command.partType)
        if (machine && recipe) {
          machine.setRecipe(recipe)
        }
        break
      }
      case 'SET_BELT_SPEED': {
        const belt = this.belts.get(command.beltId)
        if (belt) {
          belt.speed = command.speed
        }
        break
      }
      case 'SET_QUALITY_THRESHOLD': {
        const machine = this.machines.get(command.machineId)
        if (machine && machine.machineType === 'quality_checker') {
          machine.qualityThreshold = command.threshold
        }
        break
      }
      case 'SET_SPLITTER_CONDITION': {
        const machine = this.machines.get(command.machineId)
        if (machine && machine.machineType === 'splitter') {
          machine.splitterCondition = command.condition
        }
        break
      }
      case 'ROUTE_TO': {
        // Routing configuration handled externally via setMachineOutputBelt
        break
      }
    }
  }

  private updateMachines(): void {
    for (const machine of this.machines.values()) {
      const prevState = machine.state
      const prevOutput = machine.outputSlot
      const prevSecondary = machine.secondaryOutputSlot
      machine.tick()
      if (machine.state !== prevState) {
        this.emit('machine_state_changed', {
          machineId: machine.id,
          from: prevState,
          to: machine.state,
        })
      }
      if (machine.outputSlot && machine.outputSlot !== prevOutput) {
        this.itemsProduced++
        this.emit('item_produced', {
          machineId: machine.id,
          itemId: machine.outputSlot.id,
          itemType: machine.outputSlot.type,
        })
      }
      if (machine.secondaryOutputSlot && machine.secondaryOutputSlot !== prevSecondary) {
        this.itemsProduced++
        this.emit('item_produced', {
          machineId: machine.id,
          itemId: machine.secondaryOutputSlot.id,
          itemType: machine.secondaryOutputSlot.type,
          output: 'secondary',
        })
      }
    }
  }

  private transferMachineOutputs(): void {
    for (const machine of this.machines.values()) {
      // Transfer primary output to connected belt
      if (machine.outputSlot) {
        const beltId = this.primaryOutputBelts.get(machine.id)
        if (beltId) {
          const belt = this.belts.get(beltId)
          if (belt && belt.addItem(machine.outputSlot)) {
            machine.takeOutput()
          }
        }
      }
      // Transfer secondary output to connected belt
      if (machine.secondaryOutputSlot) {
        const beltId = this.secondaryOutputBelts.get(machine.id)
        if (beltId) {
          const belt = this.belts.get(beltId)
          if (belt && belt.addItem(machine.secondaryOutputSlot)) {
            machine.takeSecondaryOutput()
          }
        }
      }
    }
  }

  private advanceBelts(): void {
    const dt = 1 / this.tickRate
    for (const belt of this.belts.values()) {
      belt.advance(dt)
    }
  }

  private deliverItems(): void {
    for (const belt of this.belts.values()) {
      const readyItems = belt.getReadyItems()
      for (const item of readyItems) {
        // First, try to deliver to a machine at the belt's destination
        const targetMachine = this.findMachineAt(belt.toX, belt.toZ)
        if (targetMachine && targetMachine.canAcceptInput()) {
          targetMachine.addInput(item)
          belt.removeItem(item.id)
          this.itemsDelivered++
          this.emit('item_delivered', {
            itemId: item.id,
            beltId: belt.id,
            machineId: targetMachine.id,
          })
          if (targetMachine.machineType === 'factory_output') {
            this.outputsDelivered++
            this.emit('output_delivered', {
              itemId: item.id,
              itemType: item.type,
              machineId: targetMachine.id,
            })
          }
          continue
        }

        // No machine (or machine full) — try to transfer to a belt starting here
        const nextBelt = this.findBeltStartingAt(belt.toX, belt.toZ)
        if (nextBelt && nextBelt.id !== belt.id) {
          if (nextBelt.addItem(item)) {
            belt.removeItem(item.id)
          }
        }
        // If neither machine nor next belt, item stays (belt jam)
      }
    }
  }

  /** Find a belt whose start position matches the given coordinates. */
  private findBeltStartingAt(x: number, z: number): ConveyorBelt | undefined {
    for (const belt of this.belts.values()) {
      if (belt.fromX === x && belt.fromZ === z) {
        return belt
      }
    }
    return undefined
  }

  private findMachineAt(x: number, z: number): Machine | undefined {
    for (const machine of this.machines.values()) {
      if (this.machinePositions.get(machine.id)?.x === x &&
          this.machinePositions.get(machine.id)?.z === z) {
        return machine
      }
    }
    return undefined
  }

  // Machine position map (set from Factory grid data)
  private machinePositions: Map<string, { x: number; z: number }> = new Map()

  setMachinePosition(machineId: string, x: number, z: number): void {
    this.machinePositions.set(machineId, { x, z })
  }

  private updateScoring(): void {
    for (const machine of this.machines.values()) {
      if (machine.state === 'idle' && machine.currentRecipe !== null) {
        this.totalIdleTicks++
      }
    }
  }

  // --- Event emitter ---

  on(type: SimulationEventType, handler: SimEventHandler): void {
    const list = this.handlers.get(type)
    if (list) {
      list.push(handler)
    } else {
      this.handlers.set(type, [handler])
    }
  }

  off(type: SimulationEventType, handler: SimEventHandler): void {
    const list = this.handlers.get(type)
    if (!list) return
    const idx = list.indexOf(handler)
    if (idx !== -1) {
      list.splice(idx, 1)
    }
  }

  private emit(type: SimulationEventType, data: Record<string, unknown>): void {
    const event: SimulationEvent = { type, tick: this.currentTick, data }
    const list = this.handlers.get(type)
    if (list) {
      for (const handler of list) {
        handler(event)
      }
    }
  }

  // --- Stats ---

  getStats(): SimulationStats {
    const total = this.robotsProduced + this.defects
    return {
      itemsProduced: this.itemsProduced,
      robotsCompleted: this.robotsProduced,
      timeElapsed: this.currentTick / this.tickRate,
      qualityPercent: total > 0 ? (this.robotsProduced / total) * 100 : 100,
      outputsDelivered: this.outputsDelivered,
    }
  }

  // --- Reset ---

  reset(): void {
    this.stop()
    this.machines.clear()
    this.belts.clear()
    this.machinePositions.clear()
    this.primaryOutputBelts.clear()
    this.secondaryOutputBelts.clear()
    this.commandQueue.length = 0
    this.currentTick = 0
    this.itemsProduced = 0
    this.itemsDelivered = 0
    this.outputsDelivered = 0
    this.robotsProduced = 0
    this.defects = 0
    this.totalIdleTicks = 0
  }
}
