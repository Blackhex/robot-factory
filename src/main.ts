import './style.css'
import { initI18n, i18next } from './i18n/i18n'
import { GameManager } from './game/GameManager'
import { getAllLevels, type LevelDefinition } from './game/Level'
import { ConveyorBelt } from './game/ConveyorBelt'
import { SceneManager } from './rendering/SceneManager'
import { FactoryRenderer } from './rendering/FactoryRenderer'
import { ItemRenderer } from './rendering/ItemRenderer'
import { GridInteraction, type PausableSimulation } from './rendering/GridInteraction'
import { CameraController } from './rendering/CameraController'
import { EditorViewportController } from './rendering/EditorViewportController'
import { ParticleEffects } from './rendering/ParticleEffects'
import { createTerminalDrainGraceDecider } from './rendering/TerminalDrainGraceAcceptability'
import { MainMenu } from './ui/MainMenu'
import { LevelSelect } from './ui/LevelSelect'
import { createEditorVisibilityController } from './ui/createEditorVisibilityController'
import { HUD } from './ui/HUD'
import { ScoreScreen } from './ui/ScoreScreen'
import { LevelFailedScreen } from './ui/LevelFailedScreen'
import { LangButton } from './ui/LangButton'
import { GameOverModal } from './ui/GameOverModal'
import { ALL_MACHINE_TYPES, type MachineType } from './game/types'
import { TutorialOverlay } from './ui/TutorialOverlay'
import { Toolbar } from './ui/Toolbar'
import { MachinePanel } from './ui/MachinePanel'
import { BeltPanel } from './ui/BeltPanel'
import { LevelBrief } from './ui/LevelBrief'
import { createGameStateChangeHandler } from './ui/createGameStateChangeHandler'
import { createFactoryBackedGameOverFallbackResolvers } from './ui/createFactoryBackedGameOverFallbackResolvers'
import { wireMenuAndPanelCallbacks } from './ui/wireMenuAndPanelCallbacks'
import { createSimulationEffectsWireUp } from './ui/wireSimulationEffects'
import { wireToolbarAndOutcomeCallbacks } from './ui/wireToolbarAndOutcomeCallbacks'
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
import { wireWindowEvents } from './utils/wireWindowEvents'
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
  // Mount on document.body (not #ui-overlay) so the modal escapes the
  // overlay's stacking context and renders above #editor-container when
  // the PXT editor panel is open.
  const gameOverModal = new GameOverModal(document.body)
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
  const editorVisibility = createEditorVisibilityController({
    editorContainer,
    resizeHandle: editorResizeHandle,
    pxtEditor,
    refitCamera: () => editorViewport.refitCameraToCurrentLevel(),
  })
  const closeEditor = (): void => editorVisibility.close()
  const toggleEditor = (): void => editorVisibility.toggle()

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
    itemRenderer.setTerminalDrainGraceDecider(createTerminalDrainGraceDecider({
      getMachineAt: (x, z) => gameManager.factory?.getMachineAt(x, z),
      getMachineById: (id) => gameManager.simulation?.getMachine(id),
    }))
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

  const wireSimulationEffects = createSimulationEffectsWireUp({
    getSimulation: () => gameManager.simulation,
    getFactory: () => gameManager.factory,
    getParticleEffects: () => particleEffects,
    modal: gameOverModal,
    ...createFactoryBackedGameOverFallbackResolvers(() => gameManager.factory),
  })

  gameManager.on('stateChanged', createGameStateChangeHandler({
    gameManager,
    hideAllUI,
    cleanupLevelRendering,
    closeEditor,
    mainMenu,
    levelSelect,
    toolbar,
    hud,
    levelBrief,
    scoreScreen,
    levelFailedScreen,
    cameraController,
    setupBuildPhase,
    setupSandbox,
    autoSaveFactory,
    getGridInteraction: () => gridInteraction,
    wireSimulationEffects,
    saveProgress,
    audio,
  }))

  wireToolbarAndOutcomeCallbacks({
    toolbar,
    scoreScreen,
    levelFailedScreen,
    gameOverModal,
    audio,
    gameManager,
    pxtEditor,
    populateSimulation,
    wireSimulationEffects,
    hud,
    getItemRenderer: () => itemRenderer,
    getNextLevelId,
    toggleEditor,
    resetView: () => cameraController.resetView(),
    autoSaveFactory,
    importFactory: async () => {
      const save = await importFromFile()
      const factory = gameManager.factory
      if (!factory) return
      importFactoryWithProgram(save, factory, pxtEditor)
      factoryRenderer?.syncMeshes()
      syncFactoryToEditor()
    },
    exportFactory: async () => {
      const factory = gameManager.factory
      if (!factory) return
      const levelId = gameManager.currentLevel?.id
      const save = await exportFactoryWithProgram(factory, pxtEditor, levelId)
      exportToFile(save)
    },
  })

  wireMenuAndPanelCallbacks({
    mainMenu,
    levelSelect,
    tutorialOverlay,
    machinePanel,
    beltPanel,
    audio,
    gameManager,
    getGridInteraction: () => gridInteraction,
    getFactoryRenderer: () => factoryRenderer,
    syncFactoryToEditor,
    autoSaveFactory,
  })

  wireWindowEvents({
    canvasContainer,
    getState: () => gameManager.getCurrentState(),
    toggleEditor,
    resizeScene: (width, height) => sceneManager.resize(width, height),
    refitCamera: () => editorViewport.refitCameraToCurrentLevel(),
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
