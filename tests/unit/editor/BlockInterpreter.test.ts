import { describe, it, expect, beforeEach } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'

/**
 * BlockInterpreter tests.
 *
 * The interpreter parses PXT-compiled TypeScript source strings
 * containing `factory.xxx(...)` calls and produces SimulationCommand[].
 *
 * Core behaviours:
 * - Parses action calls → SimulationCommand (PRODUCE_PART, SET_RECIPE, etc.)
 * - Expands loops (repeatTimes) into repeated command sequences
 * - Registers & calls procedures (defineProcedure / callProcedure)
 * - Registers event handlers (onOrderReceived, etc.) via triggerEvent()
 * - Tracks variables (setVariable, changeVariable, getVariable)
 * - Enforces MAX_OPERATIONS = 10,000 overflow guard
 * - Strips comments before parsing
 */

const MAX_OPERATIONS = 10_000

describe('BlockInterpreter', () => {
  let interpreter: BlockInterpreter

  beforeEach(() => {
    interpreter = new BlockInterpreter()
  })

  // === Single action commands ============================================

  describe('single action commands', () => {
    it('should parse producePart with machineId and PartType enum', () => {
      // WHEN
      const commands = interpreter.interpret(
        'factory.producePart("fab1", PartType.WheelSmall)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('PRODUCE_PART')
      expect((commands[0] as any).machineId).toBe('fab1')
      expect((commands[0] as any).partType).toBe('wheel_small')
    })

    it('should parse producePart with only PartType (no machineId)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'factory.producePart(PartType.SensorProximity)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect((commands[0] as any).machineId).toBe('')
      expect((commands[0] as any).partType).toBe('sensor_proximity')
    })

    it('should parse setRecipe', () => {
      // WHEN
      const commands = interpreter.interpret(
        'factory.setRecipe("assembler", "basic_wheel")',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_RECIPE')
      expect((commands[0] as any).machineId).toBe('assembler')
      expect((commands[0] as any).recipeId).toBe('basic_wheel')
    })

    it('should parse startMachine', () => {
      // WHEN
      const commands = interpreter.interpret('factory.startMachine("press_1")')

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('START_MACHINE')
      expect((commands[0] as any).machineId).toBe('press_1')
    })

    it('should parse stopMachine', () => {
      // WHEN
      const commands = interpreter.interpret('factory.stopMachine("press_1")')

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('STOP_MACHINE')
      expect((commands[0] as any).machineId).toBe('press_1')
    })

    it('should parse setBeltSpeed', () => {
      // WHEN
      const commands = interpreter.interpret(
        'factory.setBeltSpeed("belt_1", 5)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_BELT_SPEED')
      expect((commands[0] as any).beltId).toBe('belt_1')
      expect((commands[0] as any).speed).toBe(5)
    })

    it('should parse routeTo', () => {
      // WHEN
      const commands = interpreter.interpret('factory.routeTo("assembler")')

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('ROUTE_TO')
      expect((commands[0] as any).targetId).toBe('assembler')
    })
  })

  // === Sequencing ========================================================

  describe('sequencing', () => {
    it('should parse multiple commands in order', () => {
      // GIVEN
      const source = `
        factory.startMachine("press_1")
        factory.setRecipe("press_1", "basic_wheel")
        factory.producePart("press_1", PartType.WheelSmall)
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(3)
      expect(commands[0].type).toBe('START_MACHINE')
      expect(commands[1].type).toBe('SET_RECIPE')
      expect(commands[2].type).toBe('PRODUCE_PART')
    })
  })

  // === Loops =============================================================

  describe('loops', () => {
    it('should expand repeatTimes into repeated commands', () => {
      // GIVEN
      const source = `factory.repeatTimes(3, function () {
        factory.startMachine("press_1")
      })`

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(3)
      expect(commands.every((c) => c.type === 'START_MACHINE')).toBe(true)
    })

    it('should handle repeatTimes with count 0', () => {
      // GIVEN
      const source = `factory.repeatTimes(0, function () {
        factory.startMachine("press_1")
      })`

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(0)
    })

    it('should expand nested body with multiple commands', () => {
      // GIVEN
      const source = `factory.repeatTimes(2, function () {
        factory.startMachine("a")
        factory.stopMachine("b")
      })`

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(4)
      expect(commands[0].type).toBe('START_MACHINE')
      expect(commands[1].type).toBe('STOP_MACHINE')
      expect(commands[2].type).toBe('START_MACHINE')
      expect(commands[3].type).toBe('STOP_MACHINE')
    })
  })

  // === Conditionals ======================================================

  describe('conditionals', () => {
    it('should execute ifQuality body by default', () => {
      // GIVEN
      const source = `factory.ifQuality(80, function () {
        factory.routeTo("recycler")
      })`

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('ROUTE_TO')
    })

    it('should execute ifItemType body by default', () => {
      // GIVEN
      const source = `factory.ifItemType(PartType.WheelSmall, function () {
        factory.startMachine("press_1")
      })`

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('START_MACHINE')
    })
  })

  // === Variables =========================================================

  describe('variables', () => {
    it('should set and read variables', () => {
      // WHEN
      interpreter.interpret('factory.setVariable("counter", 5)')

      // THEN
      expect(interpreter.getVariable('counter')).toBe(5)
    })

    it('should change variables', () => {
      // WHEN
      interpreter.interpret(`
        factory.setVariable("counter", 10)
        factory.changeVariable("counter", 3)
      `)

      // THEN
      expect(interpreter.getVariable('counter')).toBe(13)
    })

    it('should default unset variables to 0', () => {
      // WHEN + THEN
      expect(interpreter.getVariable('unknown')).toBe(0)
    })

    it('should clear variables on reset()', () => {
      // GIVEN
      interpreter.interpret('factory.setVariable("x", 42)')
      expect(interpreter.getVariable('x')).toBe(42)

      // WHEN
      interpreter.reset()

      // THEN
      expect(interpreter.getVariable('x')).toBe(0)
    })
  })

  // === Procedures ========================================================

  describe('procedures', () => {
    it('should register and call a procedure', () => {
      // GIVEN
      const source = `
        factory.defineProcedure("myProc", function () {
          factory.startMachine("press_1")
        })
        factory.callProcedure("myProc")
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('START_MACHINE')
    })

    it('should call a procedure multiple times', () => {
      // GIVEN
      const source = `
        factory.defineProcedure("myProc", function () {
          factory.startMachine("a")
        })
        factory.callProcedure("myProc")
        factory.callProcedure("myProc")
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(2)
    })

    it('should ignore callProcedure for undefined procedures', () => {
      // WHEN
      const commands = interpreter.interpret('factory.callProcedure("nope")')

      // THEN
      expect(commands).toHaveLength(0)
    })
  })

  // === Events ============================================================

  describe('events', () => {
    it('should register onOrderReceived and trigger it', () => {
      // GIVEN
      interpreter.interpret(`
        factory.onOrderReceived(function () {
          factory.startMachine("press_1")
        })
      `)

      // WHEN
      const commands = interpreter.triggerEvent('order_received')

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('START_MACHINE')
    })

    it('should register onBeltJam and trigger it', () => {
      // GIVEN
      interpreter.interpret(`
        factory.onBeltJam(function () {
          factory.stopMachine("belt_1")
        })
      `)

      // WHEN
      const commands = interpreter.triggerEvent('belt_jam')

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('STOP_MACHINE')
    })

    it('should register onMachineIdle with machine name', () => {
      // GIVEN
      interpreter.interpret(`
        factory.onMachineIdle("press_1", function () {
          factory.startMachine("press_1")
        })
      `)

      // WHEN
      const commands = interpreter.triggerEvent('machine_idle_press_1')

      // THEN
      expect(commands).toHaveLength(1)
    })

    it('should return empty for unregistered event', () => {
      // GIVEN
      interpreter.interpret('factory.startMachine("a")')

      // WHEN
      const commands = interpreter.triggerEvent('order_received')

      // THEN
      expect(commands).toHaveLength(0)
    })

    it('event handlers should not produce commands during interpret()', () => {
      // WHEN
      const commands = interpreter.interpret(`
        factory.onOrderReceived(function () {
          factory.startMachine("press_1")
        })
        factory.stopMachine("x")
      `)

      // THEN — only the stopMachine should be in the main commands
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('STOP_MACHINE')
    })
  })

  // === Empty / invalid input =============================================

  describe('empty and invalid input', () => {
    it('should return empty for empty string', () => {
      // WHEN + THEN
      expect(interpreter.interpret('')).toHaveLength(0)
    })

    it('should return empty for whitespace-only string', () => {
      // WHEN + THEN
      expect(interpreter.interpret('   \n  ')).toHaveLength(0)
    })

    it('should skip non-factory lines', () => {
      // GIVEN
      const source = `
        let x = 5;
        console.log("hello")
        factory.startMachine("press_1")
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(1)
    })

    it('should handle single-line comments', () => {
      // GIVEN
      const source = `
        // This is a comment
        factory.startMachine("press_1")
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(1)
    })

    it('should handle multi-line comments', () => {
      // GIVEN
      const source = `
        /* multi
           line */
        factory.startMachine("press_1")
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(1)
    })

    it('should skip unknown factory methods', () => {
      // WHEN
      const commands = interpreter.interpret('factory.unknownMethod("a")')

      // THEN
      expect(commands).toHaveLength(0)
    })
  })

  // === Overflow guard ====================================================

  describe('overflow guard', () => {
    it('should set overflow when exceeding MAX_OPERATIONS', () => {
      // GIVEN — a repeat loop that exceeds the budget
      const source = `factory.repeatTimes(${MAX_OPERATIONS + 1}, function () {
        factory.startMachine("m")
      })`

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(interpreter.getOverflowOccurred()).toBe(true)
      expect(commands.length).toBeLessThanOrEqual(MAX_OPERATIONS)
    })

    it('should not overflow for exactly MAX_OPERATIONS', () => {
      // GIVEN — a repeat loop with exactly the budget (minus 1 for the repeatTimes op itself)
      const source = `factory.repeatTimes(${MAX_OPERATIONS - 1}, function () {
        factory.startMachine("m")
      })`

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(interpreter.getOverflowOccurred()).toBe(false)
      expect(commands).toHaveLength(MAX_OPERATIONS - 1)
    })

    it('should reset overflow on reset()', () => {
      // GIVEN
      const source = `factory.repeatTimes(${MAX_OPERATIONS + 1}, function () {
        factory.startMachine("m")
      })`
      interpreter.interpret(source)
      expect(interpreter.getOverflowOccurred()).toBe(true)

      // WHEN
      interpreter.reset()

      // THEN
      expect(interpreter.getOverflowOccurred()).toBe(false)
    })

    it('should reset overflow on new interpret() call', () => {
      // GIVEN
      const source = `factory.repeatTimes(${MAX_OPERATIONS + 1}, function () {
        factory.startMachine("m")
      })`
      interpreter.interpret(source)
      expect(interpreter.getOverflowOccurred()).toBe(true)

      // WHEN
      interpreter.interpret('factory.startMachine("x")')

      // THEN
      expect(interpreter.getOverflowOccurred()).toBe(false)
    })

    it('should stop across subsequent calls on overflow', () => {
      // GIVEN
      const source = `factory.repeatTimes(20000, function () {
        factory.startMachine("x")
      })`

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(interpreter.getOverflowOccurred()).toBe(true)
      expect(commands.length).toBeLessThanOrEqual(MAX_OPERATIONS)
    })
  })

  // === PartType resolution ===============================================

  describe('PartType resolution', () => {
    it('should resolve PartType.WheelSmall to wheel_small', () => {
      // WHEN
      const commands = interpreter.interpret(
        'factory.producePart("m", PartType.WheelSmall)',
      )

      // THEN
      expect((commands[0] as any).partType).toBe('wheel_small')
    })

    it('should resolve factory.PartType.SensorCamera', () => {
      // WHEN
      const commands = interpreter.interpret(
        'factory.producePart("m", factory.PartType.SensorCamera)',
      )

      // THEN
      expect((commands[0] as any).partType).toBe('sensor_camera')
    })

    it('should pass through already-snake_case values', () => {
      // WHEN
      const commands = interpreter.interpret(
        'factory.producePart("m", "wheel_small")',
      )

      // THEN
      expect((commands[0] as any).partType).toBe('wheel_small')
    })
  })

  // === parseTypeScript alias =============================================

  describe('parseTypeScript()', () => {
    it('should be an alias for interpret()', () => {
      // GIVEN
      const source = 'factory.startMachine("a")'
      const a = interpreter.interpret(source)
      interpreter.reset()

      // WHEN
      const b = interpreter.parseTypeScript(source)

      // THEN
      expect(a).toEqual(b)
    })
  })
})
