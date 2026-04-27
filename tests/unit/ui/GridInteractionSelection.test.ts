/**
 * @vitest-environment jsdom
 *
 * Focused selection tests for GridInteraction pointerdown/pointerup behavior.
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { ASSEMBLER_AT_2_2, createMockSceneManager } from './helpers/GridInteractionTestHarness'

import { initI18n } from '../../../src/i18n/i18n'
import { Factory } from '../../../src/game/Factory'
import type { MachineInfo } from '../../../src/game/Factory'
import { GridInteraction } from '../../../src/rendering/GridInteraction'
import { expectFactoryState } from '../helpers/factoryAssert'

beforeAll(async () => {
  await initI18n()
})

describe('GridInteraction selection', () => {
  describe('handlePointerDown / handlePointerUp', () => {
    let factory: Factory
    let interaction: GridInteraction
    let selectionSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
      // GIVEN a factory with a machine at (2,2) and a GridInteraction wired up
      factory = new Factory(5, 5)
      factory.placeMachine(2, 2, 'assembler', 'south')
      const sm = createMockSceneManager()
      const onChanged = vi.fn()
      interaction = new GridInteraction(sm, factory, onChanged)
      interaction.enable()

      selectionSpy = vi.fn()
      interaction.onMachineSelected = selectionSpy as (machine: MachineInfo | null) => void

      // Mock raycastToGrid to return cell (2,2) — the machine cell
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 2, z: 2 })
      vi.spyOn(interaction as any, 'updateMouseNDC').mockImplementation(() => {})
    })

    const fakePointerEvent = (type: string) =>
      ({ type, button: 0, clientX: 100, clientY: 100 }) as unknown as PointerEvent

    it('should NOT select a machine on pointerdown alone (drag start)', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      // WHEN only pointerdown fires
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      // THEN no selection callback
      expect(selectionSpy).not.toHaveBeenCalled()
    })

    it('should select a machine on pointerdown + pointerup on the same cell (click)', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      // WHEN pointerdown then pointerup on the same cell
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      // THEN the machine is selected
      expect(selectionSpy).toHaveBeenCalledTimes(1)
      const selectedMachine = selectionSpy.mock.calls[0][0] as MachineInfo
      expect(selectedMachine).not.toBeNull()
      expect(selectedMachine.type).toBe('assembler')
      expect(selectedMachine.x).toBe(2)
      expect(selectedMachine.z).toBe(2)
    })

    it('should NOT select when pointerup is off-grid (drag cancelled)', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      // GIVEN pointerdown on a valid cell
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))

      // WHEN pointer released outside the grid
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue(null)
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      // THEN no selection callback
      expect(selectionSpy).not.toHaveBeenCalled()
    })

    it('should NOT select a machine when it is dragged to a different cell (successful move)', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      // GIVEN pointerdown on machine cell (2,2)
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 2, z: 2 })
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))

      // WHEN pointer released on a different, empty cell (3,3)
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 3, z: 3 })
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 4],
          expected: [
            '| | | | | |',
            '| | | | | |',
            '| | | | | |',
            '| | | |A| |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [{ x: 3, z: 3, rotation: 'south' }],
        belts: [],
      })

      // THEN no selection, and the machine moved
      expect(selectionSpy).not.toHaveBeenCalled()
      expect(factory.getMachineAt(3, 3)).not.toBeNull()
      expect(factory.getMachineAt(2, 2)).toBeNull()
    })

    it('should NOT select a machine when drag-move fails (target occupied)', () => {
      // GIVEN a second machine at (3,3)
      factory.placeMachine(3, 3, 'painter', 'south')
      const A_AND_P = {
        grid: {
          box: [0, 0, 4, 4] as [number, number, number, number],
          expected: [
            '| | | | | |',
            '| | | | | |',
            '| | |A| | |',
            '| | | |P| |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 2, z: 2, rotation: 'south' as const },
          { x: 3, z: 3, rotation: 'south' as const },
        ],
        belts: [],
      }
      expectFactoryState(factory, A_AND_P)

      // WHEN pointerdown on (2,2) and pointerup on occupied (3,3)
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 2, z: 2 })
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))
      vi.spyOn(interaction as any, 'raycastToGrid').mockReturnValue({ x: 3, z: 3 })
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))
      expectFactoryState(factory, A_AND_P)

      // THEN no selection, and neither machine moved
      expect(selectionSpy).not.toHaveBeenCalled()
      expect(factory.getMachineAt(2, 2)).not.toBeNull()
      expect(factory.getMachineAt(3, 3)).not.toBeNull()
      expect(factory.getMachineAt(2, 2)!.type).toBe('assembler')
      expect(factory.getMachineAt(3, 3)!.type).toBe('painter')
    })
  })
})