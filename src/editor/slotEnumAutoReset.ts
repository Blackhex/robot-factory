/**
 * Auto-reset helpers for machine / belt enum dropdown fields.
 *
 * When the underlying machine / belt list changes such that a block's
 * currently-selected slot becomes empty, we reset the field value to the
 * lowest currently-present slot of the same kind. When no items remain
 * we leave the value as-is; the dropdown text resolver handles the
 * "(no machine)" / "(no belt)" empty-label display.
 */

export interface SlotPresence {
  slotIndex: number
  id: string
}

function pickValidEnumValue(
  prefix: 'Machine' | 'Belt',
  currentValue: string | null | undefined,
  items: ReadonlyArray<SlotPresence>,
  members: ReadonlyArray<string>,
): string | null {
  if (items.length === 0) return null

  const presentSlots = new Set(items.map((i) => i.slotIndex))
  const expectedPrefix = `${prefix}.`

  if (typeof currentValue === 'string' && currentValue.startsWith(expectedPrefix)) {
    const memberName = currentValue.slice(expectedPrefix.length)
    const memberIndex = members.indexOf(memberName)
    if (memberIndex !== -1 && presentSlots.has(memberIndex)) {
      return currentValue
    }
  }

  let lowestSlot = Number.POSITIVE_INFINITY
  for (const item of items) {
    if (item.slotIndex < lowestSlot) lowestSlot = item.slotIndex
  }
  if (lowestSlot >= members.length) return null
  return `${prefix}.${members[lowestSlot]}`
}

export function pickValidMachineEnumValue(
  currentValue: string | null | undefined,
  items: ReadonlyArray<SlotPresence>,
  members: ReadonlyArray<string>,
): string | null {
  return pickValidEnumValue('Machine', currentValue, items, members)
}

export function pickValidBeltEnumValue(
  currentValue: string | null | undefined,
  items: ReadonlyArray<SlotPresence>,
  members: ReadonlyArray<string>,
): string | null {
  return pickValidEnumValue('Belt', currentValue, items, members)
}

/**
 * Scan every block of the given types in the workspace and auto-reset its
 * machine/belt field if the referenced slot is now empty. Uses
 * `refreshField` (typically a wrapper around `forceRerender`) after
 * `setValue` to invalidate cached SVG text.
 */
export function autoResetEnumFieldsForWorkspace(
  workspace: any,
  fieldName: 'machine' | 'belt',
  blockTypes: ReadonlyArray<string>,
  items: ReadonlyArray<SlotPresence>,
  members: ReadonlyArray<string>,
  refreshField: (field: any) => void,
): void {
  if (!workspace || typeof workspace.getBlocksByType !== 'function') return
  const picker = fieldName === 'machine' ? pickValidMachineEnumValue : pickValidBeltEnumValue
  for (const type of blockTypes) {
    const blocks: any[] = workspace.getBlocksByType(type, false) ?? []
    for (const block of blocks) {
      const field = block.getField?.(fieldName)
      if (!field) continue
      const currentValue: string | null = field.getValue?.() ?? null
      const next = picker(currentValue, items, members)
      if (next !== null && next !== currentValue) {
        field.setValue(next)
        refreshField(field)
      }
    }
  }
}
