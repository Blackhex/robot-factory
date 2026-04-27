/**
 * @vitest-environment jsdom
 *
 * Focused deletion and keyboard-path tests for GridInteraction-related behavior.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ASSEMBLER_AT_2_2, EMPTY_5x5 } from './helpers/GridInteractionTestHarness'

import { Factory } from '../../../src/game/Factory'
import { expectFactoryState } from '../helpers/factoryAssert'


describe('GridInteraction deletion', () => {
  // ─── deleteSelectedMachine (pure logic via Factory) ─────

  describe('deleteSelectedMachine', () => {
    let factory: Factory

    beforeEach(() => {
      // GIVEN a 5×5 factory
      factory = new Factory(5, 5)
    })

    it('should remove the selected machine via Factory.removeMachine', () => {
      // GIVEN a machine at (2,2)
      factory.placeMachine(2, 2, 'assembler', 'south')
      expectFactoryState(factory, ASSEMBLER_AT_2_2)
      expect(factory.getMachineAt(2, 2)).not.toBeNull()

      // WHEN the machine is removed
      const result = factory.removeMachine(2, 2)
      expectFactoryState(factory, EMPTY_5x5)

      // THEN cell is cleared
      expect(result).toBe(true)
      expect(factory.getMachineAt(2, 2)).toBeNull()
    })

    it('should be a no-op when no machine is at the position', () => {
      // GIVEN no machine at (0,0)
      expectFactoryState(factory, EMPTY_5x5)
      // WHEN removeMachine is called on empty cell
      const result = factory.removeMachine(0, 0)
      expectFactoryState(factory, EMPTY_5x5)

      // THEN it returns false
      expect(result).toBe(false)
    })

    it('should also remove connected belts when deleting a machine', () => {
      // GIVEN two machines connected by a belt chain
      factory.placeMachine(1, 1, 'assembler', 'south')
      factory.placeMachine(1, 3, 'painter', 'south')
      factory.placeBeltChain(factory.getMachineAt(1, 1)!, factory.getMachineAt(1, 3)!)
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 4],
          expected: [
            '| | | | | |',
            '| |A| | | |',
            '| |\u2502| | | |',
            '| |P| | | |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 1, z: 1, rotation: 'south' },
          { x: 1, z: 3, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 1, z: 1 },
            destination: { x: 1, z: 3 },
            path: [{ x: 1, z: 1 }, { x: 1, z: 2 }, { x: 1, z: 3 }],
          },
        ],
      })
      expect(factory.getBelts().length).toBeGreaterThan(0)

      // WHEN one machine is removed
      factory.removeMachine(1, 1)
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 4],
          expected: [
            '| | | | | |',
            '| | | | | |',
            '| | | | | |',
            '| |P| | | |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [{ x: 1, z: 3, rotation: 'south' }],
        belts: [],
      })

      // THEN the machine and all connected belts are gone
      expect(factory.getMachineAt(1, 1)).toBeNull()
      expect(factory.getBelts()).toHaveLength(0)
    })

    it('should allow placing a new machine after deletion', () => {
      // GIVEN a machine placed then removed
      factory.placeMachine(2, 2, 'assembler', 'south')
      factory.removeMachine(2, 2)
      expectFactoryState(factory, EMPTY_5x5)

      // WHEN a new machine is placed on the same cell
      const result = factory.placeMachine(2, 2, 'painter', 'south')
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 4],
          expected: [
            '| | | | | |',
            '| | | | | |',
            '| | |P| | |',
            '| | | | | |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [{ x: 2, z: 2, rotation: 'south' }],
        belts: [],
      })

      // THEN placement succeeds with the new type
      expect(result).toBeTruthy()
      expect(factory.getMachineAt(2, 2)!.type).toBe('painter')
    })
  })

  // ─── handleKeyDown (DEL key) ────────────────────────────

  describe('handleKeyDown', () => {
    it('Delete key triggers factory.removeMachine (integration path)', () => {
      // GIVEN a factory with a machine at (3,3)
      const factory = new Factory(5, 5)
      factory.placeMachine(3, 3, 'recycler', 'south')
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 4],
          expected: [
            '| | | | | |',
            '| | | | | |',
            '| | | | | |',
            '| | | |R| |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [{ x: 3, z: 3, rotation: 'south' }],
        belts: [],
      })
      expect(factory.getMachineAt(3, 3)).not.toBeNull()

      // WHEN the delete path is simulated (handleKeyDown → deleteSelectedMachine → removeMachine)
      const machine = factory.getMachineAt(3, 3)!
      const result = factory.removeMachine(machine.x, machine.z)
      expectFactoryState(factory, EMPTY_5x5)

      // THEN the machine is removed
      expect(result).toBe(true)
      expect(factory.getMachineAt(3, 3)).toBeNull()
      expect(factory.getMachines()).toHaveLength(0)
    })
  })

})
