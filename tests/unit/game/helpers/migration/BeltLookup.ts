import { expect } from 'vitest'
import { Factory } from '../../../../../src/game/Factory'
import type { BeltInfo } from '../../../../../src/game/types'

export function findBeltBySlots(
  factory: Factory,
  sourceSlot: BeltInfo['sourceSlot'],
  destinationSlot: BeltInfo['destinationSlot'],
): BeltInfo {
  const belt = factory.getBelts().find((candidate) =>
    candidate.sourceSlot === sourceSlot && candidate.destinationSlot === destinationSlot,
  )
  expect(belt, `expected belt using ${sourceSlot} -> ${destinationSlot} slots`).toBeDefined()
  return belt!
}

export function findBeltByEndpointsAndSlots(
  factory: Factory,
  sourceMachineId: string,
  destinationMachineId: string,
  sourceSlot: BeltInfo['sourceSlot'],
  destinationSlot: BeltInfo['destinationSlot'],
): BeltInfo {
  const belt = factory.getBelts().find((candidate) =>
    candidate.sourceMachine.id === sourceMachineId &&
    candidate.destinationMachine.id === destinationMachineId &&
    candidate.sourceSlot === sourceSlot &&
    candidate.destinationSlot === destinationSlot,
  )
  expect(
    belt,
    `expected belt ${sourceMachineId} -> ${destinationMachineId} using ${sourceSlot} -> ${destinationSlot} slots`,
  ).toBeDefined()
  return belt!
}

export function beltTupleSummaries(factory: Factory) {
  return factory.getBelts().map((belt) => ({
    sourceMachineId: belt.sourceMachine.id,
    destinationMachineId: belt.destinationMachine.id,
    source: { x: belt.sourceMachine.x, z: belt.sourceMachine.z },
    destination: { x: belt.destinationMachine.x, z: belt.destinationMachine.z },
    sourceSlot: belt.sourceSlot,
    destinationSlot: belt.destinationSlot,
    path: belt.path,
  })).sort((left, right) =>
    `${left.sourceSlot}:${left.destinationSlot}`.localeCompare(`${right.sourceSlot}:${right.destinationSlot}`),
  )
}