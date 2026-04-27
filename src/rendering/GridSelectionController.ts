import type { BeltInfo, Factory, MachineInfo } from '../game/Factory'
import type { FactoryRenderer } from './FactoryRenderer'

export class GridSelectionController {
  private readonly factory: Factory
  private readonly getFactoryRenderer: () => FactoryRenderer | null
  private readonly onFactoryChanged: () => void
  private selectedMachine: MachineInfo | null = null
  private selectedBelt: BeltInfo | null = null

  onMachineSelected: (machine: MachineInfo | null) => void = () => { }
  onBeltSelected: (belt: BeltInfo | null) => void = () => { }

  constructor(options: {
    factory: Factory
    getFactoryRenderer: () => FactoryRenderer | null
    onFactoryChanged: () => void
  }) {
    this.factory = options.factory
    this.getFactoryRenderer = options.getFactoryRenderer
    this.onFactoryChanged = options.onFactoryChanged
  }

  deleteSelectedMachine(): void {
    if (!this.selectedMachine) return
    const { x, z } = this.selectedMachine
    if (this.factory.removeMachine(x, z)) {
      this.deselectMachine()
      this.onFactoryChanged()
    }
  }

  deleteSelectedBelt(): void {
    if (!this.selectedBelt) return
    this.factory.removeBeltById(this.selectedBelt.id)
    this.deselectBelt()
    this.onFactoryChanged()
  }

  selectMachine(machine: MachineInfo): void {
    this.deselectBelt()
    this.selectedMachine = machine
    this.getFactoryRenderer()?.highlightMachine(machine.id)
    this.onMachineSelected(machine)
  }

  deselectMachine(): void {
    this.selectedMachine = null
    this.getFactoryRenderer()?.clearMachineHighlight()
    this.onMachineSelected(null)
  }

  selectBelt(belt: BeltInfo): void {
    this.deselectMachine()
    this.selectedBelt = belt
    this.getFactoryRenderer()?.highlightBelts([belt.id])
    this.onBeltSelected(belt)
  }

  deselectBelt(): void {
    if (!this.selectedBelt) return
    this.selectedBelt = null
    this.getFactoryRenderer()?.clearBeltHighlight()
    this.onBeltSelected(null)
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Delete') return

    const tag = (event.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (this.selectedMachine) {
      this.deleteSelectedMachine()
    } else if (this.selectedBelt) {
      this.deleteSelectedBelt()
    }
  }
}