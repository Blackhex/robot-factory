/**
 * @vitest-environment jsdom
 *
 * Focused source-slot fallback contract tests for GridInteraction belt placement.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createMockSceneManager } from './helpers/GridInteractionTestHarness'

import { initI18n } from '../../../src/i18n/i18n'
import { Factory } from '../../../src/game/Factory'
import { GridInteraction } from '../../../src/rendering/GridInteraction'
import { expectFactoryState } from '../helpers/factoryAssert'

beforeAll(async () => {
  await initI18n()
})

describe('GridInteraction belt fallback', () => {
  // Regression: when the user drags from a SPECIFIC source slot of a machine
  // (sourceSlotPosition is set) and routing from that slot fails, the system
  // must NOT silently fall back to the REVERSE slot type (input ↔ output) —
  // doing so creates a belt of the wrong semantic direction (e.g. an "output"
  // drag silently produces an INPUT belt to the same machine).
  //
  // Repro scenario (from issue):
  //   A = part_fabricator at (5,5) rot=south → output 'front' faces +z (5,6),
  //                                            input  'back'  faces -z (5,4)
  //   B = part_fabricator at (5,8) rot=south → input 'back' at (5,7)
  //   Belt A.front → B.back occupies (5,6) and (5,7), so A's OUTPUT slot is taken.
  //   C = part_fabricator at (8,8) rot=south.
  //   User drags from A's OUTPUT slot 'front' toward C.
  //
  // Expected contract: when sourceSlotPosition='front' (output) cannot route,
  // tryPlaceBeltChain must fail rather than fall back to A's INPUT slot 'back'.
  describe('tryPlaceBeltChain — source-slot fallback contract', () => {
    it('does NOT silently switch to the opposite slot type when sourceSlotPosition is set and routing fails', () => {
      // GIVEN A → B already wired through A's OUTPUT slot (A.front = (5,6)),
      //       and a third machine C that would be reachable only via A's input.
      const factory = new Factory(15, 15)
      const A = factory.placeMachine(5, 5, 'part_fabricator', 'south')!
      const B = factory.placeMachine(5, 8, 'part_fabricator', 'south')!
      const C = factory.placeMachine(8, 8, 'part_fabricator', 'south')!

      // Wire A.front (output) → B.back (input). After this A's output slot is occupied.
      const wired = factory.placeBeltChain(A, B, 'output')
      expect(wired).toBe(true)
      const beltsAfterSetup = factory.getBelts().length
      expect(beltsAfterSetup).toBe(1)
      const SOURCE_SLOT_FIXTURE = {
        grid: {
          box: [3, 3, 10, 10] as [number, number, number, number],
          expected: [
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | |F| | | | | |',
            '| | |│| | | | | |',
            '| | |│| | | | | |',
            '| | |F| | |F| | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 5, z: 5, rotation: 'south' as const },
          { x: 5, z: 8, rotation: 'south' as const },
          { x: 8, z: 8, rotation: 'south' as const },
        ],
        belts: [
          {
            source: { x: 5, z: 5 },
            destination: { x: 5, z: 8 },
            path: [{ x: 5, z: 5 }, { x: 5, z: 6 }, { x: 5, z: 7 }, { x: 5, z: 8 }],
          },
        ],
      }
      expectFactoryState(factory, SOURCE_SLOT_FIXTURE)

      const sm = createMockSceneManager()
      const interaction = new GridInteraction(sm, factory, vi.fn())

      // WHEN the user drags from A's specific OUTPUT slot 'front' toward C.
      // sourceSlotPosition='front' tells the system: "I clicked THIS slot — do not pick another."
      const placed = (interaction as any).tryPlaceBeltChain(
        A, C, 'output', /* targetSlotPosition */ undefined, /* sourceSlotPosition */ 'front',
      )
      // tryPlaceBeltChain must fail when source-slot routing is impossible — no new belt.
      expectFactoryState(factory, SOURCE_SLOT_FIXTURE)

      // THEN: routing from the chosen output slot fails (it is occupied), so no belt
      // should be placed using A's INPUT slot 'back'. Either nothing was placed, or
      // any newly placed belt must NOT touch A as an input-side endpoint.
      const beltsAfter = factory.getBelts()
      const newBelts = beltsAfter.slice(beltsAfterSetup)

      // The original A → B belt must still exist and be unchanged.
      const originalStillThere = beltsAfter.some(b =>
        b.sourceMachine.id === A.id && b.sourceSlot === 'front' &&
        b.destinationMachine.id === B.id && b.destinationSlot === 'back',
      )
      expect(originalStillThere).toBe(true)

      // No new belt may use A as the destination via its INPUT slot 'back'
      // (this is the buggy reverse-fallback signature).
      const reverseFallbackBelt = newBelts.find(b =>
        b.destinationMachine.id === A.id && b.destinationSlot === 'back',
      )
      expect(reverseFallbackBelt, 'reverse slot-type fallback should not run when sourceSlotPosition is set').toBeUndefined()

      // And tryPlaceBeltChain should report failure when the user-chosen slot cannot route.
      expect(placed, 'tryPlaceBeltChain must fail when the chosen source slot cannot route — it must not silently flip slot type').toBe(false)
    })

    // Regression: when the user explicitly clicks a source slot on an UNCONNECTED
    // (auto-rotatable) machine and a short, non-looping belt is achievable by
    // rotating the source, tryPlaceBeltChain must NOT prefer a strict-rotation
    // belt that loops the long way around the source machine.
    //
    // Repro:
    //   MF = part_fabricator at (5,5) rot='west' → front (output) faces west at (4,5)
    //   D  = part_fabricator at (8,5) rot='west'  (unconnected; auto-rotatable)
    //   User drags from MF's 'front' slot toward D.
    //
    // With strict rotation the only path goes (5,5)→(4,5)→…→loops around→…→D,
    // ≥7 cells, while a relaxed (auto-rotating) attempt could route a short
    // straight 2-cell belt MF→D once MF rotates to 'east'. The current code
    // commits the first successful attempt, which is the looping one.
    it('does not commit a looping strict-rotation belt when sourceSlotPosition is set and a shorter auto-rotating belt is possible', () => {
      const factory = new Factory(20, 20)
      const MF = factory.placeMachine(5, 5, 'part_fabricator', 'south')!
      const D = factory.placeMachine(8, 5, 'part_fabricator', 'south')!

      // Rotate both to 'west'. They are unconnected so rotation must succeed.
      expect(factory.rotateMachine(MF, 'west')).toBe(true)
      expect(factory.rotateMachine(D, 'west')).toBe(true)
      expect(MF.rotation).toBe('west')
      expect(D.rotation).toBe('west')
      expect(factory.getBelts().length).toBe(0)
      expectFactoryState(factory, {
        grid: {
          box: [3, 3, 10, 10],
          expected: [
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | |F| | |F| | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 5, z: 5, rotation: 'west' },
          { x: 8, z: 5, rotation: 'west' },
        ],
        belts: [],
      })

      const sm = createMockSceneManager()
      const interaction = new GridInteraction(sm, factory, vi.fn())

      // User explicitly clicked MF's 'front' (output) slot — currently facing west.
      const placed = (interaction as any).tryPlaceBeltChain(
        MF, D, 'output', /* targetSlotPosition */ undefined, /* sourceSlotPosition */ 'front',
      )
      expectFactoryState(factory, {
        grid: { box: [3, 3, 10, 10], expected: [
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | |F| | |F|┐| |',
            '| | |└|─|─|─|┘| |',
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
            '| | | | | | | | |',
          ].join('\n') },
        machines: [
          { x: 5, z: 5, rotation: 'south' },
          { x: 8, z: 5, rotation: 'west' },
        ],
        belts: [
          {
            source: { x: 5, z: 5 },
            destination: { x: 8, z: 5 },
            path: [{ x: 5, z: 5 }, { x: 5, z: 6 }, { x: 6, z: 6 }, { x: 7, z: 6 }, { x: 8, z: 6 }, { x: 9, z: 6 }, { x: 9, z: 5 }, { x: 8, z: 5 }],
          },
        ],
      })

      expect(placed, 'a belt should be placed (either by auto-rotating MF or routing through a short alternative)').toBe(true)

      // Primary contract assertion: the user clicked MF's 'front' slot. If the
      // implementation kept MF facing 'west', the only way it could have
      // succeeded was the strict long-loop path — which is exactly the bug.
      expect(MF.rotation, 'MF should not remain facing west — that means a long looping strict-rotation belt was committed').not.toBe('west')

      // Secondary safety net: even if a future implementation finds a different
      // short belt without rotating MF, it must NOT loop around MF (no belt cell
      // strictly west of MF), and the total path must be reasonably short.
      // Note: with strict slot-blocking, D's rotation is preserved as 'west',
      // so the belt must enter D from one of D's input sides (back=east at
      // (9,5), left=south at (8,6), or right=north at (8,4)) — the resulting
      // L-route is 8 cells, longer than the previous straight 4-cell path
      // that violated slot-blocking.
      const belts = factory.getBelts()
      const beltCells = belts.flatMap(b => b.path.map(c => ({ x: c.x, z: c.z })))
      const wrapsAroundMF = beltCells.some(c => c.x < MF.x)
      expect(wrapsAroundMF, 'belt must not wrap around MF (no cells west of MF at x=5)').toBe(false)
      expect(beltCells.length, `belt path must be short (≤8 cells), got ${beltCells.length}`).toBeLessThanOrEqual(8)
    })
  })
})