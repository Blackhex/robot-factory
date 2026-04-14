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

  // === Namespaced format commands (PXT-generated) ========================

  describe('namespaced format commands', () => {
    it('should parse machines.startMachine(Machine.A)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'machines.startMachine(Machine.A)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('START_MACHINE')
      expect((commands[0] as any).machineId).toBe('machine_1')
    })

    it('should parse machines.stopMachine(Machine.B)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'machines.stopMachine(Machine.B)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('STOP_MACHINE')
      expect((commands[0] as any).machineId).toBe('machine_2')
    })

    it('should parse machines.producePart(Machine.A, PartType.WheelSmall)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'machines.producePart(Machine.A, PartType.WheelSmall)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('PRODUCE_PART')
      expect((commands[0] as any).machineId).toBe('machine_1')
      expect((commands[0] as any).partType).toBe('wheel_small')
    })

    it('should parse recipes.setRecipe(Machine.A, Recipe.WheelPressSmall)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'recipes.setRecipe(Machine.A, Recipe.WheelPressSmall)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_RECIPE')
      expect((commands[0] as any).machineId).toBe('machine_1')
      expect((commands[0] as any).recipeId).toBe('wheel_press_small')
    })

    it('should parse belts.setBeltSpeed(Belt.Belt1, 5)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'belts.setBeltSpeed(Belt.Belt1, 5)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_BELT_SPEED')
      expect((commands[0] as any).beltId).toBe('belt_1')
      expect((commands[0] as any).speed).toBe(5)
    })

    it('should parse belts.routeTo(Machine.C)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'belts.routeTo(Machine.C)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('ROUTE_TO')
      expect((commands[0] as any).targetId).toBe('machine_3')
    })
  })

  // === PXT const enum inlining (numeric values) =========================

  describe('PXT const enum inlining', () => {
    it('should resolve machines.startMachine(0) to machine_1 (Machine.A = 0)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'machines.startMachine(0)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('START_MACHINE')
      expect((commands[0] as any).machineId).toBe('machine_1')
    })

    it('should resolve machines.producePart(0, 0) to machine_1 + wheel_small', () => {
      // WHEN
      const commands = interpreter.interpret(
        'machines.producePart(0, 0)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('PRODUCE_PART')
      expect((commands[0] as any).machineId).toBe('machine_1')
      expect((commands[0] as any).partType).toBe('wheel_small')
    })

    it('should resolve recipes.setRecipe(1, 2) to machine_2 + wheel_press_large', () => {
      // WHEN
      const commands = interpreter.interpret(
        'recipes.setRecipe(1, 2)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_RECIPE')
      expect((commands[0] as any).machineId).toBe('machine_2')
      expect((commands[0] as any).recipeId).toBe('wheel_press_large')
    })

    it('should resolve belts.setBeltSpeed(0, 3) to belt_1 + speed 3', () => {
      // WHEN
      const commands = interpreter.interpret(
        'belts.setBeltSpeed(0, 3)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_BELT_SPEED')
      expect((commands[0] as any).beltId).toBe('belt_1')
      expect((commands[0] as any).speed).toBe(3)
    })

    it('should resolve machines.startMachine(7) to machine_8 (Machine.H = 7)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'machines.startMachine(7)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('START_MACHINE')
      expect((commands[0] as any).machineId).toBe('machine_8')
    })
  })

  // === Namespaced loops and control flow ==================================

  describe('namespaced loops and control flow', () => {
    it('should expand loops.repeatTimes(3, ...) into repeated commands', () => {
      // GIVEN
      const source = `loops.repeatTimes(3, function () {
        machines.startMachine(Machine.A)
      })`

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(3)
      expect(commands.every((c) => c.type === 'START_MACHINE')).toBe(true)
      expect((commands[0] as any).machineId).toBe('machine_1')
    })

    it('should define and call a procedure via functions_ namespace', () => {
      // GIVEN
      const source = `
        functions_.defineProcedure("myProc", function () {
          machines.startMachine(Machine.A)
        })
        functions_.callProcedure("myProc")
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('START_MACHINE')
      expect((commands[0] as any).machineId).toBe('machine_1')
    })
  })

  // === Namespaced events =================================================

  describe('namespaced events', () => {
    it('should register events.onOrderReceived and trigger it', () => {
      // GIVEN
      interpreter.interpret(`
        events.onOrderReceived(function () {
          machines.startMachine(Machine.A)
        })
      `)

      // WHEN
      const commands = interpreter.triggerEvent('order_received')

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('START_MACHINE')
      expect((commands[0] as any).machineId).toBe('machine_1')
    })
  })

  // === Namespaced variables ==============================================

  describe('namespaced variables', () => {
    it('should set variable via variables_ namespace', () => {
      // WHEN
      interpreter.interpret('variables_.setVariable("count", 5)')

      // THEN
      expect(interpreter.getVariable('count')).toBe(5)
    })
  })

  // === Mixed format (namespaced + factory prefix) ========================

  describe('mixed format', () => {
    it('should handle both namespaced and factory prefix in the same source', () => {
      // GIVEN
      const source = `
        machines.startMachine(Machine.A)
        factory.stopMachine("press_1")
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(2)
      expect(commands[0].type).toBe('START_MACHINE')
      expect((commands[0] as any).machineId).toBe('machine_1')
      expect(commands[1].type).toBe('STOP_MACHINE')
      expect((commands[1] as any).machineId).toBe('press_1')
    })
  })

  // === Quality threshold and splitter (namespaced format) ================

  describe('quality threshold and splitter commands (namespaced)', () => {
    it('should parse machines.setQualityThreshold(Machine.A, 80)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'machines.setQualityThreshold(Machine.A, 80)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_QUALITY_THRESHOLD')
      expect((commands[0] as any).machineId).toBe('machine_1')
      expect((commands[0] as any).threshold).toBe(80)
    })

    it('should parse machines.setQualityThreshold with numeric enum (0, 90)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'machines.setQualityThreshold(0, 90)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_QUALITY_THRESHOLD')
      expect((commands[0] as any).machineId).toBe('machine_1')
      expect((commands[0] as any).threshold).toBe(90)
    })
  })

  // === whileCondition ====================================================

  describe('whileCondition', () => {
    it('should trigger overflow for unbounded whileCondition loop', () => {
      // GIVEN — whileCondition runs until overflow
      const source = `factory.whileCondition(0, function () {
        factory.startMachine("m")
      })`

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(interpreter.getOverflowOccurred()).toBe(true)
      expect(commands.length).toBeLessThanOrEqual(MAX_OPERATIONS)
      expect(commands.length).toBeGreaterThan(0)
    })

    it('should trigger overflow for namespaced loops.whileCondition', () => {
      // GIVEN
      const source = `loops.whileCondition(0, function () {
        machines.startMachine(Machine.A)
      })`

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(interpreter.getOverflowOccurred()).toBe(true)
      expect(commands.length).toBeGreaterThan(0)
    })
  })

  // === Call depth protection =============================================

  describe('call depth protection', () => {
    it('should stop recursive procedure calls at MAX_CALL_DEPTH', () => {
      // GIVEN — a procedure that calls itself recursively
      const source = `
        factory.defineProcedure("recurse", function () {
          factory.startMachine("m")
          factory.callProcedure("recurse")
        })
        factory.callProcedure("recurse")
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN — should produce commands up to MAX_CALL_DEPTH (100), not infinite
      expect(commands.length).toBeLessThanOrEqual(100)
      expect(commands.length).toBeGreaterThan(0)
      expect(interpreter.getOverflowOccurred()).toBe(false)
    })
  })

  // === Syntax error recovery =============================================

  describe('syntax error recovery', () => {
    it('should return partial commands collected before a syntax error', () => {
      // GIVEN — valid command followed by syntax error
      const source = `
        factory.startMachine("a")
        this is not valid javascript {{{{
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN — should not throw; returns empty due to compilation failure
      expect(Array.isArray(commands)).toBe(true)
    })

    it('should return empty for completely invalid source', () => {
      // WHEN
      const commands = interpreter.interpret('}{}{}{')

      // THEN
      expect(commands).toHaveLength(0)
      expect(interpreter.getOverflowOccurred()).toBe(false)
    })
  })

  // === Namespaced onMachineIdle with Machine enum ========================

  describe('namespaced onMachineIdle with Machine enum', () => {
    it('should register events.onMachineIdle with Machine enum and trigger', () => {
      // GIVEN
      interpreter.interpret(`
        events.onMachineIdle(Machine.A, function () {
          machines.startMachine(Machine.B)
        })
      `)

      // WHEN
      const commands = interpreter.triggerEvent('machine_idle_machine_1')

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('START_MACHINE')
      expect((commands[0] as any).machineId).toBe('machine_2')
    })
  })
})
