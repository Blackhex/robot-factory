import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../src/i18n/i18n'
import { createGameStateChangeHandler } from '../../../src/ui/createGameStateChangeHandler'
import { createSimulationEffectsWireUp } from '../../../src/ui/wireSimulationEffects'
import { wireToolbarAndOutcomeCallbacks } from '../../../src/ui/wireToolbarAndOutcomeCallbacks'
import { i18next } from '../../../src/i18n/i18n'

function createHideable() {
  return {
    show: vi.fn(),
    hide: vi.fn(),
  }
}

describe('extracted removed audio and celebration wiring', () => {
  beforeEach(async () => {
    await initI18n()
  })

  function createStateChangeFixture(lastScore: unknown = { totalStars: 3 }) {
    const audio = {
      stopBeltRolling: vi.fn(),
      playSuccess: vi.fn(),
      playError: vi.fn(),
    }
    const toolbar = {
      ...createHideable(),
      setSandboxMode: vi.fn(),
      setSimulationState: vi.fn(),
    }
    const scoreScreen = {
      ...createHideable(),
      setScore: vi.fn(),
    }
    const levelFailedScreen = {
      ...createHideable(),
      setLevelName: vi.fn(),
    }
    const saveProgress = vi.fn()
    const handler = createGameStateChangeHandler({
      gameManager: {
        currentLevel: { id: 'level-1', nameKey: 'levels.1.name' } as never,
        lastScore,
        getProgress: vi.fn(() => new Map()),
      },
      hideAllUI: vi.fn(),
      cleanupLevelRendering: vi.fn(),
      closeEditor: vi.fn(),
      mainMenu: createHideable(),
      levelSelect: { ...createHideable(), updateProgress: vi.fn() },
      toolbar,
      hud: createHideable(),
      levelBrief: { ...createHideable(), setLevel: vi.fn() },
      scoreScreen,
      levelFailedScreen,
      cameraController: { resetView: vi.fn() },
      setupBuildPhase: vi.fn(),
      setupSandbox: vi.fn(),
      autoSaveFactory: vi.fn(),
      getGridInteraction: () => null,
      wireSimulationEffects: vi.fn(),
      saveProgress,
      audio,
    })

    return {
      audio,
      toolbar,
      scoreScreen,
      levelFailedScreen,
      saveProgress,
      handler,
    }
  }

  it('does not start continuous belt/background audio when entering play_phase', () => {
    const audio = {
      stopBeltRolling: vi.fn(),
      playSuccess: vi.fn(),
      playError: vi.fn(),
      playBeltRolling: vi.fn(),
    }
    const toolbar = {
      ...createHideable(),
      setSandboxMode: vi.fn(),
      setSimulationState: vi.fn(),
    }
    const levelBrief = {
      ...createHideable(),
      setLevel: vi.fn(),
    }
    const wireSimulationEffects = vi.fn()

    const handler = createGameStateChangeHandler({
      gameManager: {
        currentLevel: { id: 'level-1', nameKey: 'levels.1.name' } as never,
        lastScore: null,
        getProgress: vi.fn(() => new Map()),
      },
      hideAllUI: vi.fn(),
      cleanupLevelRendering: vi.fn(),
      closeEditor: vi.fn(),
      mainMenu: createHideable(),
      levelSelect: { ...createHideable(), updateProgress: vi.fn() },
      toolbar,
      hud: createHideable(),
      levelBrief,
      scoreScreen: { ...createHideable(), setScore: vi.fn() },
      levelFailedScreen: { ...createHideable(), setLevelName: vi.fn() },
      cameraController: { resetView: vi.fn() },
      setupBuildPhase: vi.fn(),
      setupSandbox: vi.fn(),
      autoSaveFactory: vi.fn(),
      getGridInteraction: () => ({ disable: vi.fn() }),
      wireSimulationEffects,
      saveProgress: vi.fn(),
      audio,
    })

    handler({ data: { to: 'play_phase' } })

    expect(audio.playBeltRolling).not.toHaveBeenCalled()
    expect(wireSimulationEffects).toHaveBeenCalled()
    expect(toolbar.setSimulationState).toHaveBeenCalledWith('running')
    expect(levelBrief.show).toHaveBeenCalled()
  })

  it('does not start continuous belt/background audio from sandbox start wiring', () => {
    const toolbar = {
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
    const audio = {
      playUIClick: vi.fn(),
      playError: vi.fn(),
      playBeltRolling: vi.fn(),
    }
    const simulation = {
      running: false,
      paused: false,
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      clearInFlight: vi.fn(),
      enqueueCommands: vi.fn(),
    }
    const populateSimulation = vi.fn()
    const wireSimulationEffects = vi.fn()
    const hud = createHideable()

    wireToolbarAndOutcomeCallbacks({
      toolbar,
      scoreScreen: { onNextLevel: () => {}, onRetry: () => {}, onBackToMenu: () => {} },
      levelFailedScreen: { onRetry: () => {}, onBackToLevelSelect: () => {} },
      gameOverModal: { onRetry: () => {}, hide: vi.fn() },
      audio,
      gameManager: {
        simulation,
        getCurrentState: () => 'sandbox',
        startSimulation: vi.fn(),
        stopSimulation: vi.fn(),
        retryCurrentLevel: vi.fn(),
        enterLevelSelect: vi.fn(),
        enterMainMenu: vi.fn(),
        startLevel: vi.fn(),
      },
      pxtEditor: { getProgram: () => ['cmd'] },
      populateSimulation,
      wireSimulationEffects,
      hud,
      getItemRenderer: () => null,
      getNextLevelId: () => null,
      toggleEditor: vi.fn(),
      resetView: vi.fn(),
      autoSaveFactory: vi.fn(async () => {}),
      importFactory: vi.fn(async () => {}),
      exportFactory: vi.fn(async () => {}),
    })

    toolbar.onStart()

    expect(audio.playBeltRolling).not.toHaveBeenCalled()
    expect(audio.playUIClick).toHaveBeenCalled()
    expect(populateSimulation).toHaveBeenCalled()
    expect(wireSimulationEffects).toHaveBeenCalled()
    expect(simulation.start).toHaveBeenCalled()
    expect(hud.show).toHaveBeenCalled()
  })

  it('wires sparks for processing machines without machine-process audio', () => {
    const listeners = new Map<string, (event: { data: unknown }) => void>()
    const simulation = {
      on: vi.fn((event: 'game_over' | 'machine_state_changed', listener: (event: { data: unknown }) => void) => {
        listeners.set(event, listener)
      }),
      getMachine: vi.fn(() => ({ machineType: 'assembler' as const, name: 'Assembler 1' })),
    }
    const particleEffects = {
      emitSparksAt: vi.fn(),
    }
    const playMachineProcess = vi.fn()

    const wireSimulationEffects = createSimulationEffectsWireUp({
      getSimulation: () => simulation,
      getFactory: () => ({ getMachines: () => [{ id: 'machine-1', x: 4, z: 7 }] }),
      getParticleEffects: () => particleEffects,
      modal: { show: vi.fn() } as never,
      resolveFallbackMachineType: vi.fn(() => undefined),
      resolveFallbackMachineName: vi.fn(() => undefined),
    })

    wireSimulationEffects()
    listeners.get('machine_state_changed')?.({ data: { to: 'processing', machineId: 'machine-1' } })

    expect(playMachineProcess).not.toHaveBeenCalled()
    expect(particleEffects.emitSparksAt).toHaveBeenCalledWith(4.5, 0.5, 7.5)
  })

  it('plays success audio on score_screen without requiring any confetti hook', () => {
    const fixture = createStateChangeFixture()
    const levelName = i18next.t('levels.1.name')

    fixture.handler({ data: { to: 'score_screen' } })

    expect(fixture.audio.playSuccess).toHaveBeenCalledTimes(1)
    expect(fixture.audio.playError).not.toHaveBeenCalled()
    expect(fixture.audio.stopBeltRolling).toHaveBeenCalledTimes(1)
    expect(fixture.toolbar.setSimulationState).toHaveBeenCalledWith('stopped')
    expect(fixture.scoreScreen.setScore).toHaveBeenCalledWith(levelName, { totalStars: 3 })
    expect(fixture.scoreScreen.show).toHaveBeenCalledTimes(1)
    expect(fixture.saveProgress).toHaveBeenCalledTimes(1)
  })

  it('plays error audio on level_failed without requiring any confetti hook', () => {
    const fixture = createStateChangeFixture()
    const levelName = i18next.t('levels.1.name')

    fixture.handler({ data: { to: 'level_failed' } })

    expect(fixture.audio.playError).toHaveBeenCalledTimes(1)
    expect(fixture.audio.playSuccess).not.toHaveBeenCalled()
    expect(fixture.audio.stopBeltRolling).toHaveBeenCalledTimes(1)
    expect(fixture.toolbar.setSimulationState).toHaveBeenCalledWith('stopped')
    expect(fixture.levelFailedScreen.setLevelName).toHaveBeenCalledWith(levelName)
    expect(fixture.levelFailedScreen.show).toHaveBeenCalledTimes(1)
  })

  it('keeps UI click hooks wired through the extracted toolbar helper', () => {
    const playUIClick = vi.fn()
    const toolbar = {
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
    wireToolbarAndOutcomeCallbacks({
      toolbar,
      scoreScreen: { onNextLevel: () => {}, onRetry: () => {}, onBackToMenu: () => {} },
      levelFailedScreen: { onRetry: () => {}, onBackToLevelSelect: () => {} },
      gameOverModal: { onRetry: () => {}, hide: vi.fn() },
      audio: { playUIClick, playError: vi.fn() },
      gameManager: {
        simulation: null,
        getCurrentState: () => 'build_phase',
        startSimulation: vi.fn(),
        stopSimulation: vi.fn(),
        retryCurrentLevel: vi.fn(),
        enterLevelSelect: vi.fn(),
        enterMainMenu: vi.fn(),
        startLevel: vi.fn(),
      },
      pxtEditor: { getProgram: () => [] },
      populateSimulation: vi.fn(),
      wireSimulationEffects: vi.fn(),
      hud: createHideable(),
      getItemRenderer: () => null,
      getNextLevelId: () => null,
      toggleEditor: vi.fn(),
      resetView: vi.fn(),
      autoSaveFactory: vi.fn(async () => {}),
      importFactory: vi.fn(async () => {}),
      exportFactory: vi.fn(async () => {}),
    })

    toolbar.onPause()

    expect(playUIClick).toHaveBeenCalledTimes(1)
  })
})