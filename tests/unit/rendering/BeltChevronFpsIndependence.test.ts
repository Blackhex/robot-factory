/**
 * @vitest-environment jsdom
 *
 * Pins the belt chevron animation to be FPS-independent.
 *
 * Contract:
 *   - `BeltMeshRenderer.tickChevronScroll(dt: number, paused: boolean)` accepts
 *     the elapsed real time in seconds since the previous call. This test pins
 *     the unpaused (`paused = false`) advance contract; see BeltChevronPause.test.ts
 *     for the paused freeze contract.
 *   - `BELT_SCROLL_SPEED = 1.0` means the chevron UV offset advances by
 *     1.0 UV units per ONE REAL SECOND, regardless of how many
 *     `tickChevronScroll()` calls are made in that second.
 *
 * Therefore, the four scenarios below — all representing exactly 1 second
 * of real wall-clock time — MUST produce the same |Δoffset.x| ≈ 1.0:
 *
 *   A) 60  calls × dt = 1/60   (60Hz render)
 *   B) 144 calls × dt = 1/144  (144Hz render)
 *   C) 30  calls × dt = 1/30   (30Hz render)
 *   D) 1   call  × dt = 1.0    (degenerate one-shot)
 *
 * Historical note: this test was originally written to fail against an
 * older `animate()` API that ignored its argument and hardcoded
 * `dt = 1/60` internally. The renamed `tickChevronScroll(dt)` honors
 * its argument, so all four scenarios now agree on 1.0 UV/second.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { installJsdomCanvasMock } from './jsdomCanvasMock'
import { makeChevronHarness } from './beltChevronTestHelpers'

// ── Mock canvas 2D context (jsdom has no real canvas implementation) ──
beforeAll(installJsdomCanvasMock)

const EXPECTED_DELTA_PER_SECOND = 1.0  // BELT_SCROLL_SPEED in UV units / real second
const TOLERANCE = 0.001                // ±0.001 UV units — tight, FPS-independence is exact

/**
 * Drive the renderer for `frames` calls of `dt` seconds each and return
 * the unsigned UV offset delta on the east material.
 *
 * Each scenario gets its own renderer so offsets do not leak between
 * measurements.
 */
function measureDelta(frames: number, dt: number): number {
  const { renderer, cellMat } = makeChevronHarness()
  expect(cellMat.map!.repeat.x).toBeCloseTo(1, 6)
  const before = cellMat.map!.offset.x
  // `bind(renderer)` preserves `this` since we hold a local reference.
  const tick = renderer.tickChevronScroll.bind(renderer)
  for (let f = 0; f < frames; f++) {
    tick(dt, false)
  }
  const after = cellMat.map!.offset.x
  renderer.dispose()
  return Math.abs(after - before)
}

describe('BeltMeshRenderer — chevron animation is FPS-independent', () => {
  it('advances by exactly BELT_SCROLL_SPEED * 1.0 UV units per real second regardless of frame rate', () => {
    // GIVEN — four scenarios, each representing exactly 1.0 real seconds.
    const delta_60fps   = measureDelta(60,  1 / 60)   // A: 60Hz
    const delta_144fps  = measureDelta(144, 1 / 144)  // B: 144Hz
    const delta_30fps   = measureDelta(30,  1 / 30)   // C: 30Hz
    const delta_oneShot = measureDelta(1,   1.0)      // D: one-shot

    const report =
      `FPS-independence contract: tickChevronScroll(dt) must scroll the chevron ` +
      `UV by BELT_SCROLL_SPEED * dt per call, so 1.0 real second of total dt ` +
      `must always advance the offset by ${EXPECTED_DELTA_PER_SECOND.toFixed(3)} ` +
      `UV units, regardless of how many calls subdivide that second.\n` +
      `Observed (expected ${EXPECTED_DELTA_PER_SECOND.toFixed(3)} ± ${TOLERANCE}):\n` +
      `  A) 60  × 1/60   = ${delta_60fps.toFixed(6)}\n` +
      `  B) 144 × 1/144  = ${delta_144fps.toFixed(6)}\n` +
      `  C) 30  × 1/30   = ${delta_30fps.toFixed(6)}\n` +
      `  D) 1   × 1.0    = ${delta_oneShot.toFixed(6)}\n` +
      `If B ≈ 2.4, C ≈ 0.5 and D ≈ 0.0167, tickChevronScroll() is ignoring its ` +
      `dt argument and using a hardcoded 1/60 — chevron speed scales with FPS.`

    // THEN — every scenario must agree on 1.0 UV / second within tolerance.
    expect(delta_60fps,   report).toBeGreaterThan(EXPECTED_DELTA_PER_SECOND - TOLERANCE)
    expect(delta_60fps,   report).toBeLessThan(EXPECTED_DELTA_PER_SECOND + TOLERANCE)
    expect(delta_144fps,  report).toBeGreaterThan(EXPECTED_DELTA_PER_SECOND - TOLERANCE)
    expect(delta_144fps,  report).toBeLessThan(EXPECTED_DELTA_PER_SECOND + TOLERANCE)
    expect(delta_30fps,   report).toBeGreaterThan(EXPECTED_DELTA_PER_SECOND - TOLERANCE)
    expect(delta_30fps,   report).toBeLessThan(EXPECTED_DELTA_PER_SECOND + TOLERANCE)
    expect(delta_oneShot, report).toBeGreaterThan(EXPECTED_DELTA_PER_SECOND - TOLERANCE)
    expect(delta_oneShot, report).toBeLessThan(EXPECTED_DELTA_PER_SECOND + TOLERANCE)
  })
})
