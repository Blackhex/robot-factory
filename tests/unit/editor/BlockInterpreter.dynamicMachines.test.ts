import { describe, it, expect, beforeEach } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'

/**
 * Tests for dynamic machine/belt list feature.
 *
 * These tests verify that BlockInterpreter can accept a dynamic list of
 * machines and belts (from the factory state) and use them for ID resolution
 * instead of the static Machine/Belt enums.
 *
 * All tests are expected to FAIL until setMachineList(), setBeltList(),
 * and getMachineList() are implemented on BlockInterpreter.
 */

describe('BlockInterpreter — dynamic machine/belt lists', () => {
  let interpreter: BlockInterpreter

  beforeEach(() => {
    interpreter = new BlockInterpreter()
  })

  // === setMachineList ====================================================

  describe('setMachineList()', () => {
    it('should exist as a method on BlockInterpreter', () => {
      // THEN
      expect(typeof interpreter.setMachineList).toBe('function')
    })

    it('should update machine resolution for a single machine', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_3', name: 'Fabricator 1' },
      ])

      // WHEN — slot 0 now maps to machine_3 instead of machine_1
      const commands = interpreter.interpret('machines.startMachine(0)')

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_3')
    })

    it('should update machine resolution for multiple machines', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_5', name: 'Press Alpha' },
        { slotIndex: 1, id: 'machine_9', name: 'Assembler Beta' },
        { slotIndex: 2, id: 'machine_2', name: 'Painter Gamma' },
      ])

      // WHEN
      const cmds0 = interpreter.interpret('machines.startMachine(0)')
      const cmds1 = interpreter.interpret('machines.startMachine(1)')
      const cmds2 = interpreter.interpret('machines.startMachine(2)')

      // THEN
      expect((cmds0[0] as any).machineId).toBe('machine_5')
      expect((cmds1[0] as any).machineId).toBe('machine_9')
      expect((cmds2[0] as any).machineId).toBe('machine_2')
    })

    it('should resolve Machine.A enum name through dynamic list', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_7', name: 'Smelter' },
      ])

      // WHEN — Machine.A = 0, which should now map to machine_7
      const commands = interpreter.interpret(
        'machines.startMachine(Machine.A)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_7')
    })

    it('should work with factory.startMachine via factory namespace', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_3', name: 'Fabricator 1' },
      ])

      // WHEN
      const commands = interpreter.interpret(
        'factory.startMachine(Machine.A)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_3')
    })

    it('should fall back to static resolution for slots not in dynamic list', () => {
      // GIVEN — only slot 0 is in the dynamic list
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_3', name: 'Fabricator 1' },
      ])

      // WHEN — slot 7 is NOT in the dynamic list, should use static fallback
      const commands = interpreter.interpret('machines.startMachine(7)')

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_8')
    })

    it('should revert to static resolution when list is cleared', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_3', name: 'Fabricator 1' },
      ])

      // WHEN — clear the dynamic list
      interpreter.setMachineList([])
      const commands = interpreter.interpret('machines.startMachine(0)')

      // THEN — should use static fallback: 0 → machine_1
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_1')
    })

    it('should affect setRecipe machine resolution', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_6', name: 'Assembler X' },
      ])

      // WHEN
      const commands = interpreter.interpret(
        'machines.setRecipe(0, Recipe.WheelPressSmall)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_6')
    })

    it('should affect stopMachine resolution', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 1, id: 'machine_10', name: 'Driller' },
      ])

      // WHEN
      const commands = interpreter.interpret('machines.stopMachine(1)')

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_10')
    })

    it('should affect routeTo resolution', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 2, id: 'machine_11', name: 'Recycler' },
      ])

      // WHEN
      const commands = interpreter.interpret('belts.routeTo(2)')

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).targetId).toBe('machine_11')
    })

    it('should affect onMachineIdle event registration', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_3', name: 'Fabricator 1' },
      ])
      interpreter.interpret(`
        events.onMachineIdle(0, function () {
          machines.startMachine(0)
        })
      `)

      // WHEN — trigger with the dynamic ID
      const commands = interpreter.triggerEvent('machine_idle_machine_3')

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_3')
    })

    it('should affect setQualityThreshold resolution', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_3', name: 'Inspector' },
      ])

      // WHEN
      const commands = interpreter.interpret(
        'machines.setQualityThreshold(0, 85)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_3')
      expect((commands[0] as any).threshold).toBe(85)
    })
  })

  // === setBeltList =======================================================

  describe('setBeltList()', () => {
    it('should exist as a method on BlockInterpreter', () => {
      // THEN
      expect(typeof interpreter.setBeltList).toBe('function')
    })

    it('should update belt resolution for a single belt', () => {
      // GIVEN
      interpreter.setBeltList([
        { slotIndex: 0, id: 'belt_5' },
      ])

      // WHEN
      const commands = interpreter.interpret('belts.setBeltSpeed(0, 2)')

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).beltId).toBe('belt_5')
      expect((commands[0] as any).speed).toBe(2)
    })

    it('should update belt resolution for multiple belts', () => {
      // GIVEN
      interpreter.setBeltList([
        { slotIndex: 0, id: 'belt_10' },
        { slotIndex: 1, id: 'belt_3' },
      ])

      // WHEN
      const cmds0 = interpreter.interpret('belts.setBeltSpeed(0, 1)')
      const cmds1 = interpreter.interpret('belts.setBeltSpeed(1, 2)')

      // THEN
      expect((cmds0[0] as any).beltId).toBe('belt_10')
      expect((cmds1[0] as any).beltId).toBe('belt_3')
    })

    it('should resolve Belt enum name through dynamic list', () => {
      // GIVEN
      interpreter.setBeltList([
        { slotIndex: 0, id: 'belt_7' },
      ])

      // WHEN — Belt.Belt1 = 0, should now map to belt_7
      const commands = interpreter.interpret(
        'belts.setBeltSpeed(Belt.Belt1, 3)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).beltId).toBe('belt_7')
    })

    it('should fall back to static resolution for slots not in dynamic list', () => {
      // GIVEN
      interpreter.setBeltList([
        { slotIndex: 0, id: 'belt_9' },
      ])

      // WHEN — slot 5 is not in the dynamic list
      const commands = interpreter.interpret('belts.setBeltSpeed(5, 2)')

      // THEN — should use static fallback: 5 → belt_6
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).beltId).toBe('belt_6')
    })

    it('should revert to static resolution when list is cleared', () => {
      // GIVEN
      interpreter.setBeltList([
        { slotIndex: 0, id: 'belt_5' },
      ])

      // WHEN
      interpreter.setBeltList([])
      const commands = interpreter.interpret('belts.setBeltSpeed(0, 1)')

      // THEN — should use static fallback: 0 → belt_1
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).beltId).toBe('belt_1')
    })
  })

  // === Name-based machine resolution =====================================

  describe('name-based machine resolution', () => {
    it('should resolve machine by name when string matches a machine name', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_3', name: 'Fabricator 1' },
      ])

      // WHEN — use the machine name as a string argument
      const commands = interpreter.interpret(
        'factory.startMachine("Fabricator 1")',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_3')
    })

    it('should resolve machine by name with multiple machines', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_1', name: 'Press Alpha' },
        { slotIndex: 1, id: 'machine_5', name: 'Assembler Beta' },
        { slotIndex: 2, id: 'machine_8', name: 'Painter Gamma' },
      ])

      // WHEN
      const commands = interpreter.interpret(
        'factory.startMachine("Assembler Beta")',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_5')
    })

    it('should fall back to passthrough when name does not match any machine', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_3', name: 'Fabricator 1' },
      ])

      // WHEN — "unknown_machine" does not match any name or enum
      const commands = interpreter.interpret(
        'factory.startMachine("unknown_machine")',
      )

      // THEN — should pass through as-is (existing behavior)
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('unknown_machine')
    })

    it('should be case-sensitive for name matching', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_3', name: 'Fabricator 1' },
      ])

      // WHEN — wrong case should NOT match
      const commands = interpreter.interpret(
        'factory.startMachine("fabricator 1")',
      )

      // THEN — should pass through as-is (no match)
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('fabricator 1')
    })

    it('should prefer name resolution over direct passthrough', () => {
      // GIVEN — machine name happens to look like an ID
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_99', name: 'machine_1' },
      ])

      // WHEN — "machine_1" matches the name, not treated as direct ID
      const commands = interpreter.interpret(
        'factory.startMachine("machine_1")',
      )

      // THEN — should resolve to machine_99 via name lookup
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_99')
    })

    it('should resolve name in routeTo command', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_4', name: 'Recycler' },
      ])

      // WHEN
      const commands = interpreter.interpret(
        'factory.routeTo("Recycler")',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).targetId).toBe('machine_4')
    })

    it('should resolve name in setRecipe machineId', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_2', name: 'My Fab' },
      ])

      // WHEN
      const commands = interpreter.interpret(
        'machines.setRecipe(0, Recipe.WheelPressSmall)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_2')
      expect((commands[0] as any).recipeId).toBe('wheel_press_small')
    })
  })

  // === getMachineList ====================================================

  describe('getMachineList()', () => {
    it('should exist as a method on BlockInterpreter', () => {
      // THEN
      expect(typeof interpreter.getMachineList).toBe('function')
    })

    it('should return empty array when no list has been set', () => {
      // WHEN
      const list = interpreter.getMachineList()

      // THEN
      expect(list).toEqual([])
    })

    it('should return the current machine list', () => {
      // GIVEN
      const machines = [
        { slotIndex: 0, id: 'machine_3', name: 'Fabricator 1' },
        { slotIndex: 1, id: 'machine_5', name: 'Assembler 2' },
      ]
      interpreter.setMachineList(machines)

      // WHEN
      const list = interpreter.getMachineList()

      // THEN
      expect(list).toEqual(machines)
    })

    it('should return empty array after clearing', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_3', name: 'Fabricator 1' },
      ])

      // WHEN
      interpreter.setMachineList([])
      const list = interpreter.getMachineList()

      // THEN
      expect(list).toEqual([])
    })

    it('should return a copy, not a reference to internal state', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_3', name: 'Fabricator 1' },
      ])

      // WHEN — mutate the returned array
      const list = interpreter.getMachineList()
      list.push({ slotIndex: 1, id: 'machine_99', name: 'Hacked' })

      // THEN — internal state should not be affected
      expect(interpreter.getMachineList()).toHaveLength(1)
    })
  })

  // === Existing behavior preserved =======================================

  describe('existing behavior preserved when no dynamic list is set', () => {
    it('should still resolve numeric enum 0 → machine_1 (static)', () => {
      // WHEN — no setMachineList called
      const commands = interpreter.interpret('machines.startMachine(0)')

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_1')
    })

    it('should still resolve Machine.A → machine_1 (static)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'machines.startMachine(Machine.A)',
      )

      // THEN
      expect((commands[0] as any).machineId).toBe('machine_1')
    })

    it('should still resolve Belt.Belt1 → belt_1 (static)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'belts.setBeltSpeed(Belt.Belt1, 5)',
      )

      // THEN
      expect((commands[0] as any).beltId).toBe('belt_1')
    })

    it('should still pass through string machine IDs', () => {
      // WHEN
      const commands = interpreter.interpret(
        'factory.startMachine("press_1")',
      )

      // THEN
      expect((commands[0] as any).machineId).toBe('press_1')
    })

    it('should still resolve numeric belt 0 → belt_1 (static)', () => {
      // WHEN
      const commands = interpreter.interpret('belts.setBeltSpeed(0, 3)')

      // THEN
      expect((commands[0] as any).beltId).toBe('belt_1')
    })
  })

  // === Integration: dynamic list + full program ==========================

  describe('integration: dynamic list + full program', () => {
    it('should resolve dynamic machines throughout a multi-command program', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'fab_1', name: 'Fabricator' },
        { slotIndex: 1, id: 'asm_1', name: 'Assembler' },
      ])
      interpreter.setBeltList([
        { slotIndex: 0, id: 'conveyor_1' },
      ])

      // WHEN
      const commands = interpreter.interpret(`
        machines.startMachine(0)
        machines.setRecipe(1, Recipe.WheelPressSmall)
        belts.setBeltSpeed(0, 5)
      `)

      // THEN
      expect(commands).toHaveLength(3)
      expect(commands[0].type).toBe('START_MACHINE')
      expect((commands[0] as any).machineId).toBe('fab_1')
      expect(commands[1].type).toBe('SET_RECIPE')
      expect((commands[1] as any).machineId).toBe('asm_1')
      expect(commands[2].type).toBe('SET_BELT_SPEED')
      expect((commands[2] as any).beltId).toBe('conveyor_1')
    })

    it('should resolve dynamic machines in a repeat loop', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_42', name: 'Looper' },
      ])

      // WHEN
      const commands = interpreter.interpret(`
        loops.repeatTimes(3, function () {
          machines.startMachine(0)
        })
      `)

      // THEN
      expect(commands).toHaveLength(3)
      expect(commands.every(c => (c as any).machineId === 'machine_42')).toBe(true)
    })

    it('should resolve dynamic machines in procedures', () => {
      // GIVEN
      interpreter.setMachineList([
        { slotIndex: 0, id: 'machine_77', name: 'ProcMachine' },
      ])

      // WHEN
      const commands = interpreter.interpret(`
        functions_.defineProcedure("start", function () {
          machines.startMachine(0)
        })
        functions_.callProcedure("start")
      `)

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('machine_77')
    })
  })
})
