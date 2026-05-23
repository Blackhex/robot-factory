/**
 * RED — Save-schema migration: v2 → v3 swaps `'left'` ↔ `'right'` on
 * every belt's `sourceSlot` / `destinationSlot` so that belts saved
 * under the OLD (machine-facing) slot convention still connect to
 * the same physical world cells under the NEW (input-observer-relative)
 * convention.
 *
 * The migration MUST:
 *   - Bump `SAVE_VERSION` from `2` to `3`.
 *   - Accept v2 saves on `loadFactory(save)` / `loadFromLocalStorage`
 *     and emit an in-memory v3 representation with `sourceSlot` and
 *     `destinationSlot` swapped on every belt where the value is
 *     `'left'` or `'right'`.
 *   - NEVER swap `'front'` or `'back'` slot names (they are unaffected
 *     by the convention flip).
 *   - Be idempotent: running on a v3 save MUST be a no-op (no further
 *     swap).
 *
 * Test surface notes:
 *   - The current loader (`src/utils/SaveLoad.ts`) defines
 *     `SAVE_VERSION = 2` and `validateSave` rejects any other version.
 *     There is no migration step. These tests therefore fail in
 *     several ways at RED:
 *       * v2 save load: belt slot names are NOT swapped (assertion
 *         that swapped name is present fails).
 *       * v3 save load: validator throws "Unsupported save version"
 *         (loadFactory throws instead of returning a Factory).
 *
 * GREEN is expected to:
 *   - Set `SAVE_VERSION = 3`.
 *   - Have `validateSave` accept both `2` and `3`.
 *   - Insert a migration step in `loadFactory` that swaps left↔right
 *     on belts when the saved `version === 2`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { loadFactory, type FactorySave } from '../../../src/utils/SaveLoad'
import type { SlotPosition } from '../../../src/game/types'

function emptyWorkspace(): string {
  return JSON.stringify({ ts: '', blocks: '<xml xmlns="https://developers.google.com/blockly/xml"></xml>' })
}

/**
 * Build a synthetic v2 save mirroring `projects/Assembly.json`:
 *
 *   Splitter at (9, 6) rotation 'north'
 *   Recycler at (12, 6) rotation 'east'
 *   FactoryOutput (Shipper) at (9, 3) rotation 'north'
 *
 *   Belt A: Splitter → Shipper (north), sourceSlot='front'  (unchanged by migration)
 *   Belt B: Splitter → Recycler (east), sourceSlot='left'   (must become 'right')
 *   Belt C: feeder into Splitter from south, destinationSlot='back' (unchanged)
 */
function makeAssemblyLikeV2Save(): FactorySave {
  return {
    version: 2,
    grid: [
      { x: 9, z: 6, machineType: 'splitter', rotation: 'north' },
      { x: 12, z: 6, machineType: 'recycler', rotation: 'east' },
      { x: 9, z: 3, machineType: 'factory_output', rotation: 'north' },
      // Feeder source so the input belt has a real source machine.
      { x: 9, z: 9, machineType: 'part_fabricator', rotation: 'north' },
    ],
    belts: [
      // Splitter forward → Shipper (north).
      {
        sourceSlot: 'front',
        destinationSlot: 'back',
        path: [
          [9, 6],
          [9, 5],
          [9, 4],
          [9, 3],
        ],
      },
      // Splitter left (OLD convention east) → Recycler. After migration
      // sourceSlot MUST become 'right'.
      {
        sourceSlot: 'left',
        destinationSlot: 'back',
        path: [
          [9, 6],
          [10, 6],
          [11, 6],
          [12, 6],
        ],
      },
      // Feeder belt into splitter — destinationSlot 'back' must NOT
      // change (front/back are convention-stable).
      {
        sourceSlot: 'front',
        destinationSlot: 'back',
        path: [
          [9, 9],
          [9, 8],
          [9, 7],
          [9, 6],
        ],
      },
    ],
    pxtWorkspace: emptyWorkspace(),
  }
}

function findBeltByPath(
  factory: ReturnType<typeof loadFactory>['factory'],
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
): { sourceSlot: SlotPosition; destinationSlot: SlotPosition } | null {
  for (const b of factory.getBelts()) {
    const first = b.path[0]
    const last = b.path[b.path.length - 1]
    if (
      first.x === startX && first.z === startZ &&
      last.x === endX && last.z === endZ
    ) {
      return { sourceSlot: b.sourceSlot, destinationSlot: b.destinationSlot }
    }
  }
  return null
}

describe('SaveLoad — v2 → v3 slot-convention migration', () => {
  beforeEach(() => {
    if (typeof globalThis.localStorage !== 'undefined') {
      try { globalThis.localStorage.clear() } catch { /* jsdom may not provide it */ }
    }
  })

  it('v2 save: belt with sourceSlot="left" leaving a north-rotated splitter becomes "right" after load', () => {
    const save = makeAssemblyLikeV2Save()
    const { factory } = loadFactory(save)

    const eastBelt = findBeltByPath(factory, 9, 6, 12, 6)
    expect(eastBelt, 'east belt (9,6)→(12,6) was not restored').not.toBeNull()
    expect(eastBelt!.sourceSlot).toBe<SlotPosition>('right')
  })

  it('v2 save: belt with sourceSlot="front" is NOT changed by the migration', () => {
    const save = makeAssemblyLikeV2Save()
    const { factory } = loadFactory(save)

    const northBelt = findBeltByPath(factory, 9, 6, 9, 3)
    expect(northBelt, 'north belt (9,6)→(9,3) was not restored').not.toBeNull()
    expect(northBelt!.sourceSlot).toBe<SlotPosition>('front')
  })

  it('v2 save: destinationSlot="back" on the feeder belt is NOT changed', () => {
    const save = makeAssemblyLikeV2Save()
    const { factory } = loadFactory(save)

    const feeder = findBeltByPath(factory, 9, 9, 9, 6)
    expect(feeder, 'feeder belt (9,9)→(9,6) was not restored').not.toBeNull()
    expect(feeder!.destinationSlot).toBe<SlotPosition>('back')
  })

  it('v3 save: load succeeds (validator accepts version=3)', () => {
    const v3Save: FactorySave = {
      ...makeAssemblyLikeV2Save(),
      version: 3,
      // Author already wrote sourceSlot using the NEW convention.
      belts: [
        {
          sourceSlot: 'right',
          destinationSlot: 'back',
          path: [
            [9, 6],
            [10, 6],
            [11, 6],
            [12, 6],
          ],
        },
      ],
    }
    expect(() => loadFactory(v3Save)).not.toThrow()
  })

  it('v3 save: migration is idempotent — sourceSlot="right" stays "right"', () => {
    const v3Save: FactorySave = {
      ...makeAssemblyLikeV2Save(),
      version: 3,
      belts: [
        {
          sourceSlot: 'right',
          destinationSlot: 'back',
          path: [
            [9, 6],
            [10, 6],
            [11, 6],
            [12, 6],
          ],
        },
        {
          sourceSlot: 'left',
          destinationSlot: 'back',
          path: [
            [9, 6],
            [8, 6],
            [7, 6],
          ],
        },
      ],
    }

    // Add a sink machine at the destination of the left belt so it
    // survives restoration.
    v3Save.grid = [
      ...v3Save.grid,
      { x: 7, z: 6, machineType: 'recycler', rotation: 'west' },
    ]

    const { factory } = loadFactory(v3Save)

    const rightBelt = findBeltByPath(factory, 9, 6, 12, 6)
    expect(rightBelt, 'right belt (9,6)→(12,6) was not restored').not.toBeNull()
    expect(rightBelt!.sourceSlot).toBe<SlotPosition>('right')

    const leftBelt = findBeltByPath(factory, 9, 6, 7, 6)
    expect(leftBelt, 'left belt (9,6)→(7,6) was not restored').not.toBeNull()
    expect(leftBelt!.sourceSlot).toBe<SlotPosition>('left')
  })

  it('v2 save: a belt LEAVING a splitter via sourceSlot="right" becomes "left" after load (symmetric swap)', () => {
    // Author the v2 save with a west-going splitter belt labelled
    // sourceSlot='right' (OLD convention: right at north = west cell).
    // After migration the name MUST become 'left' (NEW convention:
    // left at north = west cell, preserving the same physical cell).
    const save: FactorySave = {
      version: 2,
      grid: [
        { x: 9, z: 6, machineType: 'splitter', rotation: 'north' },
        { x: 7, z: 6, machineType: 'recycler', rotation: 'west' },
      ],
      belts: [
        {
          sourceSlot: 'right',
          destinationSlot: 'back',
          path: [
            [9, 6],
            [8, 6],
            [7, 6],
          ],
        },
      ],
      pxtWorkspace: emptyWorkspace(),
    }
    const { factory } = loadFactory(save)

    const westBelt = findBeltByPath(factory, 9, 6, 7, 6)
    expect(westBelt, 'west belt (9,6)→(7,6) was not restored').not.toBeNull()
    expect(westBelt!.sourceSlot).toBe<SlotPosition>('left')
  })
})
