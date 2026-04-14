import './style.css'
import { initI18n, i18next } from './i18n/i18n'
import { GameManager, type GameState } from './game/GameManager'
import { getAllLevels, type LevelDefinition } from './game/Level'
import { SceneManager } from './rendering/SceneManager'
import { FactoryRenderer } from './rendering/FactoryRenderer'
import { ItemRenderer } from './rendering/ItemRenderer'
import { GridInteraction } from './rendering/GridInteraction'
import { CameraController } from './rendering/CameraController'
import { ParticleEffects } from './rendering/ParticleEffects'
import { MainMenu } from './ui/MainMenu'
import { LevelSelect } from './ui/LevelSelect'
import { HUD } from './ui/HUD'
import { ScoreScreen } from './ui/ScoreScreen'
import { TutorialOverlay, type TutorialStep } from './ui/TutorialOverlay'
import { Toolbar } from './ui/Toolbar'
import { MachinePanel } from './ui/MachinePanel'
import { BeltPanel } from './ui/BeltPanel'
import { PxtEditor } from './editor/PxtEditor'
import { AudioManager } from './audio/AudioManager'
import {
  saveFactory,
  loadFactory,
  saveToLocalStorage,
  loadFromLocalStorage,
  exportToFile,
  importFromFile,
} from './utils/SaveLoad'
import * as THREE from 'three'

const PROGRESS_KEY = 'rf_progress'
const FACTORY_SAVE_PREFIX = 'rf_factory_'

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
  // Expose for E2E tests
  ;(window as any).__gameManager = gameManager
  ;(window as any).__getFactoryRenderer = () => factoryRenderer
  ;(window as any).__sceneManager = sceneManager

  // Load saved progress from localStorage
  const saved = localStorage.getItem(PROGRESS_KEY)
  if (saved) {
    try {
      gameManager.loadProgress(JSON.parse(saved))
    } catch {
      // ignore corrupt data
    }
  }

  // --- UI components (persistent across levels) ---

  const mainMenu = new MainMenu(uiOverlay)
  const levelSelect = new LevelSelect(uiOverlay)
  const hud = new HUD(uiOverlay)
  const scoreScreen = new ScoreScreen(uiOverlay)
  const tutorialOverlay = new TutorialOverlay(uiOverlay)
  const toolbar = new Toolbar(uiOverlay)
  const machinePanel = new MachinePanel(uiOverlay)
  const beltPanel = new BeltPanel(uiOverlay)

  const pxtEditor = new PxtEditor()
  pxtEditor.mount(editorContainer)
  pxtEditor.hide()

  // --- Per-level state (recreated each level) ---

  let factoryRenderer: FactoryRenderer | null = null
  let itemRenderer: ItemRenderer | null = null
  let gridInteraction: GridInteraction | null = null
  let editorVisible = false
  let lastClock = performance.now()

  // --- Helpers ---

  function hideAllUI(): void {
    mainMenu.hide()
    levelSelect.hide()
    hud.hide()
    scoreScreen.hide()
    tutorialOverlay.hide()
    toolbar.hide()
    machinePanel.hide()
    beltPanel.hide()
  }

  function openEditor(): void {
    editorVisible = true
    editorContainer.classList.add('open')
    pxtEditor.show()
  }

  function closeEditor(): void {
    editorVisible = false
    editorContainer.classList.remove('open')
    pxtEditor.hide()
  }

  function toggleEditor(): void {
    if (editorVisible) closeEditor()
    else openEditor()
  }

  function cleanupLevelRendering(): void {
    if (gridInteraction) {
      gridInteraction.dispose()
      gridInteraction = null
    }
    if (factoryRenderer) {
      factoryRenderer.dispose()
      factoryRenderer = null
    }
    if (itemRenderer) {
      itemRenderer.dispose()
      itemRenderer = null
    }
    if (particleEffects) {
      particleEffects.dispose()
      particleEffects = null
    }
    audio.stopBeltRolling()
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

  function getTutorialSteps(levelIndex: number): TutorialStep[] {
    switch (levelIndex) {
      case 1:
        return [
          { messageKey: 'tutorial.level1_step1', highlightSelector: '#canvas-container', position: 'top' },
          { messageKey: 'tutorial.level1_step2', highlightSelector: '#canvas-container', position: 'top' },
          { messageKey: 'tutorial.level1_step3', highlightSelector: '#canvas-container', position: 'bottom' },
          { messageKey: 'tutorial.level1_step4', highlightSelector: '.ui-toolbar-btn--editor', position: 'bottom' },
          { messageKey: 'tutorial.level1_step5', highlightSelector: '.ui-toolbar-btn--editor', position: 'bottom' },
          { messageKey: 'tutorial.level1_step6', highlightSelector: '.ui-toolbar-btn--start', position: 'bottom' },
        ]
      case 2:
        return [
          { messageKey: 'tutorial.level2_step1', highlightSelector: '#canvas-container', position: 'top' },
          { messageKey: 'tutorial.level2_step2', highlightSelector: '#canvas-container', position: 'bottom' },
          { messageKey: 'tutorial.level2_step3', highlightSelector: '.ui-toolbar-btn--editor', position: 'bottom' },
        ]
      case 3:
        return [
          { messageKey: 'tutorial.level3_step1', highlightSelector: '.ui-toolbar-btn--editor', position: 'bottom' },
          { messageKey: 'tutorial.level3_step2', position: 'bottom' },
        ]
      case 4:
        return [
          { messageKey: 'tutorial.level4_step1', highlightSelector: '.ui-toolbar', position: 'bottom' },
          { messageKey: 'tutorial.level4_step2', highlightSelector: '.ui-toolbar-btn--editor', position: 'bottom' },
        ]
      default:
        return []
    }
  }

  function getFactorySaveKey(levelId?: string): string {
    return FACTORY_SAVE_PREFIX + (levelId ?? 'sandbox')
  }

  function autoSaveFactory(): void {
    const factory = gameManager.factory
    if (!factory) return
    const levelId = gameManager.currentLevel?.id
    const workspace = ''
    const save = saveFactory(factory, workspace, levelId)
    saveToLocalStorage(getFactorySaveKey(levelId), save)
  }

  function autoRestoreFactory(): boolean {
    const levelId = gameManager.currentLevel?.id
    const save = loadFromLocalStorage(getFactorySaveKey(levelId))
    if (!save) return false
    try {
      const result = loadFactory(save)
      const factory = gameManager.factory
      if (!factory) return false
      factory.restoreState(
        result.factory.getMachines().map(m => ({ x: m.x, z: m.z, type: m.type, rotation: m.rotation, name: m.name })),
        result.factory.getBelts().map(b => ({ sourceSlot: b.sourceSlot, destinationSlot: b.destinationSlot, path: b.path })),
      )
      return true
    } catch {
      return false
    }
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
        factoryRenderer?.update()
        return !!result
      },
      getBelts: () => {
        const factory = gameManager.factory
        if (!factory) return []
        return factory.getBelts().map(b => ({ id: b.id, sourceMachine: b.sourceMachine.id, path: b.path }))
      },
    }
  }

  function getHUDStats() {
    return gameManager.simulation?.getStats() ??
      { itemsProduced: 0, robotsCompleted: 0, timeElapsed: 0, qualityPercent: 100, outputsDelivered: 0 }
  }

  function setupBuildPhase(level: LevelDefinition): void {
    const factory = gameManager.factory
    if (!factory) return

    cleanupLevelRendering()

    factoryRenderer = new FactoryRenderer(factory, sceneManager)
    factoryRenderer.renderGrid()

    itemRenderer = new ItemRenderer(sceneManager.getScene())
    particleEffects = new ParticleEffects(sceneManager.getScene())

    gridInteraction = new GridInteraction(sceneManager, factory, () => {
      factoryRenderer?.update()
    }, factoryRenderer)
    wireGridInteractionCallbacks(gridInteraction)
    gridInteraction.enable()

    const idx = getLevelIndex(level)
    pxtEditor.setLevel(idx)
    hud.setLevelName(i18next.t(level.nameKey))
    machinePanel.setAvailableMachineTypes(level.availableMachines)

    // Auto-restore saved factory layout
    autoRestoreFactory()
    factoryRenderer.update()

    // Camera: zoom to fit grid
    cameraController.zoomToFit(level.gridSize.width, level.gridSize.height)

    const steps = getTutorialSteps(idx)
    if (steps.length > 0) {
      tutorialOverlay.loadTutorial(steps)
      tutorialOverlay.start()
    }
  }

  function setupSandbox(): void {
    const factory = gameManager.factory
    if (!factory) return

    cleanupLevelRendering()

    factoryRenderer = new FactoryRenderer(factory, sceneManager)
    factoryRenderer.renderGrid()

    itemRenderer = new ItemRenderer(sceneManager.getScene())
    particleEffects = new ParticleEffects(sceneManager.getScene())

    gridInteraction = new GridInteraction(sceneManager, factory, () => {
      factoryRenderer?.update()
    }, factoryRenderer)
    wireGridInteractionCallbacks(gridInteraction)
    gridInteraction.enable()

    pxtEditor.setLevel(10)
    hud.setLevelName(i18next.t('main_menu.sandbox'))
    machinePanel.setAvailableMachineTypes([
      'part_fabricator', 'assembler', 'quality_checker',
      'painter', 'recycler', 'splitter', 'factory_output',
    ])

    // Auto-restore sandbox factory layout
    autoRestoreFactory()
    factoryRenderer.update()

    cameraController.zoomToFit(20, 20)
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
          setupBuildPhase(level)
        }
        break
      }

      case 'play_phase':
        // Auto-save factory before entering play
        autoSaveFactory()
        toolbar.show()
        hud.show()
        if (gridInteraction) gridInteraction.disable()
        // Start belt audio
        audio.playBeltRolling()
        // Wire simulation events for particles and audio
        wireSimulationEffects()
        break

      case 'score_screen': {
        closeEditor()
        audio.stopBeltRolling()
        const score = gameManager.lastScore
        const level = gameManager.currentLevel
        if (score && level) {
          scoreScreen.setScore(i18next.t(level.nameKey), score)
          scoreScreen.show()
          saveProgress()
          // Success audio + confetti
          audio.playSuccess()
          particleEffects?.emitConfetti(
            level.gridSize.width,
            level.gridSize.height,
          )
        }
        break
      }

      case 'sandbox':
        toolbar.show()
        setupSandbox()
        break
    }
  })

  // --- MainMenu callbacks ---

  mainMenu.onStart = () => {
    audio.playUIClick()
    gameManager.enterLevelSelect()
  }
  mainMenu.onSandbox = () => {
    audio.playUIClick()
    gameManager.enterSandbox()
  }

  // --- LevelSelect callbacks ---

  levelSelect.onLevelSelected = (levelId) => {
    audio.playUIClick()
    gameManager.startLevel(levelId)
  }
  levelSelect.onBack = () => {
    audio.playUIClick()
    gameManager.enterMainMenu()
  }

  // --- Toolbar simulation callbacks ---

  toolbar.onStart = () => {
    audio.playUIClick()
    const state = gameManager.getCurrentState()
    const sim = gameManager.simulation

    if (state === 'build_phase') {
      populateSimulation()
      const commands = pxtEditor.getProgram()
      if (commands.length > 0) {
        sim?.enqueueCommands(commands)
      }
      gameManager.startSimulation()
    } else if (state === 'play_phase' && sim?.paused) {
      sim.resume()
    } else if (state === 'sandbox' && sim) {
      if (sim.paused) {
        sim.resume()
      } else if (!sim.running) {
        populateSimulation()
        const commands = pxtEditor.getProgram()
        if (commands.length > 0) {
          sim.enqueueCommands(commands)
        }
        sim.start()
        hud.show()
      }
    }
  }

  toolbar.onPause = () => {
    audio.playUIClick()
    const sim = gameManager.simulation
    if (sim?.running && !sim.paused) {
      sim.pause()
    }
  }

  toolbar.onRestart = () => {
    audio.playUIClick()
    const state = gameManager.getCurrentState()
    if (state === 'play_phase') {
      gameManager.stopSimulation()
    } else if (state === 'sandbox') {
      gameManager.simulation?.stop()
      hud.hide()
    }
  }

  // --- ScoreScreen callbacks ---

  scoreScreen.onNextLevel = () => {
    audio.playUIClick()
    const nextId = getNextLevelId()
    if (nextId) {
      gameManager.startLevel(nextId)
    } else {
      gameManager.enterLevelSelect()
    }
  }

  scoreScreen.onRetry = () => {
    audio.playUIClick()
    const level = gameManager.currentLevel
    if (level) {
      gameManager.startLevel(level.id)
    }
  }

  scoreScreen.onBackToMenu = () => {
    audio.playUIClick()
    gameManager.enterLevelSelect()
  }

  // --- Tutorial callback ---

  tutorialOverlay.onComplete = () => tutorialOverlay.hide()

  // --- Machine panel callback ---

  machinePanel.onDelete = () => {
    audio.playUIClick()
    if (!gridInteraction) return
    gridInteraction.deleteSelectedMachine()
  }

  beltPanel.onDelete = () => {
    audio.playUIClick()
    if (!gridInteraction) return
    gridInteraction.deleteSelectedBelt()
    factoryRenderer?.clearBeltHighlight()
    factoryRenderer?.update()
    beltPanel.hide()
  }

  machinePanel.onTypeChange = (machine, newType) => {
    audio.playUIClick()
    const factory = gameManager.factory
    if (!factory) return
    if (factory.updateMachineType(machine.x, machine.z, newType)) {
      factoryRenderer?.update()
      // Refresh the panel with updated info
      const updated = factory.getMachineAt(machine.x, machine.z)
      machinePanel.setMachine(updated)
    }
  }

  machinePanel.onNameChange = (machine, newName) => {
    const factory = gameManager.factory
    if (!factory) return
    factory.renameMachine(machine.x, machine.z, newName)
    autoSaveFactory()
  }

  toolbar.onToggleEditor = () => {
    audio.playUIClick()
    toggleEditor()
  }

  toolbar.onSave = () => {
    audio.playUIClick()
    autoSaveFactory()
  }

  toolbar.onLoad = () => {
    audio.playUIClick()
    void importFromFile()
      .then((save) => {
        const result = loadFactory(save)
        const factory = gameManager.factory
        if (!factory) return
        factory.restoreState(
          result.factory.getMachines().map(m => ({ x: m.x, z: m.z, type: m.type, rotation: m.rotation, name: m.name })),
          result.factory.getBelts().map(b => ({ sourceSlot: b.sourceSlot, destinationSlot: b.destinationSlot, path: b.path })),
        )
        factoryRenderer?.update()
      })
      .catch(() => {
        audio.playError()
      })
  }

  toolbar.onExport = () => {
    audio.playUIClick()
    const factory = gameManager.factory
    if (!factory) return
    const levelId = gameManager.currentLevel?.id
    const workspace = ''
    const save = saveFactory(factory, workspace, levelId)
    exportToFile(save)
  }

  // --- Simulation effects (particles + audio) ---

  function wireSimulationEffects(): void {
    const sim = gameManager.simulation
    if (!sim) return

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
            particleEffects.emitSparks(
              new THREE.Vector3(info.x + 0.5, 0.5, info.z + 0.5),
            )
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
  })

  // --- Initial state ---

  gameManager.enterMainMenu()

  // --- Animation loop with HUD updates ---

  sceneManager.onAnimate(() => {
    const now = performance.now()
    const dt = Math.min((now - lastClock) / 1000, 0.1)
    lastClock = now

    factoryRenderer?.update()
    cameraController.update(dt)
    particleEffects?.update(dt)

    // Update item meshes on belts when simulation is running
    const sim = gameManager.simulation
    const factory = gameManager.factory
    if (itemRenderer && sim?.running && factory) {
      const beltRenderData = itemRenderer.buildRenderData(sim.getBelts())

      itemRenderer.update(beltRenderData, factory.width, factory.height)

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
