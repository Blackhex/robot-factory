import { test, expect } from './pom'
import { enterSandbox } from './pom/scenarios/SandboxFactoryScenario'

/**
 * Visual feature: per-machine "recipe-status" badge floating above each
 * machine that has a recipe set.
 *
 * NEW semantics (replaces the old runtime-inventory grace-period model):
 *   - The badge displays a per-item-type SHAPE GLYPH drawn on top of
 *     the colored tile. Different recipes render visibly distinct
 *     glyphs, not just different fill colors.
 *   - The badge COLOR is derived from a STATIC analysis of the
 *     program + belt topology:
 *       WHITE (0xffffff) — every required input type has at least one
 *                          upstream producer (Fabricator/Assembler/
 *                          Recycler) whose currently-set recipe
 *                          outputs that type.
 *       RED   (0xff3333) — at least one required input type has no
 *                          such producer.
 *   - The color is INDEPENDENT of runtime inventory. It does NOT
 *     change during a simulation run unless the program changes
 *     (e.g., a `SET_RECIPE` command fires) or the belt topology
 *     changes.
 *
 * These tests drive the live `Machine` instances via the build-phase
 * preview hook (the same code path the editor-close hook uses) and
 * read renderer state via the `RecipeIconProbe` Page Object.
 */
test.use({ viewport: { width: 1920, height: 1080 } })

const WHITE = 0xffffff
const RED = 0xff3333

const FAB_CELL = { x: 10, z: 10 }                  // wheel_press_small source
const ASSEMBLER_CELL = { x: 13, z: 10 }            // assemble_drivetrain_basic
const CHASSIS_FAB_CELL = { x: 13, z: 13 }          // circuit_printer_basic source (produces circuit_basic, required by assemble_drivetrain_basic)

async function placeFabricatorAndAssembler({
  mainMenu, toolbar, grid, machinePanel,
}: {
  mainMenu: any; toolbar: any; grid: any; machinePanel: any
}) {
  await enterSandbox(mainMenu, toolbar)
  await grid.expectCanvasVisible()

  await grid.dblClickCell(FAB_CELL)

  await grid.dblClickCell(ASSEMBLER_CELL)
  await grid.clickCell(ASSEMBLER_CELL)
  await machinePanel.expectVisible()
  await machinePanel.selectType('assembler')
  await machinePanel.expectTypeValue('assembler')
  await machinePanel.clickClose()
  await machinePanel.expectHidden()
}

async function placeChassisFabricator({ grid }: { grid: any }) {
  // Default dblclick places a part_fabricator (same machine type used
  // for circuit_printer_basic — recipe choice determines the output).
  await grid.dblClickCell(CHASSIS_FAB_CELL)
}

test.describe('Recipe-status badge — invariants kept from the old spec', () => {
  test('machine with NO recipe set has no entry in recipeIcons', async ({
    mainMenu, toolbar, grid, machinePanel, recipeIcon, probe,
  }) => {
    test.setTimeout(60000)

    await placeFabricatorAndAssembler({ mainMenu, toolbar, grid, machinePanel })
    await recipeIcon.forceSync()

    const machines = await probe.getMachines()
    const fab = machines.find((m) => m.x === FAB_CELL.x && m.z === FAB_CELL.z)
    expect(fab, 'fabricator must exist before reading recipe-icon state').toBeTruthy()

    const state = await recipeIcon.readForMachineAt(FAB_CELL.x, FAB_CELL.z)
    expect(
      state.exists,
      'a machine with NO recipe set must not have an entry in factoryRenderer.recipeIcons',
    ).toBe(false)
  })

  test('build-phase preview makes the badge appear without starting the simulation', async ({
    mainMenu, toolbar, grid, machinePanel, recipeIcon,
  }) => {
    test.setTimeout(60000)

    await placeFabricatorAndAssembler({ mainMenu, toolbar, grid, machinePanel })

    const result = await recipeIcon.applyBuildPhaseRecipePreview(
      FAB_CELL.x, FAB_CELL.z, 'wheel_press_small',
    )
    expect(result.ok, `build-phase preview hook must apply the recipe; ${result.reason ?? ''}`).toBe(true)

    await recipeIcon.forceSync()

    const state = await recipeIcon.readForMachineAt(FAB_CELL.x, FAB_CELL.z)
    expect(
      state.exists,
      'after build-phase preview the badge MUST appear without starting the simulation',
    ).toBe(true)
    expect(state.visible).toBe(true)
    expect(
      state.worldY,
      `recipe badge must float above the machine body; got worldY=${state.worldY}`,
    ).toBeGreaterThanOrEqual(1.5)
  })
})

/* -----------------------------------------------------------------
 * Group A — Recipe glyphs are visually distinct per item type
 *
 * Today the badge texture is a uniform rounded-rectangle tile filled
 * with `ITEM_COLORS[outputType]`. Different recipes already differ in
 * tile fill color, but NO glyph shape is drawn on top. The
 * fingerprint helper normalizes out the tile fill by sampling each
 * inner point as `(rgb - baseTileRgb)`, so a uniform tile yields an
 * all-zero fingerprint regardless of color. GREEN must draw a
 * per-item-type glyph (wheel, drivetrain, etc.) so the fingerprint
 * becomes non-zero and differs across recipes.
 * ----------------------------------------------------------------- */
test.describe('Group A — Per-item-type glyph drawn on the badge', () => {
  test('A1: badge has a glyph drawn at the tile center (center pixel differs from tile fill)', async ({
    mainMenu, toolbar, grid, machinePanel, recipeIcon,
  }) => {
    test.setTimeout(60000)

    await placeFabricatorAndAssembler({ mainMenu, toolbar, grid, machinePanel })

    const result = await recipeIcon.applyBuildPhaseRecipePreview(
      FAB_CELL.x, FAB_CELL.z, 'wheel_press_small',
    )
    expect(result.ok, `precondition: build-phase preview must succeed; ${result.reason ?? ''}`).toBe(true)
    await recipeIcon.forceSync()

    // (0.5, 0.5) lands at the glyph center; (0.18, 0.18) lands inside
    // the rounded-rect tile fill but well outside any centered glyph.
    const center = await recipeIcon.readGlyphSampleAt(FAB_CELL.x, FAB_CELL.z, 0.5, 0.5)
    const tileBase = await recipeIcon.readGlyphSampleAt(FAB_CELL.x, FAB_CELL.z, 0.18, 0.18)
    expect(center, 'badge texture must be sampleable at (0.5, 0.5)').not.toBeNull()
    expect(tileBase, 'badge texture must be sampleable at (0.18, 0.18)').not.toBeNull()

    const c = center!
    const t = tileBase!
    const delta = Math.abs(c.r - t.r) + Math.abs(c.g - t.g) + Math.abs(c.b - t.b)
    expect(
      delta,
      'GREEN: a per-item-type glyph MUST be drawn at the badge center. ' +
        `Current renderer fills the tile uniformly, so center==tile (delta=${delta}). ` +
        `Got center=rgb(${c.r},${c.g},${c.b}), tile=rgb(${t.r},${t.g},${t.b}).`,
    ).toBeGreaterThan(16)
  })

  test('A2: two recipes render visibly DIFFERENT glyph shapes (non-zero fingerprints that differ)', async ({
    mainMenu, toolbar, grid, machinePanel, recipeIcon,
  }) => {
    test.setTimeout(60000)

    await placeFabricatorAndAssembler({ mainMenu, toolbar, grid, machinePanel })

    const preview = await recipeIcon.applyBuildPhaseRecipePreviewMulti([
      { x: FAB_CELL.x, z: FAB_CELL.z, recipeId: 'wheel_press_small' },
      { x: ASSEMBLER_CELL.x, z: ASSEMBLER_CELL.z, recipeId: 'assemble_drivetrain_basic' },
    ])
    expect(preview.ok, `precondition: previews must succeed; ${preview.reason ?? ''}`).toBe(true)
    await recipeIcon.forceSync()

    const fpFab = await recipeIcon.readGlyphFingerprintAt(FAB_CELL.x, FAB_CELL.z)
    const fpAsm = await recipeIcon.readGlyphFingerprintAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)
    expect(fpFab, 'fabricator badge fingerprint must be readable').not.toBeNull()
    expect(fpAsm, 'assembler badge fingerprint must be readable').not.toBeNull()

    const sumAbs = (a: number[]) => a.reduce((s, v) => s + Math.abs(v), 0)
    expect(
      sumAbs(fpFab!),
      'GREEN: wheel_press_small badge must have a glyph (non-zero intra-badge variance). ' +
        `Got fingerprint=[${fpFab!.join(',')}] (uniform tile → all zeros).`,
    ).toBeGreaterThan(0)
    expect(
      sumAbs(fpAsm!),
      'GREEN: assemble_drivetrain_basic badge must have a glyph (non-zero intra-badge variance). ' +
        `Got fingerprint=[${fpAsm!.join(',')}] (uniform tile → all zeros).`,
    ).toBeGreaterThan(0)

    // Count how many of the 4 inner samples differ between the two
    // badges (each sample = 3 consecutive channel deltas).
    let differing = 0
    for (let i = 0; i < 4; i++) {
      const o = i * 3
      const dr = (fpFab![o] ?? 0) - (fpAsm![o] ?? 0)
      const dg = (fpFab![o + 1] ?? 0) - (fpAsm![o + 1] ?? 0)
      const db = (fpFab![o + 2] ?? 0) - (fpAsm![o + 2] ?? 0)
      if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) > 8) differing++
    }
    expect(
      differing,
      'GREEN: two different recipes (wheel_small vs drivetrain_basic) MUST render visually ' +
        `DIFFERENT glyph shapes; expected ≥2 of 4 inner samples to differ, got ${differing}. ` +
        `fpFab=[${fpFab!.join(',')}] fpAsm=[${fpAsm!.join(',')}]`,
    ).toBeGreaterThanOrEqual(2)
  })
})

/* -----------------------------------------------------------------
 * Group B — Static color from program + belt topology
 *
 * The badge color is derived from a static analysis that walks the
 * belt graph upstream of the machine's input slots and checks whether
 * every required input type can be produced by some configured
 * producer machine. It is computed at preview time (and on
 * topology/recipe change), NOT each tick.
 *
 * GREEN seam: `FactoryRenderer.getRecipeBadgeDependenciesSatisfied(id)`
 * returns `boolean`. Today it does not exist — `getDependenciesSatisfiedAt`
 * returns `null`, so every B-test fails at its dependency assertion
 * (and the colorHex assertion fails for B1/B2/B4 too).
 * ----------------------------------------------------------------- */
test.describe('Group B — Static color from program + belt topology', () => {
  test('B1: assembler with NO upstream fabricators → badge RED', async ({
    mainMenu, toolbar, grid, machinePanel, recipeIcon,
  }) => {
    test.setTimeout(60000)

    await placeFabricatorAndAssembler({ mainMenu, toolbar, grid, machinePanel })

    const preview = await recipeIcon.applyBuildPhaseRecipePreview(
      ASSEMBLER_CELL.x, ASSEMBLER_CELL.z, 'assemble_drivetrain_basic',
    )
    expect(preview.ok, `precondition: preview must succeed; ${preview.reason ?? ''}`).toBe(true)
    await recipeIcon.forceSync()

    const satisfied = await recipeIcon.getDependenciesSatisfiedAt(
      ASSEMBLER_CELL.x, ASSEMBLER_CELL.z,
    )
    expect(
      satisfied,
      'GREEN: FactoryRenderer.getRecipeBadgeDependenciesSatisfied must return false ' +
        'for an assembler with no upstream producers for wheel_small / circuit_basic. ' +
        `Got ${satisfied} (null → accessor not implemented).`,
    ).toBe(false)

    const state = await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)
    expect(state.exists).toBe(true)
    expect(
      state.colorHex,
      'GREEN: assemble_drivetrain_basic with NO upstream producer → badge MUST be RED. ' +
        `Got 0x${state.colorHex.toString(16)}.`,
    ).toBe(RED)
  })

  test('B2: only one of two required input types has an upstream producer → badge stays RED', async ({
    mainMenu, toolbar, grid, machinePanel, recipeIcon,
  }) => {
    test.setTimeout(60000)

    await placeFabricatorAndAssembler({ mainMenu, toolbar, grid, machinePanel })

    const preview = await recipeIcon.applyBuildPhaseRecipePreviewMulti([
      { x: ASSEMBLER_CELL.x, z: ASSEMBLER_CELL.z, recipeId: 'assemble_drivetrain_basic' },
      { x: FAB_CELL.x, z: FAB_CELL.z, recipeId: 'wheel_press_small' },
    ])
    expect(preview.ok, `precondition: previews must succeed; ${preview.reason ?? ''}`).toBe(true)

    expect(
      await recipeIcon.placeBeltDirect(FAB_CELL.x, FAB_CELL.z, ASSEMBLER_CELL.x, ASSEMBLER_CELL.z),
      'precondition: belt from wheel-fabricator to assembler must be placeable',
    ).toBe(true)

    await recipeIcon.forceSync()

    const satisfied = await recipeIcon.getDependenciesSatisfiedAt(
      ASSEMBLER_CELL.x, ASSEMBLER_CELL.z,
    )
    expect(
      satisfied,
      'GREEN: assembler needs BOTH wheel_small AND chassis_light/circuit_basic; with only ' +
        'a wheel producer connected, dependenciesSatisfied must be false. ' +
        `Got ${satisfied} (null → accessor not implemented).`,
    ).toBe(false)

    const state = await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)
    expect(
      state.colorHex,
      'GREEN: partial supply chain → badge MUST stay RED. ' +
        `Got 0x${state.colorHex.toString(16)}.`,
    ).toBe(RED)
  })

  test('B3: adding the missing upstream producer flips the badge to WHITE', async ({
    mainMenu, toolbar, grid, machinePanel, recipeIcon,
  }) => {
    test.setTimeout(60000)

    await placeFabricatorAndAssembler({ mainMenu, toolbar, grid, machinePanel })
    await placeChassisFabricator({ grid })

    const preview = await recipeIcon.applyBuildPhaseRecipePreviewMulti([
      { x: ASSEMBLER_CELL.x, z: ASSEMBLER_CELL.z, recipeId: 'assemble_drivetrain_basic' },
      { x: FAB_CELL.x, z: FAB_CELL.z, recipeId: 'wheel_press_small' },
      { x: CHASSIS_FAB_CELL.x, z: CHASSIS_FAB_CELL.z, recipeId: 'circuit_printer_basic' },
    ])
    expect(preview.ok, `precondition: previews must succeed; ${preview.reason ?? ''}`).toBe(true)

    expect(
      await recipeIcon.placeBeltDirect(FAB_CELL.x, FAB_CELL.z, ASSEMBLER_CELL.x, ASSEMBLER_CELL.z),
      'precondition: wheel-fabricator belt must be placeable',
    ).toBe(true)
    expect(
      await recipeIcon.placeBeltDirect(
        CHASSIS_FAB_CELL.x, CHASSIS_FAB_CELL.z, ASSEMBLER_CELL.x, ASSEMBLER_CELL.z,
      ),
      'precondition: chassis-fabricator belt must be placeable',
    ).toBe(true)

    await recipeIcon.forceSync()

    const satisfied = await recipeIcon.getDependenciesSatisfiedAt(
      ASSEMBLER_CELL.x, ASSEMBLER_CELL.z,
    )
    expect(
      satisfied,
      'GREEN: with wheel_press_small AND circuit_printer_basic upstream, dependenciesSatisfied ' +
        `must be true. Got ${satisfied} (null → accessor not implemented).`,
    ).toBe(true)

    const state = await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)
    expect(
      state.colorHex,
      'GREEN: all required input types have an upstream producer → badge MUST be WHITE. ' +
        `Got 0x${state.colorHex.toString(16)}.`,
    ).toBe(WHITE)
  })

  test('B4: removing a belt without changing the program flips the badge back to RED', async ({
    mainMenu, toolbar, grid, machinePanel, recipeIcon,
  }) => {
    test.setTimeout(60000)

    await placeFabricatorAndAssembler({ mainMenu, toolbar, grid, machinePanel })
    await placeChassisFabricator({ grid })

    const preview = await recipeIcon.applyBuildPhaseRecipePreviewMulti([
      { x: ASSEMBLER_CELL.x, z: ASSEMBLER_CELL.z, recipeId: 'assemble_drivetrain_basic' },
      { x: FAB_CELL.x, z: FAB_CELL.z, recipeId: 'wheel_press_small' },
      { x: CHASSIS_FAB_CELL.x, z: CHASSIS_FAB_CELL.z, recipeId: 'circuit_printer_basic' },
    ])
    expect(preview.ok, `precondition: previews must succeed; ${preview.reason ?? ''}`).toBe(true)

    expect(
      await recipeIcon.placeBeltDirect(FAB_CELL.x, FAB_CELL.z, ASSEMBLER_CELL.x, ASSEMBLER_CELL.z),
    ).toBe(true)
    expect(
      await recipeIcon.placeBeltDirect(
        CHASSIS_FAB_CELL.x, CHASSIS_FAB_CELL.z, ASSEMBLER_CELL.x, ASSEMBLER_CELL.z,
      ),
    ).toBe(true)
    await recipeIcon.forceSync()

    // Sanity precondition: with both belts in place we expect satisfied
    // (asserted in B3). Here we DELIBERATELY remove the chassis belts
    // and re-check — the badge must flip RED again without any program
    // change.
    const removed = await recipeIcon.removeBeltsTouchingCell(CHASSIS_FAB_CELL.x, CHASSIS_FAB_CELL.z)
    expect(removed, 'at least one belt touching the chassis fabricator must be removed').toBeGreaterThan(0)
    await recipeIcon.forceSync()

    const satisfied = await recipeIcon.getDependenciesSatisfiedAt(
      ASSEMBLER_CELL.x, ASSEMBLER_CELL.z,
    )
    expect(
      satisfied,
      'GREEN: after removing the chassis belt, dependenciesSatisfied must re-evaluate to false ' +
        `without any program change. Got ${satisfied} (null → accessor not implemented OR not re-run on topology change).`,
    ).toBe(false)

    const state = await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)
    expect(
      state.colorHex,
      'GREEN: topology change (belt removed) must flip the badge back to RED. ' +
        `Got 0x${state.colorHex.toString(16)}.`,
    ).toBe(RED)
  })
})

/* -----------------------------------------------------------------
 * Group C — Color is stable during a simulation run
 *
 * The badge color is set by the static analyzer, not by the per-tick
 * starvation counter. Once Start is pressed, the color must remain
 * whatever the analyzer decided, even if items have not yet arrived
 * at the input slots (C1) or even though the machine is permanently
 * starved (C2 — RED immediately at t=0, not after a grace window).
 * ----------------------------------------------------------------- */
test.describe('Group C — Color is stable during a simulation run', () => {
  test('C1: satisfied assembler stays WHITE for the entire run, even before items arrive', async ({
    mainMenu, toolbar, grid, machinePanel, recipeIcon,
  }) => {
    test.setTimeout(60000)

    await placeFabricatorAndAssembler({ mainMenu, toolbar, grid, machinePanel })
    await placeChassisFabricator({ grid })

    const preview = await recipeIcon.applyBuildPhaseRecipePreviewMulti([
      { x: ASSEMBLER_CELL.x, z: ASSEMBLER_CELL.z, recipeId: 'assemble_drivetrain_basic' },
      { x: FAB_CELL.x, z: FAB_CELL.z, recipeId: 'wheel_press_small' },
      { x: CHASSIS_FAB_CELL.x, z: CHASSIS_FAB_CELL.z, recipeId: 'circuit_printer_basic' },
    ])
    expect(preview.ok, `precondition: previews must succeed; ${preview.reason ?? ''}`).toBe(true)

    expect(
      await recipeIcon.placeBeltDirect(FAB_CELL.x, FAB_CELL.z, ASSEMBLER_CELL.x, ASSEMBLER_CELL.z),
    ).toBe(true)
    expect(
      await recipeIcon.placeBeltDirect(
        CHASSIS_FAB_CELL.x, CHASSIS_FAB_CELL.z, ASSEMBLER_CELL.x, ASSEMBLER_CELL.z,
      ),
    ).toBe(true)

    // Enable the assembler to mirror typical user play.
    expect(
      await recipeIcon.enableMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z),
      'precondition: assembler must be enabled',
    ).toBe(true)
    await recipeIcon.forceSync()

    await recipeIcon.startSimulation()

    // Sample at t≈0, then 0.5s, 1.5s, 3s of wall-clock run time.
    const t0 = (await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)).colorHex
    await new Promise((r) => setTimeout(r, 500))
    const tHalf = (await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)).colorHex
    await new Promise((r) => setTimeout(r, 1000))
    const tOneFive = (await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)).colorHex
    await new Promise((r) => setTimeout(r, 1500))
    const tThree = (await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)).colorHex

    const all = [t0, tHalf, tOneFive, tThree]
    const reds = all.filter((c) => c === RED).length
    expect(
      reds,
      'a statically-satisfied assembler must stay WHITE for the entire run; ' +
        `samples (hex) at t=0/0.5/1.5/3s: ${all.map((c) => '0x' + c.toString(16)).join(', ')}.`,
    ).toBe(0)
    for (const c of all) expect(c).toBe(WHITE)
  })

  test('C2: unsatisfied assembler is RED IMMEDIATELY at t=0 and stays RED (no grace window)', async ({
    mainMenu, toolbar, grid, machinePanel, recipeIcon,
  }) => {
    test.setTimeout(60000)

    await placeFabricatorAndAssembler({ mainMenu, toolbar, grid, machinePanel })

    const preview = await recipeIcon.applyBuildPhaseRecipePreview(
      ASSEMBLER_CELL.x, ASSEMBLER_CELL.z, 'assemble_drivetrain_basic',
    )
    expect(preview.ok, `precondition: preview must succeed; ${preview.reason ?? ''}`).toBe(true)
    await recipeIcon.forceSync()

    // Build-phase preview alone must already yield RED based on the
    // static analyzer (no upstream producers configured).
    const beforeStart = await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)
    expect(
      beforeStart.colorHex,
      'build-phase preview must yield RED for an assembler with no upstream producers; ' +
        `got 0x${beforeStart.colorHex.toString(16)}.`,
    ).toBe(RED)

    await recipeIcon.startSimulation()

    const t0 = (await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)).colorHex
    expect(
      t0,
      `at t≈0 after pressing Start the badge must already be RED; observed 0x${t0.toString(16)}.`,
    ).toBe(RED)

    await new Promise((r) => setTimeout(r, 500))
    const tHalf = (await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)).colorHex
    await new Promise((r) => setTimeout(r, 1000))
    const tOneFive = (await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)).colorHex
    await new Promise((r) => setTimeout(r, 1500))
    const tThree = (await recipeIcon.readForMachineAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z)).colorHex

    for (const c of [tHalf, tOneFive, tThree]) {
      expect(
        c,
        `GREEN: unsatisfied assembler must stay RED for the entire run; observed 0x${c.toString(16)}.`,
      ).toBe(RED)
    }
  })
})
