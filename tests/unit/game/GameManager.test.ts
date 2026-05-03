import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GameManager } from '../../../src/game/GameManager.ts'
import type { ProgressData } from '../../../src/game/GameManager.ts'
import { expectFactoryState } from '../helpers/factoryAssert'

describe('GameManager', () => {
  let gm: GameManager

  beforeEach(() => {
    gm = new GameManager()
  })

  describe('initial state', () => {
    it('should start in main_menu state', () => {
      // WHEN + THEN
      expect(gm.getCurrentState()).toBe('main_menu')
    })

    it('should have no factory initially', () => {
      // WHEN + THEN
      expect(gm.factory).toBeNull()
    })

    it('should have no simulation initially', () => {
      // WHEN + THEN
      expect(gm.simulation).toBeNull()
    })

    it('should have no current level initially', () => {
      // WHEN + THEN
      expect(gm.currentLevel).toBeNull()
    })

    it('should have no last score initially', () => {
      // WHEN + THEN
      expect(gm.lastScore).toBeNull()
    })

    it('should have empty progress', () => {
      // WHEN + THEN
      expect(gm.getCompletedLevelCount()).toBe(0)
    })
  })

  describe('state transitions', () => {
    it('should transition from main_menu to level_select', () => {
      // WHEN
      gm.enterLevelSelect()

      // THEN
      expect(gm.getCurrentState()).toBe('level_select')
    })

    it('should transition from level_select to build_phase via startLevel', () => {
      // GIVEN
      gm.enterLevelSelect()

      // WHEN
      gm.startLevel('level_1')

      // THEN
      expect(gm.getCurrentState()).toBe('build_phase')
    })

    it('should transition from build_phase to play_phase via startSimulation', () => {
      // GIVEN
      gm.startLevel('level_1')

      // WHEN
      gm.startSimulation()

      // THEN
      expect(gm.getCurrentState()).toBe('play_phase')
    })

    it('should transition from play_phase to score_screen via stopSimulation', () => {
      // CONTRACT (B1): Only successful campaign runs land on `score_screen`.
      // A run with zero outputs now transitions to `level_failed` (covered by
      // the dedicated "level failed flow" describe block). To preserve this
      // test's intent — verifying the success transition out of play_phase —
      // we force a successful outcome before stopping the sim.
      // GIVEN
      gm.startLevel('level_1')
      gm.startSimulation()
      gm.simulation!.robotsProduced = 5
      gm.simulation!.outputsDelivered = 5

      // WHEN
      gm.stopSimulation()

      // THEN
      expect(gm.getCurrentState()).toBe('score_screen')
    })

    it('should transition back to main_menu via enterMainMenu', () => {
      // GIVEN
      gm.enterLevelSelect()
      gm.startLevel('level_1')

      // WHEN
      gm.enterMainMenu()

      // THEN
      expect(gm.getCurrentState()).toBe('main_menu')
    })

    it('should transition back to level_select from score_screen', () => {
      // CONTRACT (B1): `score_screen` is only reached when the run actually
      // succeeded (outputsDelivered >= requiredCount). Force a successful
      // outcome so the precondition (being on `score_screen`) holds.
      // GIVEN
      gm.startLevel('level_1')
      gm.startSimulation()
      gm.simulation!.robotsProduced = 5
      gm.simulation!.outputsDelivered = 5
      gm.stopSimulation()
      expect(gm.getCurrentState()).toBe('score_screen')

      // WHEN
      gm.enterLevelSelect()

      // THEN
      expect(gm.getCurrentState()).toBe('level_select')
    })
  })

  describe('enterSandbox()', () => {
    it('should transition to sandbox state', () => {
      // WHEN
      gm.enterSandbox()

      // THEN
      expect(gm.getCurrentState()).toBe('sandbox')
    })

    it('should create a 20x20 factory', () => {
      // WHEN
      gm.enterSandbox()

      // THEN
      expect(gm.factory).not.toBeNull()
      expect(gm.factory!.width).toBe(20)
      expect(gm.factory!.height).toBe(20)
    })

    it('should create a simulation', () => {
      // WHEN
      gm.enterSandbox()

      // THEN
      expect(gm.simulation).not.toBeNull()
    })

    it('should have no current level', () => {
      // WHEN
      gm.enterSandbox()

      // THEN
      expect(gm.currentLevel).toBeNull()
    })
  })

  describe('startLevel()', () => {
    it('should create factory with correct grid size for level_1', () => {
      // WHEN
      gm.startLevel('level_1')

      // THEN
      expect(gm.factory).not.toBeNull()
      expect(gm.factory!.width).toBe(10)
      expect(gm.factory!.height).toBe(10)
    })

    it('should create factory with correct grid size for level_5', () => {
      // WHEN
      gm.startLevel('level_5')

      // THEN
      expect(gm.factory).not.toBeNull()
      expect(gm.factory!.width).toBe(16)
      expect(gm.factory!.height).toBe(16)
    })

    it('should set currentLevel', () => {
      // WHEN
      gm.startLevel('level_1')

      // THEN
      expect(gm.currentLevel).not.toBeNull()
      expect(gm.currentLevel!.id).toBe('level_1')
    })

    it('should create a simulation', () => {
      // WHEN
      gm.startLevel('level_1')

      // THEN
      expect(gm.simulation).not.toBeNull()
    })

    it('should do nothing for an invalid level id', () => {
      // WHEN
      gm.startLevel('nonexistent')

      // THEN
      expect(gm.getCurrentState()).toBe('main_menu')
      expect(gm.factory).toBeNull()
    })
  })

  describe('startSimulation()', () => {
    it('should not transition if not in build_phase', () => {
      // WHEN — still in main_menu
      gm.startSimulation()

      // THEN
      expect(gm.getCurrentState()).toBe('main_menu')
    })

    it('should not transition without a simulation instance', () => {
      // WHEN — try to start from main_menu (no simulation)
      gm.startSimulation()

      // THEN
      expect(gm.getCurrentState()).toBe('main_menu')
    })
  })

  describe('stopSimulation()', () => {
    it('should not transition if not in play_phase', () => {
      // GIVEN
      gm.startLevel('level_1')

      // WHEN — in build_phase, not play_phase
      gm.stopSimulation()

      // THEN
      expect(gm.getCurrentState()).toBe('build_phase')
    })
  })

  describe('event emitter', () => {
    it('should fire stateChanged when transitioning', () => {
      // GIVEN
      const handler = vi.fn()
      gm.on('stateChanged', handler)

      // WHEN
      gm.enterLevelSelect()

      // THEN
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'stateChanged',
          data: { from: 'main_menu', to: 'level_select' },
        }),
      )
    })

    it('should fire levelStarted when starting a level', () => {
      // GIVEN
      const handler = vi.fn()
      gm.on('levelStarted', handler)

      // WHEN
      gm.startLevel('level_1')

      // THEN
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'levelStarted',
          data: { levelId: 'level_1' },
        }),
      )
    })

    it('should fire scoreReady after stopSimulation', () => {
      // CONTRACT (B1): `scoreReady` is the success-path event emitted from
      // `showScore()`. Failed campaign runs route through the `level_failed`
      // path and do not guarantee a `scoreReady` emission. To keep this test's
      // intent — verifying the event surface on the success path — we force a
      // successful outcome before stopping the sim.
      // GIVEN
      const handler = vi.fn()
      gm.on('scoreReady', handler)
      gm.startLevel('level_1')
      gm.startSimulation()
      gm.simulation!.robotsProduced = 5
      gm.simulation!.outputsDelivered = 5

      // WHEN
      gm.stopSimulation()

      // THEN
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].data.score).toBeDefined()
    })

    it('should allow unsubscribing with off()', () => {
      // GIVEN
      const handler = vi.fn()
      gm.on('stateChanged', handler)

      // WHEN
      gm.off('stateChanged', handler)
      gm.enterLevelSelect()

      // THEN
      expect(handler).not.toHaveBeenCalled()
    })

    it('should handle off() for handler not registered', () => {
      // GIVEN
      const handler = vi.fn()

      // WHEN + THEN — should not throw
      gm.off('stateChanged', handler)
    })
  })

  describe('progress tracking', () => {
    it('should store stars after scoring a successful run', () => {
      // CONTRACT (B1): Stars are persisted to `progress` only when the run
      // delivered at least one output. The previous version of this test relied
      // on the buggy 1★ participation floor (an empty Start→Stop cycle stored
      // 3★). The new contract requires real output before stars persist.
      // GIVEN — level_2 goal: produce_robots target=3
      gm.startLevel('level_2')
      gm.startSimulation()
      // Force a successful outcome by bumping the sim's output counters.
      gm.simulation!.robotsProduced = 5
      gm.simulation!.outputsDelivered = 5

      // WHEN
      gm.stopSimulation()

      // THEN — successful runs land on score_screen and persist stars
      expect(gm.getCurrentState()).toBe('score_screen')
      const progress = gm.getProgress()
      expect(progress.has('level_2')).toBe(true)
      expect(progress.get('level_2')!).toBeGreaterThan(0)
    })

    it('should keep highest star count for a level', () => {
      // CONTRACT (B1): Stars are only persisted to `progress` for successful
      // runs (outputsDelivered >= requiredCount). The previous version of this
      // test relied on the buggy 1★ participation floor for empty Start→Stop
      // cycles; both attempts must now be real successful runs to populate
      // `progress.get('level_1')`.
      // GIVEN — first successful attempt
      gm.startLevel('level_1')
      gm.startSimulation()
      gm.simulation!.robotsProduced = 5
      gm.simulation!.outputsDelivered = 5
      gm.stopSimulation()
      const firstStars = gm.getProgress().get('level_1')!

      // WHEN — second successful attempt
      gm.startLevel('level_1')
      gm.startSimulation()
      gm.simulation!.robotsProduced = 5
      gm.simulation!.outputsDelivered = 5
      gm.stopSimulation()
      const secondStars = gm.getProgress().get('level_1')!

      // THEN
      expect(secondStars).toBeGreaterThanOrEqual(firstStars)
    })

    it('should count completed levels', () => {
      // CONTRACT (B1): A level is only "completed" (counted by
      // `getCompletedLevelCount()`) when the run was successful and stars were
      // persisted to `progress`. Force a successful outcome so the level is
      // recorded.
      // GIVEN + WHEN
      gm.startLevel('level_1')
      gm.startSimulation()
      gm.simulation!.robotsProduced = 5
      gm.simulation!.outputsDelivered = 5
      gm.stopSimulation()

      // THEN
      expect(gm.getCompletedLevelCount()).toBe(1)
    })
  })

  describe('level failed flow (B1 contract)', () => {
    // CONTRACT: Campaign runs that deliver zero outputs ("give-up" / restart
    // path) must transition to a dedicated `level_failed` state — NOT the
    // `score_screen`. Failed runs must not persist stars and must not unlock
    // the next level. Sandbox sessions are excluded from this flow.

    it('transitions to level_failed state instead of score_screen when no outputs delivered', () => {
      // GIVEN — campaign level, no machines placed, no outputs
      gm.startLevel('level_2')
      gm.startSimulation()

      // WHEN
      gm.stopSimulation()

      // THEN
      expect(gm.getCurrentState()).toBe('level_failed')
      expect(gm.getCurrentState()).not.toBe('score_screen')
    })

    it('exposes outcome === "failed" on lastScore for failed campaign runs', () => {
      // GIVEN
      gm.startLevel('level_2')
      gm.startSimulation()

      // WHEN
      gm.stopSimulation()

      // THEN
      expect(gm.lastScore).not.toBeNull()
      expect((gm.lastScore as unknown as { outcome: string }).outcome).toBe('failed')
    })

    it('exposes outcome === "success" on lastScore for successful campaign runs', () => {
      // GIVEN — force a successful run
      gm.startLevel('level_2')
      gm.startSimulation()
      gm.simulation!.robotsProduced = 5
      gm.simulation!.outputsDelivered = 5

      // WHEN
      gm.stopSimulation()

      // THEN
      expect(gm.getCurrentState()).toBe('score_screen')
      expect(gm.lastScore).not.toBeNull()
      expect((gm.lastScore as unknown as { outcome: string }).outcome).toBe('success')
    })

    it('does NOT record stars in progress and does NOT unlock next level after failed run', () => {
      // GIVEN
      gm.startLevel('level_2')
      gm.startSimulation()

      // WHEN
      gm.stopSimulation()

      // THEN — no entry persisted (LevelSelect treats `>= 1` as unlocked, so
      // `undefined` or `0` both correctly keep level_3 locked).
      const progress = gm.getProgress()
      expect(progress.has('level_2')).toBe(false)
      expect(progress.get('level_2') ?? 0).toBeLessThan(1)
    })

    it('successful campaign run lands on score_screen, not level_failed', () => {
      // GIVEN
      gm.startLevel('level_2')
      gm.startSimulation()
      gm.simulation!.robotsProduced = 5
      gm.simulation!.outputsDelivered = 5

      // WHEN
      gm.stopSimulation()

      // THEN
      expect(gm.getCurrentState()).toBe('score_screen')
      expect(gm.getCurrentState()).not.toBe('level_failed')
    })

    it('sandbox sessions never transition to level_failed regardless of output count', () => {
      // GIVEN — sandbox has no campaign goals; the failed flow must not apply
      gm.enterSandbox()

      // WHEN — invoke the score path directly (sandbox has no stopSimulation
      // path through play_phase, so we exercise showScore() to prove the guard)
      gm.showScore()

      // THEN
      expect(gm.getCurrentState()).toBe('sandbox')
      expect(gm.getCurrentState()).not.toBe('level_failed')
    })
  })

  describe('saveProgress() / loadProgress()', () => {
    it('should round-trip progress data', () => {
      // GIVEN
      const data: ProgressData = {
        levels: { level_1: 7, level_2: 5 },
      }

      // WHEN
      gm.loadProgress(data)
      const saved = gm.saveProgress()

      // THEN
      expect(saved.levels).toEqual({ level_1: 7, level_2: 5 })
    })

    it('should clear existing progress on loadProgress', () => {
      // GIVEN
      gm.loadProgress({ levels: { level_1: 9 } })

      // WHEN
      gm.loadProgress({ levels: { level_3: 6 } })

      // THEN
      const saved = gm.saveProgress()
      expect(saved.levels).toEqual({ level_3: 6 })
      expect(saved.levels['level_1']).toBeUndefined()
    })

    it('should handle empty progress data', () => {
      // WHEN
      gm.loadProgress({ levels: {} })

      // THEN
      const saved = gm.saveProgress()
      expect(saved.levels).toEqual({})
    })

    it('should ignore negative star values in loadProgress', () => {
      // WHEN
      gm.loadProgress({ levels: { level_1: -1, level_2: 5 } })

      // THEN
      const saved = gm.saveProgress()
      expect(saved.levels['level_1']).toBeUndefined()
      expect(saved.levels['level_2']).toBe(5)
    })

    it('should return copy from getProgress (not internal reference)', () => {
      // GIVEN
      gm.loadProgress({ levels: { level_1: 5 } })
      const progress = gm.getProgress()

      // WHEN
      progress.set('level_99', 9)

      // THEN — internal state should be unaffected
      expect(gm.getProgress().has('level_99')).toBe(false)
    })
  })

  describe('progression with no work done (give-up / restart path)', () => {
    // CONTRACT: Pressing Start then Stop with zero machines (or otherwise producing
    // no outputs) must NOT mark the level as completed and must NOT unlock the next
    // level. LevelSelect treats `progress.get(levelId) >= 1` as "unlocked", so the
    // entry must be either absent or 0 after a no-work run.

    it('does not unlock next level when objective unmet (no machines placed)', () => {
      // GIVEN — level_2 has no startingMachines and goal `produce_robots, target: 3`
      gm.startLevel('level_2')
      gm.startSimulation()

      // WHEN — stop immediately, no items produced
      gm.stopSimulation()

      // THEN — progress for level_2 must be insufficient to unlock level_3
      const stars = gm.getProgress().get('level_2') ?? 0
      expect(stars).toBe(0)
    })

    it('does not record stars in progress when objective unmet', () => {
      // GIVEN
      gm.startLevel('level_2')
      gm.startSimulation()

      // WHEN
      gm.stopSimulation()

      // THEN — either no entry, or entry === 0 (both fail unlock check `>= 1`)
      const progress = gm.getProgress()
      const stars = progress.get('level_2') ?? 0
      expect(stars).toBeLessThan(1)
    })

    it('restart-with-no-work flow: repeated empty runs never unlock next level', () => {
      // GIVEN — three give-up cycles in a row
      for (let i = 0; i < 3; i++) {
        gm.startLevel('level_2')
        gm.startSimulation()
        gm.stopSimulation()
      }

      // THEN
      const stars = gm.getProgress().get('level_2') ?? 0
      expect(stars).toBeLessThan(1)
    })

    it('lastScore reports totalStars === 0 after a no-work run', () => {
      // GIVEN
      gm.startLevel('level_2')
      gm.startSimulation()

      // WHEN
      gm.stopSimulation()

      // THEN
      expect(gm.lastScore).not.toBeNull()
      expect(gm.lastScore!.totalStars).toBe(0)
    })
  })

  describe('getAvailableLevels()', () => {
    it('should return all 10 levels', () => {
      // WHEN + THEN
      expect(gm.getAvailableLevels()).toHaveLength(10)
    })
  })

  describe('cleanup on transitions', () => {
    it('should null factory and simulation when entering main_menu', () => {
      // GIVEN
      gm.startLevel('level_1')
      expect(gm.factory).not.toBeNull()

      // WHEN
      gm.enterMainMenu()

      // THEN
      expect(gm.factory).toBeNull()
      expect(gm.simulation).toBeNull()
    })

    it('should null factory and simulation when entering level_select', () => {
      // GIVEN
      gm.startLevel('level_1')

      // WHEN
      gm.enterLevelSelect()

      // THEN
      expect(gm.factory).toBeNull()
      expect(gm.simulation).toBeNull()
    })

    it('should stop simulation when entering main_menu during play_phase', () => {
      // GIVEN
      gm.startLevel('level_1')
      gm.startSimulation()
      expect(gm.simulation!.running).toBe(true)

      // WHEN
      gm.enterMainMenu()

      // THEN
      expect(gm.simulation).toBeNull()
    })
  })

  describe('populateSimulation()', () => {
    it('should add machines from factory to simulation', () => {
      // GIVEN
      gm.startLevel('level_2')
      const factory = gm.factory!
      factory.placeMachine(1, 1, 'part_fabricator', 'south')
      factory.placeMachine(3, 1, 'assembler', 'south')
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 5, 5],
          expected: [
            '| | | | | | |',
            '| |F| |A| | |',
            '| | | | | | |',
            '| | | | | | |',
            '| | | | | | |',
            '| | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 1, z: 1, rotation: 'south' },
          { x: 3, z: 1, rotation: 'south' },
        ],
        belts: [],
      })

      // WHEN
      gm.populateSimulation()

      // THEN
      const sim = gm.simulation!
      const machines = sim.getMachines()
      expect(machines.size).toBe(2)
    })

    it('should add belts from factory to simulation', () => {
      // GIVEN
      gm.startLevel('level_2')
      const factory = gm.factory!
      factory.placeMachine(1, 1, 'part_fabricator', 'south')
      factory.placeMachine(5, 1, 'assembler', 'south')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(5, 1)!)
      expectFactoryState(factory, {
        grid: { box: [0, 0, 6, 5], expected: [
            '| | | | | | | |',
            '| |F|─|─|─|A| |',
            '| | | | | | | |',
            '| | | | | | | |',
            '| | | | | | | |',
            '| | | | | | | |',
          ].join('\n') },
        machines: [
          { x: 1, z: 1, rotation: 'east' },
          { x: 5, z: 1, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 1, z: 1 },
            destination: { x: 5, z: 1 },
            path: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 4, z: 1 }, { x: 5, z: 1 }],
          },
        ],
      })

      // WHEN
      gm.populateSimulation()

      // THEN
      const sim = gm.simulation!
      const belts = sim.getBelts()
      expect(belts.size).toBeGreaterThan(0)
    })

    it('should wire machine output belts', () => {
      // GIVEN
      gm.startLevel('level_2')
      const factory = gm.factory!
      factory.placeMachine(1, 1, 'part_fabricator', 'south')
      factory.placeMachine(5, 1, 'assembler', 'south')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(5, 1)!)
      expectFactoryState(factory, {
        grid: { box: [0, 0, 6, 5], expected: [
            '| | | | | | | |',
            '| |F|─|─|─|A| |',
            '| | | | | | | |',
            '| | | | | | | |',
            '| | | | | | | |',
            '| | | | | | | |',
          ].join('\n') },
        machines: [
          { x: 1, z: 1, rotation: 'east' },
          { x: 5, z: 1, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 1, z: 1 },
            destination: { x: 5, z: 1 },
            path: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 4, z: 1 }, { x: 5, z: 1 }],
          },
        ],
      })

      // WHEN
      gm.populateSimulation()

      // THEN
      const sim = gm.simulation!
      expect(sim.getMachines().size).toBe(2)
      expect(sim.getBelts().size).toBeGreaterThan(0)
    })

    it('should be a no-op when factory or simulation is null', () => {
      // WHEN + THEN — before starting a level, both are null
      expect(() => gm.populateSimulation()).not.toThrow()
    })

    it('should populate correctly for empty factory', () => {
      // GIVEN
      gm.startLevel('level_2')

      // WHEN
      gm.populateSimulation()

      // THEN
      const sim = gm.simulation!
      expect(sim.getMachines().size).toBe(0)
      expect(sim.getBelts().size).toBe(0)
    })
  })
})
