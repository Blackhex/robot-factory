import type { MachineType, SimulationCommand } from '../game/types'
import type { Item } from '../game/Item'
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
  on(event: 'machine_cycle_completed', listener: (event: SimulationEventLike) => void): void
  getMachine(machineId: string): { machineType?: MachineType; name?: string } | undefined
  enqueueCommands(commands: SimulationCommand[]): void
  setItemArrivalBridge(
    bridge: ((machineId: string, item: Item) => SimulationCommand[]) | null,
  ): void
}

interface PxtEditorLike {
  triggerEvent(eventType: string): SimulationCommand[]
  triggerOnItemArrives?(machineId: string, item: Item): SimulationCommand[]
}

interface CreateSimulationEffectsWireUpOptions extends GameOverModalFallbackResolvers {
  getSimulation: () => SimulationLike | null
  getFactory: () => FactoryLike | null
  getParticleEffects: () => ParticleEffectsLike | null
  getPxtEditor?: () => PxtEditorLike | null
  modal: Parameters<typeof wireGameOverModal>[0]['modal']
}

export function createSimulationEffectsWireUp(
  options: CreateSimulationEffectsWireUpOptions,
): () => void {
  let wiredSim: object | null = null

  function dispatchMachineIdle(sim: SimulationLike, machineId: string): void {
    const editor = options.getPxtEditor?.() ?? null
    if (!editor) return
    try {
      const commands = editor.triggerEvent(`machine_idle_${machineId}`)
      if (commands.length > 0) sim.enqueueCommands(commands)
    } catch {
      // A buggy on-idle handler must not crash the simulation tick loop.
    }
  }

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

    // New generalized item-arrival bridge (E3): when ANY machine receives
    // an item, ask the player's `on item arrives` handler what commands
    // (if any) to enqueue back into the simulation. Returns [] if no
    // editor, no handler, or handler throws.
    sim.setItemArrivalBridge((machineId, item) => {
      const editor = options.getPxtEditor?.() ?? null
      if (!editor || typeof editor.triggerOnItemArrives !== 'function') {
        return []
      }
      try {
        return editor.triggerOnItemArrives(machineId, item)
      } catch {
        // A buggy on-item-arrives handler must not crash the simulation tick loop.
        return []
      }
    })

    sim.on('machine_state_changed', (event) => {
      const data = event.data as { to?: string; machineId?: string }
      if (!data.machineId) return

      if (data.to === 'processing') {
        const factory = options.getFactory()
        const particleEffects = options.getParticleEffects()
        if (factory && particleEffects) {
          const info = factory.getMachines().find((machine) => machine.id === data.machineId)
          if (info) {
            particleEffects.emitSparksAt(info.x + 0.5, 0.5, info.z + 0.5)
          }
        }
        return
      }

      if (data.to === 'idle') {
        dispatchMachineIdle(sim, data.machineId)
      }
    })

    // The cycle-completed signal lets the bridge fire for auto-restarting
    // fabricators that never observably transition to 'idle'.
    sim.on('machine_cycle_completed', (event) => {
      const data = event.data as { machineId?: string }
      if (!data.machineId) return
      dispatchMachineIdle(sim, data.machineId)
    })
  }
}