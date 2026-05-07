import type { GameOverInfo } from './types.ts'
import { isRecipeRequiredMachineType } from './types.ts'
import type { Machine } from './Machine.ts'

/**
 * Detect a no-recipe game-over condition: returns info for the first enabled,
 * recipe-required machine that has no recipe assigned, or `null` if none.
 * Pure: does not mutate machines or emit events.
 */
export function detectNoRecipeStart(
  machines: Iterable<Machine>,
  currentTick: number,
): GameOverInfo | null {
  for (const machine of machines) {
    if (
      machine.enabled &&
      machine.currentRecipe === null &&
      isRecipeRequiredMachineType(machine.machineType)
    ) {
      return {
        reason: 'no_recipe',
        machineId: machine.id,
        tick: currentTick,
      }
    }
  }
  return null
}
