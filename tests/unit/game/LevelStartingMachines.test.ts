import { describe, it, expect, beforeEach } from 'vitest'
import { GameManager } from '../../../src/game/GameManager.ts'
import { getLevelByNumber } from '../../../src/game/Level.ts'

/**
 * Pins the integration contract that `GameManager.startLevel` materialises
 * any `startingMachines` declared on the level definition into the live
 * `Factory` BEFORE the player adds anything.
 *
 * Today level 1 is the only level with a starting machine (the
 * `factory_output` Shipper); these tests fail until the GameManager loop
 * iterates `level.startingMachines` and calls `factory.placeMachine(...)`
 * for each entry.
 */
describe('GameManager: starting machines pre-placement', () => {
  let gm: GameManager

  beforeEach(() => {
    gm = new GameManager()
  })

  it('startLevel("level_1") pre-places exactly one machine on the factory grid', () => {
    // WHEN
    gm.startLevel('level_1')

    // THEN
    expect(gm.factory).not.toBeNull()
    const machines = gm.factory!.getMachines()
    expect(machines.length).toBe(1)
  })

  it('the pre-placed level 1 machine is a factory_output (Shipper)', () => {
    // WHEN
    gm.startLevel('level_1')

    // THEN
    const machines = gm.factory!.getMachines()
    expect(machines.length).toBeGreaterThan(0)
    expect(machines[0].type).toBe('factory_output')
  })

  it('the pre-placed machine matches the level definition (position & rotation)', () => {
    // GIVEN
    const level = getLevelByNumber(1)!
    const expected = level.startingMachines?.[0]

    // WHEN
    gm.startLevel('level_1')

    // THEN
    expect(expected).toBeDefined()
    const machines = gm.factory!.getMachines()
    expect(machines.length).toBe(1)
    const placed = machines[0]
    expect(placed.x).toBe(expected!.x)
    expect(placed.z).toBe(expected!.z)
    expect(placed.type).toBe(expected!.type)
    expect(placed.rotation).toBe(expected!.rotation)
  })

  it('starting machines are placed before the player can interact (no extra machines)', () => {
    // WHEN
    gm.startLevel('level_1')

    // THEN
    // Build phase is the player's edit phase. The pre-placed Shipper should
    // exist immediately upon entering build_phase, with no other machines
    // beyond what the level definition declares.
    expect(gm.getCurrentState()).toBe('build_phase')
    const level = getLevelByNumber(1)!
    const expectedCount = level.startingMachines?.length ?? 0
    expect(gm.factory!.getMachines().length).toBe(expectedCount)
  })

  it('startLevel for a level without startingMachines leaves the factory empty', () => {
    // GIVEN
    const level2 = getLevelByNumber(2)!
    const starting = level2.startingMachines
    const isEmpty = starting === undefined || starting.length === 0
    expect(
      isEmpty,
      'precondition: level 2 must declare no startingMachines',
    ).toBe(true)

    // WHEN
    gm.startLevel('level_2')

    // THEN
    expect(gm.factory).not.toBeNull()
    expect(gm.factory!.getMachines().length).toBe(0)
  })
})
