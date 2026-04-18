/**
 * Pure helpers for building Blockly dropdown options and resolving
 * display text for machine/belt fields used by Robot Factory blocks.
 */

export type DropdownKind = 'machine' | 'belt'

export interface DropdownItem {
  slotIndex: number
  id: string
  name?: string
  label?: string
}

function enumNameFor(kind: DropdownKind): string {
  return kind === 'machine' ? 'Machine' : 'Belt'
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
