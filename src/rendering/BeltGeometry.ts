import * as THREE from 'three'
import { CORNER_STRAIGHT_LEN } from '../utils/BeltGeometry'

/**
 * Belt width and corner geometry constants.
 * The belt is 0.35 wide, centered on the cell centerline.
 * Corner cells use a straight-to-arc-to-straight layout.
 *
 * `CORNER_STRAIGHT_LEN` is the single source of truth in
 * `src/utils/BeltGeometry.ts` — the simulation cannot import from
 * `src/rendering/`, but the renderer is allowed to depend on utils.
 * Consumers must import it from `../utils/BeltGeometry` directly; this
 * file does not re-export it.
 */
export const BELT_WIDTH = 0.35
export const CORNER_OUTER_R = 0.5 + BELT_WIDTH / 2
export const CORNER_INNER_R = 0.5 - BELT_WIDTH / 2

/**
 * Create corner belt geometry with straight entry/exit segments and a curved arc in the middle.
 * When `reverseU` is true, the UV U coordinate runs 1 to 0 along the belt path.
 */
export function createCornerBeltGeometry(height = 0.05, reverseU = false): THREE.BufferGeometry {
  const segments = 24
  const S = CORNER_STRAIGHT_LEN
  const arcInnerR = CORNER_INNER_R - S
  const arcOuterR = CORNER_OUTER_R - S
  const cx = S
  const cz = -S
  const h = height

  const arcMidR = (arcInnerR + arcOuterR) / 2
  const arcLen = arcMidR * Math.PI / 2
  const totalLen = S + arcLen + S
  const uEntry = S / totalLen
  const uArc = arcLen / totalLen

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const mapU = (u: number) => reverseU ? 1 - u : u

  const entryTopStart = positions.length / 3
  positions.push(CORNER_INNER_R, h, 0); normals.push(0, 1, 0); uvs.push(mapU(0), 0)
  positions.push(CORNER_OUTER_R, h, 0); normals.push(0, 1, 0); uvs.push(mapU(0), 1)
  positions.push(CORNER_OUTER_R, h, -S); normals.push(0, 1, 0); uvs.push(mapU(uEntry), 1)
  positions.push(CORNER_INNER_R, h, -S); normals.push(0, 1, 0); uvs.push(mapU(uEntry), 0)
  indices.push(entryTopStart, entryTopStart + 1, entryTopStart + 2)
  indices.push(entryTopStart, entryTopStart + 2, entryTopStart + 3)

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

  const exitTopStart = positions.length / 3
  positions.push(S, h, -CORNER_INNER_R); normals.push(0, 1, 0); uvs.push(mapU(uEntry + uArc), 0)
  positions.push(S, h, -CORNER_OUTER_R); normals.push(0, 1, 0); uvs.push(mapU(uEntry + uArc), 1)
  positions.push(0, h, -CORNER_OUTER_R); normals.push(0, 1, 0); uvs.push(mapU(1), 1)
  positions.push(0, h, -CORNER_INNER_R); normals.push(0, 1, 0); uvs.push(mapU(1), 0)
  indices.push(exitTopStart, exitTopStart + 1, exitTopStart + 2)
  indices.push(exitTopStart, exitTopStart + 2, exitTopStart + 3)

  const entryBottomStart = positions.length / 3
  positions.push(CORNER_INNER_R, 0, 0); normals.push(0, -1, 0); uvs.push(mapU(0), 0)
  positions.push(CORNER_OUTER_R, 0, 0); normals.push(0, -1, 0); uvs.push(mapU(0), 1)
  positions.push(CORNER_OUTER_R, 0, -S); normals.push(0, -1, 0); uvs.push(mapU(uEntry), 1)
  positions.push(CORNER_INNER_R, 0, -S); normals.push(0, -1, 0); uvs.push(mapU(uEntry), 0)
  indices.push(entryBottomStart, entryBottomStart + 2, entryBottomStart + 1)
  indices.push(entryBottomStart, entryBottomStart + 3, entryBottomStart + 2)

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

  const exitBottomStart = positions.length / 3
  positions.push(S, 0, -CORNER_INNER_R); normals.push(0, -1, 0); uvs.push(mapU(uEntry + uArc), 0)
  positions.push(S, 0, -CORNER_OUTER_R); normals.push(0, -1, 0); uvs.push(mapU(uEntry + uArc), 1)
  positions.push(0, 0, -CORNER_OUTER_R); normals.push(0, -1, 0); uvs.push(mapU(1), 1)
  positions.push(0, 0, -CORNER_INNER_R); normals.push(0, -1, 0); uvs.push(mapU(1), 0)
  indices.push(exitBottomStart, exitBottomStart + 2, exitBottomStart + 1)
  indices.push(exitBottomStart, exitBottomStart + 3, exitBottomStart + 2)

  const group0End = indices.length

  const entryInnerWallStart = positions.length / 3
  positions.push(CORNER_INNER_R, h, 0); normals.push(-1, 0, 0); uvs.push(0, 1)
  positions.push(CORNER_INNER_R, 0, 0); normals.push(-1, 0, 0); uvs.push(0, 0)
  positions.push(CORNER_INNER_R, h, -S); normals.push(-1, 0, 0); uvs.push(1, 1)
  positions.push(CORNER_INNER_R, 0, -S); normals.push(-1, 0, 0); uvs.push(1, 0)
  indices.push(entryInnerWallStart, entryInnerWallStart + 2, entryInnerWallStart + 1)
  indices.push(entryInnerWallStart + 1, entryInnerWallStart + 2, entryInnerWallStart + 3)

  const entryOuterWallStart = positions.length / 3
  positions.push(CORNER_OUTER_R, h, 0); normals.push(1, 0, 0); uvs.push(0, 1)
  positions.push(CORNER_OUTER_R, 0, 0); normals.push(1, 0, 0); uvs.push(0, 0)
  positions.push(CORNER_OUTER_R, h, -S); normals.push(1, 0, 0); uvs.push(1, 1)
  positions.push(CORNER_OUTER_R, 0, -S); normals.push(1, 0, 0); uvs.push(1, 0)
  indices.push(entryOuterWallStart, entryOuterWallStart + 1, entryOuterWallStart + 2)
  indices.push(entryOuterWallStart + 1, entryOuterWallStart + 3, entryOuterWallStart + 2)

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

  const exitInnerWallStart = positions.length / 3
  positions.push(S, h, -CORNER_INNER_R); normals.push(0, 0, 1); uvs.push(0, 1)
  positions.push(S, 0, -CORNER_INNER_R); normals.push(0, 0, 1); uvs.push(0, 0)
  positions.push(0, h, -CORNER_INNER_R); normals.push(0, 0, 1); uvs.push(1, 1)
  positions.push(0, 0, -CORNER_INNER_R); normals.push(0, 0, 1); uvs.push(1, 0)
  indices.push(exitInnerWallStart, exitInnerWallStart + 2, exitInnerWallStart + 1)
  indices.push(exitInnerWallStart + 1, exitInnerWallStart + 2, exitInnerWallStart + 3)

  const exitOuterWallStart = positions.length / 3
  positions.push(S, h, -CORNER_OUTER_R); normals.push(0, 0, -1); uvs.push(0, 1)
  positions.push(S, 0, -CORNER_OUTER_R); normals.push(0, 0, -1); uvs.push(0, 0)
  positions.push(0, h, -CORNER_OUTER_R); normals.push(0, 0, -1); uvs.push(1, 1)
  positions.push(0, 0, -CORNER_OUTER_R); normals.push(0, 0, -1); uvs.push(1, 0)
  indices.push(exitOuterWallStart, exitOuterWallStart + 1, exitOuterWallStart + 2)
  indices.push(exitOuterWallStart + 1, exitOuterWallStart + 3, exitOuterWallStart + 2)

  const group1End = indices.length

  const geometry = new THREE.BufferGeometry()
  geometry.setIndex(indices)
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.addGroup(0, group0End, 0)
  geometry.addGroup(group0End, group1End - group0End, 1)

  return geometry
}

/** Get Y-axis rotation for a belt corner given horizontal (hx) and vertical (vz) directions. */
export function getCornerRotation(hx: number, vz: number): number {
  if (hx < 0 && vz > 0) return 0
  if (hx < 0 && vz < 0) return -Math.PI / 2
  if (hx > 0 && vz > 0) return Math.PI / 2
  return Math.PI
}

/** Get cell-corner offset for the arc center given horizontal and vertical directions. */
export function getCornerOffset(hx: number, vz: number): { x: number; z: number } {
  return { x: hx > 0 ? 0.5 : -0.5, z: vz > 0 ? 0.5 : -0.5 }
}