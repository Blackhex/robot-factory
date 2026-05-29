import { describe, expect, it, vi } from 'vitest'
import { wireToolbarAndOutcomeCallbacks } from '../../../src/ui/wireToolbarAndOutcomeCallbacks'
import type { GameState } from '../../../src/game/GameManager'

function createHideable() {
  return { show: vi.fn(), hide: vi.fn() }
}

function createToolbar() {
  return {
    onStart: () => {},
    onPause: () => {},
    onResume: () => {},
    onRestart: () => {},
    onToggleEditor: () => {},
    onBackToMenu: () => {},
    onResetView: () => {},
    onSave: () => {},
    onLoad: () => {},
    onExport: () => {},
    setPaused: vi.fn(),
    setSimulationState: vi.fn(),
  }
}

function createSimulation(overrides: Partial<{ running: boolean; paused: boolean }> = {}) {
  return {
    running: overrides.running ?? true,
    paused: overrides.paused ?? false,
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    clearInFlight: vi.fn(),
    enqueueCommands: vi.fn(),
  }
}

interface FixtureOptions {
  state: GameState
  simulation?: ReturnType<typeof createSimulation> | null
  itemRenderer?: { clear: ReturnType<typeof vi.fn<() => void>> } | null
}

function setupFixture(opts: FixtureOptions) {
  const toolbar = createToolbar()
  const audio = { playUIClick: vi.fn(), playError: vi.fn() }
  const hud = createHideable()
  const simulation = opts.simulation === undefined ? createSimulation() : opts.simulation
  const itemRenderer = opts.itemRenderer === undefined ? { clear: vi.fn<() => void>() } : opts.itemRenderer

  // Simulate post-restart state observable via factory/currentLevel preservation
  const factoryRef = { sentinel: 'factory' }
  const levelRef = { id: 'level-1', sentinel: 'level' }

  const gameManager = {
    simulation,
    factory: factoryRef,
    currentLevel: levelRef,
    getCurrentState: vi.fn((): GameState => opts.state),
    startSimulation: vi.fn(),
    resetSimulationForRetry: vi.fn(() => {
      if (simulation) simulation.running = false
      gameManager.getCurrentState = vi.fn((): GameState => 'build_phase')
    }),
    retryCurrentLevel: vi.fn(),
    enterLevelSelect: vi.fn(),
    enterMainMenu: vi.fn(),
    startLevel: vi.fn(),
  }

  const populateSimulation = vi.fn()
  const wireSimulationEffects = vi.fn()

  const { restartCurrentSession } = wireToolbarAndOutcomeCallbacks({
    toolbar,
    scoreScreen: { onNextLevel: () => {}, onRetry: () => {}, onBackToMenu: () => {} },
    gameOverModal: { onRetry: () => {}, hide: vi.fn() },
    audio,
    gameManager,
    pxtEditor: { getProgram: () => [] },
    populateSimulation,
    wireSimulationEffects,
    hud,
    getItemRenderer: () => itemRenderer,
    getNextLevelId: () => null,
    toggleEditor: vi.fn(),
    resetView: vi.fn(),
  })

  return {
    toolbar,
    audio,
    hud,
    simulation,
    itemRenderer,
    gameManager,
    factoryRef,
    levelRef,
    populateSimulation,
    wireSimulationEffects,
    restartCurrentSession,
  }
}

describe('wireToolbarAndOutcomeCallbacks — Restart in play_phase (mid-simulation)', () => {
  it('does NOT score the run (no transition to score_screen)', () => {
    const fx = setupFixture({ state: 'play_phase' })

    fx.restartCurrentSession()

    expect(fx.gameManager.resetSimulationForRetry).toHaveBeenCalledTimes(1)
    // Whatever state the GM ends up in after a restart, it must not be a
    // terminal scoring state.
    const finalState = fx.gameManager.getCurrentState()
    expect(finalState).not.toBe('score_screen')
  })

  it('clears in-flight items on the simulation and the item renderer', () => {
    const fx = setupFixture({ state: 'play_phase' })

    fx.restartCurrentSession()

    expect(fx.simulation!.clearInFlight).toHaveBeenCalledTimes(1)
    expect(fx.itemRenderer!.clear).toHaveBeenCalledTimes(1)
  })

  it('hides the HUD (mirrors sandbox Restart)', () => {
    const fx = setupFixture({ state: 'play_phase' })

    fx.restartCurrentSession()

    expect(fx.hud.hide).toHaveBeenCalledTimes(1)
  })

  it('stops the simulation cleanly so a subsequent Start can re-run', () => {
    const fx = setupFixture({ state: 'play_phase' })

    fx.restartCurrentSession()

    expect(fx.simulation!.running).toBe(false)
  })

  it('preserves the factory layout and current level (does NOT do a full startLevel re-run)', () => {
    const fx = setupFixture({ state: 'play_phase' })

    fx.restartCurrentSession()

    expect(fx.gameManager.startLevel).not.toHaveBeenCalled()
    expect(fx.gameManager.retryCurrentLevel).not.toHaveBeenCalled()
    expect(fx.gameManager.factory).toBe(fx.factoryRef)
    expect(fx.gameManager.currentLevel).toBe(fx.levelRef)
  })

  it('returns GameManager to a pre-Start (non-play, non-terminal) state', () => {
    const fx = setupFixture({ state: 'play_phase' })

    fx.restartCurrentSession()

    const finalState = fx.gameManager.getCurrentState()
    // Must be a state from which pressing Start re-runs the simulation —
    // i.e. not still play_phase, not a scoring terminal state.
    expect(finalState).not.toBe('play_phase')
    expect(finalState).not.toBe('score_screen')
  })

  it('sets toolbar paused=false and simulation state to idle (regression)', () => {
    const fx = setupFixture({ state: 'play_phase' })

    fx.restartCurrentSession()

    expect(fx.toolbar.setPaused).toHaveBeenCalledWith(false)
    expect(fx.toolbar.setSimulationState).toHaveBeenCalledWith('idle')
  })
})

describe('wireToolbarAndOutcomeCallbacks — Restart regressions for non-play states', () => {
  it('Restart in sandbox still clears in-flight items, hides HUD, idles toolbar', () => {
    const fx = setupFixture({ state: 'sandbox' })

    fx.restartCurrentSession()

    expect(fx.simulation!.clearInFlight).toHaveBeenCalledTimes(1)
    expect(fx.itemRenderer!.clear).toHaveBeenCalledTimes(1)
    expect(fx.hud.hide).toHaveBeenCalledTimes(1)
    expect(fx.toolbar.setPaused).toHaveBeenCalledWith(false)
    expect(fx.toolbar.setSimulationState).toHaveBeenCalledWith('idle')
  })

  it('Restart in build_phase is a safe no-op for the simulation (does not score, does not crash)', () => {
    const fx = setupFixture({ state: 'build_phase', simulation: null, itemRenderer: null })

    expect(() => fx.restartCurrentSession()).not.toThrow()

    expect(fx.gameManager.resetSimulationForRetry).not.toHaveBeenCalled()
    expect(fx.gameManager.startLevel).not.toHaveBeenCalled()
    expect(fx.gameManager.retryCurrentLevel).not.toHaveBeenCalled()
    expect(fx.toolbar.setPaused).toHaveBeenCalledWith(false)
    expect(fx.toolbar.setSimulationState).toHaveBeenCalledWith('idle')
  })
})
