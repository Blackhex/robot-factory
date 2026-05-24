import { describe, it, expect } from 'vitest'
import { GameManager } from '../../../src/game/GameManager'

/**
 * Pins idempotence of `GameManager.populateSimulation()`.
 *
 * Context: sandbox load path (`setupLevelRendering` in `src/main.ts`) needs to
 * call `populateSimulation()` after `autoRestoreFactory()` so that the
 * simulation is populated from the restored save. That is only safe if the
 * method is idempotent — i.e. calling it again on an already-populated
 * simulation does not duplicate state, throw, or wipe per-machine state such
 * as `currentRecipe`.
 *
 * Today, `populateSimulation()` always constructs `new Machine(info.id, ...)`
 * for every factory machine and re-attaches the factory→sim sync. Re-calling
 * it therefore (a) throws away `currentRecipe` and (b) may double-wire the
 * sync. These tests pin the post-fix behavior.
 */
describe('GameManager.populateSimulation — idempotence', () => {
  it('is a no-op on second call with no factory changes (same machine ids, same belt count)', () => {
    const gm = new GameManager()
    gm.enterSandbox()
    const a = gm.factory!.placeMachine(2, 2, 'part_fabricator', 'north')!
    const b = gm.factory!.placeMachine(5, 5, 'part_fabricator', 'north')!

    gm.populateSimulation()
    const sim = gm.simulation!
    const firstIds = [...sim.getMachines().keys()].sort()
    const firstBeltCount = sim.getBelts().size

    expect(firstIds).toEqual([a.id, b.id].sort())

    gm.populateSimulation()
    const secondIds = [...sim.getMachines().keys()].sort()

    expect(secondIds).toEqual(firstIds)
    expect(sim.getMachines().size).toBe(2)
    expect(new Set(secondIds).size).toBe(secondIds.length) // no duplicate ids
    expect(sim.getBelts().size).toBe(firstBeltCount)
  })

  it('after a new machine is placed, adds the new machine without duplicating existing ones', () => {
    const gm = new GameManager()
    gm.enterSandbox()
    const a = gm.factory!.placeMachine(2, 2, 'part_fabricator', 'north')!
    const b = gm.factory!.placeMachine(5, 5, 'part_fabricator', 'north')!
    gm.populateSimulation()

    const c = gm.factory!.placeMachine(8, 8, 'part_fabricator', 'north')!

    gm.populateSimulation()
    const sim = gm.simulation!
    const ids = [...sim.getMachines().keys()].sort()

    expect(ids).toEqual([a.id, b.id, c.id].sort())
    expect(sim.getMachines().size).toBe(3)
  })

  it('preserves currentRecipe on existing machines across re-population', () => {
    const gm = new GameManager()
    gm.enterSandbox()
    const info = gm.factory!.placeMachine(2, 2, 'part_fabricator', 'north')!

    gm.populateSimulation()
    gm.applyBuildPhaseConfigPreview([
      { type: 'SET_RECIPE', machineId: info.id, recipeId: 'wheel_press_small' },
    ])
    const sim = gm.simulation!
    expect(sim.getMachine(info.id)?.currentRecipe?.id).toBe('wheel_press_small')

    gm.populateSimulation()

    expect(
      sim.getMachine(info.id)?.currentRecipe?.id,
      'currentRecipe must survive re-population — populateSimulation must skip already-present machines instead of replacing them with a fresh Machine instance',
    ).toBe('wheel_press_small')
  })

  it('handles belts idempotently — belt count unchanged on second call', () => {
    const gm = new GameManager()
    gm.enterSandbox()
    gm.factory!.placeMachine(2, 2, 'part_fabricator', 'south')
    gm.factory!.placeMachine(2, 4, 'part_fabricator', 'south')
    const src = gm.factory!.getMachineAt(2, 2)!
    const dst = gm.factory!.getMachineAt(2, 4)!
    const placed = gm.factory!.placeBelt(src, { x: 0, z: 1 }, dst, { x: 0, z: -1 })
    expect(placed).toBe(true)

    gm.populateSimulation()
    const sim = gm.simulation!
    const firstBeltCount = sim.getBelts().size
    expect(firstBeltCount).toBeGreaterThan(0)

    expect(() => gm.populateSimulation()).not.toThrow()

    expect(sim.getBelts().size).toBe(firstBeltCount)
  })

  it('drops machines that no longer exist in the factory', () => {
    const gm = new GameManager()
    gm.enterSandbox()
    const a = gm.factory!.placeMachine(2, 2, 'part_fabricator', 'north')!
    const b = gm.factory!.placeMachine(5, 5, 'part_fabricator', 'north')!

    gm.populateSimulation()
    const sim = gm.simulation!
    expect(sim.getMachines().size).toBe(2)

    const removed = gm.factory!.removeMachine(2, 2)
    expect(removed).toBe(true)

    gm.populateSimulation()

    const ids = [...sim.getMachines().keys()]
    expect(
      ids,
      'machines removed from the factory must not linger in the simulation after re-population',
    ).toEqual([b.id])
    expect(ids).not.toContain(a.id)
  })
})
