import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * E4h — RED-step pin for legacy mocks scattered across the test
 * suite that conform to the OLD `SimulationLike` / `PxtEditorLike`
 * structural shapes.
 *
 * These tests pin the canonical files where the GREEN agent must
 * remove the residual `setSplitterHandlerBridge: vi.fn()` lines (and
 * any `triggerSplitterItemArrived` mock fields). Once the wiring
 * interface in `src/ui/wireSimulationEffects.ts` no longer declares
 * `setSplitterHandlerBridge`, every mock that still spreads it will
 * fail the structural conformance check at compile time — so they
 * MUST be cleaned up alongside the source deletion.
 *
 * The pins below are intentionally narrow to the FILE LEVEL: each
 * test asserts that the named test-fixture file is free of legacy
 * mock references. This makes the GREEN-step diff trivial to map
 * (file ↔ file).
 *
 * Files covered (located via the QA cross-walk in the RED report):
 *   - tests/unit/main/RemovedEffectsWiring.test.ts (line 205 today)
 *   - tests/unit/ui/wireSimulationEffects.test.ts  (lines 24, 40, 46 today)
 *   - tests/unit/ui/wireSimulationEffects.itemArrival.test.ts
 *       (lines 31, 40, 48, 217, 222, 228 today)
 *   - tests/unit/game/Simulation.cycleCompleted.test.ts
 *       (lines 18, 21 today — uses the setter on a real Simulation)
 *   - tests/unit/game/Splitter.routing.test.ts
 *       (lines 405-406 today — casts and calls the setter)
 *   - tests/unit/game/SplitterConditionRemoval.test.ts
 *       (lines 138-139, 152-153 today — positive source-content
 *        assertions naming the deleted symbols)
 */

const RESULT_FILES = [
  'tests/unit/main/RemovedEffectsWiring.test.ts',
  'tests/unit/ui/wireSimulationEffects.test.ts',
  'tests/unit/ui/wireSimulationEffects.itemArrival.test.ts',
  'tests/unit/game/Simulation.cycleCompleted.test.ts',
  'tests/unit/game/Splitter.routing.test.ts',
  'tests/unit/game/SplitterConditionRemoval.test.ts',
] as const

function readTestSource(relPath: string): string {
  return readFileSync(resolve(__dirname, '../../../', relPath), 'utf8')
}

describe('Test fixture cleanup — no legacy `setSplitterHandlerBridge` mocks (E4h / N)', () => {
  for (const file of RESULT_FILES) {
    it(`N: ${file} contains NO reference to setSplitterHandlerBridge`, () => {
      const src = readTestSource(file)
      expect(
        src,
        `After E4h the wiring interface no longer declares ` +
          `setSplitterHandlerBridge. Any mock that still spreads it will ` +
          `become a stale field on a no-longer-existing structural slot. ` +
          `Remove the field from this fixture file (and the corresponding ` +
          `interface property if the file declares its own SimulationLike).`,
      ).not.toMatch(/\bsetSplitterHandlerBridge\b/)
    })
  }
})

describe('Test fixture cleanup — no legacy `triggerSplitterItemArrived` mocks (E4h / N)', () => {
  for (const file of RESULT_FILES) {
    it(`N: ${file} contains NO reference to triggerSplitterItemArrived`, () => {
      const src = readTestSource(file)
      expect(
        src,
        `The optional editor-shape declaration is removed in E4h. ` +
          `Mocks that still set this field can be deleted; tests that ` +
          `assert on its invocation must be deleted or rewritten to ` +
          `assert on triggerOnItemArrives.`,
      ).not.toMatch(/\btriggerSplitterItemArrived\b/)
    })
  }
})
