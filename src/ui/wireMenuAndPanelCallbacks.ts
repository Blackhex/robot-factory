import type { GameManager } from '../game/GameManager'
import type { AudioManager } from '../audio/AudioManager'
import type { FactoryRenderer } from '../rendering/FactoryRenderer'
import type { GridInteraction } from '../rendering/GridInteraction'
import type { BeltPanel } from './BeltPanel'
import type { LevelSelect } from './LevelSelect'
import type { MachinePanel } from './MachinePanel'
import type { MainMenu } from './MainMenu'
import type { TutorialOverlay } from './TutorialOverlay'

interface WireMenuAndPanelCallbacksOptions {
  mainMenu: MainMenu
  levelSelect: LevelSelect
  tutorialOverlay: TutorialOverlay
  machinePanel: MachinePanel
  beltPanel: BeltPanel
  audio: AudioManager
  gameManager: GameManager
  getGridInteraction: () => GridInteraction | null
  getFactoryRenderer: () => FactoryRenderer | null
  syncFactoryToEditor: () => void
  autoSaveFactory: () => Promise<void>
}

export function wireMenuAndPanelCallbacks(options: WireMenuAndPanelCallbacksOptions): void {
  const click = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A): void => {
    options.audio.playUIClick()
    fn(...args)
  }

  options.mainMenu.onStart = click(() => options.gameManager.enterLevelSelect())
  options.mainMenu.onSandbox = click(() => options.gameManager.enterSandbox())
  options.levelSelect.onLevelSelected = click((levelId: string) => options.gameManager.startLevel(levelId))
  options.levelSelect.onBack = click(() => options.gameManager.enterMainMenu())
  options.tutorialOverlay.onComplete = () => options.tutorialOverlay.hide()

  options.machinePanel.onDelete = click(() => options.getGridInteraction()?.deleteSelectedMachine())

  options.beltPanel.onDelete = click(() => {
    const gridInteraction = options.getGridInteraction()
    if (!gridInteraction) return
    gridInteraction.deleteSelectedBelt()
    options.getFactoryRenderer()?.clearBeltHighlight()
    options.getFactoryRenderer()?.syncMeshes()
    options.beltPanel.hide()
  })

  options.beltPanel.onNameChange = (belt, newName) => {
    const factory = options.gameManager.factory
    if (!factory) return
    factory.renameBelt(belt.id, newName)
    options.syncFactoryToEditor()
    void options.autoSaveFactory()
  }

  options.machinePanel.onTypeChange = click((machine, newType) => {
    const factory = options.gameManager.factory
    if (!factory) return
    if (factory.updateMachineType(machine.x, machine.z, newType)) {
      options.getFactoryRenderer()?.syncMeshes()
      options.machinePanel.setMachine(factory.getMachineAt(machine.x, machine.z))
      options.syncFactoryToEditor()
      void options.autoSaveFactory()
    }
  })

  options.machinePanel.onNameChange = (machine, newName) => {
    const factory = options.gameManager.factory
    if (!factory) return
    factory.renameMachine(machine.x, machine.z, newName)
    options.syncFactoryToEditor()
    void options.autoSaveFactory()
  }
}