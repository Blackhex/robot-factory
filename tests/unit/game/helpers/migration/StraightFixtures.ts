import { expect } from 'vitest'
import { Factory } from '../../../../../src/game/Factory'
import type { BeltInfo } from '../../../../../src/game/types'
import { renderGrid } from '../../../helpers/factoryAssert'

export function place4CellStraight(factory: Factory): BeltInfo {
  const f = factory.placeMachine(0, 0, 'part_fabricator', 'south')!
  const a = factory.placeMachine(3, 0, 'assembler', 'south')!
  const ok = factory.placeBeltChain(f, a)
  expect(ok, 'precondition: 4-cell straight chain placed').toBeTruthy()
  expect(renderGrid(factory, 0, 0, 4, 1)).toBe(
    [
      '|F|─|─|A| |',
      '| | | | | |',
    ].join('\n'),
  )
  const belts = factory.getBelts()
  expect(belts).toHaveLength(1)
  expect(belts[0].path).toEqual([
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 2, z: 0 },
    { x: 3, z: 0 },
  ])
  return belts[0]
}

export function place6CellStraight(factory: Factory): BeltInfo {
  const f = factory.placeMachine(0, 0, 'part_fabricator', 'south')!
  const a = factory.placeMachine(5, 0, 'assembler', 'south')!
  const ok = factory.placeBeltChain(f, a)
  expect(ok, 'precondition: 6-cell straight chain placed').toBeTruthy()
  expect(renderGrid(factory, 0, 0, 6, 1)).toBe(
    [
      '|F|─|─|─|─|A| |',
      '| | | | | | | |',
    ].join('\n'),
  )
  const belts = factory.getBelts()
  expect(belts).toHaveLength(1)
  expect(belts[0].path).toEqual([
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 2, z: 0 },
    { x: 3, z: 0 },
    { x: 4, z: 0 },
    { x: 5, z: 0 },
  ])
  return belts[0]
}