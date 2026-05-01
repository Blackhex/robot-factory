import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { BeltInfo, Factory, MachineInfo } from '../game/Factory'
import type { GridPosition, SlotPosition } from '../game/types'
import type { SceneManager } from './SceneManager'
import { MACHINE_COLORS } from './FactoryRenderer'
import type { FactoryRenderer } from './FactoryRenderer'
import { BeltDragInteraction } from './BeltDragInteraction'
import type { BeltPathPlan, BeltSlotType } from './BeltPlacementPlanner'
import { DragInteractionLifecycle, type SimulationProvider } from './DragInteractionLifecycle'
import { GridDoubleClickHandler } from './GridDoubleClickHandler'
import { GridInteractionPreview } from './GridInteractionPreview'
import { GridPointerDownHandler } from './GridPointerDownHandler'
import { GridRaycastProjector } from './GridRaycastProjector'
import { GridSelectionController } from './GridSelectionController'
import { MachineDragPreviewController } from './MachineDragPreviewController'
import { MachineDropCommitter } from './MachineDropCommitter'

type DragMode = 'machine' | 'belt' | null

export type { PausableSimulation, SimulationProvider } from './DragInteractionLifecycle'

export class GridInteraction {
  private camera: THREE.PerspectiveCamera
  private rendererDom: HTMLElement
  private factory: Factory
  private scene: THREE.Scene
  private controls: OrbitControls
  private factoryRenderer: FactoryRenderer | null = null
  private onFactoryChanged: () => void
  private dragLifecycle: DragInteractionLifecycle
  private gridRaycast: GridRaycastProjector
  private preview: GridInteractionPreview
  private machineDragPreview: MachineDragPreviewController
  private selection: GridSelectionController
  private doubleClickHandler: GridDoubleClickHandler
  private pointerDownHandler: GridPointerDownHandler
  private beltDragInteraction: BeltDragInteraction
  private machineDropCommitter: MachineDropCommitter

  private enabled = false

  private dragMode: DragMode = null
  private dragOrigin: GridPosition | null = null
  private dragSourceSlotType: 'input' | 'output' | null = null
  private dragSourceSlotPosition: SlotPosition | null = null
  private dragConnectedMachines: Array<{ position: GridPosition, machineIsSource: boolean }> = []
  private dragIgnoreBeltIds: Set<string> = new Set()

  private handlePointerMoveBound: (e: PointerEvent) => void
  private handlePointerDownBound: (e: PointerEvent) => void
  private handlePointerUpBound: (e: PointerEvent) => void
  private handlePointerCancelBound: (e: PointerEvent) => void
  private handleLostPointerCaptureBound: (e: PointerEvent) => void
  private handleDblClickBound: (e: MouseEvent) => void
  private handleKeyDownBound: (e: KeyboardEvent) => void

  readonly computeBestBeltPath: (
    origin: GridPosition,
    target: GridPosition,
    slotType: BeltSlotType,
    ignoreBeltIds?: ReadonlySet<string>,
    targetSlotPosition?: SlotPosition,
    sourceSlotPosition?: SlotPosition,
  ) => BeltPathPlan | null
  readonly tryPlaceBeltChain: (
    srcMachine: MachineInfo,
    dstMachine: MachineInfo,
    slotType: BeltSlotType,
    targetSlotPosition?: SlotPosition,
    sourceSlotPosition?: SlotPosition,
  ) => boolean

  constructor(
    sceneManager: SceneManager,
    factory: Factory,
    onFactoryChanged: () => void,
    factoryRenderer?: FactoryRenderer,
    getSimulation?: SimulationProvider,
  ) {
    this.camera = sceneManager.getCamera()
    this.rendererDom = sceneManager.getRenderer().domElement
    this.scene = sceneManager.getScene()
    this.controls = sceneManager.getControls()
    this.factory = factory
    this.onFactoryChanged = onFactoryChanged
    this.factoryRenderer = factoryRenderer ?? null
    this.dragLifecycle = new DragInteractionLifecycle(this.rendererDom, getSimulation)
    this.gridRaycast = new GridRaycastProjector(this.camera, this.rendererDom, this.factory)
    this.selection = new GridSelectionController({
      factory: this.factory,
      getFactoryRenderer: () => this.factoryRenderer,
      onFactoryChanged: () => this.onFactoryChanged(),
    })
    this.preview = new GridInteractionPreview(
      this.scene,
      (x, z) => this.gridToWorld(x, z),
      (x, z) => this.factory.getMachineAt(x, z) !== null,
    )
    this.machineDragPreview = new MachineDragPreviewController(this.factory, this.preview)
    this.beltDragInteraction = new BeltDragInteraction({
      factory: this.factory,
      preview: this.preview,
      gridToWorld: (x, z) => this.gridToWorld(x, z),
      getFactoryRenderer: () => this.factoryRenderer,
      onFactoryChanged: () => this.onFactoryChanged(),
    })
    this.computeBestBeltPath = this.beltDragInteraction.computeBestPath.bind(this.beltDragInteraction)
    this.tryPlaceBeltChain = this.beltDragInteraction.tryPlaceChain.bind(this.beltDragInteraction)
    this.machineDropCommitter = new MachineDropCommitter({
      factory: this.factory,
      raycastToBodyGrid: () => this.raycastToGrid(this.gridRaycast.machineDragPlane),
      raycastToGroundGrid: () => this.raycastToGrid(),
      runCommit: (commit) => this.dragLifecycle.runWithSimulationPausedForCommit(commit),
      selectMachine: (machine) => this.selectMachine(machine),
      onFactoryChanged: () => this.onFactoryChanged(),
    })
    this.doubleClickHandler = new GridDoubleClickHandler({
      factory: this.factory,
      updateMouseNDC: (event) => this.updateMouseNDC(event),
      raycastToGrid: () => this.raycastToGrid(),
      selectMachine: (machine) => this.selectMachine(machine),
      onFactoryChanged: () => this.onFactoryChanged(),
    })
    this.pointerDownHandler = new GridPointerDownHandler({
      factory: this.factory,
      getFactoryRenderer: () => this.factoryRenderer,
      updateMouseNDC: (event) => this.updateMouseNDC(event),
      raycastToGrid: () => this.raycastToGrid(),
      getRaycaster: () => this.gridRaycast.getRaycaster(),
      detectSlot: (cell, machine) => this.detectSlot(cell, machine),
      beginMachineDrag: (event, machine) => this.beginMachineDrag(event, machine),
      beginBeltDrag: (event, origin, slotType, sourceSlotPosition) => {
        this.beginBeltDrag(event, origin, slotType, sourceSlotPosition)
      },
      selectBelt: (belt) => this.selectBelt(belt),
      deselectAll: () => { this.deselectMachine(); this.deselectBelt() },
    })

    this.handlePointerMoveBound = this.handlePointerMove.bind(this)
    this.handlePointerDownBound = this.handlePointerDown.bind(this)
    this.handlePointerUpBound = this.handlePointerUp.bind(this)
    this.handlePointerCancelBound = this.handlePointerCancel.bind(this)
    this.handleLostPointerCaptureBound = this.handleLostPointerCapture.bind(this)
    this.handleDblClickBound = this.handleDblClick.bind(this)
    this.handleKeyDownBound = this.handleKeyDown.bind(this)
  }

  get onMachineSelected(): (machine: MachineInfo | null) => void {
    return this.selection.onMachineSelected
  }

  set onMachineSelected(callback: (machine: MachineInfo | null) => void) {
    this.selection.onMachineSelected = callback
  }

  get onBeltSelected(): (belt: BeltInfo | null) => void {
    return this.selection.onBeltSelected
  }

  set onBeltSelected(callback: (belt: BeltInfo | null) => void) {
    this.selection.onBeltSelected = callback
  }

  deleteSelectedMachine(): void {
    this.selection.deleteSelectedMachine()
  }

  deleteSelectedBelt(): void {
    this.selection.deleteSelectedBelt()
  }

  enable(): void {
    if (this.enabled) return
    this.enabled = true
    this.rendererDom.addEventListener('pointermove', this.handlePointerMoveBound)
    this.rendererDom.addEventListener('pointerdown', this.handlePointerDownBound)
    this.rendererDom.addEventListener('pointerup', this.handlePointerUpBound)
    this.rendererDom.addEventListener('pointercancel', this.handlePointerCancelBound)
    this.rendererDom.addEventListener('lostpointercapture', this.handleLostPointerCaptureBound)
    this.rendererDom.addEventListener('dblclick', this.handleDblClickBound)
    window.addEventListener('pointerup', this.handlePointerUpBound)
    window.addEventListener('pointercancel', this.handlePointerCancelBound)
    window.addEventListener('keydown', this.handleKeyDownBound)
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.rendererDom.removeEventListener('pointermove', this.handlePointerMoveBound)
    this.rendererDom.removeEventListener('pointerdown', this.handlePointerDownBound)
    this.rendererDom.removeEventListener('pointerup', this.handlePointerUpBound)
    this.rendererDom.removeEventListener('pointercancel', this.handlePointerCancelBound)
    this.rendererDom.removeEventListener('lostpointercapture', this.handleLostPointerCaptureBound)
    this.rendererDom.removeEventListener('dblclick', this.handleDblClickBound)
    window.removeEventListener('pointerup', this.handlePointerUpBound)
    window.removeEventListener('pointercancel', this.handlePointerCancelBound)
    window.removeEventListener('keydown', this.handleKeyDownBound)
    this.preview.hideHighlight()
    this.cancelDrag()
  }

  deselectMachine(): void {
    this.selection.deselectMachine()
  }

  private selectMachine(machine: MachineInfo): void {
    this.selection.selectMachine(machine)
  }

  private deselectBelt(): void {
    this.selection.deselectBelt()
  }

  private selectBelt(belt: BeltInfo): void {
    this.selection.selectBelt(belt)
  }

  private handleKeyDown(event: KeyboardEvent): void {
    this.selection.handleKeyDown(event)
  }

  dispose(): void {
    this.disable()
    this.preview.dispose()
  }

  // ─── Helpers ──────────────────────────────────────────

  private cancelDrag(): void {
    this.dragLifecycle.cancelDragLifecycle()
    if (this.dragMode) this.controls.enabled = true
    this.dragMode = null
    this.dragOrigin = null
    this.dragSourceSlotType = null
    this.dragSourceSlotPosition = null
    this.dragConnectedMachines = []
    this.dragIgnoreBeltIds = new Set()
    this.preview.resetDragPreview()
  }

  private updateMouseNDC(event: PointerEvent | MouseEvent): void {
    this.gridRaycast.updateMouseNDC(event)
  }

  private raycastToGrid(plane?: THREE.Plane): GridPosition | null {
    return this.gridRaycast.raycastToGrid(plane)
  }

  private raycastToDragGrid(): GridPosition | null {
    return this.raycastToGrid()
  }

  private gridToWorld(x: number, z: number): THREE.Vector3 {
    return this.gridRaycast.gridToWorld(x, z)
  }

  private detectSlot(cell: GridPosition, machine: MachineInfo): 'input' | 'output' | null {
    return this.gridRaycast.detectSlot(cell, machine)
  }

  private beginBeltDrag(
    event: PointerEvent,
    origin: GridPosition,
    slotType: 'input' | 'output',
    sourceSlotPosition?: SlotPosition,
  ): void {
    this.dragMode = 'belt'
    this.dragOrigin = origin
    this.dragLifecycle.beginPointerCapture(event)
    this.dragSourceSlotType = slotType
    this.dragSourceSlotPosition = sourceSlotPosition ?? null
    this.controls.enabled = false
    this.deselectMachine()
    this.deselectBelt()
  }

  private beginMachineDrag(event: PointerEvent, machine: MachineInfo): void {
    this.dragMode = 'machine'
    this.dragOrigin = { x: machine.x, z: machine.z }
    this.dragLifecycle.beginPointerCapture(event)
    this.dragConnectedMachines = this.factory.getConnectedMachines(machine.x, machine.z)
    this.dragIgnoreBeltIds = this.factory.getConnectedBeltIds(machine.x, machine.z)
    this.preview.setMachineGhostColor(MACHINE_COLORS[machine.type] ?? 0xffffff)
    this.preview.hideMachineGhost()
    this.controls.enabled = false
  }

  // ─── Event Handlers ───────────────────────────────────

  private handlePointerMove(event: PointerEvent): void {
    this.updateMouseNDC(event)
    const cell = this.raycastToDragGrid()

    if (this.dragMode === 'machine' && this.dragOrigin) {
      this.rendererDom.style.cursor = 'grabbing'
      if (!cell) { this.preview.hideHighlight(); return }
      const worldPos = this.gridToWorld(cell.x, cell.z)
      this.preview.moveHighlight(worldPos)
      this.machineDragPreview.showPreview({
        origin: this.dragOrigin,
        cell,
        worldPos,
        connectedMachines: this.dragConnectedMachines,
        ignoreBeltIds: this.dragIgnoreBeltIds,
      })
      return
    }

    if (this.dragMode === 'belt' && this.dragOrigin) {
      this.rendererDom.style.cursor = 'grabbing'
      if (!cell) { this.preview.hideHighlight(); return }
      const worldPos = this.gridToWorld(cell.x, cell.z)
      this.preview.moveHighlight(worldPos)
      const raycaster = this.gridRaycast.getRaycaster()
      this.beltDragInteraction.showPreview(cell, raycaster, {
        origin: this.dragOrigin,
        sourceSlotType: this.dragSourceSlotType,
        sourceSlotPosition: this.dragSourceSlotPosition,
        ignoreBeltIds: this.dragIgnoreBeltIds,
      })
      return
    }

    // Not dragging: update hover cursor based on what's under the pointer.
    // Check renderer hits first so a machine body/slot is recognized even if
    // the ground-plane raycast resolves to a different (or no) grid cell.
    if (this.factoryRenderer) {
      const raycaster = this.gridRaycast.getRaycaster()
      const hit = this.factoryRenderer.raycastInteraction(raycaster)
      if (hit && (hit.type === 'input' || hit.type === 'output')) {
        this.rendererDom.style.cursor = 'grab'
      } else if (hit && hit.type === 'machine') {
        this.rendererDom.style.cursor = 'grab'
      } else {
        this.rendererDom.style.cursor = 'default'
      }
    } else {
      this.rendererDom.style.cursor = 'default'
    }

    if (!cell) { this.preview.hideHighlight(); return }
    const worldPos = this.gridToWorld(cell.x, cell.z)
    this.preview.moveHighlight(worldPos)
    const existing = this.factory.getMachineAt(cell.x, cell.z)
    this.preview.setHighlightStyle(existing ? 0x4488ff : 0x00ff88, 0.3)
  }

  private handlePointerDown(event: PointerEvent): void {
    this.pointerDownHandler.handle(event)
  }

  private handlePointerUp(_event: PointerEvent): void {
    if (!this.dragMode || !this.dragOrigin) return
    if (!this.dragLifecycle.isActivePointer(_event)) return
    try {
      this.updateMouseNDC(_event)
      const raycaster = this.gridRaycast.getRaycaster()
      const raycastBeltDropTarget = this.dragMode === 'belt'
        ? this.beltDragInteraction.resolveDropTargetFromRaycast(raycaster, this.dragOrigin)
        : null
      const cell = this.dragMode === 'machine'
        ? this.machineDropCommitter.resolveDropCell(this.dragOrigin)
        : raycastBeltDropTarget ?? this.raycastToDragGrid()

      if (cell) {
        if (this.dragMode === 'machine') {
          this.machineDropCommitter.commitDrop(this.dragOrigin, cell)
        } else if (this.dragMode === 'belt') {
          this.beltDragInteraction.commitDrop(cell, raycaster, {
            origin: this.dragOrigin,
            sourceSlotType: this.dragSourceSlotType,
            sourceSlotPosition: this.dragSourceSlotPosition,
            ignoreBeltIds: this.dragIgnoreBeltIds,
            raycastDropTarget: raycastBeltDropTarget,
          })
        }
      }
    } finally {
      this.dragMode = null
      this.dragOrigin = null
      this.dragSourceSlotType = null
      this.dragSourceSlotPosition = null
      this.dragConnectedMachines = []
      this.dragIgnoreBeltIds = new Set()
      this.preview.resetDragPreview()
      this.controls.enabled = true
      this.dragLifecycle.releasePointerCapture()
    }
  }

  private handlePointerCancel(event: PointerEvent): void {
    if (!this.dragLifecycle.shouldCancelActiveDrag(event, this.dragMode !== null)) return
    this.cancelDrag()
  }

  private handleLostPointerCapture(event: PointerEvent): void {
    if (!this.dragLifecycle.shouldCancelActiveDrag(event, this.dragMode !== null)) return
    this.cancelDrag()
  }

  private handleDblClick(event: MouseEvent): void {
    this.doubleClickHandler.handle(event)
  }
}
