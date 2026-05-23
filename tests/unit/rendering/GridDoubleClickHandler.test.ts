import { describe, it, expect } from 'vitest'
import { Factory } from '../../../src/game/Factory'
import { GridDoubleClickHandler } from '../../../src/rendering/GridDoubleClickHandler'
import type { GridPosition } from '../../../src/game/types'

function makeHandler(factory: Factory, cell: GridPosition) {
  return new GridDoubleClickHandler({
    factory,
    updateMouseNDC: () => { /* no-op */ },
    raycastToGrid: () => cell,
    selectMachine: () => { /* no-op */ },
    onFactoryChanged: () => { /* no-op */ },
  })
}

describe('GridDoubleClickHandler.placeFabricator default rotation', () => {
  it('places a Fabricator with rotation east (input west, output east) on an empty cell', () => {
    const factory = new Factory(5, 5)
    const cell: GridPosition = { x: 2, z: 2 }
    const handler = makeHandler(factory, cell)

    handler.handle({} as MouseEvent)

    const placed = factory.getMachineAt(cell.x, cell.z)
    expect(placed, 'expected a Fabricator to be placed at (2,2)').not.toBeNull()
    expect(placed!.type).toBe('part_fabricator')
    expect(placed!.rotation).toBe('east')
  })

  it('falls back to south (next CW from east) when east is slot-blocked', () => {
    // Neighbor at (3,2) rotation 'south' has slots (3,3)/(3,1) — neither at
    // (2,2) — so Direction 1 does not fire. Our default 'east' at (2,2)
    // has its front slot at (3,2), pointing at the neighbor → Direction 2
    // rejects 'east'. CW step is 'south', whose slots (2,3)/(2,1) are clear.
    const factory = new Factory(5, 5)
    const blocker = factory.placeMachine(3, 2, 'part_fabricator', 'south')
    expect(blocker, 'blocker setup must succeed').not.toBeNull()
    expect(factory.placeMachine(2, 2, 'part_fabricator', 'east'), 'east must be slot-blocked').toBeNull()

    const cell: GridPosition = { x: 2, z: 2 }
    const handler = makeHandler(factory, cell)

    handler.handle({} as MouseEvent)

    const placed = factory.getMachineAt(cell.x, cell.z)
    expect(placed, 'expected a Fabricator to be placed at (2,2)').not.toBeNull()
    expect(placed!.rotation).toBe('south')
  })
})
