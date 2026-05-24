import type { GameOverInfo, MachineOutputPort, SimulationCommand, SimulationEvent, SimulationEventType } from './types.ts'
import { OUTPUT_PORTS, SLOT_FIELD } from './types.ts'
import { Machine } from './Machine.ts'
import { ConveyorBelt } from './ConveyorBelt.ts'
import { ItemDeliveryEngine } from './ItemDeliveryEngine.ts'
import { SimulationCommandDispatcher } from './SimulationCommandDispatcher.ts'
import { CommandQueueRunner } from './CommandQueueRunner.ts'
import { detectNoRecipeStart } from './NoRecipeGuard.ts'
import { detectStarvation, type StarvationContext } from './StarvationGuard.ts'
import { areRecipeDependenciesSatisfied as analyzeRecipeDependencies } from './BadgeSatisfiabilityAnalyzer.ts'
import type { Item } from './Item.ts'

// Public bridge types — wired by the editor / wireSimulationEffects layer.
export type ItemArrivalBridge = (machineId: string, item: Item) => SimulationCommand[]

type SimEventHandler = (event: SimulationEvent) => void

const DEFAULT_TICK_RATE = 10 // ticks per second

export interface SimulationStats {
  itemsProduced: number
  robotsCompleted: number
  timeElapsed: number
  qualityPercent: number
  outputsDelivered: number
  partsDelivered: number
  assembliesDelivered: number
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
  private _tickRate: number
  get tickRate(): number { return this._tickRate }
  // Scoring accumulators
  itemsProduced = 0
  itemsDelivered = 0
  outputsDelivered = 0
  robotsProduced = 0
  partsDelivered = 0
  assembliesDelivered = 0
  defectiveDiscards = 0
  defects = 0
  totalIdleTicks = 0

  // Machine output → belt connections, keyed by output port.
  private readonly outputBelts: Record<MachineOutputPort, Map<string, string>> = {
    primary: new Map(),
    secondary: new Map(),
    tertiary: new Map(),
  }

  // Splitter-routing bridge wired by the editor / interpreter layer; consumed by `Machine.tick()`.
  private itemArrivalBridge: ItemArrivalBridge | null = null

  private readonly commandDispatcher: SimulationCommandDispatcher
  private readonly queueRunner: CommandQueueRunner
  private readonly deliveryEngine: ItemDeliveryEngine
  private readonly rng: () => number

  constructor(tickRate = DEFAULT_TICK_RATE, rng: () => number = Math.random) {
    this._tickRate = tickRate
    this.rng = rng
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

  addMachine(machine: Machine): void { this.machines.set(machine.id, machine) }
  removeMachine(id: string): boolean { return this.machines.delete(id) }
  getMachine(id: string): Machine | undefined { return this.machines.get(id) }
  getMachines(): ReadonlyMap<string, Machine> { return this.machines }
  addBelt(belt: ConveyorBelt): void { this.belts.set(belt.id, belt) }
  removeBelt(id: string): boolean { return this.belts.delete(id) }
  getBelt(id: string): ConveyorBelt | undefined { return this.belts.get(id) }
  getBelts(): ReadonlyMap<string, ConveyorBelt> { return this.belts }

  setMachineOutputBelt(machineId: string, beltId: string, port: MachineOutputPort = 'primary'): void {
    this.outputBelts[port].set(machineId, beltId)
  }

  setItemArrivalBridge(bridge: ItemArrivalBridge | null): void { if (this.itemArrivalBridge !== bridge) this.itemArrivalBridge = bridge }

  enqueueCommand(command: SimulationCommand): void { this.queueRunner.enqueue(command) }
  enqueueCommands(commands: SimulationCommand[]): void { this.queueRunner.enqueueAll(commands) }

  start(): void {
    if (this._running) return
    this._running = true
    this._paused = false
    this.intervalId = setInterval(() => { if (!this._paused) this.tick() }, 1000 / this.tickRate)
  }

  stop(): void {
    this._running = false
    this._paused = false
    this.queueRunner.clear()
    if (this.intervalId !== null) { clearInterval(this.intervalId); this.intervalId = null }
  }

  pause(): void { this._paused = true }
  resume(): void { this._paused = false }
  setTickRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) throw new RangeError('tickRate must be a finite positive number')
    this._tickRate = rate
    if (this._running && this.intervalId !== null) { clearInterval(this.intervalId); this.intervalId = setInterval(() => { if (!this._paused) this.tick() }, 1000 / rate) }
  }
  get running(): boolean { return this._running }
  get paused(): boolean { return this._paused }
  get gameOver(): GameOverInfo | null { return this._gameOver }
  tick(): void {
    if (this._gameOver !== null) return
    this.queueRunner.tick()
    this.checkNoRecipeGameOver()
    if (this._gameOver !== null) {
      this.emit('tick', { tick: this.currentTick })
      this.currentTick++
      return
    }
    this.updateMachines()
    this.advanceBelts()
    this.runDelivery()
    this.checkStarvationGameOver()
    if (this._gameOver !== null) {
      this.emit('tick', { tick: this.currentTick })
      this.currentTick++
      return
    }
    this.transferMachineOutputs()
    this.updateScoring()
    this.emit('tick', { tick: this.currentTick })
    this.currentTick++
  }

  // Shim — WAIT is filtered (queue-level control); the rest goes to the dispatcher.
  executeCommand(command: SimulationCommand): void { if (command.type !== 'WAIT') this.commandDispatcher.execute(command) }
  private runDelivery(): void {
    const result = this.deliveryEngine.deliver(this.currentTick, this._gameOver)
    this.itemsDelivered += result.itemsDelivered
    this.outputsDelivered += result.outputsDelivered
    this.robotsProduced += result.robotsProduced
    this.partsDelivered += result.partsDelivered
    this.assembliesDelivered += result.assembliesDelivered
    this.defectiveDiscards += result.defectsDiscarded
    this.defects += result.defectsDiscarded
    if (result.newGameOver !== null && this._gameOver === null) {
      this._gameOver = result.newGameOver
      this._paused = true
    }
    for (const event of result.events) {
      this.emit(event.type, event.data, event.tick)
    }
    const bridge = this.itemArrivalBridge
    if (bridge !== null) this.runArrivalBridge(bridge, result.arrivals)
  }

  // Drain between (not after) handlers so per-item routing overrides
  // from one apply before the next runs; last handler's commands stay
  // enqueued for next tick per OnItemArrives contract.
  private runArrivalBridge(bridge: ItemArrivalBridge, arrivals: ReadonlyArray<{ machineId: string; item: Item }>): void {
    for (let i = 0; i < arrivals.length; i++) {
      try {
        const cmds = bridge(arrivals[i].machineId, arrivals[i].item)
        if (cmds.length > 0) this.enqueueCommands(cmds)
      } catch (err) { console.error('Simulation arrival bridge threw:', { source: 'arrival_bridge', machineId: arrivals[i].machineId, error: String(err) }) }
      if (i < arrivals.length - 1) this.queueRunner.drainHead()
    }
  }
  private checkNoRecipeGameOver(): void {
    if (this._gameOver !== null) return
    const info = detectNoRecipeStart(this.machines.values(), this.currentTick)
    if (info !== null) {
      this._gameOver = info
      this._paused = true
      this.emit('game_over', { ...info })
    }
  }

  private checkStarvationGameOver(): void {
    if (this._gameOver !== null) return
    const context: StarvationContext = {
      getOutputBelt: (id, port) => this.outputBelts[port].get(id),
      getBelt: (id) => this.belts.get(id),
      findMachineAt: (x, z) => this.findMachineAt(x, z),
      findBeltStartingAt: (x, z) => this.findBeltStartingAt(x, z),
    }
    const info = detectStarvation(this.machines.values(), context, this.currentTick)
    if (info !== null) {
      this._gameOver = info
      this._paused = true
      this.emit('game_over', { ...info })
    }
  }

  private updateMachines(): void {
    const env = {
      isOutputConnected: (machineId: string, port: MachineOutputPort): boolean =>
        this.outputBelts[port].has(machineId),
    }
    for (const machine of this.machines.values()) {
      const prevState = machine.state
      const prevOutput = machine.outputSlot
      const prevSecondary = machine.secondaryOutputSlot
      const prevTertiary = machine.tertiaryOutputSlot
      machine.tick(this.rng, env)
      if (machine.state !== prevState) {
        this.emit('machine_state_changed', {
          machineId: machine.id,
          from: prevState,
          to: machine.state,
        })
      }
      const primaryProduced = machine.outputSlot !== null && machine.outputSlot !== prevOutput
      const secondaryProduced =
        machine.secondaryOutputSlot !== null && machine.secondaryOutputSlot !== prevSecondary
      const tertiaryProduced =
        machine.tertiaryOutputSlot !== null && machine.tertiaryOutputSlot !== prevTertiary
      // Capture slot refs before emitting item_produced — handlers may
      // synchronously call takeOutput() / takeSecondaryOutput() / takeTertiaryOutput() and clear them.
      const newPrimary = primaryProduced ? machine.outputSlot! : null
      const newSecondary = secondaryProduced ? machine.secondaryOutputSlot! : null
      const newTertiary = tertiaryProduced ? machine.tertiaryOutputSlot! : null
      if (newPrimary !== null) {
        this.itemsProduced++
        this.emit('item_produced', {
          machineId: machine.id,
          itemId: newPrimary.id,
          itemType: newPrimary.type,
        })
      }
      if (newSecondary !== null) {
        this.itemsProduced++
        this.emit('item_produced', {
          machineId: machine.id,
          itemId: newSecondary.id,
          itemType: newSecondary.type,
          output: 'secondary',
        })
      }
      if (newTertiary !== null) {
        this.itemsProduced++
        this.emit('item_produced', {
          machineId: machine.id,
          itemId: newTertiary.id,
          itemType: newTertiary.type,
          output: 'tertiary',
        })
      }
      if (newPrimary !== null || newSecondary !== null || newTertiary !== null) {
        // One signal per cycle, even if a machine populates multiple ports in the same tick.
        const slot = newPrimary ?? newSecondary ?? newTertiary!
        this.emit('machine_cycle_completed', {
          machineId: machine.id,
          itemId: slot.id,
          itemType: slot.type,
        })
      } else if (machine.firstIdleAfterStartPending && machine.state === 'idle' && prevState === 'idle') {
        // Synthetic one-shot for a freshly-started machine with no work.
        this.emit('machine_cycle_completed', { machineId: machine.id })
      }
      machine.firstIdleAfterStartPending = false
    }
  }

  private transferMachineOutputs(): void {
    for (const machine of this.machines.values()) {
      for (const port of OUTPUT_PORTS) {
        const item = machine[SLOT_FIELD[port]]
        if (!item) continue
        const beltId = this.outputBelts[port].get(machine.id)
        if (!beltId) continue
        const belt = this.belts.get(beltId)
        if (belt && belt.addItem(item)) {
          machine.takeFromPort(port)
        }
      }
    }
  }

  private advanceBelts(): void {
    const dt = 1 / this.tickRate
    for (const belt of this.belts.values()) belt.advance(dt)
  }

  /** Find a belt whose start position matches the given coordinates. */
  private findBeltStartingAt(x: number, z: number): ConveyorBelt | undefined {
    for (const belt of this.belts.values()) if (belt.fromX === x && belt.fromZ === z) return belt
    return undefined
  }

  private findMachineAt(x: number, z: number): Machine | undefined {
    for (const machine of this.machines.values()) {
      const pos = this.machinePositions.get(machine.id)
      if (pos?.x === x && pos?.z === z) return machine
    }
    return undefined
  }
  private machinePositions: Map<string, { x: number; z: number }> = new Map()
  setMachinePosition(machineId: string, x: number, z: number): void { this.machinePositions.set(machineId, { x, z }) }
  getMachinePosition(machineId: string): { x: number; z: number } | undefined { return this.machinePositions.get(machineId) }
  areRecipeDependenciesSatisfied(machineId: string): boolean { return analyzeRecipeDependencies(machineId, this) }

  private updateScoring(): void {
    for (const machine of this.machines.values()) {
      if (machine.state === 'idle' && machine.currentRecipe !== null) this.totalIdleTicks++
    }
  }

  on(type: SimulationEventType, handler: SimEventHandler): void {
    const list = this.handlers.get(type)
    if (list) list.push(handler); else this.handlers.set(type, [handler])
  }

  off(type: SimulationEventType, handler: SimEventHandler): void {
    const list = this.handlers.get(type)
    if (!list) return
    const idx = list.indexOf(handler)
    if (idx !== -1) list.splice(idx, 1)
  }

  private emit(type: SimulationEventType, data: Record<string, unknown>, tick = this.currentTick): void {
    const event: SimulationEvent = { type, tick, data }
    const list = this.handlers.get(type)
    if (list) for (const handler of list) handler(event)
  }

  getStats(): SimulationStats {
    const total = this.outputsDelivered + this.defectiveDiscards
    return {
      itemsProduced: this.itemsProduced,
      robotsCompleted: this.robotsProduced,
      timeElapsed: this.currentTick / this.tickRate,
      qualityPercent: total > 0 ? (this.outputsDelivered / total) * 100 : 100,
      outputsDelivered: this.outputsDelivered,
      partsDelivered: this.partsDelivered,
      assembliesDelivered: this.assembliesDelivered,
    }
  }

  /** Soft reset: clear runtime state but preserve factory layout. */
  clearInFlight(): void {
    this.stop()
    for (const belt of this.belts.values()) belt.clear()
    for (const machine of this.machines.values()) machine.clearRuntimeState()
    this.queueRunner.clear()
    this.currentTick = 0
    this.itemsProduced = this.itemsDelivered = this.outputsDelivered = 0
    this.robotsProduced = this.partsDelivered = this.assembliesDelivered = 0
    this.defectiveDiscards = this.defects = this.totalIdleTicks = 0
    this._gameOver = null
  }

  reset(): void {
    this.clearInFlight()
    this.machines.clear()
    this.belts.clear()
    this.machinePositions.clear()
    for (const port of OUTPUT_PORTS) this.outputBelts[port].clear()
  }
}
