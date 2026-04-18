import { test, expect } from './pom'

test.use({ viewport: { width: 1280, height: 720 } })

/**
 * E2E tests: Belt corner rendering correctness.
 *
 * These tests verify Three.js geometry properties that unit tests cannot catch
 * (since Three.js is fully mocked in Vitest). They inspect the live scene graph
 * via the SimulationProbe to detect regressions in corner geometry construction,
 * UV mapping, mesh positioning, and belt highlighting.
 */

async function createLShapedBelt(probe: import('./pom/canvas/SimulationProbe').SimulationProbe, grid: import('./pom/canvas/FactoryGridPage').FactoryGridPage) {
  // Place machine A at (8, 8)
  await grid.dblClickCell({ x: 8, z: 8 })
  await grid.clickCell({ x: 1, z: 1 }) // deselect

  // Place machine B at (12, 12)
  await grid.dblClickCell({ x: 12, z: 12 })
  await grid.clickCell({ x: 1, z: 1 }) // deselect

  const result = await probe.placeBeltChainViaFactory()
  if (!result || !result.placed || result.beltCount === 0) {
    throw new Error(`Belt placement failed: ${JSON.stringify(result)}`)
  }

  await probe.forceRendererUpdate()
  // Settle: rendering meshes after placement.
  await probe.settle(500)
  return result
}

test.describe('Belt Corner Rendering', () => {
  test.beforeEach(async ({ mainMenu, toolbar }) => {
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()
  })

  test('corner geometry has valid vertices and UVs', async ({ probe, grid }) => {
    await createLShapedBelt(probe, grid)
    const meshes = await probe.inspectBeltMeshes()

    expect(meshes).not.toBeNull()
    expect(meshes!.corners.length).toBeGreaterThan(0)

    for (const corner of meshes!.corners) {
      expect(corner.vertexCount).toBeGreaterThan(10)
      expect(corner.hasUV).toBe(true)

      expect(corner.uvRange).not.toBeNull()
      const uv = corner.uvRange!
      expect(uv.maxU - uv.minU).toBeGreaterThan(0.01)
      expect(uv.maxV - uv.minV).toBeGreaterThan(0.01)
      expect(uv.minU).toBeGreaterThanOrEqual(-1.5)
      expect(uv.maxU).toBeLessThanOrEqual(2.0)
      expect(uv.minV).toBeGreaterThanOrEqual(-1.5)
      expect(uv.maxV).toBeLessThanOrEqual(2.0)

      expect(corner.bbMin).not.toBeNull()
      expect(corner.bbMax).not.toBeNull()
      const bbWidth = corner.bbMax!.x - corner.bbMin!.x
      const bbDepth = corner.bbMax!.z - corner.bbMin!.z
      const bbHeight = corner.bbMax!.y - corner.bbMin!.y
      expect(bbWidth).toBeGreaterThan(0.05)
      expect(bbDepth).toBeGreaterThan(0.05)
      expect(bbHeight).toBeGreaterThan(0.01)
      expect(bbHeight).toBeLessThan(0.2)
    }
  })

  test('corner mesh positions are within grid bounds and at ground level', async ({ probe, grid }) => {
    await createLShapedBelt(probe, grid)
    const meshes = await probe.inspectBeltMeshes()

    expect(meshes).not.toBeNull()
    expect(meshes!.corners.length).toBeGreaterThan(0)

    for (const corner of meshes!.corners) {
      expect(corner.positionY).toBeCloseTo(0, 1)
      expect(corner.positionX).toBeGreaterThan(-11)
      expect(corner.positionX).toBeLessThan(11)
      expect(corner.positionZ).toBeGreaterThan(-11)
      expect(corner.positionZ).toBeLessThan(11)
    }
  })

  test('corner and straight segments together cover all belt cells', async ({ probe, grid }) => {
    await createLShapedBelt(probe, grid)
    const meshes = await probe.inspectBeltMeshes()

    expect(meshes).not.toBeNull()

    const totalRendered = meshes!.corners.length + meshes!.straights.length

    expect(totalRendered).toBe(meshes!.totalMeshes)
    expect(meshes!.corners.length).toBeGreaterThanOrEqual(1)
    expect(meshes!.straights.length).toBeGreaterThan(0)
    expect(meshes!.totalMeshes).toBeGreaterThanOrEqual(3)

    const cornerKeys = meshes!.corners.map(c => c.key)
    expect(new Set(cornerKeys).size).toBe(cornerKeys.length)
  })

  test('corner bounding box spans approximately BELT_WIDTH', async ({ probe, grid }) => {
    await createLShapedBelt(probe, grid)
    const meshes = await probe.inspectBeltMeshes()

    expect(meshes).not.toBeNull()
    expect(meshes!.corners.length).toBeGreaterThan(0)

    for (const corner of meshes!.corners) {
      const bb = corner.bbMax!
      const bbMin = corner.bbMin!
      const spanX = bb.x - bbMin.x
      const spanZ = bb.z - bbMin.z

      expect(spanX).toBeGreaterThan(0.2)
      expect(spanX).toBeLessThan(1.0)
      expect(spanZ).toBeGreaterThan(0.2)
      expect(spanZ).toBeLessThan(1.0)
    }
  })

  test('belt highlighting applies to corner meshes', async ({ probe, grid }) => {
    await createLShapedBelt(probe, grid)

    // Baseline (no highlight): record material uuids and confirm not highlighted.
    const baseline = await probe.inspectCornerHighlights()
    expect(baseline).not.toBeNull()
    expect(baseline!.length).toBeGreaterThan(0)
    const baselineByKey = new Map(baseline!.map(c => [c.key, c]))
    for (const c of baseline!) {
      expect(c.isHighlighted).toBe(false)
      expect(c.emissiveStrength).toBe(0)
    }

    const highlighted = await probe.highlightAllBeltsAndInspectCorners()
    expect(highlighted).not.toBeNull()
    expect(highlighted!.cornerCount).toBeGreaterThan(0)
    expect(highlighted!.results.length).toBe(baseline!.length)
    for (const corner of highlighted!.results) {
      const base = baselineByKey.get(corner.key)
      expect(base).toBeDefined()
      expect(corner.isHighlighted).toBe(true)
      expect(corner.emissiveStrength).toBeGreaterThan(0)
      // Material identity must change when highlight is applied:
      expect(corner.materialUuid).not.toEqual(base!.materialUuid)
    }

    const cleared = await probe.clearBeltHighlightAndInspectCorners()
    expect(cleared).not.toBeNull()
    for (const corner of cleared!) {
      const base = baselineByKey.get(corner.key)
      expect(base).toBeDefined()
      expect(corner.isHighlighted).toBe(false)
      expect(corner.emissiveStrength).toBe(0)
      // Material identity reverts to the baseline after clearing:
      expect(corner.materialUuid).toEqual(base!.materialUuid)
    }
  })
})
