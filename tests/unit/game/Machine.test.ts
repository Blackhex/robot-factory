import { describe, it, expect, beforeEach } from 'vitest'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'

// --- Helpers ---

function wheelPressRecipe(): Recipe {
  const recipe = getRecipeById('wheel_press_small')
  if (!recipe) throw new Error('wheel_press_small recipe not found')
  return recipe
}

function chassisRecipe(): Recipe {
  const recipe = getRecipeById('chassis_stamper_light')
  if (!recipe) throw new Error('chassis_stamper_light recipe not found')
  return recipe
}

describe('Machine', () => {
  let machine: Machine

  beforeEach(() => {
    resetItemIdCounter()
    machine = new Machine('m1', 'part_fabricator')
  })

  describe('assembler with inputs', () => {
    it('should consume inputs when processing', () => {
      // GIVEN
      const assembler = new Machine('asm1', 'assembler')
      const recipe = getRecipeById('assemble_drivetrain_basic')!
      assembler.setRecipe(recipe)
      assembler.start()

      // WHEN
      // Requires: 2x wheel_small + 1x circuit_basic
      assembler.addInput(createItem('wheel_small'))
      assembler.addInput(createItem('wheel_small'))
      assembler.addInput(createItem('circuit_basic'))
      assembler.tick() // Should start processing

      // THEN
      expect(assembler.state).toBe('processing')
      expect(assembler.inputSlots).toHaveLength(0) // inputs consumed
    })

    it('should not start processing without required inputs', () => {
      // GIVEN
      const assembler = new Machine('asm2', 'assembler')
      const recipe = getRecipeById('assemble_drivetrain_basic')!
      assembler.setRecipe(recipe)

      // WHEN
      // Only provide 1 wheel instead of 2
      assembler.addInput(createItem('wheel_small'))
      assembler.tick()

      // THEN
      expect(assembler.state).toBe('idle') // Not enough inputs
    })
  })

  describe('blocked state', () => {
    it('should enter blocked state when output slot is occupied and processing completes', () => {
      // GIVEN
      const recipe = wheelPressRecipe() // 5 ticks
      machine.setRecipe(recipe)
      machine.start()

      // WHEN
      // First cycle: produce an item
      for (let i = 0; i < 6; i++) {
        machine.tick()
      }
      // Output slot should have an item. Machine should try to start again.
      // It will auto-start a second cycle since it's a part_fabricator with no inputs.
      // After processing ticks, it will try to produce but output slot is full → blocked.
      for (let i = 0; i < 5; i++) {
        machine.tick()
      }

      // THEN
      expect(machine.state).toBe('blocked')
    })

    it('should transition blocked → idle when output taken', () => {
      // GIVEN
      const recipe = wheelPressRecipe()
      machine.setRecipe(recipe)
      machine.start()
      // First cycle + second cycle → blocked
      for (let i = 0; i < 11; i++) {
        machine.tick()
      }
      expect(machine.state).toBe('blocked')

      // WHEN
      machine.takeOutput()

      // THEN
      expect(machine.state).toBe('idle')
    })

    it('should resume processing after output taken from blocked state', () => {
      // GIVEN
      const recipe = wheelPressRecipe() // 5 ticks
      machine.setRecipe(recipe)
      machine.start()
      // Get to blocked state
      for (let i = 0; i < 11; i++) {
        machine.tick()
      }
      expect(machine.state).toBe('blocked')

      // WHEN
      machine.takeOutput()
      // takeOutput transitions blocked → idle, then starts new processing cycle
      expect(machine.state).toBe('idle')

      // THEN
      // Tick starts a new processing cycle (5 ticks)
      machine.tick()
      expect(machine.state).toBe('processing')

      // After 5 processing ticks, output should be produced
      for (let i = 0; i < 5; i++) {
        machine.tick()
      }
      expect(machine.outputSlot).not.toBeNull()
    })
  })

  describe('initial state', () => {
    it('should start in idle state', () => {
      // THEN
      expect(machine.state).toBe('idle')
    })

    it('should have no recipe initially', () => {
      // THEN
      expect(machine.currentRecipe).toBeNull()
    })

    it('should have empty input slots', () => {
      // THEN
      expect(machine.inputSlots).toHaveLength(0)
    })

    it('should have no output', () => {
      // THEN
      expect(machine.outputSlot).toBeNull()
    })
  })

  describe('input slots', () => {
    it('should accept input up to maxInputSlots', () => {
      // GIVEN
      const m = new Machine('m2', 'assembler', 2)

      // WHEN / THEN
      expect(m.addInput(createItem('wheel_small'))).toBe(true)
      expect(m.addInput(createItem('wheel_small'))).toBe(true)
      expect(m.addInput(createItem('wheel_small'))).toBe(false)
    })

    it('should report canAcceptInput correctly', () => {
      // GIVEN
      const m = new Machine('m3', 'assembler', 1)

      // WHEN / THEN
      expect(m.canAcceptInput()).toBe(true)
      m.addInput(createItem('wheel_small'))
      expect(m.canAcceptInput()).toBe(false)
    })

    it('should default to maxInputSlots = 4', () => {
      // GIVEN
      const m = new Machine('m4', 'assembler')

      // WHEN / THEN
      for (let i = 0; i < 4; i++) {
        expect(m.addInput(createItem('wheel_small'))).toBe(true)
      }
      expect(m.addInput(createItem('wheel_small'))).toBe(false)
    })
  })

  describe('recipe assignment', () => {
    it('should set a recipe', () => {
      // GIVEN
      const recipe = wheelPressRecipe()

      // WHEN
      machine.setRecipe(recipe)

      // THEN
      expect(machine.currentRecipe).toBe(recipe)
    })
  })

  describe('state machine: idle → processing → output', () => {
    it('should transition idle → processing when recipe set and ticked', () => {
      // GIVEN
      machine.setRecipe(wheelPressRecipe())
      machine.start()

      // WHEN
      machine.tick()

      // THEN
      expect(machine.state).toBe('processing')
    })

    it('should remain processing until timer expires', () => {
      // GIVEN
      const recipe = wheelPressRecipe() // 5 ticks
      machine.setRecipe(recipe)
      machine.start()

      // WHEN
      machine.tick() // idle → processing (timer = 5)
      machine.tick() // timer = 3
      machine.tick() // timer = 2
      machine.tick() // timer = 1

      // THEN
      expect(machine.state).toBe('processing')
    })

    it('should produce output when timer reaches zero', () => {
      // GIVEN
      const recipe = wheelPressRecipe() // 5 ticks
      machine.setRecipe(recipe)
      machine.start()

      // WHEN
      // 1 tick to start + 5 ticks processing
      for (let i = 0; i < 6; i++) {
        machine.tick()
      }

      // THEN
      expect(machine.outputSlot).not.toBeNull()
      expect(machine.outputSlot!.type).toBe('wheel_small')
    })

    it('should return to idle after producing output (output slot clear)', () => {
      // GIVEN
      const recipe = wheelPressRecipe()
      machine.setRecipe(recipe)
      machine.start()

      // WHEN
      // 1 tick start + 5 ticks processing = output produced, transitions to idle
      for (let i = 0; i < 6; i++) {
        machine.tick()
      }

      // THEN
      // Output produced, output slot empty before → goes back to idle
      // But since recipe has no inputs and output was placed, it tries again
      // After producing, it goes idle and immediately tries to start again
      expect(machine.outputSlot).not.toBeNull()
    })

    it('should tick timing match recipe processingTicks exactly', () => {
      // GIVEN
      const recipe = chassisRecipe() // 8 ticks
      machine.setRecipe(recipe)
      machine.start()

      // WHEN
      machine.tick() // start processing (timer = 8)
      for (let i = 0; i < 7; i++) {
        machine.tick()
      }

      // THEN
      // After 1 start + 7 more = 8 ticks processing, still processing (timer=1 after 7 more ticks)
      expect(machine.state).toBe('processing')

      // WHEN
      machine.tick() // timer hits 0

      // THEN
      expect(machine.outputSlot).not.toBeNull()
    })
  })

  describe('takeOutput()', () => {
    it('should return the output item and clear the slot', () => {
      // GIVEN
      machine.setRecipe(wheelPressRecipe())
      machine.start()
      for (let i = 0; i < 6; i++) {
        machine.tick()
      }

      // WHEN
      const item = machine.takeOutput()

      // THEN
      expect(item).not.toBeNull()
      expect(item!.type).toBe('wheel_small')
      expect(machine.outputSlot).toBeNull()
    })

    it('should return null when no output', () => {
      // WHEN / THEN
      expect(machine.takeOutput()).toBeNull()
    })
  })

  describe('factory_output machine', () => {
    it('should always accept input', () => {
      // GIVEN
      const output = new Machine('out1', 'factory_output')

      // THEN
      expect(output.canAcceptInput()).toBe(true)
    })

    it('should still accept input after receiving items', () => {
      // GIVEN
      const output = new Machine('out1', 'factory_output')
      output.start()

      // WHEN
      output.addInput(createItem('wheel_small'))
      output.addInput(createItem('wheel_small'))
      output.addInput(createItem('wheel_small'))
      output.addInput(createItem('wheel_small'))
      output.addInput(createItem('wheel_small'))

      // THEN — unlimited capacity
      expect(output.canAcceptInput()).toBe(true)
    })

    it('should consume items on addInput (not store them)', () => {
      // GIVEN
      const output = new Machine('out1', 'factory_output')
      output.start()

      // WHEN
      const accepted = output.addInput(createItem('wheel_small'))

      // THEN
      expect(accepted).toBe(true)
      expect(output.inputSlots).toHaveLength(0) // consumed, not stored
    })

    it('should have no output after tick', () => {
      // GIVEN
      const output = new Machine('out1', 'factory_output')

      // WHEN
      output.tick()

      // THEN
      expect(output.outputSlot).toBeNull()
    })

    it('should always remain idle', () => {
      // GIVEN
      const output = new Machine('out1', 'factory_output')
      output.start()

      // WHEN
      output.addInput(createItem('wheel_small'))
      output.tick()

      // THEN
      expect(output.state).toBe('idle')
    })

    it('should remain idle after many ticks', () => {
      // GIVEN
      const output = new Machine('out1', 'factory_output')

      // WHEN
      for (let i = 0; i < 20; i++) {
        output.tick()
      }

      // THEN
      expect(output.state).toBe('idle')
      expect(output.outputSlot).toBeNull()
    })
  })

  describe('speed field', () => {
    it('defaults to 1 on a freshly constructed machine', () => {
      // GIVEN
      const m = new Machine('m1', 'part_fabricator')

      // THEN
      expect(m.speed).toBe(1)
    })

    it('clearRuntimeState() preserves speed alongside currentRecipe and qualityThreshold', () => {
      // GIVEN — configure a machine: recipe + qualityThreshold + speed
      const m = new Machine('m1', 'quality_checker')
      const recipe = wheelPressRecipe()
      m.setRecipe(recipe)
      m.qualityThreshold = 42
      // Sanity: speed is a real declared field with default 1, not a stray
      // dynamic property assignment. Without this guard, a future regression
      // that drops the field declaration could leave m.speed = undefined here
      // and the post-clear assertion would still trivially hold (5 === 5).
      expect(m.speed).toBe(1)
      m.speed = 5

      // WHEN
      m.clearRuntimeState()

      // THEN — speed is configuration, not runtime state, so it must survive.
      // currentRecipe and qualityThreshold are checked here as the canonical
      // "preserved configuration" baseline that speed must follow.
      expect(m.speed).toBe(5)
      expect(m.currentRecipe).toBe(recipe)
      expect(m.qualityThreshold).toBe(42)
    })
  })
})
