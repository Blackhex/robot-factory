import { describe, it, expect } from 'vitest'
import { Factory } from '../../../src/game/Factory'
import type { GridPosition, MachineInfo } from '../../../src/game/types'
import { expectFactoryState } from '../helpers/factoryAssert'

// ─── Rule-7 (SKILL.md): expected state of the fixture before any mutation. ───
const FIXTURE_INITIAL = {
  grid: {
    box: [0, 0, 4, 4] as [number, number, number, number],
    expected: [
      '| | | | | |',
      '| |F|┐| | |',
      '| |F|└|F| |',
      '| | | | | |',
      '| | | | | |',
    ].join('\n'),
  },
  machines: [
    { x: 1, z: 1, rotation: 'west' as const },
    { x: 1, z: 2, rotation: 'east' as const },
    { x: 3, z: 2, rotation: 'west' as const },
  ],
  belts: [
    {
      source: { x: 3, z: 2 },
      destination: { x: 1, z: 1 },
      path: [{ x: 3, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 1 }, { x: 1, z: 1 }],
    },
  ],
}

// ─── Rule-7: expected state after Sub-bug A/B placeBeltChain succeeds. ───
const AFTER_F2_TO_F3_OUTPUT_BELT = {
  grid: {
    box: [0, 0, 4, 4] as [number, number, number, number],
    expected: [
      '| | | | | |',
      '| |F|┐| | |',
      '|┌|F|└|F|┐|',
      '|└|─|─|─|┘|',
      '| | | | | |',
    ].join('\n'),
  },
  machines: [
    { x: 1, z: 1, rotation: 'west' as const },
    { x: 1, z: 2, rotation: 'west' as const },
    { x: 3, z: 2, rotation: 'west' as const },
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
      path: [
        { x: 1, z: 2 }, { x: 0, z: 2 }, { x: 0, z: 3 }, { x: 1, z: 3 }, { x: 2, z: 3 },
        { x: 3, z: 3 }, { x: 4, z: 3 }, { x: 4, z: 2 }, { x: 3, z: 2 },
      ],
    },
  ],
}

/**
 * Reproducer for two reported sub-bugs in the slot-drag rotation flow.
 *
 * Layout (cells are `(x, z)`; x grows east, z grows south):
 *   . . . . .      .  = empty
 *   . F1 B . .     F1 = part_fabricator @ (1,1) rotation='west'  (output 'front' faces west → cell (0,1); input 'back' → cell (2,1))
 *   . . B . .      F2 = part_fabricator @ (1,2) rotation='east'  (output 'front' faces east → cell (2,2); input 'back' → cell (0,2))
 *   . F2 . F3 .    F3 = part_fabricator @ (3,2) rotation='west'  (output 'front' faces west → cell (2,2); input 'back' → cell (4,2))
 *   . . . . .      B  = existing belt cells: (2,2) and (2,1)
 *
 * Existing belt: F3.output (front, west) → ... → F1.input (back, east).
 * Path: F3(3,2) → (2,2) → (2,1) → F1(1,1).
 *
 * F2 has NO existing belts so the planner is free to auto-rotate it.
 */
function buildFixture(): {
  factory: Factory
  F1: MachineInfo
  F2: MachineInfo
  F3: MachineInfo
} {
  const factory = new Factory(10, 10)
  factory.restoreState(
    [
      { x: 1, z: 1, type: 'part_fabricator', rotation: 'west' },
      { x: 1, z: 2, type: 'part_fabricator', rotation: 'east' },
      { x: 3, z: 2, type: 'part_fabricator', rotation: 'west' },
    ],
    [
      // F3.output ('front' at rotation 'west' → offset (-1,0) → cell (2,2))
      // → F1.input  ('back'  at rotation 'west' → offset (+1,0) → cell (2,1))
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

function fmtPath(path: GridPosition[]): string {
  return path.map(p => `(${p.x},${p.z})`).join('→')
}

describe('SlotDragRotationFallback — engine-level reproduction of Round-4 explicit-slot bugs', () => {
  it('fixture sanity: F1/F2/F3 placed correctly and existing belt is between F3.output and F1.input', () => {
    const { factory, F1, F2, F3 } = buildFixture()
    expectFactoryState(factory, FIXTURE_INITIAL)
    expect(F1.rotation).toBe('west')
    expect(F2.rotation).toBe('east')
    expect(F3.rotation).toBe('west')
    const belts = factory.getBelts()
    expect(belts).toHaveLength(1)
    expect(belts[0].sourceMachine.id).toBe(F3.id)
    expect(belts[0].destinationMachine.id).toBe(F1.id)
    expect(fmtPath(belts[0].path)).toBe('(3,2)→(2,2)→(2,1)→(1,1)')
  })

  // ─── SUB-BUG A: drag from F2's GREEN (input) slot to F3 ─────────────
  // dragSourceSlotType='input', sourceSlotPosition='back' (F2 has only one input).
  // Semantically: the user wants F3 → F2.input. But F3's only output slot is
  // already consumed by the belt to F1, so this connection is impossible.
  // The user's actual intent is "connect F2 and F3", which CAN be satisfied
  // via F2.output → F3.input (the reverse-slot-type fallback).
  describe('Sub-bug A: drag from F2.input(green) → F3', () => {
    it('computeBeltFromSlotPath now succeeds via the reverse-slot-type fallback (F2.output → F3.input)', () => {
      const { factory, F2, F3 } = buildFixture()
      expectFactoryState(factory, FIXTURE_INITIAL)
      const result = factory.computeBeltFromSlotPath(
        { x: F2.x, z: F2.z },
        { x: F3.x, z: F3.z },
        'input',
        { sourceSlotPosition: 'back', tryReverseSlotType: true },
      )
      // The planner falls back to the OPPOSITE flow because F3 has no free
      // OUTPUT slot. The returned plan represents F2.output → F3.input.
      // computeBeltFromSlotPath does not mutate state but rule 7 still applies for pathfinding tests.
      expectFactoryState(factory, FIXTURE_INITIAL)
      expect(result).not.toBeNull()
      expect(result!.collides).toBe(false)
      expect(result!.path[0]).toEqual({ x: F2.x, z: F2.z })
      expect(result!.path[result!.path.length - 1]).toEqual({ x: F3.x, z: F3.z })
    })

    it('placeBeltChain with explicit input slot now succeeds via the reverse fallback (belt added, F2 may be auto-rotated)', () => {
      const { factory, F2, F3 } = buildFixture()
      expectFactoryState(factory, FIXTURE_INITIAL)
      // GridInteraction passes tryReverseSlotType=true on explicit-slot drags
      // to enable the LAST-RESORT reverse-slot fallback at the planner level.
      const placed = factory.placeBeltChain(
        F2, F3,
        'input',
        { sourceSlotPosition: 'back', tryReverseSlotType: true },
      )
      expectFactoryState(factory, AFTER_F2_TO_F3_OUTPUT_BELT)
      expect(placed).toBe(true)
      // A new belt was added (in addition to the original F3→F1 belt).
      expect(factory.getBelts()).toHaveLength(2)
      const belts = factory.getBelts()
      const newBelt = belts.find(b => b.sourceMachine.id === F2.id && b.destinationMachine.id === F3.id)
      expect(newBelt, 'reverse fallback must produce an F2 (output) → F3 (input) belt').toBeDefined()
      // F2 may be auto-rotated so its output faces F3. The exact rotation depends
      // on which non-colliding path is shortest, but east is no longer required.
      const F2After = factory.getMachineAt(1, 2)!
      expect(['west', 'south', 'north']).toContain(F2After.rotation)
    })

    it('REVERSE-SLOT-TYPE fallback (sourceSlotType=output, no sourceSlotPosition) WOULD succeed and rotate F2 to face F3', () => {
      const { factory, F2, F3 } = buildFixture()
      expectFactoryState(factory, FIXTURE_INITIAL)
      // This is what the gated reverse-slot-type fallback in
      // GridInteraction.tryPlaceBeltChain would do if it were not gated by
      // `&& !sourceSlotPosition` for the explicit-slot case.
      const placed = factory.placeBeltChain(F2, F3, 'output')
      expectFactoryState(factory, AFTER_F2_TO_F3_OUTPUT_BELT)
      expect(placed).toBe(true)
      const belts = factory.getBelts()
      expect(belts).toHaveLength(2)
      const newBelt = belts.find(b => b.sourceMachine.id === F2.id || b.destinationMachine.id === F2.id)!
      // The new belt should run F2.output → F3.input.
      expect(newBelt.sourceMachine.id).toBe(F2.id)
      expect(newBelt.destinationMachine.id).toBe(F3.id)
      // F2 should have been auto-rotated so its output faces F3 (i.e. rotation 'west',
      // 180° from the original 'east'). The planner picks whichever rotation produces
      // the shortest non-colliding path — log it for diagnostics.
      const F2NewRot = factory.getMachineAt(1, 2)!.rotation
      // eslint-disable-next-line no-console
      console.log('[Sub-bug A reverse-fallback] F2 ended at rotation =', F2NewRot,
        '; new belt path =', fmtPath(newBelt.path))
      // We don't strictly assert which rotation — just that *something* was placed.
      expect(['west', 'south', 'north']).toContain(F2NewRot)
    })
  })

  // ─── SUB-BUG B: drag from F2's ORANGE (output) slot to F3 ───────────
  // dragSourceSlotType='output', sourceSlotPosition='front'.
  // Semantically: the user wants F2.output → F3.input. F3 has a free input
  // slot (cell (4,2)), so this IS satisfiable. But F2's current 'east'
  // rotation makes the output cell (2,2), which is already occupied by the
  // existing belt — so the planner must auto-rotate F2.
  describe('Sub-bug B: drag from F2.output(orange) → F3', () => {
    it('computeBeltFromSlotPath finds a non-colliding path by auto-rotating F2', () => {
      const { factory, F2, F3 } = buildFixture()
      expectFactoryState(factory, FIXTURE_INITIAL)
      const result = factory.computeBeltFromSlotPath(
        { x: F2.x, z: F2.z },
        { x: F3.x, z: F3.z },
        'output',
        { sourceSlotPosition: 'front' },
      )
      // eslint-disable-next-line no-console
      console.log('[Sub-bug B path]', result && { collides: result.collides, path: fmtPath(result.path) })
      // computeBeltFromSlotPath does not mutate state.
      expectFactoryState(factory, FIXTURE_INITIAL)
      expect(result).not.toBeNull()
      // The user reports the resulting belt is "invalid 90°"; capture whether
      // computeBeltFromSlotPath itself reports a collision.
      expect(result!.collides).toBe(false)
    })

    it('placeBeltChain auto-rotates F2 — record the chosen rotation and belt path', () => {
      const { factory, F2, F3 } = buildFixture()
      expectFactoryState(factory, FIXTURE_INITIAL)
      const placed = factory.placeBeltChain(
        F2, F3,
        'output',
        { sourceSlotPosition: 'front' },
      )
      expectFactoryState(factory, AFTER_F2_TO_F3_OUTPUT_BELT)
      const F2After = factory.getMachineAt(1, 2)!
      const belts = factory.getBelts()
      const newBelt = belts.find(b => b.id !== belts[0].id || belts.length === 1) // any new belt
      // eslint-disable-next-line no-console
      console.log('[Sub-bug B placement] placed =', placed,
        ', F2 rotation after =', F2After.rotation,
        ', belt count =', belts.length,
        ', new belt path =', newBelt ? fmtPath(newBelt.path) : '(none)')
      // The user's expected outcome: F2 rotates to 'west' (180° flip from 'east')
      // so its 'front' output slot points at F3.
      // Document the actual behaviour for analysis.
      expect(placed).toBe(true)
      // After the slot-blocking-aware candidate iteration fix, the planner
      // now matches the user's expectation: F2 rotates to 'west' (180° flip
      // so F2.output points directly at F3, then routes around the existing
      // F3→F1 belt). Previously the planner picked 'south' because it
      // ignored the slot-blocking constraint that `rotateMachine` enforces;
      // 'south' would put F2.back input directly into F1's body.
      expect(F2After.rotation).toBe('west')
    })
  })
})
