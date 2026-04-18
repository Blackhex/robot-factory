/**
 * Shared types used by Page Objects. Kept local to the POM library so specs
 * never need to import from `src/`.
 */

export interface GridCoord {
  x: number
  z: number
}

export interface GridSize {
  width: number
  height: number
}

export const DEFAULT_GRID_SIZE: GridSize = { width: 20, height: 20 }

export interface MachineInfo {
  id: string
  type: string
  x: number
  z: number
  name?: string
}

export interface BeltInfo {
  id: string
}

export type MachineState = 'idle' | 'processing' | 'blocked'

export interface SimSnapshot {
  running: boolean
  machineCount: number
  beltCount: number
  itemsOnBelts: number
  beltItemCounts: number[]
  machineStates: Array<{
    id: string
    state: string
    inputSlots: number
    outputSlot: boolean
    consumedItems: number
  }>
}

export interface BeltMeshInspection {
  corners: Array<{
    key: string
    geometryType: string
    vertexCount: number
    hasUV: boolean
    uvRange: { minU: number; maxU: number; minV: number; maxV: number } | null
    positionX: number
    positionY: number
    positionZ: number
    bbMin: { x: number; y: number; z: number } | null
    bbMax: { x: number; y: number; z: number } | null
  }>
  straights: Array<{
    key: string
    geometryType: string
    vertexCount: number
    positionX: number
    positionY: number
    positionZ: number
  }>
  totalMeshes: number
}

export interface BeltCornerHighlightState {
  key: string
  isHighlighted: boolean
  emissiveHex: number
  emissiveStrength: number
  materialUuid: string | string[]
}

export interface BeltHighlightInspection {
  cornerCount: number
  results: BeltCornerHighlightState[]
}

export type BeltClearInspection = BeltCornerHighlightState

export interface SceneItemMeshes {
  totalCount: number
  meshes: Array<{ count: number; instancesAtItemY: number }>
}

export interface DropdownSnapshot {
  optionLabels: string[]
  fieldValue: string
  faceText: string
}

export interface FlyoutBlockSnapshot {
  id: string
  type: string
  apiText: string
  apiValue: string
  svgTexts: string[]
}

export interface EventBlockInfoEntry {
  registered: boolean
  hasPrevious: boolean
  hasNext: boolean
  color: string
}
