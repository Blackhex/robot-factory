import { test, expect, clearStorageBeforeEach } from './pom'

// Wide viewport so the toolbar + Projects panel + canvas all have room.
test.use({ viewport: { width: 1920, height: 1080 } })

const TEST_TIMEOUT_MS = 180_000
const DELIVERY_TIMEOUT_MS = 90_000

/**
 * RED — End-to-end proof that the bundled `projects/Assembly.json`
 * sandbox project routes defective items to the Recycler and valid
 * items to the Shipper (factory_output).
 *
 * The player program inside the fixture wires the splitter (Machine.E,
 * north-rotated) as:
 *
 *   onItemArrives(Machine.E):
 *     if (defective) routeCurrentItemTo(Machine.E, SplitterOutputs.Right)
 *     else           routeCurrentItemTo(Machine.E, SplitterOutputs.Forward)
 *
 * The splitter's Recycler is physically east of the splitter
 * (Recycler at (12, 6), Splitter at (9, 6)), wired via the save's
 * existing Recycler belt.
 *
 * Under the CURRENT broken engine convention, `Right` for a
 * north-rotated splitter maps to WEST (no belt). Defective items
 * therefore have nowhere to go and pile up inside the splitter's
 * right output slot, wedging the machine into a permanent `blocked`
 * state and starving the Recycler. Even valid items eventually stall
 * because the assembler upstream stops being drained once the
 * splitter blocks.
 *
 * After the GREEN fix (input-observer-relative left/right), `Right`
 * on a north-rotated splitter correctly maps to EAST → Recycler,
 * and the save's `sourceSlot: 'left'` on the Recycler belt is
 * migrated to `'right'` at load time.
 */
test.describe('Sandbox — Assembly.json defective routing', () => {
  clearStorageBeforeEach()

  test('Assembly.json routes defective to Recycler and valid to Shipper', async ({
    mainMenu, toolbar, tutorial, projectsPanel, probe, hud, pxt,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)

    // Read the bundled Assembly fixture from disk (Node-side I/O, not
    // a runtime page evaluation).
    const fs = await import('node:fs')
    const path = await import('node:path')
    const fixturePath = path.resolve(process.cwd(), 'projects', 'Assembly.json')
    const fixtureContent = fs.readFileSync(fixturePath, 'utf8')

    // -------- Enter sandbox & load the bundled project ---------------------
    await mainMenu.enterSandbox(toolbar, tutorial)
    await toolbar.waitForCameraSettle()

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.importBundleFromString('Assembly.json', fixtureContent)
    await projectsPanel.expectSlotPresent('Assembly')
    await projectsPanel.doubleClickSlot('Assembly')

    // Close the panel so the toolbar Start button is unobstructed.
    await toolbar.clickProjects()
    await projectsPanel.expectClosed()

    // Open the PXT editor so the imported workspace XML is compiled
    // into runnable script. After `doubleClickSlot` loads a bundled
    // project, PXT keeps the bundled `main.ts` as-is and does NOT
    // re-compile from `main.blocks` on its own — so the simulation's
    // interpreter would otherwise parse a stale/empty source and
    // never register the splitter's `onItemArrives` handler.
    // `compileBlocksToTs` triggers the blocks → TS pipeline and
    // resolves once the recompiled source contains the handler call.
    await pxt.openAndWaitForBlockly()
    await pxt.waitForPxtReady()
    await pxt.waitForPxtBootstrapSettled()
    await pxt.compileBlocksToTs({
      blocksMustContain: ['factory_on_item_arrives'],
      tsMustContain: [
        'events.onItemArrives(machines.pickMachine(Machine.E)',
        'routeCurrentItemTo',
      ],
    })

    // Sanity: the project's grid + belts + Splitter, Recycler and
    // factory_output (Shipper) machines are all present after load.
    const machines = await probe.getMachines()
    const splitter = machines.find((m) => m.type === 'splitter')
    const recycler = machines.find((m) => m.type === 'recycler')
    const shipper = machines.find((m) => m.type === 'factory_output')
    expect(splitter, 'Assembly.json must load with a splitter').toBeTruthy()
    expect(recycler, 'Assembly.json must load with a recycler').toBeTruthy()
    expect(shipper, 'Assembly.json must load with a factory_output (Shipper)').toBeTruthy()

    // -------- Start the simulation ----------------------------------------
    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()
    await hud.expectVisible()

    // -------- Assertion (A): Recycler receives at least one defective ----
    // The Assembly fixture has no belt leaving the Recycler at (12, 6),
    // so any `raw_material` the Recycler produces parks in its output
    // slot permanently. The Recycler emits exactly one `raw_material`
    // per defective item it processes, so observing `outputSlotType ===
    // 'raw_material'` is a strict, persistent witness that at least one
    // defective item was consumed. Under the broken convention,
    // defectives route to the splitter's empty Right slot and never
    // reach the Recycler — `outputSlotType` therefore stays null.
    await expect.poll(
      async () => {
        const snap = await probe.readDiagnosticSnapshot()
        const r = snap.machines.find(
          (m: { id: string }) => m.id === recycler!.id,
        ) as { outputSlotType?: string | null; inputSlotsCount?: number; state?: string } | undefined
        const recycled =
          r?.outputSlotType === 'raw_material' ||
          (r?.inputSlotsCount ?? 0) > 0 ||
          r?.state === 'processing'
        return recycled ? 1 : 0
      },
      {
        message:
          'Recycler must process at least one defective item. Today `Right` ' +
          'for a north-rotated splitter maps to WEST (no belt), so defectives ' +
          'pile up in the splitter and never reach the Recycler at (12, 6).',
        timeout: DELIVERY_TIMEOUT_MS,
        intervals: [100],
      },
    ).toBeGreaterThanOrEqual(1)

    // -------- Assertion (B): Shipper delivers at least one valid assembly -
    // outputsDelivered is the simulation-wide counter of factory_output
    // deliveries. Even if a few early valid items slip through Forward
    // before the splitter wedges, the chain stalls completely once the
    // upstream assembler can no longer drain into the blocked splitter.
    await expect.poll(
      async () => {
        const snap = await probe.readDiagnosticSnapshot()
        return Number(snap.outputsDelivered ?? 0)
      },
      {
        message:
          'Shipper (factory_output) must deliver at least one valid ' +
          'assembly. With defective routing broken, the splitter blocks ' +
          'and the assembly chain stalls, so deliveries plateau at 0.',
        timeout: DELIVERY_TIMEOUT_MS,
        intervals: [500],
      },
    ).toBeGreaterThanOrEqual(1)

    // Note: a third assertion "splitter is not permanently blocked at end of run"
    // is intentionally omitted. The fixture has no exit belt from the Recycler,
    // so back-pressure will eventually wedge the splitter even under correct
    // routing — that's a property of the fixture, not the routing fix. The
    // Recycler-consumes-defective assertion above is the actual proof that
    // `Right` on the north-rotated splitter now maps to the east wedge per
    // the input-observer convention.
  })

  // Strict per-item routing invariant. Captures every drivetrain the
  // Assembler emits along with its `isDefective` flag, then waits until
  // every produced item has reached a terminal (Shipper, Recycler, or
  // discarded-at-Shipper) and asserts strict equality on the counts:
  //
  //   - EVERY valid drivetrain reached the Shipper (factory_output).
  //   - EVERY defective drivetrain reached the Recycler.
  //   - NO defective drivetrain leaked to the Shipper (discarded == 0).
  //   - Shipper.consumedItems == validCount (cross-check via snapshot).
  //
  // The previous broken `populateSimulation()` registered every output
  // belt on the splitter's `'primary'` port, so `routeCurrentItemTo`
  // could not separate defective from valid by side. Under that bug,
  // either defectives surface as `item_discarded` at the Shipper or the
  // recycler-arrival count drops below the captured defective count.
  // Either way, the strict-equality assertions below fail.
  test('Assembly.json — strict per-item routing: every valid → Shipper, every defective → Recycler', async ({
    mainMenu, toolbar, tutorial, projectsPanel, probe, hud, pxt,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)

    const fs = await import('node:fs')
    const path = await import('node:path')
    const fixturePath = path.resolve(process.cwd(), 'projects', 'Assembly.json')
    const fixtureContent = fs.readFileSync(fixturePath, 'utf8')

    await mainMenu.enterSandbox(toolbar, tutorial)
    await toolbar.waitForCameraSettle()

    await toolbar.clickProjects()
    await projectsPanel.expectOpen()
    await projectsPanel.importBundleFromString('Assembly.json', fixtureContent)
    await projectsPanel.expectSlotPresent('Assembly')
    await projectsPanel.doubleClickSlot('Assembly')

    await toolbar.clickProjects()
    await projectsPanel.expectClosed()

    await pxt.openAndWaitForBlockly()
    await pxt.waitForPxtReady()
    await pxt.waitForPxtBootstrapSettled()
    await pxt.compileBlocksToTs({
      blocksMustContain: ['factory_on_item_arrives'],
      tsMustContain: [
        'events.onItemArrives(machines.pickMachine(Machine.E)',
        'routeCurrentItemTo',
      ],
    })

    // Resolve terminal + producer machine ids from the live factory.
    const machines = await probe.getMachines()
    const assembler = machines.find((m) => m.type === 'assembler')
    const splitter = machines.find((m) => m.type === 'splitter')
    const recycler = machines.find((m) => m.type === 'recycler')
    const shipper = machines.find((m) => m.type === 'factory_output')
    expect(assembler, 'Assembly.json must load with an assembler').toBeTruthy()
    expect(splitter, 'Assembly.json must load with a splitter').toBeTruthy()
    expect(recycler, 'Assembly.json must load with a recycler').toBeTruthy()
    expect(shipper, 'Assembly.json must load with a factory_output (Shipper)').toBeTruthy()
    const assemblerId = assembler!.id
    const recyclerId = recycler!.id
    const shipperId = shipper!.id

    // Install the routing recorder BEFORE clicking Start so we capture
    // the first emission as soon as the assembler produces.
    await probe.startRoutingRecording(assemblerId)

    await toolbar.expectStartButtonVisible()
    await toolbar.clickStart()
    await hud.expectVisible()

    // Stage 1: run until the Assembler has produced a representative
    // mix — at least MIN_PRODUCED items overall AND at least
    // MIN_DEFECTIVE defective items. The Assembly fixture's Assembler
    // runs at speed=3, giving roughly a 14% defect rate (propagation
    // from fabricators plus the speed-3 roll). Cap at MAX_PRODUCED so
    // a freak streak of zero defectives doesn't deadlock the test;
    // at MAX_PRODUCED=80 the probability of zero defectives is < 0.1%.
    const MIN_PRODUCED = 15
    const MIN_DEFECTIVE = 2
    const MAX_PRODUCED = 80
    await expect.poll(
      async () => {
        const snap = await probe.readRoutingSnapshot()
        const defective = snap.produced.filter((p) => p.isDefective).length
        return snap.produced.length >= MAX_PRODUCED
          ? 1
          : snap.produced.length >= MIN_PRODUCED && defective >= MIN_DEFECTIVE
            ? 1
            : 0
      },
      {
        message:
          `Assembler must produce >= ${MIN_PRODUCED} drivetrains and ` +
          `>= ${MIN_DEFECTIVE} defectives (or hit the ${MAX_PRODUCED} ` +
          'safety cap).',
        timeout: 120_000,
        intervals: [250],
      },
    ).toBe(1)

    // Snapshot the produced set NOW and only wait for THOSE ids to
    // terminate. The assembler keeps producing during stage 2; if we
    // re-read produced.length each poll, back-pressure on the
    // Recycler/Shipper drain rate ensures pending never reaches 0.
    const stage1Snap = await probe.readRoutingSnapshot()
    const targetIds = new Set(stage1Snap.produced.map((p) => p.itemId))

    // Stage 2: wait until every item produced by stage 1 has reached a
    // terminal — delivered to Recycler, delivered to Shipper, or
    // discarded at the Shipper dock (defective-at-output rejection).
    await expect.poll(
      async () => {
        const snap = await probe.readRoutingSnapshot()
        const terminalIds = new Set<string>()
        for (const d of snap.delivered) {
          if (d.machineId === recyclerId || d.machineId === shipperId) {
            terminalIds.add(d.itemId)
          }
        }
        for (const d of snap.discarded) terminalIds.add(d.itemId)
        let pending = 0
        for (const id of targetIds) if (!terminalIds.has(id)) pending++
        return pending
      },
      {
        message:
          'All Assembler-produced items must reach a terminal (Recycler, ' +
          'Shipper, or discarded). If the splitter is wedged because a ' +
          'side has no belt registered, items pile up on the splitter or ' +
          'on the east belt and never terminate.',
        timeout: 120_000,
        intervals: [500],
      },
    ).toBe(0)

    // Read the final routing snapshot. All strict-equality assertions
    // below are scoped to the stage-1 target set (targetIds), because
    // the assembler keeps producing during stage 2.
    const snap = await probe.readRoutingSnapshot()

    const targetProduced = snap.produced.filter((p) => targetIds.has(p.itemId))
    const validProduced = targetProduced.filter((p) => !p.isDefective)
    const defectiveProduced = targetProduced.filter((p) => p.isDefective)
    const validIds = new Set(validProduced.map((p) => p.itemId))
    const defectiveIds = new Set(defectiveProduced.map((p) => p.itemId))

    // The Shipper must deliver EXACTLY every valid drivetrain in the
    // target set — no more, no less. A swap would either drop the
    // count (defective routed to recycler-only path while valid stayed
    // home) or add discards.
    const deliveredToShipperIds = new Set(
      snap.delivered
        .filter((d) => d.machineId === shipperId && targetIds.has(d.itemId))
        .map((d) => d.itemId),
    )
    expect(
      deliveredToShipperIds.size,
      `Shipper deliveries (target subset) should equal valid produced ` +
      `(${validProduced.length}). Observed: ${deliveredToShipperIds.size}. ` +
      `Target produced ${targetProduced.length} total, ` +
      `${defectiveProduced.length} defective.`,
    ).toBe(validProduced.length)
    for (const id of deliveredToShipperIds) {
      expect(
        validIds.has(id),
        `Item ${id} delivered to Shipper must be in the valid-produced set ` +
        '(a defective delivered to Shipper would be discarded, not delivered, ' +
        'so this catches a fundamentally wrong-id routing path).',
      ).toBe(true)
    }

    // The Recycler must receive EXACTLY every defective drivetrain in
    // the target set.
    const deliveredToRecyclerIds = new Set(
      snap.delivered
        .filter((d) => d.machineId === recyclerId && targetIds.has(d.itemId))
        .map((d) => d.itemId),
    )
    expect(
      deliveredToRecyclerIds.size,
      `Recycler deliveries (target subset) should equal defective produced ` +
      `(${defectiveProduced.length}). Observed: ${deliveredToRecyclerIds.size}.`,
    ).toBe(defectiveProduced.length)
    for (const id of deliveredToRecyclerIds) {
      expect(
        defectiveIds.has(id),
        `Item ${id} delivered to Recycler must be in the defective-produced set. ` +
        'A valid item arriving at the Recycler proves the splitter routed by ' +
        'the wrong port mapping.',
      ).toBe(true)
    }

    // No defective from the target set may leak to the Shipper — under
    // the broken code path that routed every belt to `'primary'`,
    // defectives could ride the primary belt to the Shipper and end
    // up as discards.
    const targetDiscarded = snap.discarded.filter((d) => targetIds.has(d.itemId))
    expect(
      targetDiscarded.length,
      `No item_discarded events expected for target items. ` +
      `Discards (${targetDiscarded.length}) mean defective items were ` +
      'delivered to the Shipper and rejected at the dock — i.e. the ' +
      'splitter routed defectives down the Shipper path.',
    ).toBe(0)
  })
})
