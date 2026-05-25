import { pickValidRecipeForMachineType, resolveMachineTypeForBlock } from './recipeDropdownFilter'

/**
 * Install a one-shot Blockly workspace change listener that auto-resets
 * the `recipe` field of every `factory_set_recipe` block whenever its
 * connected machine slot changes to a type that does not allow the
 * currently-selected recipe.
 */
export function installRecipeAutoResetListener(blockly: any, workspace: any, iframeWindow: any): void {
  const Events = blockly.Events
  if (!Events || typeof workspace.addChangeListener !== 'function') return

  const isRelevantEvent = (ev: any): boolean => {
    if (!ev) return false
    if (ev.type === Events.BLOCK_CHANGE && ev.element === 'field' && ev.name === 'machine') return true
    if (ev.type === Events.BLOCK_MOVE) return true
    if (ev.type === Events.BLOCK_CREATE) return true
    return false
  }

  workspace.addChangeListener((ev: any) => {
    if (!isRelevantEvent(ev)) return
    const blocks: any[] = workspace.getBlocksByType?.('factory_set_recipe', false) ?? []
    if (blocks.length === 0) return
    const entries = iframeWindow.__rf_recipeEntries ?? []
    for (const block of blocks) {
      const machineType = resolveMachineTypeForBlock(block, iframeWindow)
      const field = block.getField?.('recipe')
      if (!field) continue
      const currentValue: string | null = field.getValue?.() ?? null
      const next = pickValidRecipeForMachineType(currentValue, entries, machineType)
      if (next !== null && next !== currentValue) field.setValue(next)
    }
  })
}
