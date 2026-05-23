import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * E4h — RED-step pins for deletion of the legacy
 * `SplitterHandlerBridge` wiring from `src/ui/wireSimulationEffects.ts`.
 *
 * After E4h:
 *   - The file no longer imports `SplitterHandlerBridge` from
 *     `../game/Simulation`.
 *   - The structural `SimulationLike` interface no longer declares
 *     the `setSplitterHandlerBridge` method.
 *   - The structural `PxtEditorLike` interface no longer declares the
 *     optional `triggerSplitterItemArrived` method.
 *   - No call to `setSplitterHandlerBridge` remains in the wiring
 *     body — `setItemArrivalBridge` is the single bridge call.
 *   - `SplitterSide` is no longer imported from `../game/types`
 *     (only used by the deleted `triggerSplitterItemArrived` return).
 *
 * Pattern — reads the wiring source as text. Same approach as
 * `tests/unit/pxtSource/factory.routeItemsTo.test.ts`.
 */

const WIRING_TS_PATH = resolve(
  __dirname,
  '../../../src/ui/wireSimulationEffects.ts',
)

function readWiringSource(): string {
  return readFileSync(WIRING_TS_PATH, 'utf8')
}

describe('wireSimulationEffects.ts — legacy bridge import removal (E4h)', () => {
  it('G1: source does NOT import SplitterHandlerBridge from ../game/Simulation', () => {
    const src = readWiringSource()
    expect(
      src,
      'Once the bridge wiring is deleted there is no consumer of the ' +
        'type in this file. The import line must be removed.',
    ).not.toMatch(/import\s+type\s+\{[^}]*SplitterHandlerBridge[^}]*\}\s+from/)
  })

  it('G2: source does NOT contain the identifier `SplitterHandlerBridge`', () => {
    const src = readWiringSource()
    expect(src).not.toMatch(/\bSplitterHandlerBridge\b/)
  })

  it('G3: source does NOT import `SplitterSide` from ../game/types', () => {
    const src = readWiringSource()
    expect(
      src,
      '`SplitterSide` was imported only as the return type of the optional ' +
        '`triggerSplitterItemArrived` declaration on PxtEditorLike. After ' +
        'E4h that declaration is gone, so the type import must be too.',
    ).not.toMatch(/import\s+type\s+\{[^}]*\bSplitterSide\b[^}]*\}\s+from/)
  })
})

describe('wireSimulationEffects.ts — bridge call removal (E4h)', () => {
  it('H: source does NOT call `setSplitterHandlerBridge`', () => {
    const src = readWiringSource()
    expect(
      src,
      '`sim.setSplitterHandlerBridge((machineId, item) => { ... })` is ' +
        'the legacy wiring block deleted by E4h. Only ' +
        '`setItemArrivalBridge` should remain.',
    ).not.toMatch(/\bsetSplitterHandlerBridge\b/)
  })

  it('H2: source still wires the canonical `setItemArrivalBridge` (positive guard)', () => {
    const src = readWiringSource()
    expect(
      src,
      'Sanity check — E4h removes the LEGACY bridge only. The ' +
        'generalized item-arrival bridge wired in E3 must still be in place.',
    ).toMatch(/\bsetItemArrivalBridge\b/)
  })
})

describe('wireSimulationEffects.ts — structural interface cleanup (E4h)', () => {
  it('I: SimulationLike interface does NOT declare `setSplitterHandlerBridge`', () => {
    const src = readWiringSource()
    expect(
      src,
      'A residual interface member would force every test mock to keep ' +
        'a `setSplitterHandlerBridge: vi.fn()` line forever.',
    ).not.toMatch(/setSplitterHandlerBridge\s*\(/)
  })

  it('J: PxtEditorLike interface does NOT declare `triggerSplitterItemArrived?`', () => {
    const src = readWiringSource()
    expect(
      src,
      'The optional declaration on the editor-shape interface paired with ' +
        'the wiring block; both go together.',
    ).not.toMatch(/triggerSplitterItemArrived\s*\??\s*\(/)
  })
})
