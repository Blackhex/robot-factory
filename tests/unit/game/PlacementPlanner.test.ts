import { describe, it, expect, beforeEach } from 'vitest'
import { Factory } from '../../../src/game/Factory'
import { getSlotPositions, rotationToFace, slotPositionToOffset } from '../../../src/game/SlotUtils'
import { expectFactoryState, renderGrid } from '../helpers/factoryAssert'

function assertBeltSlotInvariant(factory: Factory): void {
  for (const belt of factory.getBelts()) {
    if (belt.path.length < 2) continue
    const srcOff = { x: belt.path[1].x - belt.path[0].x, z: belt.path[1].z - belt.path[0].z }
    const srcSlots = getSlotPositions(belt.sourceMachine.type)
    const srcOutputOffsets = srcSlots.outputs.map(p => slotPositionToOffset(p, belt.sourceMachine.rotation))
    const srcValid = srcOutputOffsets.some(o => o.x === srcOff.x && o.z === srcOff.z)
    expect(srcValid,
      `BELT-SLOT VIOLATION: Belt ${belt.id} exits source ${belt.sourceMachine.type}(${belt.sourceMachine.x},${belt.sourceMachine.z}) rotation=${belt.sourceMachine.rotation} in direction (${srcOff.x},${srcOff.z}) — valid: ${JSON.stringify(srcOutputOffsets)}`,
    ).toBe(true)
    const n = belt.path.length
    const dstOff = { x: belt.path[n - 2].x - belt.path[n - 1].x, z: belt.path[n - 2].z - belt.path[n - 1].z }
    const dstSlots = getSlotPositions(belt.destinationMachine.type)
    const dstInputOffsets = dstSlots.inputs.map(p => slotPositionToOffset(p, belt.destinationMachine.rotation))
    const dstValid = dstInputOffsets.some(o => o.x === dstOff.x && o.z === dstOff.z)
    expect(dstValid,
      `BELT-SLOT VIOLATION: Belt ${belt.id} enters destination ${belt.destinationMachine.type}(${belt.destinationMachine.x},${belt.destinationMachine.z}) rotation=${belt.destinationMachine.rotation} from direction (${dstOff.x},${dstOff.z}) — valid: ${JSON.stringify(dstInputOffsets)}`,
    ).toBe(true)
  }
}

/**
 * Tests for the contract that, when the SOURCE machine of a belt placement is
 * UNCONNECTED (no existing belts), the planner must try ALL 4 candidate
 * rotations of the source machine and pick the one that yields a valid
 * (non-colliding) belt placement. The current implementation only derives a
 * single source rotation from the initial unconstrained trial path (or the
 * existing rotation, when `sourceSlotPosition` is supplied), which causes
 * placements to fail even when rotating the source by 90°/180°/270° would
 * succeed.
 *
 * Setup pattern used below: A `part_fabricator` named A is placed
 * UNCONNECTED at (5,5) with rotation 'south'. A second `part_fabricator`
 * named B is placed at (8,5) with rotation 'east' and ALREADY connected to
 * a sink machine D — so B's rotation is "locked" (target has belts → no
 * auto-rotation on the target side). The drag is from A's clicked `front`
 * output slot to B.
 */
describe('PlacementPlanner — auto-rotate UNCONNECTED source', () => {
  let factory: Factory

  beforeEach(() => {
    factory = new Factory(10, 10)
  })

  /**
   * Layout (10×10 grid). `.` = empty, `R` = recycler obstacle,
   * `A` = part_fabricator A (unconnected), `B` = part_fabricator B,
   * `D` = painter sink, `═`/`║` = belt cells.
   *
   *      x=4 5 6 7 8 9
   *  z=4  .  R  .  .  .  .
   *  z=5  .  A  .  .  B  ═      ← B → D belt occupies (9,5),(9,6)
   *  z=6  .  R  .  .  .  ║
   *  z=7  .  .  .  .  .  D
   *
   * - A.front (rotation 'south') would land at (5,6) — BLOCKED by recycler.
   * - A.front (rotation 'north') would land at (5,4) — BLOCKED by recycler.
   * - A.front (rotation 'east') would land at (6,5) — FREE.
   *   From (6,5) → B's input back-slot at (7,5) → B at (8,5): clean L-path.
   * - A.front (rotation 'west') would land at (4,5) — FREE but requires a
   *   long detour around A itself; longer than 'east'.
   *
   * Expected NEW behaviour: planner tries all 4 rotations, picks the
   * shortest non-colliding one ('east'), placeBeltChain succeeds, A is
   * rotated to 'east', and the resulting belt is the straight 4-cell path.
   *
   * Current (buggy) behaviour: planner derives simSrcRotation='south' from
   * the supplied `sourceSlotPosition='front'` using A's existing rotation,
   * sees that the slot cell (5,6) is blocked, tries the direct path which
   * yields (5,5)→(6,5)→(7,5)→(8,5) but with a first-step direction that
   * doesn't match A's 'front' slot at rotation 'south' → placeBeltChain
   * returns false and A is NOT rotated.
   */
  function setupOneRotationWorks(): void {
    factory.restoreState(
      [
        { x: 5, z: 5, type: 'part_fabricator', rotation: 'south' }, // A — unconnected
        { x: 5, z: 4, type: 'recycler', rotation: 'south' },        // blocks A.front when rotation='north'
        { x: 5, z: 6, type: 'recycler', rotation: 'south' },        // blocks A.front when rotation='south'
        { x: 8, z: 5, type: 'part_fabricator', rotation: 'east' },  // B — locked east via belt to D
        { x: 9, z: 7, type: 'painter', rotation: 'south' },         // D sink
      ],
      [
        // B(8,5).front=(9,5)  →  D(9,7).back=(9,6)
        {
          sourceSlot: 'front',
          destinationSlot: 'back',
          path: [
            { x: 8, z: 5 },
            { x: 9, z: 5 },
            { x: 9, z: 6 },
            { x: 9, z: 7 },
          ],
        },
      ],
    )
  }

  describe('placeBeltChain() with sourceSlotPosition="front"', () => {
    it('rotates the unconnected source when the existing-rotation slot is blocked but a 90° rotation works', () => {
      // GIVEN — the only valid rotation for A is 'east'
      setupOneRotationWorks()
      expectFactoryState(factory, {
        grid: { box: [3, 3, 10, 8], expected: [
            '| | | | | | | | |',
            '| | |R| | | | | |',
            '| | |F| | |F|┐| |',
            '| | |R| | | |│| |',
            '| | | | | | |P| |',
            '| | | | | | | | |',
          ].join('\n') },
        machines: [
          { x: 5, z: 5, rotation: 'south' },
          { x: 5, z: 4, rotation: 'south' },
          { x: 5, z: 6, rotation: 'south' },
          { x: 8, z: 5, rotation: 'east' },
          { x: 9, z: 7, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 8, z: 5 },
            destination: { x: 9, z: 7 },
            path: [{ x: 8, z: 5 }, { x: 9, z: 5 }, { x: 9, z: 6 }, { x: 9, z: 7 }],
          },
        ],
      })
      const a = factory.getMachineAt(5, 5)!
      const b = factory.getMachineAt(8, 5)!
      expect(a.rotation).toBe('south')

      // WHEN — drag from A's clicked 'front' output slot to B
      const ok = factory.placeBeltChain(
        a, b, 'output',
        { sourceSlotPosition: 'front' },
      )
      expectFactoryState(factory, {
        grid: { box: [3, 3, 10, 8], expected: [
            '| | | | | | | | |',
            '| | |R| | | | | |',
            '| | |F|─|─|F|┐| |',
            '| | |R| | | |│| |',
            '| | | | | | |P| |',
            '| | | | | | | | |',
          ].join('\n') },
        machines: [
          { x: 5, z: 5, rotation: 'east' },
          { x: 5, z: 4, rotation: 'south' },
          { x: 5, z: 6, rotation: 'south' },
          { x: 8, z: 5, rotation: 'east' },
          { x: 9, z: 7, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 8, z: 5 },
            destination: { x: 9, z: 7 },
            path: [{ x: 8, z: 5 }, { x: 9, z: 5 }, { x: 9, z: 6 }, { x: 9, z: 7 }],
          },
          {
            source: { x: 5, z: 5 },
            destination: { x: 8, z: 5 },
            path: [{ x: 5, z: 5 }, { x: 6, z: 5 }, { x: 7, z: 5 }, { x: 8, z: 5 }],
          },
        ],
      })

      // THEN — A is auto-rotated to 'east' and a clean belt is placed
      expect(ok, 'placeBeltChain must succeed by rotating A to a working orientation').toBe(true)
      expect(factory.getMachineAt(5, 5)!.rotation).toBe('east')
      expect(factory.getMachineAt(8, 5)!.rotation).toBe('east')

      // The newly-added belt is the only one whose source is A
      const beltsFromA = factory.getBelts().filter(
        (belt) => belt.sourceMachine.x === 5 && belt.sourceMachine.z === 5,
      )
      expect(beltsFromA).toHaveLength(1)
      const belt = beltsFromA[0]
      expect(belt.path).toEqual([
        { x: 5, z: 5 },
        { x: 6, z: 5 },
        { x: 7, z: 5 },
        { x: 8, z: 5 },
      ])
      expect(belt.sourceSlot).toBe('front')
      expect(belt.destinationSlot).toBe('back')
      expect(belt.destinationMachine.x).toBe(8)
      expect(belt.destinationMachine.z).toBe(5)
    })

    it('ghost-preview parity: a non-colliding ghost MUST commit via placeBeltChain', () => {
      // This test pins down ghost/placement parity. Under the current buggy
      // code, computeBeltFromSlotPath returns a non-colliding direct-path
      // plan whose first step does not correspond to A's `front` slot under
      // its existing rotation. The user sees a GREEN ghost, but
      // placeBeltChain rejects the placement (slot mismatch) → the green
      // ghost was a lie. The new rule (iterate rotations) must make both
      // operations agree.
      // GIVEN
      setupOneRotationWorks()
      const a = factory.getMachineAt(5, 5)!
      const b = factory.getMachineAt(8, 5)!

      // WHEN — ghost preview
      const ghost = factory.computeBeltFromSlotPath(
        { x: 5, z: 5 }, { x: 8, z: 5 }, 'output',
        { sourceSlotPosition: 'front' },
      )

      // THEN — the new contract requires a non-colliding ghost here
      expect(ghost, 'ghost preview must compute a plan').not.toBeNull()
      expect(
        ghost!.collides,
        'a 90° rotation of A produces a valid belt — ghost MUST be green',
      ).toBe(false)

      // AND — committing the same drag must succeed (parity)
      const ok = factory.placeBeltChain(
        a, b, 'output',
        { sourceSlotPosition: 'front' },
      )
      expect(
        ok,
        'green ghost MUST commit successfully — ghost/placement parity',
      ).toBe(true)
      expectFactoryState(factory, {
        grid: { box: [3, 3, 10, 8], expected: [
            '| | | | | | | | |',
            '| | |R| | | | | |',
            '| | |F|─|─|F|┐| |',
            '| | |R| | | |│| |',
            '| | | | | | |P| |',
            '| | | | | | | | |',
          ].join('\n') },
        machines: [
          { x: 5, z: 5, rotation: 'east' },
          { x: 5, z: 4, rotation: 'south' },
          { x: 5, z: 6, rotation: 'south' },
          { x: 8, z: 5, rotation: 'east' },
          { x: 9, z: 7, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 8, z: 5 },
            destination: { x: 9, z: 7 },
            path: [{ x: 8, z: 5 }, { x: 9, z: 5 }, { x: 9, z: 6 }, { x: 9, z: 7 }],
          },
          {
            source: { x: 5, z: 5 },
            destination: { x: 8, z: 5 },
            path: [{ x: 5, z: 5 }, { x: 6, z: 5 }, { x: 7, z: 5 }, { x: 8, z: 5 }],
          },
        ],
      })
    })
  })

  describe('placeBeltChain() WITHOUT sourceSlotPosition', () => {
    /**
     * Same physical layout, but without specifying a particular source
     * slot. The auto-rotation derivation (without a slot constraint) walks
     * the trial path's first step. The trial path A(5,5)→B(8,5) initially
     * tries the X-first L: (5,5)→(6,5)→(7,5)→(8,5), giving first-step
     * direction (1,0) → simSrcRotation='east'. So in this particular
     * variant the CURRENT code already happens to pick 'east'. We assert
     * the correct outcome regardless — the placement succeeds. (This test
     * complements the sourceSlotPosition variant by exercising the same
     * code path through a different entry point and acts as a regression
     * guard for the iteration logic.)
     */
    it('still picks a working rotation when source has no belts and target is connected', () => {
      // GIVEN
      setupOneRotationWorks()
      const a = factory.getMachineAt(5, 5)!
      const b = factory.getMachineAt(8, 5)!

      // WHEN
      const ok = factory.placeBeltChain(a, b, 'output')
      expectFactoryState(factory, {
        grid: { box: [3, 3, 10, 8], expected: [
            '| | | | | | | | |',
            '| | |R| | | | | |',
            '| | |F|─|─|F|┐| |',
            '| | |R| | | |│| |',
            '| | | | | | |P| |',
            '| | | | | | | | |',
          ].join('\n') },
        machines: [
          { x: 5, z: 5, rotation: 'east' },
          { x: 5, z: 4, rotation: 'south' },
          { x: 5, z: 6, rotation: 'south' },
          { x: 8, z: 5, rotation: 'east' },
          { x: 9, z: 7, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 8, z: 5 },
            destination: { x: 9, z: 7 },
            path: [{ x: 8, z: 5 }, { x: 9, z: 5 }, { x: 9, z: 6 }, { x: 9, z: 7 }],
          },
          {
            source: { x: 5, z: 5 },
            destination: { x: 8, z: 5 },
            path: [{ x: 5, z: 5 }, { x: 6, z: 5 }, { x: 7, z: 5 }, { x: 8, z: 5 }],
          },
        ],
      })

      // THEN
      expect(ok).toBe(true)
      expect(factory.getMachineAt(5, 5)!.rotation).toBe('east')
      const beltsFromA = factory.getBelts().filter(
        (belt) => belt.sourceMachine.x === 5 && belt.sourceMachine.z === 5,
      )
      expect(beltsFromA).toHaveLength(1)
      expect(beltsFromA[0].path).toEqual([
        { x: 5, z: 5 },
        { x: 6, z: 5 },
        { x: 7, z: 5 },
        { x: 8, z: 5 },
      ])
    })
  })

  describe('placeBeltChain() — negative case: NO rotation works', () => {
    /**
     * Surround A on all 4 cardinal sides with obstacle machines so that
     * EVERY possible source-slot rotation is blocked. The planner must:
     *   - return false from placeBeltChain
     *   - leave A's rotation UNCHANGED ('south')
     *   - return a "red ghost" (collides=true, or null) from
     *     computeBeltFromSlotPath
     *
     * In particular, the iteration over rotations must NOT side-effect A's
     * rotation when no rotation succeeds — the fallback must use the
     * ORIGINAL rotation's colliding plan.
     */
    function setupNoRotationWorks(): void {
      factory.restoreState(
        [
          { x: 5, z: 5, type: 'part_fabricator', rotation: 'south' }, // A
          { x: 5, z: 4, type: 'recycler', rotation: 'south' },        // blocks 'north'
          { x: 5, z: 6, type: 'recycler', rotation: 'south' },        // blocks 'south'
          { x: 4, z: 5, type: 'recycler', rotation: 'south' },        // blocks 'west'
          { x: 6, z: 5, type: 'recycler', rotation: 'south' },        // blocks 'east'
          { x: 8, z: 5, type: 'part_fabricator', rotation: 'east' },  // B
          { x: 9, z: 7, type: 'painter', rotation: 'south' },         // D sink
        ],
        [
          {
            sourceSlot: 'front',
            destinationSlot: 'back',
            path: [
              { x: 8, z: 5 },
              { x: 9, z: 5 },
              { x: 9, z: 6 },
              { x: 9, z: 7 },
            ],
          },
        ],
      )
    }

    it('returns false and leaves source rotation unchanged when surrounded by obstacles', () => {
      // GIVEN
      setupNoRotationWorks()
      const SURROUNDED_INITIAL = {
        grid: { box: [3, 3, 10, 8] as [number, number, number, number], expected: [
            '| | | | | | | | |',
            '| | |R| | | | | |',
            '| |R|F|R| |F|┐| |',
            '| | |R| | | |│| |',
            '| | | | | | |P| |',
            '| | | | | | | | |',
          ].join('\n') },
        machines: [
          { x: 5, z: 5, rotation: 'south' as const },
          { x: 5, z: 4, rotation: 'south' as const },
          { x: 5, z: 6, rotation: 'south' as const },
          { x: 4, z: 5, rotation: 'south' as const },
          { x: 6, z: 5, rotation: 'south' as const },
          { x: 8, z: 5, rotation: 'east' as const },
          { x: 9, z: 7, rotation: 'south' as const },
        ],
        belts: [
          {
            source: { x: 8, z: 5 },
            destination: { x: 9, z: 7 },
            path: [{ x: 8, z: 5 }, { x: 9, z: 5 }, { x: 9, z: 6 }, { x: 9, z: 7 }],
          },
        ],
      }
      expectFactoryState(factory, SURROUNDED_INITIAL)
      const a = factory.getMachineAt(5, 5)!
      const b = factory.getMachineAt(8, 5)!

      // WHEN
      const ok = factory.placeBeltChain(
        a, b, 'output',
        { sourceSlotPosition: 'front' },
      )
      // THEN — unchanged factory state.
      expectFactoryState(factory, SURROUNDED_INITIAL)

      // THEN
      expect(ok).toBe(false)
      expect(
        factory.getMachineAt(5, 5)!.rotation,
        'failed iteration must NOT side-effect source rotation',
      ).toBe('south')
      // No belt out of A
      const beltsFromA = factory.getBelts().filter(
        (belt) => belt.sourceMachine.x === 5 && belt.sourceMachine.z === 5,
      )
      expect(beltsFromA).toHaveLength(0)
    })

    it('computeBeltFromSlotPath returns a red-ghost (or null) result when no rotation works', () => {
      // GIVEN
      setupNoRotationWorks()
      expectFactoryState(factory, {
        grid: { box: [3, 3, 10, 8], expected: [
            '| | | | | | | | |',
            '| | |R| | | | | |',
            '| |R|F|R| |F|┐| |',
            '| | |R| | | |│| |',
            '| | | | | | |P| |',
            '| | | | | | | | |',
          ].join('\n') },
        machines: [
          { x: 5, z: 5, rotation: 'south' },
          { x: 5, z: 4, rotation: 'south' },
          { x: 5, z: 6, rotation: 'south' },
          { x: 4, z: 5, rotation: 'south' },
          { x: 6, z: 5, rotation: 'south' },
          { x: 8, z: 5, rotation: 'east' },
          { x: 9, z: 7, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 8, z: 5 },
            destination: { x: 9, z: 7 },
            path: [{ x: 8, z: 5 }, { x: 9, z: 5 }, { x: 9, z: 6 }, { x: 9, z: 7 }],
          },
        ],
      })

      // WHEN
      const result = factory.computeBeltFromSlotPath(
        { x: 5, z: 5 }, { x: 8, z: 5 }, 'output',
        { sourceSlotPosition: 'front' },
      )

      // THEN — must return a colliding (red) plan, not null. The original
      // rotation invariance is covered by the placeBeltChain test above.
      expect(
        result,
        'planner must return a fallback plan (not null) so the ghost renders red',
      ).not.toBeNull()
      expect(result!.collides, 'fallback plan must be marked colliding (red ghost)').toBe(true)
    })
  })

  /**
   * Tie-priority contract: when the source is unconnected and TWO OR MORE
   * candidate rotations yield NON-COLLIDING belt placements of EQUAL path
   * length, the planner MUST select the rotation that was originally derived
   * from the unconstrained trial path. This pins down the early-break /
   * strict-less-than tie-break in `computePlacementPlan`. If the
   * implementation is regressed to use `<=` (replacing the best on equal
   * length) or to drop the `i === 0` early break, this test will fail
   * because an alternative tied rotation would overwrite the originally
   * derived one in the iteration order.
   */
  describe('placeBeltChain() — tie priority on equal-length non-colliding plans', () => {
    it('keeps the originally-derived rotation when an alternative rotation yields an equal-length path', () => {
      // GIVEN — A unconnected at (5,5); B at (8,8) locked to rotation
      // 'east' via a B→D belt. The diagonal A→B target makes BOTH the
      // 'east' rotation of A (front=(6,5)) and the 'south' rotation of A
      // (front=(5,6)) yield equal-length L-paths through B's input back
      // slot at (7,8). The surrounding area is obstacle-free so both
      // rotations produce non-colliding plans.
      //
      //      x: 5 6 7 8 9
      //  z=5  A  .  .  .  .
      //  z=6  .  .  .  .  .
      //  z=7  .  .  .  .  .
      //  z=8  .  .  .  B  ═     ← B(8,8).front=(9,8)
      //  z=9  .  .  .  .  ║
      // z=10  .  .  .  .  D     ← D(9,10).back=(9,9)
      const bigFactory = new Factory(12, 12)
      bigFactory.restoreState(
        [
          { x: 5, z: 5, type: 'part_fabricator', rotation: 'south' }, // A — unconnected
          { x: 8, z: 8, type: 'part_fabricator', rotation: 'east' },  // B — locked east
          { x: 9, z: 10, type: 'painter', rotation: 'south' },        // D — sink, back at (9,9)
        ],
        [
          // B(8,8).front=(9,8) → D(9,10).back=(9,9)
          {
            sourceSlot: 'front',
            destinationSlot: 'back',
            path: [
              { x: 8, z: 8 },
              { x: 9, z: 8 },
              { x: 9, z: 9 },
              { x: 9, z: 10 },
            ],
          },
        ],
      )

      const a = bigFactory.getMachineAt(5, 5)!
      const b = bigFactory.getMachineAt(8, 8)!
      expect(a.rotation).toBe('south')
      expect(b.rotation).toBe('east')
      expectFactoryState(bigFactory, {
        grid: { box: [3, 3, 11, 11], expected: [
            '| | | | | | | | | |',
            '| | | | | | | | | |',
            '| | |F| | | | | | |',
            '| | | | | | | | | |',
            '| | | | | | | | | |',
            '| | | | | |F|┐| | |',
            '| | | | | | |│| | |',
            '| | | | | | |P| | |',
            '| | | | | | | | | |',
          ].join('\n') },
        machines: [
          { x: 5, z: 5, rotation: 'south' },
          { x: 8, z: 8, rotation: 'east' },
          { x: 9, z: 10, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 8, z: 8 },
            destination: { x: 9, z: 10 },
            path: [{ x: 8, z: 8 }, { x: 9, z: 8 }, { x: 9, z: 9 }, { x: 9, z: 10 }],
          },
        ],
      })

      // PROBE — derive the rotation the pre-iteration logic would pick from
      // the unconstrained trial path's first step. This mirrors exactly the
      // call the planner makes in `computePlacementPlan` when no
      // sourceSlotPosition is supplied (trialFrom = source position,
      // ignoreBeltIds undefined).
      const trial = bigFactory.findBestBeltPath({ x: 5, z: 5 }, { x: 8, z: 8 })
      expect(trial.path.length).toBeGreaterThanOrEqual(2)
      const firstDx = Math.sign(trial.path[1].x - trial.path[0].x)
      const firstDz = Math.sign(trial.path[1].z - trial.path[0].z)
      const expectedRotation = firstDx !== 0
        ? rotationToFace(firstDx, 0)
        : rotationToFace(0, firstDz)
      // Sanity: the trial must move along a single axis on its first step
      // and the derived rotation must be one of the two tied candidates
      // (`east` or `south`) for this geometry — anything else means the
      // probe assumption is broken and the test would no longer be pinning
      // the contract.
      expect(['east', 'south']).toContain(expectedRotation)
      const otherTiedRotation = expectedRotation === 'east' ? 'south' : 'east'

      // SANITY — confirm the alternative rotation ALSO produces a
      // non-colliding plan of EQUAL length. Without this, the test would
      // not actually exercise the tie-break path (any sane implementation
      // would pick the only working rotation regardless).
      const factoryProbe = new Factory(12, 12)
      factoryProbe.restoreState(
        [
          { x: 5, z: 5, type: 'part_fabricator', rotation: otherTiedRotation },
          { x: 8, z: 8, type: 'part_fabricator', rotation: 'east' },
          { x: 9, z: 10, type: 'painter', rotation: 'south' },
        ],
        [
          {
            sourceSlot: 'front',
            destinationSlot: 'back',
            path: [
              { x: 8, z: 8 }, { x: 9, z: 8 }, { x: 9, z: 9 }, { x: 9, z: 10 },
            ],
          },
        ],
      )
      const aProbe = factoryProbe.getMachineAt(5, 5)!
      const bProbe = factoryProbe.getMachineAt(8, 8)!
      const okAlt = factoryProbe.placeBeltChain(aProbe, bProbe, 'output')
      expect(
        okAlt,
        `precondition: alternative rotation ${otherTiedRotation} must also yield a non-colliding plan`,
      ).toBe(true)
      // The alternative-rotation factory may auto-rotate A back to the
      // originally-derived rotation (that's the very contract under test);
      // either way, what matters is that *some* valid plan exists. Capture
      // the tied alternative's path length by inspecting the placed belt.
      const altBelts = factoryProbe.getBelts().filter(
        (belt) => belt.sourceMachine.x === 5 && belt.sourceMachine.z === 5,
      )
      expect(altBelts).toHaveLength(1)
      const altLength = altBelts[0].path.length

      // WHEN — place from A to B with no source-slot constraint
      const ok = bigFactory.placeBeltChain(a, b, 'output')
      expectFactoryState(bigFactory, {
        grid: { box: [3, 3, 11, 11], expected: [
            '| | | | | | | | | |',
            '| | | | | | | | | |',
            '| | |F|─|┐| | | | |',
            '| | | | |│| | | | |',
            '| | | | |│| | | | |',
            '| | | | |└|F|┐| | |',
            '| | | | | | |│| | |',
            '| | | | | | |P| | |',
            '| | | | | | | | | |',
          ].join('\n') },
        machines: [
          { x: 5, z: 5, rotation: 'east' },
          { x: 8, z: 8, rotation: 'east' },
          { x: 9, z: 10, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 8, z: 8 },
            destination: { x: 9, z: 10 },
            path: [{ x: 8, z: 8 }, { x: 9, z: 8 }, { x: 9, z: 9 }, { x: 9, z: 10 }],
          },
          {
            source: { x: 5, z: 5 },
            destination: { x: 8, z: 8 },
            path: [{ x: 5, z: 5 }, { x: 6, z: 5 }, { x: 7, z: 5 }, { x: 7, z: 6 }, { x: 7, z: 7 }, { x: 7, z: 8 }, { x: 8, z: 8 }],
          },
        ],
      })

      // THEN — placement succeeds and A is rotated to the ORIGINALLY-DERIVED
      // rotation, NOT the tied alternative.
      expect(ok).toBe(true)
      expect(
        bigFactory.getMachineAt(5, 5)!.rotation,
        `tie-break MUST keep the originally-derived rotation (${expectedRotation}); got ${bigFactory.getMachineAt(5, 5)!.rotation}`,
      ).toBe(expectedRotation)

      // AND — the chosen path's length equals the tied alternative's, proving
      // we picked among equal-length winners (not a strictly-shorter one).
      const beltsFromA = bigFactory.getBelts().filter(
        (belt) => belt.sourceMachine.x === 5 && belt.sourceMachine.z === 5,
      )
      expect(beltsFromA).toHaveLength(1)
      expect(beltsFromA[0].path.length).toBe(altLength)
      // The first step must match A's chosen rotation's `front` slot.
      const firstStep = beltsFromA[0].path[1]
      const expectedFirst = expectedRotation === 'east'
        ? { x: 6, z: 5 }
        : { x: 5, z: 6 }
      expect(firstStep).toEqual(expectedFirst)
    })
  })
})

/**
 * Reproduces the exact scenario shown in the user-reported bug screenshot:
 *
 *   - Top    Fabricator (TF) at (5,3) rotation 'east'
 *   - Middle Fabricator (MF) at (5,5) rotation 'west' — UNCONNECTED
 *   - Bottom Fabricator (BF) at (7,7) rotation 'east'
 *   - A pre-existing belt routes TF.front → BF.back (the long route around
 *     MF that matches the screenshot — east from TF, south, then west into
 *     BF). MF sits between them, oriented OPPOSITE to the existing data
 *     flow (its front faces west, away from everything).
 *
 * Per the screenshot the user drags from MF's GREEN OUTPUT slot ('front')
 * and drops on a body. Because BF's only input ('back') is already
 * consumed by the TF→BF belt, this test introduces a 4th machine D
 * (a part_fabricator at (8,5) rotation 'east', locked east via a D→S
 * sink belt) as the actual drop target — preserving the spirit of the
 * bug: MF unconnected, MF.front pointing AWAY from D, and only a
 * non-current rotation of MF can yield a valid non-colliding belt.
 *
 * Obstacles (recyclers) at (4,5), (5,4), (5,6) block MF.front in
 * rotations 'west', 'north', 'south' respectively, leaving 'east' as the
 * only working rotation. This forces the planner to prove it actually
 * iterates over candidate rotations when the source is unconnected.
 */
describe('exact user-reported scenario: middle Fabricator with opposite-orientation rotates to connect to other machine', () => {
  let factory: Factory

  beforeEach(() => {
    factory = new Factory(12, 12)
    factory.restoreState(
      [
        // Atmospherics from the screenshot — TF and BF connected pair.
        { x: 5, z: 3, type: 'part_fabricator', rotation: 'east' }, // TF
        { x: 5, z: 5, type: 'part_fabricator', rotation: 'west' }, // MF — bug subject
        { x: 7, z: 7, type: 'part_fabricator', rotation: 'east' }, // BF
        // Drop target D — locked to rotation 'east' via a D→S belt.
        { x: 8, z: 5, type: 'part_fabricator', rotation: 'east' }, // D
        { x: 9, z: 7, type: 'painter', rotation: 'south' },        // S sink
        // Obstacles forcing MF into rotation 'east' to find any valid path.
        { x: 4, z: 5, type: 'recycler', rotation: 'south' },       // blocks MF.front when rotation='west'
        { x: 5, z: 4, type: 'recycler', rotation: 'south' },       // blocks MF.front when rotation='north'
        { x: 5, z: 6, type: 'recycler', rotation: 'south' },       // blocks MF.front when rotation='south'
      ],
      [
        // D(8,5).front=(9,5) → S(9,7).back=(9,6) — locks D rotation east.
        {
          sourceSlot: 'front',
          destinationSlot: 'back',
          path: [
            { x: 8, z: 5 }, { x: 9, z: 5 }, { x: 9, z: 6 }, { x: 9, z: 7 },
          ],
        },
        // TF(5,3).front=(6,3) → BF(7,7).back=(6,7) — long S-route avoiding
        // the MF obstacle cluster, mirroring the screenshot path
        // (east from TF, south along far edge, then west into BF.back).
        {
          sourceSlot: 'front',
          destinationSlot: 'back',
          path: [
            { x: 5, z: 3 }, { x: 6, z: 3 }, { x: 7, z: 3 }, { x: 7, z: 2 },
            { x: 8, z: 2 }, { x: 9, z: 2 }, { x: 10, z: 2 }, { x: 10, z: 3 },
            { x: 10, z: 4 }, { x: 10, z: 5 }, { x: 10, z: 6 }, { x: 10, z: 7 },
            { x: 10, z: 8 }, { x: 9, z: 8 }, { x: 8, z: 8 }, { x: 7, z: 8 },
            { x: 6, z: 8 }, { x: 6, z: 7 }, { x: 7, z: 7 },
          ],
        },
      ],
    )
  })

  it('places belt from MF.front by auto-rotating MF away from its current "west" orientation', () => {
    // GIVEN — INITIAL state snapshot (before the user action). Verifies
    // the geometry from the screenshot: TF/BF connected via a long belt
    // looping east-then-south-then-west, MF unconnected facing west,
    // surrounded by recyclers on N/W/S, with D-S pair to the east.
    expect(renderGrid(factory, 3, 1, 11, 9)).toBe([
      '| | | | | | | | | |',
      '| | | | |┌|─|─|┐| |',
      '| | |F|─|┘| | |│| |',
      '| | |R| | | | |│| |',
      '| |R|F| | |F|┐|│| |',
      '| | |R| | | |│|│| |',
      '| | | |┌|F| |P|│| |',
      '| | | |└|─|─|─|┘| |',
      '| | | | | | | | | |',
    ].join('\n'))

    const mf = factory.getMachineAt(5, 5)!
    const d = factory.getMachineAt(8, 5)!
    expect(mf.rotation).toBe('west')
    expect(d.rotation).toBe('east')

    // WHEN — user drags from MF's clicked 'front' (green output) slot to D.
    const ok = factory.placeBeltChain(
      mf, d, 'output',
      { sourceSlotPosition: 'front' },
    )
    expectFactoryState(factory, {
      grid: { box: [3, 1, 11, 9], expected: [
          '| | | | | | | | | |',
          '| | | | |┌|─|─|┐| |',
          '| | |F|─|┘| | |│| |',
          '| | |R| | | | |│| |',
          '| |R|F|─|─|F|┐|│| |',
          '| | |R| | | |│|│| |',
          '| | | |┌|F| |P|│| |',
          '| | | |└|─|─|─|┘| |',
          '| | | | | | | | | |',
        ].join('\n') },
      machines: [
        { x: 5, z: 3, rotation: 'east' },
        { x: 5, z: 5, rotation: 'east' },
        { x: 7, z: 7, rotation: 'east' },
        { x: 8, z: 5, rotation: 'east' },
        { x: 9, z: 7, rotation: 'south' },
        { x: 4, z: 5, rotation: 'south' },
        { x: 5, z: 4, rotation: 'south' },
        { x: 5, z: 6, rotation: 'south' },
      ],
      belts: [
        {
          source: { x: 8, z: 5 },
          destination: { x: 9, z: 7 },
          path: [{ x: 8, z: 5 }, { x: 9, z: 5 }, { x: 9, z: 6 }, { x: 9, z: 7 }],
        },
        {
          source: { x: 5, z: 3 },
          destination: { x: 7, z: 7 },
          path: [{ x: 5, z: 3 }, { x: 6, z: 3 }, { x: 7, z: 3 }, { x: 7, z: 2 }, { x: 8, z: 2 }, { x: 9, z: 2 }, { x: 10, z: 2 }, { x: 10, z: 3 }, { x: 10, z: 4 }, { x: 10, z: 5 }, { x: 10, z: 6 }, { x: 10, z: 7 }, { x: 10, z: 8 }, { x: 9, z: 8 }, { x: 8, z: 8 }, { x: 7, z: 8 }, { x: 6, z: 8 }, { x: 6, z: 7 }, { x: 7, z: 7 }],
        },
        {
          source: { x: 5, z: 5 },
          destination: { x: 8, z: 5 },
          path: [{ x: 5, z: 5 }, { x: 6, z: 5 }, { x: 7, z: 5 }, { x: 8, z: 5 }],
        },
      ],
    })

    // THEN — assertion #1: placeBeltChain succeeds.
    expect(ok, 'placeBeltChain must succeed by auto-rotating MF').toBe(true)

    // THEN — assertion #2: MF rotated away from its original 'west', and
    // every belt in the factory still satisfies the slot invariant.
    const mfAfter = factory.getMachineAt(5, 5)!
    expect(mfAfter.rotation, 'MF must auto-rotate away from "west"').not.toBe('west')
    assertBeltSlotInvariant(factory)

    // THEN — assertion #3: the new belt's source slot is 'front' (the
    // user-clicked slot), and the path's first cell after MF equals
    // MF + slotPositionToOffset('front', MF.newRotation).
    const beltsFromMF = factory.getBelts().filter(
      (b) => b.sourceMachine.x === 5 && b.sourceMachine.z === 5,
    )
    expect(beltsFromMF, 'exactly one new belt must originate from MF').toHaveLength(1)
    const newBelt = beltsFromMF[0]
    expect(newBelt.sourceSlot).toBe('front')
    const expectedFirstOff = slotPositionToOffset('front', mfAfter.rotation)
    expect(newBelt.path[1]).toEqual({
      x: 5 + expectedFirstOff.x,
      z: 5 + expectedFirstOff.z,
    })
    expect(newBelt.destinationMachine.x).toBe(8)
    expect(newBelt.destinationMachine.z).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RED-step tests for the relaxed reverse-slot-type fallback contract.
//
// CONTEXT: A previous Round-4 fix added an `explicitSlot` gate in
// `src/rendering/GridInteraction.ts` that skipped the reverse-slot-type
// fallback whenever the user clicked a specific source/target slot. This
// over-corrected: the reverse-slot fallback must still fire as a LAST RESORT
// when the explicit-slot direction is geometrically impossible (e.g. the only
// available slot of the chosen type is already consumed by another belt).
//
// PROPOSED API for the planner (to be decided by the implementer; see test 1a
// below): an internal fallback step in `computePlacementPlan`, OR a new opt-in
// option such as
//
//   computePlacementPlan(from, to, sourceSlotType, ignoreBeltIds, fixedRotations,
//     virtualMachines, ignoreMachinePositions, forcedHasBelts, extraBlockedCells,
//     targetSlotPosition, sourceSlotPosition,
//     { allowReverseSlotType: true } )
//
// These RED tests assert the SEMANTICS, not the API shape. They drive against
// the public `Factory.computeBeltFromSlotPath` so the implementer can pick
// either approach.
// ─────────────────────────────────────────────────────────────────────────────

describe('reverse-slot-type fallback (last resort)', () => {
  /**
   * Reuses the F1/F2/F3 layout from
   * tests/unit/integration/SlotDragRotationFallback.test.ts. F3.output is
   * already consumed by the existing belt to F1.input, so a drag from F2's
   * INPUT slot to F3 cannot connect F3.output → F2.input. The user's intent
   * is "connect F2 and F3" — the planner must fall back to F2.output → F3.input.
   */
  function buildF1F2F3Fixture() {
    const factory = new Factory(10, 10)
    factory.restoreState(
      [
        { x: 1, z: 1, type: 'part_fabricator', rotation: 'west' },
        { x: 1, z: 2, type: 'part_fabricator', rotation: 'east' },
        { x: 3, z: 2, type: 'part_fabricator', rotation: 'west' },
      ],
      [
        {
          sourceSlot: 'front',
          destinationSlot: 'back',
          path: [
            { x: 3, z: 2 },
            { x: 2, z: 2 },
            { x: 2, z: 1 },
            { x: 1, z: 1 },
          ],
        },
      ],
    )
    const F1 = factory.getMachineAt(1, 1)!
    const F2 = factory.getMachineAt(1, 2)!
    const F3 = factory.getMachineAt(3, 2)!
    return { factory, F1, F2, F3 }
  }

  it('falls back to opposite slot type when explicit slot has no free target', () => {
    // GIVEN — F3.output is consumed (no free output on F3); F2.input drag → F3
    // cannot resolve under sourceSlotType='input'.
    const { factory, F2, F3 } = buildF1F2F3Fixture()
    expectFactoryState(factory, {
      grid: { box: [0, 0, 5, 5], expected: [
          '| | | | | | |',
          '| |F|┐| | | |',
          '| |F|└|F| | |',
          '| | | | | | |',
          '| | | | | | |',
          '| | | | | | |',
        ].join('\n') },
      machines: [
        { x: 1, z: 1, rotation: 'west' },
        { x: 1, z: 2, rotation: 'east' },
        { x: 3, z: 2, rotation: 'west' },
      ],
      belts: [
        {
          source: { x: 3, z: 2 },
          destination: { x: 1, z: 1 },
          path: [{ x: 3, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 1 }, { x: 1, z: 1 }],
        },
      ],
    })
    expect(factory.getFreeSlotsOfType(F3, 'output')).toHaveLength(0)

    // WHEN — drag from F2's INPUT slot 'back' toward F3, with the new
    // last-resort reverse-slot-type fallback enabled.
    //
    // The planner must internally detect that the explicit slot type produces
    // no plan because F3 has no free OUTPUT slots, and fall back to trying the
    // OPPOSITE flow (F2.output → F3.input) since F3.input IS available.
    const result = factory.computeBeltFromSlotPath(
      { x: F2.x, z: F2.z },
      { x: F3.x, z: F3.z },
      'input',
      { fixedRotations: false, sourceSlotPosition: 'back', tryReverseSlotType: true },
    )

    // THEN — a plan IS returned (no longer null) and represents the REVERSE
    // direction: F2 (output) → F3 (input). With sourceSlotType='output' the
    // path starts at the OUTPUT machine. So under the reversed semantics,
    // path[0] must be F2 and path[last] must be F3.
    expect(result, 'reverse-slot fallback must produce a plan').not.toBeNull()
    expect(result!.collides).toBe(false)
    expect(result!.path[0]).toEqual({ x: F2.x, z: F2.z })
    expect(result!.path[result!.path.length - 1]).toEqual({ x: F3.x, z: F3.z })
  })

  it('does NOT fall back to opposite slot type when explicit-slot direction has free target slots (even if no rotation works)', () => {
    // GIVEN — A is unconnected at (5,5). Surround with recyclers on N/S/E/W
    // so EVERY rotation of A's 'front' (output) slot is blocked. B is
    // unconnected at (8,5) with a free input slot — i.e. the EXPLICIT-SLOT
    // direction (A.output → B.input) DOES have free target slots, the
    // failure is purely a routing/rotation problem.
    //
    // The reverse-slot fallback must NOT fire here because flipping the slot
    // type would silently invert the user's intended dataflow direction
    // (an "output drag" must never produce an INPUT belt to the source
    // machine when output WAS theoretically available).
    const factory = new Factory(12, 12)
    factory.restoreState(
      [
        { x: 5, z: 5, type: 'part_fabricator', rotation: 'south' }, // A — unconnected
        { x: 5, z: 4, type: 'recycler', rotation: 'south' },        // blocks A.front 'north'
        { x: 5, z: 6, type: 'recycler', rotation: 'south' },        // blocks A.front 'south'
        { x: 4, z: 5, type: 'recycler', rotation: 'south' },        // blocks A.front 'west'
        { x: 6, z: 5, type: 'recycler', rotation: 'south' },        // blocks A.front 'east'
        { x: 8, z: 5, type: 'part_fabricator', rotation: 'east' },  // B — unconnected, has free input
      ],
      [],
    )
    const A = factory.getMachineAt(5, 5)!
    const B = factory.getMachineAt(8, 5)!
    expect(factory.getFreeSlotsOfType(B, 'input').length).toBeGreaterThan(0)
    expectFactoryState(factory, {
      grid: { box: [3, 3, 10, 8], expected: [
          '| | | | | | | | |',
          '| | |R| | | | | |',
          '| |R|F|R| |F| | |',
          '| | |R| | | | | |',
          '| | | | | | | | |',
          '| | | | | | | | |',
        ].join('\n') },
      machines: [
        { x: 5, z: 5, rotation: 'south' },
        { x: 5, z: 4, rotation: 'south' },
        { x: 5, z: 6, rotation: 'south' },
        { x: 4, z: 5, rotation: 'south' },
        { x: 6, z: 5, rotation: 'south' },
        { x: 8, z: 5, rotation: 'east' },
      ],
      belts: [],
    })

    // WHEN — explicit OUTPUT-slot drag from A's 'front' to B
    const result = factory.computeBeltFromSlotPath(
      { x: A.x, z: A.z },
      { x: B.x, z: B.z },
      'output',
      { fixedRotations: false, sourceSlotPosition: 'front', tryReverseSlotType: true },
    )

    // THEN — either null OR a colliding (red-ghost) plan whose flow direction
    // is still A → B (NOT reversed). Specifically, no successful (collides=false)
    // plan may be returned that starts at B (which would indicate the reverse
    // fallback silently fired).
    if (result !== null) {
      const reversed = result.path[0].x === B.x && result.path[0].z === B.z
      expect(
        reversed && !result.collides,
        'reverse-slot fallback must NOT fire when the explicit direction has a free target slot',
      ).toBe(false)
    }

    // AND — A's rotation must still be 'south' (no side-effect from a hidden
    // reverse-direction successful plan).
    expect(factory.getMachineAt(5, 5)!.rotation).toBe('south')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RED-step tests for the candidate-rotation alignment scoring contract.
//
// CONTEXT: When the source machine is unconnected and the planner iterates
// over candidate source rotations, ties (and sometimes near-ties) are
// currently broken purely by path length. This causes a winding belt with a
// slot pointing AWAY from the target to win over a slot-aligned rotation
// whose belt is one cell longer. The fix introduces an alignment score:
//   alignmentScore = sign(targetDir.x) * slotDir.x + sign(targetDir.z) * slotDir.z
// where targetDir = (target - source) and slotDir is the unit vector of the
// chosen source slot under the candidate rotation. The candidate with the
// highest alignment score wins; path length is the tie-break.
// ─────────────────────────────────────────────────────────────────────────────

describe('candidate-rotation scoring prefers slot pointing toward target', () => {
  it('prefers rotation where source slot direction is closest to target direction over a shorter winding path', () => {
    // GIVEN — F2 at (5,5) UNCONNECTED, F3 at (9,5) UNCONNECTED.
    // Target direction = (+1, 0) (east).
    //
    // F2.front (output) under each rotation:
    //   east  → (6,5)  alignmentScore = +1   (BLOCKED by recycler)
    //   west  → (4,5)  alignmentScore = -1
    //   north → (5,4)  alignmentScore =  0
    //   south → (5,6)  alignmentScore =  0
    //
    // Block (6,5) so 'east' collides. Among the remaining three:
    //   - 'west' has dot=-1 (slot points AWAY from target)
    //   - 'north' and 'south' both have dot=0
    //
    // The new contract: alignment-preferred rotation must win over a
    // strictly-shorter misaligned rotation. To force the divergence we make
    // the 'west' route VERY short via a free corridor west of F2 that wraps
    // back via (5,3)→(6,3)→(7,3)→...→F3, while 'south' is 1+ cells longer.
    //
    // Setup: leave most of the grid clear, but block (6,5) only. The relaxed
    // router will then find:
    //   - 'west':  (5,5)→(4,5)→(4,4)→(5,4)? No — (5,4) is free; route may
    //              instead be (5,5)→(4,5)→(4,4)→(5,4)→(6,4)→(7,4)→(8,4)→
    //              (9,4)→F3(9,5).back at (9,4)? Depends on F3 rotation.
    //   - 'south': (5,5)→(5,6)→...
    //
    // Rather than micro-engineering relaxed-router lengths, we use the
    // following deterministic geometry: place a wall of recyclers at
    // (5,6)..(8,6) so 'south' MUST detour further south, and leave (4,5)
    // and the row z=4 free so 'west' has a clean S-shape. We then assert
    // that the ALIGNMENT-preferred rotation wins regardless of which
    // tied-alignment (north/south) ends up shorter — i.e. the chosen
    // rotation must NOT be 'west' (the misaligned-but-shorter one).
    const factory = new Factory(15, 15)
    factory.restoreState(
      [
        { x: 5, z: 5, type: 'part_fabricator', rotation: 'south' }, // F2 — unconnected
        { x: 9, z: 5, type: 'part_fabricator', rotation: 'west' },  // F3 — input 'back' at (10,5)
        { x: 6, z: 5, type: 'recycler', rotation: 'south' },        // blocks F2.front 'east'
        // Wall south of F2: forces 'south' route to detour DOWN further.
        { x: 5, z: 7, type: 'recycler', rotation: 'south' },
        { x: 6, z: 7, type: 'recycler', rotation: 'south' },
        { x: 7, z: 7, type: 'recycler', rotation: 'south' },
        { x: 8, z: 7, type: 'recycler', rotation: 'south' },
      ],
      [],
    )
    const F2 = factory.getMachineAt(5, 5)!
    const F3 = factory.getMachineAt(9, 5)!
    expectFactoryState(factory, {
      grid: { box: [3, 3, 11, 9], expected: [
          '| | | | | | | | | |',
          '| | | | | | | | | |',
          '| | |F|R| | |F| | |',
          '| | | | | | | | | |',
          '| | |R|R|R|R| | | |',
          '| | | | | | | | | |',
          '| | | | | | | | | |',
        ].join('\n') },
      machines: [
        { x: 5, z: 5, rotation: 'south' },
        { x: 9, z: 5, rotation: 'west' },
        { x: 6, z: 5, rotation: 'south' },
        { x: 5, z: 7, rotation: 'south' },
        { x: 6, z: 7, rotation: 'south' },
        { x: 7, z: 7, rotation: 'south' },
        { x: 8, z: 7, rotation: 'south' },
      ],
      belts: [],
    })

    // PRE-CONDITION SANITY — confirm the obstacles really do make 'west'
    // (misaligned) shorter than 'south' (tied-alignment with 'north') under
    // the current implementation.
    const probeW = new Factory(15, 15)
    probeW.restoreState(
      [
        { x: 5, z: 5, type: 'part_fabricator', rotation: 'west' },
        { x: 9, z: 5, type: 'part_fabricator', rotation: 'west' },
        { x: 6, z: 5, type: 'recycler', rotation: 'south' },
        { x: 5, z: 7, type: 'recycler', rotation: 'south' },
        { x: 6, z: 7, type: 'recycler', rotation: 'south' },
        { x: 7, z: 7, type: 'recycler', rotation: 'south' },
        { x: 8, z: 7, type: 'recycler', rotation: 'south' },
      ],
      [],
    )
    const okW = probeW.placeBeltChain(
      probeW.getMachineAt(5, 5)!, probeW.getMachineAt(9, 5)!,
      'output', { fixedRotations: true, sourceSlotPosition: 'front' },
    )
    expect(okW, 'precondition: west-rotation belt must be placeable').toBe(true)

    // WHEN — drag from F2's 'front' output slot to F3.
    const ok = factory.placeBeltChain(
      F2, F3, 'output',
      { sourceSlotPosition: 'front' },
    )
    expectFactoryState(factory, {
      grid: { box: [3, 3, 11, 9], expected: [
          '| | | | | | | | | |',
          '| | | | | | | | | |',
          '| | |F|R| | |F| | |',
          '| | |└|─|─|─|┘| | |',
          '| | |R|R|R|R| | | |',
          '| | | | | | | | | |',
          '| | | | | | | | | |',
        ].join('\n') },
      machines: [
        { x: 5, z: 5, rotation: 'south' },
        { x: 9, z: 5, rotation: 'north' },
        { x: 6, z: 5, rotation: 'south' },
        { x: 5, z: 7, rotation: 'south' },
        { x: 6, z: 7, rotation: 'south' },
        { x: 7, z: 7, rotation: 'south' },
        { x: 8, z: 7, rotation: 'south' },
      ],
      belts: [
        {
          source: { x: 5, z: 5 },
          destination: { x: 9, z: 5 },
          path: [{ x: 5, z: 5 }, { x: 5, z: 6 }, { x: 6, z: 6 }, { x: 7, z: 6 }, { x: 8, z: 6 }, { x: 9, z: 6 }, { x: 9, z: 5 }],
        },
      ],
    })

    // THEN — placement succeeds and F2's chosen rotation is one of the
    // tied-alignment winners ('north' or 'south', both dot=0), NOT the
    // misaligned 'west' (dot=-1). Currently the planner picks 'west' because
    // it produces the shortest non-colliding path.
    expect(ok).toBe(true)
    const F2After = factory.getMachineAt(5, 5)!
    expect(
      F2After.rotation,
      `alignment-preferred rotation must win — got ${F2After.rotation}; 'west' means misaligned-but-shorter won`,
    ).not.toBe('west')
    // Sanity: must be one of the tied-alignment options or 'east' (which is
    // blocked, so it shouldn't be picked, but we permit any aligned outcome).
    expect(['north', 'south', 'east']).toContain(F2After.rotation)
  })

  it('falls back to shortest path when no rotation aligns with target direction', () => {
    // GIVEN — F2 at (5,5), F3 directly NORTH at (5,2).
    // Target direction = (0, -1).
    //
    // F2.front under each rotation (alignment dot with (0,-1)):
    //   north → (5,4)  dot = +1 (perfectly aligned — BLOCKED by recycler)
    //   south → (5,6)  dot = -1 (BLOCKED — recycler)
    //   east  → (6,5)  dot =  0
    //   west  → (4,5)  dot =  0
    //
    // With 'north' and 'south' blocked, only 'east' and 'west' remain — both
    // tied at dot=0. The shortest-path tie-break must then pick the rotation
    // whose belt is shorter. We make 'east' shorter by placing F3 such that
    // F3.input is at (5,1) (rotation 'south' on F3) and clearing the eastern
    // approach; the western approach must detour around an obstacle.
    const factory = new Factory(15, 15)
    factory.restoreState(
      [
        { x: 5, z: 5, type: 'part_fabricator', rotation: 'east' },  // F2 — unconnected
        { x: 5, z: 2, type: 'part_fabricator', rotation: 'south' }, // F3 — input 'back' at (5,1)
        { x: 5, z: 4, type: 'recycler', rotation: 'south' },        // blocks F2.front 'north'
        { x: 5, z: 6, type: 'recycler', rotation: 'south' },        // blocks F2.front 'south'
        // Force the WEST route to detour: block (4,4) and (4,3) so a
        // west-rotation belt cannot go straight up the x=4 column.
        { x: 4, z: 4, type: 'recycler', rotation: 'south' },
        { x: 4, z: 3, type: 'recycler', rotation: 'south' },
      ],
      [],
    )
    const F2 = factory.getMachineAt(5, 5)!
    const F3 = factory.getMachineAt(5, 2)!
    expectFactoryState(factory, {
      grid: { box: [3, 0, 7, 7], expected: [
          '| | | | | |',
          '| | | | | |',
          '| | |F| | |',
          '| |R| | | |',
          '| |R|R| | |',
          '| | |F| | |',
          '| | |R| | |',
          '| | | | | |',
        ].join('\n') },
      machines: [
        { x: 5, z: 5, rotation: 'east' },
        { x: 5, z: 2, rotation: 'south' },
        { x: 5, z: 4, rotation: 'south' },
        { x: 5, z: 6, rotation: 'south' },
        { x: 4, z: 4, rotation: 'south' },
        { x: 4, z: 3, rotation: 'south' },
      ],
      belts: [],
    })

    // WHEN — drag from F2's 'front' output slot to F3.
    const ok = factory.placeBeltChain(
      F2, F3, 'output',
      { sourceSlotPosition: 'front' },
    )
    expectFactoryState(factory, {
      grid: { box: [3, 0, 7, 7], expected: [
          '| | | | | |',
          '| | | | | |',
          '| | |F|┐| |',
          '| |R| |│| |',
          '| |R|R|│| |',
          '| | |F|┘| |',
          '| | |R| | |',
          '| | | | | |',
        ].join('\n') },
      machines: [
        { x: 5, z: 5, rotation: 'east' },
        { x: 5, z: 2, rotation: 'west' },
        { x: 5, z: 4, rotation: 'south' },
        { x: 5, z: 6, rotation: 'south' },
        { x: 4, z: 4, rotation: 'south' },
        { x: 4, z: 3, rotation: 'south' },
      ],
      belts: [
        {
          source: { x: 5, z: 5 },
          destination: { x: 5, z: 2 },
          path: [{ x: 5, z: 5 }, { x: 6, z: 5 }, { x: 6, z: 4 }, { x: 6, z: 3 }, { x: 6, z: 2 }, { x: 5, z: 2 }],
        },
      ],
    })

    // THEN — placement succeeds; among the two tied-alignment candidates
    // ('east' and 'west'), the shorter path wins ('east').
    expect(ok).toBe(true)
    const F2After = factory.getMachineAt(5, 5)!
    expect(
      F2After.rotation,
      `length tie-break among equal-alignment rotations must pick 'east' (shorter); got ${F2After.rotation}`,
    ).toBe('east')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RED-step tests for the slot-blocking constraint during candidate-rotation
// iteration in `PlacementPlanner.computePlacementPlan`.
//
// CONTRACT: When the planner iterates the 4 candidate rotations of an
// UNCONNECTED source machine, it MUST skip any candidate rotation that would
// violate the same slot-blocking constraint enforced by `Factory.rotateMachine`
// (`isSlotBlocked`):
//   1. A slot of the source machine at the candidate rotation must NOT point
//      directly at any neighboring machine.
//   2. No neighboring machine's slot must point directly at the source cell.
//
// These tests pin the bug visible in the user-reported screenshot: with three
// part_fabricators in an L-shape, dragging from the middle fabricator's slot
// to a third machine produces a chosen rotation whose input/output slot points
// straight into the body of an adjacent fabricator — a slot-blocking violation
// that `rotateMachine` would have refused, but the planner happily commits.
// ─────────────────────────────────────────────────────────────────────────────

describe('slot-blocking constraint during candidate-rotation iteration', () => {
  it('skips candidate source rotations whose slot points at a neighboring machine', () => {
    // GIVEN — a part_fabricator (F_neighbor) sits directly NORTH of the
    // unconnected source (F_src). F_neighbor is rotated 'east' so its OWN
    // slots point along the x-axis (front=(3,1), back=(1,1)) — they do NOT
    // point at the source cell, isolating the test to the source's own
    // slot-blocking constraint. The drop target (F_target) is far east.
    //
    // part_fabricator slots: inputs=['back'], outputs=['front'].
    // For F_src at (2,2) with each candidate rotation:
    //   - 'north': front → (2,1) = F_neighbor   ✗ slot-blocking VIOLATION
    //   - 'south': back  → (2,1) = F_neighbor   ✗ slot-blocking VIOLATION
    //   - 'east' : front → (3,2), back → (1,2)  — both empty, OK
    //   - 'west' : front → (1,2), back → (3,2)  — both empty, OK
    //
    // The user drags from F_src's clicked 'front' OUTPUT slot to F_target.
    const factory = new Factory(10, 10)
    factory.restoreState(
      [
        { x: 2, z: 1, type: 'part_fabricator', rotation: 'east' },  // F_neighbor
        { x: 2, z: 2, type: 'part_fabricator', rotation: 'south' }, // F_src — unconnected
        { x: 5, z: 2, type: 'part_fabricator', rotation: 'east' },  // F_target
      ],
      [],
    )
    const src = factory.getMachineAt(2, 2)!
    const tgt = factory.getMachineAt(5, 2)!

    // ASSERT — initial layout snapshot.
    expect(renderGrid(factory, 1, 0, 6, 3)).toBe([
      '| | | | | | |',
      '| |F| | | | |',
      '| |F| | |F| |',
      '| | | | | | |',
    ].join('\n'))

    // SANITY — confirm `rotateMachine` itself refuses the violating rotations
    // when applied directly. This proves the constraint exists and that the
    // planner is being inconsistent with it.
    const probe = new Factory(10, 10)
    probe.restoreState(
      [
        { x: 2, z: 1, type: 'part_fabricator', rotation: 'east' },
        { x: 2, z: 2, type: 'part_fabricator', rotation: 'south' },
      ],
      [],
    )
    const probeSrc = probe.getMachineAt(2, 2)!
    // rotateMachine internally cycles CW from the requested rotation past any
    // blocked candidates. Asking for 'south' (currently set, also blocked
    // because back→neighbor) should land on the FIRST non-blocked rotation
    // ('west' — south→CW→west).
    probe.rotateMachine(probeSrc, 'south')
    expect(
      probe.getMachineAt(2, 2)!.rotation,
      'rotateMachine must skip slot-blocking-violating rotations',
    ).not.toBe('south')
    expect(
      probe.getMachineAt(2, 2)!.rotation,
      'rotateMachine must skip slot-blocking-violating rotations',
    ).not.toBe('north')

    // WHEN — drag from F_src's clicked 'front' OUTPUT slot to F_target.
    const ok = factory.placeBeltChain(
      src, tgt, 'output',
      { sourceSlotPosition: 'front' },
    )
    expectFactoryState(factory, {
      grid: { box: [0, 0, 6, 4], expected: [
          '| | | | | | | |',
          '| | |F| | | | |',
          '| | |F|┐| |F| |',
          '| | | |└|─|┘| |',
          '| | | | | | | |',
        ].join('\n') },
      machines: [
        { x: 2, z: 1, rotation: 'east' },
        { x: 2, z: 2, rotation: 'east' },
        { x: 5, z: 2, rotation: 'north' },
      ],
      belts: [
        {
          source: { x: 2, z: 2 },
          destination: { x: 5, z: 2 },
          path: [{ x: 2, z: 2 }, { x: 3, z: 2 }, { x: 3, z: 3 }, { x: 4, z: 3 }, { x: 5, z: 3 }, { x: 5, z: 2 }],
        },
      ],
    })

    // THEN — placement must succeed (a valid rotation exists), and the
    // chosen source rotation MUST honour the slot-blocking constraint:
    // neither 'north' nor 'south' is acceptable.
    expect(ok, 'placeBeltChain must succeed via a slot-blocking-respecting rotation').toBe(true)
    const srcAfter = factory.getMachineAt(2, 2)!
    expect(
      srcAfter.rotation,
      `slot-blocking VIOLATION: F_src rotated to '${srcAfter.rotation}', whose slot points at neighbor at (2,1)`,
    ).not.toBe('north')
    expect(
      srcAfter.rotation,
      `slot-blocking VIOLATION: F_src rotated to '${srcAfter.rotation}', whose back slot points at neighbor at (2,1)`,
    ).not.toBe('south')
    expect(['east', 'west']).toContain(srcAfter.rotation)
  })

  it('returns null/red-ghost when EVERY candidate rotation violates slot-blocking', () => {
    // GIVEN — F_src surrounded on all 4 cardinal sides by part_fabricators
    // rotated 'east' so each one occupies a neighbor cell. Every rotation
    // of F_src puts its 'front' or 'back' slot directly into one of those
    // neighbors → all 4 candidates violate slot-blocking.
    //
    // The drop target sits diagonally far away with a clear free 'back'
    // input slot, so the reverse-slot-type fallback (which only fires when
    // the target has NO free slot of the complementary type) MUST NOT fire.
    const factory = new Factory(10, 10)
    factory.restoreState(
      [
        { x: 1, z: 2, type: 'part_fabricator', rotation: 'east' },  // W neighbor
        { x: 3, z: 2, type: 'part_fabricator', rotation: 'east' },  // E neighbor
        { x: 2, z: 1, type: 'part_fabricator', rotation: 'east' },  // N neighbor
        { x: 2, z: 3, type: 'part_fabricator', rotation: 'east' },  // S neighbor
        { x: 2, z: 2, type: 'part_fabricator', rotation: 'south' }, // F_src — unconnected, fully surrounded
        { x: 7, z: 7, type: 'part_fabricator', rotation: 'east' },  // F_target — has free 'back' input slot
      ],
      [],
    )

    // SANITY — F_target's INPUT slot is free; reverse-slot fallback would not
    // fire even if requested (its trigger requires NO free target slot of the
    // complementary type).
    const tgt = factory.getMachineAt(7, 7)!
    expect(factory.getFreeSlotsOfType(tgt, 'input').length).toBeGreaterThan(0)
    const SURROUNDED_T13 = {
      grid: { box: [0, 0, 8, 8] as [number, number, number, number], expected: [
          '| | | | | | | | | |',
          '| | |F| | | | | | |',
          '| |F|F|F| | | | | |',
          '| | |F| | | | | | |',
          '| | | | | | | | | |',
          '| | | | | | | | | |',
          '| | | | | | | | | |',
          '| | | | | | | |F| |',
          '| | | | | | | | | |',
        ].join('\n') },
      machines: [
        { x: 1, z: 2, rotation: 'east' as const },
        { x: 3, z: 2, rotation: 'east' as const },
        { x: 2, z: 1, rotation: 'east' as const },
        { x: 2, z: 3, rotation: 'east' as const },
        { x: 2, z: 2, rotation: 'south' as const },
        { x: 7, z: 7, rotation: 'east' as const },
      ],
      belts: [],
    }
    expectFactoryState(factory, SURROUNDED_T13)

    // WHEN — ghost preview from F_src.front OUTPUT slot to F_target.
    const result = factory.computeBeltFromSlotPath(
      { x: 2, z: 2 }, { x: 7, z: 7 }, 'output',
      { sourceSlotPosition: 'front' },
    )

    // THEN — every candidate rotation violates slot-blocking, so the
    // planner must report no valid placement: either a null result OR a
    // RED-ghost (collides=true) plan rendered from the original rotation.
    // Reverse-slot fallback is NOT requested and cannot apply (target has
    // free input slot), so the planner must NOT silently succeed.
    if (result !== null) {
      expect(
        result.collides,
        `slot-blocking VIOLATION: every rotation of F_src is blocked, so the ghost MUST be RED (collides=true), got collides=${result.collides}`,
      ).toBe(true)
    }

    // AND — committing the same drag must NOT succeed and must NOT mutate
    // F_src's rotation (no rotation is valid).
    const src = factory.getMachineAt(2, 2)!
    const ok = factory.placeBeltChain(
      src, tgt, 'output',
      { sourceSlotPosition: 'front' },
    )
    // THEN — unchanged factory state.
    expectFactoryState(factory, SURROUNDED_T13)
    expect(
      ok,
      'placeBeltChain must reject when every candidate source rotation violates slot-blocking',
    ).toBe(false)
    expect(
      factory.getMachineAt(2, 2)!.rotation,
      'failed iteration must NOT side-effect F_src rotation',
    ).toBe('south')
  })

  it('does NOT skip Direction-2-violating candidates when the layout is already pre-violating (suppression carve-out)', () => {
    // GIVEN — F_src at (5,5) with neighbor at (5,4) whose 'front' OUTPUT
    // slot points DIRECTLY at F_src's cell. That makes the layout already
    // slot-blocking-pre-violating from F_src's perspective; the planner's
    // Direction-2 check (source's own slots may not point at occupied
    // neighbors) MUST be suppressed for ALL candidate rotations of F_src.
    //
    // Two flanker neighbors at (4,5) and (6,5) (rotated so their own slots
    // run along the z-axis, NOT toward F_src — keeping the only pre-violator
    // the (5,4) one) ensure that EVERY candidate rotation of F_src has at
    // least one of its own slots pointing at an occupied neighbor:
    //
    //   - 'south': back  → (5,4) ✗
    //   - 'north': front → (5,4) ✗
    //   - 'east' : front → (6,5), back → (4,5) ✗  ← the candidate from the
    //                                              code-reviewer's spec:
    //                                              another slot of F_src
    //                                              points at neighbor (6,5)
    //   - 'west' : front → (4,5), back → (6,5) ✗
    //
    // Without the pre-violating-layout suppression, the Direction-2 gate
    // would skip ALL 4 candidates and `placeBeltChain` would fail.
    // With the suppression, every candidate (including the 'east' one
    // pointing another slot at (6,5)) is still considered, and the drag
    // succeeds.
    const factory = new Factory(10, 12)
    factory.restoreState(
      [
        // Pre-violating: south rotation → front offset (0,+1) → points at (5,5).
        { x: 5, z: 4, type: 'part_fabricator', rotation: 'south' },
        // Flankers — slots along z-axis, do NOT point at (5,5).
        { x: 4, z: 5, type: 'part_fabricator', rotation: 'south' },
        { x: 6, z: 5, type: 'part_fabricator', rotation: 'south' },
        // F_src — unconnected, every candidate rotation Direction-2-violates.
        { x: 5, z: 5, type: 'part_fabricator', rotation: 'south' },
        // F_target — far enough to be reachable around the flankers.
        { x: 5, z: 9, type: 'part_fabricator', rotation: 'north' },
      ],
      [],
    )
    const src = factory.getMachineAt(5, 5)!
    const tgt = factory.getMachineAt(5, 9)!
    expectFactoryState(factory, {
      grid: { box: [3, 3, 7, 10], expected: [
          '| | | | | |',
          '| | |F| | |',
          '| |F|F|F| |',
          '| | | | | |',
          '| | | | | |',
          '| | | | | |',
          '| | |F| | |',
          '| | | | | |',
        ].join('\n') },
      machines: [
        { x: 5, z: 4, rotation: 'south' },
        { x: 4, z: 5, rotation: 'south' },
        { x: 6, z: 5, rotation: 'south' },
        { x: 5, z: 5, rotation: 'south' },
        { x: 5, z: 9, rotation: 'north' },
      ],
      belts: [],
    })

    // WHEN — drag from F_src's clicked 'front' OUTPUT slot to F_target.
    const ok = factory.placeBeltChain(
      src, tgt, 'output',
      { sourceSlotPosition: 'front' },
    )
    expectFactoryState(factory, {
      grid: { box: [3, 3, 7, 10], expected: [
          '| | | | | |',
          '| | |F| | |',
          '| |F|F|F| |',
          '| | |│| | |',
          '| | |│| | |',
          '| | |│| | |',
          '| | |F| | |',
          '| | | | | |',
        ].join('\n') },
      machines: [
        { x: 5, z: 4, rotation: 'south' },
        { x: 4, z: 5, rotation: 'south' },
        { x: 6, z: 5, rotation: 'south' },
        { x: 5, z: 5, rotation: 'south' },
        { x: 5, z: 9, rotation: 'south' },
      ],
      belts: [
        {
          source: { x: 5, z: 5 },
          destination: { x: 5, z: 9 },
          path: [{ x: 5, z: 5 }, { x: 5, z: 6 }, { x: 5, z: 7 }, { x: 5, z: 8 }, { x: 5, z: 9 }],
        },
      ],
    })

    // THEN — placement succeeds. Success is only possible if the
    // pre-violating-layout suppression fired; without it, every candidate
    // (including the 'east' one whose front would point at neighbor (6,5))
    // would have been skipped and the planner would have produced no plan.
    expect(
      ok,
      'pre-violating-layout suppression must allow Direction-2-violating candidates',
    ).toBe(true)
  })
})