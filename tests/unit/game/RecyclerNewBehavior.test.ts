import { describe, it, expect, beforeEach } from 'vitest'
import { Machine } from '../../../src/game/Machine'
import { ALL_OUTPUTS_CONNECTED_ENV } from '../../../src/game/MachineBehaviors'
import { createItem, createAssembly, resetItemIdCounter } from '../../../src/game/Item'
import type { Item } from '../../../src/game/Item'

// --- Helpers ---

/** Build a deterministic RNG that always returns the same value. */
function constRng(value: number): () => number {
  return () => value
}

/** Build a deterministic RNG over a fixed sequence (cycles when exhausted). */
function seqRng(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]!
}

/** Fresh enabled Recycler. */
function makeRecycler(): Machine {
  const r = new Machine('rec1', 'recycler')
  r.start()
  return r
}

/**
 * Drive ticks until either the primary output is populated or `maxTicks` is
 * reached. Returns the number of ticks consumed.
 */
function tickUntilOutput(
  m: Machine,
  rng: () => number,
  maxTicks = 20,
): number {
  for (let i = 1; i <= maxTicks; i++) {
    m.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)
    if (m.outputSlot !== null) return i
  }
  return maxTicks
}

/**
 * Repeatedly drain the primary output and tick until either the recycler
 * goes back to `idle` with empty inputs and empty output for a full tick,
 * or `maxTicks` is reached. Returns the ordered list of items emitted.
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
      m.outputSlot === null
    ) {
      // Give one more tick to let the recycler settle / re-arm; if still
      // nothing changes, we're done.
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

// --- Tests ---

describe('Recycler new behavior — repair / unpack / sequence', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  describe('basic parts (no components)', () => {
    it('defective basic part → emits ONE item of same type, non-defective', () => {
      // GIVEN — a defective wheel_small
      const r = makeRecycler()
      const defectiveWheel = createItem('wheel_small')
      defectiveWheel.isDefective = true
      r.addInput(defectiveWheel)

      // WHEN — pump ticks until output appears
      const emitted = collectAllEmissions(r, constRng(0.5))

      // THEN — exactly one emission: wheel_small, non-defective.
      // (collectAllEmissions drains `outputSlot` on every tick, so the
      // emission lives in the returned array, not in `r.outputSlot`.)
      expect(emitted).toHaveLength(1)
      expect(emitted[0].type).toBe('wheel_small')
      expect(emitted[0].isDefective).toBe(false)
    })

    it('valid basic part → pass-through, same type, non-defective', () => {
      // GIVEN
      const r = makeRecycler()
      r.addInput(createItem('circuit_basic'))

      // WHEN
      const emitted = collectAllEmissions(r, constRng(0.5))

      // THEN — see sibling test for why we read `emitted` and not `r.outputSlot`.
      expect(emitted).toHaveLength(1)
      expect(emitted[0].type).toBe('circuit_basic')
      expect(emitted[0].isDefective).toBe(false)
    })

    it('basic part recycling NEVER produces raw_material', () => {
      // GIVEN
      const r = makeRecycler()
      r.addInput(createItem('wheel_small'))

      // WHEN
      const emitted = collectAllEmissions(r, constRng(0.5))
      const all = r.outputSlot ? [...emitted, r.outputSlot] : emitted

      // THEN — assert nothing in the emissions has the obsolete type.
      for (const item of all) {
        expect(item.type).not.toBe('raw_material')
      }
      expect(all.length).toBeGreaterThan(0)
    })
  })

  describe('valid assembly (no defect) — unpack ALL components', () => {
    it('emits all N components, fresh ids, non-defective', () => {
      // GIVEN — a 3-component assembly built from known parts
      const r = makeRecycler()
      const c1 = createItem('wheel_small')
      const c2 = createItem('wheel_small')
      const c3 = createItem('circuit_basic')
      const assembly = createAssembly('drivetrain_basic', [c1, c2, c3])
      r.addInput(assembly)

      // WHEN — collect everything across ticks
      const emitted = collectAllEmissions(r, constRng(0.5))
      const final = r.outputSlot ? [...emitted, r.outputSlot] : emitted

      // THEN — exactly 3 items, types match the components (as a multiset),
      // all non-defective, all fresh ids (different from originals).
      expect(final).toHaveLength(3)
      for (const item of final) {
        expect(item.isDefective).toBe(false)
        expect(item.type).not.toBe('raw_material')
        expect(item.id).not.toBe(c1.id)
        expect(item.id).not.toBe(c2.id)
        expect(item.id).not.toBe(c3.id)
      }
      const emittedTypes = final.map((i) => i.type).sort()
      expect(emittedTypes).toEqual(
        ['wheel_small', 'wheel_small', 'circuit_basic'].sort(),
      )
    })

    it('valid assembly never produces raw_material', () => {
      const r = makeRecycler()
      const assembly = createAssembly('drivetrain_basic', [
        createItem('wheel_small'),
        createItem('wheel_small'),
        createItem('circuit_basic'),
      ])
      r.addInput(assembly)

      const emitted = collectAllEmissions(r, constRng(0.5))
      const final = r.outputSlot ? [...emitted, r.outputSlot] : emitted
      for (const item of final) {
        expect(item.type).not.toBe('raw_material')
      }
    })
  })

  describe('defective assembly — random N-1 subset', () => {
    function makeDefectiveTriad(): Item {
      const c1 = createItem('wheel_small')
      const c2 = createItem('wheel_small')
      const c3 = createItem('circuit_basic')
      const assembly = createAssembly('drivetrain_basic', [c1, c2, c3])
      assembly.isDefective = true
      return assembly
    }

    it('emits exactly N-1 items, all non-defective, all types ⊆ original components', () => {
      // GIVEN
      const r = makeRecycler()
      r.addInput(makeDefectiveTriad())

      // WHEN
      const emitted = collectAllEmissions(r, constRng(0.5))
      const final = r.outputSlot ? [...emitted, r.outputSlot] : emitted

      // THEN
      expect(final).toHaveLength(2)
      for (const item of final) {
        expect(item.isDefective).toBe(false)
        expect(item.type).not.toBe('raw_material')
        expect(['wheel_small', 'circuit_basic']).toContain(item.type)
      }
      // The emitted multiset is a sub-multiset of the original components.
      const orig = ['wheel_small', 'wheel_small', 'circuit_basic']
      const remaining = [...orig]
      for (const item of final) {
        const idx = remaining.indexOf(item.type)
        expect(idx, `emitted type ${item.type} not in original components`).toBeGreaterThanOrEqual(0)
        remaining.splice(idx, 1)
      }
      expect(remaining).toHaveLength(1)
    })

    it('determinism: same RNG sequence produces the same chosen subset', () => {
      // GIVEN — two independent recyclers, same input shape, same RNG sequence
      const seq = [0.123, 0.456, 0.789, 0.234]

      const r1 = makeRecycler()
      r1.addInput(makeDefectiveTriad())
      const e1 = collectAllEmissions(r1, seqRng(seq))
      const final1 = r1.outputSlot ? [...e1, r1.outputSlot] : e1

      // Reset ids so the second run is comparable for type ordering only.
      resetItemIdCounter()

      const r2 = makeRecycler()
      r2.addInput(makeDefectiveTriad())
      const e2 = collectAllEmissions(r2, seqRng(seq))
      const final2 = r2.outputSlot ? [...e2, r2.outputSlot] : e2

      // THEN — emission TYPES match in order
      expect(final2.map((i) => i.type)).toEqual(final1.map((i) => i.type))
      expect(final1).toHaveLength(2)
    })
  })

  describe('one-per-tick sequencing', () => {
    it('valid assembly: emits one component per tick after processing completes', () => {
      // GIVEN — 3-component valid assembly
      const r = makeRecycler()
      const assembly = createAssembly('drivetrain_basic', [
        createItem('wheel_small'),
        createItem('wheel_small'),
        createItem('circuit_basic'),
      ])
      r.addInput(assembly)
      const rng = constRng(0.5)

      // WHEN — pump ticks until first output appears (consumes setup + processing).
      tickUntilOutput(r, rng)
      expect(r.outputSlot).not.toBeNull()

      // Drain first output, then tick once.
      r.outputSlot = null
      r.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)

      // THEN — second component appears one tick after drain.
      const second = r.outputSlot as Item | null
      expect(second).not.toBeNull()
      expect(second?.type).not.toBe('raw_material')

      // Drain again, tick once for the third.
      r.outputSlot = null
      r.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)
      const third = r.outputSlot as Item | null
      expect(third).not.toBeNull()
      expect(third?.type).not.toBe('raw_material')

      // After draining the third, no more emissions.
      r.outputSlot = null
      r.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)
      expect(r.outputSlot).toBeNull()
    })

    it('stays blocked when output slot is occupied between emissions, then resumes', () => {
      // GIVEN — 3-component valid assembly
      const r = makeRecycler()
      const assembly = createAssembly('drivetrain_basic', [
        createItem('wheel_small'),
        createItem('wheel_small'),
        createItem('circuit_basic'),
      ])
      r.addInput(assembly)
      const rng = constRng(0.5)

      // WHEN — first emission appears
      tickUntilOutput(r, rng)
      expect(r.outputSlot).not.toBeNull()

      // Don't drain — tick a few times. The recycler must NOT lose queued
      // items and must report blocked state.
      r.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)
      r.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)
      expect(r.state).toBe('blocked')
      // Output is still the same first item (not overwritten / not lost).
      expect(r.outputSlot).not.toBeNull()

      // Drain — next tick should emit the next queued component.
      r.outputSlot = null
      r.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)
      const next = r.outputSlot as Item | null
      expect(next).not.toBeNull()
      expect(next?.type).not.toBe('raw_material')
    })
  })

  describe('defect cleansing invariant', () => {
    it('every emitted item from any recycler input has isDefective === false', () => {
      // GIVEN — both a defective basic part AND a defective assembly run
      // sequentially through fresh recyclers.
      const cases: Item[] = [
        (() => {
          const i = createItem('wheel_small')
          i.isDefective = true
          return i
        })(),
        (() => {
          const a = createAssembly('drivetrain_basic', [
            createItem('wheel_small'),
            createItem('wheel_small'),
            createItem('circuit_basic'),
          ])
          a.isDefective = true
          return a
        })(),
        createItem('circuit_basic'),
        createAssembly('drivetrain_basic', [
          createItem('wheel_small'),
          createItem('wheel_small'),
          createItem('circuit_basic'),
        ]),
      ]

      for (const input of cases) {
        const r = makeRecycler()
        r.addInput(input)
        const emitted = collectAllEmissions(r, constRng(0.5))
        const final = r.outputSlot ? [...emitted, r.outputSlot] : emitted
        expect(final.length).toBeGreaterThan(0)
        for (const item of final) {
          expect(item.isDefective).toBe(false)
          expect(item.type).not.toBe('raw_material')
        }
      }
    })
  })
})
