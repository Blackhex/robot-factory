/**
 * Pure helpers for building Blockly dropdown options and resolving
 * display text for machine/belt fields used by Robot Factory blocks.
 */

export type DropdownKind = 'machine' | 'belt' | 'recipe'

export interface DropdownItem {
  slotIndex: number
  id: string
  name?: string
  label?: string
}

function enumNameFor(kind: DropdownKind): string {
  if (kind === 'machine') return 'Machine'
  if (kind === 'belt') return 'Belt'
  return 'Recipe'
}

/**
 * True if `value` is a well-formed `Recipe.<member>` enum string. Unlike
 * machine/belt enums, recipes are not slot-indexed: any `Recipe.X`
 * literal is accepted regardless of which member `X` names. This is
 * intentional — recipe membership is validated at simulation time.
 */
export function isRecipeEnumValue(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('Recipe.')
}

/**
 * Build Blockly dropdown options [label, value][] for machine/belt fields.
 * - When `items` is empty, returns a single placeholder option using the first
 *   enum member as its value and `emptyLabel` as its display text. Blockly
 *   requires at least one option.
 * - When `items` is non-empty, returns one option per item, in slot order,
 *   skipping any enum slot with no item. Display text precedence per item:
 *   `name` ?? `label` ?? `id`.
 */
export function buildDropdownOptions(
  kind: DropdownKind,
  items: readonly DropdownItem[],
  enumMembers: readonly string[],
  emptyLabel: string,
): [string, string][] {
  const enumName = enumNameFor(kind)

  if (items.length === 0) {
    return [[emptyLabel, `${enumName}.${enumMembers[0]}`]]
  }

  const options: [string, string][] = []
  for (let i = 0; i < enumMembers.length; i++) {
    const item = items.find((it) => it.slotIndex === i)
    if (!item) continue
    const text = item.name ?? item.label ?? item.id
    options.push([text, `${enumName}.${enumMembers[i]}`])
  }
  return options
}

/**
 * True if `value` is a valid enum value for the given `kind` — i.e. it's
 * `Machine.<member>` / `Belt.<member>` and `<member>` appears in
 * `enumMembers`. Used to suppress Blockly "unavailable option" warnings
 * when loading saved programs whose machine/belt refs point at slots not
 * currently placed in the factory.
 */
export function isValidEnumValue(
  kind: DropdownKind,
  value: unknown,
  enumMembers: readonly string[],
): boolean {
  if (typeof value !== 'string') return false
  const prefix = `${enumNameFor(kind)}.`
  if (!value.startsWith(prefix)) return false
  return enumMembers.includes(value.slice(prefix.length))
}

/**
 * Monkey-patch `Blockly.FieldDropdown.prototype.doClassValidation_` so
 * machine/belt fields accept any enum value (even ones whose slot is not
 * currently placed) without logging Blockly's "unavailable option"
 * warning. Other fields fall through to the original validator unchanged.
 */
export function patchFieldDropdownClassValidation(
  blockly: any,
  iframeWindow: any,
  machineBlockTypes: readonly string[],
  beltBlockTypes: readonly string[],
  recipeBlockTypes: readonly string[],
): void {
  const orig = blockly.FieldDropdown.prototype.doClassValidation_
  blockly.FieldDropdown.prototype.doClassValidation_ = function(this: any, v: any) {
    const b = this.sourceBlock_, f = this.name
    if (b && f === 'machine' && machineBlockTypes.includes(b.type)
        && isValidEnumValue('machine', v, iframeWindow.__rf_machineMembers || [])) return v
    if (b && f === 'belt' && beltBlockTypes.includes(b.type)
        && isValidEnumValue('belt', v, iframeWindow.__rf_beltMembers || [])) return v
    if (b && f === 'recipe' && recipeBlockTypes.includes(b.type)
        && isRecipeEnumValue(v)) return v
    return orig.call(this, v)
  }
}

/**
 * Resolve dropdown display text for a machine/belt field's current value.
 * - If `labelMap` is empty (no machines/belts at all), returns `emptyLabel`
 *   regardless of `value`.
 * - If `value` is in `labelMap`, returns the mapped label.
 * - Otherwise returns `null` to signal: fall through to Blockly's original
 *   getText (caller must handle the null case).
 */
export function resolveDropdownText(
  value: string,
  labelMap: Readonly<Record<string, string>>,
  emptyLabel: string,
): string | null {
  if (Object.keys(labelMap).length === 0) {
    return emptyLabel
  }
  if (Object.prototype.hasOwnProperty.call(labelMap, value)) {
    return labelMap[value]
  }
  return null
}
