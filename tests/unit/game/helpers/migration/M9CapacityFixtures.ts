import { expect } from 'vitest'
import type { BeltInfo } from '../../../../../src/game/types'
import { expectFactoryState } from '../../../helpers/factoryAssert'
import type { MigrationTestContext } from './MigrationTestContext'
import { attachSimToFactory, populateSim } from './SimulationHarness'
import { injectOrderedInventory, orderedItemIdsOnFactoryBelt } from './InventoryInjection'
import { expectSimBeltsMatchFactory } from './SimulationAssertions'

export function expectLongM9Chain(factory: MigrationTestContext['factory']): void {
  expectFactoryState(factory, {
    grid: {
      box: [0, 1, 7, 4],
      expected: [
        '| | | | | | | | |',
        '|F|─|─|─|─|─|─|┐|',
        '| | | | | | | |│|',
        '| | | | | | | |A|',
      ].join('\n'),
    },
    machines: [
      { x: 0, z: 2, rotation: 'east' },
      { x: 7, z: 4, rotation: 'south' },
    ],
    belts: [
      {
        source: { x: 0, z: 2 },
        destination: { x: 7, z: 4 },
        path: [
          { x: 0, z: 2 },
          { x: 1, z: 2 },
          { x: 2, z: 2 },
          { x: 3, z: 2 },
          { x: 4, z: 2 },
          { x: 5, z: 2 },
          { x: 6, z: 2 },
          { x: 7, z: 2 },
          { x: 7, z: 3 },
          { x: 7, z: 4 },
        ],
      },
    ],
  })
}

export function placeLongM9Chain(context: MigrationTestContext): BeltInfo {
  const { factory } = context
  const fabricator = factory.placeMachine(0, 2, 'part_fabricator', 'south')!
  const assembler = factory.placeMachine(7, 4, 'assembler', 'south')!
  expect(factory.placeBeltChain(fabricator, assembler)).toBe(true)
  expectLongM9Chain(factory)
  return factory.getBelts()[0]
}

export function seedLongM9Chain(
  context: MigrationTestContext,
  oldBelt: BeltInfo,
  seedInventory: () => string[],
): string[] {
  const { factory, sim } = context
  populateSim(factory, sim)
  sim.start()
  const seededIds = seedInventory()
  expect(orderedItemIdsOnFactoryBelt(sim, oldBelt)).toEqual(seededIds)
  attachSimToFactory(factory, sim)
  return seededIds
}

export function seedOrderedLongM9Chain(
  context: MigrationTestContext,
  oldBelt: BeltInfo,
  count: number,
): string[] {
  return seedLongM9Chain(context, oldBelt, () => injectOrderedInventory(context.sim, oldBelt, count))
}

export function moveLongDestinationToNearShortReplacement(context: MigrationTestContext): BeltInfo {
  const { factory, sim } = context
  expect(factory.moveMachine(7, 4, 2, 2)).toBe(true)
  expectFactoryState(factory, {
    grid: {
      box: [0, 1, 7, 4],
      expected: [
        '| |┌|┐| | | | | |',
        '|F|┘|A| | | | | |',
        '| | | | | | | | |',
        '| | | | | | | | |',
      ].join('\n'),
    },
    machines: [
      { x: 0, z: 2, rotation: 'east' },
      { x: 2, z: 2, rotation: 'south' },
    ],
    belts: [
      {
        source: { x: 0, z: 2 },
        destination: { x: 2, z: 2 },
        path: [
          { x: 0, z: 2 },
          { x: 1, z: 2 },
          { x: 1, z: 1 },
          { x: 2, z: 1 },
          { x: 2, z: 2 },
        ],
      },
    ],
  })
  expectSimBeltsMatchFactory(factory, sim)
  return factory.getBelts()[0]
}

export function moveLongDestinationToStraightShortReplacement(context: MigrationTestContext): BeltInfo {
  const { factory, sim } = context
  expect(factory.moveMachine(7, 4, 7, 2)).toBe(true)
  expectFactoryState(factory, {
    grid: {
      box: [0, 1, 7, 4],
      expected: [
        '| |┌|─|─|─|─|─|┐|',
        '|F|┘| | | | | |A|',
        '| | | | | | | | |',
        '| | | | | | | | |',
      ].join('\n'),
    },
    machines: [
      { x: 0, z: 2, rotation: 'east' },
      { x: 7, z: 2, rotation: 'south' },
    ],
    belts: [
      {
        source: { x: 0, z: 2 },
        destination: { x: 7, z: 2 },
        path: [
          { x: 0, z: 2 },
          { x: 1, z: 2 },
          { x: 1, z: 1 },
          { x: 2, z: 1 },
          { x: 3, z: 1 },
          { x: 4, z: 1 },
          { x: 5, z: 1 },
          { x: 6, z: 1 },
          { x: 7, z: 1 },
          { x: 7, z: 2 },
        ],
      },
    ],
  })
  expectSimBeltsMatchFactory(factory, sim)
  return factory.getBelts()[0]
}