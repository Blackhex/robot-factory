/**
 * @vitest-environment jsdom
 *
 * Tests for ItemRenderer.clear() — resets all instanced item meshes so
 * no ghost items remain on screen after a simulation reset.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ItemRenderer, type BeltRenderData } from '../../../src/rendering/ItemRenderer'
import type { ItemType } from '../../../src/game/types'

const GRID_W = 10
const GRID_H = 10

function makeBeltWithItems(
  items: ReadonlyArray<{ type: ItemType; position: number }>,
): BeltRenderData {
  return {
    from: { x: 0, z: 0 },
    to: { x: 1, z: 0 },
    items,
  }
}

describe('ItemRenderer.clear()', () => {
  let scene: THREE.Scene
  let renderer: ItemRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    renderer = new ItemRenderer(scene)
  })

  it('clear() should set every InstancedMesh count to 0', () => {
    renderer.update(
      [
        makeBeltWithItems([
          { type: 'wheel_small', position: 0.25 },
          { type: 'wheel_small', position: 0.75 },
        ]),
      ],
      GRID_W,
      GRID_H,
    )

    const meshes = (renderer as any).meshes as Map<ItemType, THREE.InstancedMesh>
    const wheelMesh = meshes.get('wheel_small')!
    // Sanity check: the update actually populated a mesh.
    expect(wheelMesh.count).toBe(2)

    ;(renderer as any).clear()

    for (const mesh of meshes.values()) {
      expect(mesh.count).toBe(0)
    }
  })

  it('clear() should bump instanceMatrix.version for every mesh', () => {
    renderer.update(
      [makeBeltWithItems([{ type: 'wheel_small', position: 0.5 }])],
      GRID_W,
      GRID_H,
    )

    const meshes = (renderer as any).meshes as Map<ItemType, THREE.InstancedMesh>

    // Capture pre-clear versions; needsUpdate=true is sugar for version++.
    const previousVersions = new Map<ItemType, number>()
    for (const [type, mesh] of meshes) {
      previousVersions.set(type, mesh.instanceMatrix.version)
    }

    ;(renderer as any).clear()

    for (const [type, mesh] of meshes) {
      expect(mesh.instanceMatrix.version).toBeGreaterThan(previousVersions.get(type)!)
    }
  })

  it('clear() on a fresh renderer should not throw and leave counts at 0', () => {
    expect(() => (renderer as any).clear()).not.toThrow()

    const meshes = (renderer as any).meshes as Map<ItemType, THREE.InstancedMesh>
    for (const mesh of meshes.values()) {
      expect(mesh.count).toBe(0)
    }
  })

  it('clear() then update() should restore item rendering', () => {
    renderer.update(
      [
        makeBeltWithItems([
          { type: 'wheel_small', position: 0.25 },
          { type: 'wheel_small', position: 0.75 },
        ]),
      ],
      GRID_W,
      GRID_H,
    )

    ;(renderer as any).clear()

    renderer.update(
      [makeBeltWithItems([{ type: 'wheel_small', position: 0.5 }])],
      GRID_W,
      GRID_H,
    )

    const meshes = (renderer as any).meshes as Map<ItemType, THREE.InstancedMesh>
    const wheelMesh = meshes.get('wheel_small')!
    expect(wheelMesh.count).toBe(1)
  })
})
