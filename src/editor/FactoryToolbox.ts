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
    )
  }
  categories.push({
    kind: 'category',
    name: i18next.t('blocks.category_actions'),
    colour: '217',
    contents: actionBlocks,
  })

  // --- Loops (level 3+) ---
  if (level >= 3) {
    categories.push({
      kind: 'category',
      name: i18next.t('blocks.category_loops'),
      colour: '120',
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
      colour: '60',
      contents: [
        block('factory_if_quality'),
        block('factory_if_item_type'),
        block('factory_if_else'),
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

  // --- Events (level 7+) ---
  if (level >= 7) {
    categories.push({
      kind: 'category',
      name: i18next.t('blocks.category_events'),
      colour: '50',
      contents: [
        block('factory_on_order_received'),
        block('factory_on_belt_jam'),
        block('factory_on_machine_idle'),
      ],
    })
  }

  return { kind: 'categoryToolbox', contents: categories }
}
