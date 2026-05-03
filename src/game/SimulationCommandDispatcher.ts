import type { SimulationCommand } from './types.ts'
import { Machine } from './Machine.ts'
import { ConveyorBelt } from './ConveyorBelt.ts'
import { getRecipeById } from './Recipe.ts'

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
 * to the previous inline switch.
 */
export class SimulationCommandDispatcher {
  private readonly deps: SimulationCommandDispatcherDeps

  constructor(deps: SimulationCommandDispatcherDeps) {
    this.deps = deps
  }

  execute(command: SimulationCommand): void {
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
        // Machine will auto-start processing on next tick if recipe + inputs ready
        break
      }
      case 'STOP_MACHINE': {
        const machine = this.deps.getMachine(command.machineId)
        if (machine) {
          machine.currentRecipe = null
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
      case 'SET_QUALITY_THRESHOLD': {
        const machine = this.deps.getMachine(command.machineId)
        if (machine && machine.machineType === 'quality_checker') {
          machine.qualityThreshold = command.threshold
        }
        break
      }
      case 'SET_SPLITTER_CONDITION': {
        const machine = this.deps.getMachine(command.machineId)
        if (machine && machine.machineType === 'splitter') {
          machine.splitterCondition = command.condition
        }
        break
      }
    }
  }
}
