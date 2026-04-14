import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Factory, MachineInfo, BeltInfo } from '../game/Factory'
import { slotPositionToOffset, pickBestSlotOffset, rotateDirectionCW } from '../game/Factory'
import type { GridPosition } from '../game/types'
import type { SceneManager } from './SceneManager'
import { MACHINE_COLORS, FactoryRenderer, createCornerBeltGeometry, getCornerRotation, getCornerOffset } from './FactoryRenderer'

type DragMode = 'machine' | 'belt' | null

export class GridInteraction {
  private camera: THREE.PerspectiveCamera
  private rendererDom: HTMLElement
  private factory: Factory
  private scene: THREE.Scene
  private controls: OrbitControls
  private factoryRenderer: FactoryRenderer | null = null
  private onFactoryChanged: () => void

  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2()
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private intersectPoint = new THREE.Vector3()

  private selectedMachine: MachineInfo | null = null
  private selectedBelt: BeltInfo | null = null
  private enabled = false

  private dragMode: DragMode = null
  private dragOrigin: GridPosition | null = null
  private dragSourceSlotType: 'input' | 'output' | null = null
  private dragConnectedMachines: Array<{ position: GridPosition, machineIsSource: boolean }> = []
  private dragIgnoreBeltIds: Set<string> = new Set()

  onMachineSelected: (machine: MachineInfo | null) => void = () => { }
  onBeltSelected: (belt: BeltInfo | null) => void = () => { }

  // Highlight
  private highlightMesh: THREE.Mesh
  private highlightMaterial: THREE.MeshBasicMaterial

  // Ghost for machine move
  private ghostMesh: THREE.Mesh
  private ghostMaterial: THREE.MeshStandardMaterial

  // Ghost slot indicators (shown during machine drag)
  private ghostSlotInputMaterial: THREE.MeshStandardMaterial
  private ghostSlotOutputMaterial: THREE.MeshStandardMaterial
  private ghostSlotGeometry: THREE.BoxGeometry
  private ghostSlotMeshes: THREE.Mesh[] = []

  // Ghost belt path (multi-segment line showing full L-shaped route)
  private ghostBeltGroup = new THREE.Group()
  private ghostBeltSegments: THREE.Mesh[] = []
  private ghostCornerGeometry: THREE.BufferGeometry | null = null
  private ghostBeltOkMaterial: THREE.MeshBasicMaterial
  private ghostBeltBadMaterial: THREE.MeshBasicMaterial

  private handlePointerMoveBound: (e: PointerEvent) => void
  private handlePointerDownBound: (e: PointerEvent) => void
  private handlePointerUpBound: (e: PointerEvent) => void
  private handleDblClickBound: (e: MouseEvent) => void
  private handleKeyDownBound: (e: KeyboardEvent) => void

  constructor(sceneManager: SceneManager, factory: Factory, onFactoryChanged: () => void, factoryRenderer?: FactoryRenderer) {
    this.camera = sceneManager.getCamera()
    this.rendererDom = sceneManager.getRenderer().domElement
    this.scene = sceneManager.getScene()
    this.controls = sceneManager.getControls()
    this.factory = factory
    this.onFactoryChanged = onFactoryChanged
    this.factoryRenderer = factoryRenderer ?? null

    this.highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.3, depthWrite: false,
    })
    const hGeo = new THREE.PlaneGeometry(1, 1)
    this.highlightMesh = new THREE.Mesh(hGeo, this.highlightMaterial)
    this.highlightMesh.rotation.x = -Math.PI / 2
    this.highlightMesh.position.y = 0.01
    this.highlightMesh.visible = false
    this.scene.add(this.highlightMesh)

    this.ghostMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false,
    })
    this.ghostMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), this.ghostMaterial)
    this.ghostMesh.position.y = 0.45
    this.ghostMesh.visible = false
    this.scene.add(this.ghostMesh)

    this.ghostSlotGeometry = new THREE.BoxGeometry(0.5, 0.12, 0.3)
    this.ghostSlotInputMaterial = new THREE.MeshStandardMaterial({
      color: 0x44ff44, emissive: 0x226622, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.5, depthWrite: false,
    })
    this.ghostSlotOutputMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8844, emissive: 0x663311, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.5, depthWrite: false,
    })

    // Ghost belt materials — same gray as actual belts, just transparent
    this.ghostBeltOkMaterial = new THREE.MeshBasicMaterial({
      color: 0xaaaacc, transparent: true, opacity: 0.5, depthWrite: false,
    })
    this.ghostBeltBadMaterial = new THREE.MeshBasicMaterial({
      color: 0xff2222, transparent: true, opacity: 0.5, depthWrite: false,
    })
    this.ghostBeltGroup.visible = false
    this.scene.add(this.ghostBeltGroup)

    this.handlePointerMoveBound = this.handlePointerMove.bind(this)
    this.handlePointerDownBound = this.handlePointerDown.bind(this)
    this.handlePointerUpBound = this.handlePointerUp.bind(this)
    this.handleDblClickBound = this.handleDblClick.bind(this)
    this.handleKeyDownBound = this.handleKeyDown.bind(this)
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

  enable(): void {
    if (this.enabled) return
    this.enabled = true
    this.rendererDom.addEventListener('pointermove', this.handlePointerMoveBound)
    this.rendererDom.addEventListener('pointerdown', this.handlePointerDownBound)
    this.rendererDom.addEventListener('pointerup', this.handlePointerUpBound)
    this.rendererDom.addEventListener('dblclick', this.handleDblClickBound)
    window.addEventListener('keydown', this.handleKeyDownBound)
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.rendererDom.removeEventListener('pointermove', this.handlePointerMoveBound)
    this.rendererDom.removeEventListener('pointerdown', this.handlePointerDownBound)
    this.rendererDom.removeEventListener('pointerup', this.handlePointerUpBound)
    this.rendererDom.removeEventListener('dblclick', this.handleDblClickBound)
    window.removeEventListener('keydown', this.handleKeyDownBound)
    this.highlightMesh.visible = false
    this.cancelDrag()
  }

  deselectMachine(): void {
    this.selectedMachine = null
    this.factoryRenderer?.clearMachineHighlight()
    this.onMachineSelected(null)
  }

  private selectMachine(machine: MachineInfo): void {
    this.deselectBelt()
    this.selectedMachine = machine
    this.factoryRenderer?.highlightMachine(machine.id)
    this.onMachineSelected(machine)
  }

  private deselectBelt(): void {
    if (!this.selectedBelt) return
    this.selectedBelt = null
    this.factoryRenderer?.clearBeltHighlight()
    this.onBeltSelected(null)
  }

  private selectBelt(belt: BeltInfo): void {
    this.deselectMachine()
    this.selectedBelt = belt
    this.factoryRenderer?.highlightBelts([belt.id])
    this.onBeltSelected(belt)
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Delete') {
      const tag = (event.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (this.selectedMachine) {
        this.deleteSelectedMachine()
      } else if (this.selectedBelt) {
        this.deleteSelectedBelt()
      }
    }
  }

  dispose(): void {
    this.disable()
    this.highlightMesh.geometry.dispose()
    this.highlightMaterial.dispose()
    this.scene.remove(this.highlightMesh)
    this.ghostMesh.geometry.dispose()
    this.ghostMaterial.dispose()
    this.scene.remove(this.ghostMesh)
    this.clearGhostSlots()
    this.ghostSlotGeometry.dispose()
    this.ghostSlotInputMaterial.dispose()
    this.ghostSlotOutputMaterial.dispose()
    this.clearGhostBelts()
    if (this.ghostCornerGeometry) {
      this.ghostCornerGeometry.dispose()
      this.ghostCornerGeometry = null
    }
    this.ghostBeltOkMaterial.dispose()
    this.ghostBeltBadMaterial.dispose()
    this.scene.remove(this.ghostBeltGroup)
  }

  // ─── Helpers ──────────────────────────────────────────

  private cancelDrag(): void {
    if (this.dragMode) this.controls.enabled = true
    this.dragMode = null
    this.dragOrigin = null
    this.dragSourceSlotType = null
    this.dragConnectedMachines = []
    this.dragIgnoreBeltIds = new Set()
    this.ghostMesh.visible = false
    this.clearGhostSlots()
    this.clearGhostBelts()
    this.highlightMaterial.opacity = 0.3
  }

  private updateMouseNDC(event: PointerEvent | MouseEvent): void {
    const rect = this.rendererDom.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  private raycastToGrid(): GridPosition | null {
    this.raycaster.setFromCamera(this.mouse, this.camera)
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.intersectPoint)) return null
    const gx = Math.floor(this.intersectPoint.x + this.factory.width / 2)
    const gz = Math.floor(this.intersectPoint.z + this.factory.height / 2)
    if (!this.factory.isInBounds(gx, gz)) return null
    return { x: gx, z: gz }
  }

  private gridToWorld(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x - this.factory.width / 2 + 0.5, 0, z - this.factory.height / 2 + 0.5)
  }

  private detectSlot(cell: GridPosition, machine: MachineInfo): 'input' | 'output' | null {
    const cellWorld = this.gridToWorld(cell.x, cell.z)
    const localX = this.intersectPoint.x - cellWorld.x
    const localZ = this.intersectPoint.z - cellWorld.z
    const outputOffsets = machine.slots.outputs.map(p => slotPositionToOffset(p, machine.rotation))
    const inputOffsets = machine.slots.inputs.map(p => slotPositionToOffset(p, machine.rotation))
    let bestSlot: 'input' | 'output' | null = null
    let bestDot = 0.25
    for (const off of outputOffsets) {
      const dot = localX * off.x + localZ * off.z
      if (dot > bestDot) { bestDot = dot; bestSlot = 'output' }
    }
    for (const off of inputOffsets) {
      const dot = localX * off.x + localZ * off.z
      if (dot > bestDot) { bestDot = dot; bestSlot = 'input' }
    }
    return bestSlot
  }

  // ─── Belt-drag snap ───────────────────────────────────

  private static readonly NEIGHBOR_DIRS: ReadonlyArray<GridPosition> = [
    { x: 0, z: -1 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 1, z: 0 },
  ]

  /**
   * When dragging a belt, resolve the cursor cell to a snap target.
   * Returns the cell itself if it has a machine, otherwise checks the 4
   * adjacent cells for a machine that qualifies as a snap target.
   */
  private findBeltSnapTarget(cursorCell: GridPosition): GridPosition | null {
    // If cursor is on a machine, use existing behavior
    if (this.factory.getMachineAt(cursorCell.x, cursorCell.z)) return cursorCell

    if (!this.dragOrigin || !this.dragSourceSlotType) return null

    // The complementary slot type: dragging from output → target needs input, and vice versa
    const targetSlotType: 'input' | 'output' = this.dragSourceSlotType === 'output' ? 'input' : 'output'

    for (const dir of GridInteraction.NEIGHBOR_DIRS) {
      const nx = cursorCell.x + dir.x
      const nz = cursorCell.z + dir.z
      // Must not be the source machine
      if (nx === this.dragOrigin.x && nz === this.dragOrigin.z) continue
      const machine = this.factory.getMachineAt(nx, nz)
      if (!machine) continue

      // (a) Machine has no belt connections → PlacementPlanner can auto-rotate
      if (!this.factory.machineHasAnyBelts(nx, nz)) {
        return { x: nx, z: nz }
      }

      // (b) Machine has a free slot of the complementary type pointing toward cursorCell
      const freeSlots = this.factory.getFreeSlotsOfType(machine, targetSlotType)
      for (const slot of freeSlots) {
        // slot is an offset; the world cell it points to is machine + offset
        if (machine.x + slot.x === cursorCell.x && machine.z + slot.z === cursorCell.z) {
          return { x: nx, z: nz }
        }
      }
    }
    return null
  }

  // ─── Ghost slot indicators ─────────────────────────────

  private updateGhostSlots(worldPos: THREE.Vector3, machine: MachineInfo): void {
    this.clearGhostSlots()

    const inputOffsets = machine.slots.inputs.map(p => slotPositionToOffset(p, machine.rotation))
    const outputOffsets = machine.slots.outputs.map(p => slotPositionToOffset(p, machine.rotation))

    for (const off of inputOffsets) {
      const m = new THREE.Mesh(this.ghostSlotGeometry, this.ghostSlotInputMaterial)
      m.position.set(
        worldPos.x + off.x * 0.55, 0.06, worldPos.z + off.z * 0.55,
      )
      m.rotation.y = Math.atan2(off.x, off.z)
      this.scene.add(m)
      this.ghostSlotMeshes.push(m)
    }
    for (const off of outputOffsets) {
      const m = new THREE.Mesh(this.ghostSlotGeometry, this.ghostSlotOutputMaterial)
      m.position.set(
        worldPos.x + off.x * 0.55, 0.06, worldPos.z + off.z * 0.55,
      )
      m.rotation.y = Math.atan2(off.x, off.z)
      this.scene.add(m)
      this.ghostSlotMeshes.push(m)
    }
  }

  private clearGhostSlots(): void {
    for (const m of this.ghostSlotMeshes) {
      this.scene.remove(m)
    }
    this.ghostSlotMeshes = []
  }

  // ─── Ghost belt path ─────────────────────────────────

  private clearGhostBelts(): void {
    for (const seg of this.ghostBeltSegments) {
      this.ghostBeltGroup.remove(seg)
      if (seg.geometry !== this.ghostCornerGeometry) {
        seg.geometry.dispose()
      }
    }
    this.ghostBeltSegments = []
    this.ghostBeltGroup.visible = false
  }

  /**
   * Show a ghost belt path from a pre-computed list of grid points.
   * Uses cell-based rendering: each cell gets one shape (straight, corner, or endpoint).
   */
  private showGhostBeltPathFromPoints(path: GridPosition[], collides: boolean, append = false): void {
    if (!append) this.clearGhostBelts()
    if (path.length < 2) return

    const material = collides ? this.ghostBeltBadMaterial : this.ghostBeltOkMaterial
    const BELT_WIDTH = 0.35

    // Build per-cell direction map from path segments
    const cellDirs = new Map<string, Set<string>>()
    const addDir = (x: number, z: number, dx: number, dz: number) => {
      const key = `${x},${z}`
      if (!cellDirs.has(key)) cellDirs.set(key, new Set())
      cellDirs.get(key)!.add(`${dx},${dz}`)
    }
    for (let i = 0; i < path.length - 1; i++) {
      const dx = path[i + 1].x - path[i].x
      const dz = path[i + 1].z - path[i].z
      addDir(path[i].x, path[i].z, dx, dz)
      addDir(path[i + 1].x, path[i + 1].z, -dx, -dz)
    }

    // Determine which cells are machine cells (first and last in path if they have machines)
    const machineCells = new Set<string>()
    const first = path[0]
    const last = path[path.length - 1]
    if (this.factory.getMachineAt(first.x, first.z)) machineCells.add(`${first.x},${first.z}`)
    if (this.factory.getMachineAt(last.x, last.z)) machineCells.add(`${last.x},${last.z}`)

    for (const [key, dirs] of cellDirs) {
      if (machineCells.has(key)) continue // skip machine cells

      const [x, z] = key.split(',').map(Number)
      const worldPos = this.gridToWorld(x, z)
      const dirArray = [...dirs].map(d => {
        const p = d.split(',').map(Number)
        return { dx: p[0], dz: p[1] }
      })

      if (dirArray.length === 2) {
        const [d1, d2] = dirArray
        const isCollinear = (d1.dx + d2.dx === 0 && d1.dz + d2.dz === 0)

        if (isCollinear) {
          // STRAIGHT cell
          const isHorizontal = d1.dx !== 0
          const geo = new THREE.BoxGeometry(
            isHorizontal ? 1.0 : BELT_WIDTH,
            0.06,
            isHorizontal ? BELT_WIDTH : 1.0,
          )
          const mesh = new THREE.Mesh(geo, material)
          mesh.position.set(worldPos.x, 0.04, worldPos.z)
          this.ghostBeltGroup.add(mesh)
          this.ghostBeltSegments.push(mesh)
        } else {
          // CORNER cell
          const horiz = d1.dx !== 0 ? d1 : d2
          const vert = d1.dz !== 0 ? d1 : d2
          const offset = getCornerOffset(horiz.dx, vert.dz)
          const rotationY = getCornerRotation(horiz.dx, vert.dz)

          if (!this.ghostCornerGeometry) {
            this.ghostCornerGeometry = createCornerBeltGeometry()
          }

          const cornerMesh = new THREE.Mesh(this.ghostCornerGeometry, material)
          cornerMesh.position.set(worldPos.x + offset.x, 0.011, worldPos.z + offset.z)
          cornerMesh.rotation.y = rotationY
          this.ghostBeltGroup.add(cornerMesh)
          this.ghostBeltSegments.push(cornerMesh)
        }
      } else if (dirArray.length === 1) {
        // ENDPOINT cell (half-length)
        const d = dirArray[0]
        const isHorizontal = d.dx !== 0
        const geo = new THREE.BoxGeometry(
          isHorizontal ? 0.5 : BELT_WIDTH,
          0.06,
          isHorizontal ? BELT_WIDTH : 0.5,
        )
        const mesh = new THREE.Mesh(geo, material)
        mesh.position.set(
          worldPos.x + d.dx * 0.25,
          0.04,
          worldPos.z + d.dz * 0.25,
        )
        this.ghostBeltGroup.add(mesh)
        this.ghostBeltSegments.push(mesh)
      }
    }

    this.ghostBeltGroup.visible = true
  }

  // ─── Belt fallback helpers ────────────────────────────

  /**
   * Compute the best belt path, trying all fallback strategies:
   * original slot type (strict → relaxed) → reverse slot type (strict → relaxed).
   */
  private computeBestBeltPath(
    origin: GridPosition, target: GridPosition,
    slotType: 'input' | 'output',
    ignoreBeltIds?: ReadonlySet<string>,
  ): { path: GridPosition[], collides: boolean } | null {
    // Try original slot type
    let result = this.factory.computeBeltFromSlotPath(origin, target, slotType, ignoreBeltIds, true)
    if (!result || result.collides) {
      const relaxed = this.factory.computeBeltFromSlotPath(origin, target, slotType, ignoreBeltIds)
      if (relaxed && (!result || !relaxed.collides)) {
        result = relaxed
      }
    }
    // Try reverse slot type (auto-rotation only — preserving rotation makes no sense
    // when already falling back to the opposite slot direction)
    if (!result || result.collides) {
      const reverseSlotType: 'input' | 'output' = slotType === 'input' ? 'output' : 'input'
      const reversed = this.factory.computeBeltFromSlotPath(origin, target, reverseSlotType, ignoreBeltIds)
      if (reversed && (!result || !reversed.collides)) {
        result = reversed
      }
    }
    return result
  }

  /**
   * Try to place a belt chain with all fallback strategies:
   * original slot type (strict → relaxed) → reverse slot type (strict → relaxed).
   */
  private tryPlaceBeltChain(
    srcMachine: MachineInfo, dstMachine: MachineInfo,
    slotType: 'input' | 'output',
  ): boolean {
    let placed = this.factory.placeBeltChain(srcMachine, dstMachine, slotType, true)
    if (!placed) {
      placed = this.factory.placeBeltChain(srcMachine, dstMachine, slotType)
    }
    // Reverse slot type: auto-rotation only — preserving rotation makes no sense
    // when already falling back to the opposite slot direction
    if (!placed) {
      const reverseSlotType: 'input' | 'output' = slotType === 'input' ? 'output' : 'input'
      placed = this.factory.placeBeltChain(srcMachine, dstMachine, reverseSlotType)
    }
    return placed
  }

  // ─── Event Handlers ───────────────────────────────────

  private handlePointerMove(event: PointerEvent): void {
    this.updateMouseNDC(event)
    const cell = this.raycastToGrid()
    if (!cell) { this.highlightMesh.visible = false; this.rendererDom.style.cursor = 'default'; return }

    const worldPos = this.gridToWorld(cell.x, cell.z)
    this.highlightMesh.position.set(worldPos.x, 0.01, worldPos.z)
    this.highlightMesh.visible = true

    if (this.dragMode === 'machine' && this.dragOrigin) {
      const canMove = this.factory.canMoveMachine(this.dragOrigin.x, this.dragOrigin.z, cell.x, cell.z)
      if (canMove) {
        this.highlightMaterial.color.setHex(0x00ff88)
        this.highlightMaterial.opacity = 0.5
        const machineType = this.factory.getMachineAt(this.dragOrigin.x, this.dragOrigin.z)?.type
        this.ghostMaterial.color.setHex(machineType ? MACHINE_COLORS[machineType] ?? 0xffffff : 0xffffff)
        this.ghostMaterial.opacity = 0.7
      } else {
        this.highlightMaterial.color.setHex(0xff4444)
        this.highlightMaterial.opacity = 0.5
        this.ghostMaterial.color.setHex(0xff4444)
        this.ghostMaterial.opacity = 0.5
      }
      this.ghostMesh.position.set(worldPos.x, 0.45, worldPos.z)
      this.ghostMesh.visible = true
      const draggedMachine = this.factory.getMachineAt(this.dragOrigin.x, this.dragOrigin.z)
      if (draggedMachine) {
        this.updateGhostSlots(worldPos, draggedMachine)
      }
      // Show ghost belt paths using slot-based routing (matches actual reconnection)
      this.clearGhostBelts()
      const ghostBlockedCells = new Set<string>()
      for (const conn of this.dragConnectedMachines) {
        if (!draggedMachine) continue
        const result = this.factory.computeReconnectPath(
          cell.x, cell.z,
          draggedMachine.type, draggedMachine.rotation,
          conn.position, conn.machineIsSource,
          this.dragIgnoreBeltIds,
          ghostBlockedCells.size > 0 ? ghostBlockedCells : undefined,
        )
        if (result) {
          const collides = !canMove || result.collides
          this.showGhostBeltPathFromPoints(result.path, collides, /* append */ true)
          // Block intermediate cells for subsequent ghost paths (prevents crossings)
          for (let i = 1; i < result.path.length - 1; i++) {
            ghostBlockedCells.add(`${result.path[i].x},${result.path[i].z}`)
          }
        }
      }
    } else if (this.dragMode === 'belt' && this.dragOrigin) {
      this.highlightMaterial.color.setHex(0xff8844)
      this.highlightMaterial.opacity = 0.5
      this.ghostMesh.visible = false
      this.clearGhostSlots()
      // Show ghost belt path using slot-aware computation
      if (this.dragSourceSlotType) {
        // Snap to nearby machine if cursor cell is empty
        const snapTarget = this.findBeltSnapTarget(cell)
        const effectiveTarget = snapTarget ?? cell
        // Move highlight to snap target when snapping
        if (snapTarget && (snapTarget.x !== cell.x || snapTarget.z !== cell.z)) {
          const snapWorld = this.gridToWorld(snapTarget.x, snapTarget.z)
          this.highlightMesh.position.set(snapWorld.x, 0.01, snapWorld.z)
        }

        const result = this.computeBestBeltPath(
          this.dragOrigin, effectiveTarget, this.dragSourceSlotType, this.dragIgnoreBeltIds,
        )
        this.clearGhostBelts()
        if (result) {
          this.showGhostBeltPathFromPoints(result.path, result.collides)
        } else {
          // Fallback: show ghost belt from source slot toward cursor cell
          const srcMachine = this.factory.getMachineAt(this.dragOrigin.x, this.dragOrigin.z)
          if (srcMachine) {
            // Check if a valid connection is possible — if not, force red ghost
            const srcHasFreeOutput = this.factory.getFreeSlotsOfType(srcMachine, 'output', this.dragIgnoreBeltIds).length > 0
            const srcHasFreeInput = this.factory.getFreeSlotsOfType(srcMachine, 'input', this.dragIgnoreBeltIds).length > 0
            let noFreeSlots = !srcHasFreeOutput && !srcHasFreeInput
            // Also check target machine compatibility when hovering over one
            const tgtMachine = this.factory.getMachineAt(effectiveTarget.x, effectiveTarget.z)
            if (!noFreeSlots && tgtMachine && (tgtMachine.x !== srcMachine.x || tgtMachine.z !== srcMachine.z)) {
              const tgtHasFreeInput = this.factory.getFreeSlotsOfType(tgtMachine, 'input', this.dragIgnoreBeltIds).length > 0
              const tgtHasFreeOutput = this.factory.getFreeSlotsOfType(tgtMachine, 'output', this.dragIgnoreBeltIds).length > 0
              const canConnect = (srcHasFreeOutput && tgtHasFreeInput) || (srcHasFreeInput && tgtHasFreeOutput)
              if (!canConnect) noFreeSlots = true
            }
            const slotList = (this.dragSourceSlotType === 'output' ? srcMachine.slots.outputs : srcMachine.slots.inputs)
              .map(p => slotPositionToOffset(p, srcMachine.rotation))
            const slotOff = pickBestSlotOffset(slotList, srcMachine.x, srcMachine.z, effectiveTarget)
            if (slotOff) {
              const slotCell = { x: srcMachine.x + slotOff.x, z: srcMachine.z + slotOff.z }
              if (slotCell.x === effectiveTarget.x && slotCell.z === effectiveTarget.z) {
                this.showGhostBeltPathFromPoints(
                  [{ x: srcMachine.x, z: srcMachine.z }, slotCell], noFreeSlots,
                )
              } else {
                const mid = this.factory.findBestBeltPath(slotCell, effectiveTarget, this.dragIgnoreBeltIds, slotOff)
                this.showGhostBeltPathFromPoints(
                  [{ x: srcMachine.x, z: srcMachine.z }, ...mid.path], noFreeSlots || mid.collides,
                )
              }
            }
          }
        }
      }
    } else {
      const existing = this.factory.getMachineAt(cell.x, cell.z)
      this.highlightMaterial.color.setHex(existing ? 0x4488ff : 0x00ff88)
      this.highlightMaterial.opacity = 0.3

      // Change cursor to 'grab' when hovering over a slot
      if (this.factoryRenderer) {
        this.raycaster.setFromCamera(this.mouse, this.camera)
        const hit = this.factoryRenderer.raycastInteraction(this.raycaster)
        if (hit && (hit.type === 'input' || hit.type === 'output')) {
          this.rendererDom.style.cursor = 'grab'
        } else {
          this.rendererDom.style.cursor = 'default'
        }
      }
    }
  }

  private handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return
    this.updateMouseNDC(event)
    const cell = this.raycastToGrid()
    if (!cell) {
      this.deselectMachine()
      this.deselectBelt()
      return
    }

    // 1. Check 3D slot mesh raycast first — slots can overflow into neighboring cells
    if (this.factoryRenderer) {
      const hit = this.factoryRenderer.raycastInteraction(this.raycaster)
      if (hit && (hit.type === 'input' || hit.type === 'output')) {
        const owner = this.factory.getMachineById(hit.machineId)
        if (owner) {
          this.dragMode = 'belt'
          this.dragOrigin = { x: owner.x, z: owner.z }
          this.dragSourceSlotType = hit.type
          this.controls.enabled = false
          this.deselectMachine()
          this.deselectBelt()
          return
        }
      }

      // 2. Check machine body hit
      if (hit && hit.type === 'machine') {
        const machine = this.factory.getMachineById(hit.machineId)
        if (machine) {
          this.dragMode = 'machine'
          this.dragOrigin = { x: machine.x, z: machine.z }
          this.dragConnectedMachines = this.factory.getConnectedMachines(machine.x, machine.z)
          this.dragIgnoreBeltIds = this.factory.getConnectedBeltIds(machine.x, machine.z)
          this.ghostMaterial.color.setHex(MACHINE_COLORS[machine.type] ?? 0xffffff)
          this.ghostMesh.visible = false
          this.controls.enabled = false
          return
        }
      }
    }

    const existing = this.factory.getMachineAt(cell.x, cell.z)
    if (existing) {
      // Fallback slot detection when no FactoryRenderer
      let hitSlot: 'input' | 'output' | null = null
      if (!this.factoryRenderer) {
        hitSlot = this.detectSlot(cell, existing)
      }
      if (hitSlot === 'output' || hitSlot === 'input') {
        this.dragMode = 'belt'
        this.dragOrigin = cell
        this.dragSourceSlotType = hitSlot
        this.controls.enabled = false
        this.deselectMachine()
        this.deselectBelt()
      } else {
        this.dragMode = 'machine'
        this.dragOrigin = cell
        this.dragConnectedMachines = this.factory.getConnectedMachines(cell.x, cell.z)
        this.dragIgnoreBeltIds = this.factory.getConnectedBeltIds(cell.x, cell.z)
        this.ghostMaterial.color.setHex(MACHINE_COLORS[existing.type] ?? 0xffffff)
        this.ghostMesh.visible = false
        this.controls.enabled = false
      }
      return
    }

    // 3. Check if clicking on a belt segment (prefer 3D raycast)
    if (this.factoryRenderer) {
      this.raycaster.setFromCamera(this.mouse, this.camera)
      const hitBeltId = this.factoryRenderer.raycastBelt(this.raycaster)
      if (hitBeltId) {
        const beltInfo = this.factory.getBelts().find(b => b.id === hitBeltId)
        if (beltInfo) {
          this.selectBelt(beltInfo)
          return
        }
      }
    } else {
      const beltsHere = this.factory.getBeltsAt(cell.x, cell.z)
      if (beltsHere.length > 0) {
        this.selectBelt(beltsHere[0])
        return
      }
    }

    // 4. Empty cell → deselect everything
    this.deselectMachine()
    this.deselectBelt()
  }

  private handlePointerUp(_event: PointerEvent): void {
    if (!this.dragMode || !this.dragOrigin) return
    this.updateMouseNDC(_event)
    const cell = this.raycastToGrid()

    if (cell) {
      const sameCell = cell.x === this.dragOrigin.x && cell.z === this.dragOrigin.z

      if (this.dragMode === 'machine') {
        if (sameCell) {
          const machine = this.factory.getMachineAt(this.dragOrigin.x, this.dragOrigin.z)
          if (machine) {
            this.selectMachine(machine)
          }
        } else {
          const target = this.factory.getMachineAt(cell.x, cell.z)
          if (!target) {
            const moved = this.factory.moveMachine(this.dragOrigin.x, this.dragOrigin.z, cell.x, cell.z)
            if (moved) {
              this.onFactoryChanged()
            }
          }
        }
      } else if (this.dragMode === 'belt') {
        const snapTarget = this.findBeltSnapTarget(cell)
        const effectiveTarget = snapTarget ?? cell
        const sameCellSnap = effectiveTarget.x === this.dragOrigin.x && effectiveTarget.z === this.dragOrigin.z
        if (!sameCellSnap && snapTarget) {
          const srcMachine = this.factory.getMachineAt(this.dragOrigin.x, this.dragOrigin.z)
          const dstMachine = this.factory.getMachineAt(effectiveTarget.x, effectiveTarget.z)
          if (srcMachine && dstMachine) {
            const slotType = this.dragSourceSlotType ?? 'output'
            const placed = this.tryPlaceBeltChain(srcMachine, dstMachine, slotType)
            if (placed) {
              this.onFactoryChanged()
            }
          }
        }
      }
    }

    this.dragMode = null
    this.dragOrigin = null
    this.dragSourceSlotType = null
    this.dragConnectedMachines = []
    this.dragIgnoreBeltIds = new Set()
    this.ghostMesh.visible = false
    this.clearGhostSlots()
    this.clearGhostBelts()
    this.highlightMaterial.opacity = 0.3
    this.highlightMaterial.color.setHex(0x00ff88)
    this.controls.enabled = true
  }

  private handleDblClick(event: MouseEvent): void {
    this.updateMouseNDC(event)
    const cell = this.raycastToGrid()
    if (!cell) return

    // Double-click on belt → no action
    const beltsHere = this.factory.getBeltsAt(cell.x, cell.z)
    if (beltsHere.length > 0 && !this.factory.getMachineAt(cell.x, cell.z)) return

    const machine = this.factory.getMachineAt(cell.x, cell.z)
    if (machine) {
      this.factory.rotateMachine(machine, rotateDirectionCW(machine.rotation))
      this.selectMachine(machine)
      this.onFactoryChanged()
    } else {
      const placed = this.factory.placeMachine(cell.x, cell.z, 'part_fabricator')
      if (placed) {
        this.selectMachine(placed)
        this.onFactoryChanged()
      }
    }
  }
}
