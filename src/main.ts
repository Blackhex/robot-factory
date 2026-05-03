import './style.css'
import { initI18n, i18next } from './i18n/i18n'
import { GameManager, type GameState } from './game/GameManager'
import { getAllLevels, type LevelDefinition } from './game/Level'
import { ConveyorBelt } from './game/ConveyorBelt'
import { SceneManager } from './rendering/SceneManager'
import { FactoryRenderer } from './rendering/FactoryRenderer'
import { ItemRenderer } from './rendering/ItemRenderer'
import { GridInteraction, type PausableSimulation } from './rendering/GridInteraction'
import { CameraController } from './rendering/CameraController'
import { EditorViewportController } from './rendering/EditorViewportController'
import { ParticleEffects } from './rendering/ParticleEffects'
import { MainMenu } from './ui/MainMenu'
import { LevelSelect } from './ui/LevelSelect'
import { HUD } from './ui/HUD'
import { ScoreScreen } from './ui/ScoreScreen'
import { LevelFailedScreen } from './ui/LevelFailedScreen'
import { LangButton } from './ui/LangButton'
import { GameOverModal } from './ui/GameOverModal'
import type { GameOverInfo } from './game/types'
import { ALL_MACHINE_TYPES, type MachineType } from './game/types'
import { TutorialOverlay } from './ui/TutorialOverlay'
import { Toolbar } from './ui/Toolbar'
import { MachinePanel } from './ui/MachinePanel'
import { BeltPanel } from './ui/BeltPanel'
import { LevelBrief } from './ui/LevelBrief'
import { PxtEditor } from './editor/PxtEditor'
import { AudioManager } from './audio/AudioManager'
import {
  exportToFile,
  importFromFile,
} from './utils/SaveLoad'
import {
  autoSaveFactory as autoSaveFactoryImpl,
  autoRestoreFactory as autoRestoreFactoryImpl,
  exportFactoryWithProgram,
  importFactoryWithProgram,
} from './utils/AutoSave'
import { getTutorialSteps } from './game/Tutorials'

const PROGRESS_KEY = 'rf_progress'

async function main(): Promise<void> {
  await initI18n()

  const canvasContainer = document.getElementById('canvas-container')!
  const uiOverlay = document.getElementById('ui-overlay')!
  const editorContainer = document.getElementById('editor-container')!

  // --- Persistent systems ---

  const sceneManager = new SceneManager()
  sceneManager.mount(canvasContainer)

  const audio = AudioManager.getInstance()
  const cameraController = new CameraController(
    sceneManager.getCamera(),
    sceneManager.getControls(),
  )

  let particleEffects: ParticleEffects | null = null

  const gameManager = new GameManager()
  // Expose for E2E tests (dev only)
  if (import.meta.env.DEV) {
    ;(window as any).__gameManager = gameManager
    ;(window as any).__getFactoryRenderer = () => factoryRenderer
    ;(window as any).__sceneManager = sceneManager
  }

  // Load saved progress from localStorage
  const saved = localStorage.getItem(PROGRESS_KEY)
  if (saved) {
    try { gameManager.loadProgress(JSON.parse(saved)) } catch { /* ignore corrupt data */ }
  }

  // --- UI components (persistent across levels) ---

  const mainMenu = new MainMenu(uiOverlay)
  const levelSelect = new LevelSelect(uiOverlay)
  const hud = new HUD(uiOverlay)
  const scoreScreen = new ScoreScreen(uiOverlay)
  const levelFailedScreen = new LevelFailedScreen(uiOverlay)
  const gameOverModal = new GameOverModal(uiOverlay)
  // Global language toggle: must be visible on every screen including the
  // Main Menu and Level Select where the toolbar is hidden (UX blocker B2).
  // The toolbar no longer renders its own copy of `.ui-lang-btn` — this is
  // the single canonical instance of that selector.
  new LangButton(uiOverlay)
  // Mounted on document.body (not uiOverlay) so the tooltip's z-index escapes
  // the #ui-overlay stacking context (z-index 10) and renders above the editor.
  const tutorialOverlay = new TutorialOverlay(document.body)
  const toolbar = new Toolbar(uiOverlay)
  const machinePanel = new MachinePanel(uiOverlay)
  const beltPanel = new BeltPanel(uiOverlay)
  const levelBrief = new LevelBrief(uiOverlay)

  const pxtEditor = new PxtEditor()
  pxtEditor.mount(editorContainer)
  pxtEditor.hide()

  // --- Per-level state (recreated each level) ---

  let factoryRenderer: FactoryRenderer | null = null
  let itemRenderer: ItemRenderer | null = null
  let gridInteraction: GridInteraction | null = null
  let editorVisible = false

  // --- Helpers ---

  function hideAllUI(): void {
    for (const c of [
      mainMenu, levelSelect, hud, scoreScreen, levelFailedScreen, gameOverModal,
      tutorialOverlay, toolbar, machinePanel, beltPanel, levelBrief,
    ]) c.hide()
  }

  const editorResizeHandle = document.getElementById('editor-resize-handle')!

  const editorViewport = new EditorViewportController({
    canvasContainer,
    editorContainer,
    resizeHandle: editorResizeHandle,
    cameraController,
    getFactorySize: () => {
      const factory = gameManager.factory
      return factory ? { width: factory.width, height: factory.height } : null
    },
    onResize: (w, h) => sceneManager.resize(w, h),
  })
  editorViewport.attachResizeDrag()

  function openEditor(): void {
    editorVisible = true
    editorContainer.classList.add('open')
    // Mirror onto <body> so narrow-viewport responsive CSS can dock the
    // level brief out of the editor's way (UX blocker B3).
    document.body.classList.add('editor-open')
    editorResizeHandle.style.display = 'block'
    editorResizeHandle.style.right = editorContainer.style.width
      ? `calc(${editorContainer.style.width} - 3px)`
      : 'calc(max(500px, 40%) - 3px)'
    pxtEditor.show()
    // Refit so required machines stay in the unobscured canvas region.
    editorViewport.refitCameraToCurrentLevel()
  }

  function closeEditor(): void {
    editorVisible = false
    editorContainer.classList.remove('open')
    document.body.classList.remove('editor-open')
    editorResizeHandle.style.display = 'none'
    pxtEditor.hide()
    // Restore the standard centred fit now that the canvas is fully visible.
    editorViewport.refitCameraToCurrentLevel()
  }

  function toggleEditor(): void {
    if (editorVisible) closeEditor()
    else openEditor()
  }

  function saveProgress(): void {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(gameManager.saveProgress()))
  }

  function getLevelIndex(level: LevelDefinition): number {
    const idx = getAllLevels().indexOf(level)
    return idx >= 0 ? idx + 1 : 1
  }

  function getNextLevelId(): string | null {
    const level = gameManager.currentLevel
    if (!level) return null
    const levels = getAllLevels()
    const idx = levels.indexOf(level)
    if (idx < 0 || idx >= levels.length - 1) return null
    return levels[idx + 1].id
  }

  const autoSaveFactory = (): Promise<void> =>
    autoSaveFactoryImpl(gameManager.factory, pxtEditor, gameManager.currentLevel?.id)
  const autoRestoreFactory = (): boolean =>
    autoRestoreFactoryImpl(gameManager.factory, pxtEditor, gameManager.currentLevel?.id)

  function syncFactoryToEditor(): void {
    const factory = gameManager.factory
    if (!factory) return
    pxtEditor.updateMachineList(
      factory.getMachines().map(m => ({ id: m.id, name: m.name, type: m.type })),
    )
    pxtEditor.updateBeltList(factory.getBelts().map(b => ({
      id: b.id, name: b.name, sourceName: b.sourceMachine.name, destName: b.destinationMachine.name,
    })))
  }

  function getHUDStats() {
    return gameManager.simulation?.getStats()
      ?? { itemsProduced: 0, robotsCompleted: 0, timeElapsed: 0, qualityPercent: 100, outputsDelivered: 0 }
  }

  function getPausableSimulation(): PausableSimulation | undefined {
    return gameManager.simulation ?? undefined
  }

  function cleanupLevelRendering(): void {
    gridInteraction?.dispose(); gridInteraction = null
    factoryRenderer?.dispose(); factoryRenderer = null
    itemRenderer?.dispose(); itemRenderer = null
    particleEffects?.dispose(); particleEffects = null
    audio.stopBeltRolling()
  }

  function wireGridInteractionCallbacks(gi: GridInteraction): void {
    gi.onMachineSelected = (machine) => {
      beltPanel.hide()
      factoryRenderer?.clearBeltHighlight()
      machinePanel.setMachine(machine)
    }
    gi.onBeltSelected = (chain) => {
      machinePanel.hide()
      if (chain) {
        factoryRenderer?.highlightBelts([chain.id])
        beltPanel.setBeltChain(chain)
      } else {
        factoryRenderer?.clearBeltHighlight()
        beltPanel.setBeltChain(null)
      }
    }
  }

  function populateSimulation(): void {
    gameManager.populateSimulation()
    if (itemRenderer && gameManager.simulation) {
      itemRenderer.cacheBeltTopology(gameManager.simulation.getBelts())
    }
  }

  interface SetupLevelRenderingConfig {
    gridSize: { width: number; height: number }
    availableMachines: readonly MachineType[]
    pxtLevelIndex: number
    hudName: string
  }

  function setupLevelRendering(config: SetupLevelRenderingConfig): void {
    const factory = gameManager.factory
    if (!factory) return

    cleanupLevelRendering()

    factoryRenderer = new FactoryRenderer(factory, sceneManager)
    factoryRenderer.renderGrid()
    itemRenderer = new ItemRenderer(sceneManager.getScene())
    particleEffects = new ParticleEffects(sceneManager.getScene())

    gridInteraction = new GridInteraction(sceneManager, factory, () => {
      factoryRenderer?.syncMeshes()
      syncFactoryToEditor()
    }, factoryRenderer, getPausableSimulation)
    wireGridInteractionCallbacks(gridInteraction)
    gridInteraction.enable()

    pxtEditor.setLevel(config.pxtLevelIndex)
    hud.setLevelName(config.hudName)
    machinePanel.setAvailableMachineTypes([...config.availableMachines])

    autoRestoreFactory()
    factoryRenderer.syncMeshes()
    syncFactoryToEditor()

    cameraController.zoomToFit(
      config.gridSize.width,
      config.gridSize.height,
      editorViewport.getVisibleCanvasWidth(),
    )
  }

  function setupBuildPhase(level: LevelDefinition): void {
    const idx = getLevelIndex(level)
    setupLevelRendering({
      gridSize: level.gridSize,
      availableMachines: level.availableMachines,
      pxtLevelIndex: idx,
      hudName: i18next.t(level.nameKey),
    })
    const steps = getTutorialSteps(idx)
    if (steps.length > 0) {
      tutorialOverlay.loadTutorial(steps)
      tutorialOverlay.start()
    }
  }

  function setupSandbox(): void {
    setupLevelRendering({
      gridSize: { width: 20, height: 20 },
      availableMachines: ALL_MACHINE_TYPES,
      pxtLevelIndex: 10,
      hudName: i18next.t('main_menu.sandbox'),
    })
  }

  // Expose test helpers in dev mode
  if (import.meta.env.DEV) {
    (window as any).__test = {
      getMachines: () => {
        const factory = gameManager.factory
        if (!factory) return []
        return factory.getMachines().map(m => ({ id: m.id, type: m.type, x: m.x, z: m.z, rotation: m.rotation }))
      },
      placeBelt: (srcX: number, srcZ: number, dstX: number, dstZ: number) => {
        const factory = gameManager.factory
        if (!factory) return false
        const src = factory.getMachineAt(srcX, srcZ)
        const dst = factory.getMachineAt(dstX, dstZ)
        if (!src || !dst) return false
        const result = factory.placeBeltChain(src, dst, 'output')
        factoryRenderer?.syncMeshes()
        return !!result
      },
      getBelts: () => {
        const factory = gameManager.factory
        if (!factory) return []
        return factory.getBelts().map(b => ({ id: b.id, sourceMachine: b.sourceMachine.id, path: b.path }))
      },
    }
  }

  // --- GameManager state change handler ---

  gameManager.on('stateChanged', (event) => {
    const newState = event.data.to as GameState

    hideAllUI()

    switch (newState) {
      case 'main_menu':
        cleanupLevelRendering()
        closeEditor()
        mainMenu.show()
        cameraController.resetView()
        break

      case 'level_select':
        cleanupLevelRendering()
        closeEditor()
        levelSelect.updateProgress(gameManager.getProgress())
        levelSelect.show()
        break

      case 'build_phase': {
        const level = gameManager.currentLevel
        if (level) {
          toolbar.show()
          toolbar.setSandboxMode(false)
          toolbar.setSimulationState('idle')
          setupBuildPhase(level)
          levelBrief.setLevel(level)
          levelBrief.show()
        }
        break
      }

      case 'play_phase':
        // Auto-save factory before entering play
        void autoSaveFactory()
        toolbar.show()
        toolbar.setSandboxMode(false)
        toolbar.setSimulationState('running')
        hud.show()
        // Keep the level brief visible so the player remembers the goal.
        if (gameManager.currentLevel) levelBrief.show()
        gridInteraction?.disable()
        // Start belt audio
        audio.playBeltRolling()
        // Wire simulation events for particles and audio
        wireSimulationEffects()
        break

      case 'score_screen': {
        closeEditor()
        audio.stopBeltRolling()
        toolbar.setSimulationState('stopped')
        const score = gameManager.lastScore
        const level = gameManager.currentLevel
        if (score && level) {
          scoreScreen.setScore(i18next.t(level.nameKey), score)
          scoreScreen.show()
          saveProgress()
          // Success audio + confetti
          audio.playSuccess()
          particleEffects?.emitConfetti(level.gridSize.width, level.gridSize.height)
        }
        break
      }

      case 'level_failed': {
        closeEditor()
        audio.stopBeltRolling()
        toolbar.setSimulationState('stopped')
        const level = gameManager.currentLevel
        levelFailedScreen.setLevelName(level ? i18next.t(level.nameKey) : '')
        levelFailedScreen.show()
        // Soft error cue — distinct from game-over modal so we don't queue
        // an additional sting on top of any currently-playing audio.
        audio.playError()
        break
      }

      case 'sandbox':
        toolbar.show()
        toolbar.setSandboxMode(true)
        toolbar.setSimulationState('idle')
        setupSandbox()
        break
    }
  })

  // Wraps a UI handler with the standard click sound. Used pervasively below
  // to avoid copy-pasting `audio.playUIClick()` into every callback.
  const click = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A): void => {
    audio.playUIClick()
    fn(...args)
  }

  // --- MainMenu callbacks ---

  mainMenu.onStart = click(() => gameManager.enterLevelSelect())
  mainMenu.onSandbox = click(() => gameManager.enterSandbox())

  // --- LevelSelect callbacks ---

  levelSelect.onLevelSelected = click((levelId: string) => gameManager.startLevel(levelId))
  levelSelect.onBack = click(() => gameManager.enterMainMenu())

  // --- Toolbar simulation callbacks ---

  // Small toolbar state mutations shared by sim start/resume callbacks.
  const setRunning = (): void => { toolbar.setPaused(false); toolbar.setSimulationState('running') }

  toolbar.onStart = () => {
    audio.playUIClick()
    const state = gameManager.getCurrentState()
    const sim = gameManager.simulation

    if (state === 'build_phase') {
      populateSimulation()
      const commands = pxtEditor.getProgram()
      if (commands.length > 0) sim?.enqueueCommands(commands)
      gameManager.startSimulation()
      setRunning()
    } else if (state === 'play_phase' && sim?.paused) {
      sim.resume(); setRunning()
    } else if (state === 'sandbox' && sim) {
      if (sim.paused) {
        sim.resume(); setRunning()
      } else if (!sim.running) {
        populateSimulation()
        const commands = pxtEditor.getProgram()
        if (commands.length > 0) sim.enqueueCommands(commands)
        audio.playBeltRolling()
        wireSimulationEffects()
        sim.start()
        hud.show()
        setRunning()
      }
    }
  }

  toolbar.onPause = click(() => {
    const sim = gameManager.simulation
    if (sim?.running && !sim.paused) {
      sim.pause()
      toolbar.setPaused(true)
      toolbar.setSimulationState('paused')
    }
  })

  toolbar.onResume = click(() => {
    const sim = gameManager.simulation
    if (sim?.running && sim.paused) { sim.resume(); setRunning() }
  })

  const restartCurrentSession = () => {
    const state = gameManager.getCurrentState()
    if (state === 'play_phase') {
      gameManager.stopSimulation()
    } else if (state === 'sandbox') {
      gameManager.simulation?.clearInFlight()
      itemRenderer?.clear()
      hud.hide()
    }
    toolbar.setPaused(false)
    toolbar.setSimulationState('idle')
  }

  toolbar.onRestart = click(restartCurrentSession)

  // Shared "retry the current level" and "back to level select" helpers used
  // by both the score and level-failed screens. The audio click is a UI
  // concern and stays here; the game-layer restart is delegated to
  // `gameManager.retryCurrentLevel()` so we don't duplicate the lookup.
  const retry = click(() => gameManager.retryCurrentLevel())
  const goToLevelSelectWithSfx = click(() => gameManager.enterLevelSelect())

  // --- ScoreScreen / LevelFailed / GameOver callbacks ---

  scoreScreen.onNextLevel = click(() => {
    const nextId = getNextLevelId()
    if (nextId) gameManager.startLevel(nextId)
    else gameManager.enterLevelSelect()
  })
  scoreScreen.onRetry = retry
  scoreScreen.onBackToMenu = goToLevelSelectWithSfx
  levelFailedScreen.onRetry = retry
  levelFailedScreen.onBackToLevelSelect = goToLevelSelectWithSfx
  gameOverModal.onRetry = click(() => {
    gameOverModal.hide()
    restartCurrentSession()
  })

  // --- Tutorial callback ---

  tutorialOverlay.onComplete = () => tutorialOverlay.hide()

  // --- Machine + belt panel callbacks ---

  machinePanel.onDelete = click(() => gridInteraction?.deleteSelectedMachine())

  beltPanel.onDelete = click(() => {
    if (!gridInteraction) return
    gridInteraction.deleteSelectedBelt()
    factoryRenderer?.clearBeltHighlight()
    factoryRenderer?.syncMeshes()
    beltPanel.hide()
  })

  beltPanel.onNameChange = (belt, newName) => {
    const factory = gameManager.factory
    if (!factory) return
    factory.renameBelt(belt.id, newName)
    syncFactoryToEditor()
    void autoSaveFactory()
  }

  machinePanel.onTypeChange = click((machine, newType) => {
    const factory = gameManager.factory
    if (!factory) return
    if (factory.updateMachineType(machine.x, machine.z, newType)) {
      factoryRenderer?.syncMeshes()
      machinePanel.setMachine(factory.getMachineAt(machine.x, machine.z))
    }
  })

  machinePanel.onNameChange = (machine, newName) => {
    const factory = gameManager.factory
    if (!factory) return
    factory.renameMachine(machine.x, machine.z, newName)
    void autoSaveFactory()
  }

  toolbar.onToggleEditor = click(toggleEditor)
  toolbar.onBackToMenu = click(() => gameManager.enterMainMenu())
  toolbar.onResetView = click(() => cameraController.resetView())
  toolbar.onSave = click(() => { void autoSaveFactory() })

  toolbar.onLoad = click(() => {
    void importFromFile()
      .then((save) => {
        const factory = gameManager.factory
        if (!factory) return
        importFactoryWithProgram(save, factory, pxtEditor)
        factoryRenderer?.syncMeshes()
        syncFactoryToEditor()
      })
      .catch(() => audio.playError())
  })

  toolbar.onExport = async () => {
    audio.playUIClick()
    const factory = gameManager.factory
    if (!factory) return
    const levelId = gameManager.currentLevel?.id
    const save = await exportFactoryWithProgram(factory, pxtEditor, levelId)
    exportToFile(save)
  }

  // --- Simulation effects (particles + audio) ---

  let wiredSim: object | null = null

  function wireSimulationEffects(): void {
    const sim = gameManager.simulation
    if (!sim || sim === wiredSim) return
    wiredSim = sim

    sim.on('game_over', (event) => {
      gameOverModal.show(event.data as unknown as GameOverInfo)
    })

    sim.on('machine_state_changed', (event) => {
      if (event.data.to === 'processing') {
        audio.playMachineProcess()
        // Emit sparks at machine position
        const machineId = event.data.machineId as string
        const factory = gameManager.factory
        if (factory && particleEffects) {
          const machines = factory.getMachines()
          const info = machines.find((m) => m.id === machineId)
          if (info) {
            particleEffects.emitSparksAt(info.x + 0.5, 0.5, info.z + 0.5)
          }
        }
      }
    })
  }

  // --- Keyboard: E to toggle editor ---

  window.addEventListener('keydown', (e) => {
    if (e.key === 'e' || e.key === 'E') {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const state = gameManager.getCurrentState()
      if (state === 'build_phase' || state === 'sandbox') {
        toggleEditor()
      }
    }
  })

  // --- Window resize ---

  window.addEventListener('resize', () => {
    const { clientWidth, clientHeight } = canvasContainer
    sceneManager.resize(clientWidth, clientHeight)
    // The editor panel may shift (40% width is viewport-relative) so refit.
    editorViewport.refitCameraToCurrentLevel()
  })

  // --- Initial state ---

  gameManager.enterMainMenu()

  // --- Animation loop with HUD updates ---

  sceneManager.onAnimate((dt) => {
    const sim = gameManager.simulation
    const factory = gameManager.factory
    const paused = !sim?.running || !!sim?.paused

    factoryRenderer?.syncMeshes()
    // Per-belt chevron scroll rate: probe sim by belt logical id (multi-cell
    // belts are stored as `${id}_seg${N}`; segment lookup is centralized in
    // ConveyorBelt.getBeltSpeedByLogicalId). When `sim` is missing we omit
    // getSpeed entirely so the renderer falls back to its built-in default
    // 1.0 UV/sec advance.
    const getSpeed = sim
      ? (beltLogicalId: string): number =>
          ConveyorBelt.getBeltSpeedByLogicalId(sim, beltLogicalId)
      : undefined
    factoryRenderer?.tick(dt, paused, getSpeed)
    cameraController.update(dt)
    particleEffects?.update(dt)

    // Update item meshes on belts when simulation is running
    if (itemRenderer && sim?.running && factory) {
      const beltRenderData = itemRenderer.buildRenderData(sim.getBelts())

      itemRenderer.update(beltRenderData, factory.width, factory.height, dt, !!sim?.paused)

      // Publish rendered item count as a data attribute for testability
      const totalItems = beltRenderData.reduce((sum, b) => sum + b.items.length, 0)
      canvasContainer.dataset.renderedItems = String(totalItems)
      canvasContainer.dataset.itemsDelivered = String(sim.itemsDelivered)
    } else {
      canvasContainer.dataset.renderedItems = '0'
      canvasContainer.dataset.itemsDelivered = '0'
    }

    const state = gameManager.getCurrentState()
    if (state === 'play_phase' || (state === 'sandbox' && gameManager.simulation?.running)) {
      hud.update(getHUDStats())
    }
  })

  sceneManager.animate()
}

main()
