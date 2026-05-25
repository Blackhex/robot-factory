/**
 * Stable slot assignment for machine / belt dropdown lists.
 *
 * A "slot" is a fixed integer index in the underlying dropdown enum
 * (e.g. `Machine.A` == slot 0). Slot indices must remain stable across
 * `updateMachineList` / `updateBeltList` calls so that:
 *
 * - Deleting a machine in the middle of the list does NOT shift the
 *   slots of surviving machines (otherwise existing blocks referencing
 *   those slots would silently switch to the wrong machine).
 * - A newly added machine takes the lowest currently-free slot.
 */

export interface SlotItem {
  id: string
  [extra: string]: unknown
}

export interface SlottedItem extends SlotItem {
  slotIndex: number
}

export function assignStableSlots<T extends SlotItem>(
  prev: ReadonlyArray<SlottedItem> | null,
  current: ReadonlyArray<T>,
  maxSlots: number,
): Array<T & { slotIndex: number }> {
  const prevById = new Map<string, number>()
  if (prev) {
    for (const entry of prev) {
      prevById.set(entry.id, entry.slotIndex)
    }
  }

  const taken = new Set<number>()
  const result: Array<T & { slotIndex: number }> = []
  const needsSlot: T[] = []

  for (const item of current) {
    const prevSlot = prevById.get(item.id)
    if (prevSlot !== undefined && prevSlot < maxSlots && !taken.has(prevSlot)) {
      taken.add(prevSlot)
      result.push({ ...item, slotIndex: prevSlot })
    } else {
      needsSlot.push(item)
    }
  }

  let cursor = 0
  for (const item of needsSlot) {
    while (cursor < maxSlots && taken.has(cursor)) cursor++
    if (cursor >= maxSlots) break
    taken.add(cursor)
    result.push({ ...item, slotIndex: cursor })
    cursor++
  }

  result.sort((a, b) => a.slotIndex - b.slotIndex)
  return result
}
