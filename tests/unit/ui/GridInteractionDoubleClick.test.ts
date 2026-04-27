/**
 * @vitest-environment jsdom
 *
 * Focused double-click placement tests for GridInteraction.
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { createMockSceneManager } from './helpers/GridInteractionTestHarness'

import { initI18n } from '../../../src/i18n/i18n'
import { Factory } from '../../../src/game/Factory'
import { GridInteraction } from '../../../src/rendering/GridInteraction'

beforeAll(async () => {
  await initI18n()
})

describe('GridInteraction double-click placement', () => {
  // Contract: double-clicking an empty cell places a part_fabricator. The
  // default rotation is 'south'. If 'south' would violate the slot-blocking
  // constraint (Direction 2: own slot points at an existing neighbor),
  // handleDblClick must try CW rotations in order south→west→north→east
  // and commit the first one that succeeds. If all four fail, no machine
  // is placed and onFactoryChanged is not called.
  describe('handleDblClick — auto-rotate on slot-block', () => {
    let factory: Factory
    let interaction: GridInteraction
    let onFactoryChanged: ReturnType<typeof vi.fn<() => void>>

    function setupAt(targetCell: { x: number; z: number }) {
      const sm = createMockSceneManager()
      onFactoryChanged = vi.fn()
      interaction = new GridInteraction(sm, factory, onFactoryChanged)
      interaction.enable()
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue(targetCell)
      vi.spyOn(interaction as any, 'updateMouseNDC').mockImplementation(() => {})
    }

    const fakeMouseEvent = () =>
      ({ type: 'dblclick', button: 0, clientX: 100, clientY: 100 }) as unknown as MouseEvent

    beforeEach(() => {
      factory = new Factory(10, 10)
    })

    it('uses default south rotation when no slot-blocking conflict exists', () => {
      // GIVEN an empty 10×10 factory and the user dbl-clicks (5,5).
      setupAt({ x: 5, z: 5 })
      expect(factory.getMachineAt(5, 5)).toBeNull()

      // WHEN dblclick fires.
      ;(interaction as any).handleDblClick(fakeMouseEvent())

      // THEN a part_fabricator is placed with default 'south' rotation.
      const placed = factory.getMachineAt(5, 5)
      expect(placed).not.toBeNull()
      expect(placed!.type).toBe('part_fabricator')
      expect(placed!.rotation).toBe('south')
      expect(onFactoryChanged).toHaveBeenCalledTimes(1)
    })

    it('auto-rotates when default south orientation is slot-blocked by a neighbor', () => {
      // GIVEN a part_fabricator neighbor at (5,4) facing 'east' — its slots
      // (back→(4,4), front→(6,4)) do NOT point at (5,5), so Direction 1
      // does NOT block (5,5). However a south-facing fab at (5,5) has its
      // 'back' slot at (5,4), pointing AT this neighbor, triggering
      // Direction 2 → south is rejected. CW rotation 'west' has slots at
      // (4,5) and (6,5) — both empty — so 'west' is the first valid.
      const neighbor = factory.placeMachine(5, 4, 'part_fabricator', 'east')
      expect(neighbor, 'neighbor setup must succeed').not.toBeNull()
      // Sanity-check the bug scenario: south at (5,5) is rejected, west works.
      expect(factory.placeMachine(5, 5, 'part_fabricator', 'south')).toBeNull()
      // (placeMachine only mutates on success, so the cell is still empty.)
      expect(factory.getMachineAt(5, 5)).toBeNull()

      setupAt({ x: 5, z: 5 })

      // WHEN dblclick fires on (5,5).
      ;(interaction as any).handleDblClick(fakeMouseEvent())

      // THEN a fabricator is placed at (5,5) with a non-south rotation —
      // specifically the first CW-valid rotation, which is 'west'.
      const placed = factory.getMachineAt(5, 5)
      expect(placed, 'machine must be placed despite south being blocked').not.toBeNull()
      expect(placed!.type).toBe('part_fabricator')
      expect(placed!.rotation, 'rotation must NOT be the slot-blocked default south').not.toBe('south')
      expect(placed!.rotation).toBe('west')
      expect(onFactoryChanged).toHaveBeenCalledTimes(1)
    })

    it('places nothing when all four rotations are slot-blocked', () => {
      // GIVEN four neighbors surrounding (5,5), each oriented so its OWN
      // slots do not point at (5,5) (so Direction 1 never fires), but
      // their mere presence means every rotation of a fabricator at (5,5)
      // has its back/front slot pointing at one of them (Direction 2
      // blocks south, west, north, east).
      expect(factory.placeMachine(5, 4, 'part_fabricator', 'east')).not.toBeNull()
      expect(factory.placeMachine(5, 6, 'part_fabricator', 'east')).not.toBeNull()
      expect(factory.placeMachine(4, 5, 'part_fabricator', 'south')).not.toBeNull()
      expect(factory.placeMachine(6, 5, 'part_fabricator', 'south')).not.toBeNull()
      // Sanity-check that all four rotations are rejected directly.
      expect(factory.placeMachine(5, 5, 'part_fabricator', 'south')).toBeNull()
      expect(factory.placeMachine(5, 5, 'part_fabricator', 'west')).toBeNull()
      expect(factory.placeMachine(5, 5, 'part_fabricator', 'north')).toBeNull()
      expect(factory.placeMachine(5, 5, 'part_fabricator', 'east')).toBeNull()
      expect(factory.getMachineAt(5, 5)).toBeNull()

      setupAt({ x: 5, z: 5 })

      // WHEN dblclick fires.
      ;(interaction as any).handleDblClick(fakeMouseEvent())

      // THEN no machine is placed and onFactoryChanged is not called.
      expect(factory.getMachineAt(5, 5)).toBeNull()
      expect(onFactoryChanged).not.toHaveBeenCalled()
    })
  })
})