/**
 * RED-step contract tests for the removal of the Quality Checker
 * (`'quality_checker'`) machine.
 *
 * These tests are written BEFORE the implementation lands and MUST
 * fail against the current codebase. They will turn green when the
 * Checker is fully removed from `src/game/types.ts`,
 * `src/game/Machine.ts`, `src/game/MachineBehaviors.ts`,
 * `src/game/SimulationCommandDispatcher.ts`, `src/game/Simulation.ts`,
 * and `src/game/Level.ts`.
 *
 * Runtime-only assertions (no type-level expectTypeOf): we rely on
 * `tsc --noEmit` (run separately by the build gate) to catch type-level
 * regressions on `MachineType` / `SimulationCommand`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Machine } from '../../../src/game/Machine'
import { Simulation } from '../../../src/game/Simulation'
import { SimulationCommandDispatcher } from '../../../src/game/SimulationCommandDispatcher'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { MACHINE_BEHAVIORS } from '../../../src/game/MachineBehaviors'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { getAllLevels } from '../../../src/game/Level'
import {
  ALL_MACHINE_TYPES,
  PLACEABLE_MACHINE_TYPES,
  type MachineType,
  type SimulationCommand,
} from '../../../src/game/types'

describe('Checker removal — public-API contract', () => {
  // --- Case 1: MachineType union no longer includes 'quality_checker' ---

  describe('MachineType / canonical arrays', () => {
    it('ALL_MACHINE_TYPES does not contain `quality_checker`', () => {
      expect(ALL_MACHINE_TYPES as readonly string[]).not.toContain('quality_checker')
    })

    it('PLACEABLE_MACHINE_TYPES does not contain `quality_checker`', () => {
      expect(PLACEABLE_MACHINE_TYPES as readonly string[]).not.toContain('quality_checker')
    })
  })

  // --- Case 2: MACHINE_BEHAVIORS has no 'quality_checker' entry ---

  describe('MACHINE_BEHAVIORS registry', () => {
    it('has no `quality_checker` registry entry', () => {
      // Cast through `MachineType` because once GREEN lands, the literal
      // is no longer a member of the union.
      const behavior = (MACHINE_BEHAVIORS as Record<string, unknown>)['quality_checker']
      expect(behavior).toBeUndefined()
    })

    it('Object.keys(MACHINE_BEHAVIORS) does not include `quality_checker`', () => {
      expect(Object.keys(MACHINE_BEHAVIORS)).not.toContain('quality_checker')
    })
  })

  // --- Case 3: Machine instances no longer expose `qualityThreshold` ---

  describe('Machine class fields', () => {
    it('does not expose a `qualityThreshold` field on splitter instances', () => {
      const m = new Machine('m1', 'splitter')
      expect((m as unknown as { qualityThreshold?: number }).qualityThreshold).toBeUndefined()
    })

    it('does not expose a `qualityThreshold` field on part_fabricator instances', () => {
      const m = new Machine('m1', 'part_fabricator')
      expect((m as unknown as { qualityThreshold?: number }).qualityThreshold).toBeUndefined()
    })
  })

  // --- Case 4: Legacy SET_QUALITY_THRESHOLD command degrades gracefully ---

  describe('SimulationCommandDispatcher — legacy SET_QUALITY_THRESHOLD', () => {
    it('silently no-ops when given a SET_QUALITY_THRESHOLD command (no throw, no mutation)', () => {
      // GIVEN — a splitter (the closest surviving stand-in for the removed
      // checker) registered with a dispatcher.
      const splitter = new Machine('m1', 'splitter')
      const machines = new Map<string, Machine>([['m1', splitter]])
      const belts = new Map<string, ConveyorBelt>()
      const dispatcher = new SimulationCommandDispatcher({
        getMachine: (id) => machines.get(id),
        getBelt: (id) => belts.get(id),
        getBelts: () => belts,
      })

      // WHEN — dispatch a hand-rolled legacy command. After the removal,
      // `SET_QUALITY_THRESHOLD` is no longer a member of the union, so
      // we cast through `unknown` to keep the test compiling on both
      // sides of the change.
      const legacy = {
        type: 'SET_QUALITY_THRESHOLD',
        machineId: 'm1',
        threshold: 42,
      } as unknown as SimulationCommand

      // THEN — must not throw…
      expect(() => dispatcher.execute(legacy as never)).not.toThrow()

      // …and must not have mutated the splitter into having a
      // `qualityThreshold` field (i.e. the field is gone from Machine).
      expect((splitter as unknown as { qualityThreshold?: number }).qualityThreshold).toBeUndefined()
    })
  })

  // --- Case 7: No level lists 'quality_checker' in availableMachines ---

  describe('Level definitions', () => {
    it('no level lists `quality_checker` in `availableMachines`', () => {
      const levels = getAllLevels()
      const offenders: string[] = []
      for (const level of levels) {
        if ((level.availableMachines as readonly string[]).includes('quality_checker')) {
          offenders.push(level.id)
        }
      }
      expect(offenders, `levels still listing 'quality_checker': ${offenders.join(', ')}`).toEqual([])
    })
  })

  // --- Case 10: Simulation.defects is not bumped when a non-defective ---
  //              item lands in a machine's secondary output slot.        ---

  describe('Simulation.updateMachines defect counting', () => {
    let sim: Simulation

    beforeEach(() => {
      resetItemIdCounter()
      sim = new Simulation()
    })

    it('does NOT increment defects when a splitter routes a non-defective item to its secondary output', () => {
      // GIVEN — a splitter configured to route every item to the right
      //         (secondary) port via the persistent `outputSidesConfig`
      //         bitfield (Right=4 — Step 1 of the bridge → multiplex
      //         migration).
      const sp = new Machine('sp1', 'splitter')
      sp.outputSidesConfig = 4 // Right only → secondary
      sp.start()
      const item = createItem('circuit_basic', 90) // quality 90 → not defective
      expect(item.isDefective).toBe(false)
      sp.addInput(item)
      sim.addMachine(sp)
      // Mark `secondary` as connected (registry write only — no real
      // belt is registered, so `transferMachineOutputs` won't drain
      // the slot before the assertion below reads `sp.secondaryOutputSlot`).
      sim.setMachineOutputBelt('sp1', 'sp1_bs', 'secondary')

      // WHEN — splitter routes the item in 0-tick processing on its first tick.
      sim.tick()

      // THEN — item ended up in the secondary slot but defects must remain 0.
      // (The Checker-only `quality_checker && !isDefective` defect-bump
      // path in `Simulation.updateMachines` must be GONE; defects are
      // counted only at the Shipper or via the produce-time defective
      // roll — never as a side-effect of routing through a pass-through
      // multi-output machine.)
      expect(sp.secondaryOutputSlot).not.toBeNull()
      expect(sp.outputSlot).toBeNull()
      expect(sim.defects).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------
// Static source guards — make the removal observable beyond the public API.
// These will fail today because the strings still appear in production code.
// ---------------------------------------------------------------------------

describe('Checker removal — static source guards', () => {
  // Lazy imports to keep these guards self-contained.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs') as typeof import('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path')

  const ROOT = join(__dirname, '..', '..', '..')

  function read(p: string): string {
    return readFileSync(join(ROOT, p), 'utf-8')
  }

  it('src/game/Simulation.ts contains no reference to `quality_checker`', () => {
    expect(read('src/game/Simulation.ts')).not.toMatch(/quality_checker/)
  })

  it('src/game/MachineBehaviors.ts contains no Checker-specific symbols', () => {
    // The Splitter still carries a `splitterCondition.qualityThreshold`
    // for its `by_quality` evaluator, so a blanket /qualityThreshold/
    // ban would overshoot. We instead assert the Checker-specific
    // symbols are gone:
    //   - `quality_checker`            (MachineType literal / registry key)
    //   - `tickQualityChecker`         (former tick handler)
    //   - `qualityCheckerBehavior`     (former MachineBehavior binding)
    //   - `m.qualityThreshold`         (Machine-level field, distinct
    //                                   from the surviving
    //                                   `splitterCondition.qualityThreshold`)
    // The negative-lookbehind on `qualityThreshold` permits the
    // splitter access while still catching any reintroduction of the
    // Checker field via `m.qualityThreshold` or a bare standalone
    // reference.
    const src = read('src/game/MachineBehaviors.ts')
    expect(src).not.toMatch(/quality_checker/)
    expect(src).not.toMatch(/tickQualityChecker/)
    expect(src).not.toMatch(/qualityCheckerBehavior/)
    expect(src).not.toMatch(/\bm\.qualityThreshold\b/)
    expect(src).not.toMatch(/(?<!splitterCondition\.)\bqualityThreshold\b/)
  })

  it('src/game/SimulationCommandDispatcher.ts contains no `SET_QUALITY_THRESHOLD` case', () => {
    expect(read('src/game/SimulationCommandDispatcher.ts')).not.toMatch(/SET_QUALITY_THRESHOLD/)
  })

  it('src/game/Machine.ts contains no Checker-specific symbols', () => {
    // `Machine.ts` no longer carries a `qualityThreshold` field of its
    // own (the Splitter's threshold lives on `SplitterCondition` in
    // `types.ts`, not on the Machine class), so any `qualityThreshold`
    // appearing here would be a regression of the Checker field.
    const src = read('src/game/Machine.ts')
    expect(src).not.toMatch(/qualityThreshold/)
    expect(src).not.toMatch(/quality_checker/)
  })
})

// ---------------------------------------------------------------------------
// Belt-and-suspenders: keep `MachineType` union usable as a string set
// without the literal. This guards against a regression where someone
// reintroduces `'quality_checker'` to the union.
// ---------------------------------------------------------------------------

describe('Checker removal — type-shape sanity', () => {
  it('TypeScript narrowing on a non-quality-checker MachineType compiles', () => {
    // Compile-time sanity: every MachineType literal we still ship must
    // be assignable. If `quality_checker` is reintroduced, this list
    // becomes incomplete vs. ALL_MACHINE_TYPES and the related
    // exhaustiveness sentinel in src/game/types.ts breaks `tsc`.
    const surviving: MachineType[] = [
      'part_fabricator',
      'assembler',
      'painter',
      'recycler',
      'splitter',
      'factory_output',
    ]
    expect(surviving.length).toBe(ALL_MACHINE_TYPES.length)
  })
})
