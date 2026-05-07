import type { MachineType } from '../game/types'
import { wireGameOverModal, type GameOverModalFallbackResolvers } from './wireGameOverModal'

interface MachineInfoLike {
  id: string
  x: number
  z: number
}

interface FactoryLike {
  getMachines(): readonly MachineInfoLike[]
}

interface ParticleEffectsLike {
  emitSparksAt(x: number, y: number, z: number): void
}

interface SimulationEventLike {
  data: unknown
}

interface SimulationLike {
  on(event: 'game_over', listener: (event: SimulationEventLike) => void): void
  on(event: 'machine_state_changed', listener: (event: SimulationEventLike) => void): void
  getMachine(machineId: string): { machineType?: MachineType; name?: string } | undefined
}

interface CreateSimulationEffectsWireUpOptions extends GameOverModalFallbackResolvers {
  getSimulation: () => SimulationLike | null
  getFactory: () => FactoryLike | null
  getParticleEffects: () => ParticleEffectsLike | null
  modal: Parameters<typeof wireGameOverModal>[0]['modal']
}

export function createSimulationEffectsWireUp(
  options: CreateSimulationEffectsWireUpOptions,
): () => void {
  let wiredSim: object | null = null

  return (): void => {
    const sim = options.getSimulation()
    if (!sim || sim === wiredSim) return
    wiredSim = sim

    wireGameOverModal({
      simulation: sim,
      modal: options.modal,
      resolveFallbackMachineType: options.resolveFallbackMachineType,
      resolveFallbackMachineName: options.resolveFallbackMachineName,
    })

    sim.on('machine_state_changed', (event) => {
      const data = event.data as { to?: string; machineId?: string }
      if (data.to !== 'processing' || !data.machineId) return

      const factory = options.getFactory()
      const particleEffects = options.getParticleEffects()
      if (!factory || !particleEffects) return

      const info = factory.getMachines().find((machine) => machine.id === data.machineId)
      if (info) {
        particleEffects.emitSparksAt(info.x + 0.5, 0.5, info.z + 0.5)
      }
    })
  }
}