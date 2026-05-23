import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSimulationEffectsWireUp } from '../../../src/ui/wireSimulationEffects'
import { createItem } from '../../../src/game/Item'
import type { Item } from '../../../src/game/Item'
import type { SimulationCommand } from '../../../src/game/types'

/**
 * RED-step tests for E4a — the production wire-up between
 * `Simulation.setItemArrivalBridge` (added in E3) and
 * `BlockInterpreter.triggerOnItemArrives` (also added in E3).
 *
 * Pins that `createSimulationEffectsWireUp` calls
 * `sim.setItemArrivalBridge(...)` with a function that delegates to
 * `editor.triggerOnItemArrives(...)`.
 */

type WireUpOptions = Parameters<typeof createSimulationEffectsWireUp>[0]
type ItemArrivalBridgeFn = (machineId: string, item: Item) => SimulationCommand[]

interface FakeSimulationItemArrival {
  on: ReturnType<typeof vi.fn>
  getMachine: ReturnType<typeof vi.fn>
  enqueueCommands: ReturnType<typeof vi.fn>
  setItemArrivalBridge: ReturnType<typeof vi.fn>
}

function createFakeSimulation(): FakeSimulationItemArrival {
  return {
    on: vi.fn(),
    getMachine: vi.fn(() => ({ machineType: 'splitter' as const, name: 'M1' })),
    enqueueCommands: vi.fn(),
    setItemArrivalBridge: vi.fn(),
  }
}

interface FakePxtEditor {
  triggerEvent: ReturnType<typeof vi.fn>
  triggerOnItemArrives?: ReturnType<typeof vi.fn>
}

function createBaseOptions(
  sim: FakeSimulationItemArrival,
  editor: FakePxtEditor | null,
): WireUpOptions {
  const base = {
    getSimulation: () => sim as never,
    getFactory: () => ({ getMachines: () => [{ id: 'machine_X', x: 4, z: 7 }] }),
    modal: { show: vi.fn() } as never,
    resolveFallbackMachineType: vi.fn(() => undefined),
    resolveFallbackMachineName: vi.fn(() => undefined),
    getPxtEditor: () => editor as never,
  }
  return base as unknown as WireUpOptions
}

/**
 * Reads the function passed to `sim.setItemArrivalBridge` on its first
 * (and only) call. Asserts that exactly one call was made so a missing
 * wire-up surfaces here as a clear failure rather than a downstream
 * `undefined is not a function`.
 */
function captureItemArrivalBridge(
  sim: FakeSimulationItemArrival,
): ItemArrivalBridgeFn {
  expect(sim.setItemArrivalBridge).toHaveBeenCalledTimes(1)
  const fn = sim.setItemArrivalBridge.mock.calls[0]?.[0] as ItemArrivalBridgeFn | null | undefined
  expect(typeof fn).toBe('function')
  return fn as ItemArrivalBridgeFn
}

describe('createSimulationEffectsWireUp — onItemArrives bridge wiring (E4a)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  it('invokes sim.setItemArrivalBridge exactly once with a non-null function', () => {
    const sim = createFakeSimulation()
    const editor: FakePxtEditor = {
      triggerEvent: vi.fn(() => [] as SimulationCommand[]),
      triggerOnItemArrives: vi.fn(() => [] as SimulationCommand[]),
    }
    const wireUp = createSimulationEffectsWireUp(createBaseOptions(sim, editor))

    wireUp()

    expect(sim.setItemArrivalBridge).toHaveBeenCalledTimes(1)
    const arg = sim.setItemArrivalBridge.mock.calls[0]?.[0]
    expect(arg).not.toBeNull()
    expect(typeof arg).toBe('function')
  })

  it('delegates calls (machineId, item) to editor.triggerOnItemArrives with identical arguments', () => {
    const sim = createFakeSimulation()
    const triggerOnItemArrives = vi.fn(() => [] as SimulationCommand[])
    const editor: FakePxtEditor = {
      triggerEvent: vi.fn(() => [] as SimulationCommand[]),
      triggerOnItemArrives,
    }
    const wireUp = createSimulationEffectsWireUp(createBaseOptions(sim, editor))
    wireUp()

    const bridge = captureItemArrivalBridge(sim)
    const item = createItem('raw_material', 75)
    bridge('machine_X', item)

    expect(triggerOnItemArrives).toHaveBeenCalledTimes(1)
    expect(triggerOnItemArrives).toHaveBeenCalledWith('machine_X', item)
  })

  it('returns the SimulationCommand[] produced by editor.triggerOnItemArrives unchanged', () => {
    const sim = createFakeSimulation()
    const commands: SimulationCommand[] = [
      { type: 'START_MACHINE', machineId: 'machine_X' } as SimulationCommand,
      { type: 'STOP_MACHINE', machineId: 'machine_Y' } as SimulationCommand,
    ]
    const triggerOnItemArrives = vi.fn(() => commands)
    const editor: FakePxtEditor = {
      triggerEvent: vi.fn(() => [] as SimulationCommand[]),
      triggerOnItemArrives,
    }
    const wireUp = createSimulationEffectsWireUp(createBaseOptions(sim, editor))
    wireUp()

    const bridge = captureItemArrivalBridge(sim)
    const result = bridge('machine_X', createItem('raw_material'))

    // The setter contract states the simulation enqueues commands itself;
    // the wire-up MUST forward them as the function's return value rather
    // than calling enqueueCommands directly.
    expect(result).toBe(commands)
    expect(sim.enqueueCommands).not.toHaveBeenCalled()
  })

  it('returns [] when getPxtEditor() yields null', () => {
    const sim = createFakeSimulation()
    const wireUp = createSimulationEffectsWireUp(createBaseOptions(sim, null))
    wireUp()

    const bridge = captureItemArrivalBridge(sim)
    const result = bridge('machine_X', createItem('raw_material'))

    expect(result).toEqual([])
    expect(sim.enqueueCommands).not.toHaveBeenCalled()
  })

  it('returns [] when the editor lacks triggerOnItemArrives (defensive)', () => {
    const sim = createFakeSimulation()
    // Editor object exists but is missing the method (stale / partial mock).
    const editor: FakePxtEditor = {
      triggerEvent: vi.fn(() => [] as SimulationCommand[]),
    }
    const wireUp = createSimulationEffectsWireUp(createBaseOptions(sim, editor))
    wireUp()

    const bridge = captureItemArrivalBridge(sim)
    const result = bridge('machine_X', createItem('raw_material'))

    expect(result).toEqual([])
  })

  it('returns [] and swallows the error when editor.triggerOnItemArrives throws', () => {
    const sim = createFakeSimulation()
    const triggerOnItemArrives = vi.fn(() => {
      throw new Error('handler exploded')
    })
    const editor: FakePxtEditor = {
      triggerEvent: vi.fn(() => [] as SimulationCommand[]),
      triggerOnItemArrives,
    }
    const wireUp = createSimulationEffectsWireUp(createBaseOptions(sim, editor))
    wireUp()

    const bridge = captureItemArrivalBridge(sim)
    let result: readonly SimulationCommand[] | undefined
    expect(() => {
      result = bridge('machine_X', createItem('raw_material'))
    }).not.toThrow()

    expect(triggerOnItemArrives).toHaveBeenCalledTimes(1)
    expect(result).toEqual([])
  })

  it('does not call setItemArrivalBridge a second time when wire-up is invoked twice with the same sim', () => {
    const sim = createFakeSimulation()
    const editor: FakePxtEditor = {
      triggerEvent: vi.fn(() => [] as SimulationCommand[]),
      triggerOnItemArrives: vi.fn(() => [] as SimulationCommand[]),
    }
    const wireUp = createSimulationEffectsWireUp(createBaseOptions(sim, editor))

    wireUp()
    wireUp()

    expect(sim.setItemArrivalBridge).toHaveBeenCalledTimes(1)
  })
})

/**
 * Positive integration guard added alongside the mock-based tests
 * above. The mock suite would have stayed green even when the real
 * `PxtEditor` lacked `triggerOnItemArrives` (production bug). This
 * block instantiates the REAL `PxtEditor` and pins that the bridge
 * does NOT short-circuit to `[]` when a handler has been registered
 * via the real interpreter.
 */
describe('createSimulationEffectsWireUp + real PxtEditor — interface consistency', () => {
  it('does not short-circuit to [] when a real PxtEditor has a registered onItemArrives handler', async () => {
    // Lazy-loaded so the mock-based suite above keeps running even if
    // the editor module surface shifts during the GREEN step.
    const { PxtEditor } = await import('../../../src/editor/PxtEditor')
    const editor = new PxtEditor()
    editor.interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        machines.routeItemsTo(Machine.B, SplitterOutputs.Right)
      })
    `)

    // Sanity: the public surface check the bridge performs must pass
    // for a real editor. This is the assertion that pins the missing
    // delegation method directly.
    expect(
      typeof (editor as unknown as { triggerOnItemArrives?: unknown })
        .triggerOnItemArrives,
    ).toBe('function')

    const sim = createFakeSimulation()
    const wireUp = createSimulationEffectsWireUp(
      createBaseOptions(sim, editor as unknown as FakePxtEditor),
    )
    wireUp()

    const bridge = captureItemArrivalBridge(sim)
    const result = bridge('machine_1', createItem('wheel_small'))

    expect(result.length).toBeGreaterThan(0)
    expect((result[0] as { type: string }).type).toBe('SET_OUTPUT_SIDES')
  })
})
