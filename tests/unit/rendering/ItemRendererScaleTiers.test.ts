/**
 * @vitest-environment jsdom
 *
 * Integration contract — `ItemRenderer` must apply per-tier scaling
 * (from `getItemScale`) to the per-instance Matrix4 it writes onto each
 * `InstancedMesh`. A robot instance must end up with a strictly larger
 * matrix scale than a wheel instance.
 *
 * RED — fails until ItemRenderer multiplies its per-instance matrix by
 * `getItemScale(type)`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ItemRenderer } from '../../../src/rendering/ItemRenderer'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { createItem } from '../../../src/game/Item'
import type { ItemType } from '../../../src/game/types'

const GRID_W = 20
const GRID_H = 20
const SEED_DT = 0
const FRAME_DT = 1 / 60

interface Harness {
  scene: THREE.Scene
  renderer: ItemRenderer
  belts: Map<string, ConveyorBelt>
}

function setup(): Harness {
  const scene = new THREE.Scene()
  const renderer = new ItemRenderer(scene)
  const belts = new Map<string, ConveyorBelt>()
  return { scene, renderer, belts }
}

function tick(h: Harness): void {
  h.renderer.cacheBeltTopology(h.belts)
  h.renderer.update(h.renderer.buildRenderData(h.belts), GRID_W, GRID_H, SEED_DT)
  h.renderer.update(h.renderer.buildRenderData(h.belts), GRID_W, GRID_H, FRAME_DT)
}

function meshFor(renderer: ItemRenderer, type: ItemType): THREE.InstancedMesh {
  const meshes = (renderer as unknown as {
    meshes: Map<ItemType, THREE.InstancedMesh>
  }).meshes
  const mesh = meshes.get(type)
  if (!mesh) throw new Error(`No InstancedMesh for type ${type}`)
  return mesh
}

function instanceScale(mesh: THREE.InstancedMesh, idx: number): number {
  const m = new THREE.Matrix4()
  mesh.getMatrixAt(idx, m)
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scl = new THREE.Vector3()
  m.decompose(pos, quat, scl)
  // Tiers are uniform — return any axis (use x).
  return scl.x
}

describe('ItemRenderer per-instance scale tiers', () => {
  let h: Harness
  beforeEach(() => {
    h = setup()
  })

  it('robot instance matrix scale is strictly larger than wheel instance matrix scale', () => {
    const wheelBelt = new ConveyorBelt('belt_wheel', 0, 0, 1, 0, 1.0)
    const robotBelt = new ConveyorBelt('belt_robot', 0, 5, 1, 0, 1.0)
    h.belts.set(wheelBelt.id, wheelBelt)
    h.belts.set(robotBelt.id, robotBelt)

    expect(wheelBelt.addItem(createItem('wheel_small'))).toBe(true)
    expect(robotBelt.addItem(createItem('robot_explorer'))).toBe(true)

    tick(h)

    const wheelMesh = meshFor(h.renderer, 'wheel_small')
    const robotMesh = meshFor(h.renderer, 'robot_explorer')
    expect(wheelMesh.count).toBeGreaterThanOrEqual(1)
    expect(robotMesh.count).toBeGreaterThanOrEqual(1)

    const wheelScale = instanceScale(wheelMesh, 0)
    const robotScale = instanceScale(robotMesh, 0)
    expect(robotScale).toBeGreaterThan(wheelScale)
  })

  it('sub-assembly instance matrix scale sits strictly between wheel and robot', () => {
    const wheelBelt = new ConveyorBelt('belt_wheel', 0, 0, 1, 0, 1.0)
    const subBelt = new ConveyorBelt('belt_sub', 0, 3, 1, 0, 1.0)
    const robotBelt = new ConveyorBelt('belt_robot', 0, 6, 1, 0, 1.0)
    h.belts.set(wheelBelt.id, wheelBelt)
    h.belts.set(subBelt.id, subBelt)
    h.belts.set(robotBelt.id, robotBelt)

    expect(wheelBelt.addItem(createItem('wheel_small'))).toBe(true)
    expect(subBelt.addItem(createItem('drivetrain_basic'))).toBe(true)
    expect(robotBelt.addItem(createItem('robot_explorer'))).toBe(true)

    tick(h)

    const wheelScale = instanceScale(meshFor(h.renderer, 'wheel_small'), 0)
    const subScale = instanceScale(meshFor(h.renderer, 'drivetrain_basic'), 0)
    const robotScale = instanceScale(meshFor(h.renderer, 'robot_explorer'), 0)

    expect(wheelScale).toBeLessThan(subScale)
    expect(subScale).toBeLessThan(robotScale)
  })
})
