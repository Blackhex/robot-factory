import { expect } from 'vitest'
import { Factory } from '../../../../../src/game/Factory'
import type { Direction } from '../../../../../src/game/types'
import { expectFactoryState, type BeltExpectation } from '../../../helpers/factoryAssert'
import { findBeltByEndpointsAndSlots } from './BeltLookup'

export const unrelatedBeltExpectation: BeltExpectation = {
  source: { x: 0, z: 0 },
  destination: { x: 2, z: 0 },
  path: [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 2, z: 0 },
  ],
}

export const threeLaneFrontBeltExpectation: BeltExpectation = {
  source: { x: 1, z: 3 },
  destination: { x: 7, z: 3 },
  sourceSlot: 'front',
  destinationSlot: 'back',
  path: [
    { x: 1, z: 3 },
    { x: 2, z: 3 },
    { x: 3, z: 3 },
    { x: 4, z: 3 },
    { x: 5, z: 3 },
    { x: 6, z: 3 },
    { x: 7, z: 3 },
  ],
}

export const threeLaneRightBeltExpectation: BeltExpectation = {
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
}

export const threeLaneLeftBeltExpectation: BeltExpectation = {
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
}

export function threeLaneSplitterAssemblerMachines(
  includeUnrelatedMachines = false,
): Array<{ x: number; z: number; rotation: Direction }> {
  const machines: Array<{ x: number; z: number; rotation: Direction }> = []
  if (includeUnrelatedMachines) {
    machines.push(
      { x: 0, z: 0, rotation: 'east' },
      { x: 2, z: 0, rotation: 'south' },
    )
  }
  machines.push(
    { x: 1, z: 3, rotation: 'east' },
    { x: 7, z: 3, rotation: 'east' },
  )
  return machines
}

export function expectThreeLaneSplitterAssemblerInitialState(
  factory: Factory,
  includeUnrelatedBelt = false,
): void {
  expectFactoryState(factory, {
    grid: {
      box: includeUnrelatedBelt ? [0, 0, 8, 4] : [0, 2, 8, 4],
      expected: (includeUnrelatedBelt
        ? [
          '|F|─|A| | | | | | |',
          '| | | | | | | | | |',
          '| |┌|─|─|─|─|─|┐| |',
          '| |S|─|─|─|─|─|A| |',
          '| |└|─|─|─|─|─|┘| |',
        ]
        : [
          '| |┌|─|─|─|─|─|┐| |',
          '| |S|─|─|─|─|─|A| |',
          '| |└|─|─|─|─|─|┘| |',
        ]).join('\n'),
    },
    machines: threeLaneSplitterAssemblerMachines(includeUnrelatedBelt),
    belts: [
      ...(includeUnrelatedBelt ? [unrelatedBeltExpectation] : []),
      threeLaneFrontBeltExpectation,
      threeLaneRightBeltExpectation,
      threeLaneLeftBeltExpectation,
    ],
  })
}

export function expectThreeLaneSplitterAssemblerRightOnlyState(
  factory: Factory,
  includeUnrelatedMachines = false,
): void {
  expectFactoryState(factory, {
    grid: {
      box: includeUnrelatedMachines ? [0, 0, 8, 4] : [0, 2, 8, 4],
      expected: (includeUnrelatedMachines
        ? [
          '|F| |A| | | | | | |',
          '| | | | | | | | | |',
          '| |┌|─|─|─|─|─|┐| |',
          '| |S| | | | | |A| |',
          '| | | | | | | | | |',
        ]
        : [
          '| |┌|─|─|─|─|─|┐| |',
          '| |S| | | | | |A| |',
          '| | | | | | | | | |',
        ]).join('\n'),
    },
    machines: threeLaneSplitterAssemblerMachines(includeUnrelatedMachines),
    belts: [threeLaneRightBeltExpectation],
  })
}

export function expectThreeLaneSplitterAssemblerWithoutFrontState(factory: Factory): void {
  expectFactoryState(factory, {
    grid: {
      box: [0, 2, 8, 4],
      expected: [
        '| |┌|─|─|─|─|─|┐| |',
        '| |S| | | | | |A| |',
        '| |└|─|─|─|─|─|┘| |',
      ].join('\n'),
    },
    machines: threeLaneSplitterAssemblerMachines(),
    belts: [threeLaneRightBeltExpectation, threeLaneLeftBeltExpectation],
  })
}

export function expectThreeLaneSplitterAssemblerRestoredLeftState(
  factory: Factory,
  includeUnrelatedMachines = false,
): void {
  expectFactoryState(factory, {
    grid: {
      box: includeUnrelatedMachines ? [0, 0, 8, 4] : [0, 2, 8, 4],
      expected: (includeUnrelatedMachines
        ? [
          '|F| |A| | | | | | |',
          '| | | | | | | | | |',
          '| |┌|─|─|─|─|─|┐| |',
          '| |S| | | | | |A| |',
          '| |└|─|─|─|─|─|┘| |',
        ]
        : [
          '| |┌|─|─|─|─|─|┐| |',
          '| |S| | | | | |A| |',
          '| |└|─|─|─|─|─|┘| |',
        ]).join('\n'),
    },
    machines: threeLaneSplitterAssemblerMachines(includeUnrelatedMachines),
    belts: [threeLaneRightBeltExpectation, threeLaneLeftBeltExpectation],
  })
}

export function placeThreeLaneSplitterAssemblerFixture(
  factory: Factory,
  options: { includeUnrelatedBelt?: boolean } = {},
) {
  const splitter = factory.placeMachine(1, 3, 'splitter', 'east')!
  const assembler = factory.placeMachine(7, 3, 'assembler', 'east')!
  expect(factory.placeBeltChain(splitter, assembler, 'output', {
    fixedRotations: true,
    sourceSlotPosition: 'front',
    targetSlotPosition: 'back',
  })).toBe(true)
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
  expectThreeLaneSplitterAssemblerInitialState(factory, options.includeUnrelatedBelt ?? false)

  return {
    splitter,
    assembler,
    oldFrontBelt: findBeltByEndpointsAndSlots(factory, splitter.id, assembler.id, 'front', 'back'),
    oldRightBelt: findBeltByEndpointsAndSlots(factory, splitter.id, assembler.id, 'right', 'right'),
    oldLeftBelt: findBeltByEndpointsAndSlots(factory, splitter.id, assembler.id, 'left', 'left'),
  }
}