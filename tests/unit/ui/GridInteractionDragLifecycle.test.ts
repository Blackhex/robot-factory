/**
 * @vitest-environment jsdom
 *
 * Focused drag lifecycle tests for GridInteraction.
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

type DragPauseSimulation = {
  running: boolean
  paused: boolean
  pause: ReturnType<typeof vi.fn<() => void>>
  resume: ReturnType<typeof vi.fn<() => void>>
}

type RaycastCell = { x: number; z: number } | null

function createDragPauseHarness(options: { initialRaycastCell?: RaycastCell } = {}): {
  factory: Factory
  interaction: GridInteraction
  simulation: DragPauseSimulation
  canvas: HTMLElement
  selectionSpy: ReturnType<typeof vi.fn>
  setRaycastCell: (cell: RaycastCell) => void
} {
  const factory = new Factory(5, 5)
  factory.placeMachine(2, 2, 'assembler', 'south')
  const sm = createMockSceneManager()
  const canvas = sm.getRenderer().domElement
  let simulation: DragPauseSimulation
  simulation = {
    running: true,
    paused: false,
    pause: vi.fn(() => { simulation.paused = true }),
    resume: vi.fn(() => { simulation.paused = false }),
  }
  const interaction = new GridInteraction(sm, factory, vi.fn(), undefined, () => simulation)
  interaction.enable()
  const selectionSpy = vi.fn()
  interaction.onMachineSelected = selectionSpy as (machine: MachineInfo | null) => void
  const capturedPointers = new Set<number>()
  ;(canvas as any).setPointerCapture = vi.fn((pointerId: number) => { capturedPointers.add(pointerId) })
  ;(canvas as any).releasePointerCapture = vi.fn((pointerId: number) => { capturedPointers.delete(pointerId) })
  ;(canvas as any).hasPointerCapture = vi.fn((pointerId: number) => capturedPointers.has(pointerId))

  let currentRaycastCell = options.initialRaycastCell === undefined ? { x: 2, z: 2 } : options.initialRaycastCell
  vi.spyOn(interaction as any, 'raycastToGrid').mockImplementation(() => currentRaycastCell)
  vi.spyOn(interaction as any, 'updateMouseNDC').mockImplementation(() => {})

  return {
    factory,
    interaction,
    simulation,
    canvas,
    selectionSpy,
    setRaycastCell: (cell: RaycastCell) => { currentRaycastCell = cell },
  }
}

describe('GridInteraction drag lifecycle', () => {
  describe('machine drag cancellation cleanup lifecycle', () => {
    let factory: Factory
    let interaction: GridInteraction
    let canvas: HTMLElement
    let selectionSpy: ReturnType<typeof vi.fn>
    let simulation: DragPauseSimulation
    let setRaycastCell: (cell: RaycastCell) => void

    beforeEach(() => {
      ;({ factory, interaction, simulation, canvas, selectionSpy, setRaycastCell } = createDragPauseHarness())
    })

    function dispatchPointer(type: string, clientX = 100, clientY = 100): void {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX,
        clientY,
      })
      Object.defineProperty(event, 'pointerId', { value: 7 })
      canvas.dispatchEvent(event)
    }

    function dispatchWindowPointer(type: string): void {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: 900,
        clientY: 900,
      })
      Object.defineProperty(event, 'pointerId', { value: 7 })
      window.dispatchEvent(event)
    }

    function expectNoSimulationPauseLifecycle(): void {
      expect(simulation.pause).not.toHaveBeenCalled()
      expect(simulation.resume).not.toHaveBeenCalled()
      expect(simulation.paused).toBe(false)
    }

    function expectPointerCaptureReleased(): void {
      expect((canvas as any).setPointerCapture).toHaveBeenCalledWith(7)
      expect((canvas as any).releasePointerCapture).toHaveBeenCalledWith(7)
      expect((canvas as any).hasPointerCapture(7)).toBe(false)
    }

    it('cleans up a same-cell machine drag without pausing the simulation', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      dispatchPointer('pointerdown')
      expect((canvas as any).setPointerCapture).toHaveBeenCalledWith(7)
      expectNoSimulationPauseLifecycle()

      dispatchPointer('pointerup')
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      expectPointerCaptureReleased()
      expectNoSimulationPauseLifecycle()

      setRaycastCell({ x: 3, z: 3 })
      dispatchPointer('pointerup')
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      expect(selectionSpy).toHaveBeenCalledTimes(1)
      expectNoSimulationPauseLifecycle()
    })

    it('cleans up an off-grid machine drag release outside the canvas without pausing the simulation', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      dispatchPointer('pointerdown')
      expect((canvas as any).setPointerCapture).toHaveBeenCalledWith(7)
      expectNoSimulationPauseLifecycle()

      setRaycastCell(null)
      dispatchWindowPointer('pointerup')
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      expectPointerCaptureReleased()
      expect(selectionSpy).not.toHaveBeenCalled()
      expectNoSimulationPauseLifecycle()

      setRaycastCell({ x: 3, z: 3 })
      dispatchWindowPointer('pointerup')
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      expect(selectionSpy).not.toHaveBeenCalled()
      expectNoSimulationPauseLifecycle()
    })

    it('cleans up a machine drag cancelled by pointercancel without pausing the simulation', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      dispatchPointer('pointerdown')
      expect((canvas as any).setPointerCapture).toHaveBeenCalledWith(7)
      expectNoSimulationPauseLifecycle()

      dispatchPointer('pointercancel')
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      expectPointerCaptureReleased()
      expect(selectionSpy).not.toHaveBeenCalled()
      expectNoSimulationPauseLifecycle()

      simulation.paused = true
      interaction.disable()
      expect(simulation.resume).not.toHaveBeenCalled()
      expect(simulation.paused).toBe(true)
    })

    it('cleans up a machine drag that loses pointer capture without pausing the simulation', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      dispatchPointer('pointerdown')
      expect((canvas as any).setPointerCapture).toHaveBeenCalledWith(7)
      expectNoSimulationPauseLifecycle()

      dispatchPointer('lostpointercapture')
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      expectPointerCaptureReleased()
      expect(selectionSpy).not.toHaveBeenCalled()
      expectNoSimulationPauseLifecycle()

      simulation.paused = true
      interaction.disable()
      expect(simulation.resume).not.toHaveBeenCalled()
      expect(simulation.paused).toBe(true)
    })

    it('does not pause or commit when a machine is dropped on an empty but invalid cell', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      vi.spyOn(factory, 'canMoveMachine').mockReturnValue(false)
      vi.spyOn(factory, 'moveMachine').mockReturnValue(false)

      dispatchPointer('pointerdown')
      expect((canvas as any).setPointerCapture).toHaveBeenCalledWith(7)
      expectNoSimulationPauseLifecycle()

      setRaycastCell({ x: 3, z: 3 })
      // Dispatch with moved client coords so this is treated as a real drag
      // (not a click), exercising the drop/commit path rather than selection.
      dispatchPointer('pointermove', 200, 200)
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      expectNoSimulationPauseLifecycle()

      dispatchPointer('pointerup', 200, 200)
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      expect(selectionSpy).not.toHaveBeenCalled()
      expectPointerCaptureReleased()
      expect((interaction as any).controls.enabled).toBe(true)
      expectNoSimulationPauseLifecycle()
    })
  })

  describe('machine drag atomic simulation pause lifecycle', () => {
    let factory: Factory
    let interaction: GridInteraction
    let simulation: DragPauseSimulation
    let setRaycastCell: (cell: RaycastCell) => void

    const fakePointerEvent = (type: string, clientX = 100, clientY = 100) =>
      ({ type, button: 0, clientX, clientY }) as unknown as PointerEvent

    beforeEach(() => {
      ;({ factory, interaction, simulation, setRaycastCell } = createDragPauseHarness())
    })

    it('does not pause a running simulation on pointerdown or while previewing a machine drag', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      expect(simulation.pause).not.toHaveBeenCalled()
      expect(simulation.resume).not.toHaveBeenCalled()
      expect(simulation.paused).toBe(false)

      setRaycastCell({ x: 3, z: 3 })
      ;(interaction as any).handlePointerMove(fakePointerEvent('pointermove'))
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      expect(simulation.pause).not.toHaveBeenCalled()
      expect(simulation.resume).not.toHaveBeenCalled()
      expect(simulation.paused).toBe(false)
    })

    it('pauses immediately before a valid committed machine move and resumes immediately after it', () => {
      const callOrder: string[] = []
      simulation.pause.mockImplementation(() => {
        callOrder.push('pause')
        simulation.paused = true
      })
      simulation.resume.mockImplementation(() => {
        callOrder.push('resume')
        simulation.paused = false
      })
      const moveMachine = factory.moveMachine.bind(factory)
      vi.spyOn(factory, 'moveMachine').mockImplementation((fromX, fromZ, toX, toZ) => {
        callOrder.push('moveMachine')
        return moveMachine(fromX, fromZ, toX, toZ)
      })
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      setRaycastCell({ x: 2, z: 2 })
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))

      expect(callOrder).toEqual([])
      expect(simulation.pause).not.toHaveBeenCalled()
      expect(simulation.resume).not.toHaveBeenCalled()

      setRaycastCell({ x: 3, z: 3 })
      // Pointerup at moved client coords so it is treated as a drag (not click)
      // and the commit path runs.
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup', 200, 200))
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

      expect(callOrder).toEqual(['pause', 'moveMachine', 'resume'])
      expect(simulation.pause).toHaveBeenCalledTimes(1)
      expect(factory.moveMachine).toHaveBeenCalledTimes(1)
      expect(factory.moveMachine).toHaveBeenCalledWith(2, 2, 3, 3)
      expect(simulation.resume).toHaveBeenCalledTimes(1)
      expect(simulation.paused).toBe(false)
    })

    it('does not issue a pause/resume pair when a machine drag is released off-grid', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))
      expect(simulation.pause).not.toHaveBeenCalled()
      expect(simulation.resume).not.toHaveBeenCalled()

      setRaycastCell(null)
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      expect(simulation.pause).not.toHaveBeenCalled()
      expect(simulation.resume).not.toHaveBeenCalled()
      expect(simulation.paused).toBe(false)
    })

    it('does not issue a pause/resume pair when a machine drag is cancelled', () => {
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))
      expect(simulation.pause).not.toHaveBeenCalled()
      expect(simulation.resume).not.toHaveBeenCalled()

      ;(interaction as any).handlePointerCancel(fakePointerEvent('pointercancel'))
      expectFactoryState(factory, ASSEMBLER_AT_2_2)

      expect(simulation.pause).not.toHaveBeenCalled()
      expect(simulation.resume).not.toHaveBeenCalled()
      expect(simulation.paused).toBe(false)
    })

    it('does not issue a pause/resume pair when a machine drag has no valid move', () => {
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

      setRaycastCell({ x: 2, z: 2 })
      ;(interaction as any).handlePointerDown(fakePointerEvent('pointerdown'))
      expect(simulation.pause).not.toHaveBeenCalled()
      expect(simulation.resume).not.toHaveBeenCalled()

      setRaycastCell({ x: 3, z: 3 })
      ;(interaction as any).handlePointerUp(fakePointerEvent('pointerup'))
      expectFactoryState(factory, A_AND_P)

      expect(simulation.pause).not.toHaveBeenCalled()
      expect(simulation.resume).not.toHaveBeenCalled()
      expect(simulation.paused).toBe(false)
    })
  })
})
