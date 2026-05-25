/**
 * Bug 1 (RED) — Recycler must decompose a defective assembly that
 * came out of a real Assembler into N-1 of its original components,
 * one per tick. The current implementation falls through to the
 * "basic part" repair branch when the assembly's `components` array
 * is empty/undefined, emitting ONE non-defective item of the
 * assembly's own type — i.e., it does NOT decompose, and it
 * "launders" a defective assembly back into pristine inventory.
 *
 * The pipeline used here is the realistic one: an Assembler
 * produces the assembly (so `components` is whatever the Assembler
 * actually populates), the assembly is marked defective, and it is
 * fed to a Recycler.
 *
 * This test couples to Bug 2 by design — if the Assembler does not
 * populate `components`, the Recycler cannot decompose, and we want
 * BOTH gaps to surface as test failures.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Machine } from '../../../src/game/Machine'
import { ALL_OUTPUTS_CONNECTED_ENV } from '../../../src/game/MachineBehaviors'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import type { Item } from '../../../src/game/Item'
import { getRecipeById, type Recipe } from '../../../src/game/Recipe'

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

const noDefectRng = (): number => 0.99
function constRng(v: number): () => number {
  return () => v
}

function tickUntilOutput(m: Machine, rng: () => number, maxTicks = 40): void {
  for (let i = 0; i < maxTicks; i++) {
    m.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)
    if (m.outputSlot !== null) return
  }
  throw new Error(`Machine did not produce output within ${maxTicks} ticks`)
}

/** Produce a single drivetrain_basic from a fresh Assembler, then mark it defective. */
function produceDefectiveDrivetrain(): Item {
  const asm = new Machine('asm_for_recycler', 'assembler')
  asm.setRecipe(recipe('assemble_drivetrain_basic'))
  asm.start()
  asm.addInput(createItem('wheel_small'))
  asm.addInput(createItem('wheel_small'))
  asm.addInput(createItem('circuit_basic'))
  tickUntilOutput(asm, noDefectRng)
  const out = asm.outputSlot
  if (out === null) throw new Error('expected assembler output')
  out.isDefective = true
  return out
}

/**
 * Drain emissions one per tick. Stops once the recycler reports idle
 * with empty inputs/output for one extra settling tick, or maxTicks.
 */
function collectAllEmissions(
  m: Machine,
  rng: () => number,
  maxTicks = 50,
): Item[] {
  const out: Item[] = []
  for (let i = 0; i < maxTicks; i++) {
    m.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)
    if (m.outputSlot !== null) {
      out.push(m.outputSlot)
      m.outputSlot = null
    }
    if (
      m.state === 'idle' &&
      m.inputSlots.length === 0 &&
      m.outputSlot === null &&
      m.recyclerOutputQueue.length === 0
    ) {
      const before = out.length
      m.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)
      if (m.outputSlot !== null) {
        out.push(m.outputSlot)
        m.outputSlot = null
      }
      if (out.length === before) return out
    }
  }
  return out
}

describe('Recycler — decomposes a defective assembly produced by a real Assembler', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('emits exactly N-1 component items (not the assembly itself) across N-1 successive ticks', () => {
    // GIVEN — a defective drivetrain_basic produced by an Assembler
    // (so `components` is populated however the Assembler populates it).
    const defective = produceDefectiveDrivetrain()
    // Sanity: precondition of the bug — the input IS an assembly,
    // it IS defective, and it has N>=1 components.
    expect(defective.type).toBe('drivetrain_basic')
    expect(defective.isDefective).toBe(true)
    expect(defective.components).toBeDefined()
    expect(defective.components!.length).toBeGreaterThanOrEqual(1)
    const N = defective.components!.length

    const rec = new Machine('rec1', 'recycler')
    rec.start()
    rec.addInput(defective)

    // WHEN
    const emitted = collectAllEmissions(rec, constRng(0.5))

    // THEN — exactly N-1 emissions.
    expect(emitted).toHaveLength(N - 1)

    // None of the emissions are the assembly itself.
    for (const item of emitted) {
      expect(
        item.type,
        `Recycler must NOT re-emit the assembly's own type (${defective.type})`,
      ).not.toBe('drivetrain_basic')
    }

    // Every emission is non-defective (Recycler cleanses defects).
    for (const item of emitted) {
      expect(item.isDefective).toBe(false)
    }

    // Every emission is a basic part: no `components` populated.
    for (const item of emitted) {
      expect(
        item.components === undefined || item.components.length === 0,
        `Recycler must emit basic parts, not nested assemblies`,
      ).toBe(true)
    }

    // Emitted types are a strict subset (multiset of size N-1) of the
    // original assembly's components' types.
    const originalTypes = defective.components!.map((c) => c.type)
    const remaining = [...originalTypes]
    for (const item of emitted) {
      const idx = remaining.indexOf(item.type)
      expect(
        idx,
        `emitted type ${item.type} not present in original components ${originalTypes.join(',')}`,
      ).toBeGreaterThanOrEqual(0)
      remaining.splice(idx, 1)
    }
    expect(remaining).toHaveLength(1)
  })

  it('does not "launder" a defective assembly into a single non-defective copy of itself', () => {
    // GIVEN
    const defective = produceDefectiveDrivetrain()
    const rec = new Machine('rec2', 'recycler')
    rec.start()
    rec.addInput(defective)

    // WHEN
    const emitted = collectAllEmissions(rec, constRng(0.5))

    // THEN — the explicit anti-bug assertion: we must NOT see "one
    // emission, type=drivetrain_basic, isDefective=false".
    const launderedShape =
      emitted.length === 1 &&
      emitted[0].type === 'drivetrain_basic' &&
      emitted[0].isDefective === false
    expect(
      launderedShape,
      'Recycler regressed: a defective assembly was re-emitted as a single non-defective copy of itself instead of being decomposed',
    ).toBe(false)
  })
})
