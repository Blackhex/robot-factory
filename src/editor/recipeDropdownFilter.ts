import { getAllRecipes } from '../game/Recipe.ts'
import type { MachineType } from '../game/types.ts'
import { RECIPE_TABLE } from './enumTables.ts'

export interface RecipeDropdownEntry {
  readonly enumName: string
  readonly id: string
  readonly machineType: MachineType
  readonly label: string
}

export function filterRecipeOptions(
  origOptions: readonly [string, string][],
  entries: readonly RecipeDropdownEntry[],
  machineType: MachineType | (string & {}) | undefined,
): [string, string][] {
  if (machineType === undefined) return [...origOptions]
  const allowed = new Set(
    entries
      .filter(e => e.machineType === machineType)
      .map(e => `Recipe.${e.enumName}`),
  )
  if (allowed.size === 0) return [...origOptions]
  const filtered = origOptions.filter(([, value]) => allowed.has(value))
  return filtered.length === 0 ? [...origOptions] : filtered
}

export function buildRecipeDropdownEntries(): RecipeDropdownEntry[] {
  const byId = new Map(getAllRecipes().map(r => [r.id, r]))
  const entries: RecipeDropdownEntry[] = []
  for (const { enumName, id } of RECIPE_TABLE) {
    const recipe = byId.get(id)
    if (!recipe) continue
    entries.push({
      enumName,
      id,
      machineType: recipe.machineType,
      label: enumName,
    })
  }
  return entries
}

/**
 * Resolve the recipe dropdown options for a `factory_set_recipe` block by
 * looking up its sibling `machine` field value, mapping it via the iframe's
 * cached machine items/members to a `MachineType`, then filtering the
 * canonical recipe list. Designed to be called from Blockly's patched
 * `FieldDropdown.prototype.getOptions`.
 */
export function resolveRecipeOptionsForBlock(
  block: any,
  iframeWindow: any,
  origOptions: readonly [string, string][],
): [string, string][] {
  const machineType = resolveMachineTypeForBlock(block, iframeWindow)
  return filterRecipeOptions(origOptions, iframeWindow.__rf_recipeEntries ?? [], machineType)
}

/**
 * Compute the MachineType of the machine currently plugged into the
 * `machine` slot of a `factory_set_recipe`-like block, by walking the
 * shadow-reporter value input. Returns undefined if no machine, the
 * slot value is unparseable, or the slot index has no entry in
 * `iframeWindow.__rf_machineItems`.
 */
export function resolveMachineTypeForBlock(
  block: any,
  iframeWindow: any,
): MachineType | undefined {
  let machineValue: unknown = block.getInputTargetBlock?.('machine')?.getField?.('machine')?.getValue?.()
  if (machineValue === undefined || machineValue === null) {
    machineValue = block.getField?.('machine')?.getValue?.()
  }
  const items: Array<{ slotIndex: number; type?: string }> = iframeWindow.__rf_machineItems || []
  const members: string[] = iframeWindow.__rf_machineMembers || []
  if (typeof machineValue === 'string' && machineValue.startsWith('Machine.')) {
    const slotIndex = members.indexOf(machineValue.slice('Machine.'.length))
    if (slotIndex >= 0) return items.find(it => it.slotIndex === slotIndex)?.type as MachineType | undefined
  }
  return undefined
}

export function pickValidRecipeForMachineType(
  currentValue: string | null | undefined,
  entries: readonly RecipeDropdownEntry[],
  machineType: MachineType | (string & {}) | undefined,
): string | null {
  if (machineType === undefined) return currentValue ?? null
  const valid = entries.filter(e => e.machineType === machineType)
  if (valid.length === 0) return currentValue ?? null
  if (currentValue && valid.some(e => `Recipe.${e.enumName}` === currentValue)) return currentValue
  return `Recipe.${valid[0].enumName}`
}
