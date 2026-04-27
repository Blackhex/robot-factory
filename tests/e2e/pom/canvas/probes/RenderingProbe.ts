import { expect, type Page } from '@playwright/test'
import type {
  BeltClearInspection,
  BeltHighlightInspection,
  BeltMeshInspection,
  BeltPathSegment,
  ItemInstancePositions,
  SceneItemMeshes,
} from '../../types'
import { ItemInstanceProbe } from './ItemInstanceProbe'
import { SimulationStateProbe } from './SimulationStateProbe'

const DEFAULT_ON_BELT_TOLERANCE = 0.4

const BELT_MATERIAL_INSPECTION_SRC = `
function collectBeltMaterialInspection(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  let maxStrength = 0;
  let primaryHex = 0;
  const uuids = [];
  for (let i = 0; i < mats.length; i++) {
    const m = mats[i];
    uuids.push(m.uuid);
    const intensity = typeof m.emissiveIntensity === 'number' ? m.emissiveIntensity : 0;
    const emissive = m.emissive;
    if (emissive) {
      const strength = (emissive.r + emissive.g + emissive.b) * intensity;
      if (strength > maxStrength) {
        maxStrength = strength;
        primaryHex = emissive.getHex && emissive.getHex() || 0;
      }
    }
  }
  return {
    uuid: Array.isArray(mesh.material) ? uuids : uuids[0],
    strength: maxStrength,
    isHighlighted: maxStrength > 1e-6,
    hex: primaryHex,
  };
}

function collectCornerBeltMaterialInspections(beltMeshes) {
  const results = [];
  for (const [key, mesh] of beltMeshes) {
    if (!key.startsWith('corner_')) continue;
    const material = collectBeltMaterialInspection(mesh);
    results.push({
      key: key,
      isHighlighted: material.isHighlighted,
      emissiveHex: material.hex,
      emissiveStrength: material.strength,
      materialUuid: material.uuid,
    });
  }
  return results;
}
`

function pointToSegmentDistance(
  px: number, pz: number, ax: number, az: number, bx: number, bz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const lenSq = dx * dx + dz * dz
  let t = lenSq > 0 ? ((px - ax) * dx + (pz - az) * dz) / lenSq : 0
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const cx = ax + t * dx
  const cz = az + t * dz
  const ex = px - cx
  const ez = pz - cz
  return Math.sqrt(ex * ex + ez * ez)
}

function nearestSegmentDistance(
  px: number, pz: number,
  segments: ReadonlyArray<BeltPathSegment>,
): number {
  let best = Infinity
  for (const segment of segments) {
    const distance = pointToSegmentDistance(
      px, pz, segment.ax, segment.az, segment.bx, segment.bz,
    )
    if (distance < best) best = distance
  }
  return best
}

export class RenderingProbe {
  private readonly page: Page
  private readonly itemInstances: ItemInstanceProbe
  private readonly simulation: SimulationStateProbe

  constructor(
    page: Page,
    itemInstances: ItemInstanceProbe,
    simulation: SimulationStateProbe,
  ) {
    this.page = page
    this.itemInstances = itemInstances
    this.simulation = simulation
  }

  async getBeltMeshCounts(): Promise<{
    mapSize: number
    sceneMeshCount: number
  } | null> {
    return this.page.evaluate(() => {
      const getRenderer = (window as any).__getFactoryRenderer
      const renderer = getRenderer?.()
      if (!renderer) return null
      const beltMeshes: Map<string, any> = (renderer as any).beltMeshes
      const scene: any = (renderer as any).scene
      if (!beltMeshes || !scene) return null

      // Belt meshes share a small set of geometries (one straight BoxGeometry
      // and up to two corner BufferGeometries). Collect the UUIDs of those
      // geometries from all currently-registered belt meshes; ANY mesh in the
      // scene whose geometry uuid matches must be a belt-strip mesh — either
      // a registered one or a leaked stale one.
      const geometryUuids = new Set<string>()
      for (const m of beltMeshes.values()) {
        if (m && m.geometry && m.geometry.uuid) geometryUuids.add(m.geometry.uuid)
      }

      let sceneMeshCount = 0
      scene.traverse((obj: any) => {
        if (obj && obj.isMesh && obj.geometry && geometryUuids.has(obj.geometry.uuid)) {
          sceneMeshCount++
        }
      })

      return { mapSize: beltMeshes.size, sceneMeshCount }
    })
  }

  /**
   * Deep scene scan: returns, for every belt cell currently registered in the
   * renderer, the number of distinct THREE.Mesh objects in the scene whose
   * world XZ position lies within tolerance of that cell, AND that are
   * actually visible (i.e. would be drawn). Used to detect ghost overlay
   * meshes (e.g. preview ghost belts left in a hidden group, or any other
   * lingering belt-strip duplicate) regardless of geometry sharing.
   */
  async getOverlappingMeshesPerBeltCell(tolerance = 0.45): Promise<Array<{
    cellKey: string
    cellX: number
    cellZ: number
    worldX: number
    worldZ: number
    visibleMeshCount: number
    invisibleMeshCount: number
  }> | null> {
    return this.page.evaluate((tol: number) => {
      const getRenderer = (window as any).__getFactoryRenderer
      const renderer = getRenderer?.()
      if (!renderer) return null
      const beltMeshes: Map<string, any> = (renderer as any).beltMeshes
      const scene: any = (renderer as any).scene
      const factory: any = (renderer as any).factory
      if (!beltMeshes || !scene || !factory) return null

      // Build the set of belt-cell world positions from the registered meshes.
      const cells: Array<{ key: string; cx: number; cz: number; wx: number; wz: number }> = []
      for (const [key, mesh] of beltMeshes) {
        void mesh
        // Decode key "cell_x_z" or "corner_x_z" → grid coords → world center.
        const parts = key.split('_')
        if (parts.length < 3) continue
        const cx = Number(parts[1])
        const cz = Number(parts[2])
        if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue
        const wx = cx - factory.width / 2 + 0.5
        const wz = cz - factory.height / 2 + 0.5
        cells.push({ key, cx, cz, wx, wz })
      }

      // Gather every mesh in the scene with its world position and visibility.
      type Hit = { x: number; z: number; visible: boolean }
      const meshes: Hit[] = []
      const tmp = { x: 0, y: 0, z: 0 }
      scene.updateMatrixWorld(true)
      scene.traverse((obj: any) => {
        if (!obj || !obj.isMesh) return
        // Use world position via matrixWorld translation column.
        const e = obj.matrixWorld.elements
        tmp.x = e[12]; tmp.z = e[14]
        // Compute effective visibility along the parent chain.
        let visible = true
        let n = obj
        while (n) {
          if (n.visible === false) { visible = false; break }
          n = n.parent
        }
        meshes.push({ x: tmp.x, z: tmp.z, visible })
      })

      const results: Array<{
        cellKey: string; cellX: number; cellZ: number
        worldX: number; worldZ: number
        visibleMeshCount: number; invisibleMeshCount: number
      }> = []
      for (const c of cells) {
        let vis = 0, inv = 0
        for (const m of meshes) {
          const dx = m.x - c.wx
          const dz = m.z - c.wz
          if (Math.abs(dx) <= tol && Math.abs(dz) <= tol) {
            if (m.visible) vis++; else inv++
          }
        }
        results.push({
          cellKey: c.key, cellX: c.cx, cellZ: c.cz,
          worldX: c.wx, worldZ: c.wz,
          visibleMeshCount: vis, invisibleMeshCount: inv,
        })
      }
      return results
    }, tolerance)
  }

  async inspectBeltMeshes(): Promise<BeltMeshInspection | null> {
    return this.page.evaluate(() => {
      const getRenderer = (window as any).__getFactoryRenderer
      const renderer = getRenderer?.()
      if (!renderer) return null

      const beltMeshes: Map<string, any> = (renderer as any).beltMeshes
      if (!beltMeshes) return null

      const corners: any[] = []
      const straights: any[] = []

      for (const [key, mesh] of beltMeshes) {
        const geom = mesh.geometry
        const posAttr = geom.getAttribute('position')
        const vertexCount = posAttr ? posAttr.count : 0
        const gType = geom.type || geom.constructor?.name || 'unknown'
        const pos = mesh.position

        if (key.startsWith('corner_')) {
          const uvAttr = geom.getAttribute('uv')
          let uvRange = null
          if (uvAttr) {
            let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
            for (let i = 0; i < uvAttr.count; i++) {
              const u = uvAttr.getX(i)
              const v = uvAttr.getY(i)
              minU = Math.min(minU, u)
              maxU = Math.max(maxU, u)
              minV = Math.min(minV, v)
              maxV = Math.max(maxV, v)
            }
            uvRange = { minU, maxU, minV, maxV }
          }

          geom.computeBoundingBox()
          const bb = geom.boundingBox
          corners.push({
            key,
            geometryType: gType,
            vertexCount,
            hasUV: !!uvAttr,
            uvRange,
            positionX: pos.x,
            positionY: pos.y,
            positionZ: pos.z,
            bbMin: bb ? { x: bb.min.x, y: bb.min.y, z: bb.min.z } : null,
            bbMax: bb ? { x: bb.max.x, y: bb.max.y, z: bb.max.z } : null,
          })
        } else {
          straights.push({
            key,
            geometryType: gType,
            vertexCount,
            positionX: pos.x,
            positionY: pos.y,
            positionZ: pos.z,
          })
        }
      }

      return { corners, straights, totalMeshes: beltMeshes.size }
    })
  }

  async inspectCornerHighlights(): Promise<BeltClearInspection[] | null> {
    return this.page.evaluate(`(() => {
      ${BELT_MATERIAL_INSPECTION_SRC}
      const getRenderer = window.__getFactoryRenderer;
      const renderer = getRenderer && getRenderer();
      if (!renderer) return null;
      const beltMeshes = renderer.beltMeshes;
      if (!beltMeshes) return null;
      return collectCornerBeltMaterialInspections(beltMeshes);
    })()`) as Promise<BeltClearInspection[] | null>
  }

  async highlightAllBeltsAndInspectCorners(): Promise<BeltHighlightInspection | null> {
    return this.page.evaluate(`(() => {
      ${BELT_MATERIAL_INSPECTION_SRC}
      const gm = window.__gameManager;
      const getRenderer = window.__getFactoryRenderer;
      const renderer = getRenderer && getRenderer();
      if (!gm || !gm.factory || !renderer) return null;

      const belts = gm.factory.getBelts();
      if (belts.length === 0) return null;

      const beltIds = belts.map(function (belt) { return belt.id; });
      renderer.highlightBelts(beltIds);

      const beltMeshes = renderer.beltMeshes;
      const results = collectCornerBeltMaterialInspections(beltMeshes);
      return { cornerCount: results.length, results: results };
    })()`) as Promise<BeltHighlightInspection | null>
  }

  async clearBeltHighlightAndInspectCorners(): Promise<BeltClearInspection[] | null> {
    return this.page.evaluate(`(() => {
      ${BELT_MATERIAL_INSPECTION_SRC}
      const getRenderer = window.__getFactoryRenderer;
      const renderer = getRenderer && getRenderer();
      if (!renderer) return null;
      renderer.clearBeltHighlight();
      const beltMeshes = renderer.beltMeshes;
      return collectCornerBeltMaterialInspections(beltMeshes);
    })()`) as Promise<BeltClearInspection[] | null>
  }

  async readSceneItemMeshes(): Promise<SceneItemMeshes> {
    return this.itemInstances.readSceneItemMeshes()
  }

  async readItemInstancePositions(): Promise<ItemInstancePositions> {
    return this.itemInstances.readItemInstancePositions()
  }

  async capturePositionsAcrossPause(): Promise<{
    before: ItemInstancePositions
    after: ItemInstancePositions
  }> {
    return this.itemInstances.capturePositionsAcrossPause()
  }

  async expectRenderedItemsOnCurrentBeltPath(options?: {
    context?: string
    tolerance?: number
  }): Promise<void> {
    const tolerance = options?.tolerance ?? DEFAULT_ON_BELT_TOLERANCE
    const segments = await this.simulation.readBeltPathSegments()
    const positions = await this.itemInstances.readItemInstancePositions()
    const offBeltItems: Array<{ x: number; z: number; d: number }> = []

    for (const position of positions.positions) {
      const distance = nearestSegmentDistance(position.x, position.z, segments)
      if (distance > tolerance) {
        offBeltItems.push({ x: position.x, z: position.z, d: distance })
      }
    }

    const context = options?.context ? `${options.context} ` : ''
    expect(
      offBeltItems,
      `${context}Found ${offBeltItems.length} ghost item instance(s) rendered off every current belt path. ` +
        `First few: ${JSON.stringify(offBeltItems.slice(0, 5))}. ` +
        `Total rendered items: ${positions.totalCount}, current belt segments: ${segments.length}.`,
    ).toEqual([])
  }

  async forceRendererUpdate(): Promise<void> {
    await this.page.evaluate(() => {
      const getRenderer = (window as any).__getFactoryRenderer
      if (typeof getRenderer === 'function') {
        const renderer = getRenderer()
        if (renderer) renderer.syncMeshes()
      }
    })
  }
}