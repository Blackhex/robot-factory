import { describe, it, expect } from 'vitest'
import { GameManager } from '../../../src/game/GameManager'

describe('GameManager.applyBuildPhaseConfigPreview', () => {
  it('is a no-op when state !== build_phase / sandbox (main_menu)', () => {
    const gm = new GameManager()
    expect(gm.getCurrentState()).toBe('main_menu')
    expect(() =>
      gm.applyBuildPhaseConfigPreview([
        { type: 'SET_RECIPE', machineId: 'm1', recipeId: 'wheel_press_small' },
      ]),
    ).not.toThrow()
    expect(gm.simulation).toBeNull()
  })

  it('is a no-op when simulation is null', () => {
    const gm = new GameManager()
    gm.enterLevelSelect()
    expect(gm.simulation).toBeNull()
    expect(() =>
      gm.applyBuildPhaseConfigPreview([
        { type: 'SET_RECIPE', machineId: 'm1', recipeId: 'wheel_press_small' },
      ]),
    ).not.toThrow()
  })

  it('applies SET_RECIPE during build_phase (sandbox)', () => {
    const gm = new GameManager()
    gm.enterSandbox()
    const info = gm.factory!.placeMachine(2, 2, 'part_fabricator', 'north')!
    gm.populateSimulation()
    gm.applyBuildPhaseConfigPreview([
      { type: 'SET_RECIPE', machineId: info.id, recipeId: 'wheel_press_small' },
    ])
    expect(gm.simulation!.getMachine(info.id)?.currentRecipe?.id).toBe(
      'wheel_press_small',
    )
  })

  it('ignores START_MACHINE — machine.enabled stays false', () => {
    const gm = new GameManager()
    gm.enterSandbox()
    const info = gm.factory!.placeMachine(2, 2, 'part_fabricator', 'north')!
    gm.populateSimulation()
    gm.applyBuildPhaseConfigPreview([
      { type: 'SET_RECIPE', machineId: info.id, recipeId: 'wheel_press_small' },
      { type: 'START_MACHINE', machineId: info.id },
    ])
    expect(gm.simulation!.getMachine(info.id)?.enabled).toBe(false)
  })
})
