import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GameManager } from '../../../src/game/GameManager.ts'

/**
 * Auto-completion contract: when a campaign level's production target is
 * reached during `play_phase`, GameManager MUST transition to
 * `score_screen` without any explicit end-of-run call from the UI. There
 * is no manual fail / stop path — runs end only on auto-success.
 *
 * Drive deliveries by mutating `simulation.outputsDelivered` directly
 * (already-established pattern in GameManager.test.ts) and advance the
 * simulation with a manual `simulation.tick()` — pure unit, no belts /
 * machines / fake timers needed for the check itself.
 */
describe('GameManager auto-completion on production target reached', () => {
  let gm: GameManager

  beforeEach(() => {
    gm = new GameManager()
  })

  afterEach(() => {
    // Defensive: if auto-stop isn't wired yet the setInterval from
    // Simulation.start() would leak across tests.
    if (gm.simulation?.running) gm.simulation.stop()
  })

  it('auto-transitions to score_screen when outputsDelivered reaches the level target', () => {
    // GIVEN level_1 requires 3 produced parts (produce_parts target: 3)
    gm.startLevel('level_1')
    gm.populateSimulation()
    gm.startSimulation()
    expect(gm.getCurrentState()).toBe('play_phase')

    // WHEN the simulation reports the goal has been met and a tick runs
    gm.simulation!.outputsDelivered = 3
    gm.simulation!.tick()

    // THEN GameManager auto-transitioned without any explicit end-of-run call
    expect(gm.getCurrentState()).toBe('score_screen')
    expect(gm.lastScore).not.toBeNull()
    expect(gm.simulation!.running).toBe(false)
  })

  it('auto-transitions even when outputsDelivered exceeds the target', () => {
    // GIVEN
    gm.startLevel('level_1')
    gm.populateSimulation()
    gm.startSimulation()

    // WHEN deliveries overshoot
    gm.simulation!.outputsDelivered = 10
    gm.simulation!.tick()

    // THEN
    expect(gm.getCurrentState()).toBe('score_screen')
  })

  it('does NOT auto-transition while outputsDelivered is below the target', () => {
    // GIVEN level_1 target is 3
    gm.startLevel('level_1')
    gm.populateSimulation()
    gm.startSimulation()

    // WHEN below target ticks elapse
    gm.simulation!.outputsDelivered = 2
    gm.simulation!.tick()
    gm.simulation!.tick()

    // THEN still playing
    expect(gm.getCurrentState()).toBe('play_phase')
    expect(gm.simulation!.running).toBe(true)
  })

  it('REGRESSION: emits scoreReady when auto-completing', () => {
    // GIVEN
    const scoreReadyHandler = vi.fn()
    gm.on('scoreReady', scoreReadyHandler)
    gm.startLevel('level_1')
    gm.populateSimulation()
    gm.startSimulation()

    // WHEN
    gm.simulation!.outputsDelivered = 3
    gm.simulation!.tick()

    // THEN — same lifecycle event the score screen listens for
    expect(scoreReadyHandler).toHaveBeenCalledTimes(1)
    const event = scoreReadyHandler.mock.calls[0][0]
    expect(event.type).toBe('scoreReady')
  })
})

/**
 * Auto-completion must NOT fire when the level has no positive
 * production target (requiredCount === 0). Otherwise the very first
 * tick of a goal-less / sandbox-like level would transition to
 * `score_screen` because `0 >= 0` is trivially true. We inject a
 * fixture level with no `produce_*` goals by mocking the Level module.
 */
describe('GameManager auto-completion guard: requiredCount === 0', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('../../../src/game/Level.ts')
    vi.resetModules()
  })

  it('does NOT auto-transition on a level whose goals contain no produce_* targets', async () => {
    // GIVEN a fixture level with only a quality_target — no produce_* goal,
    // so computeRequiredOutputs(level) === 0
    vi.doMock('../../../src/game/Level.ts', async () => {
      const actual =
        await vi.importActual<typeof import('../../../src/game/Level.ts')>(
          '../../../src/game/Level.ts',
        )
      const fixture: import('../../../src/game/Level.ts').LevelDefinition = {
        id: 'fixture_no_production',
        nameKey: 'levels.fixture.name',
        descriptionKey: 'levels.fixture.description',
        gridSize: { width: 10, height: 10 },
        availableMachines: ['factory_output'],
        unlockedBlocks: 0,
        goals: [{ type: 'quality_target', target: 80 }],
        parScores: { speed: 1, cost: 1, quality: 80 },
      }
      return {
        ...actual,
        getLevelById: (id: string) =>
          id === 'fixture_no_production' ? fixture : actual.getLevelById(id),
      }
    })

    const { GameManager: GM } = await import('../../../src/game/GameManager.ts')
    const gm = new GM()
    try {
      // WHEN
      gm.startLevel('fixture_no_production')
      gm.populateSimulation()
      gm.startSimulation()
      expect(gm.getCurrentState()).toBe('play_phase')

      // outputsDelivered stays at 0; requiredCount is 0 — naive
      // `0 >= 0` would falsely "succeed".
      gm.simulation!.tick()
      gm.simulation!.tick()

      // THEN — no auto-success
      expect(gm.getCurrentState()).toBe('play_phase')
      expect(gm.lastScore).toBeNull()
      expect(gm.simulation!.running).toBe(true)
    } finally {
      if (gm.simulation?.running) gm.simulation.stop()
    }
  })
})
