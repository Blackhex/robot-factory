/**
 * Contract: when a machine is moved during a running simulation, both
 *   - belt speed (set by the player's `set belt speed` block via SET_BELT_SPEED), and
 *   - machine speed (set by the player's `set machine speed` block via SET_MACHINE_SPEED)
 * must persist for the recomputed belt segments and the moved machine.
 *
 * BUG: `FactorySimulationSync.syncAddedBelt` calls `ConveyorBelt.fromBeltInfo(belt)`
 * with the default speed argument (1.0). After a machine move,
 * `syncRemovedBelt` removes the old per-cell segments and `syncAddedBelt`
 * recreates the new segments at speed 1, dropping whatever speed was applied
 * via SET_BELT_SPEED.
 *
 * Cases A / B / C are RED today — they should fail with `expected 5 to be 1`
 * (or similar) on at least one segment after the move.
 *
 * Cases D / E are regression baselines — they should PASS today and after the fix.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  attachSimToFactory,
  createMigrationTestContext,
  populateSim,
  type MigrationTestContext,
} from './helpers/FactoryItemMigrationHelpers'

describe('FactorySimulationSync — belt and machine speed preservation across machine move', () => {
  let factory: MigrationTestContext['factory']
  let sim: MigrationTestContext['sim']

  beforeEach(() => {
    ;({ factory, sim } = createMigrationTestContext())
  })

  /**
   * Standard 2-machine vertical chain used by every case in this file.
   *
   *   (1,1) assembler-south  → source
   *   (1,3) assembler-south  → destination
   *   belt path: (1,1) → (1,2) → (1,3)  [2 segments]
   *
   * Returns the IDs the player would refer to from blocks.
   */
  function setupTwoAssemblerChain(): {
    sourceMachineId: string
    destMachineId: string
    originalBeltId: string
    originalSegmentCount: number
  } {
    const src = factory.placeMachine(1, 1, 'assembler', 'south')!
    const dst = factory.placeMachine(1, 3, 'assembler', 'south')!
    expect(src, 'precondition: source assembler placed').toBeTruthy()
    expect(dst, 'precondition: destination assembler placed').toBeTruthy()
    expect(factory.placeBeltChain(src, dst), 'precondition: belt chain placed').toBe(true)

    const belts = factory.getBelts()
    expect(belts, 'precondition: exactly one belt placed').toHaveLength(1)
    const belt = belts[0]
    expect(belt.path, 'precondition: 3-cell straight belt path').toEqual([
      { x: 1, z: 1 },
      { x: 1, z: 2 },
      { x: 1, z: 3 },
    ])

    populateSim(factory, sim)
    attachSimToFactory(factory, sim)

    return {
      sourceMachineId: src.id,
      destMachineId: dst.id,
      originalBeltId: belt.id,
      originalSegmentCount: belt.path.length - 1,
    }
  }

  /**
   * Collects the speed of every per-cell segment of the (single) belt
   * currently in the factory, looked up via the sim's segment map.
   * Fails if the sim is missing any segment for the belt.
   */
  function collectCurrentBeltSegmentSpeeds(): {
    beltId: string
    segmentCount: number
    speeds: number[]
  } {
    const belts = factory.getBelts()
    expect(belts, 'expected exactly one factory belt after move').toHaveLength(1)
    const belt = belts[0]
    const speeds: number[] = []
    for (let i = 0; i < belt.path.length - 1; i++) {
      const segId = `${belt.id}_seg${i}`
      const segment = sim.getBelt(segId)
      expect(segment, `sim is missing belt segment "${segId}" after move`).toBeDefined()
      speeds.push(segment!.speed)
    }
    return { beltId: belt.id, segmentCount: speeds.length, speeds }
  }

  it('A. belt speed set via SET_BELT_SPEED is preserved when source machine moves', () => {
    const { originalBeltId, originalSegmentCount } = setupTwoAssemblerChain()

    sim.enqueueCommand({ type: 'SET_BELT_SPEED', beltId: originalBeltId, speed: 5 })
    sim.tick()

    // Pre-move: every segment of the original belt has speed 5.
    for (let i = 0; i < originalSegmentCount; i++) {
      const segId = `${originalBeltId}_seg${i}`
      expect(sim.getBelt(segId)?.speed, `pre-move ${segId} speed`).toBe(5)
    }

    // Move the source machine — triggers syncRemovedBelt → syncAddedBelt.
    expect(factory.moveMachine(1, 1, 3, 0), 'precondition: source move accepted').toBe(true)

    // Post-move: every segment of the recomputed belt must still have speed 5.
    const { speeds } = collectCurrentBeltSegmentSpeeds()
    expect(speeds.length, 'recomputed belt has at least one segment').toBeGreaterThan(0)
    for (let i = 0; i < speeds.length; i++) {
      expect(speeds[i], `post-move segment ${i} speed`).toBe(5)
    }
  })

  it('B. belt speed set via SET_BELT_SPEED is preserved when destination machine moves', () => {
    const { originalBeltId, originalSegmentCount } = setupTwoAssemblerChain()

    sim.enqueueCommand({ type: 'SET_BELT_SPEED', beltId: originalBeltId, speed: 5 })
    sim.tick()

    for (let i = 0; i < originalSegmentCount; i++) {
      const segId = `${originalBeltId}_seg${i}`
      expect(sim.getBelt(segId)?.speed, `pre-move ${segId} speed`).toBe(5)
    }

    // Move the destination machine — also triggers syncRemovedBelt → syncAddedBelt.
    expect(factory.moveMachine(1, 3, 3, 4), 'precondition: destination move accepted').toBe(true)

    const { speeds } = collectCurrentBeltSegmentSpeeds()
    expect(speeds.length, 'recomputed belt has at least one segment').toBeGreaterThan(0)
    for (let i = 0; i < speeds.length; i++) {
      expect(speeds[i], `post-move segment ${i} speed`).toBe(5)
    }
  })

  it('C. belt speed is preserved across multiple machine moves', () => {
    const { originalBeltId, originalSegmentCount } = setupTwoAssemblerChain()

    sim.enqueueCommand({ type: 'SET_BELT_SPEED', beltId: originalBeltId, speed: 5 })
    sim.tick()

    for (let i = 0; i < originalSegmentCount; i++) {
      const segId = `${originalBeltId}_seg${i}`
      expect(sim.getBelt(segId)?.speed, `pre-move ${segId} speed`).toBe(5)
    }

    // First move — source (1,1) → (3,0).
    expect(factory.moveMachine(1, 1, 3, 0), 'precondition: first source move accepted').toBe(true)
    {
      const { speeds } = collectCurrentBeltSegmentSpeeds()
      expect(speeds.length, 'after first move: recomputed belt has at least one segment').toBeGreaterThan(0)
      for (let i = 0; i < speeds.length; i++) {
        expect(speeds[i], `after first move: segment ${i} speed`).toBe(5)
      }
    }

    // Second move — source again, (3,0) → (4,0). Tests that the captured-speed
    // map is not cleared after the first restore.
    expect(factory.moveMachine(3, 0, 4, 0), 'precondition: second source move accepted').toBe(true)
    {
      const { speeds } = collectCurrentBeltSegmentSpeeds()
      expect(speeds.length, 'after second move: recomputed belt has at least one segment').toBeGreaterThan(0)
      for (let i = 0; i < speeds.length; i++) {
        expect(speeds[i], `after second move: segment ${i} speed`).toBe(5)
      }
    }
  })

  it('D. machine speed set via SET_MACHINE_SPEED is preserved when machine moves (regression baseline)', () => {
    const { sourceMachineId } = setupTwoAssemblerChain()

    sim.enqueueCommand({ type: 'SET_MACHINE_SPEED', machineId: sourceMachineId, speed: 5 })
    sim.tick()

    expect(sim.getMachine(sourceMachineId)?.speed, 'pre-move machine speed').toBe(5)

    expect(factory.moveMachine(1, 1, 3, 0), 'precondition: source move accepted').toBe(true)

    // The Machine instance survives the move (only its position is updated
    // via setMachinePosition), so its speed must persist.
    expect(sim.getMachine(sourceMachineId)?.speed, 'post-move machine speed').toBe(5)
  })

  it('E. belt at default speed 1 stays at speed 1 after machine move (regression baseline)', () => {
    setupTwoAssemblerChain()
    // No SET_BELT_SPEED command is ever sent — segments keep the default 1.0.

    expect(factory.moveMachine(1, 1, 3, 0), 'precondition: source move accepted').toBe(true)

    const { speeds } = collectCurrentBeltSegmentSpeeds()
    expect(speeds.length, 'recomputed belt has at least one segment').toBeGreaterThan(0)
    for (let i = 0; i < speeds.length; i++) {
      expect(speeds[i], `post-move segment ${i} speed must remain default 1`).toBe(1)
    }
  })
})
