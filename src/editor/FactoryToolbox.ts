import { i18next } from '../i18n/i18n'

interface BlockReference {
  kind: 'block'
  type: string
}

interface ToolboxCategory {
  kind: 'category'
  name: string
  colour: string
  contents: BlockReference[]
}

interface ToolboxDefinition {
  kind: 'categoryToolbox'
  contents: ToolboxCategory[]
}

function block(type: string): BlockReference {
  return { kind: 'block', type }
}

const CATEGORY_COLOURS = {
  actions: '217',      // machine blue (#4488ff)
  loops: '120',        // success green
  conditionals: '#cccc44', // PXT LOGIC_HUE — matches built-in if/else, comparison, boolean blocks
  events: '50',        // PXT standard yellow
} as const

export function getToolboxForLevel(level: number): ToolboxDefinition {
  const categories: ToolboxCategory[] = []

  // --- Actions (level 1+) ---
  const actionBlocks: BlockReference[] = [
    block('factory_set_recipe'),
    block('factory_start_machine'),
    block('factory_pick_machine'),
  ]
  if (level >= 2) {
    actionBlocks.push(
      block('factory_stop_machine'),
      block('factory_set_machine_speed'),
      block('factory_set_belt_speed'),
      block('factory_pick_belt'),
    )
  }
  if (level >= 4) {
    actionBlocks.push(block('factory_route_items_to'))
    actionBlocks.push(block('factory_route_current_item_to'))
  }
  categories.push({
    kind: 'category',
    name: i18next.t('blocks.category_actions'),
    colour: CATEGORY_COLOURS.actions,
    contents: actionBlocks,
  })

  // --- Loops (level 3+) ---
  if (level >= 3) {
    categories.push({
      kind: 'category',
      name: i18next.t('blocks.category_loops'),
      colour: CATEGORY_COLOURS.loops,
      contents: [
        block('factory_repeat_times'),
        block('factory_wait'),
        block('factory_wait_ticks'),
        block('factory_while_condition'),
      ],
    })
  }

  // --- Conditionals (level 4+) ---
  if (level >= 4) {
    categories.push({
      kind: 'category',
      name: i18next.t('blocks.category_conditionals'),
      colour: CATEGORY_COLOURS.conditionals,
      contents: [
        block('factory_if_else'),
        block('factory_current_item_defective'),
        block('factory_current_item_is'),
      ],
    })
  }

  // --- Variables (level 5+) ---
  // Variables are provided by the built-in Blockly Variables category;
  // no custom blocks are added here. The level threshold is preserved
  // so call-sites that gate on `level >= 5` semantics keep working.

  // --- Functions (level 6+) ---
  // Functions are provided by the built-in Blockly Functions category;
  // no custom blocks are added here. The level threshold is preserved
  // so call-sites that gate on `level >= 6` semantics keep working.

  // --- Events (level 4+ for on-item-arrives, level 7+ for the rest) ---
  const eventBlocks: BlockReference[] = []
  if (level >= 4) {
    eventBlocks.push(block('factory_on_item_arrives'))
  }
  if (level >= 7) {
    eventBlocks.push(
      block('factory_on_order_received'),
      block('factory_on_belt_jam'),
      block('factory_on_machine_idle'),
    )
  }
  if (eventBlocks.length > 0) {
    categories.push({
      kind: 'category',
      name: i18next.t('blocks.category_events'),
      colour: CATEGORY_COLOURS.events,
      contents: eventBlocks,
    })
  }

  return { kind: 'categoryToolbox', contents: categories }
}
