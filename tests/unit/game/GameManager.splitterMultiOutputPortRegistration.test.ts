/**
 * RED — `GameManager.populateSimulation()` must register each splitter
 * output belt against the simulation output port that corresponds to
 * its `sourceSlot` (front → primary, right → secondary, left → tertiary).
 *
 * Today the loop in `GameManager.populateSimulation()` calls
 *
 *   simulation.setMachineOutputBelt(info.sourceMachine.id, segId)
 *
 * with no `port` argument, so every belt ends up on the `primary` port.
 * For a splitter with three output belts this means the secondary and
 * tertiary ports are empty and per-side routing (e.g. forward / right /
 * left via `ROUTE_CURRENT_ITEM_TO`) cannot reach the correct physical
 * belt.
 *
 * These tests MUST FAIL on `main`. The fix (GREEN) is to pass the
 * port — derived from `belt.sourceSlot` for splitters via the shared
 * `derivePortFromBeltSource` helper in `src/game/SplitterPortRouting.ts`.
 *
 * Layout (north-rotated splitter at (5, 5), input-observer slot
 * convention from {@link src/game/SlotUtils.ts}):
 *
 *   - 'front' source slot → physical offset {0, -1} → cell (5, 4)
 *   - 'right' source slot → physical offset {+1, 0} → cell (6, 5)
 *   - 'left'  source slot → physical offset {-1, 0} → cell (4, 5)
 *
 * Three part_fabricator destinations sit one cell beyond each output
 * slot with their 'back' input facing the splitter so the belt path
 * is exactly two cells long for each side.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { GameManager } from '../../../src/game/GameManager.ts'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt.ts'
import type { MachineOutputPort } from '../../../src/game/types.ts'

type OutputBeltsMap = Record<MachineOutputPort, Map<string, string>>

function readOutputBelts(gm: GameManager): OutputBeltsMap {
  const sim = gm.simulation
  if (!sim) throw new Error('simulation not initialised')
  return (sim as unknown as { outputBelts: OutputBeltsMap }).outputBelts
}

describe('GameManager.populateSimulation() — splitter multi-output port registration', () => {
  let gm: GameManager

  beforeEach(() => {
    gm = new GameManager()
  })

  it('registers front/right/left belts on primary/secondary/tertiary ports respectively', () => {
    // GIVEN: a sandbox factory with a north-rotated splitter and three
    // part_fabricator destinations, one on each splitter output side.
    gm.enterSandbox()
    const factory = gm.factory!

    const splitter = factory.placeMachine(5, 5, 'splitter', 'north')!
    const frontDest = factory.placeMachine(5, 2, 'part_fabricator', 'north')!
    const rightDest = factory.placeMachine(8, 5, 'part_fabricator', 'east')!
    const leftDest = factory.placeMachine(2, 5, 'part_fabricator', 'west')!

    // Splitter source slots → physical offsets (north rotation, input-observer):
    //   front: {0, -1}   right: {+1, 0}   left: {-1, 0}
    // Each destination is a part_fabricator (input='back') oriented so
    // its back-slot cell touches the splitter's source slot cell.
    const frontPlaced = factory.placeBelt(
      splitter, { x: 0, z: -1 }, frontDest, { x: 0, z: +1 },
    )
    const rightPlaced = factory.placeBelt(
      splitter, { x: +1, z: 0 }, rightDest, { x: -1, z: 0 },
    )
    const leftPlaced = factory.placeBelt(
      splitter, { x: -1, z: 0 }, leftDest, { x: +1, z: 0 },
    )
    expect(frontPlaced, 'front belt failed to place').toBe(true)
    expect(rightPlaced, 'right belt failed to place').toBe(true)
    expect(leftPlaced, 'left belt failed to place').toBe(true)

    const belts = factory.getBelts()
    const frontBelt = belts.find((b) => b.sourceSlot === 'front')!
    const rightBelt = belts.find((b) => b.sourceSlot === 'right')!
    const leftBelt = belts.find((b) => b.sourceSlot === 'left')!
    expect(frontBelt, 'front-sourced belt not found in factory').toBeDefined()
    expect(rightBelt, 'right-sourced belt not found in factory').toBeDefined()
    expect(leftBelt, 'left-sourced belt not found in factory').toBeDefined()

    const frontSeg0 = ConveyorBelt.segmentIdFor(frontBelt.id, 0)
    const rightSeg0 = ConveyorBelt.segmentIdFor(rightBelt.id, 0)
    const leftSeg0 = ConveyorBelt.segmentIdFor(leftBelt.id, 0)

    // WHEN: hydration via the exact public entry the app uses on load.
    gm.populateSimulation()

    // THEN: each port holds the seg-0 id of the belt for its side.
    const outputBelts = readOutputBelts(gm)
    expect(outputBelts.primary.get(splitter.id)).toBe(frontSeg0)
    expect(outputBelts.secondary.get(splitter.id)).toBe(rightSeg0)
    expect(outputBelts.tertiary.get(splitter.id)).toBe(leftSeg0)
  })

  it('registers front belt on primary and left belt on tertiary when only two outputs exist (Assembly.json minimal repro)', () => {
    // GIVEN: same north-rotated splitter, but ONLY a front + left belt.
    // This is the minimal shape of the user-reported scenario from
    // projects/Assembly.json — without the right belt, the bug parks
    // the left belt on the (already-taken-or-empty) primary port.
    gm.enterSandbox()
    const factory = gm.factory!

    const splitter = factory.placeMachine(5, 5, 'splitter', 'north')!
    const frontDest = factory.placeMachine(5, 2, 'part_fabricator', 'north')!
    const leftDest = factory.placeMachine(2, 5, 'part_fabricator', 'west')!

    const frontPlaced = factory.placeBelt(
      splitter, { x: 0, z: -1 }, frontDest, { x: 0, z: +1 },
    )
    const leftPlaced = factory.placeBelt(
      splitter, { x: -1, z: 0 }, leftDest, { x: +1, z: 0 },
    )
    expect(frontPlaced, 'front belt failed to place').toBe(true)
    expect(leftPlaced, 'left belt failed to place').toBe(true)

    const belts = factory.getBelts()
    const frontBelt = belts.find((b) => b.sourceSlot === 'front')!
    const leftBelt = belts.find((b) => b.sourceSlot === 'left')!
    const frontSeg0 = ConveyorBelt.segmentIdFor(frontBelt.id, 0)
    const leftSeg0 = ConveyorBelt.segmentIdFor(leftBelt.id, 0)

    // WHEN
    gm.populateSimulation()

    // THEN: front → primary, left → tertiary, secondary stays empty.
    const outputBelts = readOutputBelts(gm)
    expect(outputBelts.primary.get(splitter.id)).toBe(frontSeg0)
    expect(outputBelts.tertiary.get(splitter.id)).toBe(leftSeg0)
    expect(outputBelts.secondary.get(splitter.id)).toBe(undefined)
  })
})
