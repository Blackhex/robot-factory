import * as THREE from 'three'
import type { BeltDirection } from './BeltMeshRenderer'

/**
 * Manages per-(beltLogicalId, direction) cloned chevron + highlight
 * materials. Each chevron clone owns its own cloned chevron texture
 * so per-belt UV offsets advance independently. The highlight clone
 * SHARES its `map` with the chevron clone of the same belt+dir, so
 * a single map.offset.x update advances both views (chevron +
 * highlight) consistently.
 */
export class PerBeltMaterialPool {
  private readonly chevrons: Map<string, THREE.MeshStandardMaterial> = new Map()
  private readonly highlights: Map<string, THREE.MeshStandardMaterial> = new Map()
  /** Source materials per direction — used as templates for cloning. */
  private readonly baseChevronMaterials: Map<BeltDirection, THREE.MeshStandardMaterial>
  /** Source highlight materials per direction. */
  private readonly baseHighlightMaterials: Map<BeltDirection, THREE.MeshStandardMaterial>

  constructor(
    baseChevronMaterials: Map<BeltDirection, THREE.MeshStandardMaterial>,
    baseHighlightMaterials: Map<BeltDirection, THREE.MeshStandardMaterial>,
  ) {
    this.baseChevronMaterials = baseChevronMaterials
    this.baseHighlightMaterials = baseHighlightMaterials
  }

  private key(beltId: string, direction: BeltDirection): string {
    return `${beltId}|${direction}`
  }

  /**
   * Returns the per-belt chevron material for (beltId, direction).
   * Lazily clones the base material on first request.
   */
  getChevron(beltId: string, direction: BeltDirection): THREE.MeshStandardMaterial {
    const k = this.key(beltId, direction)
    let mat = this.chevrons.get(k)
    if (!mat) {
      const base = this.baseChevronMaterials.get(direction)!
      mat = base.clone()
      // Each chevron material clones its own texture so UV offsets advance
      // independently per belt.
      if (mat.map) {
        mat.map = mat.map.clone()
        mat.map.needsUpdate = true
      }
      this.chevrons.set(k, mat)
    }
    return mat
  }

  /**
   * Returns the per-belt highlight material for (beltId, direction).
   * Lazily clones the base highlight material AND shares its `map` with
   * the chevron clone of the same belt+dir.
   */
  getHighlight(beltId: string, direction: BeltDirection): THREE.MeshStandardMaterial {
    const k = this.key(beltId, direction)
    let mat = this.highlights.get(k)
    if (!mat) {
      const base = this.baseHighlightMaterials.get(direction)!
      mat = base.clone()
      // Critical: shared map with the chevron clone so map.offset advances
      // both views together.
      const chevron = this.getChevron(beltId, direction)
      mat.map = chevron.map
      this.highlights.set(k, mat)
    }
    return mat
  }

  /**
   * Iterate every (key, chevron material) pair for UV-scroll ticking.
   * Keys are formatted as `${beltId}|${direction}`.
   */
  chevronEntries(): IterableIterator<[string, THREE.MeshStandardMaterial]> {
    return this.chevrons.entries()
  }

  /** Iterate the unique belt logical ids that currently have any clones. */
  beltIds(): Set<string> {
    const ids = new Set<string>()
    for (const k of this.chevrons.keys()) ids.add(k.slice(0, k.lastIndexOf('|')))
    for (const k of this.highlights.keys()) ids.add(k.slice(0, k.lastIndexOf('|')))
    return ids
  }

  /** Dispose all per-belt materials (and their cloned maps) for a single belt. */
  disposeBelt(beltId: string): void {
    for (const direction of ['east', 'west', 'north', 'south'] as const) {
      const k = this.key(beltId, direction)
      const chev = this.chevrons.get(k)
      if (chev) {
        chev.map?.dispose()
        chev.dispose()
        this.chevrons.delete(k)
      }
      const hl = this.highlights.get(k)
      if (hl) {
        // map already disposed via chevron — DO NOT dispose hl.map again
        hl.dispose()
        this.highlights.delete(k)
      }
    }
  }

  /** Dispose every per-belt clone. Used on full teardown. */
  disposeAll(): void {
    for (const id of this.beltIds()) {
      this.disposeBelt(id)
    }
  }
}
