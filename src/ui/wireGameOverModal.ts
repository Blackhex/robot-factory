import type { GameOverInfo, MachineType } from '../game/types'
import { GameOverModal } from './GameOverModal'
import { getPreferredCustomMachineName } from './machineLabels'

interface GameOverEvent {
  data: unknown
}

interface GameOverSimulation {
  on(event: 'game_over', listener: (event: GameOverEvent) => void): void
  getMachine(machineId: string): { machineType?: MachineType; name?: string } | undefined
}

interface WireGameOverModalOptions {
  simulation: GameOverSimulation
  modal: GameOverModal
  resolveFallbackMachineType: (machineId: string) => MachineType | undefined
  resolveFallbackMachineName: (machineId: string) => string | undefined
}

export interface GameOverModalFallbackResolvers {
  resolveFallbackMachineType: (machineId: string) => MachineType | undefined
  resolveFallbackMachineName: (machineId: string) => string | undefined
}

export function wireGameOverModal(options: WireGameOverModalOptions): void {
  const { simulation, modal, resolveFallbackMachineType, resolveFallbackMachineName } = options

  simulation.on('game_over', (event) => {
    const info = event.data as GameOverInfo
    const machine = simulation.getMachine(info.machineId)
    const machineType = machine?.machineType ?? resolveFallbackMachineType(info.machineId)
    const machineName = getPreferredCustomMachineName(
      machine?.name,
      resolveFallbackMachineName(info.machineId),
      machineType,
    )

    modal.show({
      ...info,
      machineType,
      machineName,
    })
  })
}