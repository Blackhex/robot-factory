export type BBox = { x: number; y: number; width: number; height: number }

/**
 * Pure geometry helper: do two axis-aligned bounding boxes share any
 * area (open-interval intersection)? Used to assert the spatial
 * overlap precondition for stacking tests — "the panels we are testing
 * actually do occupy overlapping screen regions, so a stacking-order
 * test is meaningful here."
 */
export function boxesOverlap(a: BBox | null, b: BBox | null): boolean {
  if (a === null || b === null) return false
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  )
}
