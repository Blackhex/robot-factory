import type { SimulationEvent } from './types.ts'
import { Factory } from './Factory.ts'
import { Simulation } from './Simulation.ts'
import { Machine } from './Machine.ts'
import { ConveyorBelt } from './ConveyorBelt.ts'
import { getLevelById, getAllLevels } from './Level.ts'
import type { LevelDefinition } from './Level.ts'
import { calculateScore } from './Scoring.ts'
import type { ScoreResult } from './Scoring.ts'

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
    this.setState('build_phase')
    this.emit('levelStarted', { levelId })
  }

  startSimulation(): void {
    if (this._state !== 'build_phase' || !this._simulation) return

    this._simulation.on('order_complete', this.onOrderComplete)
    this._simulation.start()
    this.setState('play_phase')
  }

  stopSimulation(): void {
    if (this._state !== 'play_phase' || !this._simulation) return

    this._simulation.stop()
    this._simulation.off('order_complete', this.onOrderComplete)
    this.emit('simulationDone', {})
    this.showScore()
  }

  showScore(): void {
    if (!this._simulation || !this._currentLevel) return

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

    for (const info of factory.getMachines()) {
      simulation.addMachine(new Machine(info.id, info.type))
      simulation.setMachinePosition(info.id, info.x, info.z)
    }

    for (const info of factory.getBelts()) {
      // Create one ConveyorBelt per path segment
      for (let i = 0; i < info.path.length - 1; i++) {
        const segId = `${info.id}_seg${i}`
        simulation.addBelt(
          new ConveyorBelt(segId, info.path[i].x, info.path[i].z, info.path[i + 1].x, info.path[i + 1].z),
        )
      }
      // Wire source machine output to the first segment
      simulation.setMachineOutputBelt(info.sourceMachine.id, `${info.id}_seg0`)
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

  private readonly onOrderComplete = (_event: SimulationEvent): void => {
    // Could auto-stop on goal completion in the future
  }

  private cleanup(): void {
    if (this._simulation) {
      this._simulation.stop()
      this._simulation.off('order_complete', this.onOrderComplete)
    }
    this._simulation = null
    this._factory = null
    this._currentLevel = null
    this._lastScore = null
  }
}
