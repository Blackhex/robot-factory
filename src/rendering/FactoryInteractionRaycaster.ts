import * as THREE from 'three'

export type MachineInteractionHit = {
  type: 'input' | 'output' | 'machine'
  machineId: string
  slotIndex?: number
}

export type MachineSlotMeshGroup = {
  inputs: readonly THREE.Mesh[]
  outputs: readonly THREE.Mesh[]
}

export type FactoryInteractionRaycasterSources = {
  machineMeshes: ReadonlyMap<string, THREE.Mesh>
  slotMeshes: ReadonlyMap<string, MachineSlotMeshGroup>
  machineArrows: ReadonlyMap<string, MachineSlotMeshGroup>
  beltMeshes: ReadonlyMap<string, THREE.Mesh>
  cellBeltIds: ReadonlyMap<THREE.Mesh, readonly string[]>
}

type SlotMeshInfo = {
  machineId: string
  slot: 'input' | 'output'
  index: number
}

export class FactoryInteractionRaycaster {
  private readonly sources: FactoryInteractionRaycasterSources

  constructor(sources: FactoryInteractionRaycasterSources) {
    this.sources = sources
  }

  raycastBelt(raycaster: THREE.Raycaster): string | null {
    const meshList = Array.from(this.sources.beltMeshes.values())
    const hits = raycaster.intersectObjects(meshList, false)
    if (hits.length === 0) return null

    const hitMesh = hits[0].object as THREE.Mesh
    const ids = this.sources.cellBeltIds.get(hitMesh)
    return ids && ids.length > 0 ? ids[0] : null
  }

  raycastMachineInteraction(raycaster: THREE.Raycaster): MachineInteractionHit | null {
    const { slotMeshes, slotMeshToInfo } = this.collectSlotAndArrowMeshes()
    const machineEntries = Array.from(this.sources.machineMeshes.entries())
    const slotHits = raycaster.intersectObjects(slotMeshes, false)
    const machineHits = raycaster.intersectObjects(machineEntries.map(([, mesh]) => mesh), false)

    const slotHit = slotHits[0]
    if (slotHit) {
      const info = slotMeshToInfo.get(slotHit.object as THREE.Mesh)
      if (info) {
        return { type: info.slot, machineId: info.machineId, slotIndex: info.index }
      }
    }

    const machineHit = machineHits[0]
    if (!machineHit) return null

    const hitMesh = machineHit.object as THREE.Mesh
    const entry = machineEntries.find(([, mesh]) => mesh === hitMesh)
    return entry ? { type: 'machine', machineId: entry[0] } : null
  }

  private collectSlotAndArrowMeshes(): {
    slotMeshes: THREE.Mesh[]
    slotMeshToInfo: Map<THREE.Mesh, SlotMeshInfo>
  } {
    const slotMeshes: THREE.Mesh[] = []
    const slotMeshToInfo = new Map<THREE.Mesh, SlotMeshInfo>()
    this.addSlotMeshGroup(slotMeshes, slotMeshToInfo, this.sources.slotMeshes)
    this.addSlotMeshGroup(slotMeshes, slotMeshToInfo, this.sources.machineArrows)
    return { slotMeshes, slotMeshToInfo }
  }

  private addSlotMeshGroup(
    slotMeshes: THREE.Mesh[],
    slotMeshToInfo: Map<THREE.Mesh, SlotMeshInfo>,
    groups: ReadonlyMap<string, MachineSlotMeshGroup>,
  ): void {
    for (const [machineId, group] of groups) {
      for (let index = 0; index < group.inputs.length; index++) {
        const mesh = group.inputs[index]
        slotMeshes.push(mesh)
        slotMeshToInfo.set(mesh, { machineId, slot: 'input', index })
      }
      for (let index = 0; index < group.outputs.length; index++) {
        const mesh = group.outputs[index]
        slotMeshes.push(mesh)
        slotMeshToInfo.set(mesh, { machineId, slot: 'output', index })
      }
    }
  }
}