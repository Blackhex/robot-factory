import type { SimulationCommand, WaitCommand } from './types.ts'
import { Machine } from './Machine.ts'
import { ConveyorBelt } from './ConveyorBelt.ts'
import { getRecipeById } from './Recipe.ts'

/**
 * Side-effecting commands accepted by the dispatcher. `WaitCommand` is
 * deliberately excluded: it is a queue-level control concept consumed
 * inside `Simulation.processCommands()` and must never reach the
 * dispatcher. Narrowing the input type here makes that architectural
 * rule a compile-time guarantee rather than a runtime convention.
 */
export type DispatchableCommand = Exclude<SimulationCommand, WaitCommand>

/**
 * Dependency object accepted by `SimulationCommandDispatcher`. The
 * dispatcher reads from these accessors but does not own the underlying
 * collections — that ownership stays in `Simulation`.
 */
export interface SimulationCommandDispatcherDeps {
  getMachine(id: string): Machine | undefined
  getBelt(id: string): ConveyorBelt | undefined
  getBelts(): ReadonlyMap<string, ConveyorBelt>
}

/**
 * Executes a single `SimulationCommand` against the simulation's
 * machines and belts. Extracted from `Simulation.executeCommand` as
 * part of the B-10 god-file split. Behavior is byte-for-byte identical
 * to the previous switch in `Simulation.executeCommand`.
 */
export class SimulationCommandDispatcher {
  private readonly deps: SimulationCommandDispatcherDeps

  constructor(deps: SimulationCommandDispatcherDeps) {
    this.deps = deps
  }

  execute(command: DispatchableCommand): void {
    switch (command.type) {
      case 'SET_RECIPE': {
        const machine = this.deps.getMachine(command.machineId)
        const recipe = getRecipeById(command.recipeId)
        if (machine && recipe) {
          machine.setRecipe(recipe)
        }
        break
      }
      case 'START_MACHINE': {
        const machine = this.deps.getMachine(command.machineId)
        if (machine) {
          machine.start()
        }
        break
      }
      case 'STOP_MACHINE': {
        const machine = this.deps.getMachine(command.machineId)
        if (machine) {
          machine.stop()
        }
        break
      }
      case 'SET_BELT_SPEED': {
        const belt = this.deps.getBelt(command.beltId)
        if (belt) {
          belt.speed = command.speed
        }
        // Multi-cell belts are registered as per-cell segments under ids of the
        // form `${logicalId}_seg${N}` (see ConveyorBelt.fromBeltInfo). Apply the
        // speed to every matching segment so the dropdown's logical id works.
        for (const [id, segment] of this.deps.getBelts()) {
          const parsed = ConveyorBelt.parseSegmentId(id)
          if (parsed && parsed.logicalId === command.beltId) {
            segment.speed = command.speed
          }
        }
        break
      }
      case 'SET_MACHINE_SPEED': {
        const machine = this.deps.getMachine(command.machineId)
        if (machine) {
          machine.speed = command.speed
        }
        break
      }
      case 'SET_OUTPUT_SIDES': {
        const machine = this.deps.getMachine(command.machineId)
        if (!machine || machine.machineType !== 'splitter') break
        machine.outputSidesConfig = command.sidesBitmask
        if (command.itemId !== undefined) {
          machine.perItemRouteOverrides.set(command.itemId, command.sidesBitmask)
        }
        break
      }
      case 'ROUTE_CURRENT_ITEM_TO': {
        const machine = this.deps.getMachine(command.machineId)
        if (!machine || machine.machineType !== 'splitter') break
        const present = machine.inputSlots.some((it) => it.id === command.itemId)
        if (!present) break
        machine.perItemRouteOverrides.set(command.itemId, command.sidesBitmask)
        break
      }
    }
  }
}
