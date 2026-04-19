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
      // GIVEN
      gm.startLevel('level_1')
      gm.startSimulation()

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
      // GIVEN
      gm.startLevel('level_1')
      gm.startSimulation()
      gm.stopSimulation()

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
      // GIVEN
      const handler = vi.fn()
      gm.on('scoreReady', handler)
      gm.startLevel('level_1')
      gm.startSimulation()

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
    it('should store stars after scoring', () => {
      // GIVEN + WHEN
      gm.startLevel('level_1')
      gm.startSimulation()
      gm.stopSimulation()

      // THEN
      const progress = gm.getProgress()
      expect(progress.has('level_1')).toBe(true)
    })

    it('should keep highest star count for a level', () => {
      // GIVEN — first attempt
      gm.startLevel('level_1')
      gm.startSimulation()
      gm.stopSimulation()
      const firstStars = gm.getProgress().get('level_1')!

      // WHEN — second attempt
      gm.startLevel('level_1')
      gm.startSimulation()
      gm.stopSimulation()
      const secondStars = gm.getProgress().get('level_1')!

      // THEN
      expect(secondStars).toBeGreaterThanOrEqual(firstStars)
    })

    it('should count completed levels', () => {
      // GIVEN + WHEN
      gm.startLevel('level_1')
      gm.startSimulation()
      gm.stopSimulation()

      // THEN
      expect(gm.getCompletedLevelCount()).toBe(1)
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
      gm.startLevel('level_1')
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
      gm.startLevel('level_1')
      const factory = gm.factory!
      factory.placeMachine(1, 1, 'part_fabricator', 'south')
      factory.placeMachine(5, 1, 'assembler', 'south')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(5, 1)!)
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 6, 5],
          expected: [
            '| | | | | | | |',
            '| |F|─|─|─|A| |',
            '| | | | | | | |',
            '| | | | | | | |',
            '| | | | | | | |',
            '| | | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 1, z: 1, rotation: 'east' },
          { x: 5, z: 1, rotation: 'east' },
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
      gm.startLevel('level_1')
      const factory = gm.factory!
      factory.placeMachine(1, 1, 'part_fabricator', 'south')
      factory.placeMachine(5, 1, 'assembler', 'south')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(5, 1)!)
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 6, 5],
          expected: [
            '| | | | | | | |',
            '| |F|─|─|─|A| |',
            '| | | | | | | |',
            '| | | | | | | |',
            '| | | | | | | |',
            '| | | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 1, z: 1, rotation: 'east' },
          { x: 5, z: 1, rotation: 'east' },
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
      gm.startLevel('level_1')

      // WHEN
      gm.populateSimulation()

      // THEN
      const sim = gm.simulation!
      expect(sim.getMachines().size).toBe(0)
      expect(sim.getBelts().size).toBe(0)
    })
  })
})
