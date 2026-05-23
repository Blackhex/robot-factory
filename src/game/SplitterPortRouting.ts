import type { BeltInfo, MachineOutputPort, SlotPosition } from './types'

// Splitter geometry exposes outputs in the order ['front', 'right', 'left']
// (see SlotUtils). The simulation's three output ports map 1:1 to that order.
const SPLITTER_SLOT_TO_PORT: Partial<Record<SlotPosition, MachineOutputPort>> = {
  front: 'primary',
  right: 'secondary',
  left: 'tertiary',
}

export function derivePortFromBeltSource(
  belt: Pick<BeltInfo, 'sourceMachine' | 'sourceSlot'>,
): MachineOutputPort {
  if (belt.sourceMachine.type !== 'splitter') return 'primary'
  return SPLITTER_SLOT_TO_PORT[belt.sourceSlot] ?? 'primary'
}
