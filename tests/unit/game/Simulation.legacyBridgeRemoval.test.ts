import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Simulation } from '../../../src/game/Simulation'

/**
 * E4h — RED-step pins for deletion of the legacy
 * `SplitterHandlerBridge` runtime chain from `src/game/Simulation.ts`.
 *
 * After E4h:
 *   - `SplitterHandlerBridge` is no longer exported (re-exported)
 *     from Simulation.ts (and is deleted at its origin in
 *     MachineBehaviors.ts).
 *   - `Simulation` no longer exposes `setSplitterHandlerBridge`.
 *   - The internal field `splitterHandlerBridge` (and any
 *     `_splitterHandlerBridge` variant) is gone.
 *
 * Pattern — reads source as text, mirroring
 * `tests/unit/pxtSource/factory.routeItemsTo.test.ts` and similar
 * static-source guards used elsewhere in the suite.
 */

const SIMULATION_TS_PATH = resolve(
  __dirname,
  '../../../src/game/Simulation.ts',
)
const MACHINE_BEHAVIORS_TS_PATH = resolve(
  __dirname,
  '../../../src/game/MachineBehaviors.ts',
)

function readSimulationSource(): string {
  return readFileSync(SIMULATION_TS_PATH, 'utf8')
}
function readMachineBehaviorsSource(): string {
  return readFileSync(MACHINE_BEHAVIORS_TS_PATH, 'utf8')
}

describe('Simulation.ts — legacy SplitterHandlerBridge removal (E4h)', () => {
  it('A1: source does NOT re-export SplitterHandlerBridge', () => {
    const src = readSimulationSource()
    expect(
      src,
      'After E4h the legacy bridge type is deleted at its origin and ' +
        'must no longer be re-exported from Simulation.ts. Type re-exports ' +
        'are erased at runtime so this is a source-content pin.',
    ).not.toMatch(/export\s+(?:type\s+)?\{?\s*SplitterHandlerBridge/)
  })

  it('A2: source does NOT import SplitterHandlerBridge from MachineBehaviors', () => {
    const src = readSimulationSource()
    expect(
      src,
      'The import lives only because Simulation.ts uses the bridge ' +
        'internally. After E4h there is no bridge field, no setter, and ' +
        'no re-export, so the import must be deleted.',
    ).not.toMatch(/import\s+type\s+\{[^}]*SplitterHandlerBridge[^}]*\}\s+from/)
  })

  it('A3: MachineBehaviors.ts (origin) no longer declares the SplitterHandlerBridge type', () => {
    const src = readMachineBehaviorsSource()
    expect(
      src,
      'The type originates in MachineBehaviors.ts. E4h deletes it at the ' +
        'source so the entire runtime chain is gone in one cycle.',
    ).not.toMatch(/\bSplitterHandlerBridge\b/)
  })

  it('B: Simulation instance has NO setSplitterHandlerBridge method', () => {
    const sim = new Simulation()
    const setter = (sim as unknown as Record<string, unknown>).setSplitterHandlerBridge
    expect(
      setter,
      'The setter is the only public entry-point that mutates the legacy ' +
        'bridge field. After E4h the wireSimulationEffects layer no longer ' +
        'calls it and the field is gone, so the method itself is deleted.',
    ).toBeUndefined()
  })

  it('C1: source does NOT contain the field name `splitterHandlerBridge`', () => {
    const src = readSimulationSource()
    expect(
      src,
      'The private field that backed the legacy setter must be removed. ' +
        'A residual declaration would mean the runtime chain still exists.',
    ).not.toMatch(/\bsplitterHandlerBridge\b/)
  })

  it('C2: source does NOT contain the underscore-prefixed variant `_splitterHandlerBridge`', () => {
    const src = readSimulationSource()
    expect(src).not.toMatch(/\b_splitterHandlerBridge\b/)
  })

  it('C3: source does NOT reference the type name SplitterHandlerBridge anywhere', () => {
    const src = readSimulationSource()
    expect(
      src,
      'Catches stragglers like a stale JSDoc, a parameter annotation, or ' +
        'an unused import that A1 / A2 might miss.',
    ).not.toMatch(/\bSplitterHandlerBridge\b/)
  })
})
