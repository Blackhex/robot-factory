import * as THREE from 'three'
import type { Factory, MachineInfo, BeltInfo } from '../game/Factory'
import { slotPositionToOffset, directionToDegrees } from '../game/Factory'
import type { MachineType } from '../game/types'
import type { SceneManager } from './SceneManager'
import {
  MACHINE_COLORS,
  createMachineIconTexture,
  createArrowTexture,
  createBeltArrowTexture,
  createBeltDirectionMaterial,
} from './RenderingAssets'

export { MACHINE_COLORS } from './RenderingAssets'

/**
 * Belt width and corner geometry constants.
 * The belt is 0.35 wide, centered on the cell centerline.
 * Corner cells use a straight→arc→straight layout:
 *   - Entry/exit straights of length CORNER_STRAIGHT_LEN (0.2) at each cell boundary
 *   - Quarter-ring arc centered at (S, 0, -S) with reduced radii
 * Outer extent from cell corner = CORNER_OUTER_R (0.675), inner = CORNER_INNER_R (0.325).
 */
export const BELT_WIDTH = 0.35
export const CORNER_OUTER_R = 0.5 + BELT_WIDTH / 2  // 0.675
export const CORNER_INNER_R = 0.5 - BELT_WIDTH / 2  // 0.325
export const CORNER_STRAIGHT_LEN = 0.2

/**
 * Create corner belt geometry with straight entry/exit segments and a curved arc in the middle.
 * When `reverseU` is true, the UV U coordinate runs 1→0 along the belt path.
 *
 * Layout (local coords, origin = cell corner):
 *   Entry straight: Z from 0 to -S, X from CORNER_INNER_R to CORNER_OUTER_R
 *   Arc: centered at (S, 0, -S), radii arcInnerR..arcOuterR, sweeps 0..PI/2
 *   Exit straight: X from S to 0, Z from -CORNER_INNER_R to -CORNER_OUTER_R
 */
export function createCornerBeltGeometry(height = 0.05, reverseU = false): THREE.BufferGeometry {
  const segments = 24
  const S = CORNER_STRAIGHT_LEN
  const arcInnerR = CORNER_INNER_R - S  // 0.055
  const arcOuterR = CORNER_OUTER_R - S  // 0.545
  const cx = S       // arc center X
  const cz = -S      // arc center Z
  const h = height

  // UV U allocation proportional to path length
  const arcMidR = (arcInnerR + arcOuterR) / 2
  const arcLen = arcMidR * Math.PI / 2
  const totalLen = S + arcLen + S
  const uEntry = S / totalLen
  const uArc = arcLen / totalLen

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  // Helper to map raw u through reverseU
  const mapU = (u: number) => reverseU ? 1 - u : u

  // =====================================================================
  // GROUP 0: TOP + BOTTOM faces (textured material)
  // =====================================================================

  // --- Entry straight top face ---
  const entryTopStart = positions.length / 3
  // 4 vertices: corners of the rectangle
  // v0: (INNER, h, 0)  v1: (OUTER, h, 0)  v2: (OUTER, h, -S)  v3: (INNER, h, -S)
  positions.push(CORNER_INNER_R, h, 0);  normals.push(0, 1, 0);  uvs.push(mapU(0), 0)
  positions.push(CORNER_OUTER_R, h, 0);  normals.push(0, 1, 0);  uvs.push(mapU(0), 1)
  positions.push(CORNER_OUTER_R, h, -S); normals.push(0, 1, 0);  uvs.push(mapU(uEntry), 1)
  positions.push(CORNER_INNER_R, h, -S); normals.push(0, 1, 0);  uvs.push(mapU(uEntry), 0)
  indices.push(entryTopStart, entryTopStart + 1, entryTopStart + 2)
  indices.push(entryTopStart, entryTopStart + 2, entryTopStart + 3)

  // --- Arc top face ---
  const arcTopStart = positions.length / 3
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const u = mapU(uEntry + t * uArc)
    const angle = t * Math.PI / 2
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)

    positions.push(cx + arcInnerR * cosA, h, cz - arcInnerR * sinA)
    normals.push(0, 1, 0)
    uvs.push(u, 0)

    positions.push(cx + arcOuterR * cosA, h, cz - arcOuterR * sinA)
    normals.push(0, 1, 0)
    uvs.push(u, 1)
  }
  for (let i = 0; i < segments; i++) {
    const a = arcTopStart + i * 2
    const b = a + 1
    const c = arcTopStart + (i + 1) * 2
    const d = c + 1
    indices.push(a, b, c)
    indices.push(b, d, c)
  }

  // --- Exit straight top face ---
  const exitTopStart = positions.length / 3
  // v0: (S, h, -INNER)  v1: (S, h, -OUTER)  v2: (0, h, -OUTER)  v3: (0, h, -INNER)
  positions.push(S, h, -CORNER_INNER_R);  normals.push(0, 1, 0);  uvs.push(mapU(uEntry + uArc), 0)
  positions.push(S, h, -CORNER_OUTER_R);  normals.push(0, 1, 0);  uvs.push(mapU(uEntry + uArc), 1)
  positions.push(0, h, -CORNER_OUTER_R);  normals.push(0, 1, 0);  uvs.push(mapU(1), 1)
  positions.push(0, h, -CORNER_INNER_R);  normals.push(0, 1, 0);  uvs.push(mapU(1), 0)
  indices.push(exitTopStart, exitTopStart + 1, exitTopStart + 2)
  indices.push(exitTopStart, exitTopStart + 2, exitTopStart + 3)

  // --- Entry straight bottom face ---
  const entryBottomStart = positions.length / 3
  positions.push(CORNER_INNER_R, 0, 0);  normals.push(0, -1, 0);  uvs.push(mapU(0), 0)
  positions.push(CORNER_OUTER_R, 0, 0);  normals.push(0, -1, 0);  uvs.push(mapU(0), 1)
  positions.push(CORNER_OUTER_R, 0, -S); normals.push(0, -1, 0);  uvs.push(mapU(uEntry), 1)
  positions.push(CORNER_INNER_R, 0, -S); normals.push(0, -1, 0);  uvs.push(mapU(uEntry), 0)
  indices.push(entryBottomStart, entryBottomStart + 2, entryBottomStart + 1)
  indices.push(entryBottomStart, entryBottomStart + 3, entryBottomStart + 2)

  // --- Arc bottom face ---
  const arcBottomStart = positions.length / 3
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const u = mapU(uEntry + t * uArc)
    const angle = t * Math.PI / 2
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)

    positions.push(cx + arcInnerR * cosA, 0, cz - arcInnerR * sinA)
    normals.push(0, -1, 0)
    uvs.push(u, 0)

    positions.push(cx + arcOuterR * cosA, 0, cz - arcOuterR * sinA)
    normals.push(0, -1, 0)
    uvs.push(u, 1)
  }
  for (let i = 0; i < segments; i++) {
    const a = arcBottomStart + i * 2
    const b = a + 1
    const c = arcBottomStart + (i + 1) * 2
    const d = c + 1
    indices.push(a, c, b)
    indices.push(b, c, d)
  }

  // --- Exit straight bottom face ---
  const exitBottomStart = positions.length / 3
  positions.push(S, 0, -CORNER_INNER_R);  normals.push(0, -1, 0);  uvs.push(mapU(uEntry + uArc), 0)
  positions.push(S, 0, -CORNER_OUTER_R);  normals.push(0, -1, 0);  uvs.push(mapU(uEntry + uArc), 1)
  positions.push(0, 0, -CORNER_OUTER_R);  normals.push(0, -1, 0);  uvs.push(mapU(1), 1)
  positions.push(0, 0, -CORNER_INNER_R);  normals.push(0, -1, 0);  uvs.push(mapU(1), 0)
  indices.push(exitBottomStart, exitBottomStart + 2, exitBottomStart + 1)
  indices.push(exitBottomStart, exitBottomStart + 3, exitBottomStart + 2)

  const group0End = indices.length

  // =====================================================================
  // GROUP 1: SIDE WALLS (plain material)
  // =====================================================================

  // --- Entry straight side walls ---
  // Inner wall (X = CORNER_INNER_R, Z from 0 to -S), normal (-1,0,0)
  const entryInnerWallStart = positions.length / 3
  positions.push(CORNER_INNER_R, h, 0);   normals.push(-1, 0, 0);  uvs.push(0, 1)
  positions.push(CORNER_INNER_R, 0, 0);   normals.push(-1, 0, 0);  uvs.push(0, 0)
  positions.push(CORNER_INNER_R, h, -S);  normals.push(-1, 0, 0);  uvs.push(1, 1)
  positions.push(CORNER_INNER_R, 0, -S);  normals.push(-1, 0, 0);  uvs.push(1, 0)
  indices.push(entryInnerWallStart, entryInnerWallStart + 2, entryInnerWallStart + 1)
  indices.push(entryInnerWallStart + 1, entryInnerWallStart + 2, entryInnerWallStart + 3)

  // Outer wall (X = CORNER_OUTER_R, Z from 0 to -S), normal (1,0,0)
  const entryOuterWallStart = positions.length / 3
  positions.push(CORNER_OUTER_R, h, 0);   normals.push(1, 0, 0);  uvs.push(0, 1)
  positions.push(CORNER_OUTER_R, 0, 0);   normals.push(1, 0, 0);  uvs.push(0, 0)
  positions.push(CORNER_OUTER_R, h, -S);  normals.push(1, 0, 0);  uvs.push(1, 1)
  positions.push(CORNER_OUTER_R, 0, -S);  normals.push(1, 0, 0);  uvs.push(1, 0)
  indices.push(entryOuterWallStart, entryOuterWallStart + 1, entryOuterWallStart + 2)
  indices.push(entryOuterWallStart + 1, entryOuterWallStart + 3, entryOuterWallStart + 2)

  // --- Arc outer curved wall ---
  const arcOuterWallStart = positions.length / 3
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = t * Math.PI / 2
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)

    positions.push(cx + arcOuterR * cosA, h, cz - arcOuterR * sinA)
    normals.push(cosA, 0, -sinA)
    uvs.push(t, 1)

    positions.push(cx + arcOuterR * cosA, 0, cz - arcOuterR * sinA)
    normals.push(cosA, 0, -sinA)
    uvs.push(t, 0)
  }
  for (let i = 0; i < segments; i++) {
    const a = arcOuterWallStart + i * 2
    const b = a + 1
    const c = arcOuterWallStart + (i + 1) * 2
    const d = c + 1
    indices.push(a, b, c)
    indices.push(b, d, c)
  }

  // --- Arc inner curved wall ---
  const arcInnerWallStart = positions.length / 3
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = t * Math.PI / 2
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)

    positions.push(cx + arcInnerR * cosA, h, cz - arcInnerR * sinA)
    normals.push(-cosA, 0, sinA)
    uvs.push(t, 1)

    positions.push(cx + arcInnerR * cosA, 0, cz - arcInnerR * sinA)
    normals.push(-cosA, 0, sinA)
    uvs.push(t, 0)
  }
  for (let i = 0; i < segments; i++) {
    const a = arcInnerWallStart + i * 2
    const b = a + 1
    const c = arcInnerWallStart + (i + 1) * 2
    const d = c + 1
    indices.push(a, c, b)
    indices.push(b, c, d)
  }

  // --- Exit straight side walls ---
  // Inner wall (Z = -CORNER_INNER_R, X from S to 0), normal (0,0,1)
  const exitInnerWallStart = positions.length / 3
  positions.push(S, h, -CORNER_INNER_R);  normals.push(0, 0, 1);  uvs.push(0, 1)
  positions.push(S, 0, -CORNER_INNER_R);  normals.push(0, 0, 1);  uvs.push(0, 0)
  positions.push(0, h, -CORNER_INNER_R);  normals.push(0, 0, 1);  uvs.push(1, 1)
  positions.push(0, 0, -CORNER_INNER_R);  normals.push(0, 0, 1);  uvs.push(1, 0)
  indices.push(exitInnerWallStart, exitInnerWallStart + 2, exitInnerWallStart + 1)
  indices.push(exitInnerWallStart + 1, exitInnerWallStart + 2, exitInnerWallStart + 3)

  // Outer wall (Z = -CORNER_OUTER_R, X from S to 0), normal (0,0,-1)
  const exitOuterWallStart = positions.length / 3
  positions.push(S, h, -CORNER_OUTER_R);  normals.push(0, 0, -1);  uvs.push(0, 1)
  positions.push(S, 0, -CORNER_OUTER_R);  normals.push(0, 0, -1);  uvs.push(0, 0)
  positions.push(0, h, -CORNER_OUTER_R);  normals.push(0, 0, -1);  uvs.push(1, 1)
  positions.push(0, 0, -CORNER_OUTER_R);  normals.push(0, 0, -1);  uvs.push(1, 0)
  indices.push(exitOuterWallStart, exitOuterWallStart + 1, exitOuterWallStart + 2)
  indices.push(exitOuterWallStart + 1, exitOuterWallStart + 3, exitOuterWallStart + 2)

  const group1End = indices.length

  // Build geometry
  const geometry = new THREE.BufferGeometry()
  geometry.setIndex(indices)
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))

  // Material groups: group 0 = textured (top + bottom), group 1 = plain sides
  geometry.addGroup(0, group0End, 0)
  geometry.addGroup(group0End, group1End - group0End, 1)

  return geometry
}

/** Get Y-axis rotation for a belt corner given horizontal (hx) and vertical (vz) directions. */
export function getCornerRotation(hx: number, vz: number): number {
  if (hx < 0 && vz > 0) return 0            // West + South
  if (hx < 0 && vz < 0) return -Math.PI / 2 // West + North
  if (hx > 0 && vz > 0) return Math.PI / 2  // East + South
  return Math.PI                              // East + North
}

/** Get cell-corner offset for the arc center given horizontal and vertical directions. */
export function getCornerOffset(hx: number, vz: number): { x: number; z: number } {
  return { x: hx > 0 ? 0.5 : -0.5, z: vz > 0 ? 0.5 : -0.5 }
}

function disposeMesh(mesh: THREE.Mesh, scene: THREE.Scene): void {
  mesh.geometry.dispose()
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((m) => m.dispose())
  } else {
    mesh.material.dispose()
  }
  scene.remove(mesh)
}

export class FactoryRenderer {
  private factory: Factory
  private scene: THREE.Scene
  private gridGroup: THREE.Group = new THREE.Group()
  private machineMeshes: Map<string, THREE.Mesh> = new Map()
  private slotMeshes: Map<string, { inputs: THREE.Mesh[]; outputs: THREE.Mesh[] }> = new Map()
  private machineIcons: Map<string, THREE.Mesh> = new Map()
  private machineArrows: Map<string, { inputs: THREE.Mesh[]; outputs: THREE.Mesh[] }> = new Map()
  private beltMeshes: Map<string, THREE.Mesh> = new Map()
  private cellBeltIds: Map<THREE.Mesh, string[]> = new Map()
  private _cornerBeltGeometryFwd: THREE.BufferGeometry | null = null
  private _cornerBeltGeometryRev: THREE.BufferGeometry | null = null
  private highlightedBeltIds: Set<string> = new Set()
  private beltHighlightMaterials: Map<string, THREE.MeshStandardMaterial> = new Map()
  private cornerSideMaterial: THREE.MeshStandardMaterial
  private cornerSideHighlightMaterial: THREE.MeshStandardMaterial

  private highlightedMachineId: string | null = null
  private machineHighlightMaterials: Map<MachineType, THREE.MeshStandardMaterial> = new Map()

  private machineGeometry: THREE.BoxGeometry
  private beltGeometry: THREE.BoxGeometry
  private machineMaterials: Map<MachineType, THREE.MeshStandardMaterial> = new Map()
  private beltArrowTexture: THREE.CanvasTexture
  private beltDirectionMaterials: Map<string, THREE.MeshStandardMaterial> = new Map()
  private slotGeometry: THREE.BoxGeometry
  private inputSlotMaterial: THREE.MeshStandardMaterial
  private outputSlotMaterial: THREE.MeshStandardMaterial
  private inputSlotHighlightMaterial: THREE.MeshStandardMaterial
  private outputSlotHighlightMaterial: THREE.MeshStandardMaterial
  private iconMaterials: Map<MachineType, THREE.MeshBasicMaterial> = new Map()
  private iconGeometry: THREE.PlaneGeometry
  private arrowGeometry: THREE.PlaneGeometry
  private inputArrowMaterial: THREE.MeshBasicMaterial
  private outputArrowMaterial: THREE.MeshBasicMaterial
  private static readonly BELT_SCROLL_SPEED = 0.3

  constructor(factory: Factory, sceneManager: SceneManager) {
    this.factory = factory
    this.scene = sceneManager.getScene()

    this.machineGeometry = new THREE.BoxGeometry(0.9, 0.9, 0.9)
    this.beltGeometry = new THREE.BoxGeometry(1, 0.05, 1)
    // Set material groups: sides → material[1] (plain), top+bottom → material[0] (textured)
    this.beltGeometry.clearGroups()
    this.beltGeometry.addGroup(0, 12, 1)   // +X and -X sides
    this.beltGeometry.addGroup(12, 6, 0)   // +Y top face
    this.beltGeometry.addGroup(18, 6, 0)   // -Y bottom face
    this.beltGeometry.addGroup(24, 12, 1)  // +Z and -Z sides

    for (const [type, color] of Object.entries(MACHINE_COLORS)) {
      this.machineMaterials.set(
        type as MachineType,
        new THREE.MeshStandardMaterial({ color }),
      )
    }

    this.beltArrowTexture = createBeltArrowTexture()
    const directions = ['east', 'west', 'north', 'south'] as const
    for (const dir of directions) {
      const baseMat = createBeltDirectionMaterial(dir, this.beltArrowTexture)
      this.beltDirectionMaterials.set(dir, baseMat)
      // Highlight version: share the same texture so animation applies to both
      const hlMat = new THREE.MeshStandardMaterial({
        color: baseMat.color,
        roughness: 0.3,
        map: baseMat.map,
        emissive: new THREE.Color(0x4fc3f7),
        emissiveIntensity: 0.6,
      })
      this.beltHighlightMaterials.set(dir, hlMat)
    }

    // Slot indicators (rectangular pads on input/output faces)
    this.slotGeometry = new THREE.BoxGeometry(0.5, 0.12, 0.3)
    this.inputSlotMaterial = new THREE.MeshStandardMaterial({
      color: 0x44ff44, emissive: 0x226622, emissiveIntensity: 0.5,
    })
    this.outputSlotMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8844, emissive: 0x663311, emissiveIntensity: 0.5,
    })
    this.inputSlotHighlightMaterial = new THREE.MeshStandardMaterial({
      color: 0x66ff66, emissive: 0x4fc3f7, emissiveIntensity: 0.8, roughness: 0.3,
    })
    this.outputSlotHighlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffaa66, emissive: 0x4fc3f7, emissiveIntensity: 0.8, roughness: 0.3,
    })

    // Machine type icon materials (shared per type)
    const machineTypes = Object.keys(MACHINE_COLORS) as MachineType[]
    for (const type of machineTypes) {
      const texture = createMachineIconTexture(type)
      this.iconMaterials.set(type, new THREE.MeshBasicMaterial({
        map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      }))
    }

    // Shared icon geometry (flat plane on top face)
    this.iconGeometry = new THREE.PlaneGeometry(0.9, 0.9)

    // Arrow indicators for input/output faces
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

    this.cornerSideMaterial = new THREE.MeshStandardMaterial({
      color: 0x888899,
      roughness: 0.8,
    })
    this.cornerSideHighlightMaterial = new THREE.MeshStandardMaterial({
      color: 0x888899,
      emissive: 0x4fc3f7,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    })

    // Highlighted machine materials — same base color with strong emissive glow
    for (const [type, color] of Object.entries(MACHINE_COLORS)) {
      this.machineHighlightMaterials.set(
        type as MachineType,
        new THREE.MeshStandardMaterial({
          color,
          emissive: 0x4fc3f7,
          emissiveIntensity: 0.6,
          roughness: 0.3,
        }),
      )
    }

    this.scene.add(this.gridGroup)
  }

  /** Grid cell (x, z) → world position centered at origin */
  private gridToWorld(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(
      x - this.factory.width / 2 + 0.5,
      0,
      z - this.factory.height / 2 + 0.5,
    )
  }

  renderGrid(): void {
    // Remove old grid children
    while (this.gridGroup.children.length > 0) {
      const child = this.gridGroup.children[0]
      this.gridGroup.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    }

    const { width, height } = this.factory

    // Floor plane
    const floorGeometry = new THREE.PlaneGeometry(width, height)
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a3e,
      roughness: 0.9,
    })
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.01
    floor.receiveShadow = true
    this.gridGroup.add(floor)

    // Grid lines
    const gridHelper = new THREE.GridHelper(
      Math.max(width, height),
      Math.max(width, height),
      0x444466,
      0x333355,
    )
    this.gridGroup.add(gridHelper)
  }

  updateMachines(): void {
    const currentMachines = this.factory.getMachines()
    const currentIds = new Set(currentMachines.map((m) => m.id))

    // Remove meshes for machines that no longer exist
    for (const [id, mesh] of this.machineMeshes) {
      if (!currentIds.has(id)) {
        this.scene.remove(mesh)
        this.machineMeshes.delete(id)
        // Also remove slot meshes
        const slots = this.slotMeshes.get(id)
        if (slots) {
          for (const m of slots.inputs) this.scene.remove(m)
          for (const m of slots.outputs) this.scene.remove(m)
          this.slotMeshes.delete(id)
        }
        // Remove icon sprite
        const icon = this.machineIcons.get(id)
        if (icon) {
          this.scene.remove(icon)
          this.machineIcons.delete(id)
        }
        // Remove arrow meshes
        const arrows = this.machineArrows.get(id)
        if (arrows) {
          for (const m of arrows.inputs) this.scene.remove(m)
          for (const m of arrows.outputs) this.scene.remove(m)
          this.machineArrows.delete(id)
        }
      }
    }

    // Add/update meshes for current machines
    for (const machine of currentMachines) {
      this.ensureMachineMesh(machine)
    }
  }

  updateBelts(): void {
    // Remove ALL existing belt meshes and re-create
    for (const [, mesh] of this.beltMeshes) {
      this.scene.remove(mesh)
    }
    this.beltMeshes.clear()
    this.cellBeltIds.clear()

    this.renderCellBelts()

    // Apply highlight to rendered cells
    if (this.highlightedBeltIds.size > 0) {
      for (const [, mesh] of this.beltMeshes) {
        const ids = this.cellBeltIds.get(mesh)
        if (ids && ids.some(id => this.highlightedBeltIds.has(id))) {
          this.applyBeltHighlight(mesh)
        }
      }
    }
  }

  highlightBelts(beltIds: string[]): void {
    this.highlightedBeltIds = new Set(beltIds)
    for (const [, mesh] of this.beltMeshes) {
      const ids = this.cellBeltIds.get(mesh)
      if (ids && ids.some(id => this.highlightedBeltIds.has(id))) {
        this.applyBeltHighlight(mesh)
      } else {
        this.restoreBeltMaterial(mesh)
      }
    }
  }

  clearBeltHighlight(): void {
    this.highlightedBeltIds.clear()
    for (const [, mesh] of this.beltMeshes) {
      this.restoreBeltMaterial(mesh)
    }
  }

  highlightMachine(machineId: string): void {
    // Restore previous highlight
    if (this.highlightedMachineId) this.restoreMachineMaterial(this.highlightedMachineId)
    this.highlightedMachineId = machineId
    const mesh = this.machineMeshes.get(machineId)
    if (!mesh) return
    // Find the machine type to get the matching highlight material
    const machine = this.factory.getMachines().find(m => m.id === machineId)
    if (!machine) return
    const hlMat = this.machineHighlightMaterials.get(machine.type)
    if (hlMat) mesh.material = hlMat
    // Highlight slot indicators
    const slots = this.slotMeshes.get(machineId)
    if (slots) {
      for (const m of slots.inputs) m.material = this.inputSlotHighlightMaterial
      for (const m of slots.outputs) m.material = this.outputSlotHighlightMaterial
    }
  }

  clearMachineHighlight(): void {
    if (this.highlightedMachineId) this.restoreMachineMaterial(this.highlightedMachineId)
    this.highlightedMachineId = null
  }

  private restoreMachineMaterial(machineId: string): void {
    const mesh = this.machineMeshes.get(machineId)
    if (!mesh) return
    const machine = this.factory.getMachines().find(m => m.id === machineId)
    if (!machine) return
    const baseMat = this.machineMaterials.get(machine.type)
    if (baseMat) mesh.material = baseMat
    // Restore slot indicators
    const slots = this.slotMeshes.get(machineId)
    if (slots) {
      for (const m of slots.inputs) m.material = this.inputSlotMaterial
      for (const m of slots.outputs) m.material = this.outputSlotMaterial
    }
  }

  private restoreBeltMaterial(mesh: THREE.Mesh): void {
    // Straight belts use shared beltGeometry; corners use custom curved geometry
    const isCorner = mesh.geometry !== this.beltGeometry
    if (isCorner) {
      // Corners use custom curved geometry with baked UVs — always use 'east' (no rotation)
      const dirMat = this.beltDirectionMaterials.get('east')!
      mesh.material = [dirMat, this.cornerSideMaterial]
    } else {
      // Straight/endpoint cells — use per-cell flow direction stored during rendering
      const dir = (mesh.userData.flowDir as string) ?? 'east'
      const dirMat = this.beltDirectionMaterials.get(dir) ?? this.beltDirectionMaterials.get('east')!
      mesh.material = [dirMat, this.cornerSideMaterial]
    }
  }

  private applyBeltHighlight(mesh: THREE.Mesh): void {
    // Straight belts use shared beltGeometry; corners use custom curved geometry
    const isCorner = mesh.geometry !== this.beltGeometry
    // Corners use baked UVs → always 'east'. Straight cells use stored per-cell flow direction.
    const dir = isCorner ? 'east' : ((mesh.userData.flowDir as string) ?? 'east')
    const hlMat = this.beltHighlightMaterials.get(dir) ?? this.beltHighlightMaterials.get('east')!
    mesh.material = isCorner ? [hlMat, this.cornerSideHighlightMaterial] : hlMat
  }

  update(): void {
    this.updateMachines()
    this.updateBelts()
    this.animateBelts()
  }

  dispose(): void {
    // Remove machines
    for (const [, mesh] of this.machineMeshes) {
      disposeMesh(mesh, this.scene)
    }
    this.machineMeshes.clear()

    // Remove slots
    for (const [, slots] of this.slotMeshes) {
      for (const m of slots.inputs) this.scene.remove(m)
      for (const m of slots.outputs) this.scene.remove(m)
    }
    this.slotMeshes.clear()

    // Remove icons
    for (const [, icon] of this.machineIcons) {
      this.scene.remove(icon)
    }
    this.machineIcons.clear()

    // Remove arrows
    for (const [, arrows] of this.machineArrows) {
      for (const m of arrows.inputs) this.scene.remove(m)
      for (const m of arrows.outputs) this.scene.remove(m)
    }
    this.machineArrows.clear()

    // Remove belts (includes corner meshes now)
    for (const [, mesh] of this.beltMeshes) {
      this.scene.remove(mesh)
    }
    this.beltMeshes.clear()
    this.cellBeltIds.clear()

    // Remove grid
    while (this.gridGroup.children.length > 0) {
      const child = this.gridGroup.children[0]
      this.gridGroup.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    }
    this.scene.remove(this.gridGroup)

    // Dispose shared resources
    this.machineGeometry.dispose()
    this.beltGeometry.dispose()
    for (const [, mat] of this.machineMaterials) {
      mat.dispose()
    }
    for (const mat of this.beltDirectionMaterials.values()) {
      if (mat.map) mat.map.dispose()
      mat.dispose()
    }
    this.beltDirectionMaterials.clear()
    this.beltArrowTexture.dispose()
    for (const mat of this.beltHighlightMaterials.values()) {
      // Don't dispose map — shared with base beltDirectionMaterials
      mat.dispose()
    }
    this.beltHighlightMaterials.clear()
    this.cornerSideMaterial.dispose()
    this.cornerSideHighlightMaterial.dispose()
    for (const mat of this.machineHighlightMaterials.values()) mat.dispose()
    this.machineHighlightMaterials.clear()
    if (this._cornerBeltGeometryFwd) {
      this._cornerBeltGeometryFwd.dispose()
      this._cornerBeltGeometryFwd = null
    }
    if (this._cornerBeltGeometryRev) {
      this._cornerBeltGeometryRev.dispose()
      this._cornerBeltGeometryRev = null
    }
    this.slotGeometry.dispose()
    this.inputSlotMaterial.dispose()
    this.outputSlotMaterial.dispose()
    this.inputSlotHighlightMaterial.dispose()
    this.outputSlotHighlightMaterial.dispose()
    for (const [, mat] of this.iconMaterials) {
      if (mat.map) mat.map.dispose()
      mat.dispose()
    }
    this.iconMaterials.clear()
    this.iconGeometry.dispose()
    this.arrowGeometry.dispose()
    if (this.inputArrowMaterial.map) this.inputArrowMaterial.map.dispose()
    this.inputArrowMaterial.dispose()
    if (this.outputArrowMaterial.map) this.outputArrowMaterial.map.dispose()
    this.outputArrowMaterial.dispose()
  }

  private ensureMachineMesh(machine: MachineInfo): void {
    const worldPos = this.gridToWorld(machine.x, machine.z)
    const rotRad = (directionToDegrees(machine.rotation) * Math.PI) / 180

    const existing = this.machineMeshes.get(machine.id)
    if (existing) {
      existing.position.set(worldPos.x, 0.45, worldPos.z)
      existing.rotation.y = rotRad
      const material = this.machineMaterials.get(machine.type)
      if (this.highlightedMachineId === machine.id) {
        const hlMat = this.machineHighlightMaterials.get(machine.type)
        if (hlMat && existing.material !== hlMat) existing.material = hlMat
      } else if (material && existing.material !== material) {
        existing.material = material
      }
    } else {
      const material = this.machineMaterials.get(machine.type)
      if (!material) return
      const hlMat = this.highlightedMachineId === machine.id ? this.machineHighlightMaterials.get(machine.type) : null
      const mesh = new THREE.Mesh(this.machineGeometry, hlMat ?? material)
      mesh.position.set(worldPos.x, 0.45, worldPos.z)
      mesh.rotation.y = rotRad
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.scene.add(mesh)
      this.machineMeshes.set(machine.id, mesh)
    }

    // Slot indicators — positioned on input/output faces based on rotation
    const inputOffsets = machine.slots.inputs.map(p => slotPositionToOffset(p, machine.rotation))
    const outputOffsets = machine.slots.outputs.map(p => slotPositionToOffset(p, machine.rotation))
    let slots = this.slotMeshes.get(machine.id)

    // Remove old slot meshes if count changed (e.g. machine type changed)
    if (slots && (slots.inputs.length !== inputOffsets.length || slots.outputs.length !== outputOffsets.length)) {
      for (const m of slots.inputs) this.scene.remove(m)
      for (const m of slots.outputs) this.scene.remove(m)
      this.slotMeshes.delete(machine.id)
      slots = undefined
    }

    if (!slots) {
      const inputs = inputOffsets.map(() => {
        const m = new THREE.Mesh(this.slotGeometry, this.inputSlotMaterial)
        this.scene.add(m)
        return m
      })
      const outputs = outputOffsets.map(() => {
        const m = new THREE.Mesh(this.slotGeometry, this.outputSlotMaterial)
        this.scene.add(m)
        return m
      })
      slots = { inputs, outputs }
      this.slotMeshes.set(machine.id, slots)
    }

    for (let i = 0; i < inputOffsets.length; i++) {
      const off = inputOffsets[i]
      slots.inputs[i].position.set(
        worldPos.x + off.x * 0.55, 0.06, worldPos.z + off.z * 0.55,
      )
      slots.inputs[i].rotation.y = Math.atan2(off.x, off.z)
    }
    for (let i = 0; i < outputOffsets.length; i++) {
      const off = outputOffsets[i]
      slots.outputs[i].position.set(
        worldPos.x + off.x * 0.55, 0.06, worldPos.z + off.z * 0.55,
      )
      slots.outputs[i].rotation.y = Math.atan2(off.x, off.z)
    }

    // Apply highlight materials if this machine is currently selected
    if (this.highlightedMachineId === machine.id) {
      for (const m of slots.inputs) m.material = this.inputSlotHighlightMaterial
      for (const m of slots.outputs) m.material = this.outputSlotHighlightMaterial
    }

    // Machine type icon (flat plane on top face)
    let icon = this.machineIcons.get(machine.id)
    const iconMat = this.iconMaterials.get(machine.type)
    if (!iconMat) return
    if (!icon) {
      icon = new THREE.Mesh(this.iconGeometry, iconMat)
      icon.rotation.x = -Math.PI / 2
      this.scene.add(icon)
      this.machineIcons.set(machine.id, icon)
    } else if (icon.material !== iconMat) {
      icon.material = iconMat
    }
    icon.position.set(worldPos.x, 0.91, worldPos.z)

    // Arrow indicators on input/output faces
    let arrows = this.machineArrows.get(machine.id)

    // Remove old arrow meshes if count changed
    if (arrows && (arrows.inputs.length !== inputOffsets.length || arrows.outputs.length !== outputOffsets.length)) {
      for (const m of arrows.inputs) this.scene.remove(m)
      for (const m of arrows.outputs) this.scene.remove(m)
      this.machineArrows.delete(machine.id)
      arrows = undefined
    }

    if (!arrows) {
      const inputs = inputOffsets.map(() => {
        const m = new THREE.Mesh(this.arrowGeometry, this.inputArrowMaterial)
        this.scene.add(m)
        return m
      })
      const outputs = outputOffsets.map(() => {
        const m = new THREE.Mesh(this.arrowGeometry, this.outputArrowMaterial)
        this.scene.add(m)
        return m
      })
      arrows = { inputs, outputs }
      this.machineArrows.set(machine.id, arrows)
    }

    // Position and rotate arrows to face outward from the machine
    for (let i = 0; i < inputOffsets.length; i++) {
      const off = inputOffsets[i]
      const angle = Math.atan2(off.x, off.z)
      arrows.inputs[i].position.set(
        worldPos.x + off.x * 0.46, 0.45, worldPos.z + off.z * 0.46,
      )
      arrows.inputs[i].rotation.set(0, angle, 0)
    }
    for (let i = 0; i < outputOffsets.length; i++) {
      const off = outputOffsets[i]
      const angle = Math.atan2(off.x, off.z)
      arrows.outputs[i].position.set(
        worldPos.x + off.x * 0.46, 0.45, worldPos.z + off.z * 0.46,
      )
      arrows.outputs[i].rotation.set(0, angle, 0)
    }
  }

  raycastBelt(raycaster: THREE.Raycaster): string | null {
    const meshList = Array.from(this.beltMeshes.values())
    const hits = raycaster.intersectObjects(meshList, false)
    if (hits.length > 0) {
      const hitMesh = hits[0].object as THREE.Mesh
      const ids = this.cellBeltIds.get(hitMesh)
      if (ids && ids.length > 0) {
        return ids[0]
      }
    }
    return null
  }

  raycastInteraction(raycaster: THREE.Raycaster): { type: 'input' | 'output' | 'machine'; machineId: string; slotIndex?: number } | null {
    const slotMeshList: THREE.Mesh[] = []
    const slotMeshToInfo = new Map<THREE.Mesh, { machineId: string; slot: 'input' | 'output'; index: number }>()
    for (const [id, slots] of this.slotMeshes) {
      for (let i = 0; i < slots.inputs.length; i++) {
        slotMeshList.push(slots.inputs[i])
        slotMeshToInfo.set(slots.inputs[i], { machineId: id, slot: 'input', index: i })
      }
      for (let i = 0; i < slots.outputs.length; i++) {
        slotMeshList.push(slots.outputs[i])
        slotMeshToInfo.set(slots.outputs[i], { machineId: id, slot: 'output', index: i })
      }
    }

    const slotHits = raycaster.intersectObjects(slotMeshList, false)
    if (slotHits.length > 0) {
      const info = slotMeshToInfo.get(slotHits[0].object as THREE.Mesh)
      if (info) {
        return { type: info.slot, machineId: info.machineId, slotIndex: info.index }
      }
    }

    const machineMeshList = Array.from(this.machineMeshes.entries())
    const machineHits = raycaster.intersectObjects(machineMeshList.map(([, m]) => m), false)
    if (machineHits.length > 0) {
      const hitMesh = machineHits[0].object as THREE.Mesh
      const entry = machineMeshList.find(([, m]) => m === hitMesh)
      if (entry) {
        return { type: 'machine', machineId: entry[0] }
      }
    }

    return null
  }

  /**
   * Build a cell direction map from all belts, then render one mesh per cell.
   * Each cell gets a straight, corner, or endpoint shape — no overlapping meshes.
   */
  private renderCellBelts(): void {
    const belts = this.factory.getBelts()
    if (belts.length === 0) return

    // Step 1: Build cell direction map
    interface CellBeltInfo {
      directions: Set<string>  // e.g. "1,0" for east
      beltIds: string[]
      /** For direction materials: store the belt whose from→to defines this cell's flow */
      flowBelt: BeltInfo | null
    }
    const cellMap = new Map<string, CellBeltInfo>()

    const addDir = (x: number, z: number, dx: number, dz: number, belt: BeltInfo, isFrom: boolean) => {
      const key = `${x},${z}`
      let info = cellMap.get(key)
      if (!info) {
        info = { directions: new Set(), beltIds: [], flowBelt: null }
        cellMap.set(key, info)
      }
      info.directions.add(`${dx},${dz}`)
      if (!info.beltIds.includes(belt.id)) info.beltIds.push(belt.id)
      // Prefer the belt where this cell is the "from" end for flow direction
      if (isFrom && !info.flowBelt) info.flowBelt = belt
      if (!info.flowBelt) info.flowBelt = belt
    }

    for (const belt of belts) {
      for (let i = 0; i < belt.path.length - 1; i++) {
        const segFrom = belt.path[i]
        const segTo = belt.path[i + 1]
        const dx = segTo.x - segFrom.x
        const dz = segTo.z - segFrom.z
        addDir(segFrom.x, segFrom.z, dx, dz, belt, i === 0)
        addDir(segTo.x, segTo.z, -dx, -dz, belt, false)
      }
    }

    // Step 2: Render per-cell shapes
    for (const [key, info] of cellMap) {
      const [x, z] = key.split(',').map(Number)
      // Skip machine cells
      if (this.factory.getMachineAt(x, z)) continue

      const dirs = [...info.directions].map(d => {
        const p = d.split(',').map(Number)
        return { dx: p[0], dz: p[1] }
      })

      const worldPos = this.gridToWorld(x, z)

      if (dirs.length === 2) {
        // Check if collinear (straight) or perpendicular (corner)
        const [d1, d2] = dirs
        const isCollinear = (d1.dx + d2.dx === 0 && d1.dz + d2.dz === 0)

        if (isCollinear) {
          // STRAIGHT cell — full 1.0 unit piece
          const isHorizontal = d1.dx !== 0
          const dir = this.getCellFlowDirection(x, z, info)
          const material = this.beltDirectionMaterials.get(dir) ?? this.beltDirectionMaterials.get('east')!
          const mesh = new THREE.Mesh(this.beltGeometry, [material, this.cornerSideMaterial])
          mesh.userData.flowDir = dir
          mesh.scale.set(
            isHorizontal ? 1.0 : BELT_WIDTH,
            1,
            isHorizontal ? BELT_WIDTH : 1.0,
          )
          mesh.position.set(worldPos.x, 0.025, worldPos.z)
          mesh.receiveShadow = true
          this.scene.add(mesh)
          this.beltMeshes.set(`cell_${x}_${z}`, mesh)
          this.cellBeltIds.set(mesh, info.beltIds)
        } else {
          // CORNER cell — perpendicular directions
          const horiz = d1.dx !== 0 ? d1 : d2
          const vert = d1.dz !== 0 ? d1 : d2
          const offset = getCornerOffset(horiz.dx, vert.dz)
          const rotationY = getCornerRotation(horiz.dx, vert.dz)

          if (!this._cornerBeltGeometryFwd) {
            this._cornerBeltGeometryFwd = createCornerBeltGeometry(0.05, false)
            this._cornerBeltGeometryRev = createCornerBeltGeometry(0.05, true)
          }

          // Pick forward or reverse UV geometry based on belt flow direction.
          // Cross product of (horiz × vert).y determines turn chirality.
          // The default geometry's UV flows from +X toward -Z (CCW from +Y).
          // CCW turns (cross > 0) use forward UVs, CW turns use reversed.
          const cross = horiz.dx * vert.dz - horiz.dz * vert.dx
          let useReverseUV = cross <= 0

          // Determine actual flow direction to correct UV.
          // Default UV shows horiz→vert flow; flip if actual flow is vert→horiz.
          if (info.flowBelt) {
            const fb = info.flowBelt
            const idx = fb.path.findIndex(p => p.x === x && p.z === z)
            if (idx >= 0) {
              let flowIsVertToHoriz = false
              if (idx < fb.path.length - 1) {
                // Exit direction is horizontal → flow is vert→horiz at this corner
                flowIsVertToHoriz = (fb.path[idx + 1].x - x) !== 0
              } else if (idx > 0) {
                // Entry direction is vertical → flow is vert→horiz at this corner
                flowIsVertToHoriz = (fb.path[idx - 1].z !== z)
              }
              if (flowIsVertToHoriz) useReverseUV = !useReverseUV
            }
          }

          const cornerGeo = useReverseUV ? this._cornerBeltGeometryRev! : this._cornerBeltGeometryFwd!

          const beltMat = this.beltDirectionMaterials.get('east')!
          const mesh = new THREE.Mesh(cornerGeo, [beltMat, this.cornerSideMaterial])
          mesh.position.set(worldPos.x + offset.x, 0, worldPos.z + offset.z)
          mesh.rotation.y = rotationY
          mesh.receiveShadow = true
          this.scene.add(mesh)
          this.beltMeshes.set(`corner_${x}_${z}`, mesh)
          this.cellBeltIds.set(mesh, info.beltIds)
        }
      } else if (dirs.length === 1) {
        // ENDPOINT cell — half-length piece from cell center toward belt direction
        const d = dirs[0]
        const isHorizontal = d.dx !== 0
        const dir = this.getCellFlowDirection(x, z, info)
        const material = this.beltDirectionMaterials.get(dir) ?? this.beltDirectionMaterials.get('east')!
        const mesh = new THREE.Mesh(this.beltGeometry, [material, this.cornerSideMaterial])
        mesh.userData.flowDir = dir
        mesh.scale.set(
          isHorizontal ? 0.5 : BELT_WIDTH,
          1,
          isHorizontal ? BELT_WIDTH : 0.5,
        )
        // Offset 0.25 from cell center toward the belt direction
        mesh.position.set(
          worldPos.x + d.dx * 0.25,
          0.025,
          worldPos.z + d.dz * 0.25,
        )
        mesh.receiveShadow = true
        this.scene.add(mesh)
        this.beltMeshes.set(`cell_${x}_${z}`, mesh)
        this.cellBeltIds.set(mesh, info.beltIds)
      }
      // dirs.length > 2: unusual — skip (e.g. T-junction, not expected in current game)
    }
  }

  private getCellFlowDirection(x: number, z: number, info: { flowBelt: BeltInfo | null }): 'east' | 'west' | 'north' | 'south' {
    if (!info.flowBelt) return 'east'
    const path = info.flowBelt.path
    const idx = path.findIndex(p => p.x === x && p.z === z)
    if (idx >= 0 && idx < path.length - 1) {
      return this.getSegmentDirection(path[idx], path[idx + 1])
    }
    if (idx > 0) {
      return this.getSegmentDirection(path[idx - 1], path[idx])
    }
    if (path.length >= 2) return this.getSegmentDirection(path[0], path[1])
    return 'east'
  }

  private getSegmentDirection(
    from: { x: number; z: number },
    to: { x: number; z: number },
  ): 'east' | 'west' | 'north' | 'south' {
    const dx = to.x - from.x
    const dz = to.z - from.z
    if (dx > 0) return 'east'
    if (dx < 0) return 'west'
    if (dz > 0) return 'south'
    return 'north'
  }

  private animateBelts(): void {
    const dt = 1 / 60
    for (const mat of this.beltDirectionMaterials.values()) {
      if (mat.map) {
        mat.map.offset.x -= FactoryRenderer.BELT_SCROLL_SPEED * dt
      }
    }
  }
}
