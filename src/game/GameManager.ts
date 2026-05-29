import type { SimulationCommand, SimulationEvent } from './types.ts'
import { Factory } from './Factory.ts'
import { Simulation } from './Simulation.ts'
import { Machine } from './Machine.ts'
import { ConveyorBelt } from './ConveyorBelt.ts'
import { derivePortFromBeltSource } from './SplitterPortRouting'
import { getLevelById, getAllLevels } from './Level.ts'
import type { LevelDefinition } from './Level.ts'
import { calculateScore } from './Scoring.ts'
import type { ScoreResult } from './Scoring.ts'
import { computeRequiredOutputs } from './LevelGoals.ts'

export type GameState =
  | 'main_menu'
  | 'level_select'
  | 'build_phase'
  | 'play_phase'
  | 'score_screen'
  | 'sandbox'

type GameManagerEventType = 'stateChanged' | 'levelStarted' | 'simulationDone' | 'scoreReady'

interface GameManagerEvent {
  type: GameManagerEventType
  data: Record<string, unknown>
}

type GameManagerEventHandler = (event: GameManagerEvent) => void

export interface ProgressData {
  levels: Record<string, number>
}

export class GameManager {
  private _state: GameState = 'main_menu'
  private _factory: Factory | null = null
  private _simulation: Simulation | null = null
  private _currentLevel: LevelDefinition | null = null
  private _lastScore: ScoreResult | null = null
  private _progress: Map<string, number> = new Map()
  private handlers: Map<GameManagerEventType, GameManagerEventHandler[]> = new Map()

  getCurrentState(): GameState {
    return this._state
  }

  get factory(): Factory | null {
    return this._factory
  }

  get simulation(): Simulation | null {
    return this._simulation
  }

  get currentLevel(): LevelDefinition | null {
    return this._currentLevel
  }

  get lastScore(): ScoreResult | null {
    return this._lastScore
  }

  // --- State transitions ---

  enterMainMenu(): void {
    this.cleanup()
    this.setState('main_menu')
  }

  enterLevelSelect(): void {
    this.cleanup()
    this.setState('level_select')
  }

  startLevel(levelId: string): void {
    const level = getLevelById(levelId)
    if (!level) return

    this.cleanup()
    this._currentLevel = level
    this._factory = new Factory(level.gridSize.width, level.gridSize.height)
    this._simulation = new Simulation()
    for (const entry of level.startingMachines ?? []) {
      this._factory.placeMachine(entry.x, entry.z, entry.type, entry.rotation)
    }
    this.setState('build_phase')
    this.emit('levelStarted', { levelId })
  }

  /**
   * Restart the current level by re-running {@link startLevel} with its id.
   * No-op when there is no active level. Pure game-layer: does not play
   * audio or touch the DOM (that is the composition root's job).
   */
  retryCurrentLevel(): void {
    const level = this._currentLevel
    if (level) this.startLevel(level.id)
  }

  startSimulation(): void {
    if (this._state !== 'build_phase' || !this._simulation) return

    this._simulation.on('tick', this.onSimulationTick)
    this._simulation.start()
    this.setState('play_phase')
  }

  resetSimulationForRetry(): void {
    if (this._state !== 'play_phase' || !this._simulation || !this._factory) return

    this.detachSimulation()
    this._factory.attachSimulation(null)
    this._simulation = new Simulation()
    this._lastScore = null
    this.setState('build_phase')
  }

  showScore(): void {
    if (!this._simulation || !this._currentLevel) return

    // Only the auto-completion path calls this — it fires after
    // `outputsDelivered >= requiredCount > 0`, so success is implicit.
    this._lastScore = calculateScore(this._simulation, this._currentLevel)
    const bestStars = this._progress.get(this._currentLevel.id) ?? 0
    if (this._lastScore.totalStars > bestStars) {
      this._progress.set(this._currentLevel.id, this._lastScore.totalStars)
    }
    this.setState('score_screen')
    this.emit('scoreReady', { score: this._lastScore })
  }

  enterSandbox(): void {
    this.cleanup()
    this._currentLevel = null
    this._factory = new Factory(20, 20)
    this._simulation = new Simulation()
    this.setState('sandbox')
  }

  populateSimulation(): void {
    const factory = this._factory
    const simulation = this._simulation
    if (!factory || !simulation) return

    const factoryMachines = factory.getMachines()
    const factoryMachineIds = new Set(factoryMachines.map((m) => m.id))
    for (const id of [...simulation.getMachines().keys()]) {
      if (!factoryMachineIds.has(id)) simulation.removeMachine(id)
    }
    for (const info of factoryMachines) {
      if (!simulation.getMachines().has(info.id)) {
        simulation.addMachine(new Machine(info.id, info.type))
      }
      simulation.setMachinePosition(info.id, info.x, info.z)
    }

    const factoryBelts = factory.getBelts()
    const factorySegmentIds = new Set<string>()
    for (const info of factoryBelts) {
      const segments = ConveyorBelt.fromBeltInfo(info)
      for (const segment of segments) factorySegmentIds.add(segment.id)
    }
    for (const id of [...simulation.getBelts().keys()]) {
      if (!factorySegmentIds.has(id)) simulation.removeBelt(id)
    }
    for (const info of factoryBelts) {
      const firstSegmentId = ConveyorBelt.segmentIdFor(info.id, 0)
      if (simulation.getBelts().has(firstSegmentId)) continue
      for (const segment of ConveyorBelt.fromBeltInfo(info)) {
        simulation.addBelt(segment)
      }
      simulation.setMachineOutputBelt(
        info.sourceMachine.id,
        firstSegmentId,
        derivePortFromBeltSource(info),
      )
    }

    // Wire factory edits → sim sync. After this, mid-run belt edits
    // (move/rotate/remove) keep `Simulation.belts` in lock-step with
    // `Factory.getBelts()` and preserve removed-belt items only for
    // exact source/destination slot replacements.
    factory.attachSimulation(simulation)
  }

  applyBuildPhaseConfigPreview(commands: ReadonlyArray<SimulationCommand>): void {
    if (this._state !== 'build_phase' && this._state !== 'sandbox') return
    const sim = this._simulation
    if (!sim) return
    for (const command of commands) {
      if (
        command.type === 'SET_RECIPE' ||
        command.type === 'SET_MACHINE_SPEED' ||
        command.type === 'SET_BELT_SPEED'
      ) {
        sim.executeCommand(command)
      }
    }
  }

  // --- Progress ---

  getProgress(): Map<string, number> {
    return new Map(this._progress)
  }

  getCompletedLevelCount(): number {
    return this._progress.size
  }

  getAvailableLevels(): ReadonlyArray<LevelDefinition> {
    return getAllLevels()
  }

  saveProgress(): ProgressData {
    const levels: Record<string, number> = {}
    for (const [id, stars] of this._progress) {
      levels[id] = stars
    }
    return { levels }
  }

  loadProgress(data: ProgressData): void {
    this._progress.clear()
    if (data.levels) {
      for (const id of Object.keys(data.levels)) {
        const stars = data.levels[id]
        if (typeof stars === 'number' && stars >= 0) {
          this._progress.set(id, stars)
        }
      }
    }
  }

  // --- Event emitter ---

  on(type: GameManagerEventType, handler: GameManagerEventHandler): void {
    const list = this.handlers.get(type)
    if (list) {
      list.push(handler)
    } else {
      this.handlers.set(type, [handler])
    }
  }

  off(type: GameManagerEventType, handler: GameManagerEventHandler): void {
    const list = this.handlers.get(type)
    if (!list) return
    const idx = list.indexOf(handler)
    if (idx !== -1) {
      list.splice(idx, 1)
    }
  }

  // --- Private ---

  private setState(newState: GameState): void {
    const prev = this._state
    this._state = newState
    this.emit('stateChanged', { from: prev, to: newState })
  }

  private emit(type: GameManagerEventType, data: Record<string, unknown>): void {
    const event: GameManagerEvent = { type, data }
    const list = this.handlers.get(type)
    if (list) {
      for (const handler of list) {
        handler(event)
      }
    }
  }

  private readonly onSimulationTick = (_event: SimulationEvent): void => {
    // Re-entry guard: showScore() flips state away from play_phase, so any
    // pending tick after auto-completion no-ops here.
    if (this._state !== 'play_phase' || !this._simulation || !this._currentLevel) return
    const required = computeRequiredOutputs(this._currentLevel)
    if (required <= 0) return
    if (this._simulation.outputsDelivered < required) return
    this.detachSimulation()
    this.showScore()
  }

  private detachSimulation(): void {
    if (!this._simulation) return
    this._simulation.stop()
    this._simulation.off('tick', this.onSimulationTick)
  }

  private cleanup(): void {
    this.detachSimulation()
    this._simulation = null
    this._factory = null
    this._currentLevel = null
    this._lastScore = null
  }
}


