/**
 * Painter output must NEVER be tagged as an assembly. Even though a
 * Painter recipe has `inputs.length > 0`, its output is a basic part
 * (the same item type, repainted), not a composite. This pins the
 * contract so a future Painter recipe cannot regress to an
 * assembly-typed output via the produceOutput dispatch.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Machine } from '../../../src/game/Machine'
import { ALL_OUTPUTS_CONNECTED_ENV } from '../../../src/game/MachineBehaviors'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import type { Recipe } from '../../../src/game/Recipe'

const noDefectRng = (): number => 0.99

function tickUntilOutput(m: Machine, rng: () => number, maxTicks = 40): void {
  for (let i = 0; i < maxTicks; i++) {
    m.tick(rng, ALL_OUTPUTS_CONNECTED_ENV)
    if (m.outputSlot !== null) return
  }
  throw new Error(`Painter did not produce output within ${maxTicks} ticks`)
}

describe('Painter — output is a basic part, never an assembly', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('emits a plain item with no components after a single cycle', () => {
    const recipe: Recipe = {
      id: 'paint_chassis_light_test',
      inputs: [{ type: 'chassis_light', quantity: 1 }],
      outputs: [{ type: 'chassis_light', quantity: 1 }],
      processingTicks: 3,
      machineType: 'painter',
    }

    const painter = new Machine('painter1', 'painter')
    painter.setRecipe(recipe)
    painter.start()
    painter.addInput(createItem('chassis_light'))

    tickUntilOutput(painter, noDefectRng)
    const out = painter.outputSlot!
    expect(out).not.toBeNull()
    expect(out.type).toBe('chassis_light')
    const componentsEmpty =
      out.components === undefined || out.components.length === 0
    expect(componentsEmpty).toBe(true)
  })
})
