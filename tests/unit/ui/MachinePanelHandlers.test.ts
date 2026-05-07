import { describe, it, expect, vi } from 'vitest'
import { wireMenuAndPanelCallbacks } from '../../../src/ui/wireMenuAndPanelCallbacks'

function createWiringFixture() {
  const syncFactoryToEditor = vi.fn()
  const autoSaveFactory = vi.fn(async () => {})
  const playUIClick = vi.fn()
  const enterLevelSelect = vi.fn()
  const enterSandbox = vi.fn()
  const startLevel = vi.fn()
  const enterMainMenu = vi.fn()
  const deleteSelectedMachine = vi.fn()
  const deleteSelectedBelt = vi.fn()
  const clearBeltHighlight = vi.fn()
  const syncMeshes = vi.fn()
  const factory = {
    renameBelt: vi.fn(),
    updateMachineType: vi.fn(() => true),
    getMachineAt: vi.fn(() => ({ id: 'machine-1' })),
    renameMachine: vi.fn(),
  }
  const mainMenu = {
    onStart: () => {},
    onSandbox: () => {},
  }
  const levelSelect = {
    onLevelSelected: (_levelId: string) => {},
    onBack: () => {},
  }
  const machinePanel = {
    onDelete: (_machine: unknown) => {},
    onTypeChange: (_machine: unknown, _newType: unknown) => {},
    onNameChange: (_machine: unknown, _newName: string) => {},
    setMachine: vi.fn(),
  }
  const beltPanel = {
    onDelete: () => {},
    onNameChange: (_belt: unknown, _newName: string) => {},
    hide: vi.fn(),
  }

  wireMenuAndPanelCallbacks({
    mainMenu: mainMenu as never,
    levelSelect: levelSelect as never,
    tutorialOverlay: { onComplete: () => {}, hide: vi.fn() } as never,
    machinePanel: machinePanel as never,
    beltPanel: beltPanel as never,
    audio: { playUIClick } as never,
    gameManager: {
      enterLevelSelect,
      enterSandbox,
      startLevel,
      enterMainMenu,
      factory,
    } as never,
    getGridInteraction: () => ({ deleteSelectedMachine, deleteSelectedBelt }) as never,
    getFactoryRenderer: () => ({ clearBeltHighlight, syncMeshes }) as never,
    syncFactoryToEditor,
    autoSaveFactory,
  })

  return {
    mainMenu,
    levelSelect,
    machinePanel,
    beltPanel,
    factory,
    playUIClick,
    enterLevelSelect,
    enterSandbox,
    startLevel,
    enterMainMenu,
    deleteSelectedMachine,
    deleteSelectedBelt,
    clearBeltHighlight,
    syncMeshes,
    syncFactoryToEditor,
    autoSaveFactory,
  }
}

describe('wireMenuAndPanelCallbacks machinePanel handlers', () => {
  it('plays click audio for main menu and level select callbacks', () => {
    const fixture = createWiringFixture()

    fixture.mainMenu.onStart()
    fixture.mainMenu.onSandbox()
    fixture.levelSelect.onLevelSelected('level-2')
    fixture.levelSelect.onBack()

    expect(fixture.enterLevelSelect).toHaveBeenCalledTimes(1)
    expect(fixture.enterSandbox).toHaveBeenCalledTimes(1)
    expect(fixture.startLevel).toHaveBeenCalledWith('level-2')
    expect(fixture.enterMainMenu).toHaveBeenCalledTimes(1)
    expect(fixture.playUIClick).toHaveBeenCalledTimes(4)
  })

  it('plays click audio for machine panel click-wrapped callbacks', () => {
    const fixture = createWiringFixture()

    fixture.machinePanel.onDelete({ x: 3, z: 4 })
    fixture.machinePanel.onTypeChange({ x: 3, z: 4 }, 'assembler')

    expect(fixture.deleteSelectedMachine).toHaveBeenCalledTimes(1)
    expect(fixture.factory.updateMachineType).toHaveBeenCalledWith(3, 4, 'assembler')
    expect(fixture.playUIClick).toHaveBeenCalledTimes(2)
  })

  it('plays click audio for belt panel delete callback', () => {
    const fixture = createWiringFixture()

    fixture.beltPanel.onDelete()

    expect(fixture.deleteSelectedBelt).toHaveBeenCalledTimes(1)
    expect(fixture.clearBeltHighlight).toHaveBeenCalledTimes(1)
    expect(fixture.syncMeshes).toHaveBeenCalledTimes(1)
    expect(fixture.beltPanel.hide).toHaveBeenCalledTimes(1)
    expect(fixture.playUIClick).toHaveBeenCalledTimes(1)
  })

  it('onTypeChange calls syncFactoryToEditor() after a successful type update', () => {
    const fixture = createWiringFixture()

    fixture.machinePanel.onTypeChange({ x: 3, z: 4 }, 'assembler')

    expect(fixture.syncFactoryToEditor).toHaveBeenCalled()
  })

  it('onTypeChange calls void autoSaveFactory() after a successful type update', () => {
    const fixture = createWiringFixture()

    fixture.machinePanel.onTypeChange({ x: 3, z: 4 }, 'assembler')

    expect(fixture.autoSaveFactory).toHaveBeenCalled()
  })

  it('onNameChange calls syncFactoryToEditor() after renameMachine', () => {
    const fixture = createWiringFixture()

    fixture.machinePanel.onNameChange({ x: 3, z: 4 }, 'North Dock')

    expect(fixture.factory.renameMachine).toHaveBeenCalledWith(3, 4, 'North Dock')
    expect(fixture.syncFactoryToEditor).toHaveBeenCalled()
  })

  it('onNameChange calls void autoSaveFactory() after renameMachine', () => {
    const fixture = createWiringFixture()

    fixture.machinePanel.onNameChange({ x: 3, z: 4 }, 'North Dock')

    expect(fixture.autoSaveFactory).toHaveBeenCalled()
  })
})
