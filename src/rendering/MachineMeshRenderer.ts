import * as THREE from 'three'
import type { Factory, MachineInfo } from '../game/Factory'
import { directionToDegrees, slotPositionToOffset } from '../game/Factory'
import type { ItemType, MachineType } from '../game/types'
import {
  MACHINE_COLORS,
  RECIPE_ICON_COLORS,
  createArrowTexture,
  createMachineIconTexture,
  createRecipeItemBadgeTexture,
} from './RenderingAssets'

export type MachineRuntimeView = {
  hasRecipe: boolean
  recipeOutputType: ItemType | null
  dependenciesSatisfied: boolean
}

export type MachineMeshGroup = {
  inputs: THREE.Mesh[]
  outputs: THREE.Mesh[]
}

export type MachineMeshRendererOptions = {
  factory: Factory
  scene: THREE.Scene
  gridToWorld: (x: number, z: number) => THREE.Vector3
  getMachineRuntime?: (machineId: string) => MachineRuntimeView | null
}

type SlotOffset = {
  x: number
  z: number
}

export class MachineMeshRenderer {
  readonly machineMeshes: Map<string, THREE.Mesh> = new Map()
  readonly slotMeshes: Map<string, MachineMeshGroup> = new Map()
  readonly machineIcons: Map<string, THREE.Mesh> = new Map()
  readonly recipeIcons: Map<string, THREE.Mesh> = new Map()
  readonly machineArrows: Map<string, MachineMeshGroup> = new Map()
  readonly machineMaterials: Map<MachineType, THREE.MeshStandardMaterial> = new Map()
  readonly machineHighlightMaterials: Map<MachineType, THREE.MeshStandardMaterial> = new Map()
  readonly iconMaterials: Map<MachineType, THREE.MeshBasicMaterial> = new Map()

  highlightedMachineId: string | null = null

  private readonly factory: Factory
  private readonly scene: THREE.Scene
  private readonly gridToWorld: (x: number, z: number) => THREE.Vector3
  private readonly getMachineRuntime?: (machineId: string) => MachineRuntimeView | null
  private readonly recipeIconGeometry: THREE.PlaneGeometry
  private readonly recipeBadgeTextures: Map<ItemType, THREE.CanvasTexture> = new Map()
  private readonly recipeIconMaterials: Map<string, THREE.MeshBasicMaterial> = new Map()
  private readonly machineGeometry: THREE.BoxGeometry
  private readonly slotGeometry: THREE.BoxGeometry
  private readonly inputSlotMaterial: THREE.MeshStandardMaterial
  private readonly outputSlotMaterial: THREE.MeshStandardMaterial
  private readonly inputSlotHighlightMaterial: THREE.MeshStandardMaterial
  private readonly outputSlotHighlightMaterial: THREE.MeshStandardMaterial
  private readonly iconGeometry: THREE.PlaneGeometry
  private readonly arrowGeometry: THREE.PlaneGeometry
  private readonly inputArrowMaterial: THREE.MeshBasicMaterial
  private readonly outputArrowMaterial: THREE.MeshBasicMaterial

  constructor(options: MachineMeshRendererOptions) {
    this.factory = options.factory
    this.scene = options.scene
    this.gridToWorld = options.gridToWorld
    this.getMachineRuntime = options.getMachineRuntime

    this.recipeIconGeometry = new THREE.PlaneGeometry(0.85, 0.85)

    this.machineGeometry = new THREE.BoxGeometry(0.9, 0.9, 0.9)
    for (const [type, color] of Object.entries(MACHINE_COLORS)) {
      this.machineMaterials.set(type as MachineType, new THREE.MeshStandardMaterial({ color }))
      this.machineHighlightMaterials.set(type as MachineType, new THREE.MeshStandardMaterial({
        color,
        emissive: 0x4fc3f7,
        emissiveIntensity: 0.6,
        roughness: 0.3,
      }))
    }

    this.slotGeometry = new THREE.BoxGeometry(0.5, 0.25, 0.25)
    this.inputSlotMaterial = new THREE.MeshStandardMaterial({
      color: 0x44ff44,
      emissive: 0x226622,
      emissiveIntensity: 0.5,
    })
    this.outputSlotMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8844,
      emissive: 0x663311,
      emissiveIntensity: 0.5,
    })
    this.inputSlotHighlightMaterial = new THREE.MeshStandardMaterial({
      color: 0x66ff66,
      emissive: 0x4fc3f7,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    })
    this.outputSlotHighlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffaa66,
      emissive: 0x4fc3f7,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    })

    for (const type of Object.keys(MACHINE_COLORS) as MachineType[]) {
      this.iconMaterials.set(type, new THREE.MeshBasicMaterial({
        map: createMachineIconTexture(type),
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }))
    }

    this.iconGeometry = new THREE.PlaneGeometry(0.9, 0.9)
    this.arrowGeometry = new THREE.PlaneGeometry(0.5, 0.5)
    this.inputArrowMaterial = new THREE.MeshBasicMaterial({
      map: createArrowTexture('input'),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.outputArrowMaterial = new THREE.MeshBasicMaterial({
      map: createArrowTexture('output'),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  }

  update(): void {
    const currentMachines = this.factory.getMachines()
    const currentIds = new Set(currentMachines.map((machine) => machine.id))

    for (const [id, mesh] of this.machineMeshes) {
      if (!currentIds.has(id)) this.removeMachine(id, mesh)
    }

    for (const machine of currentMachines) this.ensureMachineMesh(machine)
  }

  getRecipeBadgeOutputType(machineId: string): ItemType | null {
    const view = this.getMachineRuntime?.(machineId) ?? null
    if (!view || !view.hasRecipe) return null
    return view.recipeOutputType
  }

  getRecipeBadgeDependenciesSatisfied(machineId: string): boolean | null {
    const view = this.getMachineRuntime?.(machineId) ?? null
    if (!view || !view.hasRecipe || view.recipeOutputType == null) return null
    return view.dependenciesSatisfied
  }

  highlightMachine(machineId: string): void {
    if (this.highlightedMachineId) this.restoreMachineMaterial(this.highlightedMachineId)
    this.highlightedMachineId = machineId
    const mesh = this.machineMeshes.get(machineId)
    if (!mesh) return

    const machine = this.factory.getMachines().find((candidate) => candidate.id === machineId)
    if (!machine) return
    const highlightMaterial = this.machineHighlightMaterials.get(machine.type)
    if (highlightMaterial) mesh.material = highlightMaterial

    const slots = this.slotMeshes.get(machineId)
    if (slots) {
      for (const mesh of slots.inputs) mesh.material = this.inputSlotHighlightMaterial
      for (const mesh of slots.outputs) mesh.material = this.outputSlotHighlightMaterial
    }
  }

  clearMachineHighlight(): void {
    if (this.highlightedMachineId) this.restoreMachineMaterial(this.highlightedMachineId)
    this.highlightedMachineId = null
  }

  /** Y-axis billboard: rotate recipe icons so their plane normal faces the camera in the horizontal plane, staying upright. */
  tickBillboards(camera: THREE.Camera): void {
    const cx = camera.position.x
    const cz = camera.position.z
    for (const icon of this.recipeIcons.values()) {
      const dx = cx - icon.position.x
      const dz = cz - icon.position.z
      icon.rotation.x = 0
      icon.rotation.z = 0
      icon.rotation.y = Math.atan2(dx, dz)
    }
  }

  dispose(): void {
    for (const [, mesh] of this.machineMeshes) this.scene.remove(mesh)
    this.machineMeshes.clear()

    for (const [, slots] of this.slotMeshes) this.removeMeshGroup(slots)
    this.slotMeshes.clear()

    for (const [, icon] of this.machineIcons) this.scene.remove(icon)
    this.machineIcons.clear()

    for (const [, icon] of this.recipeIcons) this.scene.remove(icon)
    this.recipeIcons.clear()
    for (const material of this.recipeIconMaterials.values()) material.dispose()
    this.recipeIconMaterials.clear()

    for (const [, arrows] of this.machineArrows) this.removeMeshGroup(arrows)
    this.machineArrows.clear()

    this.machineGeometry.dispose()
    for (const material of this.machineMaterials.values()) material.dispose()
    this.machineMaterials.clear()

    this.slotGeometry.dispose()
    this.inputSlotMaterial.dispose()
    this.outputSlotMaterial.dispose()
    this.inputSlotHighlightMaterial.dispose()
    this.outputSlotHighlightMaterial.dispose()

    for (const material of this.iconMaterials.values()) {
      if (material.map) material.map.dispose()
      material.dispose()
    }
    this.iconMaterials.clear()

    this.iconGeometry.dispose()
    this.recipeIconGeometry.dispose()
    for (const texture of this.recipeBadgeTextures.values()) texture.dispose()
    this.recipeBadgeTextures.clear()
    this.arrowGeometry.dispose()
    if (this.inputArrowMaterial.map) this.inputArrowMaterial.map.dispose()
    this.inputArrowMaterial.dispose()
    if (this.outputArrowMaterial.map) this.outputArrowMaterial.map.dispose()
    this.outputArrowMaterial.dispose()

    for (const material of this.machineHighlightMaterials.values()) material.dispose()
    this.machineHighlightMaterials.clear()
  }

  private removeMachine(id: string, mesh: THREE.Mesh): void {
    this.scene.remove(mesh)
    this.machineMeshes.delete(id)

    const slots = this.slotMeshes.get(id)
    if (slots) {
      this.removeMeshGroup(slots)
      this.slotMeshes.delete(id)
    }

    const icon = this.machineIcons.get(id)
    if (icon) {
      this.scene.remove(icon)
      this.machineIcons.delete(id)
    }

    const recipeIcon = this.recipeIcons.get(id)
    if (recipeIcon) {
      this.scene.remove(recipeIcon)
      this.recipeIcons.delete(id)
    }
    const recipeIconMaterial = this.recipeIconMaterials.get(id)
    if (recipeIconMaterial) {
      recipeIconMaterial.dispose()
      this.recipeIconMaterials.delete(id)
    }

    const arrows = this.machineArrows.get(id)
    if (arrows) {
      this.removeMeshGroup(arrows)
      this.machineArrows.delete(id)
    }
  }

  private restoreMachineMaterial(machineId: string): void {
    const mesh = this.machineMeshes.get(machineId)
    if (!mesh) return
    const machine = this.factory.getMachines().find((candidate) => candidate.id === machineId)
    if (!machine) return

    const baseMaterial = this.machineMaterials.get(machine.type)
    if (baseMaterial) mesh.material = baseMaterial

    const slots = this.slotMeshes.get(machineId)
    if (slots) {
      for (const mesh of slots.inputs) mesh.material = this.inputSlotMaterial
      for (const mesh of slots.outputs) mesh.material = this.outputSlotMaterial
    }
  }

  private ensureMachineMesh(machine: MachineInfo): void {
    const worldPos = this.gridToWorld(machine.x, machine.z)
    const rotRad = (directionToDegrees(machine.rotation) * Math.PI) / 180
    this.ensureBodyMesh(machine, worldPos, rotRad)

    const inputOffsets = machine.slots.inputs.map((position) => slotPositionToOffset(position, machine.rotation))
    const outputOffsets = machine.slots.outputs.map((position) => slotPositionToOffset(position, machine.rotation))
    const slots = this.ensureSlotMeshes(machine.id, inputOffsets.length, outputOffsets.length)
    this.positionSlotMeshes(slots, inputOffsets, outputOffsets, worldPos)
    if (this.highlightedMachineId === machine.id) {
      for (const mesh of slots.inputs) mesh.material = this.inputSlotHighlightMaterial
      for (const mesh of slots.outputs) mesh.material = this.outputSlotHighlightMaterial
    }

    this.ensureIconMesh(machine, worldPos)
    this.ensureRecipeIconMesh(machine, worldPos)
    const arrows = this.ensureArrowMeshes(machine.id, inputOffsets.length, outputOffsets.length)
    this.positionArrowMeshes(arrows, inputOffsets, outputOffsets, worldPos)
  }

  private ensureBodyMesh(machine: MachineInfo, worldPos: THREE.Vector3, rotRad: number): void {
    const existing = this.machineMeshes.get(machine.id)
    if (existing) {
      existing.position.set(worldPos.x, 0.45, worldPos.z)
      existing.rotation.y = rotRad
      const material = this.machineMaterials.get(machine.type)
      if (this.highlightedMachineId === machine.id) {
        const highlightMaterial = this.machineHighlightMaterials.get(machine.type)
        if (highlightMaterial && existing.material !== highlightMaterial) existing.material = highlightMaterial
      } else if (material && existing.material !== material) {
        existing.material = material
      }
      return
    }

    const material = this.machineMaterials.get(machine.type)
    if (!material) return
    const highlightMaterial = this.highlightedMachineId === machine.id
      ? this.machineHighlightMaterials.get(machine.type)
      : null
    const mesh = new THREE.Mesh(this.machineGeometry, highlightMaterial ?? material)
    mesh.position.set(worldPos.x, 0.45, worldPos.z)
    mesh.rotation.y = rotRad
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.scene.add(mesh)
    this.machineMeshes.set(machine.id, mesh)
  }

  private ensureSlotMeshes(id: string, inputCount: number, outputCount: number): MachineMeshGroup {
    let slots = this.slotMeshes.get(id)
    if (slots && (slots.inputs.length !== inputCount || slots.outputs.length !== outputCount)) {
      this.removeMeshGroup(slots)
      this.slotMeshes.delete(id)
      slots = undefined
    }

    if (!slots) {
      slots = {
        inputs: this.createMeshes(inputCount, this.slotGeometry, this.inputSlotMaterial),
        outputs: this.createMeshes(outputCount, this.slotGeometry, this.outputSlotMaterial),
      }
      for (const mesh of slots.inputs) mesh.castShadow = true
      for (const mesh of slots.outputs) mesh.castShadow = true
      this.slotMeshes.set(id, slots)
    }
    return slots
  }

  private ensureIconMesh(machine: MachineInfo, worldPos: THREE.Vector3): void {
    const iconMaterial = this.iconMaterials.get(machine.type)
    if (!iconMaterial) return
    let icon = this.machineIcons.get(machine.id)
    if (!icon) {
      icon = new THREE.Mesh(this.iconGeometry, iconMaterial)
      icon.rotation.x = -Math.PI / 2
      this.scene.add(icon)
      this.machineIcons.set(machine.id, icon)
    } else if (icon.material !== iconMaterial) {
      icon.material = iconMaterial
    }
    icon.position.set(worldPos.x, 0.91, worldPos.z)
  }

  private ensureRecipeIconMesh(machine: MachineInfo, worldPos: THREE.Vector3): void {
    const runtime = this.getMachineRuntime?.(machine.id) ?? null
    const existing = this.recipeIcons.get(machine.id)
    if (!runtime || !runtime.hasRecipe || runtime.recipeOutputType == null) {
      if (existing) {
        this.scene.remove(existing)
        this.recipeIcons.delete(machine.id)
      }
      const material = this.recipeIconMaterials.get(machine.id)
      if (material) {
        material.dispose()
        this.recipeIconMaterials.delete(machine.id)
      }
      return
    }
    const texture = this.getOrCreateBadgeTexture(runtime.recipeOutputType)
    let material = this.recipeIconMaterials.get(machine.id)
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        map: texture,
        color: RECIPE_ICON_COLORS.ready,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      this.recipeIconMaterials.set(machine.id, material)
    } else if (material.map !== texture) {
      material.map = texture
      material.needsUpdate = true
    }
    const targetColor = runtime.dependenciesSatisfied ? RECIPE_ICON_COLORS.ready : RECIPE_ICON_COLORS.missing
    if (material.color.getHex() !== targetColor) material.color.setHex(targetColor)

    let icon = existing
    if (!icon) {
      icon = new THREE.Mesh(this.recipeIconGeometry, material)
      this.scene.add(icon)
      this.recipeIcons.set(machine.id, icon)
    } else if (icon.material !== material) {
      icon.material = material
    }
    icon.userData.recipeOutputType = runtime.recipeOutputType // debug-only; tests read via FactoryRenderer.getRecipeBadgeOutputType
    icon.position.set(worldPos.x, 1.7, worldPos.z)
  }

  private getOrCreateBadgeTexture(itemType: ItemType): THREE.CanvasTexture {
    let texture = this.recipeBadgeTextures.get(itemType)
    if (!texture) {
      texture = createRecipeItemBadgeTexture(itemType)
      this.recipeBadgeTextures.set(itemType, texture)
    }
    return texture
  }

  private ensureArrowMeshes(id: string, inputCount: number, outputCount: number): MachineMeshGroup {
    let arrows = this.machineArrows.get(id)
    if (arrows && (arrows.inputs.length !== inputCount || arrows.outputs.length !== outputCount)) {
      this.removeMeshGroup(arrows)
      this.machineArrows.delete(id)
      arrows = undefined
    }

    if (!arrows) {
      arrows = {
        inputs: this.createMeshes(inputCount, this.arrowGeometry, this.inputArrowMaterial),
        outputs: this.createMeshes(outputCount, this.arrowGeometry, this.outputArrowMaterial),
      }
      this.machineArrows.set(id, arrows)
    }
    return arrows
  }

  private createMeshes(count: number, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh[] {
    return Array.from({ length: count }, () => {
      const mesh = new THREE.Mesh(geometry, material)
      this.scene.add(mesh)
      return mesh
    })
  }

  private positionSlotMeshes(
    slots: MachineMeshGroup,
    inputOffsets: SlotOffset[],
    outputOffsets: SlotOffset[],
    worldPos: THREE.Vector3,
  ): void {
    this.positionOffsetMeshes(slots.inputs, inputOffsets, worldPos, 0.575, 0.125, 'slot')
    this.positionOffsetMeshes(slots.outputs, outputOffsets, worldPos, 0.575, 0.125, 'slot')
  }

  private positionArrowMeshes(
    arrows: MachineMeshGroup,
    inputOffsets: SlotOffset[],
    outputOffsets: SlotOffset[],
    worldPos: THREE.Vector3,
  ): void {
    this.positionOffsetMeshes(arrows.inputs, inputOffsets, worldPos, 0.46, 0.45, 'arrow')
    this.positionOffsetMeshes(arrows.outputs, outputOffsets, worldPos, 0.46, 0.45, 'arrow')
  }

  private positionOffsetMeshes(
    meshes: THREE.Mesh[],
    offsets: SlotOffset[],
    worldPos: THREE.Vector3,
    distance: number,
    y: number,
    kind: 'slot' | 'arrow',
  ): void {
    for (let index = 0; index < offsets.length; index++) {
      const offset = offsets[index]
      const angle = Math.atan2(offset.x, offset.z)
      meshes[index].position.set(worldPos.x + offset.x * distance, y, worldPos.z + offset.z * distance)
      if (kind === 'slot') meshes[index].rotation.y = angle
      else meshes[index].rotation.set(0, angle, 0)
    }
  }

  private removeMeshGroup(group: MachineMeshGroup): void {
    for (const mesh of group.inputs) this.scene.remove(mesh)
    for (const mesh of group.outputs) this.scene.remove(mesh)
  }
}