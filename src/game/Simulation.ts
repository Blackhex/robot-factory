import type {
  GameOverInfo,
  SimulationCommand,
  SimulationEvent,
  SimulationEventType,
} from './types.ts'
import { Machine } from './Machine.ts'
import { ConveyorBelt } from './ConveyorBelt.ts'
import { ItemDeliveryEngine } from './ItemDeliveryEngine.ts'
import { SimulationCommandDispatcher } from './SimulationCommandDispatcher.ts'
import { CommandQueueRunner } from './CommandQueueRunner.ts'

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
  private intervalId: ReturnType<typeof setInterval> | null = null
  private _running = false
  private _paused = false
  private _gameOver: GameOverInfo | null = null
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

  private readonly commandDispatcher: SimulationCommandDispatcher
  private readonly queueRunner: CommandQueueRunner
  private readonly deliveryEngine: ItemDeliveryEngine

  constructor(tickRate = DEFAULT_TICK_RATE) {
    this.tickRate = tickRate
    this.commandDispatcher = new SimulationCommandDispatcher({
      getMachine: (id) => this.machines.get(id),
      getBelt: (id) => this.belts.get(id),
      getBelts: () => this.belts,
    })
    this.queueRunner = new CommandQueueRunner(this.commandDispatcher)
    this.deliveryEngine = new ItemDeliveryEngine({
      getBelts: () => this.belts,
      findMachineAt: (x, z) => this.findMachineAt(x, z),
      findBeltStartingAt: (x, z) => this.findBeltStartingAt(x, z),
    })
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
    this.queueRunner.enqueue(command)
  }

  enqueueCommands(commands: SimulationCommand[]): void {
    this.queueRunner.enqueueAll(commands)
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
    this.queueRunner.clear()
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

  /** Fatal game-over state, or `null` while the simulation runs normally. */
  get gameOver(): GameOverInfo | null {
    return this._gameOver
  }

  // --- Tick ---

  tick(): void {
    if (this._gameOver !== null) return
    this.queueRunner.tick()
    this.updateMachines()
    this.advanceBelts()
    this.runDelivery()
    this.transferMachineOutputs()
    this.updateScoring()
    this.emit('tick', { tick: this.currentTick })
    this.currentTick++
  }

  /** Shim — delegates to `SimulationCommandDispatcher`. WAIT commands are silently filtered (queue-level control, never dispatched). */
  executeCommand(command: SimulationCommand): void {
    if (command.type !== 'WAIT') this.commandDispatcher.execute(command)
  }
  private runDelivery(): void {
    const result = this.deliveryEngine.deliver(this.currentTick, this._gameOver)
    this.itemsDelivered += result.itemsDelivered
    this.outputsDelivered += result.outputsDelivered
    this.robotsProduced += result.robotsProduced
    if (result.newGameOver !== null && this._gameOver === null) {
      this._gameOver = result.newGameOver
      this._paused = true
    }
    for (const event of result.events) {
      this.emit(event.type, event.data)
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
        if (machine.machineType === 'quality_checker') {
          this.defects++
        }
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
      const pos = this.machinePositions.get(machine.id)
      if (pos?.x === x && pos?.z === z) return machine
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

  /** Soft reset: clear runtime state but preserve factory layout. */
  clearInFlight(): void {
    this.stop()
    for (const belt of this.belts.values()) {
      belt.clear()
    }
    for (const machine of this.machines.values()) {
      machine.clearRuntimeState()
    }
    this.queueRunner.clear()
    this.currentTick = 0
    this.itemsProduced = 0
    this.itemsDelivered = 0
    this.outputsDelivered = 0
    this.robotsProduced = 0
    this.defects = 0
    this.totalIdleTicks = 0
    this._gameOver = null
  }

  reset(): void {
    this.clearInFlight()
    this.machines.clear()
    this.belts.clear()
    this.machinePositions.clear()
    this.primaryOutputBelts.clear()
    this.secondaryOutputBelts.clear()
  }
}
