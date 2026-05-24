import * as THREE from 'three'
import type { Factory } from '../game/Factory'
import type { MachineType, ItemType } from '../game/types'
import type { SceneManager } from './SceneManager'
import { FactoryInteractionRaycaster, type MachineInteractionHit } from './FactoryInteractionRaycaster'
import { BeltMeshRenderer } from './BeltMeshRenderer'
import { MachineMeshRenderer, type MachineMeshGroup, type MachineRuntimeView } from './MachineMeshRenderer'
import { GRID_COLORS } from './RenderingAssets'

export {
  BELT_WIDTH,
  CORNER_OUTER_R,
  CORNER_INNER_R,
  createCornerBeltGeometry,
  getCornerOffset,
  getCornerRotation,
} from './BeltMeshRenderer'

export class FactoryRenderer {
  private readonly factory: Factory
  private readonly scene: THREE.Scene
  private readonly gridGroup: THREE.Group = new THREE.Group()
  readonly machineMeshes: Map<string, THREE.Mesh>
  readonly slotMeshes: Map<string, MachineMeshGroup>
  readonly machineIcons: Map<string, THREE.Mesh>
  readonly recipeIcons: Map<string, THREE.Mesh>
  readonly machineArrows: Map<string, MachineMeshGroup>
  private readonly beltMeshes: Map<string, THREE.Mesh> = new Map()
  private readonly cellBeltIds: Map<THREE.Mesh, string[]> = new Map()
  private readonly interactionRaycaster: FactoryInteractionRaycaster
  private readonly beltMeshRenderer: BeltMeshRenderer
  private readonly machineMeshRenderer: MachineMeshRenderer
  readonly machineHighlightMaterials: Map<MachineType, THREE.MeshStandardMaterial>
  readonly machineMaterials: Map<MachineType, THREE.MeshStandardMaterial>
  readonly iconMaterials: Map<MachineType, THREE.MeshBasicMaterial>

  constructor(
    factory: Factory,
    sceneManager: SceneManager,
    options?: { getMachineRuntime?: (machineId: string) => MachineRuntimeView | null },
  ) {
    this.factory = factory
    this.scene = sceneManager.getScene()

    this.machineMeshRenderer = new MachineMeshRenderer({
      factory: this.factory,
      scene: this.scene,
      gridToWorld: (x, z) => this.gridToWorld(x, z),
      getMachineRuntime: options?.getMachineRuntime,
    })
    this.machineMeshes = this.machineMeshRenderer.machineMeshes
    this.slotMeshes = this.machineMeshRenderer.slotMeshes
    this.machineIcons = this.machineMeshRenderer.machineIcons
    this.recipeIcons = this.machineMeshRenderer.recipeIcons
    this.machineArrows = this.machineMeshRenderer.machineArrows
    this.machineMaterials = this.machineMeshRenderer.machineMaterials
    this.machineHighlightMaterials = this.machineMeshRenderer.machineHighlightMaterials
    this.iconMaterials = this.machineMeshRenderer.iconMaterials

    this.interactionRaycaster = new FactoryInteractionRaycaster({
      machineMeshes: this.machineMeshes,
      slotMeshes: this.slotMeshes,
      machineArrows: this.machineArrows,
      beltMeshes: this.beltMeshes,
      cellBeltIds: this.cellBeltIds,
    })
    this.beltMeshRenderer = new BeltMeshRenderer({
      factory: this.factory,
      scene: this.scene,
      beltMeshes: this.beltMeshes,
      cellBeltIds: this.cellBeltIds,
      gridToWorld: (x, z) => this.gridToWorld(x, z),
    })

    this.scene.add(this.gridGroup)
  }

  renderGrid(): void {
    while (this.gridGroup.children.length > 0) {
      const child = this.gridGroup.children[0]
      this.gridGroup.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose())
        } else {
          child.material.dispose()
        }
      }
    }

    const { width, height } = this.factory
    const floorGeometry = new THREE.PlaneGeometry(width, height)
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: GRID_COLORS.floor,
      roughness: 0.9,
    })
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.01
    floor.receiveShadow = true
    this.gridGroup.add(floor)

    const size = Math.max(width, height)
    const minorGrid = new THREE.GridHelper(size, size, GRID_COLORS.minor, GRID_COLORS.minor)
    this.gridGroup.add(minorGrid)

    const majorGrid = new THREE.GridHelper(
      size,
      Math.ceil(size / 5),
      GRID_COLORS.major,
      GRID_COLORS.major,
    )
    majorGrid.position.y = 0.001
    this.gridGroup.add(majorGrid)
  }

  updateMachines(): void {
    this.machineMeshRenderer.update()
  }

  updateBelts(): void {
    this.beltMeshRenderer.update()
  }

  highlightBelts(beltIds: string[]): void {
    this.beltMeshRenderer.highlightBelts(beltIds)
  }

  clearBeltHighlight(): void {
    this.beltMeshRenderer.clearHighlight()
  }

  highlightMachine(machineId: string): void {
    this.machineMeshRenderer.highlightMachine(machineId)
  }

  clearMachineHighlight(): void {
    this.machineMeshRenderer.clearMachineHighlight()
  }

  get highlightedMachineId(): string | null {
    return this.machineMeshRenderer.highlightedMachineId
  }

  /** Rebuild machine + belt meshes from Factory state. Call after edits. */
  syncMeshes(): void {
    this.updateMachines()
    this.updateBelts()
  }

  getRecipeBadgeOutputType(machineId: string): ItemType | null {
    return this.machineMeshRenderer.getRecipeBadgeOutputType(machineId)
  }

  getRecipeBadgeDependenciesSatisfied(machineId: string): boolean | null {
    return this.machineMeshRenderer.getRecipeBadgeDependenciesSatisfied(machineId)
  }

  /**
   * Advance per-frame animation by elapsed real seconds. Call from rAF only.
   *
   * Callers MUST pass `paused = true` whenever the simulation is paused or
   * not running, so the belt chevron texture stops scrolling in sync with
   * the (frozen) item flow.
   *
   * `getSpeed` (optional) lets the caller report each belt's current
   * transport speed (cells/sec) so chevron scroll rate reflects
   * SET_BELT_SPEED. When omitted, every chevron advances at the default
   * 1.0 UV/sec rate.
   */
  tick(
    dt: number,
    paused: boolean,
    getSpeed?: (beltLogicalId: string) => number,
    camera?: THREE.Camera,
  ): void {
    this.beltMeshRenderer.tickChevronScroll(dt, paused, getSpeed)
    if (camera) this.machineMeshRenderer.tickBillboards(camera)
  }

  dispose(): void {
    this.machineMeshRenderer.dispose()
    this.beltMeshRenderer.dispose()

    while (this.gridGroup.children.length > 0) {
      const child = this.gridGroup.children[0]
      this.gridGroup.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose())
        } else {
          child.material.dispose()
        }
      }
    }
    this.scene.remove(this.gridGroup)

  }

  raycastBelt(raycaster: THREE.Raycaster): string | null {
    return this.interactionRaycaster.raycastBelt(raycaster)
  }

  raycastInteraction(raycaster: THREE.Raycaster): MachineInteractionHit | null {
    return this.interactionRaycaster.raycastMachineInteraction(raycaster)
  }

  private gridToWorld(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(
      x - this.factory.width / 2 + 0.5,
      0,
      z - this.factory.height / 2 + 0.5,
    )
  }
}
