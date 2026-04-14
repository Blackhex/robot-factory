import type { Direction, GridPosition, MachineType, SlotPosition, SlotPositions } from './types'

/** Convert a Direction to degrees. south=0, east=90, north=180, west=270. */
export function directionToDegrees(dir: Direction): number {
  switch (dir) {
    case 'south': return 0
    case 'east': return 90
    case 'north': return 180
    case 'west': return 270
  }
}

/** Convert degrees to a Direction. */
export function degreesToDirection(deg: number): Direction {
  const normalized = ((deg % 360) + 360) % 360
  if (normalized === 90) return 'east'
  if (normalized === 180) return 'north'
  if (normalized === 270) return 'west'
  return 'south'
}

/** Rotate a Direction clockwise by 90°. */
export function rotateDirectionCW(dir: Direction): Direction {
  switch (dir) {
    case 'south': return 'west'
    case 'west': return 'north'
    case 'north': return 'east'
    case 'east': return 'south'
  }
}

/** Rotate a grid offset by the given direction. */
export function rotateOffset(offset: GridPosition, direction: Direction): GridPosition {
  switch (direction) {
    case 'east': return { x: offset.z, z: -offset.x }
    case 'north': return { x: -offset.x, z: -offset.z }
    case 'west': return { x: -offset.z, z: offset.x }
    default: return { x: offset.x, z: offset.z } // south = no rotation
  }
}

/** Get the base grid offset for a slot position (at rotation=0, output faces +Z). */
function slotPositionBaseOffset(position: SlotPosition): GridPosition {
  switch (position) {
    case 'front': return { x: 0, z: 1 }
    case 'back': return { x: 0, z: -1 }
    case 'right': return { x: 1, z: 0 }
    case 'left': return { x: -1, z: 0 }
  }
}

/** Get the rotation-independent slot positions for a machine type. */
export function getSlotPositions(type: MachineType): SlotPositions {
  switch (type) {
    case 'splitter':
      return { inputs: ['back'], outputs: ['front', 'right', 'left'] }
    case 'assembler':
      return { inputs: ['back', 'right', 'left'], outputs: ['front'] }
    case 'factory_output':
      return { inputs: ['back', 'right', 'left', 'front'], outputs: [] }
    default:
      return { inputs: ['back'], outputs: ['front'] }
  }
}

/** Convert a SlotPosition to a grid offset considering direction. */
export function slotPositionToOffset(position: SlotPosition, direction: Direction): GridPosition {
  return rotateOffset(slotPositionBaseOffset(position), direction)
}

/** Compute the Direction so the output slot faces the given dx/dz. */
export function rotationToFace(dx: number, dz: number): Direction {
  if (dz > 0) return 'south'
  if (dx > 0) return 'east'
  if (dz < 0) return 'north'
  if (dx < 0) return 'west'
  return 'south'
}

/** Reverse of slotPositionToOffset: convert a grid offset back to a SlotPosition. */
export function offsetToSlotPosition(offset: GridPosition, direction: Direction): SlotPosition | null {
  const positions: SlotPosition[] = ['front', 'back', 'left', 'right']
  for (const pos of positions) {
    const o = slotPositionToOffset(pos, direction)
    if (o.x === offset.x && o.z === offset.z) return pos
  }
  return null
}

/** Pick the slot offset whose absolute position is closest (Manhattan) to `target`. */
export function pickBestSlotOffset(
  slotOffsets: GridPosition[], mx: number, mz: number, target: GridPosition,
): GridPosition | null {
  if (slotOffsets.length === 0) return null
  if (slotOffsets.length === 1) return slotOffsets[0]
  let best = slotOffsets[0]
  let bestDist = Math.abs(mx + best.x - target.x) + Math.abs(mz + best.z - target.z)
  for (let i = 1; i < slotOffsets.length; i++) {
    const s = slotOffsets[i]
    const dist = Math.abs(mx + s.x - target.x) + Math.abs(mz + s.z - target.z)
    if (dist < bestDist) { best = s; bestDist = dist }
  }
  return best
}
