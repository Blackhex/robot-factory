/**
 * @vitest-environment jsdom
 *
 * Focused explicit-slot fallback tests for GridInteraction belt placement.
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

describe('GridInteraction explicit-slot fallback', () => {
  // The Round-4 fix added an `explicitSlot = !!sourceSlotPosition || !!targetSlotPosition`
  // gate in `tryPlaceBeltChain` and `computeBestBeltPath` that COMPLETELY disables
  // the reverse-slot-type fallback when the user clicked a specific slot. This
  // over-corrected: when the explicit-slot direction is geometrically impossible
  // (the only slot of the chosen type is consumed by another belt and there is
  // no free slot of that type elsewhere on the target), the fallback MUST still
  // fire as a LAST RESORT — otherwise the user gets a silent no-op and an
  // ambiguous WHITE ghost.
  describe('explicit-slot drop with no valid same-direction connection', () => {
    it('reverse-slot fallback fires from tryPlaceBeltChain when planner returns null', () => {
      // GIVEN — F1/F2/F3 fixture from SlotDragRotationFallback. F3.output is
      // already consumed by an F3→F1 belt, so a drag from F2's INPUT slot 'back'
      // toward F3 cannot connect under the explicit (input) direction. The
      // last-resort reverse-slot fallback (F2.output → F3.input) must fire.
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
              { x: 3, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 1 }, { x: 1, z: 1 },
            ],
          },
        ],
      )
      const F2 = factory.getMachineAt(1, 2)!
      const F3 = factory.getMachineAt(3, 2)!
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 5, 5],
          expected: [
            '| | | | | | |',
            '| |F|┐| | | |',
            '| |F|└|F| | |',
            '| | | | | | |',
            '| | | | | | |',
            '| | | | | | |',
          ].join('\n'),
        },
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

      const sm = createMockSceneManager()
      const interaction = new GridInteraction(sm, factory, vi.fn())

      const beltsBefore = factory.getBelts().length

      // WHEN — call tryPlaceBeltChain via bracket access (private)
      const placed = (interaction as any).tryPlaceBeltChain(
        F2, F3, 'input', /* targetSlotPosition */ undefined, /* sourceSlotPosition */ 'back',
      )
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 5, 5],
          expected: [
            '| | | | | | |',
            '| |F|┐| | | |',
            '|┌|F|└|F|┐| |',
            '|└|─|─|─|┘| |',
            '| | | | | | |',
            '| | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 1, z: 1, rotation: 'west' },
          { x: 1, z: 2, rotation: 'west' },
          { x: 3, z: 2, rotation: 'west' },
        ],
        belts: [
          {
            source: { x: 3, z: 2 },
            destination: { x: 1, z: 1 },
            path: [{ x: 3, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 1 }, { x: 1, z: 1 }],
          },
          {
            source: { x: 1, z: 2 },
            destination: { x: 3, z: 2 },
            path: [{ x: 1, z: 2 }, { x: 0, z: 2 }, { x: 0, z: 3 }, { x: 1, z: 3 }, { x: 2, z: 3 }, { x: 3, z: 3 }, { x: 4, z: 3 }, { x: 4, z: 2 }, { x: 3, z: 2 }],
          },
        ],
      })

      // THEN — placement succeeds via the reverse-slot fallback, and the
      // resulting belt's flow direction is REVERSED: F2 → F3 (output → input).
      expect(placed, 'reverse-slot fallback must fire as last resort when explicit-slot direction is impossible').toBe(true)
      const belts = factory.getBelts()
      expect(belts.length).toBe(beltsBefore + 1)
      const newBelt = belts.find(b =>
        b.sourceMachine.id === F2.id && b.destinationMachine.id === F3.id,
      )
      expect(newBelt, 'new belt must be F2 (output) → F3 (input)').toBeDefined()
      // F2's rotation may have changed to make the output slot face F3.
      const F2After = factory.getMachineAt(1, 2)!
      expect(['west', 'south', 'north']).toContain(F2After.rotation)
    })

    it('computeBestBeltPath returns red ghost (collides=true) when planner returns null AND reverse fallback also fails', () => {
      // GIVEN — a layout where neither direction can route. A is fully boxed
      // in by recyclers on all 4 sides AND B has no free slots either: B is
      // ringed by belts on every side via dummy connections. We approximate
      // this by surrounding A with recyclers and placing B (target) such that
      // its only input cell is also blocked.
      //
      // Simpler: place A at (5,5) ringed by recyclers (no rotation works
      // for A.front in any direction), and B at (8,5) ALSO ringed so its
      // input slots are all blocked. Then both 'output' and 'input'
      // (reverse) fail.
      const factory = new Factory(15, 15)
      factory.restoreState(
        [
          { x: 5, z: 5, type: 'part_fabricator', rotation: 'south' }, // A
          { x: 5, z: 4, type: 'recycler', rotation: 'south' },
          { x: 5, z: 6, type: 'recycler', rotation: 'south' },
          { x: 4, z: 5, type: 'recycler', rotation: 'south' },
          { x: 6, z: 5, type: 'recycler', rotation: 'south' },
          { x: 8, z: 5, type: 'part_fabricator', rotation: 'east' },  // B
          { x: 8, z: 4, type: 'recycler', rotation: 'south' },
          { x: 8, z: 6, type: 'recycler', rotation: 'south' },
          { x: 7, z: 5, type: 'recycler', rotation: 'south' },
          { x: 9, z: 5, type: 'recycler', rotation: 'south' },
        ],
        [],
      )
      const A = factory.getMachineAt(5, 5)!
      const B = factory.getMachineAt(8, 5)!
      const BOXED_FIXTURE = {
        grid: {
          box: [3, 3, 10, 7] as [number, number, number, number],
          expected: [
            '| | | | | | | | |',
            '| | |R| | |R| | |',
            '| |R|F|R|R|F|R| |',
            '| | |R| | |R| | |',
            '| | | | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 5, z: 5, rotation: 'south' as const },
          { x: 5, z: 4, rotation: 'south' as const },
          { x: 5, z: 6, rotation: 'south' as const },
          { x: 4, z: 5, rotation: 'south' as const },
          { x: 6, z: 5, rotation: 'south' as const },
          { x: 8, z: 5, rotation: 'east' as const },
          { x: 8, z: 4, rotation: 'south' as const },
          { x: 8, z: 6, rotation: 'south' as const },
          { x: 7, z: 5, rotation: 'south' as const },
          { x: 9, z: 5, rotation: 'south' as const },
        ],
        belts: [],
      }
      expectFactoryState(factory, BOXED_FIXTURE)

      const sm = createMockSceneManager()
      const interaction = new GridInteraction(sm, factory, vi.fn())

      // WHEN — compute the best belt path with explicit source slot
      const result = (interaction as any).computeBestBeltPath(
        { x: A.x, z: A.z }, { x: B.x, z: B.z }, 'output',
        /* ignoreBeltIds       */ undefined,
        /* targetSlotPosition  */ undefined,
        /* sourceSlotPosition  */ 'front',
      )
      // computeBestBeltPath does not mutate state.
      expectFactoryState(factory, BOXED_FIXTURE)

      // THEN — the UI must NOT receive a result that it would render as a
      // valid GREEN ghost. Acceptable outcomes:
      //   (a) result === null  → UI shows the red coarse-feasibility ghost.
      //   (b) result !== null AND result.collides === true → UI shows red.
      //
      // Both outcomes are acceptable; the planner currently returns null when
      // no rotation/path satisfies the strict slot-blocking invariant for
      // either direction.
      if (result !== null) {
        expect(result.collides, 'returned plan must be marked colliding so UI renders red ghost').toBe(true)
      }
    })
  })
})