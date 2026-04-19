import { describe, it, expect } from 'vitest'
import { Factory } from '../../../src/game/Factory'
import { machineSlotPointsAtNeighbor } from '../../../src/game/SlotBlocking'
import { getSlotPositions } from '../../../src/game/SlotUtils'
import type { MachineInfo } from '../../../src/game/types'
import { expectFactoryState, renderGrid } from '../helpers/factoryAssert'

/**
 * Global invariant helper — DESIGN.md "Slot-Blocking Constraint":
 *
 * After any successful belt placement, NO machine on the grid may have one
 * of its own slots pointing at a cell occupied by a different machine.
 *
 * Implemented in terms of `machineSlotPointsAtNeighbor` (the canonical
 * Direction-2 helper), called with its 2-argument signature.
 */
function expectGlobalSlotBlockingInvariantHolds(factory: Factory): void {
  for (const m of factory.getMachines()) {
    const violates = machineSlotPointsAtNeighbor(
      { x: m.x, z: m.z, rotation: m.rotation, slots: m.slots, id: m.id },
      (x, z) => factory.getMachineAt(x, z),
    )
    expect(
      violates,
      `slot-blocking VIOLATION: machine ${m.type} at (${m.x},${m.z}) rotation='${m.rotation}' has a slot pointing at a different machine`,
    ).toBe(false)
  }
}

describe('machineSlotPointsAtNeighbor', () => {
  it('returns true when a slot points at a cell occupied by a different machine', () => {
    // GIVEN — two part_fabricators side-by-side. Source at (5,5,'east')
    // has front offset (+1,0) → points at (6,5), where the other machine
    // sits. This MUST flag.
    const factory = new Factory(10, 10)
    const src = factory.placeMachine(5, 5, 'part_fabricator', 'south')!
    // Place neighbor at (6,5). At src='east' this is exactly where front
    // would point; that used to be exempted as the drag target.
    const neighbor = factory.placeMachine(6, 5, 'part_fabricator', 'south')!
    expect(src).not.toBeNull()
    expect(neighbor).not.toBeNull()

    // WHEN / THEN — call with the standard 2-argument signature.
    const result = machineSlotPointsAtNeighbor(
      { x: 5, z: 5, rotation: 'east', slots: getSlotPositions('part_fabricator'), id: src.id },
      (x, z) => factory.getMachineAt(x, z),
    )
    expect(result).toBe(true)
  })

  it('returns true even when the occupied cell would have been the former drag-target exemption', () => {
    // GIVEN — neighbor at (6,5). The helper takes ONLY (machine,
    // getMachineAt) and reports the violation unconditionally — there is
    // no exemption for drag targets.
    const factory = new Factory(10, 10)
    const src = factory.placeMachine(5, 5, 'part_fabricator', 'south')!
    factory.placeMachine(6, 5, 'part_fabricator', 'south')

    const result = machineSlotPointsAtNeighbor(
      { x: 5, z: 5, rotation: 'east', slots: getSlotPositions('part_fabricator'), id: src.id },
      (x, z) => factory.getMachineAt(x, z),
    )
    expect(result).toBe(true)
  })

  it('returns false when no slot points at any other machine', () => {
    // GIVEN — neighbor at (6,5). At src='south', front=(0,+1)→(5,6),
    // back=(0,-1)→(5,4). Neither points at the neighbor.
    const factory = new Factory(10, 10)
    const src = factory.placeMachine(5, 5, 'part_fabricator', 'south')!
    factory.placeMachine(6, 5, 'part_fabricator', 'south')

    const result = machineSlotPointsAtNeighbor(
      { x: 5, z: 5, rotation: 'south', slots: getSlotPositions('part_fabricator'), id: src.id },
      (x, z) => factory.getMachineAt(x, z),
    )
    expect(result).toBe(false)
  })

  it('returns false on an empty grid (no neighbors at all)', () => {
    // GIVEN — only the source machine. No matter the rotation, no slot can
    // point at "another machine" because there are none.
    const factory = new Factory(10, 10)
    const src = factory.placeMachine(5, 5, 'part_fabricator', 'east')!

    const result = machineSlotPointsAtNeighbor(
      { x: 5, z: 5, rotation: 'east', slots: getSlotPositions('part_fabricator'), id: src.id },
      (x, z) => factory.getMachineAt(x, z),
    )
    expect(result).toBe(false)
  })

  it('self-id exclusion: a machine cannot block itself', () => {
    // GIVEN — a synthetic getMachineAt that always returns the SAME machine
    // info regardless of the queried cell. Without the id-exclusion guard,
    // every slot would "find" itself and the helper would return true.
    // With self-id exclusion, the helper must return false.
    const selfInfo: MachineInfo = {
      id: 'self',
      name: 'self',
      type: 'part_fabricator',
      x: 5,
      z: 5,
      rotation: 'south',
      slots: getSlotPositions('part_fabricator'),
    }
    const result = machineSlotPointsAtNeighbor(
      { x: 5, z: 5, rotation: 'south', slots: getSlotPositions('part_fabricator'), id: 'self' },
      () => selfInfo,
    )
    expect(result).toBe(false)
  })
})

describe('Slot-blocking global invariant', () => {
  it('holds after a successful belt between distant machines', () => {
    // GIVEN — two unconnected fabricators with plenty of room between them.
    const factory = new Factory(10, 10)
    const src = factory.placeMachine(2, 2, 'part_fabricator', 'south')!
    const tgt = factory.placeMachine(7, 7, 'part_fabricator', 'north')!

    // ASSERT — initial empty state.
    expect(renderGrid(factory, 1, 1, 8, 8)).toBe([
      '| | | | | | | | |',
      '| |F| | | | | | |',
      '| | | | | | | | |',
      '| | | | | | | | |',
      '| | | | | | | | |',
      '| | | | | | | | |',
      '| | | | | | |F| |',
      '| | | | | | | | |',
    ].join('\n'))

    // WHEN
    const ok = factory.placeBeltChain(src, tgt, 'output')

    // THEN — placement succeeds, and the global invariant holds.
    expect(ok).toBe(true)
    expectGlobalSlotBlockingInvariantHolds(factory)
  })

  it('holds after a drag between adjacent machines', () => {
    // GIVEN — adjacent fabricators. The straight 2-cell belt would require
    // S to rotate 'east', which makes S's front slot point at T. The
    // planner must pick a non-violating rotation
    // (S='south' or 'north') and route around — not a straight belt.
    const factory = new Factory(10, 10)
    const src = factory.placeMachine(5, 5, 'part_fabricator', 'south')!
    const tgt = factory.placeMachine(6, 5, 'part_fabricator', 'south')!

    // WHEN
    const ok = factory.placeBeltChain(src, tgt, 'output')

    // THEN — either the placement succeeds with an L-route OR fails. In
    // BOTH cases the global invariant must hold (failure leaves no belt).
    if (ok) {
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(
        belts[0].path.length,
        `straight 2-cell belt is forbidden between adjacent machines (forces a slot-blocking rotation); got path=${JSON.stringify(belts[0].path)}`,
      ).toBeGreaterThan(2)
    }
    expectGlobalSlotBlockingInvariantHolds(factory)
  })

  it('is preserved after a failed drag in a pre-violating layout', () => {
    // GIVEN — F_src wedged so every candidate rotation would violate
    // Direction-2. The pre-violating layout INHERENTLY violates the global
    // invariant (neighbors point at S; S's back at 'south' points at the
    // (5,4) neighbor). Trivial preservation means: the planner does not
    // ADD belts or change rotations — the layout after the call is
    // BIT-IDENTICAL to the layout before.
    const factory = new Factory(10, 12)
    factory.restoreState(
      [
        { x: 5, z: 4, type: 'part_fabricator', rotation: 'south' },
        { x: 4, z: 5, type: 'part_fabricator', rotation: 'south' },
        { x: 6, z: 5, type: 'part_fabricator', rotation: 'south' },
        { x: 5, z: 5, type: 'part_fabricator', rotation: 'south' },
        { x: 5, z: 9, type: 'part_fabricator', rotation: 'north' },
      ],
      [],
    )
    const src = factory.getMachineAt(5, 5)!
    const tgt = factory.getMachineAt(5, 9)!

    // WHEN
    const ok = factory.placeBeltChain(src, tgt, 'output', { sourceSlotPosition: 'front' })

    // THEN — the drag must fail and leave the factory state untouched.
    expect(
      ok,
      'every candidate rotation violates slot-blocking and the drag must fail',
    ).toBe(false)
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
  })
})

describe('Adjacent-machine belt placement', () => {
  it('NEVER places a 2-cell straight belt between adjacent fabricators (body-mode drag)', () => {
    // GIVEN — S at (5,5) and T at (6,5), both unconnected, both 'south'.
    // S='east' would make front point at T (slot-blocking violation), so
    // the planner must NOT pick 'east'. The shortest non-violating route
    // is an L-shape (length > 2).
    const factory = new Factory(10, 10)
    const src = factory.placeMachine(5, 5, 'part_fabricator', 'south')!
    const tgt = factory.placeMachine(6, 5, 'part_fabricator', 'south')!

    expect(renderGrid(factory, 4, 4, 7, 6)).toBe([
      '| | | | |',
      '| |F|F| |',
      '| | | | |',
    ].join('\n'))

    // WHEN
    const ok = factory.placeBeltChain(src, tgt, 'output')

    // THEN — placement should succeed with an L-route, never a straight belt.
    expect(ok, 'planner should still find a valid L-route between adjacent machines').toBe(true)
    const belts = factory.getBelts()
    expect(belts).toHaveLength(1)
    expect(
      belts[0].path.length,
      `straight 2-cell belt would force S='east' which slot-blocks T; got path=${JSON.stringify(belts[0].path)}`,
    ).toBeGreaterThan(2)

    // S's final rotation must NOT point any slot at T's cell.
    const srcAfter = factory.getMachineAt(5, 5)!
    expect(['east', 'west']).not.toContain(srcAfter.rotation)

    // Global invariant.
    expectGlobalSlotBlockingInvariantHolds(factory)
  })

  it('rejects (or routes around) an explicit source-slot drag that would aim S at T', () => {
    // GIVEN — same adjacent setup. The user explicitly clicks S's 'front'
    // slot. At S='east' that would point straight at T. The planner must
    // EITHER reject the drag, OR succeed with a rotation that does NOT
    // aim S's front at T.
    const factory = new Factory(10, 10)
    const src = factory.placeMachine(5, 5, 'part_fabricator', 'south')!
    const tgt = factory.placeMachine(6, 5, 'part_fabricator', 'south')!

    // WHEN
    const ok = factory.placeBeltChain(src, tgt, 'output', { sourceSlotPosition: 'front' })

    // THEN — if it succeeded, S must NOT be rotated 'east' (front→T) or
    // 'west' (back→T). Either way the global invariant must hold.
    if (ok) {
      const srcAfter = factory.getMachineAt(5, 5)!
      expect(
        ['east', 'west'],
        `S rotated to '${srcAfter.rotation}' would aim a slot at T (6,5) — slot-blocking violation`,
      ).not.toContain(srcAfter.rotation)
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].path.length).toBeGreaterThan(2)
    }
    expectGlobalSlotBlockingInvariantHolds(factory)
  })
})
