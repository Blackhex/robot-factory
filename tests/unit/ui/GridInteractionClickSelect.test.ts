/**
 * @vitest-environment jsdom
 *
 * Verifies that a pointer-down → pointer-up sequence with negligible movement
 * is treated as a click that selects the source machine, rather than as a drag
 * that commits a drop. Covers two regressions:
 *   1. Clicking a tall machine body in an angled view used to MOVE the
 *      machine because the body raycast resolved to a different ground cell
 *      than the machine's origin.
 *   2. Clicking an input/output slot used to do nothing, because the belt
 *      drag committer found no real drop target and the machine was never
 *      selected.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { ASSEMBLER_AT_2_2, createMockSceneManager } from './helpers/GridInteractionTestHarness'

import { initI18n } from '../../../src/i18n/i18n'
import { Factory } from '../../../src/game/Factory'
import type { MachineInfo } from '../../../src/game/Factory'
import { GridInteraction } from '../../../src/rendering/GridInteraction'
import { expectFactoryState } from '../helpers/factoryAssert'

beforeAll(async () => {
  await initI18n()
})

type RaycastCell = { x: number; z: number } | null
type RaycastInteractionHit =
  | { type: 'machine'; machineId: string }
  | { type: 'input' | 'output'; machineId: string; slotIndex: number }
  | null

function setupClickHarness(options: {
  initialRaycastCell?: RaycastCell
  bodyRaycastCell?: RaycastCell
  interactionHit?: RaycastInteractionHit
} = {}): {
  factory: Factory
  interaction: GridInteraction
  canvas: HTMLElement
  selectionSpy: ReturnType<typeof vi.fn>
  beltSelectionSpy: ReturnType<typeof vi.fn>
  machine: MachineInfo
  setRaycastCell: (cell: RaycastCell) => void
  setBodyRaycastCell: (cell: RaycastCell) => void
  setInteractionHit: (hit: RaycastInteractionHit) => void
} {
  const factory = new Factory(5, 5)
  const machine = factory.placeMachine(2, 2, 'assembler', 'south') as MachineInfo
  const sm = createMockSceneManager()
  const canvas = sm.getRenderer().domElement

  let interactionHit: RaycastInteractionHit = options.interactionHit ?? null
  const factoryRendererMock = {
    raycastInteraction: vi.fn(() => interactionHit),
    raycastBelt: vi.fn(() => null),
    highlightMachine: vi.fn(),
    clearMachineHighlight: vi.fn(),
    highlightBelts: vi.fn(),
    clearBeltHighlight: vi.fn(),
  } as any

  const interaction = new GridInteraction(sm, factory, vi.fn(), factoryRendererMock)
  interaction.enable()

  const selectionSpy = vi.fn()
  const beltSelectionSpy = vi.fn()
  interaction.onMachineSelected = selectionSpy as (m: MachineInfo | null) => void
  interaction.onBeltSelected = beltSelectionSpy

  const capturedPointers = new Set<number>()
  ;(canvas as any).setPointerCapture = vi.fn((id: number) => { capturedPointers.add(id) })
  ;(canvas as any).releasePointerCapture = vi.fn((id: number) => { capturedPointers.delete(id) })
  ;(canvas as any).hasPointerCapture = vi.fn((id: number) => capturedPointers.has(id))

  let groundCell = options.initialRaycastCell === undefined ? { x: 2, z: 2 } : options.initialRaycastCell
  let bodyCell = options.bodyRaycastCell === undefined ? groundCell : options.bodyRaycastCell

  // raycastToGrid is called both with no argument (ground plane) and with the
  // machineDragPlane (body). Distinguish by the presence of an argument.
  vi.spyOn(interaction as any, 'raycastToGrid').mockImplementation((...args: any[]) => {
    return args.length > 0 ? bodyCell : groundCell
  })
  vi.spyOn(interaction as any, 'updateMouseNDC').mockImplementation(() => {})

  return {
    factory,
    interaction,
    canvas,
    selectionSpy,
    beltSelectionSpy,
    machine,
    setRaycastCell: (cell: RaycastCell) => { groundCell = cell; if (options.bodyRaycastCell === undefined) bodyCell = cell },
    setBodyRaycastCell: (cell: RaycastCell) => { bodyCell = cell },
    setInteractionHit: (hit: RaycastInteractionHit) => { interactionHit = hit },
  }
}

function dispatchPointer(canvas: HTMLElement, type: string, clientX: number, clientY: number): void {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY })
  Object.defineProperty(event, 'pointerId', { value: 11 })
  canvas.dispatchEvent(event)
}

describe('GridInteraction click-vs-drag selection', () => {
  it('clicks on a machine body in an angled view select the machine and do not move it', () => {
    // Simulate the angled-view bug: the body raycast lands on cell (3, 2)
    // even though the user clicked the assembler at (2, 2).
    const harness = setupClickHarness({
      initialRaycastCell: { x: 2, z: 2 },
      bodyRaycastCell: { x: 3, z: 2 },
      interactionHit: { type: 'machine', machineId: 'will-be-overwritten' },
    })
    const { factory, canvas, selectionSpy, machine, setInteractionHit } = harness
    setInteractionHit({ type: 'machine', machineId: machine.id })

    expectFactoryState(factory, ASSEMBLER_AT_2_2)

    // Pointerdown then pointerup with ≤5px movement → click → select.
    dispatchPointer(canvas, 'pointerdown', 100, 100)
    dispatchPointer(canvas, 'pointerup', 102, 101)

    expect(selectionSpy).toHaveBeenCalledTimes(1)
    expect(selectionSpy).toHaveBeenCalledWith(expect.objectContaining({ x: 2, z: 2 }))
    // No move occurred — assembler still at (2, 2), nothing at (3, 2).
    expectFactoryState(factory, ASSEMBLER_AT_2_2)
  })

  it('clicks on an input slot select the owning machine without placing a belt', () => {
    const harness = setupClickHarness({ initialRaycastCell: null })
    const { factory, canvas, selectionSpy, beltSelectionSpy, machine, setInteractionHit } = harness
    setInteractionHit({ type: 'input', machineId: machine.id, slotIndex: 0 })

    expectFactoryState(factory, ASSEMBLER_AT_2_2)

    dispatchPointer(canvas, 'pointerdown', 150, 150)
    dispatchPointer(canvas, 'pointerup', 150, 150)

    // beginBeltDrag deselects first (null), then the click branch selects
    // the owning machine.
    expect(selectionSpy).toHaveBeenLastCalledWith(expect.objectContaining({ x: 2, z: 2 }))
    expect(beltSelectionSpy).not.toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }))
    expectFactoryState(factory, ASSEMBLER_AT_2_2)
  })

  it('clicks on an output slot select the owning machine without placing a belt', () => {
    const harness = setupClickHarness({ initialRaycastCell: null })
    const { factory, canvas, selectionSpy, beltSelectionSpy, machine, setInteractionHit } = harness
    setInteractionHit({ type: 'output', machineId: machine.id, slotIndex: 0 })

    dispatchPointer(canvas, 'pointerdown', 50, 50)
    dispatchPointer(canvas, 'pointerup', 53, 51)

    expect(selectionSpy).toHaveBeenLastCalledWith(expect.objectContaining({ x: 2, z: 2 }))
    expect(beltSelectionSpy).not.toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }))
    expectFactoryState(factory, ASSEMBLER_AT_2_2)
  })

  it('drags (>5px movement) on a machine still moves it to the drop cell', () => {
    const harness = setupClickHarness({
      initialRaycastCell: { x: 2, z: 2 },
      interactionHit: { type: 'machine', machineId: 'placeholder' },
    })
    const { factory, canvas, selectionSpy, machine, setInteractionHit, setRaycastCell } = harness
    setInteractionHit({ type: 'machine', machineId: machine.id })

    expectFactoryState(factory, ASSEMBLER_AT_2_2)

    dispatchPointer(canvas, 'pointerdown', 100, 100)
    setRaycastCell({ x: 3, z: 3 })
    dispatchPointer(canvas, 'pointermove', 200, 200)
    dispatchPointer(canvas, 'pointerup', 200, 200)

    // Machine moved to (3, 3); selection NOT triggered by the click branch.
    expect(selectionSpy).not.toHaveBeenCalled()
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
  })

  it('treats movement exactly at the 5px threshold as a click (boundary)', () => {
    const harness = setupClickHarness({
      initialRaycastCell: { x: 2, z: 2 },
      interactionHit: { type: 'machine', machineId: 'placeholder' },
    })
    const { factory, canvas, selectionSpy, machine, setInteractionHit } = harness
    setInteractionHit({ type: 'machine', machineId: machine.id })

    dispatchPointer(canvas, 'pointerdown', 100, 100)
    // Distance squared = 3² + 4² = 25, which equals threshold → still a click.
    dispatchPointer(canvas, 'pointerup', 103, 104)

    expect(selectionSpy).toHaveBeenCalledTimes(1)
    expectFactoryState(factory, ASSEMBLER_AT_2_2)
  })
})
