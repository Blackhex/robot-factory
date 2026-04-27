import { Factory } from '../../../../../src/game/Factory'
import type { BeltInfo } from '../../../../../src/game/types'
import { expectFactoryState } from '../../../helpers/factoryAssert'
import { findBeltBySlots } from './BeltLookup'

export function restoreEmptySiblingSplitterOutputFixture(factory: Factory): {
  emptySiblingLane: BeltInfo
  nonmatchingLane: BeltInfo
} {
  factory.restoreState(
    [
      { x: 2, z: 3, type: 'splitter', rotation: 'south' },
      { x: 7, z: 3, type: 'factory_output', rotation: 'south' },
    ],
    [
      {
        sourceSlot: 'right',
        destinationSlot: 'left',
        path: [
          { x: 2, z: 3 },
          { x: 3, z: 3 },
          { x: 4, z: 3 },
          { x: 5, z: 3 },
          { x: 6, z: 3 },
          { x: 7, z: 3 },
        ],
      },
      {
        sourceSlot: 'left',
        destinationSlot: 'right',
        path: [
          { x: 2, z: 3 },
          { x: 1, z: 3 },
          { x: 1, z: 4 },
          { x: 2, z: 4 },
          { x: 3, z: 4 },
          { x: 4, z: 4 },
          { x: 5, z: 4 },
          { x: 6, z: 4 },
          { x: 7, z: 4 },
          { x: 8, z: 4 },
          { x: 8, z: 3 },
          { x: 7, z: 3 },
        ],
      },
    ],
  )
  expectFactoryState(factory, {
    grid: {
      box: [0, 2, 9, 5],
      expected: [
        '| | | | | | | | | | |',
        '| |┌|S|─|─|─|─|O|┐| |',
        '| |└|─|─|─|─|─|─|┘| |',
        '| | | | | | | | | | |',
      ].join('\n'),
    },
    machines: [
      { x: 2, z: 3, rotation: 'south' },
      { x: 7, z: 3, rotation: 'south' },
    ],
    belts: [
      {
        source: { x: 2, z: 3 },
        destination: { x: 7, z: 3 },
        sourceSlot: 'right',
        destinationSlot: 'left',
        path: [
          { x: 2, z: 3 },
          { x: 3, z: 3 },
          { x: 4, z: 3 },
          { x: 5, z: 3 },
          { x: 6, z: 3 },
          { x: 7, z: 3 },
        ],
      },
      {
        source: { x: 2, z: 3 },
        destination: { x: 7, z: 3 },
        sourceSlot: 'left',
        destinationSlot: 'right',
        path: [
          { x: 2, z: 3 },
          { x: 1, z: 3 },
          { x: 1, z: 4 },
          { x: 2, z: 4 },
          { x: 3, z: 4 },
          { x: 4, z: 4 },
          { x: 5, z: 4 },
          { x: 6, z: 4 },
          { x: 7, z: 4 },
          { x: 8, z: 4 },
          { x: 8, z: 3 },
          { x: 7, z: 3 },
        ],
      },
    ],
  })

  return {
    emptySiblingLane: findBeltBySlots(factory, 'right', 'left'),
    nonmatchingLane: findBeltBySlots(factory, 'left', 'right'),
  }
}