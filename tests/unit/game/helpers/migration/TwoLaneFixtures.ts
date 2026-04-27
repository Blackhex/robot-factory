import { expect } from 'vitest'
import { Factory } from '../../../../../src/game/Factory'
import { expectFactoryState } from '../../../helpers/factoryAssert'
import { findBeltBySlots } from './BeltLookup'

export function expectBlockedTwoLaneSplitterAssemblerInitialState(factory: Factory): void {
  expectFactoryState(factory, {
    grid: {
      box: [0, 2, 8, 4],
      expected: [
        '| |┌|─|─|─|─|─|┐| |',
        '| |S| | |P| | |A| |',
        '| |└|─|─|─|─|─|┘| |',
      ].join('\n'),
    },
    machines: [
      { x: 1, z: 3, rotation: 'east' },
      { x: 4, z: 3, rotation: 'south' },
      { x: 7, z: 3, rotation: 'east' },
    ],
    belts: [
      {
        source: { x: 1, z: 3 },
        destination: { x: 7, z: 3 },
        sourceSlot: 'right',
        destinationSlot: 'right',
        path: [
          { x: 1, z: 3 },
          { x: 1, z: 2 },
          { x: 2, z: 2 },
          { x: 3, z: 2 },
          { x: 4, z: 2 },
          { x: 5, z: 2 },
          { x: 6, z: 2 },
          { x: 7, z: 2 },
          { x: 7, z: 3 },
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
          { x: 3, z: 4 },
          { x: 4, z: 4 },
          { x: 5, z: 4 },
          { x: 6, z: 4 },
          { x: 7, z: 4 },
          { x: 7, z: 3 },
        ],
      },
    ],
  })
}

export function placeBlockedTwoLaneSplitterAssemblerFixture(factory: Factory) {
  const splitter = factory.placeMachine(1, 3, 'splitter', 'east')!
  const blocker = factory.placeMachine(4, 3, 'painter', 'south')!
  const assembler = factory.placeMachine(7, 3, 'assembler', 'east')!
  expect(blocker.type).toBe('painter')
  expect(factory.placeBeltChain(splitter, assembler, 'output', {
    fixedRotations: true,
    sourceSlotPosition: 'right',
    targetSlotPosition: 'right',
  })).toBe(true)
  expect(factory.placeBeltChain(splitter, assembler, 'output', {
    fixedRotations: true,
    sourceSlotPosition: 'left',
    targetSlotPosition: 'left',
  })).toBe(true)
  expectBlockedTwoLaneSplitterAssemblerInitialState(factory)

  return {
    oldRightBelt: findBeltBySlots(factory, 'right', 'right'),
    oldLeftBelt: findBeltBySlots(factory, 'left', 'left'),
  }
}

export function expectBlockedTwoLaneSplitterAssemblerMovedExactSlotState(factory: Factory): void {
  expectFactoryState(factory, {
    grid: {
      box: [0, 2, 8, 4],
      expected: [
        '| |┌|─|─|─|─|┐| | |',
        '| |S| | |P| |A| | |',
        '| | | | | | | | | |',
      ].join('\n'),
    },
    machines: [
      { x: 1, z: 3, rotation: 'east' },
      { x: 4, z: 3, rotation: 'south' },
      { x: 6, z: 3, rotation: 'east' },
    ],
    belts: [
      {
        source: { x: 1, z: 3 },
        destination: { x: 6, z: 3 },
        sourceSlot: 'right',
        destinationSlot: 'right',
        path: [
          { x: 1, z: 3 },
          { x: 1, z: 2 },
          { x: 2, z: 2 },
          { x: 3, z: 2 },
          { x: 4, z: 2 },
          { x: 5, z: 2 },
          { x: 6, z: 2 },
          { x: 6, z: 3 },
        ],
      },
    ],
  })
}