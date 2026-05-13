import { test as base, expect } from '@playwright/test'
import { MainMenuPage } from './screens/MainMenuPage'
import { LevelSelectPage } from './screens/LevelSelectPage'
import { ToolbarPage } from './screens/ToolbarPage'
import { EditorPanelPage } from './screens/EditorPanelPage'
import { HudPage } from './screens/HudPage'
import { MachinePanelPage } from './screens/MachinePanelPage'
import { BeltPanelPage } from './screens/BeltPanelPage'
import { TutorialOverlayPage } from './screens/TutorialOverlayPage'
import { ScoreScreenPage } from './screens/ScoreScreenPage'
import { LevelBriefPage } from './screens/LevelBriefPage'
import { LevelFailedScreenPage } from './screens/LevelFailedScreenPage'
import { FactoryGridPage } from './canvas/FactoryGridPage'
import { BeltObject } from './canvas/BeltObject'
import { SimulationProbe } from './canvas/SimulationProbe'
import { PxtEditorPage } from './editor/PxtEditorPage'
import { GameOverModalPage } from './screens/GameOverModalPage'
import { ProjectsPanelPage } from './screens/ProjectsPanelPage'
import { SaveManager } from './data/saves'
import { ConsoleMonitor } from './data/ConsoleMonitor'

type Pages = {
  mainMenu: MainMenuPage
  levelSelect: LevelSelectPage
  toolbar: ToolbarPage
  editorPanel: EditorPanelPage
  hud: HudPage
  machinePanel: MachinePanelPage
  beltPanel: BeltPanelPage
  tutorial: TutorialOverlayPage
  scoreScreen: ScoreScreenPage
  levelBrief: LevelBriefPage
  levelFailed: LevelFailedScreenPage
  grid: FactoryGridPage
  belt: BeltObject
  probe: SimulationProbe
  pxt: PxtEditorPage
  gameOverModal: GameOverModalPage
  projectsPanel: ProjectsPanelPage
  saves: SaveManager
  consoleMonitor: ConsoleMonitor
}

export const test = base.extend<Pages>({
  mainMenu: async ({ page }, use) => { await use(new MainMenuPage(page)) },
  levelSelect: async ({ page }, use) => { await use(new LevelSelectPage(page)) },
  toolbar: async ({ page }, use) => { await use(new ToolbarPage(page)) },
  editorPanel: async ({ page }, use) => { await use(new EditorPanelPage(page)) },
  hud: async ({ page }, use) => { await use(new HudPage(page)) },
  machinePanel: async ({ page }, use) => { await use(new MachinePanelPage(page)) },
  beltPanel: async ({ page }, use) => { await use(new BeltPanelPage(page)) },
  tutorial: async ({ page }, use) => { await use(new TutorialOverlayPage(page)) },
  scoreScreen: async ({ page }, use) => { await use(new ScoreScreenPage(page)) },
  levelBrief: async ({ page }, use) => { await use(new LevelBriefPage(page)) },
  levelFailed: async ({ page }, use) => { await use(new LevelFailedScreenPage(page)) },
  probe: async ({ page }, use) => { await use(new SimulationProbe(page)) },
  grid: async ({ page, probe }, use) => { await use(new FactoryGridPage(page, probe)) },
  belt: async ({ page, probe }, use) => { await use(new BeltObject(page, probe)) },
  pxt: async ({ page }, use) => { await use(new PxtEditorPage(page)) },
  projectsPanel: async ({ page }, use) => { await use(new ProjectsPanelPage(page)) },
  gameOverModal: async ({ page }, use) => { await use(new GameOverModalPage(page)) },
  saves: async ({ page }, use) => { await use(new SaveManager(page)) },
  consoleMonitor: async ({ page }, use) => { await use(new ConsoleMonitor(page)) },
})

export { expect }
