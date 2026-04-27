import { Factory } from '../../../../../src/game/Factory'
import type { BeltInfo } from '../../../../../src/game/types'
import { expectFactoryState } from '../../../helpers/factoryAssert'
import { findBeltByEndpointsAndSlots } from './BeltLookup'

export function restoreSingleLaneWithUnrelatedOverlapFixture(factory: Factory): {
  splitter: ReturnType<Factory['getMachines']>[number]
  assembler: ReturnType<Factory['getMachines']>[number]
  oldLeftBelt: BeltInfo
  unrelatedOverlappingBelt: BeltInfo
} {
  factory.restoreState(
    [
      { x: 1, z: 3, type: 'splitter', rotation: 'east' },
      { x: 7, z: 3, type: 'assembler', rotation: 'east' },
      { x: 3, z: 2, type: 'part_fabricator', rotation: 'south' },
      { x: 3, z: 6, type: 'factory_output', rotation: 'south' },
    ],
    [
      {
        sourceSlot: 'left',
        destinationSlot: 'left',
        path: [
          { x: 1, z: 3 },
          { x: 1, z: 4 },
          { x: 2, z: 4 },
          { x: 3, z: 4 },
          { x: 4, z: 4 },
          { x: 5, z: 4 },
          { x: 6, z: 4 },
          { x: 7, z: 4 },
          { x: 7, z: 3 },
        ],
      },
      {
        sourceSlot: 'front',
        destinationSlot: 'back',
        path: [
          { x: 3, z: 2 },
          { x: 3, z: 3 },
          { x: 3, z: 4 },
          { x: 3, z: 5 },
          { x: 3, z: 6 },
        ],
      },
    ],
  )
  expectFactoryState(factory, {
    grid: {
      box: [0, 2, 8, 6],
      expected: [
        '| | | |F| | | | | |',
        '| |S| |│| | | |A| |',
        '| |└|─|+|─|─|─|┘| |',
        '| | | |│| | | | | |',
        '| | | |O| | | | | |',
      ].join('\n'),
    },
    machines: [
      { x: 1, z: 3, rotation: 'east' },
      { x: 7, z: 3, rotation: 'east' },
      { x: 3, z: 2, rotation: 'south' },
      { x: 3, z: 6, rotation: 'south' },
    ],
    belts: [
      {
        source: { x: 1, z: 3 },
        destination: { x: 7, z: 3 },
        sourceSlot: 'left',
        destinationSlot: 'left',
        path: [
          { x: 1, z: 3 },
          { x: 1, z: 4 },
          { x: 2, z: 4 },
          { x: 3, z: 4 },
          { x: 4, z: 4 },
          { x: 5, z: 4 },
          { x: 6, z: 4 },
          { x: 7, z: 4 },
          { x: 7, z: 3 },
        ],
      },
      {
        source: { x: 3, z: 2 },
        destination: { x: 3, z: 6 },
        sourceSlot: 'front',
        destinationSlot: 'back',
        path: [
          { x: 3, z: 2 },
          { x: 3, z: 3 },
          { x: 3, z: 4 },
          { x: 3, z: 5 },
          { x: 3, z: 6 },
        ],
      },
    ],
  })

  const splitter = factory.getMachineAt(1, 3)!
  const assembler = factory.getMachineAt(7, 3)!
  return {
    splitter,
    assembler,
    oldLeftBelt: findBeltByEndpointsAndSlots(factory, splitter.id, assembler.id, 'left', 'left'),
    unrelatedOverlappingBelt: findBeltByEndpointsAndSlots(
      factory,
      factory.getMachineAt(3, 2)!.id,
      factory.getMachineAt(3, 6)!.id,
      'front',
      'back',
    ),
  }
}

export function expectSingleLaneRemovedWithUnrelatedOverlapState(factory: Factory): void {
  expectFactoryState(factory, {
    grid: {
      box: [0, 2, 8, 6],
      expected: [
        '| | | |F| | | | | |',
        '| |S| |│| | | |A| |',
        '| | | |│| | | | | |',
        '| | | |│| | | | | |',
        '| | | |O| | | | | |',
      ].join('\n'),
    },
    machines: [
      { x: 1, z: 3, rotation: 'east' },
      { x: 7, z: 3, rotation: 'east' },
      { x: 3, z: 2, rotation: 'south' },
      { x: 3, z: 6, rotation: 'south' },
    ],
    belts: [
      {
        source: { x: 3, z: 2 },
        destination: { x: 3, z: 6 },
        sourceSlot: 'front',
        destinationSlot: 'back',
        path: [
          { x: 3, z: 2 },
          { x: 3, z: 3 },
          { x: 3, z: 4 },
          { x: 3, z: 5 },
          { x: 3, z: 6 },
        ],
      },
    ],
  })
}

export function expectSingleLaneExactSlotReplacementState(factory: Factory): void {
  expectFactoryState(factory, {
    grid: {
      box: [0, 2, 8, 7],
      expected: [
        '| | | |F| | | | | |',
        '| |S| |│| | | |A| |',
        '| |└|┐|│| | | |│| |',
        '| | |│|│| | | |│| |',
        '| | |│|O| | | |│| |',
        '| | |└|─|─|─|─|┘| |',
      ].join('\n'),
    },
    machines: [
      { x: 1, z: 3, rotation: 'east' },
      { x: 7, z: 3, rotation: 'east' },
      { x: 3, z: 2, rotation: 'south' },
      { x: 3, z: 6, rotation: 'south' },
    ],
    belts: [
      {
        source: { x: 3, z: 2 },
        destination: { x: 3, z: 6 },
        sourceSlot: 'front',
        destinationSlot: 'back',
        path: [
          { x: 3, z: 2 },
          { x: 3, z: 3 },
          { x: 3, z: 4 },
          { x: 3, z: 5 },
          { x: 3, z: 6 },
        ],
      },
      {
        source: { x: 1, z: 3 },
        destination: { x: 7, z: 3 },
        sourceSlot: 'left',
        destinationSlot: 'left',
        path: [
          { x: 1, z: 3 },
          { x: 1, z: 4 },
          { x: 2, z: 4 },
          { x: 2, z: 5 },
          { x: 2, z: 6 },
          { x: 2, z: 7 },
          { x: 3, z: 7 },
          { x: 4, z: 7 },
          { x: 5, z: 7 },
          { x: 6, z: 7 },
          { x: 7, z: 7 },
          { x: 7, z: 6 },
          { x: 7, z: 5 },
          { x: 7, z: 4 },
          { x: 7, z: 3 },
        ],
      },
    ],
  })
}