import { describe, it, expect } from 'vitest'
import { getRecipeById, getRecipesForMachineType, getAllRecipes } from '../../../src/game/Recipe'

describe('Recipe', () => {
  it('should look up recipe by ID', () => {
    // WHEN
    const recipe = getRecipeById('wheel_press_small')

    // THEN
    expect(recipe).toBeDefined()
    expect(recipe!.id).toBe('wheel_press_small')
    expect(recipe!.machineType).toBe('part_fabricator')
  })

  it('should return undefined for unknown ID', () => {
    // WHEN / THEN
    expect(getRecipeById('nonexistent')).toBeUndefined()
  })

  it('should look up recipes by machine type', () => {
    // WHEN
    const fabricatorRecipes = getRecipesForMachineType('part_fabricator')

    // THEN
    expect(fabricatorRecipes.length).toBeGreaterThan(0)
    for (const r of fabricatorRecipes) {
      expect(r.machineType).toBe('part_fabricator')
    }
  })

  it('should have assembler recipes requiring multiple inputs', () => {
    // WHEN
    const assemblerRecipes = getRecipesForMachineType('assembler')

    // THEN
    expect(assemblerRecipes.length).toBeGreaterThan(0)
    for (const r of assemblerRecipes) {
      expect(r.inputs.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('should have positive processingTicks for all recipes', () => {
    // WHEN / THEN
    for (const r of getAllRecipes()) {
      expect(r.processingTicks, `${r.id} has non-positive ticks`).toBeGreaterThan(0)
    }
  })

  it('should have at least one output for every recipe', () => {
    // WHEN / THEN
    for (const r of getAllRecipes()) {
      expect(r.outputs.length, `${r.id} has no outputs`).toBeGreaterThanOrEqual(1)
    }
  })

  it('should have part_fabricator recipes with no inputs', () => {
    // WHEN
    const fabricatorRecipes = getRecipesForMachineType('part_fabricator')

    // THEN
    for (const r of fabricatorRecipes) {
      expect(r.inputs, `${r.id} should have no inputs`).toHaveLength(0)
    }
  })
})
