import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ALL_OUTPUTS_CONNECTED_ENV } from '../../../src/game/MachineBehaviors'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'
import type { ItemType, MachineType } from '../../../src/game/types'

// --- Helpers ---

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

// `canAcceptItemType` is the new method introduced by the recipe-aware
// input acceptance fix. Tests are written against the proposed shape so
// that they fail loudly while the implementation is missing, then pass
// once it lands. Invoked through this trampoline so the tests can be
// authored as if the method already exists on `Machine` even before
// the field is declared.
function canAcceptItemType(m: Machine, t: ItemType): boolean {
  return (
    m as unknown as { canAcceptItemType: (t: ItemType) => boolean }
  ).canAcceptItemType(t)
}

describe('Machine.canAcceptItemType', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  describe('recipe-driven assembler — empty inputs', () => {
    it('accepts every recipe-listed type when no items have arrived yet', () => {
      // GIVEN — assembler with assemble_drivetrain_basic
      // (2× wheel_small + 1× circuit_basic).
      const m = new Machine('asm', 'assembler')
      m.setRecipe(recipe('assemble_drivetrain_basic'))

      // ASSERT — sanity: input slots empty.
      expect(m.inputSlots).toHaveLength(0)

      // THEN
      expect(canAcceptItemType(m, 'wheel_small')).toBe(true)
      expect(canAcceptItemType(m, 'circuit_basic')).toBe(true)
    })
  })

  describe('recipe-driven assembler — partial fill below quota', () => {
    it('accepts wheel_small until its quota is reached, then rejects further wheels but still accepts circuit_basic', () => {
      // GIVEN
      const m = new Machine('asm', 'assembler')
      m.setRecipe(recipe('assemble_drivetrain_basic'))

      // WHEN — push 2× wheel_small (quota = 2). Both must succeed.
      expect(m.addInput(createItem('wheel_small'))).toBe(true)
      expect(m.addInput(createItem('wheel_small'))).toBe(true)

      // THEN — wheel quota reached.
      expect(canAcceptItemType(m, 'wheel_small')).toBe(false)
      // 3rd wheel must be refused (per-type quota), even though only
      // 2/4 input slots are occupied.
      expect(m.addInput(createItem('wheel_small'))).toBe(false)
      // Sanity: cheap "any slot free" path still true (slots free).
      expect(m.canAcceptInput()).toBe(true)
      // Other recipe-listed types remain acceptable.
      expect(canAcceptItemType(m, 'circuit_basic')).toBe(true)
    })

    it('accepts circuit_basic until its quota is reached, then rejects further circuits', () => {
      // GIVEN
      const m = new Machine('asm', 'assembler')
      m.setRecipe(recipe('assemble_drivetrain_basic'))

      // WHEN — push 1× circuit_basic (quota = 1).
      expect(m.addInput(createItem('circuit_basic'))).toBe(true)

      // THEN — circuit quota reached after just one item.
      expect(canAcceptItemType(m, 'circuit_basic')).toBe(false)
      // 2nd circuit must be refused (per-type quota=1), even though
      // only 1/4 input slots are occupied.
      expect(m.addInput(createItem('circuit_basic'))).toBe(false)
      // Wheels are still under quota.
      expect(canAcceptItemType(m, 'wheel_small')).toBe(true)
    })
  })

  describe('recipe-driven assembler — full quota across all inputs', () => {
    it('rejects every recipe-listed type once each input quota is at the limit', () => {
      // GIVEN
      const m = new Machine('asm', 'assembler')
      m.setRecipe(recipe('assemble_drivetrain_basic'))

      // WHEN — fill exactly to recipe quota: 2× wheel + 1× circuit.
      expect(m.addInput(createItem('wheel_small'))).toBe(true)
      expect(m.addInput(createItem('wheel_small'))).toBe(true)
      expect(m.addInput(createItem('circuit_basic'))).toBe(true)

      // ASSERT — 3/4 slots used. Cheap path still says "room".
      expect(m.inputSlots).toHaveLength(3)
      expect(m.canAcceptInput()).toBe(true)

      // THEN — every recipe-listed type is at quota.
      expect(canAcceptItemType(m, 'wheel_small')).toBe(false)
      expect(canAcceptItemType(m, 'circuit_basic')).toBe(false)
      expect(m.addInput(createItem('wheel_small'))).toBe(false)
      expect(m.addInput(createItem('circuit_basic'))).toBe(false)
    })
  })

  describe('recipe-driven assembler — fast producer of one type', () => {
    it('refuses circuit_basic after the first one even when 4× are pushed in a row, leaving room for wheel_small', () => {
      // GIVEN — the live deadlock scenario: a fast circuit producer
      // races items into an assembler whose recipe needs only 1 circuit.
      const m = new Machine('asm', 'assembler')
      m.setRecipe(recipe('assemble_drivetrain_basic'))

      // WHEN — 4 circuits offered back-to-back. Per-type quota is 1.
      const first = m.addInput(createItem('circuit_basic'))
      const second = m.addInput(createItem('circuit_basic'))
      const third = m.addInput(createItem('circuit_basic'))
      const fourth = m.addInput(createItem('circuit_basic'))

      // THEN — exactly one circuit is stored, three are rejected.
      expect(first).toBe(true)
      expect(second).toBe(false)
      expect(third).toBe(false)
      expect(fourth).toBe(false)
      expect(m.inputSlots).toHaveLength(1)
      // 3 input slots remain free for the type the assembler is starved for.
      expect(canAcceptItemType(m, 'wheel_small')).toBe(true)
      expect(m.addInput(createItem('wheel_small'))).toBe(true)
      expect(m.addInput(createItem('wheel_small'))).toBe(true)
    })
  })

  describe('recipe-driven machine with NO recipe set', () => {
    it('falls back to canAcceptInput while slots are free', () => {
      // GIVEN — assembler/painter/part_fabricator with no recipe yet.
      const types: MachineType[] = ['assembler', 'painter', 'part_fabricator']
      for (const t of types) {
        const m = new Machine(`m_${t}`, t)
        // ASSERT — no recipe.
        expect(m.currentRecipe).toBeNull()
        // THEN — query mirrors canAcceptInput (which is true: 0/4 slots).
        expect(m.canAcceptInput()).toBe(true)
        expect(canAcceptItemType(m, 'wheel_small')).toBe(m.canAcceptInput())
        expect(canAcceptItemType(m, 'circuit_basic')).toBe(m.canAcceptInput())
        expect(canAcceptItemType(m, 'raw_material')).toBe(m.canAcceptInput())
      }
    })

    it('falls back to canAcceptInput when slots are completely full', () => {
      // GIVEN — assembler with no recipe but 4 items shoved in.
      const m = new Machine('asm', 'assembler')
      for (let i = 0; i < 4; i++) {
        expect(m.addInput(createItem('wheel_small'))).toBe(true)
      }

      // ASSERT — slots full, no recipe.
      expect(m.inputSlots).toHaveLength(4)
      expect(m.currentRecipe).toBeNull()
      expect(m.canAcceptInput()).toBe(false)

      // THEN — no recipe → mirror canAcceptInput.
      expect(canAcceptItemType(m, 'wheel_small')).toBe(false)
      expect(canAcceptItemType(m, 'circuit_basic')).toBe(false)
    })
  })

  describe('non-recipe-driven machines', () => {
    it('splitter mirrors canAcceptInput regardless of item type', () => {
      // GIVEN
      const m = new Machine('sp', 'splitter')

      // THEN — empty.
      expect(canAcceptItemType(m, 'wheel_small')).toBe(true)
      expect(canAcceptItemType(m, 'sensor_lidar')).toBe(true)

      // WHEN — fill all 4 slots with mixed types.
      expect(m.addInput(createItem('wheel_small'))).toBe(true)
      expect(m.addInput(createItem('circuit_basic'))).toBe(true)
      expect(m.addInput(createItem('chassis_light'))).toBe(true)
      expect(m.addInput(createItem('battery_standard'))).toBe(true)

      // THEN — full → all rejected.
      expect(m.canAcceptInput()).toBe(false)
      expect(canAcceptItemType(m, 'wheel_small')).toBe(false)
      expect(canAcceptItemType(m, 'sensor_lidar')).toBe(false)
    })

    it('recycler mirrors canAcceptInput regardless of item type', () => {
      // GIVEN
      const m = new Machine('rc', 'recycler')

      // THEN — empty: any item.
      expect(canAcceptItemType(m, 'wheel_small')).toBe(true)
      expect(canAcceptItemType(m, 'robot_worker')).toBe(true)

      // WHEN — fill exactly maxInputSlots.
      for (let i = 0; i < 4; i++) {
        expect(m.addInput(createItem('robot_worker'))).toBe(true)
      }

      // THEN — full.
      expect(canAcceptItemType(m, 'wheel_small')).toBe(false)
      expect(canAcceptItemType(m, 'robot_worker')).toBe(false)
    })
  })

  describe('factory_output (Shipper)', () => {
    it('always reports acceptance regardless of item type or enabled state', () => {
      // GIVEN
      const enabled = new Machine('out_e', 'factory_output')
      enabled.start()
      const disabled = new Machine('out_d', 'factory_output')

      // ASSERT — the cheap canAcceptInput short-circuit short-circuits
      // on factory_output regardless of enabled.
      expect(enabled.canAcceptInput()).toBe(true)
      expect(disabled.canAcceptInput()).toBe(true)

      // THEN — canAcceptItemType matches that short-circuit.
      expect(canAcceptItemType(enabled, 'wheel_small')).toBe(true)
      expect(canAcceptItemType(enabled, 'robot_guardian')).toBe(true)
      expect(canAcceptItemType(disabled, 'wheel_small')).toBe(true)
      expect(canAcceptItemType(disabled, 'robot_guardian')).toBe(true)
    })

    it('continues to report acceptance after consuming many items', () => {
      // GIVEN — Shipper consumes inline (no slot growth).
      const m = new Machine('out', 'factory_output')
      m.start()
      for (let i = 0; i < 20; i++) {
        expect(m.addInput(createItem('wheel_small'))).toBe(true)
      }

      // THEN — never fills.
      expect(canAcceptItemType(m, 'wheel_small')).toBe(true)
      expect(canAcceptItemType(m, 'robot_explorer')).toBe(true)
    })
  })

  describe('canAcceptInput is unchanged (cheap path stays non-recipe-aware)', () => {
    it('returns true for an at-quota recipe-driven assembler while slots are free', () => {
      // GIVEN — assembler at quota for circuit_basic but only 1/4 slots used.
      const m = new Machine('asm', 'assembler')
      m.setRecipe(recipe('assemble_drivetrain_basic'))
      expect(m.addInput(createItem('circuit_basic'))).toBe(true)

      // ASSERT — circuit per-type quota reached.
      expect(canAcceptItemType(m, 'circuit_basic')).toBe(false)

      // THEN — canAcceptInput must NOT consult the recipe. Still true
      // because input slots are not full. This is the documented split:
      // the cheap path is the "any slot free?" predicate.
      expect(m.canAcceptInput()).toBe(true)
    })

    it('returns false only when ALL maxInputSlots are occupied', () => {
      // GIVEN — assembler stuffed to 4/4 (using 1 circuit + 3 wheels even
      // though wheel quota is 2 — addInput with no fix would allow this).
      // We use raw push to force the slot-full state without depending on
      // addInput semantics.
      const m = new Machine('asm', 'assembler')
      m.setRecipe(recipe('assemble_drivetrain_basic'))
      m.inputSlots.push(createItem('wheel_small'))
      m.inputSlots.push(createItem('wheel_small'))
      m.inputSlots.push(createItem('wheel_small'))
      m.inputSlots.push(createItem('circuit_basic'))

      // THEN
      expect(m.inputSlots).toHaveLength(4)
      expect(m.canAcceptInput()).toBe(false)
    })
  })

  describe('canConsume is unchanged (recipe membership only, no slot/quota awareness)', () => {
    it('returns true for any recipe-listed type even when that type is at quota', () => {
      // GIVEN — assembler at circuit_basic quota.
      const m = new Machine('asm', 'assembler')
      m.setRecipe(recipe('assemble_drivetrain_basic'))
      expect(m.addInput(createItem('circuit_basic'))).toBe(true)

      // ASSERT — circuit per-type quota reached.
      expect(canAcceptItemType(m, 'circuit_basic')).toBe(false)

      // THEN — canConsume is the membership-only gate used to detect a
      // fatal mis-routing. It MUST still report true: the assembler
      // does eventually consume circuits, just not right now.
      expect(m.canConsume('circuit_basic')).toBe(true)
      expect(m.canConsume('wheel_small')).toBe(true)
      // And a type the recipe never lists is still rejected.
      expect(m.canConsume('robot_explorer')).toBe(false)
    })

    it('returns true for recipe-listed types even when ALL slots are full', () => {
      // GIVEN — assembler with 4 circuits jammed in (the live deadlock
      // shape).
      const m = new Machine('asm', 'assembler')
      m.setRecipe(recipe('assemble_drivetrain_basic'))
      m.inputSlots.push(createItem('circuit_basic'))
      m.inputSlots.push(createItem('circuit_basic'))
      m.inputSlots.push(createItem('circuit_basic'))
      m.inputSlots.push(createItem('circuit_basic'))

      // ASSERT — slots completely full.
      expect(m.canAcceptInput()).toBe(false)

      // THEN — still membership-true for both inputs.
      expect(m.canConsume('circuit_basic')).toBe(true)
      expect(m.canConsume('wheel_small')).toBe(true)
    })
  })

  describe('rebound after consumeInputs (machine starts processing)', () => {
    it('regains acceptance for both input types after a cycle starts and clears slots', () => {
      // GIVEN — assembler at full recipe quota.
      const m = new Machine('asm', 'assembler')
      m.setRecipe(recipe('assemble_drivetrain_basic'))
      m.start()
      expect(m.addInput(createItem('wheel_small'))).toBe(true)
      expect(m.addInput(createItem('wheel_small'))).toBe(true)
      expect(m.addInput(createItem('circuit_basic'))).toBe(true)

      // ASSERT — every recipe input is at quota; cycle has not started.
      expect(canAcceptItemType(m, 'wheel_small')).toBe(false)
      expect(canAcceptItemType(m, 'circuit_basic')).toBe(false)
      expect(m.state).toBe('idle')

      // WHEN — tick once. tryStartProcessing runs hasRequiredInputs →
      // consumeInputs → state=processing, inputSlots cleared.
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)

      // THEN
      expect(m.state).toBe('processing')
      expect(m.inputSlots).toHaveLength(0)
      // Acceptance rebounds for the next batch.
      expect(canAcceptItemType(m, 'wheel_small')).toBe(true)
      expect(canAcceptItemType(m, 'circuit_basic')).toBe(true)
      // And addInput agrees.
      expect(m.addInput(createItem('wheel_small'))).toBe(true)
      expect(m.addInput(createItem('circuit_basic'))).toBe(true)
    })
  })
})
