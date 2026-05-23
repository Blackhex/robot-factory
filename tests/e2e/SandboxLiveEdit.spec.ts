import { test, expect } from './pom'
import {
  buildAndRunSandboxFactory,
  waitForRenderedBeltItems,
} from './pom/scenarios/SandboxFactoryScenario'

// Use a wide viewport so the PXT editor has enough room for the toolbox + workspace
test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('Sandbox — Edit during simulation must not leave ghost rendered items', () => {
  test('control: items always lie on a current belt path while running', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(90000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)

    await waitForRenderedBeltItems(probe)
    await probe.flushAnimationFrame()
    await probe.expectCurrentBeltPathHasSegments('current belt path must exist')
    await probe.expectRenderedItemsOnCurrentBeltPath({
      context: 'Control:',
    })
  })

  test('moving a machine mid-sim leaves no rendered items off the current belt path', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(90000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)

    await waitForRenderedBeltItems(probe)
    expect(await probe.isRunning()).toBe(true)
    expect(await probe.isPaused()).toBe(false)

    const machinesBefore = await probe.getMachines()
    const fabricator = machinesBefore.find((m) => m.type === 'part_fabricator')
    const sink = machinesBefore.find((m) => m.type === 'factory_output')
    expect(fabricator, 'producer machine must exist before move').toBeTruthy()
    expect(sink, 'sink machine must exist before move').toBeTruthy()

    const target = { x: fabricator!.x, z: fabricator!.z - 3 }
    const moved = await probe.moveMachineDirect(
      fabricator!.x, fabricator!.z, target.x, target.z,
    )
    expect(moved, 'moveMachine must succeed mid-simulation').toBe(true)

    await probe.flushAnimationFrame()

    await probe.expectCurrentBeltPathHasSegments('belts must have been re-routed after the move')

    const machinesAfter = await probe.getMachines()
    const movedFab = machinesAfter.find((m) => m.type === 'part_fabricator')
    expect(movedFab).toBeTruthy()
    expect(movedFab!.x).toBe(target.x)
    expect(movedFab!.z).toBe(target.z)

    await probe.expectRenderedItemsOnCurrentBeltPath({
      context: 'After moving the producer machine mid-simulation:',
    })

    await expect(async () => {
      const live = await probe.readItemInstancePositions()
      expect(
        live.totalCount,
        `After move, rendered item instance count must climb back to ≥3 ` +
          `(got ${live.totalCount}). Renderer must self-heal after belt re-route.`,
      ).toBeGreaterThanOrEqual(3)
    }).toPass({ timeout: 2000, intervals: [150] })

    await probe.expectRenderedItemsOnCurrentBeltPath({
      context: 'After self-heal, every rendered item must still lie on a current belt path:',
    })

    await toolbar.clickPause()
    await toolbar.expectPauseButtonText('Resume')
    await expect.poll(() => probe.isPaused(), { timeout: 2000 }).toBe(true)
    await probe.settle(300)
    const paused1 = await probe.readItemInstancePositions()
    await probe.settle(300)
    const paused2 = await probe.readItemInstancePositions()
    const pauseDelta =
      Math.abs(paused2.sumX - paused1.sumX) + Math.abs(paused2.sumZ - paused1.sumZ)
    expect(
      pauseDelta,
      'After mid-sim machine move, Pause must still hold rendered items in place',
    ).toBeLessThan(1e-3)
  })

  test('rotating a machine mid-sim leaves no rendered items off the current belt path', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(90000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)
    await waitForRenderedBeltItems(probe)
    expect(await probe.isRunning()).toBe(true)
    expect(await probe.isPaused()).toBe(false)

    const machinesBefore = await probe.getMachines()
    const fabricator = machinesBefore.find((m) => m.type === 'part_fabricator')
    expect(fabricator, 'producer machine must exist before rotate').toBeTruthy()

    const rotated = await probe.rotateMachineDirect(
      fabricator!.x, fabricator!.z, 'south',
    )
    expect(rotated, 'rotateMachine must succeed mid-simulation').toBe(true)

    await probe.flushAnimationFrame()

    await probe.expectCurrentBeltPathHasSegments('belts must have been re-routed after the rotate')
    await probe.expectRenderedItemsOnCurrentBeltPath({
      context: 'After rotating the producer machine mid-simulation:',
    })

    await expect(async () => {
      const live = await probe.readItemInstancePositions()
      expect(
        live.totalCount,
        `After rotate, rendered item instance count must climb back to ≥3 ` +
          `(got ${live.totalCount}). Renderer must self-heal after belt re-route.`,
      ).toBeGreaterThanOrEqual(3)
    }).toPass({ timeout: 2000, intervals: [150] })

    await probe.expectRenderedItemsOnCurrentBeltPath({
      context: 'After rotate self-heal, every rendered item must still lie on a current belt path:',
    })
  })

  test('deleting a belt mid-sim leaves no rendered items off the current belt path', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(90000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)
    await waitForRenderedBeltItems(probe)

    expect(await probe.isRunning()).toBe(true)
    expect(await probe.isPaused()).toBe(false)

    const removed = await probe.removeFirstBeltDirect()
    expect(removed, 'a belt must have been removed mid-sim').toBe(true)

    await probe.flushAnimationFrame()
    await probe.settle(200)
    await probe.flushAnimationFrame()

    await probe.expectRenderedItemsOnCurrentBeltPath({
      context: 'After deleting a belt mid-simulation:',
    })
  })
})

test.describe('Repeated machine moves during running simulation', () => {
  test('dragging a machine to multiple positions does not duplicate items on the connected belt', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(120000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)

    // Wait for items to be flowing on the belt and the simulation to be running.
    await waitForRenderedBeltItems(probe)
    expect(await probe.isRunning()).toBe(true)
    expect(await probe.isPaused()).toBe(false)

    const machinesBefore = await probe.getMachines()
    const fabricator = machinesBefore.find((m) => m.type === 'part_fabricator')
    expect(fabricator, 'producer machine must exist before drag').toBeTruthy()

    // Stabilize and read the baseline item count.
    await probe.settle(300)
    const N0 = (await probe.readSnapshot()).itemsOnBelts

    // Generous bound: at 10 ticks/sec each drag pause leaves the simulation
    // briefly stopped (~500ms settle); allow ~10 newly produced items per drag.
    const allowedPerDrag = 10

    // Drag #1: move the producer one cell upstream of its current position.
    const target1 = { x: fabricator!.x, z: fabricator!.z - 1 }
    await grid.dragMachineToCell({ x: fabricator!.x, z: fabricator!.z }, target1)
    await expect.poll(
      async () => (await probe.getMachines()).some((m) => m.x === target1.x && m.z === target1.z),
      { timeout: 5000, intervals: [50, 100, 250] },
    ).toBe(true)
    const N1 = (await probe.readSnapshot()).itemsOnBelts
    expect(
      N1,
      `After 1st drag, items must not multiply: N0=${N0}, N1=${N1}, ` +
        `bound=N0+${1 * allowedPerDrag}`,
    ).toBeLessThanOrEqual(N0 + 1 * allowedPerDrag)

    // Drag #2: move the same machine again to another empty cell.
    const target2 = { x: fabricator!.x, z: fabricator!.z - 2 }
    await grid.dragMachineToCell(target1, target2)
    await expect.poll(
      async () => (await probe.getMachines()).some((m) => m.x === target2.x && m.z === target2.z),
      { timeout: 5000, intervals: [50, 100, 250] },
    ).toBe(true)
    const N2 = (await probe.readSnapshot()).itemsOnBelts
    expect(
      N2,
      `After 2nd drag, items must not multiply: N0=${N0}, N1=${N1}, N2=${N2}, ` +
        `bound=N0+${2 * allowedPerDrag}`,
    ).toBeLessThanOrEqual(N0 + 2 * allowedPerDrag)

    // Drag #3: move once more.
    const target3 = { x: fabricator!.x, z: fabricator!.z - 3 }
    await grid.dragMachineToCell(target2, target3)
    await expect.poll(
      async () => (await probe.getMachines()).some((m) => m.x === target3.x && m.z === target3.z),
      { timeout: 5000, intervals: [50, 100, 250] },
    ).toBe(true)
    const N3 = (await probe.readSnapshot()).itemsOnBelts
    expect(
      N3,
      `After 3rd drag, items must not multiply: N0=${N0}, N1=${N1}, N2=${N2}, N3=${N3}, ` +
        `bound=N0+${3 * allowedPerDrag}`,
    ).toBeLessThanOrEqual(N0 + 3 * allowedPerDrag)

    // Surface the recorded counts in test output for the report.
    console.log(`[repeated-move] N0=${N0} N1=${N1} N2=${N2} N3=${N3}`)
  })

  test('repeated identical round-trip moves produce identical per-belt-cell item state', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(120000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)
    await waitForRenderedBeltItems(probe)
    expect(await probe.isRunning()).toBe(true)

    const machinesBefore = await probe.getMachines()
    const fab = machinesBefore.find((m) => m.type === 'part_fabricator')!
    expect(fab, 'producer machine must exist').toBeTruthy()

    const home = { x: fab.x, z: fab.z }
    const detour = { x: fab.x, z: fab.z - 3 }

    // Pause simulation up-front and KEEP IT PAUSED for the entire test.
    // The deterministic-planner contract says: belts re-routed by identical
    // structural operations from identical inventory state produce
    // identical placements. Sim ticks would invalidate the precondition
    // (items would advance on the belt), so we run all 5 cycles inside a
    // single pause window. moveMachineDirect re-routes belts synchronously
    // independent of the sim loop, so cycles still exercise the planner.
    await toolbar.clickPause()
    await expect.poll(() => probe.isPaused(), { timeout: 2000 }).toBe(true)
    const baseline = await probe.readSimItemsByCellKey()

    // 5 identical round-trips: home -> detour -> home, all while paused.
    const seen: Array<typeof baseline> = [baseline]
    for (let i = 0; i < 5; i++) {
      expect(
        await probe.moveMachineDirect(home.x, home.z, detour.x, detour.z),
        `Cycle ${i + 1}: outbound move must succeed while paused`,
      ).toBe(true)
      expect(
        await probe.moveMachineDirect(detour.x, detour.z, home.x, home.z),
        `Cycle ${i + 1}: return move must succeed while paused`,
      ).toBe(true)
      const snap = await probe.readSimItemsByCellKey()

      // Belt path shape (set of cellKeys) MUST be identical to baseline.
      const baselineKeys = baseline.map((b) => b.cellKey).sort()
      const snapKeys = snap.map((s) => s.cellKey).sort()
      expect(
        snapKeys,
        `Cycle #${i + 1}: belt-cell-key set must be identical to baseline ` +
          `(deterministic re-route). baseline=${JSON.stringify(baselineKeys)} ` +
          `snap=${JSON.stringify(snapKeys)}`,
      ).toEqual(baselineKeys)

      seen.push(snap)
    }

    // Determinism check: with the simulation paused, each cycle must
    // produce a bit-identical per-cell item snapshot. Same item ids in the
    // same cellKeys at the same intra-cell positions.
    const baselineByKey = new Map(baseline.map((c) => [c.cellKey, c.items]))
    for (let i = 1; i < seen.length; i++) {
      const snapByKey = new Map(seen[i].map((c) => [c.cellKey, c.items]))
      for (const [key, baselineItems] of baselineByKey) {
        const snapItems = snapByKey.get(key) ?? []
        expect(
          snapItems.length,
          `Cycle ${i}: cell ${key} item count changed; baseline=${baselineItems.length} ` +
            `snap=${snapItems.length}. Planner must be lossless across identical ` +
            `same-shape round-trips while paused.`,
        ).toBe(baselineItems.length)
        for (const itB of baselineItems) {
          const itS = snapItems.find((x) => x.id === itB.id)
          expect(
            itS,
            `Cycle ${i}: item ${itB.id} missing from cell ${key} after identical ` +
              `round-trip; planner contract violated.`,
          ).toBeDefined()
          expect(
            itS!.position,
            `Cycle ${i}: item ${itB.id} at cell ${key} drifted across identical ` +
              `round-trip while paused; baseline=${itB.position} snap=${itS!.position}`,
          ).toBeCloseTo(itB.position, 5)
        }
      }
    }
  })
})

test.describe('Rendered item count matches simulation truth', () => {
  test('rendered InstancedMesh count == simulator items-on-belts after 5 moves + pause', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(120000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)

    await waitForRenderedBeltItems(probe)
    expect(await probe.isRunning()).toBe(true)
    expect(await probe.isPaused()).toBe(false)

    // Move the producer machine multiple times. Each move triggers belt
    // removal + re-route + item migration. The user-reported symptom is
    // that duplicates accumulate per move.
    const ms0 = await probe.getMachines()
    const fab0 = ms0.find((m) => m.type === 'part_fabricator')!
    expect(fab0).toBeTruthy()

    const t1 = { x: fab0.x, z: fab0.z - 3 }
    expect(await probe.moveMachineDirect(fab0.x, fab0.z, t1.x, t1.z)).toBe(true)
    await probe.flushAnimationFrame()
    await expect.poll(
      async () => (await probe.getMachines()).some((m) => m.x === t1.x && m.z === t1.z),
      { timeout: 5000, intervals: [50, 100, 250] },
    ).toBe(true)

    const ms1 = await probe.getMachines()
    const fab1 = ms1.find((m) => m.type === 'part_fabricator')!
    const t2 = { x: fab1.x, z: fab1.z + 3 }
    expect(await probe.moveMachineDirect(fab1.x, fab1.z, t2.x, t2.z)).toBe(true)
    await probe.flushAnimationFrame()
    await expect.poll(
      async () => (await probe.getMachines()).some((m) => m.x === t2.x && m.z === t2.z),
      { timeout: 5000, intervals: [50, 100, 250] },
    ).toBe(true)

    const ms2 = await probe.getMachines()
    const fab2 = ms2.find((m) => m.type === 'part_fabricator')!
    const t3 = { x: fab2.x, z: fab2.z - 3 }
    expect(await probe.moveMachineDirect(fab2.x, fab2.z, t3.x, t3.z)).toBe(true)
    await probe.flushAnimationFrame()
    await expect.poll(
      async () => (await probe.getMachines()).some((m) => m.x === t3.x && m.z === t3.z),
      { timeout: 5000, intervals: [50, 100, 250] },
    ).toBe(true)

    const ms3 = await probe.getMachines()
    const fab3 = ms3.find((m) => m.type === 'part_fabricator')!
    const t4 = { x: fab3.x, z: fab3.z + 5 }
    expect(await probe.moveMachineDirect(fab3.x, fab3.z, t4.x, t4.z)).toBe(true)
    await probe.flushAnimationFrame()
    await expect.poll(
      async () => (await probe.getMachines()).some((m) => m.x === t4.x && m.z === t4.z),
      { timeout: 5000, intervals: [50, 100, 250] },
    ).toBe(true)

    const ms4 = await probe.getMachines()
    const fab4 = ms4.find((m) => m.type === 'part_fabricator')!
    const t5 = { x: fab4.x, z: fab4.z - 4 }
    expect(await probe.moveMachineDirect(fab4.x, fab4.z, t5.x, t5.z)).toBe(true)
    await probe.flushAnimationFrame()
    await expect.poll(
      async () => (await probe.getMachines()).some((m) => m.x === t5.x && m.z === t5.z),
      { timeout: 5000, intervals: [50, 100, 250] },
    ).toBe(true)

    // Pause so simulator truth is stable while we compare.
    await toolbar.clickPause()
    await toolbar.expectPauseButtonText('Resume')
    await expect.poll(() => probe.isPaused(), { timeout: 2000 }).toBe(true)
    await probe.flushAnimationFrame()

    const snap = await probe.readSnapshot()
    const rendered = await probe.readItemInstancePositions()

    // Cross-check: count distinct item ids in sim, across all belts. If
    // any id appears twice (H1: same Item present in two segments), the
    // renderer would faithfully paint it twice.
    const idAudit = await probe.readSimItemIdsPerBelt()
    const allIds: string[] = []
    for (const ids of idAudit) for (const id of ids) allIds.push(id)
    const dupIds = allIds.filter((id, i) => allIds.indexOf(id) !== i)

    expect(
      dupIds,
      `Sim items must be unique across belts. Duplicates: ${dupIds.join(',')}`,
    ).toEqual([])

    // The simulator's truth is the sum of items across all belt segments.
    // The renderer's instance count must equal it: every item is rendered
    // exactly once. Any excess means the renderer painted a ghost.
    expect(
      rendered.totalCount,
      `After 5 mid-sim moves + pause: rendered=${rendered.totalCount}, ` +
        `simItemsOnBelts=${snap.itemsOnBelts}. Excess rendered means a ghost.`,
    ).toBe(snap.itemsOnBelts)
  })
})

test.describe('Belt mesh count matches simulation truth', () => {
  test('rendered belt mesh count == registered map after 5 moves + pause', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(120000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)

    await waitForRenderedBeltItems(probe)
    expect(await probe.isRunning()).toBe(true)
    expect(await probe.isPaused()).toBe(false)

    // Initial belt mesh accounting (control).
    await probe.flushAnimationFrame()
    const before = await probe.getBeltMeshCounts()
    expect(before, 'belt mesh probe must be available').not.toBeNull()
    expect(
      before!.sceneMeshCount,
      `Control: scene belt-mesh count must equal registered map size ` +
        `(map=${before!.mapSize}, scene=${before!.sceneMeshCount}).`,
    ).toBe(before!.mapSize)

    // Drive several REAL drag-and-drop moves of the producer machine to
    // provoke belt remove/re-route AND drag-preview ghost belt cycles.
    // This mirrors the user-reported scenario (Screenshot 2): repeated
    // mid-sim drags producing visually-doubled belt strips.
    let ms = await probe.getMachines()
    let fab = ms.find((m) => m.type === 'part_fabricator')!
    expect(fab, 'producer machine must exist before drag').toBeTruthy()

    const offsets: Array<{ dx: number; dz: number }> = [
      { dx: 0, dz: -1 }, { dx: 0, dz: -1 }, { dx: 0, dz: -1 },
      { dx: 0, dz: 1 }, { dx: 1, dz: 0 },
    ]
    for (const off of offsets) {
      const target = { x: fab.x + off.dx, z: fab.z + off.dz }
      await grid.dragMachineToCell({ x: fab.x, z: fab.z }, target)
      await expect.poll(
        async () => (await probe.getMachines()).some((m) => m.x === target.x && m.z === target.z),
        { timeout: 5000, intervals: [50, 100, 250] },
      ).toBe(true)
      await probe.flushAnimationFrame()
      ms = await probe.getMachines()
      fab = ms.find((m) => m.type === 'part_fabricator')!
    }

    // Pause and let render frames flush.
    await toolbar.clickPause()
    await toolbar.expectPauseButtonText('Resume')
    await expect.poll(() => probe.isPaused(), { timeout: 2000 }).toBe(true)
    await probe.flushAnimationFrame()
    await probe.flushAnimationFrame()

    const counts = await probe.getBeltMeshCounts()
    expect(counts).not.toBeNull()
    const simBeltCount = await probe.getBeltCountFromFactory()

    console.log(
      `[belt-mesh] simBelts=${simBeltCount} mapSize=${counts!.mapSize} ` +
        `sceneBeltMeshes=${counts!.sceneMeshCount}`,
    )

    // KEY invariant: scene must contain exactly the registered belt-strip
    // meshes; no leaked ghosts left behind from prior re-routes / drags.
    expect(
      counts!.sceneMeshCount,
      `After ${offsets.length} mid-sim drag moves + pause: scene contains ` +
        `${counts!.sceneMeshCount} belt-strip meshes but only ${counts!.mapSize} ` +
        `are registered in beltMeshes. Excess scene meshes are ghost belt ` +
        `meshes left behind by prior belt removals or preview drags.`,
    ).toBe(counts!.mapSize)

    // Deeper scan: count ANY mesh whose world position overlaps each belt
    // cell. This catches ghost overlay meshes that don't share belt geometry
    // (e.g. preview ghost belts, leftover machine ghost meshes, etc.).
    // We expect at most 1 visible mesh per belt cell (the belt mesh itself).
    const overlaps = await probe.getOverlappingMeshesPerBeltCell()
    expect(overlaps).not.toBeNull()
    const offending = overlaps!.filter((o) => o.visibleMeshCount > 1)
    if (offending.length > 0) {
      console.log('[belt-mesh] cells with overlapping visible meshes:')
      for (const o of offending) {
        console.log(
          `  ${o.cellKey} grid=(${o.cellX},${o.cellZ}) world=(${o.worldX.toFixed(2)},${o.worldZ.toFixed(2)}) ` +
            `visible=${o.visibleMeshCount} hidden=${o.invisibleMeshCount}`,
        )
      }
    }
    expect(
      offending.length,
      `After ${offsets.length} mid-sim drags + pause: ${offending.length} ` +
        `belt cells have more than one visible mesh stacked at the same ` +
        `position (ghost overlay). See cells: ${offending.map((o) => o.cellKey).join(', ')}.`,
    ).toBe(0)
  })
})

test.describe('Bug B regression — same-shape source move preserves all items at deterministic positions', () => {
  test('belt with ≥3 items keeps every item on the new same-shape belt at identical positions after a single source move', async ({
    mainMenu, toolbar, grid, machinePanel, editorPanel, probe,
  }) => {
    test.setTimeout(120000)

    await buildAndRunSandboxFactory(mainMenu, toolbar, grid, machinePanel, editorPanel, probe)

    // Wait for the belt to actually carry ≥3 items concurrently. The
    // helper-built belt is 3 cells long (capacity 3 under the one-item-
    // per-cell contract). Steady state may dip below 3 if the output
    // consumes faster than the fabricator produces; we poll until we
    // catch a moment with the full 3.
    await waitForRenderedBeltItems(probe)
    await expect(async () => {
      const snap = await probe.readSnapshot()
      expect(
        snap.itemsOnBelts,
        `Bug B repro requires ≥3 items on belt at once; saw ${snap.itemsOnBelts}`,
      ).toBeGreaterThanOrEqual(3)
    }).toPass({ timeout: 30000, intervals: [150] })

    // Pause to capture a stable snapshot of the source state.
    await toolbar.clickPause()
    await expect.poll(() => probe.isPaused(), { timeout: 2000 }).toBe(true)
    await probe.settle(150)
    const before = await probe.readSimItemsByCellKey()
    const beforeIds = new Set<string>()
    for (const cell of before) for (const it of cell.items) beforeIds.add(it.id)
    expect(
      beforeIds.size,
      `Captured ≥3 unique item ids before move (Bug B repro precondition); got ${beforeIds.size}`,
    ).toBeGreaterThanOrEqual(3)
    expect(
      before.length,
      `Bug B repro requires a multi-cell belt (≥3 cells); got ${before.length} belt cells`,
    ).toBeGreaterThanOrEqual(3)

    // Move the SOURCE fabricator one column over (a same-shape translation).
    // The belt is rebuilt with identical segment count and identical slot
    // identity (output→input), so every captured item must land at the same
    // segment index with the same intra-cell position.
    const machinesBefore = await probe.getMachines()
    const fab = machinesBefore.find((m) => m.type === 'part_fabricator')!
    const output = machinesBefore.find((m) => m.type === 'factory_output')!
    expect(fab && output, 'fab + output must exist before same-shape move').toBeTruthy()

    // To keep the belt SAME-SHAPE, also move the output by the same offset.
    // (Moving only the source would change the path length: 3 cells -> 4+ if
    // the offset isn't along the belt axis.) We translate both machines by
    // (0, -1) so the belt axis and length are preserved exactly.
    const dz = -1
    expect(
      await probe.moveMachineDirect(output.x, output.z, output.x, output.z + dz),
    ).toBe(true)
    expect(
      await probe.moveMachineDirect(fab.x, fab.z, fab.x, fab.z + dz),
    ).toBe(true)
    await probe.flushAnimationFrame()
    await expect.poll(
      async () => {
        const ms = await probe.getMachines()
        const fabAt = ms.some((m) => m.x === fab.x && m.z === fab.z + dz)
        const outAt = ms.some((m) => m.x === output.x && m.z === output.z + dz)
        return fabAt && outAt
      },
      { timeout: 5000, intervals: [50, 100, 250] },
    ).toBe(true)

    const after = await probe.readSimItemsByCellKey()
    const afterIds = new Set<string>()
    for (const cell of after) for (const it of cell.items) afterIds.add(it.id)

    // Every item that was on the belt before the move must still be on the
    // belt after the move. The discrete planner is contractually lossless
    // for same-shape replacements (no `dropped` entries), so set equality
    // (or at least set-containment of `before` in `after`) must hold.
    const lost = [...beforeIds].filter((id) => !afterIds.has(id))
    expect(
      lost,
      `Bug B regression: same-shape source move dropped items ${lost.join(',')}. ` +
        `Discrete planner contract: same-shape replacement is lossless.`,
    ).toEqual([])

    // Same-shape determinism: each retained item must occupy the SAME
    // segment-index-equivalent cell key (translated by the same offset)
    // with the same intra-cell position. Build a key→items map for both
    // sides, translating the `before` cellKeys by (0, dz).
    function translateKey(key: string, dz: number): string {
      const m = /^(-?\d+),(-?\d+)->(-?\d+),(-?\d+)$/.exec(key)
      if (!m) return key
      const fx = Number(m[1])
      const fz = Number(m[2]) + dz
      const tx = Number(m[3])
      const tz = Number(m[4]) + dz
      return `${fx},${fz}->${tx},${tz}`
    }
    const beforeByTranslatedKey = new Map(
      before.map((c) => [translateKey(c.cellKey, dz), c.items]),
    )
    const afterByKey = new Map(after.map((c) => [c.cellKey, c.items]))

    for (const [translatedKey, beforeItems] of beforeByTranslatedKey) {
      const afterItems = afterByKey.get(translatedKey) ?? []
      for (const itB of beforeItems) {
        const itA = afterItems.find((x) => x.id === itB.id)
        expect(
          itA,
          `Bug B regression: item ${itB.id} that was on cell ` +
            `${translatedKey} (translated from before) is missing on the ` +
            `same cell after the same-shape move.`,
        ).toBeDefined()
        expect(
          itA!.position,
          `Bug B regression: item ${itB.id} changed intra-cell position across ` +
            `same-shape move; before=${itB.position} after=${itA!.position}`,
        ).toBeCloseTo(itB.position, 5)
      }
    }
  })
})
