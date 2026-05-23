import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSimulationEffectsWireUp } from '../../../src/ui/wireSimulationEffects'
import type { SimulationCommand } from '../../../src/game/types'

/**
 * Tests for the simulation -> PxtEditor event bridge wired up inside
 * `createSimulationEffectsWireUp`. Without this bridge the
 * `factory_on_machine_idle` PXT block looks pluggable but its handler
 * never fires because nothing translates the simulation's
 * `machine_state_changed` events into `machine_idle_<id>` event-handler
 * dispatches.
 *
 * These tests stub `SimulationLike` and `PxtEditorLike` directly — they
 * MUST NOT instantiate the real `Simulation` or `PxtEditor` (those are
 * integration concerns).
 */

type WireUpOptions = Parameters<typeof createSimulationEffectsWireUp>[0]

interface FakeSimulation {
  on: ReturnType<typeof vi.fn>
  getMachine: ReturnType<typeof vi.fn>
  enqueueCommands: ReturnType<typeof vi.fn>
  setItemArrivalBridge: ReturnType<typeof vi.fn>
  emitMachineStateChanged: (data: unknown) => void
  emitMachineCycleCompleted: (data: unknown) => void
  machineStateListenerCount: () => number
  machineCycleCompletedListenerCount: () => number
}

function createFakeSimulation(): FakeSimulation {
  const listeners: Record<string, Array<(event: { data: unknown }) => void>> = {}
  const on = vi.fn((event: string, listener: (event: { data: unknown }) => void) => {
    if (!listeners[event]) listeners[event] = []
    listeners[event].push(listener)
  })
  const getMachine = vi.fn(() => ({ machineType: 'assembler' as const, name: 'M1' }))
  const enqueueCommands = vi.fn()
  const setItemArrivalBridge = vi.fn()
  return {
    on,
    getMachine,
    enqueueCommands,
    setItemArrivalBridge,
    emitMachineStateChanged(data: unknown) {
      const subs = listeners['machine_state_changed'] ?? []
      for (const sub of subs) sub({ data })
    },
    emitMachineCycleCompleted(data: unknown) {
      const subs = listeners['machine_cycle_completed'] ?? []
      for (const sub of subs) sub({ data })
    },
    machineStateListenerCount() {
      return (listeners['machine_state_changed'] ?? []).length
    },
    machineCycleCompletedListenerCount() {
      return (listeners['machine_cycle_completed'] ?? []).length
    },
  }
}

function createBaseOptions(sim: FakeSimulation): WireUpOptions {
  return {
    getSimulation: () => sim as never,
    getFactory: () => ({ getMachines: () => [{ id: 'machine_X', x: 4, z: 7 }] }),
    modal: { show: vi.fn() } as never,
    resolveFallbackMachineType: vi.fn(() => undefined),
    resolveFallbackMachineName: vi.fn(() => undefined),
  }
}

/**
 * Adds the proposed `getPxtEditor` option to the wire-up options without
 * relying on it being part of the published type yet. The GREEN-step
 * implementation is expected to add this field to
 * `CreateSimulationEffectsWireUpOptions`; until then we cast through
 * `unknown` so the test file still compiles.
 */
function withPxtEditor(
  base: WireUpOptions,
  getPxtEditor: () => { triggerEvent(eventType: string): SimulationCommand[] } | null,
): WireUpOptions {
  return {
    ...(base as unknown as Record<string, unknown>),
    getPxtEditor,
  } as unknown as WireUpOptions
}

describe('createSimulationEffectsWireUp — machine_idle event bridge', () => {
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

  it('dispatches machine_idle_<id> to PxtEditor when a machine transitions to idle', () => {
    const sim = createFakeSimulation()
    const command: SimulationCommand = { type: 'START_MACHINE', machineId: 'machine_X' } as SimulationCommand
    const triggerEvent = vi.fn(() => [command])
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => ({ triggerEvent })),
    )

    wireUp()
    sim.emitMachineStateChanged({ from: 'processing', to: 'idle', machineId: 'machine_X' })

    expect(triggerEvent).toHaveBeenCalledTimes(1)
    expect(triggerEvent).toHaveBeenCalledWith('machine_idle_machine_X')
  })

  it('forwards the returned commands to simulation.enqueueCommands exactly once', () => {
    const sim = createFakeSimulation()
    const commands: SimulationCommand[] = [
      { type: 'START_MACHINE', machineId: 'machine_X' } as SimulationCommand,
      { type: 'STOP_MACHINE', machineId: 'machine_Y' } as SimulationCommand,
    ]
    const triggerEvent = vi.fn(() => commands)
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => ({ triggerEvent })),
    )

    wireUp()
    sim.emitMachineStateChanged({ from: 'processing', to: 'idle', machineId: 'machine_X' })

    expect(sim.enqueueCommands).toHaveBeenCalledTimes(1)
    expect(sim.enqueueCommands).toHaveBeenCalledWith(commands)
  })

  it('does NOT call enqueueCommands when triggerEvent returns an empty array', () => {
    const sim = createFakeSimulation()
    const triggerEvent = vi.fn(() => [] as SimulationCommand[])
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => ({ triggerEvent })),
    )

    wireUp()
    sim.emitMachineStateChanged({ from: 'processing', to: 'idle', machineId: 'machine_X' })

    expect(triggerEvent).toHaveBeenCalledTimes(1)
    expect(sim.enqueueCommands).not.toHaveBeenCalled()
  })

  it('does NOT fire the bridge for non-idle transitions', () => {
    const sim = createFakeSimulation()
    const triggerEvent = vi.fn(() => [] as SimulationCommand[])
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => ({ triggerEvent })),
    )

    wireUp()
    sim.emitMachineStateChanged({ from: 'idle', to: 'processing', machineId: 'machine_X' })
    sim.emitMachineStateChanged({ from: 'processing', to: 'blocked', machineId: 'machine_X' })

    expect(triggerEvent).not.toHaveBeenCalled()
    expect(sim.enqueueCommands).not.toHaveBeenCalled()
  })

  it('does NOT fire the bridge when machineId is missing on the event payload', () => {
    const sim = createFakeSimulation()
    const triggerEvent = vi.fn(() => [] as SimulationCommand[])
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => ({ triggerEvent })),
    )

    wireUp()
    sim.emitMachineStateChanged({ from: 'processing', to: 'idle' })
    sim.emitMachineStateChanged({ from: 'processing', to: 'idle', machineId: undefined })

    expect(triggerEvent).not.toHaveBeenCalled()
    expect(sim.enqueueCommands).not.toHaveBeenCalled()
  })

  it('swallows errors thrown by triggerEvent so the simulation does not crash', () => {
    const sim = createFakeSimulation()
    const boom = new Error('handler exploded')
    const triggerEvent = vi.fn(() => {
      throw boom
    })
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => ({ triggerEvent })),
    )

    wireUp()
    expect(() =>
      sim.emitMachineStateChanged({ from: 'processing', to: 'idle', machineId: 'machine_X' }),
    ).not.toThrow()

    expect(triggerEvent).toHaveBeenCalledTimes(1)
    expect(sim.enqueueCommands).not.toHaveBeenCalled()
  })

  it('skips the bridge subscription gracefully when getPxtEditor returns null', () => {
    const sim = createFakeSimulation()
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => null),
    )

    wireUp()
    expect(() =>
      sim.emitMachineStateChanged({ from: 'processing', to: 'idle', machineId: 'machine_X' }),
    ).not.toThrow()
    expect(sim.enqueueCommands).not.toHaveBeenCalled()
  })

  it('does not double-subscribe when the wire-up factory is invoked twice with the same simulation', () => {
    const sim = createFakeSimulation()
    const triggerEvent = vi.fn(() => [] as SimulationCommand[])
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => ({ triggerEvent })),
    )

    wireUp()
    wireUp()

    sim.emitMachineStateChanged({ from: 'processing', to: 'idle', machineId: 'machine_X' })

    // Bridge subscription must register exactly one listener for idle events,
    // matching the existing wiredSim guard for the sparks subscription.
    expect(triggerEvent).toHaveBeenCalledTimes(1)
  })
})

describe('createSimulationEffectsWireUp — pre-existing behavior must not regress', () => {
  it('does not crash on machine_state_changed -> processing (no particle hook plumbed)', () => {
    const sim = createFakeSimulation()
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => null),
    )

    wireUp()
    expect(() =>
      sim.emitMachineStateChanged({ to: 'processing', machineId: 'machine_X' }),
    ).not.toThrow()
  })

  it('still subscribes to the game_over event via wireGameOverModal', () => {
    const sim = createFakeSimulation()
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => null),
    )

    wireUp()

    const subscribedEvents = sim.on.mock.calls.map((call) => call[0] as string)
    expect(subscribedEvents).toContain('game_over')
  })
})

describe('createSimulationEffectsWireUp — machine_cycle_completed bridge', () => {
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

  it('dispatches machine_idle_<id> when machine_cycle_completed fires with machineId', () => {
    const sim = createFakeSimulation()
    const triggerEvent = vi.fn(() => [] as SimulationCommand[])
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => ({ triggerEvent })),
    )

    wireUp()
    sim.emitMachineCycleCompleted({ machineId: 'machine_X' })

    expect(triggerEvent).toHaveBeenCalledTimes(1)
    expect(triggerEvent).toHaveBeenCalledWith('machine_idle_machine_X')
  })

  it('forwards the returned commands to enqueueCommands', () => {
    const sim = createFakeSimulation()
    const commands: SimulationCommand[] = [
      { type: 'START_MACHINE', machineId: 'machine_X' } as SimulationCommand,
    ]
    const triggerEvent = vi.fn(() => commands)
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => ({ triggerEvent })),
    )

    wireUp()
    sim.emitMachineCycleCompleted({ machineId: 'machine_X' })

    expect(sim.enqueueCommands).toHaveBeenCalledTimes(1)
    expect(sim.enqueueCommands).toHaveBeenCalledWith(commands)
  })

  it('does NOT call enqueueCommands when triggerEvent returns an empty array', () => {
    const sim = createFakeSimulation()
    const triggerEvent = vi.fn(() => [] as SimulationCommand[])
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => ({ triggerEvent })),
    )

    wireUp()
    sim.emitMachineCycleCompleted({ machineId: 'machine_X' })

    expect(triggerEvent).toHaveBeenCalledTimes(1)
    expect(sim.enqueueCommands).not.toHaveBeenCalled()
  })

  it('does NOT fire the bridge when machine_cycle_completed payload omits machineId', () => {
    const sim = createFakeSimulation()
    const triggerEvent = vi.fn(() => [] as SimulationCommand[])
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => ({ triggerEvent })),
    )

    wireUp()
    sim.emitMachineCycleCompleted({})
    sim.emitMachineCycleCompleted({ machineId: undefined })

    expect(triggerEvent).not.toHaveBeenCalled()
    expect(sim.enqueueCommands).not.toHaveBeenCalled()
  })

  it('swallows triggerEvent errors so the simulation does not crash', () => {
    const sim = createFakeSimulation()
    const triggerEvent = vi.fn(() => {
      throw new Error('handler exploded')
    })
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => ({ triggerEvent })),
    )

    wireUp()
    expect(() => sim.emitMachineCycleCompleted({ machineId: 'machine_X' })).not.toThrow()

    expect(triggerEvent).toHaveBeenCalledTimes(1)
    expect(sim.enqueueCommands).not.toHaveBeenCalled()
  })

  it('does not double-subscribe machine_cycle_completed when wire-up runs twice with the same simulation', () => {
    const sim = createFakeSimulation()
    const triggerEvent = vi.fn(() => [] as SimulationCommand[])
    const wireUp = createSimulationEffectsWireUp(
      withPxtEditor(createBaseOptions(sim), () => ({ triggerEvent })),
    )

    wireUp()
    wireUp()

    sim.emitMachineCycleCompleted({ machineId: 'machine_X' })

    expect(sim.machineCycleCompletedListenerCount()).toBe(1)
    expect(triggerEvent).toHaveBeenCalledTimes(1)
  })
})
