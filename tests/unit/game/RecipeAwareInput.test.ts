import { describe, it, expect, beforeEach } from 'vitest'
import { resetItemIdCounter, createItem } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'
import { Simulation } from '../../../src/game/Simulation'

// Design notes
// ----------------------------------------------------------------
// These tests pin down the integration contract for recipe-aware
// input acceptance: an `ItemDeliveryEngine` that calls
// `Machine.canAcceptItemType(item.type)` instead of the cheap
// `canAcceptInput()` predicate, so per-type recipe quotas back-pressure
// upstream belts.
//
// The bug they guard against ("saturation deadlock"): a fast producer of
// one recipe input can fill all 4 input slots of an assembler with
// items of that single type, after which the assembler can never
// satisfy `hasRequiredInputs` (it still needs the OTHER input type),
// can never start processing, and so never frees a slot. Permanent
// idle deadlock.
//
// Detection condition for starvation requires `inputSlots.length >= 1`
// AND no upstream producer of the missing type. With both producers
// present (wheel_press AND circuit_printer feed the assembler), the
// starvation guard correctly stays quiet — yet the simulation still
// deadlocks today. That is the gap these tests close.

function tickN(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) sim.tick()
}

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

describe('Recipe-aware input acceptance — integration', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  describe('saturation deadlock regression', () => {
    it('assembler makes progress (state leaves idle, items produced) when fed by 2 circuit producers + 1 wheel producer', () => {
      // GIVEN — the live deadlock shape.
      //   - Recipe needs 2× wheel_small + 1× circuit_basic per cycle.
      //   - 2 circuit_printer_basic fabricators (5 ticks each)
      //     produce circuits twice as fast as the single wheel_press_small
      //     (5 ticks).
      //   - All three producers feed the assembler at (1,1) via short
      //     1-cell belts. Belts are added BEFORE the wheel belt so that
      //     ItemDeliveryEngine iterates circuits first inside its
      //     fixed-point loop — matches the live observation that
      //     circuits saturate first.
      const sim = new Simulation()

      const assembler = new Machine('assembler', 'assembler')
      assembler.setRecipe(recipe('assemble_drivetrain_basic'))
      assembler.start()

      const circuitFab1 = new Machine('cFab1', 'part_fabricator')
      circuitFab1.setRecipe(recipe('circuit_printer_basic'))
      circuitFab1.start()

      const circuitFab2 = new Machine('cFab2', 'part_fabricator')
      circuitFab2.setRecipe(recipe('circuit_printer_basic'))
      circuitFab2.start()

      const wheelFab = new Machine('wFab', 'part_fabricator')
      wheelFab.setRecipe(recipe('wheel_press_small'))
      wheelFab.start()

      sim.addMachine(assembler)
      sim.addMachine(circuitFab1)
      sim.addMachine(circuitFab2)
      sim.addMachine(wheelFab)
      sim.setMachinePosition('assembler', 1, 1)
      sim.setMachinePosition('cFab1', 0, 1)
      sim.setMachinePosition('cFab2', 2, 1)
      sim.setMachinePosition('wFab', 1, 0)

      // Add circuit belts FIRST so the delivery engine iterates them
      // before the wheel belt. With the bug, this ordering causes the
      // assembler's input slots to fill with circuits before any wheel
      // can land.
      sim.addBelt(new ConveyorBelt('b_c1', 0, 1, 1, 1, 1.0))
      sim.addBelt(new ConveyorBelt('b_c2', 2, 1, 1, 1, 1.0))
      sim.addBelt(new ConveyorBelt('b_w', 1, 0, 1, 1, 1.0))
      sim.setMachineOutputBelt('cFab1', 'b_c1')
      sim.setMachineOutputBelt('cFab2', 'b_c2')
      sim.setMachineOutputBelt('wFab', 'b_w')

      // Track every machine_state_changed event for the assembler so we
      // can prove it actually transitioned out of idle (not just paused
      // briefly while a screenshot might catch it processing).
      const assemblerStates: string[] = [assembler.state]
      sim.on('machine_state_changed', (e) => {
        if (
          (e.data as { machineId: string }).machineId === assembler.id
        ) {
          assemblerStates.push((e.data as { to: string }).to)
        }
      })

      // WHEN — run long enough for several cycles' worth of items.
      // Each fabricator emits one item per 5 ticks. Belts are 1 cell at
      // speed 1 → ~10 ticks of travel. A single assembler cycle is
      // 10 ticks. 200 ticks gives generous headroom for many cycles
      // when the deadlock is fixed; with the bug it collapses well
      // before the limit.
      tickN(sim, 200)

      // THEN — no fatal game-over (this is a deadlock, not starvation
      // — wheel_press IS upstream so the starvation guard correctly
      // stays quiet).
      expect(sim.gameOver).toBeNull()

      // Assembler must have transitioned to processing at least once
      // — i.e. the recipe quota actually pressured circuits enough to
      // let two wheels land.
      expect(assemblerStates).toContain('processing')

      // And it must have produced at least one drivetrain. Bug
      // observation: assembler "sat permanently idle" → 0 produced.
      // With the fix, ~10 cycles complete in 200 ticks, but we keep
      // the assertion conservative (>= 1) to insulate it from minor
      // tick-cadence shifts.
      expect(assembler.itemsProduced).toBeGreaterThanOrEqual(1)
    })
  })

  describe('belt back-up, not item loss', () => {
    it('leaves the item on the source belt when the destination machine is at per-type quota', () => {
      // GIVEN — assembler at quota for circuit_basic (1/1 from recipe).
      // Single belt carries one fresh circuit toward the assembler.
      const sim = new Simulation()

      const assembler = new Machine('assembler', 'assembler')
      assembler.setRecipe(recipe('assemble_drivetrain_basic'))
      assembler.start()
      // Pre-load the assembler with exactly one circuit_basic so its
      // per-type quota for that type is reached.
      assembler.addInput(createItem('circuit_basic'))
      expect(assembler.inputSlots).toHaveLength(1)

      sim.addMachine(assembler)
      sim.setMachinePosition('assembler', 1, 0)

      const belt = new ConveyorBelt('b_c', 0, 0, 1, 0, 1.0)
      // Place a fresh circuit at position 1.0 so it is "ready" on the
      // very next runDelivery pass — no warm-up ticks needed.
      const circuitOnBelt = createItem('circuit_basic')
      const inserted = belt.insertItemAt(circuitOnBelt, 1.0)
      expect(inserted).toBe(true)
      sim.addBelt(belt)

      // ASSERT — pre-condition: assembler is at quota for circuit_basic
      // (per-type), but its input slots are NOT yet full (1/4).
      expect(assembler.canAcceptInput()).toBe(true)
      const beltCountBefore = belt.getItemCount()
      expect(beltCountBefore).toBe(1)

      // WHEN — one tick. updateMachines runs first (assembler still
      // idle: only 1 circuit, needs wheels). advanceBelts → no-op
      // (item already at 1.0). runDelivery → attempts circuit_basic
      // delivery to the at-quota assembler.
      sim.tick()

      // THEN — the new circuit must remain on the belt (back-pressure),
      // not silently delivered into an over-quota slot.
      const beltCountAfter = belt.getItemCount()
      expect(beltCountAfter).toBe(1)
      expect(belt.getItems()[0].id).toBe(circuitOnBelt.id)

      // Assembler input slots unchanged — still exactly the one
      // pre-loaded circuit, no second one snuck in.
      expect(assembler.inputSlots).toHaveLength(1)
      expect(assembler.inputSlots[0].type).toBe('circuit_basic')
    })
  })

  describe('no false unconsumable_input game-over', () => {
    it('does NOT trip unconsumable_input when the destination has filled its per-type quota for a recipe-listed type', () => {
      // GIVEN — assembler with both recipe inputs reachable upstream
      // (so neither starvation nor no_recipe can fire), pre-loaded to
      // the per-type quota for circuit_basic. A second circuit is
      // delivery-ready on a belt. The fixed delivery engine must
      // treat that circuit as "store later" (back-pressure), NOT as a
      // fatal mis-routing — `circuit_basic` IS in the recipe;
      // `canConsume` must continue to return true for it.
      const sim = new Simulation()

      const assembler = new Machine('assembler', 'assembler')
      assembler.setRecipe(recipe('assemble_drivetrain_basic'))
      assembler.start()
      // Pre-load with one circuit_basic → per-type quota reached.
      assembler.addInput(createItem('circuit_basic'))

      // Add upstream producers of BOTH input types. They make
      // wheel_small AND circuit_basic structurally reachable through
      // the belt graph, so the starvation guard cannot fire and hide
      // a real unconsumable_input regression.
      const wheelFab = new Machine('wFab', 'part_fabricator')
      wheelFab.setRecipe(recipe('wheel_press_small'))
      wheelFab.start()

      const circuitFab = new Machine('cFab', 'part_fabricator')
      circuitFab.setRecipe(recipe('circuit_printer_basic'))
      circuitFab.start()

      sim.addMachine(assembler)
      sim.addMachine(wheelFab)
      sim.addMachine(circuitFab)
      sim.setMachinePosition('assembler', 1, 1)
      sim.setMachinePosition('wFab', 0, 1)
      sim.setMachinePosition('cFab', 2, 1)

      // Wheel belt connects wFab → assembler from the west; this belt
      // is what makes wheel_small structurally reachable for the
      // starvation guard (it walks belt destinations to find the
      // consumer).
      const beltW = new ConveyorBelt('b_w', 0, 1, 1, 1, 1.0)
      sim.addBelt(beltW)
      sim.setMachineOutputBelt('wFab', 'b_w')

      // Circuit belt connects cFab → assembler from the east. A
      // freshly-produced circuit is also pre-seeded at position 1.0
      // so the at-quota delivery attempt happens on tick 0.
      const beltC = new ConveyorBelt('b_c', 2, 1, 1, 1, 1.0)
      const circuitOnBelt = createItem('circuit_basic')
      expect(beltC.insertItemAt(circuitOnBelt, 1.0)).toBe(true)
      sim.addBelt(beltC)
      sim.setMachineOutputBelt('cFab', 'b_c')

      // WHEN — run many ticks. Whether the at-quota circuit gets
      // delivered (today, with the cheap pre-check) or stays on the
      // belt (after the fix), the unconsumable_input fatal MUST NOT
      // fire — the type IS recipe-listed.
      tickN(sim, 60)

      // THEN — specifically, no unconsumable_input game-over. (The
      // simulation will produce drivetrains and may legitimately
      // complete other state transitions; the strict assertion here
      // is on the absence of the false-positive game-over reason.)
      expect(sim.gameOver?.reason).not.toBe('unconsumable_input')

      // canConsume contract preserved: the at-quota recipe-listed type
      // is still considered consumable (the membership-only test
      // ItemDeliveryEngine uses to detect fatal mis-routing).
      expect(assembler.canConsume('circuit_basic')).toBe(true)
      expect(assembler.canConsume('wheel_small')).toBe(true)
    })
  })
})
