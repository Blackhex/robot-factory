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

    it('should include produce_part and start_machine blocks', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(1))

      // THEN
      expect(types).toContain('factory_produce_part')
      expect(types).toContain('factory_start_machine')
    })

    it('should NOT include loops, conditionals, variables, functions, or events', () => {
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
    it('should include set_recipe, route_to, stop_machine, set_belt_speed', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(2))

      // THEN
      expect(types).toContain('factory_set_recipe')
      expect(types).toContain('factory_route_to')
      expect(types).toContain('factory_stop_machine')
      expect(types).toContain('factory_set_belt_speed')
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

  describe('level 5: variables unlocked', () => {
    it('should include variable blocks', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(5))

      // THEN
      expect(types).toContain('factory_set_variable')
      expect(types).toContain('factory_get_variable')
      expect(types).toContain('factory_change_variable')
    })

    it('should have 4 categories', () => {
      // WHEN
      const toolbox = getToolboxForLevel(5)

      // THEN
      expect(toolbox.contents).toHaveLength(4)
    })
  })

  describe('level 6: functions unlocked', () => {
    it('should include function blocks', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(6))

      // THEN
      expect(types).toContain('factory_define_procedure')
      expect(types).toContain('factory_call_procedure')
    })

    it('should have 5 categories', () => {
      // WHEN
      const toolbox = getToolboxForLevel(6)

      // THEN
      expect(toolbox.contents).toHaveLength(5)
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

    it('should have 6 categories', () => {
      // WHEN
      const toolbox = getToolboxForLevel(7)

      // THEN
      expect(toolbox.contents).toHaveLength(6)
    })
  })

  describe('level 8+: all blocks available', () => {
    it('should include all block types', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(8))

      // THEN
      expect(types).toContain('factory_produce_part')
      expect(types).toContain('factory_start_machine')
      expect(types).toContain('factory_set_recipe')
      expect(types).toContain('factory_repeat_times')
      expect(types).toContain('factory_if_else')
      expect(types).toContain('factory_set_variable')
      expect(types).toContain('factory_define_procedure')
      expect(types).toContain('factory_on_order_received')
    })

    it('should have 6 categories at level 8', () => {
      // WHEN
      const toolbox = getToolboxForLevel(8)

      // THEN
      expect(toolbox.contents).toHaveLength(6)
    })

    it('should have same blocks at level 10 as level 8', () => {
      // WHEN
      const types8 = getBlockTypes(getToolboxForLevel(8))
      const types10 = getBlockTypes(getToolboxForLevel(10))

      // THEN
      expect(types10).toEqual(types8)
    })
  })
})
