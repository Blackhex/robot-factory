/**
 * RED — Input-observer-relative slot convention for `left` / `right`.
 *
 * Pins the NEW spatial meaning of `SlotPosition` `'left'` and `'right'`:
 * if an observer stands at the machine's INPUT and looks INTO the
 * machine (toward `front`), the slot at their LEFT hand is `'left'`,
 * the slot at their RIGHT hand is `'right'`.
 *
 * Under the OLD (machine-facing) convention encoded by the current
 * `SlotUtils.slotPositionBaseOffset`, `left` and `right` are mirrored
 * at the south and north rotations:
 *
 *   slotPositionToOffset('left',  'south') : current {-1, 0}  → required {+1, 0}
 *   slotPositionToOffset('right', 'south') : current {+1, 0}  → required {-1, 0}
 *   slotPositionToOffset('left',  'north') : current {+1, 0}  → required {-1, 0}
 *   slotPositionToOffset('right', 'north') : current {-1, 0}  → required {+1, 0}
 *
 * `'front'` and `'back'` are not affected by the convention flip.
 *
 * Comparisons use `.x` / `.z` numeric equality so that signed-zero
 * (`-0` vs `+0`) from `rotateOffset` does not produce spurious
 * failures unrelated to the convention bug.
 */
import { describe, it, expect } from 'vitest'
import {
  slotPositionToOffset,
  offsetToSlotPosition,
} from '../../../src/game/SlotUtils'
import type { Direction, GridPosition, SlotPosition } from '../../../src/game/types'

const ALL_ROTATIONS: readonly Direction[] = ['south', 'east', 'north', 'west']
const ALL_SLOTS: readonly SlotPosition[] = ['front', 'back', 'left', 'right']

function expectOffset(actual: GridPosition, expected: { x: number; z: number }): void {
  // Use `.toBe` per coordinate so -0 and +0 compare equal (Object.is
  // distinguishes them, but standard equality treats them as equal).
  expect(actual.x === expected.x).toBe(true)
  expect(actual.z === expected.z).toBe(true)
}

describe('SlotUtils — input-observer-relative left/right convention', () => {
  describe('rotation=south (machine front faces +z)', () => {
    it('left → east (+x)', () => {
      expectOffset(slotPositionToOffset('left', 'south'), { x: +1, z: 0 })
    })
    it('right → west (-x)', () => {
      expectOffset(slotPositionToOffset('right', 'south'), { x: -1, z: 0 })
    })
    it('front → +z (unchanged)', () => {
      expectOffset(slotPositionToOffset('front', 'south'), { x: 0, z: +1 })
    })
    it('back → -z (unchanged)', () => {
      expectOffset(slotPositionToOffset('back', 'south'), { x: 0, z: -1 })
    })
  })

  describe('rotation=north (machine front faces -z)', () => {
    it('left → west (-x)', () => {
      expectOffset(slotPositionToOffset('left', 'north'), { x: -1, z: 0 })
    })
    it('right → east (+x)', () => {
      expectOffset(slotPositionToOffset('right', 'north'), { x: +1, z: 0 })
    })
    it('front → -z (unchanged)', () => {
      expectOffset(slotPositionToOffset('front', 'north'), { x: 0, z: -1 })
    })
    it('back → +z (unchanged)', () => {
      expectOffset(slotPositionToOffset('back', 'north'), { x: 0, z: +1 })
    })
  })

  describe('rotation=east (machine front faces +x)', () => {
    it('left → +z', () => {
      expectOffset(slotPositionToOffset('left', 'east'), { x: 0, z: +1 })
    })
    it('right → -z', () => {
      expectOffset(slotPositionToOffset('right', 'east'), { x: 0, z: -1 })
    })
    it('front → +x (unchanged)', () => {
      expectOffset(slotPositionToOffset('front', 'east'), { x: +1, z: 0 })
    })
    it('back → -x (unchanged)', () => {
      expectOffset(slotPositionToOffset('back', 'east'), { x: -1, z: 0 })
    })
  })

  describe('rotation=west (machine front faces -x)', () => {
    it('left → -z', () => {
      expectOffset(slotPositionToOffset('left', 'west'), { x: 0, z: -1 })
    })
    it('right → +z', () => {
      expectOffset(slotPositionToOffset('right', 'west'), { x: 0, z: +1 })
    })
    it('front → -x (unchanged)', () => {
      expectOffset(slotPositionToOffset('front', 'west'), { x: -1, z: 0 })
    })
    it('back → +x (unchanged)', () => {
      expectOffset(slotPositionToOffset('back', 'west'), { x: +1, z: 0 })
    })
  })

  describe('round-trip: offsetToSlotPosition ∘ slotPositionToOffset = identity', () => {
    for (const rot of ALL_ROTATIONS) {
      for (const slot of ALL_SLOTS) {
        it(`(${slot}, ${rot}) round-trips`, () => {
          const offset = slotPositionToOffset(slot, rot)
          expect(offsetToSlotPosition(offset, rot)).toBe(slot)
        })
      }
    }
  })

  describe('left and right are always mirror images of each other', () => {
    for (const rot of ALL_ROTATIONS) {
      it(`rotation=${rot}: left = -right`, () => {
        const left = slotPositionToOffset('left', rot)
        const right = slotPositionToOffset('right', rot)
        expect(left.x === -right.x).toBe(true)
        expect(left.z === -right.z).toBe(true)
      })
    }
  })
})
