import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Machine } from '../../../src/game/Machine'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { ALL_MACHINE_TYPES } from '../../../src/game/types'
import type { Recipe } from '../../../src/game/Recipe'

// --- Helpers ---

const MACHINE_SOURCE_PATH = resolve(__dirname, '../../../src/game/Machine.ts')

function readMachineSource(): string {
  return readFileSync(MACHINE_SOURCE_PATH, 'utf8')
}

/**
 * A minimal part_fabricator recipe with one input + one output and a short
 * processingTicks. We define it inline rather than relying on the shipped
 * recipe registry so the behavioral preservation test is self-contained
 * and unaffected by recipe data changes.
 */
function smallFabRecipe(): Recipe {
  return {
    id: 'test_small_fab',
    inputs: [{ type: 'raw_material', quantity: 1 }],
    outputs: [{ type: 'wheel_small', quantity: 1 }],
    processingTicks: 2,
    machineType: 'part_fabricator',
  }
}

describe('MachineBehaviors strategy registry', () => {
  describe('registry shape', () => {
    it('exports MACHINE_BEHAVIORS with an entry for every MachineType', async () => {
      // GIVEN — a freshly imported registry module
      const mod = await import('../../../src/game/MachineBehaviors')
      const registry = (mod as { MACHINE_BEHAVIORS?: unknown }).MACHINE_BEHAVIORS

      // THEN — registry exists and every MachineType has tick + canConsume
      expect(registry).toBeDefined()
      expect(typeof registry).toBe('object')

      for (const machineType of ALL_MACHINE_TYPES) {
        const entry = (registry as Record<string, unknown>)[machineType] as
          | { tick?: unknown; canConsume?: unknown }
          | undefined
        expect(entry, `missing behavior for ${machineType}`).toBeDefined()
        expect(typeof entry?.tick, `${machineType}.tick`).toBe('function')
        expect(typeof entry?.canConsume, `${machineType}.canConsume`).toBe(
          'function',
        )
      }
    })
  })

  describe('Machine.ts source structure', () => {
    it('Machine.tick() body does not switch on this.machineType', () => {
      // GIVEN
      const source = readMachineSource()

      // THEN — switch dispatch on machineType has been removed
      expect(source).not.toContain('switch (this.machineType)')
    })

    it('Machine source no longer dispatches canConsume by switching on machineType', () => {
      // GIVEN
      const source = readMachineSource()

      // THEN — the canConsume method must not switch on this.machineType.
      // (The previous implementation did `switch (this.machineType)` inside
      // canConsume; after the refactor it must delegate to the registry.)
      expect(source).not.toContain('switch (this.machineType)')
    })

    it('Machine.ts references MACHINE_BEHAVIORS for dispatch', () => {
      // GIVEN
      const source = readMachineSource()

      // THEN
      expect(source).toContain('MACHINE_BEHAVIORS')
    })
  })

  describe('behavioral preservation (regression guard)', () => {
    it('part_fabricator with a 2-tick recipe still produces output via tick dispatch', () => {
      // GIVEN
      resetItemIdCounter()
      const m = new Machine('pf1', 'part_fabricator')
      m.setRecipe(smallFabRecipe())
      m.start()
      m.addInput(createItem('raw_material'))

      // WHEN — tick until processing completes.
      // The default tick handles `idle` and `processing` states in distinct
      // ticks (no fall-through), so for processingTicks = 2 we need 3 ticks:
      //   Tick 1: idle → consumeInputs(), processingTimer = 2, state = processing
      //   Tick 2: processing, processingTimer-- → 1, still processing
      //   Tick 3: processing, processingTimer-- → 0, produceOutput()
      m.tick()
      m.tick()
      m.tick()

      // THEN
      expect(m.outputSlot).not.toBeNull()
      expect(m.outputSlot?.type).toBe('wheel_small')
      expect(m.inputSlots).toHaveLength(0)
    })

    it('quality_checker routes a low-quality item to the secondary output slot', () => {
      // GIVEN
      resetItemIdCounter()
      const qc = new Machine('qc1', 'quality_checker')
      qc.qualityThreshold = 50
      qc.start()
      qc.addInput(createItem('wheel_small', 30)) // below threshold

      // WHEN — tick until processing completes.
      // quality_checker uses processingTimer = 1, so:
      //   tick 1: idle → state = processing, processingTimer = 1
      //   tick 2: processing, processingTimer-- → 0, route to secondary
      qc.tick()
      qc.tick()

      // THEN
      expect(qc.secondaryOutputSlot).not.toBeNull()
      expect(qc.secondaryOutputSlot?.quality).toBe(30)
      expect(qc.outputSlot).toBeNull()
      expect(qc.inputSlots).toHaveLength(0)
    })
  })

  describe('machine.speed scaling of processing time', () => {
    // The default tick state machine spends one tick in `idle` to consume
    // inputs and arm the processingTimer, then decrements the timer once
    // per subsequent tick. With the speed-scaling contract:
    //   processingTimer = max(1, ceil(baseTicks / machine.speed))
    // total ticks until output = 1 (setup) + processingTimer.

    /** A part_fabricator recipe with NO inputs and processingTicks = 4. */
    function fourTickFabRecipe(): Recipe {
      return {
        id: 'test_speed_fab_4',
        inputs: [],
        outputs: [{ type: 'wheel_small', quantity: 1 }],
        processingTicks: 4,
        machineType: 'part_fabricator',
      }
    }

    it('speed=1 (regression baseline): 4-tick recipe produces output after 1+4 = 5 ticks', () => {
      // GIVEN
      resetItemIdCounter()
      const m = new Machine('pf1', 'part_fabricator')
      m.setRecipe(fourTickFabRecipe())
      m.speed = 1
      m.start()

      // WHEN — tick 4 times: setup + 3 processing decrements (timer hits 1, not 0)
      for (let i = 0; i < 4; i++) m.tick()

      // THEN — still processing, output not yet produced
      expect(m.outputSlot).toBeNull()

      // WHEN — one more tick: timer decrements to 0, output produced
      m.tick()

      // THEN
      expect(m.outputSlot).not.toBeNull()
      expect(m.outputSlot?.type).toBe('wheel_small')
    })

    it('speed=2: 4-tick recipe produces output after 1+ceil(4/2)=3 ticks', () => {
      // GIVEN
      resetItemIdCounter()
      const m = new Machine('pf2', 'part_fabricator')
      m.setRecipe(fourTickFabRecipe())
      m.speed = 2
      m.start()

      // WHEN — tick twice: setup + 1 processing decrement (timer hits 1, not 0)
      m.tick()
      m.tick()

      // THEN — still processing
      expect(m.outputSlot).toBeNull()

      // WHEN — one more tick: timer decrements to 0, output produced
      m.tick()

      // THEN
      expect(m.outputSlot).not.toBeNull()
      expect(m.outputSlot?.type).toBe('wheel_small')
    })

    it('speed=10: 4-tick recipe produces output after 1+ceil(4/10)=2 ticks', () => {
      // GIVEN
      resetItemIdCounter()
      const m = new Machine('pf3', 'part_fabricator')
      m.setRecipe(fourTickFabRecipe())
      m.speed = 10
      m.start()

      // WHEN — single setup tick: timer set to ceil(4/10)=1, state=processing
      m.tick()

      // THEN — not yet produced (timer still 1)
      expect(m.outputSlot).toBeNull()

      // WHEN — second tick: timer decrements to 0, output produced
      m.tick()

      // THEN
      expect(m.outputSlot).not.toBeNull()
      expect(m.outputSlot?.type).toBe('wheel_small')
    })

    it('recycler speed=3: hardcoded 3-tick recipe produces raw_material after 1+ceil(3/3)=2 ticks', () => {
      // GIVEN — recycler has hardcoded baseTicks = 3 in its tick handler
      resetItemIdCounter()
      const r = new Machine('rec1', 'recycler')
      r.speed = 3
      r.start()
      r.addInput(createItem('wheel_small'))

      // WHEN — tick 1: idle → consume input, processingTimer = ceil(3/3)=1, state=processing
      r.tick()

      // THEN — not yet produced
      expect(r.outputSlot).toBeNull()

      // WHEN — tick 2: timer-- → 0, park raw_material in primary output
      r.tick()

      // THEN
      expect(r.outputSlot).not.toBeNull()
      expect(r.outputSlot?.type).toBe('raw_material')
    })
  })
})
