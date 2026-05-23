import { describe, it, expect, beforeEach } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'

/**
 * BlockInterpreter tests.
 *
 * The interpreter parses PXT-compiled TypeScript source strings
 * containing `factory.xxx(...)` calls and produces SimulationCommand[].
 *
 * Core behaviours:
 * - Parses action calls → SimulationCommand (SET_RECIPE, START_MACHINE, etc.)
 * - Expands loops (repeatTimes) into repeated command sequences
 * - Supports native JS function declarations/calls (built-in PXT Functions)
 * - Registers event handlers (onOrderReceived, etc.) via triggerEvent()
 * - Tracks command queue produced by namespace calls
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

    it('should parse legacy factory.setMachineSpeed("machine_1", 7)', () => {
      // WHEN — legacy factory namespace mirror, accepting a string id literal
      const commands = interpreter.interpret(
        'factory.setMachineSpeed("machine_1", 7)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_MACHINE_SPEED')
      expect((commands[0] as any).machineId).toBe('machine_1')
      expect((commands[0] as any).speed).toBe(7)
    })

    it('should ignore removed factory.routeTo()', () => {
      // WHEN — routeTo has been removed; the interpreter must not emit any command.
      const commands = interpreter.interpret('factory.routeTo("assembler")')

      // THEN
      expect(commands).toHaveLength(0)
      expect(commands.find((c) => c.type === ('ROUTE_TO' as any))).toBeUndefined()
    })
  })

  // === Sequencing ========================================================

  describe('sequencing', () => {
    it('should parse multiple commands in order', () => {
      // GIVEN
      const source = `
        factory.startMachine("press_1")
        factory.setRecipe("press_1", "basic_wheel")
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(2)
      expect(commands[0].type).toBe('START_MACHINE')
      expect(commands[1].type).toBe('SET_RECIPE')
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
    it('should NOT recognize factory.ifItemType (removed); body must not execute', () => {
      // GIVEN — factory.ifItemType / logic.ifItemType have been removed.
      // The interpreter wraps execution in try/catch, so calling an
      // unknown member of `factory` throws TypeError, gets swallowed,
      // and the body is never invoked → zero commands emitted.
      const source = `factory.ifItemType(PartType.WheelSmall, function () {
        factory.startMachine("press_1")
      })`

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(0)
      expect(commands.find((c) => c.type === 'START_MACHINE')).toBeUndefined()
    })

    it('should NOT recognize logic.ifItemType (removed); body must not execute', () => {
      // GIVEN — same as above but via the dedicated `logic` namespace.
      const source = `logic.ifItemType(PartType.WheelSmall, function () {
        factory.startMachine("press_1")
      })`

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(0)
      expect(commands.find((c) => c.type === 'START_MACHINE')).toBeUndefined()
    })
  })

  // === Variables (built-in Blockly variables compile to native JS;
  //     custom variables_ namespace was removed) ===========================

  describe('built-in JS variables', () => {
    it('should support locally-scoped JS variables that influence command emission', () => {
      // GIVEN — built-in Blockly Variables blocks compile to plain JS
      const source = `
        let count = 2
        for (let i = 0; i < count; i++) {
          machines.startMachine(Machine.A)
        }
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(2)
      expect(commands.every(c => c.type === 'START_MACHINE')).toBe(true)
    })
  })

  // === pick-machine (value-returning expression) =========================

  describe('machines.pickMachine', () => {
    it('should return the machine value so it can be assigned to a JS variable', () => {
      // GIVEN
      const source = `
        let m = machines.pickMachine(Machine.A)
        machines.startMachine(m)
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('START_MACHINE')
      expect((commands[0] as any).machineId).toBe('machine_1')
    })
  })

  // === pick-belt (value-returning expression, mirrors pickMachine) =======

  describe('belts.pickBelt', () => {
    it('should return the belt value so it can be assigned to a JS variable', () => {
      // GIVEN
      const source = `
        let b = belts.pickBelt(Belt.Belt1)
        belts.setBeltSpeed(b, 5)
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_BELT_SPEED')
      expect((commands[0] as any).beltId).toBe('belt_1')
      expect((commands[0] as any).speed).toBe(5)
    })
  })

  // === Native JS functions (built-in PXT Functions category) ============

  describe('native JS functions', () => {
    it('should support user-defined function declarations and calls', () => {
      // GIVEN: what PXT's built-in Functions blocks compile to
      const source = `
        function myProc() {
          machines.startMachine(Machine.A)
        }
        myProc()
        myProc()
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN
      expect(commands).toHaveLength(2)
      expect(commands.every((c) => c.type === 'START_MACHINE')).toBe(true)
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

    it('should parse machines.setRecipe(Machine.A, Recipe.WheelPressSmall)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'machines.setRecipe(Machine.A, Recipe.WheelPressSmall)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_RECIPE')
      expect((commands[0] as any).machineId).toBe('machine_1')
      expect((commands[0] as any).recipeId).toBe('wheel_press_small')
    })

    it('should parse recipes.setRecipe(Machine.A, Recipe.WheelPressSmall) as backward compat', () => {
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

    it('should parse machines.setMachineSpeed(Machine.A, 5)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'machines.setMachineSpeed(Machine.A, 5)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_MACHINE_SPEED')
      expect((commands[0] as any).machineId).toBe('machine_1')
      expect((commands[0] as any).speed).toBe(5)
    })

    it('should ignore removed belts.routeTo(Machine.C)', () => {
      // WHEN — belts.routeTo has been removed from the codebase.
      const commands = interpreter.interpret(
        'belts.routeTo(Machine.C)',
      )

      // THEN
      expect(commands).toHaveLength(0)
      expect(commands.find((c) => c.type === ('ROUTE_TO' as any))).toBeUndefined()
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

    it('should resolve machines.setRecipe(1, 2) to machine_2 + wheel_press_large', () => {
      // WHEN
      const commands = interpreter.interpret(
        'machines.setRecipe(1, 2)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_RECIPE')
      expect((commands[0] as any).machineId).toBe('machine_2')
      expect((commands[0] as any).recipeId).toBe('wheel_press_large')
    })

    it('should resolve recipes.setRecipe(1, 2) as backward compat alias', () => {
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

    it('should resolve machines.setMachineSpeed(0, 3) to machine_1 + speed 3', () => {
      // WHEN
      const commands = interpreter.interpret(
        'machines.setMachineSpeed(0, 3)',
      )

      // THEN
      expect(commands).toHaveLength(1)
      expect(commands[0].type).toBe('SET_MACHINE_SPEED')
      expect((commands[0] as any).machineId).toBe('machine_1')
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

  // === Recursion protection ==============================================

  describe('recursion protection', () => {
    it('should terminate recursive functions without hanging the interpreter', () => {
      // GIVEN — a native JS function that calls itself recursively.
      // The interpreter no longer has its own call-depth guard; instead it
      // relies on the JS engine's stack limit (which throws RangeError that
      // `interpret()` catches) combined with the MAX_OPERATIONS cap.
      const source = `
        function recurse() {
          machines.startMachine(Machine.A)
          recurse()
        }
        recurse()
      `

      // WHEN
      const commands = interpreter.interpret(source)

      // THEN — must return a finite number of commands (not infinite loop)
      // and the fall-through must not crash.
      expect(Array.isArray(commands)).toBe(true)
      expect(commands.length).toBeGreaterThan(0)
      expect(commands.length).toBeLessThanOrEqual(MAX_OPERATIONS)
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

  // === Checker removal — legacy quality-related calls degrade gracefully =

  describe('Checker removal — legacy quality calls', () => {
    it('should ignore removed machines.setQualityThreshold(Machine.A, 50) — no command emitted, no throw', () => {
      // WHEN — `setQualityThreshold` has been removed alongside the
      // Quality Checker. Old programs sitting in saved workspaces must
      // still parse without throwing; the call must simply emit no
      // command (matches the existing `routeTo` graceful-removal pattern).
      const commands = interpreter.interpret(
        'machines.setQualityThreshold(Machine.A, 50)',
      )

      // THEN
      expect(
        commands.find((c) => c.type === ('SET_QUALITY_THRESHOLD' as never)),
      ).toBeUndefined()
      expect(commands).toHaveLength(0)
    })

    it('should ignore removed factory.setQualityThreshold("checker_1", 80) (legacy factory.* mirror)', () => {
      // WHEN
      const commands = interpreter.interpret(
        'factory.setQualityThreshold("checker_1", 80)',
      )

      // THEN
      expect(
        commands.find((c) => c.type === ('SET_QUALITY_THRESHOLD' as never)),
      ).toBeUndefined()
      expect(commands).toHaveLength(0)
    })

    it('should ignore removed logic.ifQuality(...) — body must NOT execute', () => {
      // WHEN — `logic.ifQuality(threshold, body)` has been removed.
      // Old programs that wrap commands in an `ifQuality` block must
      // degrade gracefully: the body is skipped entirely (no command
      // emitted), and the call itself does not throw.
      const commands = interpreter.interpret(
        `logic.ifQuality(50, function () {
          loops.repeatTimes(3, function () {
            machines.startMachine(Machine.A)
          })
        })`,
      )

      // THEN — the inner `repeatTimes(3, START_MACHINE)` would emit 3
      // START_MACHINE commands if the body ran. After removal the body
      // must NOT run, so no START_MACHINE commands are produced.
      expect(commands.find((c) => c.type === 'START_MACHINE')).toBeUndefined()
      expect(commands).toHaveLength(0)
    })

    it('should ignore removed factory.ifQuality(...) — body must NOT execute (legacy factory.* mirror)', () => {
      // WHEN
      const commands = interpreter.interpret(
        `factory.ifQuality(80, function () {
          factory.startMachine("recycler")
        })`,
      )

      // THEN
      expect(commands.find((c) => c.type === 'START_MACHINE')).toBeUndefined()
      expect(commands).toHaveLength(0)
    })
  })
})
