import { expect } from 'vitest'
import { Factory } from '../../../../../src/game/Factory'
import { Simulation } from '../../../../../src/game/Simulation'
import { Machine } from '../../../../../src/game/Machine'
import { ConveyorBelt } from '../../../../../src/game/ConveyorBelt'

export function populateSim(factory: Factory, sim: Simulation): void {
  for (const info of factory.getMachines()) {
    sim.addMachine(new Machine(info.id, info.type))
    sim.setMachinePosition(info.id, info.x, info.z)
  }
  for (const info of factory.getBelts()) {
    for (let i = 0; i < info.path.length - 1; i++) {
      const segId = `${info.id}_seg${i}`
      sim.addBelt(
        new ConveyorBelt(
          segId,
          info.path[i].x,
          info.path[i].z,
          info.path[i + 1].x,
          info.path[i + 1].z,
        ),
      )
    }
    sim.setMachineOutputBelt(info.sourceMachine.id, `${info.id}_seg0`)
  }
}

export function attachSimToFactory(factory: Factory, sim: Simulation): void {
  ;(factory as unknown as {
    attachSimulation?: (sim: Simulation) => void
  }).attachSimulation?.(sim)
}

export function withFactoryEditBoundary(factory: Factory, callback: () => void): void {
  const editBoundary = factory as unknown as { beginEdit: () => void; endEdit: () => void }
  editBoundary.beginEdit()
  try {
    callback()
  } finally {
    editBoundary.endEdit()
  }
}

export function tickUntil(
  sim: Simulation,
  predicate: () => boolean,
  maxTicks: number,
): void {
  for (let i = 0; i < maxTicks && !predicate(); i++) {
    sim.tick()
  }
  expect(predicate(), `condition was not met within ${maxTicks} ticks`).toBe(true)
}