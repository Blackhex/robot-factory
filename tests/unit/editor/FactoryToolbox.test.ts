import { describe, it, expect } from 'vitest'
import { getToolboxForLevel } from '../../../src/editor/FactoryToolbox'

// Helper: extract all block types from a toolbox definition
function getBlockTypes(toolbox: ReturnType<typeof getToolboxForLevel>): string[] {
  const types: string[] = []
  for (const category of toolbox.contents) {
    for (const block of category.contents) {
      types.push(block.type)
    }
  }
  return types
}

// Helper: extract category names from a toolbox definition
function _getCategoryNames(toolbox: ReturnType<typeof getToolboxForLevel>): string[] {
  return toolbox.contents.map((c) => c.name)
}
void _getCategoryNames

describe('FactoryToolbox', () => {
  it('should return a categoryToolbox', () => {
    // WHEN
    const toolbox = getToolboxForLevel(1)

    // THEN
    expect(toolbox.kind).toBe('categoryToolbox')
  })

  describe('level 1: basic actions only', () => {
    it('should include only one category', () => {
      // WHEN
      const toolbox = getToolboxForLevel(1)

      // THEN
      expect(toolbox.contents).toHaveLength(1)
    })

    it('should include set_recipe, start_machine, pick_machine blocks', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(1))

      // THEN
      expect(types).toContain('factory_set_recipe')
      expect(types).toContain('factory_start_machine')
      expect(types).toContain('factory_pick_machine')
    })

    it('should NOT include loops, conditionals, custom variables, custom functions, or events', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(1))

      // THEN
      expect(types).not.toContain('factory_repeat_times')
      expect(types).not.toContain('factory_if_quality')
      expect(types).not.toContain('factory_set_variable')
      expect(types).not.toContain('factory_define_procedure')
      expect(types).not.toContain('factory_on_order_received')
    })
  })

  describe('level 2: extended actions', () => {
    it('should include stop_machine and set_belt_speed (route_to has been removed)', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(2))

      // THEN
      expect(types).toContain('factory_stop_machine')
      expect(types).toContain('factory_set_belt_speed')
      // The routeTo block was removed from the codebase.
      expect(types).not.toContain('factory_route_to')
    })
  })

  describe('level 3: loops unlocked', () => {
    it('should include loop blocks', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(3))

      // THEN
      expect(types).toContain('factory_repeat_times')
      expect(types).toContain('factory_while_condition')
    })

    it('should have 2 categories (actions + loops)', () => {
      // WHEN
      const toolbox = getToolboxForLevel(3)

      // THEN
      expect(toolbox.contents).toHaveLength(2)
    })

    it('should NOT include conditionals yet', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(3))

      // THEN
      expect(types).not.toContain('factory_if_quality')
    })
  })

  describe('level 4: conditionals unlocked', () => {
    it('should include conditional blocks', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(4))

      // THEN
      expect(types).toContain('factory_if_quality')
      expect(types).toContain('factory_if_item_type')
      expect(types).toContain('factory_if_else')
    })

    it('should have 3 categories (actions + loops + conditionals)', () => {
      // WHEN
      const toolbox = getToolboxForLevel(4)

      // THEN
      expect(toolbox.contents).toHaveLength(3)
    })
  })

  describe('level 5: variables provided by built-in Blockly category', () => {
    it('should NOT add custom variable blocks (built-in Variables category is used)', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(5))

      // THEN
      expect(types).not.toContain('factory_set_variable')
      expect(types).not.toContain('factory_get_variable')
      expect(types).not.toContain('factory_change_variable')
    })

    it('should still have 3 factory categories at level 5 (actions + loops + conditionals)', () => {
      // WHEN
      const toolbox = getToolboxForLevel(5)

      // THEN
      expect(toolbox.contents).toHaveLength(3)
    })
  })

  describe('level 6: functions provided by built-in Blockly category', () => {
    it('should NOT add custom procedure blocks (built-in Functions category is used)', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(6))

      // THEN
      expect(types).not.toContain('factory_define_procedure')
      expect(types).not.toContain('factory_call_procedure')
    })

    it('should still have 3 factory categories at level 6 (actions + loops + conditionals)', () => {
      // WHEN
      const toolbox = getToolboxForLevel(6)

      // THEN
      expect(toolbox.contents).toHaveLength(3)
    })
  })

  describe('level 7: events unlocked', () => {
    it('should include event blocks', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(7))

      // THEN
      expect(types).toContain('factory_on_order_received')
      expect(types).toContain('factory_on_belt_jam')
      expect(types).toContain('factory_on_machine_idle')
    })

    it('should have 4 categories', () => {
      // WHEN
      const toolbox = getToolboxForLevel(7)

      // THEN
      expect(toolbox.contents).toHaveLength(4)
    })
  })

  describe('level 8+: all blocks available', () => {
    it('should include all factory block types (variables and functions come from built-in categories)', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(8))

      // THEN
      expect(types).toContain('factory_start_machine')
      expect(types).toContain('factory_set_recipe')
      expect(types).toContain('factory_pick_machine')
      expect(types).toContain('factory_repeat_times')
      expect(types).toContain('factory_if_else')
      expect(types).not.toContain('factory_set_variable')
      expect(types).not.toContain('factory_define_procedure')
      expect(types).toContain('factory_on_order_received')
    })

    it('should have 4 categories at level 8', () => {
      // WHEN
      const toolbox = getToolboxForLevel(8)

      // THEN
      expect(toolbox.contents).toHaveLength(4)
    })

    it('should have same blocks at level 10 as level 8', () => {
      // WHEN
      const types8 = getBlockTypes(getToolboxForLevel(8))
      const types10 = getBlockTypes(getToolboxForLevel(10))

      // THEN
      expect(types10).toEqual(types8)
    })
  })

  describe('category colors match game UI palette', () => {
    // Use level 7+ so all factory categories are visible.
    // Categories are in fixed order: Actions(0), Loops(1), Conditionals(2),
    // Events(3). (Variables and Functions come from the built-in Blockly
    // categories which are added separately by PXT.)
    const toolbox = getToolboxForLevel(7)

    it('should have all 4 factory categories at level 7', () => {
      expect(toolbox.contents).toHaveLength(4)
    })

    it('Actions category (index 0) should use machine blue (#4488ff → hue 217)', () => {
      expect(toolbox.contents[0].colour).toBe('217')
    })

    it('Loops category (index 1) should use success green (hue 120)', () => {
      expect(toolbox.contents[1].colour).toBe('120')
    })

    it('Conditionals category (index 2) should use checker yellow (#cccc44 → hue 60)', () => {
      expect(toolbox.contents[2].colour).toBe('60')
    })

    it('Events category (index 3) should use PXT standard yellow (hue 50)', () => {
      // Per .github/skills/pxt-blocks/SKILL.md, the Events category convention is hue 50.
      expect(toolbox.contents[3].colour).toBe('50')
    })
  })
})
