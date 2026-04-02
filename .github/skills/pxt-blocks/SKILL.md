---
name: pxt-blocks
description: "Use when defining custom PXT blocks, configuring the PXT editor workspace, or writing block-to-command interpreters. Covers block definition patterns, block color conventions, AST walking, interpreter overflow guard, and command queue generation for the Robot Factory game."
---

# PXT Block Definition Patterns

## Block Registration
```typescript
import * as pxt from 'pxt-core'
import i18next from 'i18next'

//% block="set recipe of %machine to %recipe"
//% blockId=factory_set_recipe
//% color=260
//% group="Actions"
export function setRecipe(machine: Machine, recipe: Recipe): void {
  // PXT block definition using annotation-based approach
}

// Alternative registration via PXT block definitions JSON:
const factoryBlocks = {
  factory_set_recipe: {
    message0: i18next.t('blocks.set_recipe') + ' %1 %2',
    args0: [{
      type: 'field_dropdown',
      name: 'MACHINE',
      options: [
        [i18next.t('machines.machine_a'), 'Machine.A'],
        // ...
      ]
    }, {
      type: 'field_dropdown',
      name: 'RECIPE',
      options: [
        [i18next.t('recipes.wheel_press_small'), 'Recipe.WheelPressSmall'],
        // ...
      ]
    }],
    previousStatement: null,
    nextStatement: null,
    colour: 260,
    tooltip: i18next.t('blocks.set_recipe_tooltip')
  }
}
```

## Block Color Convention
| Category | Hue | Example |
|----------|-----|---------|
| Actions | 260 (purple) | set_recipe, start_machine |
| Loops | 120 (green) | repeat_times, while |
| Logic | #cccc44 (PXT LOGIC_HUE, yellow) | if_else, current_item_is |
| Variables | 30 (orange) | set_var, get_var |
| Events | 50 (yellow) | on_order, on_belt_jam |
| Functions | 290 (magenta) | Built-in PXT procedures |

## Interpreter AST Walking
Walk blocks top-to-bottom, recursively entering statement inputs:
```typescript
function interpretBlock(block: pxt.Block): SimulationCommand[] {
  const commands: SimulationCommand[] = []
  switch (block.type) {
    case 'factory_set_recipe':
      commands.push({ type: 'SET_RECIPE', machineId: block.getFieldValue('MACHINE'), recipeId: block.getFieldValue('RECIPE') })
      break
    case 'factory_repeat_times': {
      const count = Number(block.getFieldValue('TIMES'))
      const body = interpretStatementInput(block, 'DO')
      for (let i = 0; i < count && this.opCount < MAX_OPS; i++) {
        commands.push(...body)
        this.opCount += body.length
      }
      break
    }
  }
  // Continue to next block in stack
  const next = block.getNextBlock()
  if (next) commands.push(...interpretBlock(next))
  return commands
}
```

## Infinite Loop Guard
Track operations per interpretation call. Throw if exceeding 10,000:
```typescript
if (this.opCount > 10_000) {
  throw new InterpreterOverflowError(i18next.t('errors.program_too_long'))
}
```
