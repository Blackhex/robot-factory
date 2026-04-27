/**
 * @vitest-environment jsdom
 *
 * Pins the contract: belt chevron textures must STOP scrolling whenever
 * the simulation is paused (or otherwise not running).
 *
 * Contract:
 *   - `BeltMeshRenderer.tickChevronScroll(dt: number, paused: boolean)`
 *     advances the chevron UV offset by `BELT_SCROLL_SPEED * dt` ONLY
 *     when `paused === false`.
 *   - When `paused === true`, the call must be a no-op for the offset:
 *     the chevron texture must remain frozen on the belt mesh, mirroring
 *     the fact that items on belts are also frozen while paused.
 *   - The flag flows from `main.ts` rAF → `FactoryRenderer.tick(dt, paused)`
 *     → `BeltMeshRenderer.tickChevronScroll(dt, paused)`. This mirrors the
 *     existing `ItemRenderer.update(..., dt, paused)` pattern.
 *
 * Visual symptom this guards against:
 *   While the player has paused the simulation, items on belts stop
 *   moving but the chevron arrows continue scrolling — a clear visual
 *   inconsistency that contradicts the "everything is frozen" expectation.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { installJsdomCanvasMock } from './jsdomCanvasMock'
import { makeChevronHarness } from './beltChevronTestHelpers'

// ── Mock canvas 2D context (jsdom has no real canvas implementation) ──
beforeAll(installJsdomCanvasMock)

const FRAMES_PER_SECOND = 60
const FROZEN_EPSILON = 1e-9            // offset must be byte-for-byte unchanged
const ONE_SECOND_DELTA = 1.0           // BELT_SCROLL_SPEED * 1.0s
const RESUME_TOLERANCE = 0.001         // tight: only the unpaused window contributes

describe('BeltMeshRenderer — chevron texture freezes while paused', () => {
  it('does not advance chevron offset while paused', () => {
    // GIVEN — a fresh belt-chevron harness exposing the per-belt cell mat.
    const { renderer, cellMat } = makeChevronHarness()
    const offsetBefore = cellMat.map!.offset.x

    // WHEN — 60 frames at 1/60s elapse with paused = true.
    for (let f = 0; f < FRAMES_PER_SECOND; f++) {
      renderer.tickChevronScroll(1 / 60, true)
    }
    const offsetAfter = cellMat.map!.offset.x
    const deltaUnsigned = Math.abs(offsetAfter - offsetBefore)

    // THEN — the offset must not have moved at all. Items are stationary
    // when paused; chevrons must be too.
    expect(
      deltaUnsigned,
      `When simulation is paused, chevron texture must remain stationary; ` +
      `observed |Δoffset.x| = ${deltaUnsigned.toFixed(6)} after 60 paused frames ` +
      `at dt = 1/60s. Expected 0 (within ${FROZEN_EPSILON}). ` +
      `If this is ≈ 1.0, tickChevronScroll() is ignoring the paused flag and ` +
      `still advancing the chevron UV while items on belts are frozen.`,
    ).toBeLessThan(FROZEN_EPSILON)

    renderer.dispose()
  })

  it('resumes chevron advance when unpaused (paused → unpaused → paused)', () => {
    // GIVEN — a fresh harness.
    const { renderer, cellMat } = makeChevronHarness()
    const offsetBefore = cellMat.map!.offset.x
    // Bind `this` so we can hold a local reference.
    const tick = renderer.tickChevronScroll.bind(renderer)

    // WHEN — three windows of 1 simulated second each:
    //   1) 60 frames paused          → must contribute 0
    //   2) 60 frames unpaused        → must contribute ≈ 1.0
    //   3) 60 frames paused          → must contribute 0
    for (let f = 0; f < FRAMES_PER_SECOND; f++) tick(1 / 60, true)
    for (let f = 0; f < FRAMES_PER_SECOND; f++) tick(1 / 60, false)
    for (let f = 0; f < FRAMES_PER_SECOND; f++) tick(1 / 60, true)

    const offsetAfter = cellMat.map!.offset.x
    const deltaUnsigned = Math.abs(offsetAfter - offsetBefore)

    // THEN — only the middle (unpaused) window contributed. Total advance
    // must equal 1.0 UV units, proving (a) pause freezes, (b) unpause
    // resumes correctly, (c) re-pausing freezes again.
    expect(
      deltaUnsigned,
      `Pause → resume → pause cycle must advance chevron only during the ` +
      `unpaused window. Expected |Δoffset.x| = ${ONE_SECOND_DELTA.toFixed(3)} ` +
      `± ${RESUME_TOLERANCE} (one second of unpaused scroll), observed ` +
      `${deltaUnsigned.toFixed(6)}. ` +
      `If this is ≈ 3.0, paused is being ignored. If ≈ 0.0, unpause is ` +
      `failing to resume the scroll.`,
    ).toBeGreaterThan(ONE_SECOND_DELTA - RESUME_TOLERANCE)
    expect(deltaUnsigned).toBeLessThan(ONE_SECOND_DELTA + RESUME_TOLERANCE)

    renderer.dispose()
  })

  it('single paused tick is a no-op even with large dt', () => {
    // GIVEN — a fresh harness.
    const { renderer, cellMat } = makeChevronHarness()
    const offsetBefore = cellMat.map!.offset.x

    // WHEN — a single tick of 1.0 seconds elapses with paused = true.
    // This guards against the implementation accidentally short-circuiting
    // only the per-frame increment (e.g. multiplying dt by 0 only when
    // paused AND dt is small) — a 1.0s paused tick must still freeze.
    renderer.tickChevronScroll(1.0, true)

    const offsetAfter = cellMat.map!.offset.x
    const deltaUnsigned = Math.abs(offsetAfter - offsetBefore)

    // THEN — the offset must not have moved.
    expect(
      deltaUnsigned,
      `A single tickChevronScroll(1.0, paused=true) must be a no-op for the ` +
      `chevron offset; observed |Δoffset.x| = ${deltaUnsigned.toFixed(6)}. ` +
      `If this is ≈ 1.0, the paused argument is being ignored entirely. ` +
      `Guards against partial-application bugs where pause works for small ` +
      `dt values but not large ones.`,
    ).toBeLessThan(FROZEN_EPSILON)

    renderer.dispose()
  })
})
