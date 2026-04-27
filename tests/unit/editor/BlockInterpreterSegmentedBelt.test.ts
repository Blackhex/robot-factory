import { describe, it, expect } from 'vitest'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'
import { Simulation } from '../../../src/game/Simulation'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'

/**
 * Integration test that exercises the full path BlockInterpreter →
 * Simulation for SET_BELT_SPEED on a logical belt that is realized in
 * the simulation as multiple per-cell segments.
 *
 * The BlockInterpreter resolves a dropdown belt slot to its LOGICAL id
 * (e.g. `belt_42`). The Simulation, however, registers belts as
 * `${logicalId}_seg${i}` segments (see ConveyorBelt.fromBeltInfo).
 * Therefore the SET_BELT_SPEED handler must propagate speed changes
 * across all matching segments — otherwise setting belt speed silently
 * has no effect on real, multi-cell belts drawn by the player.
 */

describe('BlockInterpreter + Simulation: SET_BELT_SPEED on segmented belts', () => {
  it('emits SET_BELT_SPEED with the logical belt id and applies to all segments', () => {
    // GIVEN — interpreter knows a single dynamic belt at slot 0 with
    // logical id `belt_42`.
    const interpreter = new BlockInterpreter()
    interpreter.setBeltList([{ slotIndex: 0, id: 'belt_42', name: 'My Belt' }])

    // WHEN — the program calls setBeltSpeed using the dropdown slot index
    const commands = interpreter.interpret('belts.setBeltSpeed(0, 4)')

    // THEN — exactly one SET_BELT_SPEED command is produced, carrying
    // the LOGICAL belt id (not a segment id).
    expect(commands).toHaveLength(1)
    expect(commands[0].type).toBe('SET_BELT_SPEED')
    expect((commands[0] as any).beltId).toBe('belt_42')
    expect((commands[0] as any).speed).toBe(4)

    // GIVEN — a Simulation in which `belt_42` is realized as three
    // per-cell segments, exactly as GameManager.populateSimulation does
    // via ConveyorBelt.fromBeltInfo.
    const sim = new Simulation()
    sim.addBelt(new ConveyorBelt('belt_42_seg0', 0, 0, 1, 0, 1.0))
    sim.addBelt(new ConveyorBelt('belt_42_seg1', 1, 0, 2, 0, 1.0))
    sim.addBelt(new ConveyorBelt('belt_42_seg2', 2, 0, 3, 0, 1.0))

    // WHEN — the produced command is executed against the simulation
    sim.executeCommand(commands[0])

    // THEN — every segment of the logical belt has its speed updated
    expect(sim.getBelt('belt_42_seg0')!.speed).toBe(4)
    expect(sim.getBelt('belt_42_seg1')!.speed).toBe(4)
    expect(sim.getBelt('belt_42_seg2')!.speed).toBe(4)
  })
})
