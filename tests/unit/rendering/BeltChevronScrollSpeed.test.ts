/**
 * @vitest-environment jsdom
 *
 * Pins the belt chevron texture scroll speed to the actual parts (item)
 * speed on a belt at the default belt speed.
 *
 * Contract:
 *   - A belt at default speed `1.0` advances items at 1.0 cell per second
 *     (1 world unit per second). See src/game/ConveyorBelt.ts and the
 *     "Uniform cell traversal time" section of DESIGN.md.
 *   - `createBeltDirectionMaterial` sets the chevron texture's
 *     `repeat = (1, 1)` and the straight belt cell mesh is a unit-length
 *     `BoxGeometry(1, 0.05, 1)`. Therefore one full UV cycle of the
 *     chevron texture spans exactly one belt cell along the flow axis,
 *     i.e. 1 UV unit on `map.offset.x` corresponds to exactly 1 world
 *     unit / 1 cell of belt travel.
 *   - `BeltMeshRenderer.tickChevronScroll(dt: number, paused: boolean)`
 *     accepts the elapsed real time in seconds since the previous call.
 *     `BELT_SCROLL_SPEED = 1.0` means 1.0 UV units per real second. This
 *     test pins the unpaused (`paused = false`) advance contract; see
 *     BeltChevronPause.test.ts for the paused freeze contract.
 *
 * Therefore: over 1 simulated second of real wall-clock time, |Δoffset.x|
 * on the east direction material MUST equal the default belt speed of
 * 1.0 (UV units / sec).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { installJsdomCanvasMock } from './jsdomCanvasMock'
import { makeChevronHarness } from './beltChevronTestHelpers'

// ── Mock canvas 2D context (jsdom has no real canvas implementation) ──
beforeAll(installJsdomCanvasMock)

const DEFAULT_BELT_SPEED = 1.0       // cells/sec (== world units/sec)
const FRAMES_PER_SECOND = 60          // matches BeltMeshRenderer's hardcoded dt = 1/60
const TOLERANCE = 0.02                // ±0.02 UV units

describe('BeltMeshRenderer — chevron UV scroll speed matches parts speed', () => {
  it('advances east-direction map.offset.x by 1.0 UV units per simulated second (= default belt speed)', () => {
    // GIVEN — a factory with a straight east-flowing belt at default speed 1.0.
    const { renderer, beltMeshes, cellMat } = makeChevronHarness()

    // WHEN — tickChevronScroll() is called 60 times to simulate exactly 1 second.
    expect(beltMeshes.size).toBeGreaterThan(0)

    // Sanity check: 1 UV cycle == 1 cell because repeat = (1, 1).
    expect(cellMat.map!.repeat.x).toBeCloseTo(1, 6)

    const offsetBefore = cellMat.map!.offset.x
    // 60 frames at 1/60s each = 1.0s of real time. Pass `getSpeed = () => 1`
    // so the per-belt cloned material on the cell mesh advances at the
    // contract default of 1.0 UV/sec (this is the speed actually applied
    // when sim's belt speed is 1.0; see ConveyorBelt.getBeltSpeedByLogicalId).
    for (let f = 0; f < FRAMES_PER_SECOND; f++) {
      renderer.tickChevronScroll(1 / 60, false, () => 1)
    }
    const offsetAfter = cellMat.map!.offset.x

    // |Δoffset.x| over 1 simulated second; sign is implementation-defined
    // (the renderer scrolls the texture in the opposite direction of UV
    // so the chevrons appear to travel WITH the items), so we compare
    // unsigned magnitude against the speed magnitude.
    const deltaUnsigned = Math.abs(offsetAfter - offsetBefore)

    // THEN — chevron scroll speed (UV/sec) must equal default belt speed
    // (cells/sec == world units/sec) since 1 UV unit = 1 cell.
    expect(
      deltaUnsigned,
      `Chevron UV scroll over 1 simulated second must equal the default belt ` +
      `speed of ${DEFAULT_BELT_SPEED} UV units/sec (1 UV cycle = 1 cell because ` +
      `texture repeat = (1,1) and the cell mesh is unit-length). ` +
      `Observed |Δoffset.x| = ${deltaUnsigned.toFixed(6)}, expected ` +
      `${DEFAULT_BELT_SPEED.toFixed(2)} ± ${TOLERANCE}. ` +
      `If this is ≈ 0.3, BELT_SCROLL_SPEED in BeltMeshRenderer is wrong: ` +
      `chevrons are scrolling at ~30% of the actual parts speed.`,
    ).toBeGreaterThan(DEFAULT_BELT_SPEED - TOLERANCE)
    expect(deltaUnsigned).toBeLessThan(DEFAULT_BELT_SPEED + TOLERANCE)

    renderer.dispose()
  })
})
