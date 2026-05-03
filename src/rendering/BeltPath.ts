/**
 * Belt centerline path math for the renderer.
 *
 * Each belt segment renders the path through its FROM cell. If the from-cell
 * is a corner (the chain's incoming direction differs from the outgoing
 * direction), the path is `straight (S) → quarter-arc (R = 0.5 - S) → straight (S)`
 * matching the geometry produced by `createCornerBeltGeometry` in
 * FactoryRenderer. Otherwise, the path is the straight chord between the
 * from-cell and to-cell centers.
 *
 * Sampling is parameterized by arc length so item travel speed is uniform
 * through corners (no slowdown/speedup at the arc).
 */
import { CORNER_STRAIGHT_LEN } from '../utils/BeltGeometry'

const ARC_R = 0.5 - CORNER_STRAIGHT_LEN // 0.3
const HALF_PI = Math.PI / 2

export interface PathPoint {
  x: number
  z: number
}

export interface CellRef {
  x: number
  z: number
}

interface StraightPath {
  kind: 'straight'
  length: number
  sx: number
  sz: number
  ex: number
  ez: number
}

interface CornerPath {
  kind: 'corner'
  length: number
  S: number
  // Entry straight: (sx,sz) -> (asx,asz)
  sx: number
  sz: number
  asx: number
  asz: number
  // Arc: center (acx,acz), radius ARC_R, unit vectors to start/end
  acx: number
  acz: number
  startUx: number
  startUz: number
  endUx: number
  endUz: number
  // Exit straight: (aex,aez) -> (ex,ez)
  aex: number
  aez: number
  ex: number
  ez: number
}

export type BeltPath = StraightPath | CornerPath

function cellWorldX(x: number, halfW: number): number {
  return x - halfW + 0.5
}
function cellWorldZ(z: number, halfH: number): number {
  return z - halfH + 0.5
}

/**
 * Build the rendered centerline path for a belt segment.
 *
 * Path convention is unified across cell types — every cell renders from
 * its own entry-edge midpoint to its own exit-edge midpoint, so adjacent
 * cells join seamlessly at shared boundary midpoints regardless of which
 * neighbor (if any) turns:
 *   - A CORNER cell (in-direction differs from out-direction) renders the
 *     entry-edge midpoint → S-arc-S → exit-edge midpoint path of length
 *     `2*S + π/2 * R` ≈ 0.871.
 *   - A STRAIGHT cell renders a chord from its entry-edge midpoint to its
 *     exit-edge midpoint, ALWAYS of length 1.0 — regardless of whether the
 *     prev or next cell turns.
 *     For a chain start (no prevFrom), the in-direction defaults to the
 *     out-direction, so the entry midpoint is the cell boundary as if the
 *     item came from the previous cell — still length 1.0.
 */
export function buildBeltPath(
  from: CellRef,
  to: CellRef,
  prevFrom: CellRef | undefined,
  halfW: number,
  halfH: number,
): BeltPath {
  const fromX = cellWorldX(from.x, halfW)
  const fromZ = cellWorldZ(from.z, halfH)

  const outDx = to.x - from.x
  const outDz = to.z - from.z
  const inDx = prevFrom ? from.x - prevFrom.x : outDx
  const inDz = prevFrom ? from.z - prevFrom.z : outDz

  const isCorner =
    prevFrom !== undefined && (inDx !== outDx || inDz !== outDz)

  if (!isCorner) {
    // Straight cell: ALWAYS render entry-edge midpoint → exit-edge midpoint
    // of the from-cell (length 1.0). For a chain start (no prevFrom), inDir
    // defaults to outDir so the entry midpoint is the cell boundary as if
    // an item came from the previous cell's center.
    const sx = fromX - inDx * 0.5
    const sz = fromZ - inDz * 0.5
    const ex = fromX + outDx * 0.5
    const ez = fromZ + outDz * 0.5

    return {
      kind: 'straight',
      length: Math.hypot(ex - sx, ez - sz),
      sx,
      sz,
      ex,
      ez,
    }
  }

  // Entry edge midpoint of the from-cell (opposite the incoming direction).
  const sx = fromX - inDx * 0.5
  const sz = fromZ - inDz * 0.5
  // Exit edge midpoint of the from-cell (toward the outgoing direction).
  const ex = fromX + outDx * 0.5
  const ez = fromZ + outDz * 0.5

  // The pivot is the cell corner where the entry and exit edges meet.
  // For horizontal entry (inDx != 0): entry edge is vertical at x = sx, exit
  // edge is horizontal at z = ez. For vertical entry: swap.
  const pivotX = inDx !== 0 ? sx : ex
  const pivotZ = inDx !== 0 ? ez : sz

  // Arc center sits S inside the cell from the pivot, toward the cell center.
  const dirX = Math.sign(fromX - pivotX) // ±1
  const dirZ = Math.sign(fromZ - pivotZ) // ±1
  const S = CORNER_STRAIGHT_LEN
  const acx = pivotX + dirX * S
  const acz = pivotZ + dirZ * S

  // Arc start: end of entry straight (advance S along inDir from entry mid).
  const asx = sx + inDx * S
  const asz = sz + inDz * S
  // Arc end: start of exit straight (back S along outDir from exit mid).
  const aex = ex - outDx * S
  const aez = ez - outDz * S

  // Unit vectors from arc center.
  const startUx = (asx - acx) / ARC_R
  const startUz = (asz - acz) / ARC_R
  const endUx = (aex - acx) / ARC_R
  const endUz = (aez - acz) / ARC_R

  return {
    kind: 'corner',
    length: 2 * S + HALF_PI * ARC_R,
    S,
    sx,
    sz,
    asx,
    asz,
    acx,
    acz,
    startUx,
    startUz,
    endUx,
    endUz,
    aex,
    aez,
    ex,
    ez,
  }
}

/** Sample the path at parameter p ∈ [0,1] (clamped) into `out`. */
export function sampleBeltPath(path: BeltPath, p: number, out: PathPoint): void {
  const t = p < 0 ? 0 : p > 1 ? 1 : p

  if (path.kind === 'straight') {
    out.x = path.sx + (path.ex - path.sx) * t
    out.z = path.sz + (path.ez - path.sz) * t
    return
  }

  const s = t * path.length
  const L1 = path.S
  const L2 = L1 + HALF_PI * ARC_R

  if (s <= L1) {
    const u = L1 === 0 ? 0 : s / L1
    out.x = path.sx + (path.asx - path.sx) * u
    out.z = path.sz + (path.asz - path.sz) * u
    return
  }

  if (s <= L2) {
    const ang = (s - L1) / ARC_R // [0, π/2]
    // Slerp on a 90° arc reduces to: cos(ang)*start + sin(ang)*end (start ⊥ end).
    const c = Math.cos(ang)
    const sn = Math.sin(ang)
    const ux = c * path.startUx + sn * path.endUx
    const uz = c * path.startUz + sn * path.endUz
    out.x = path.acx + ARC_R * ux
    out.z = path.acz + ARC_R * uz
    return
  }

  const u = path.S === 0 ? 1 : (s - L2) / path.S
  out.x = path.aex + (path.ex - path.aex) * u
  out.z = path.aez + (path.ez - path.aez) * u
}
