/**
 * @vitest-environment jsdom
 *
 * INTEGRATION GUARD (RED step) — the test that would have caught
 * the production bug where the new `on item arrives` + `route items
 * to` blocks had no effect.
 *
 * Pre-existing tests in `wireSimulationEffects.itemArrival.test.ts`
 * mock the `PxtEditor` interface and stub
 * `triggerOnItemArrives` themselves — so the integration gap (the
 * REAL `PxtEditor` class never delegated to its interpreter) was
 * silent.
 *
 * This file constructs a REAL `PxtEditor`, registers a real
 * `events.onItemArrives` handler via the real interpreter, and
 * pushes the registered bridge through the real
 * `createSimulationEffectsWireUp`. It MUST FAIL until
 * `PxtEditor.triggerOnItemArrives` exists, because the bridge will
 * short-circuit on `typeof editor.triggerOnItemArrives !==
 * 'function'` and return `[]`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSimulationEffectsWireUp } from '../../../src/ui/wireSimulationEffects'
import { PxtEditor } from '../../../src/editor/PxtEditor'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import type { Item } from '../../../src/game/Item'
import type { SimulationCommand } from '../../../src/game/types'

type WireUpOptions = Parameters<typeof createSimulationEffectsWireUp>[0]
type ItemArrivalBridgeFn = (machineId: string, item: Item) => SimulationCommand[]

interface FakeSimulation {
  on: ReturnType<typeof vi.fn>
  getMachine: ReturnType<typeof vi.fn>
  enqueueCommands: ReturnType<typeof vi.fn>
  setItemArrivalBridge: ReturnType<typeof vi.fn>
}

function createFakeSimulation(): FakeSimulation {
  return {
    on: vi.fn(),
    getMachine: vi.fn(() => ({ machineType: 'splitter' as const, name: 'M1' })),
    enqueueCommands: vi.fn(),
    setItemArrivalBridge: vi.fn(),
  }
}

function buildOptions(sim: FakeSimulation, editor: PxtEditor): WireUpOptions {
  const base = {
    getSimulation: () => sim as never,
    getFactory: () => ({ getMachines: () => [{ id: 'machine_1', x: 0, z: 0 }] }),
    getParticleEffects: () => ({ emitSparksAt: vi.fn() }),
    modal: { show: vi.fn() } as never,
    resolveFallbackMachineType: vi.fn(() => undefined),
    resolveFallbackMachineName: vi.fn(() => undefined),
    getPxtEditor: () => editor,
  }
  return base as unknown as WireUpOptions
}

function captureBridge(sim: FakeSimulation): ItemArrivalBridgeFn {
  expect(sim.setItemArrivalBridge).toHaveBeenCalledTimes(1)
  const fn = sim.setItemArrivalBridge.mock.calls[0]?.[0] as
    | ItemArrivalBridgeFn
    | null
    | undefined
  expect(typeof fn).toBe('function')
  return fn as ItemArrivalBridgeFn
}

describe('createSimulationEffectsWireUp + REAL PxtEditor — onItemArrives end-to-end', () => {
  let editor: PxtEditor
  let sim: FakeSimulation

  beforeEach(() => {
    resetItemIdCounter()
    editor = new PxtEditor()
    sim = createFakeSimulation()
  })

  it('bridge produces a SET_OUTPUT_SIDES command when the real PxtEditor has a registered handler', () => {
    // Register a real `events.onItemArrives` handler via the real
    // interpreter. Machine.A → machine_1 in the default slot map,
    // Machine.B → machine_2.
    editor.interpreter.interpret(`
      events.onItemArrives(Machine.A, () => {
        machines.routeItemsTo(Machine.B, SplitterOutputs.Right)
      })
    `)

    // Wire up effects with the real editor on the call path.
    createSimulationEffectsWireUp(buildOptions(sim, editor))()

    const bridge = captureBridge(sim)
    const item = createItem('wheel_small')
    const commands = bridge('machine_1', item)

    // The crux: with a real PxtEditor on the bridge path, the command
    // list must be NON-empty. Pre-fix this returns `[]` because the
    // real PxtEditor lacks `triggerOnItemArrives`.
    expect(commands.length).toBeGreaterThan(0)

    const cmd = commands[0] as {
      type: string
      machineId: string
      sidesBitmask: number
    }
    expect(cmd.type).toBe('SET_OUTPUT_SIDES')
    expect(cmd.machineId).toBe('machine_2')
    expect(cmd.sidesBitmask).toBe(4) // SPLITTER_SIDE_BIT.right
  })

  it('bridge calls into the real PxtEditor.interpreter even when no handler is registered (delegation path is still exercised)', () => {
    // No interpreter.interpret() here — handler map is empty.
    // Spy on the interpreter to PROVE the bridge reaches it. Pre-fix
    // the bridge short-circuits on `typeof editor.triggerOnItemArrives
    // !== 'function'` and never calls the interpreter, so this spy
    // would record zero calls.
    const interpreterSpy = vi.spyOn(editor.interpreter, 'triggerOnItemArrives')

    createSimulationEffectsWireUp(buildOptions(sim, editor))()

    const bridge = captureBridge(sim)
    const item = createItem('wheel_small')
    const result = bridge('machine_1', item)

    expect(interpreterSpy).toHaveBeenCalledTimes(1)
    expect(interpreterSpy).toHaveBeenCalledWith('machine_1', item)
    expect(result).toEqual([])
  })
})
