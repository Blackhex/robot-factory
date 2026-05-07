import type { MachineType } from '../game/types'
import type { GameOverModalFallbackResolvers } from './wireGameOverModal'

interface GameOverFactoryMachine {
  id: string
  type: MachineType
  name: string
}

interface GameOverFactoryLike {
  getMachines(): ReadonlyArray<GameOverFactoryMachine>
}

export function createFactoryBackedGameOverFallbackResolvers(
  getFactory: () => GameOverFactoryLike | null | undefined,
): GameOverModalFallbackResolvers {
  const getMachine = (machineId: string): GameOverFactoryMachine | undefined =>
    getFactory()?.getMachines().find((machine) => machine.id === machineId)

  return {
    resolveFallbackMachineType: (machineId) => getMachine(machineId)?.type,
    resolveFallbackMachineName: (machineId) => getMachine(machineId)?.name,
  }
}