import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { Simulation } from '../../../src/game/Simulation'
import { getRecipeById } from '../../../src/game/Recipe'
import { resetItemIdCounter } from '../../../src/game/Item'

/**
 * B-10 god-file split: pin the extraction of `ItemDeliveryEngine` and
 * `SimulationCommandDispatcher` out of `Simulation.ts`.
 *
 * Tests 1–6 are pure source-string / structural assertions: they fail
 * today (the new files don't exist and `Simulation.ts` still hosts both
 * blocks inline) and must pass once the refactor lands.
 *
 * Test 7 is a behavior-preservation guard: it builds a 3-machine
 * pipeline, runs the simulation, and asserts that items still flow
 * end-to-end. It must pass today AND after the refactor — extracting
 * helper classes must not change observable simulation behavior.
 */

const SRC_GAME_DIR = resolve(__dirname, '../../../src/game')
const SIMULATION_PATH = resolve(SRC_GAME_DIR, 'Simulation.ts')
const ITEM_DELIVERY_ENGINE_PATH = resolve(SRC_GAME_DIR, 'ItemDeliveryEngine.ts')
const COMMAND_DISPATCHER_PATH = resolve(SRC_GAME_DIR, 'SimulationCommandDispatcher.ts')

function readSimulationSource(): string {
  return readFileSync(SIMULATION_PATH, 'utf-8')
}

function tickN(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) {
    sim.tick()
  }
}

describe('B-10 god-file split: ItemDeliveryEngine + SimulationCommandDispatcher', () => {
  describe('1. ItemDeliveryEngine module exists', () => {
    it('should expose an `ItemDeliveryEngine` class from src/game/ItemDeliveryEngine.ts', async () => {
      // THEN — file must exist
      expect(
        existsSync(ITEM_DELIVERY_ENGINE_PATH),
        `expected src/game/ItemDeliveryEngine.ts to exist (B-10 extraction)`,
      ).toBe(true)

      // AND — it must export a class named `ItemDeliveryEngine`
      const module = await import('../../../src/game/ItemDeliveryEngine')
      expect(
        module.ItemDeliveryEngine,
        'expected ItemDeliveryEngine to be exported',
      ).toBeDefined()
      expect(typeof module.ItemDeliveryEngine).toBe('function')
    })
  })

  describe('2. SimulationCommandDispatcher module exists', () => {
    it('should expose a `SimulationCommandDispatcher` class from src/game/SimulationCommandDispatcher.ts', async () => {
      // THEN — file must exist
      expect(
        existsSync(COMMAND_DISPATCHER_PATH),
        `expected src/game/SimulationCommandDispatcher.ts to exist (B-10 extraction)`,
      ).toBe(true)

      // AND — it must export a class named `SimulationCommandDispatcher`
      const module = await import('../../../src/game/SimulationCommandDispatcher')
      expect(
        module.SimulationCommandDispatcher,
        'expected SimulationCommandDispatcher to be exported',
      ).toBeDefined()
      expect(typeof module.SimulationCommandDispatcher).toBe('function')
    })
  })

  describe('3. Simulation.ts no longer hosts the command switch', () => {
    it('should not contain the literal `switch (command.type)`', () => {
      // GIVEN
      const source = readSimulationSource()

      // THEN — the executeCommand switch must have moved to SimulationCommandDispatcher
      expect(
        source.includes('switch (command.type)'),
        'Simulation.ts still contains `switch (command.type)` — extract executeCommand into SimulationCommandDispatcher',
      ).toBe(false)
    })
  })

  describe('4. Simulation.ts no longer hosts deliverItems()', () => {
    it('should not declare `private deliverItems`', () => {
      // GIVEN
      const source = readSimulationSource()

      // THEN — the multi-pass delivery loop must have moved to ItemDeliveryEngine
      expect(
        /\bprivate\s+deliverItems\b/.test(source),
        'Simulation.ts still declares `private deliverItems` — extract its body into ItemDeliveryEngine.deliver()',
      ).toBe(false)
    })
  })

  describe('5. Simulation.ts wires both extracted classes', () => {
    it('should reference both ItemDeliveryEngine and SimulationCommandDispatcher', () => {
      // GIVEN
      const source = readSimulationSource()

      // THEN — Simulation must use the extracted collaborators
      expect(
        source.includes('ItemDeliveryEngine'),
        'Simulation.ts must reference ItemDeliveryEngine (import + instantiation)',
      ).toBe(true)
      expect(
        source.includes('SimulationCommandDispatcher'),
        'Simulation.ts must reference SimulationCommandDispatcher (import + instantiation)',
      ).toBe(true)
    })
  })

  describe('6. Simulation.ts shrinks below the size budget', () => {
    it('should be strictly less than 380 lines', () => {
      // GIVEN
      const source = readSimulationSource()
      const lineCount = source.split('\n').length

      // THEN — the size budget for the post-extraction Simulation orchestrator
      expect(
        lineCount,
        `Simulation.ts is ${lineCount} lines; B-10 budget requires < 380 lines after extracting ItemDeliveryEngine and SimulationCommandDispatcher`,
      ).toBeLessThan(380)
    })
  })

  describe('7. Behavior preservation: 3-machine pipeline still delivers', () => {
    let sim: Simulation

    beforeEach(() => {
      resetItemIdCounter()
      sim = new Simulation() // tickRate=10, dt=0.1
    })

    it('should deliver at least one item end-to-end through fab → belt → splitter → belt → factory_output within 30 ticks', () => {
      // GIVEN — fabricator at (0,0) producing wheel_small (5 ticks/item, default quality 80)
      const fab = new Machine('fab', 'part_fabricator')
      const recipe = getRecipeById('wheel_press_small')
      if (!recipe) throw new Error('wheel_press_small recipe not found')
      fab.setRecipe(recipe)
      fab.start()
      sim.addMachine(fab)
      sim.setMachinePosition('fab', 0, 0)

      // belt seg1 from (0,0) → (1,0), connected as fab's primary output
      const seg1 = new ConveyorBelt('seg1', 0, 0, 1, 0, 1.0)
      sim.addBelt(seg1)
      sim.setMachineOutputBelt('fab', 'seg1', 'primary')

      // splitter at (1,0): outputSidesConfig=Forward (bit 2) to
      // deterministically route to primary output. (Step 1 of the
      // splitter contract migration: routing is now driven by the
      // persistent `outputSidesConfig` bitfield instead of the legacy
      // per-item event-handler bridge.)
      const sp = new Machine('sp1', 'splitter')
      sp.outputSidesConfig = 2 // Forward only → primary
      sp.start()
      sim.addMachine(sp)
      sim.setMachinePosition('sp1', 1, 0)

      // belt seg2 from (1,0) → (2,0), connected as sp's primary output
      const seg2 = new ConveyorBelt('seg2', 1, 0, 2, 0, 1.0)
      sim.addBelt(seg2)
      sim.setMachineOutputBelt('sp1', 'seg2', 'primary')

      // factory_output at (2,0)
      const out = new Machine('out1', 'factory_output')
      out.start()
      sim.addMachine(out)
      sim.setMachinePosition('out1', 2, 0)

      // WHEN — advance 30 ticks
      tickN(sim, 30)

      // THEN — at least one item must have reached factory_output, and the
      // simulation must NOT have tripped game-over (mis-routing).
      expect(
        sim.gameOver,
        `pipeline tripped game-over: ${JSON.stringify(sim.gameOver)}`,
      ).toBeNull()
      expect(sim.outputsDelivered).toBeGreaterThanOrEqual(1)
    })
  })
})
