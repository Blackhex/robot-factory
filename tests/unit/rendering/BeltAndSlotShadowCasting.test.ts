/**
 * @vitest-environment jsdom
 */
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { Factory } from '../../../src/game/Factory'
import { BeltMeshRenderer } from '../../../src/rendering/BeltMeshRenderer'
import { MachineMeshRenderer } from '../../../src/rendering/MachineMeshRenderer'
import { makeFactoryWithEastBelt } from './beltChevronTestHelpers'
import { installJsdomCanvasMock } from './jsdomCanvasMock'

/**
 * Belt and slot meshes must opt into shadow casting so the
 * directional/shadow-casting light renders them correctly. Renderers
 * currently only set `receiveShadow = true` on belts (and nothing on
 * slot indicators), which leaves `castShadow` at its `false` default.
 */

function buildBeltRenderer(factory: Factory): {
  renderer: BeltMeshRenderer
  beltMeshes: Map<string, THREE.Mesh>
} {
  const scene = new THREE.Scene()
  const beltMeshes = new Map<string, THREE.Mesh>()
  const cellBeltIds = new Map<THREE.Mesh, string[]>()
  const renderer = new BeltMeshRenderer({
    factory,
    scene,
    beltMeshes,
    cellBeltIds,
    gridToWorld: (x, z) => new THREE.Vector3(x, 0, z),
  })
  renderer.update()
  return { renderer, beltMeshes }
}

describe('BeltMeshRenderer — belt cell meshes cast shadows', () => {
  beforeAll(installJsdomCanvasMock)

  it('every belt cell mesh on a straight east belt has castShadow = true and receiveShadow = true', () => {
    const factory = makeFactoryWithEastBelt()
    const { beltMeshes } = buildBeltRenderer(factory)

    expect(beltMeshes.size).toBeGreaterThan(0)
    for (const [key, mesh] of beltMeshes) {
      expect(mesh.castShadow, `belt mesh ${key} must cast shadows`).toBe(true)
      expect(mesh.receiveShadow, `belt mesh ${key} must receive shadows`).toBe(true)
    }
  })

  it('every belt mesh on a longer straight belt (collinear interior cells) has castShadow = true', () => {
    const factory = new Factory(20, 20)
    factory.placeMachine(1, 5, 'assembler', 'east')
    factory.placeMachine(8, 5, 'assembler', 'east')
    const src = factory.getMachineAt(1, 5)!
    const dst = factory.getMachineAt(8, 5)!
    const placed = factory.placeBeltChain(src, dst, 'output')
    expect(placed).toBe(true)

    const { beltMeshes } = buildBeltRenderer(factory)
    expect(beltMeshes.size).toBeGreaterThan(2)
    for (const [key, mesh] of beltMeshes) {
      expect(mesh.castShadow, `belt mesh ${key} must cast shadows`).toBe(true)
      expect(mesh.receiveShadow, `belt mesh ${key} must receive shadows`).toBe(true)
    }
  })

  it('every corner belt mesh has castShadow = true', () => {
    const factory = new Factory(20, 20)
    factory.placeMachine(2, 2, 'assembler', 'east')
    factory.placeMachine(8, 8, 'assembler', 'east')
    const src = factory.getMachineAt(2, 2)!
    const dst = factory.getMachineAt(8, 8)!
    const placed = factory.placeBeltChain(src, dst, 'output')
    expect(placed).toBe(true)

    const { beltMeshes } = buildBeltRenderer(factory)
    const cornerKeys = [...beltMeshes.keys()].filter((k) => k.startsWith('corner_'))
    expect(cornerKeys.length, 'L-shaped chain should produce at least one corner mesh').toBeGreaterThan(0)
    for (const key of cornerKeys) {
      const mesh = beltMeshes.get(key)!
      expect(mesh.castShadow, `corner belt mesh ${key} must cast shadows`).toBe(true)
      expect(mesh.receiveShadow, `corner belt mesh ${key} must receive shadows`).toBe(true)
    }
  })
})

describe('MachineMeshRenderer — slot meshes cast shadows', () => {
  beforeAll(installJsdomCanvasMock)

  it('every slot mesh (inputs and outputs) for a placed machine has castShadow = true', () => {
    const factory = new Factory(20, 20)
    factory.placeMachine(5, 5, 'assembler', 'east')
    const machine = factory.getMachineAt(5, 5)!

    const scene = new THREE.Scene()
    const renderer = new MachineMeshRenderer({
      factory,
      scene,
      gridToWorld: (x, z) => new THREE.Vector3(x, 0, z),
    })
    renderer.update()

    const slots = renderer.slotMeshes.get(machine.id)
    expect(slots, 'slot mesh group must exist for placed machine').toBeDefined()
    expect(slots!.inputs.length, 'assembler must have at least one input slot').toBeGreaterThan(0)
    expect(slots!.outputs.length, 'assembler must have at least one output slot').toBeGreaterThan(0)

    for (const [i, mesh] of slots!.inputs.entries()) {
      expect(mesh.castShadow, `input slot mesh #${i} must cast shadows`).toBe(true)
    }
    for (const [i, mesh] of slots!.outputs.entries()) {
      expect(mesh.castShadow, `output slot mesh #${i} must cast shadows`).toBe(true)
    }
  })
})
