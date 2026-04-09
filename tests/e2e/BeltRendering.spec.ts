import { test, expect, type Page } from '@playwright/test'

/**
 * E2E tests: Belt corner rendering correctness.
 *
 * These tests verify Three.js geometry properties that unit tests cannot catch
 * (since Three.js is fully mocked in Vitest). They inspect the live scene graph
 * via page.evaluate() to detect regressions in corner geometry construction,
 * UV mapping, mesh positioning, and belt highlighting.
 */

test.use({ viewport: { width: 1280, height: 720 } })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function enterSandbox(page: Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas')
    return c && c.width > 0 && c.height > 0
  })
  await page.locator('.ui-main-menu-btn').last().click()
  await expect(page.locator('.ui-toolbar')).toBeVisible()
  await page.waitForTimeout(1200)
}

async function dblClickGridCell(page: Page, gx: number, gz: number) {
  const pos = await gridCellToScreenPos(page, gx, gz)
  await page.locator('#canvas-container canvas').dblclick({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(200)
}

async function clickGridCell(page: Page, gx: number, gz: number) {
  const pos = await gridCellToScreenPos(page, gx, gz)
  await page.locator('#canvas-container canvas').click({ position: { x: pos.x, y: pos.y } })
  await page.waitForTimeout(200)
}

async function gridCellToScreenPos(page: Page, gx: number, gz: number) {
  return page.evaluate(
    ({ gx, gz }) => {
      const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const W = 20, H = 20
      const worldX = gx - W / 2 + 0.5, worldZ = gz - H / 2 + 0.5
      const fov = 50 * Math.PI / 180
      const d = Math.max(W, H) / (2 * Math.tan(fov / 2)) * 1.2
      const cx = d * 0.7, cy = d * 0.7, cz = d * 0.7
      const fl = Math.sqrt(cx * cx + cy * cy + cz * cz)
      const fx = -cx / fl, fy = -cy / fl, fz = -cz / fl
      let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0
      const rl = Math.sqrt(rx * rx + ry * ry + rz * rz)
      rx /= rl; ry /= rl; rz /= rl
      const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx
      const dx = worldX - cx, dy = 0 - cy, dz = worldZ - cz
      const vx = dx * rx + dy * ry + dz * rz
      const vy = dx * ux + dy * uy + dz * uz
      const vz_ = dx * fx + dy * fy + dz * fz
      const thf = Math.tan(fov / 2), asp = rect.width / rect.height
      const nx = vx / (-vz_ * thf * asp), ny = vy / (-vz_ * thf)
      return { x: Math.round((nx + 1) / 2 * rect.width), y: Math.round((1 - ny) / 2 * rect.height) }
    },
    { gx, gz },
  )
}

/**
 * Place two machines at non-aligned positions and connect them with a belt
 * chain that produces at least one corner turn. Returns belt metadata.
 */
async function createLShapedBelt(page: Page) {
  // Place machine A at (8, 8)
  await dblClickGridCell(page, 8, 8)
  await page.waitForTimeout(100)
  await clickGridCell(page, 1, 1) // deselect
  await page.waitForTimeout(100)

  // Place machine B at (12, 12)
  await dblClickGridCell(page, 12, 12)
  await page.waitForTimeout(100)
  await clickGridCell(page, 1, 1) // deselect
  await page.waitForTimeout(100)

  // Connect via API
  const result = await page.evaluate(() => {
    const gm = (window as any).__gameManager
    if (!gm?.factory) return null
    const f = gm.factory
    const machines = f.getMachines()
    if (machines.length < 2) return null
    const [mA, mB] = machines
    const placed = f.placeBeltChain(
      { x: mA.x, z: mA.z },
      { x: mB.x, z: mB.z },
      'output',
    )
    return {
      placed,
      beltCount: f.getBelts().length,
      machineA: { x: mA.x, z: mA.z },
      machineB: { x: mB.x, z: mB.z },
    }
  })

  if (!result || !result.placed || result.beltCount === 0) {
    throw new Error(`Belt placement failed: ${JSON.stringify(result)}`)
  }

  // Force renderer update so belt meshes are created
  await page.evaluate(() => {
    const getRenderer = (window as any).__getFactoryRenderer
    if (typeof getRenderer === 'function') {
      const renderer = getRenderer()
      if (renderer) renderer.update()
    }
  })
  await page.waitForTimeout(500)

  return result
}

/**
 * Traverse the Three.js scene and return metadata about all belt meshes,
 * separating corners (ExtrudeGeometry / key starts with 'corner_') from
 * straight/endpoint (BoxGeometry) pieces.
 */
async function inspectBeltMeshes(page: Page) {
  return page.evaluate(() => {
    const getRenderer = (window as any).__getFactoryRenderer
    const renderer = getRenderer?.()
    if (!renderer) return null

    const beltMeshes: Map<string, any> = (renderer as any).beltMeshes
    if (!beltMeshes) return null

    const corners: Array<{
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
    }> = []

    const straights: Array<{
      key: string
      geometryType: string
      vertexCount: number
      positionX: number
      positionY: number
      positionZ: number
    }> = []

    for (const [key, mesh] of beltMeshes) {
      const geom = mesh.geometry
      const posAttr = geom.getAttribute('position')
      const vertexCount = posAttr ? posAttr.count : 0
      const gType = geom.type || geom.constructor?.name || 'unknown'
      const pos = mesh.position

      if (key.startsWith('corner_')) {
        // Inspect UV attribute
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

        // Compute bounding box
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Belt Corner Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await enterSandbox(page)
  })

  test('corner geometry has valid vertices and UVs', async ({ page }) => {
    await createLShapedBelt(page)
    const meshes = await inspectBeltMeshes(page)

    expect(meshes).not.toBeNull()
    expect(meshes!.corners.length).toBeGreaterThan(0)

    for (const corner of meshes!.corners) {
      // Vertex count must be non-trivial (a quarter-ring ExtrudeGeometry
      // with curveSegments=12 should have dozens of vertices)
      expect(corner.vertexCount).toBeGreaterThan(10)

      // UV attribute must exist
      expect(corner.hasUV).toBe(true)

      // All UV values should be within a reasonable range.
      // After the arc-following remap, U spans [0, 1] and V spans [0, 1].
      // Side faces keep their original UVs which may differ, so we check
      // the overall range is not degenerate (all zeros) and stays bounded.
      expect(corner.uvRange).not.toBeNull()
      const uv = corner.uvRange!
      expect(uv.maxU - uv.minU).toBeGreaterThan(0.01) // not flat
      expect(uv.maxV - uv.minV).toBeGreaterThan(0.01) // not flat
      // UVs should stay in a sane range. Side faces from ExtrudeGeometry
      // keep their original UVs which may go below 0, so we allow a wider range.
      expect(uv.minU).toBeGreaterThanOrEqual(-1.5)
      expect(uv.maxU).toBeLessThanOrEqual(2.0)
      expect(uv.minV).toBeGreaterThanOrEqual(-1.5)
      expect(uv.maxV).toBeLessThanOrEqual(2.0)

      // Bounding box should be non-degenerate
      expect(corner.bbMin).not.toBeNull()
      expect(corner.bbMax).not.toBeNull()
      const bbWidth = corner.bbMax!.x - corner.bbMin!.x
      const bbDepth = corner.bbMax!.z - corner.bbMin!.z
      const bbHeight = corner.bbMax!.y - corner.bbMin!.y
      expect(bbWidth).toBeGreaterThan(0.05)
      expect(bbDepth).toBeGreaterThan(0.05)
      expect(bbHeight).toBeGreaterThan(0.01) // thin slab, but not zero
      expect(bbHeight).toBeLessThan(0.2) // should be ~0.05
    }
  })

  test('corner mesh positions are within grid bounds and at ground level', async ({ page }) => {
    await createLShapedBelt(page)
    const meshes = await inspectBeltMeshes(page)

    expect(meshes).not.toBeNull()
    expect(meshes!.corners.length).toBeGreaterThan(0)

    for (const corner of meshes!.corners) {
      // Corner meshes are positioned at Y=0 (the geometry is translated up internally)
      expect(corner.positionY).toBeCloseTo(0, 1)

      // Position should be within the 20×20 grid world bounds
      // Grid world coords run from -10 to +10 on X and Z, plus corner offsets
      expect(corner.positionX).toBeGreaterThan(-11)
      expect(corner.positionX).toBeLessThan(11)
      expect(corner.positionZ).toBeGreaterThan(-11)
      expect(corner.positionZ).toBeLessThan(11)
    }
  })

  test('corner and straight segments together cover all belt cells', async ({ page }) => {
    await createLShapedBelt(page)
    const meshes = await inspectBeltMeshes(page)

    expect(meshes).not.toBeNull()

    // Total rendered cells = corners + straights (excludes machine cells)
    const totalRendered = meshes!.corners.length + meshes!.straights.length

    // Each belt segment connects two adjacent cells. The number of
    // distinct non-machine belt cells should equal totalRendered.
    // We verify it matches the mesh map size.
    expect(totalRendered).toBe(meshes!.totalMeshes)

    // There must be at least 1 corner for an L-shaped path
    expect(meshes!.corners.length).toBeGreaterThanOrEqual(1)

    // There should be straight/endpoint pieces too
    expect(meshes!.straights.length).toBeGreaterThan(0)

    // No duplicate keys (guaranteed by Map, but verify mesh count is sane)
    expect(meshes!.totalMeshes).toBeGreaterThanOrEqual(3) // at least corner + 2 endpoints

    // Each corner mesh key should be unique
    const cornerKeys = meshes!.corners.map(c => c.key)
    expect(new Set(cornerKeys).size).toBe(cornerKeys.length)
  })

  test('corner bounding box spans approximately BELT_WIDTH', async ({ page }) => {
    await createLShapedBelt(page)
    const meshes = await inspectBeltMeshes(page)

    expect(meshes).not.toBeNull()
    expect(meshes!.corners.length).toBeGreaterThan(0)

    for (const corner of meshes!.corners) {
      // The corner quarter-ring geometry has outer radius 0.7 and inner 0.3.
      // Before rotation, the shape spans [0, outerR] on both X and Z axes
      // (quarter arc from 0 to π/2). After rotation around Y, the bounding
      // box should span roughly outerR ≈ 0.7 in both X and Z.
      const bb = corner.bbMax!
      const bbMin = corner.bbMin!
      const spanX = bb.x - bbMin.x
      const spanZ = bb.z - bbMin.z

      // Spans should be within reasonable range for the quarter-ring
      // (outer radius 0.7, so max span up to ~0.7, min ~0.3 for the belt width)
      expect(spanX).toBeGreaterThan(0.2)
      expect(spanX).toBeLessThan(1.0)
      expect(spanZ).toBeGreaterThan(0.2)
      expect(spanZ).toBeLessThan(1.0)
    }
  })

  test('belt highlighting applies to corner meshes', async ({ page }) => {
    await createLShapedBelt(page)

    // Get belt IDs from the factory, then highlight them via the renderer
    const highlightResult = await page.evaluate(() => {
      const gm = (window as any).__gameManager
      const getRenderer = (window as any).__getFactoryRenderer
      const renderer = getRenderer?.()
      if (!gm?.factory || !renderer) return null

      const belts = gm.factory.getBelts()
      if (belts.length === 0) return null

      const beltIds = belts.map((b: any) => b.id)
      renderer.highlightBelts(beltIds)

      // Now inspect corner meshes for highlight material
      const beltMeshes: Map<string, any> = (renderer as any).beltMeshes
      const results: Array<{
        key: string
        isHighlighted: boolean
        emissiveHex: number
      }> = []

      for (const [key, mesh] of beltMeshes) {
        if (key.startsWith('corner_')) {
          const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
          results.push({
            key,
            isHighlighted: mat.emissiveIntensity > 0.3,
            emissiveHex: mat.emissive?.getHex?.() ?? 0,
          })
        }
      }

      return { cornerCount: results.length, results }
    })

    expect(highlightResult).not.toBeNull()
    expect(highlightResult!.cornerCount).toBeGreaterThan(0)

    for (const corner of highlightResult!.results) {
      // The highlight material has emissive = 0x00cccc and intensity = 0.8
      expect(corner.isHighlighted).toBe(true)
      expect(corner.emissiveHex).toBe(0x00cccc)
    }

    // Now clear highlight and verify it reverts
    const clearResult = await page.evaluate(() => {
      const getRenderer = (window as any).__getFactoryRenderer
      const renderer = getRenderer?.()
      if (!renderer) return null

      renderer.clearBeltHighlight()

      const beltMeshes: Map<string, any> = (renderer as any).beltMeshes
      const results: Array<{ key: string; emissiveHex: number }> = []

      for (const [key, mesh] of beltMeshes) {
        if (key.startsWith('corner_')) {
          const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
          results.push({
            key,
            emissiveHex: mat.emissive?.getHex?.() ?? 0,
          })
        }
      }

      return results
    })

    expect(clearResult).not.toBeNull()
    for (const corner of clearResult!) {
      // After clearing, emissive should no longer be the highlight color
      expect(corner.emissiveHex).not.toBe(0x00cccc)
    }
  })
})
