import type { Page } from '@playwright/test'
import type {
  MachineInfo,
  SimSnapshot,
  BeltMeshInspection,
  BeltHighlightInspection,
  BeltClearInspection,
  SceneItemMeshes,
} from '../types'

/**
 * The single typed `page.evaluate()` bridge between the test runner and the
 * running Robot Factory application. Every read/write of game state, every
 * access to `window.__gameManager`, `window.__test`, `window.__sceneManager`,
 * `window.__getFactoryRenderer` lives here. No spec or other Page Object
 * calls `page.evaluate()` for game state directly.
 */
export class SimulationProbe {
  private readonly page: Page
  constructor(page: Page) { this.page = page }

  // ---- Reads ---------------------------------------------------------------

  async isRunning(): Promise<boolean> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      return !!gm?.simulation?.running
    })
  }

  async isPaused(): Promise<boolean> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      return !!gm?.simulation?.paused
    })
  }

  async getMachines(): Promise<MachineInfo[]> {
    return this.page.evaluate(() => {
      const t = (window as any).__test
      return (t?.getMachines?.() ?? []) as any[]
    })
  }

  async getMachineCount(): Promise<number> {
    return this.page.evaluate(() => {
      const t = (window as any).__test
      return (t?.getMachines?.() ?? []).length
    })
  }

  async getMachineCountFromFactory(): Promise<number> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      return gm?.factory?.getMachines?.().length ?? 0
    })
  }

  async getBeltCount(): Promise<number> {
    return this.page.evaluate(() => {
      const t = (window as any).__test
      return (t?.getBelts?.() ?? []).length
    })
  }

  async getBeltCountFromFactory(): Promise<number> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      return gm?.factory?.getBelts?.().length ?? 0
    })
  }

  async getFirstMachineDisplayName(): Promise<string> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const m = gm?.factory?.getMachines?.()[0]
      return (m?.name ?? m?.type ?? '') as string
    })
  }

  async readSnapshot(): Promise<SimSnapshot> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const factory = gm?.factory
      const sim = gm?.simulation
      if (!factory || !sim) {
        return {
          running: false,
          machineCount: 0,
          beltCount: 0,
          itemsOnBelts: 0,
          beltItemCounts: [],
          machineStates: [],
        }
      }
      const beltMap = sim.getBelts() as Map<string, any>
      const beltItemCounts: number[] = []
      beltMap.forEach((b: any) => beltItemCounts.push(b.getItems().length))
      const itemsOnBelts = beltItemCounts.reduce((a: number, b: number) => a + b, 0)
      const machineMap = sim.getMachines() as Map<string, any>
      const machineStates: any[] = []
      machineMap.forEach((m: any) => {
        machineStates.push({
          id: m.id,
          state: m.state,
          inputSlots: m.inputSlots.length,
          outputSlot: m.outputSlot != null,
          consumedItems: m.consumedItems,
        })
      })
      return {
        running: !!sim.running,
        machineCount: machineMap.size,
        beltCount: beltMap.size,
        itemsOnBelts,
        beltItemCounts,
        machineStates,
      }
    })
  }

  async inspectBeltMeshes(): Promise<BeltMeshInspection | null> {
    return this.page.evaluate(() => {
      const getRenderer = (window as any).__getFactoryRenderer
      const renderer = getRenderer?.()
      if (!renderer) return null

      const beltMeshes: Map<string, any> = (renderer as any).beltMeshes
      if (!beltMeshes) return null

      const corners: any[] = []
      const straights: any[] = []

      for (const [key, mesh] of beltMeshes) {
        const geom = mesh.geometry
        const posAttr = geom.getAttribute('position')
        const vertexCount = posAttr ? posAttr.count : 0
        const gType = geom.type || geom.constructor?.name || 'unknown'
        const pos = mesh.position

        if (key.startsWith('corner_')) {
          const uvAttr = geom.getAttribute('uv')
          let uvRange = null
          if (uvAttr) {
            let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
            for (let i = 0; i < uvAttr.count; i++) {
              const u = uvAttr.getX(i)
              const v = uvAttr.getY(i)
              minU = Math.min(minU, u)
              maxU = Math.max(maxU, u)
              minV = Math.min(minV, v)
              maxV = Math.max(maxV, v)
            }
            uvRange = { minU, maxU, minV, maxV }
          }

          geom.computeBoundingBox()
          const bb = geom.boundingBox
          corners.push({
            key,
            geometryType: gType,
            vertexCount,
            hasUV: !!uvAttr,
            uvRange,
            positionX: pos.x,
            positionY: pos.y,
            positionZ: pos.z,
            bbMin: bb ? { x: bb.min.x, y: bb.min.y, z: bb.min.z } : null,
            bbMax: bb ? { x: bb.max.x, y: bb.max.y, z: bb.max.z } : null,
          })
        } else {
          straights.push({
            key,
            geometryType: gType,
            vertexCount,
            positionX: pos.x,
            positionY: pos.y,
            positionZ: pos.z,
          })
        }
      }

      return { corners, straights, totalMeshes: beltMeshes.size }
    })
  }

  async inspectCornerHighlights(): Promise<BeltClearInspection[] | null> {
    return this.page.evaluate(() => {
      const getRenderer = (window as any).__getFactoryRenderer
      const renderer = getRenderer?.()
      if (!renderer) return null
      const beltMeshes: Map<string, any> = (renderer as any).beltMeshes
      if (!beltMeshes) return null
      const collect = (mesh: any): { uuid: string | string[]; strength: number; isHighlighted: boolean; hex: number } => {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        let maxStrength = 0
        let primaryHex = 0
        const uuids: string[] = []
        for (let i = 0; i < mats.length; i++) {
          const m = mats[i]
          uuids.push(m.uuid)
          const intensity = typeof m.emissiveIntensity === 'number' ? m.emissiveIntensity : 0
          const emissive = m.emissive
          if (emissive) {
            const s = (emissive.r + emissive.g + emissive.b) * intensity
            if (s > maxStrength) {
              maxStrength = s
              primaryHex = emissive.getHex?.() ?? 0
            }
          }
        }
        return {
          uuid: Array.isArray(mesh.material) ? uuids : uuids[0],
          strength: maxStrength,
          isHighlighted: maxStrength > 1e-6,
          hex: primaryHex,
        }
      }
      const results: any[] = []
      for (const [key, mesh] of beltMeshes) {
        if (!key.startsWith('corner_')) continue
        const c = collect(mesh)
        results.push({
          key,
          isHighlighted: c.isHighlighted,
          emissiveHex: c.hex,
          emissiveStrength: c.strength,
          materialUuid: c.uuid,
        })
      }
      return results
    })
  }

  async highlightAllBeltsAndInspectCorners(): Promise<BeltHighlightInspection | null> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const getRenderer = (window as any).__getFactoryRenderer
      const renderer = getRenderer?.()
      if (!gm?.factory || !renderer) return null

      const belts = gm.factory.getBelts()
      if (belts.length === 0) return null

      const beltIds = belts.map((b: any) => b.id)
      renderer.highlightBelts(beltIds)

      const beltMeshes: Map<string, any> = (renderer as any).beltMeshes
      const collect = (mesh: any) => {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        let maxStrength = 0
        let primaryHex = 0
        const uuids: string[] = []
        for (let i = 0; i < mats.length; i++) {
          const m = mats[i]
          uuids.push(m.uuid)
          const intensity = typeof m.emissiveIntensity === 'number' ? m.emissiveIntensity : 0
          const emissive = m.emissive
          if (emissive) {
            const s = (emissive.r + emissive.g + emissive.b) * intensity
            if (s > maxStrength) {
              maxStrength = s
              primaryHex = emissive.getHex?.() ?? 0
            }
          }
        }
        return {
          uuid: Array.isArray(mesh.material) ? uuids : uuids[0],
          strength: maxStrength,
          isHighlighted: maxStrength > 1e-6,
          hex: primaryHex,
        }
      }
      const results: any[] = []
      for (const [key, mesh] of beltMeshes) {
        if (!key.startsWith('corner_')) continue
        const c = collect(mesh)
        results.push({
          key,
          isHighlighted: c.isHighlighted,
          emissiveHex: c.hex,
          emissiveStrength: c.strength,
          materialUuid: c.uuid,
        })
      }
      return { cornerCount: results.length, results }
    })
  }

  async clearBeltHighlightAndInspectCorners(): Promise<BeltClearInspection[] | null> {
    return this.page.evaluate(() => {
      const getRenderer = (window as any).__getFactoryRenderer
      const renderer = getRenderer?.()
      if (!renderer) return null
      renderer.clearBeltHighlight()
      const beltMeshes: Map<string, any> = (renderer as any).beltMeshes
      const collect = (mesh: any) => {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        let maxStrength = 0
        let primaryHex = 0
        const uuids: string[] = []
        for (let i = 0; i < mats.length; i++) {
          const m = mats[i]
          uuids.push(m.uuid)
          const intensity = typeof m.emissiveIntensity === 'number' ? m.emissiveIntensity : 0
          const emissive = m.emissive
          if (emissive) {
            const s = (emissive.r + emissive.g + emissive.b) * intensity
            if (s > maxStrength) {
              maxStrength = s
              primaryHex = emissive.getHex?.() ?? 0
            }
          }
        }
        return {
          uuid: Array.isArray(mesh.material) ? uuids : uuids[0],
          strength: maxStrength,
          isHighlighted: maxStrength > 1e-6,
          hex: primaryHex,
        }
      }
      const results: any[] = []
      for (const [key, mesh] of beltMeshes) {
        if (!key.startsWith('corner_')) continue
        const c = collect(mesh)
        results.push({
          key,
          isHighlighted: c.isHighlighted,
          emissiveHex: c.hex,
          emissiveStrength: c.strength,
          materialUuid: c.uuid,
        })
      }
      return results
    })
  }

  async readSceneItemMeshes(): Promise<SceneItemMeshes> {
    return this.page.evaluate(() => {
      const sm = (window as any).__sceneManager
      const scene = sm?.getScene?.()
      if (!scene) return { totalCount: -1, meshes: [] }
      const meshes: any[] = []
      let totalCount = 0
      scene.traverse((obj: any) => {
        if (!obj.isInstancedMesh) return
        const geom = obj.geometry
        const params = geom?.parameters
        const isItemGeometry =
          geom?.type === 'SphereGeometry' &&
          params &&
          Math.abs(params.radius - 0.1) < 1e-6
        if (!isItemGeometry) return
        const count: number = obj.count
        const arr: Float32Array | undefined = obj.instanceMatrix?.array
        let instancesAtItemY = 0
        if (arr) {
          for (let i = 0; i < count; i++) {
            if (Math.abs(arr[i * 16 + 13] - 0.15) < 1e-3) instancesAtItemY++
          }
        } else {
          instancesAtItemY = count
        }
        meshes.push({ count, instancesAtItemY })
        totalCount += count
      })
      return { totalCount, meshes }
    })
  }

  // ---- Writes (game API) ---------------------------------------------------

  async placeBeltViaTestApi(
    sx: number,
    sz: number,
    dx: number,
    dz: number,
  ): Promise<boolean> {
    return this.page.evaluate(
      ({ sx, sz, dx, dz }) =>
        (window as any).__test?.placeBelt?.(sx, sz, dx, dz) ?? false,
      { sx, sz, dx, dz },
    )
  }

  async placeBeltChainViaFactory(): Promise<{
    placed: boolean
    beltCount: number
    machineA: { x: number; z: number }
    machineB: { x: number; z: number }
  } | null> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      if (!gm?.factory) return null
      const f = gm.factory
      const machines = f.getMachines()
      if (machines.length < 2) return null
      const [mA, mB] = machines
      const placed = f.placeBeltChain(mA, mB, 'output')
      return {
        placed,
        beltCount: f.getBelts().length,
        machineA: { x: mA.x, z: mA.z },
        machineB: { x: mB.x, z: mB.z },
      }
    })
  }

  async placeBeltChainViaFactoryUsingMachineRefs(): Promise<{
    placed: boolean
    beltCount: number
    machineA: { x: number; z: number }
    machineB: { x: number; z: number }
  } | null> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      if (!gm?.factory) return null
      const f = gm.factory
      const machines = f.getMachines()
      if (machines.length < 2) return null
      const [mA, mB] = machines
      const placed = f.placeBeltChain(mA, mB, 'output')
      const belts = f.getBelts()
      return {
        placed,
        beltCount: belts.length,
        machineA: { x: mA.x, z: mA.z },
        machineB: { x: mB.x, z: mB.z },
      }
    })
  }

  /** Force the FactoryRenderer to update its meshes (e.g. after API placement). */
  async forceRendererUpdate(): Promise<void> {
    await this.page.evaluate(() => {
      const getRenderer = (window as any).__getFactoryRenderer
      if (typeof getRenderer === 'function') {
        const renderer = getRenderer()
        if (renderer) renderer.update()
      }
    })
  }

  // ---- Pixel projection helpers (used only by canvas Page Objects) --------

  /**
   * Project a grid cell to canvas pixel coordinates using the well-known
   * camera math used by the legacy specs. Identical for any W×H grid.
   */
  async gridCellToScreenPos(
    gx: number,
    gz: number,
    gridW: number,
    gridH: number,
  ): Promise<{ x: number; y: number }> {
    return this.page.evaluate(
      ({ gx, gz, W, H }) => {
        const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
        if (!canvas) return { x: 0, y: 0 }
        const rect = canvas.getBoundingClientRect()
        const worldX = gx - W / 2 + 0.5
        const worldZ = gz - H / 2 + 0.5
        const fov = (50 * Math.PI) / 180
        const d = (Math.max(W, H) / (2 * Math.tan(fov / 2))) * 1.2
        const cx = d * 0.7, cy = d * 0.7, cz = d * 0.7
        const fl = Math.sqrt(cx * cx + cy * cy + cz * cz)
        const fx = -cx / fl, fy = -cy / fl, fz = -cz / fl
        let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0
        const rl = Math.sqrt(rx * rx + ry * ry + rz * rz)
        rx /= rl; ry /= rl; rz /= rl
        const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx
        const dx = worldX - cx, dy = 0 - cy, dz = worldZ - cz
        const vx = dx * rx + dy * ry + dz * rz
        const vy = dx * ux + dy * uy + dz * uz
        const vz_ = dx * fx + dy * fy + dz * fz
        const thf = Math.tan(fov / 2), asp = rect.width / rect.height
        const nx = vx / (-vz_ * thf * asp), ny = vy / (-vz_ * thf)
        return {
          x: Math.round(((nx + 1) / 2) * rect.width),
          y: Math.round(((1 - ny) / 2) * rect.height),
        }
      },
      { gx, gz, W: gridW, H: gridH },
    )
  }

  /**
   * Project a machine's actual world position through the live Three.js
   * camera (more accurate than the static grid projection above).
   */
  async projectMachineWorldToScreen(gx: number, gz: number): Promise<{ x: number; y: number }> {
    return this.page.evaluate(
      ({ gx, gz }) => {
        const sm = (window as any).__sceneManager
        const camera = sm.getCamera()
        const gm = (window as any).__gameManager
        const factory = gm.factory
        const worldX = gx - factory.width / 2 + 0.5
        const worldZ = gz - factory.height / 2 + 0.5
        const vec = camera.position.clone()
        vec.set(worldX, 0.45, worldZ)
        vec.project(camera)
        const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
        const rect = canvas.getBoundingClientRect()
        return {
          x: Math.round(((vec.x + 1) / 2) * rect.width),
          y: Math.round(((1 - vec.y) / 2) * rect.height),
        }
      },
      { gx, gz },
    )
  }

  /** Project the middle belt mesh's world position through the live camera. */
  async projectMidBeltMeshToScreen(): Promise<{ x: number; y: number }> {
    return this.page.evaluate(() => {
      const getRenderer = (window as any).__getFactoryRenderer
      const renderer = getRenderer?.()
      if (!renderer) throw new Error('No factory renderer')
      const beltMeshes: Map<string, any> = (renderer as any).beltMeshes
      if (!beltMeshes || beltMeshes.size === 0) throw new Error('No belt meshes')
      const entries = Array.from(beltMeshes.values())
      const midIdx = Math.floor(entries.length / 2)
      const targetMesh = entries[midIdx]
      const worldPos = targetMesh.position.clone()
      const sm = (window as any).__sceneManager
      const camera = sm.getCamera()
      worldPos.project(camera)
      const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
      const rect = canvas.getBoundingClientRect()
      return {
        x: Math.round(((worldPos.x + 1) / 2) * rect.width),
        y: Math.round(((1 - worldPos.y) / 2) * rect.height),
      }
    })
  }

  /** Run a one-shot rAF flush on the page. */
  async flushAnimationFrame(): Promise<void> {
    await this.page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => r())),
    )
  }

  /** Wait for `ms` milliseconds — a thin wrapper so specs don't talk about `page.waitForTimeout`. */
  async settle(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms)
  }

  // ---- Direct factory mutation (used to set up scenarios deterministically) ----

  /**
   * Place a machine of the given type at (x, z) using the factory API directly,
   * bypassing pointer events. Returns true if placement succeeded.
   */
  async placeMachineDirect(x: number, z: number, type: string): Promise<boolean> {
    return this.page.evaluate(
      ({ x, z, type }) => {
        const gm = (window as any).__gameManager
        const placed = gm?.factory?.placeMachine?.(x, z, type)
        const r = (window as any).__getFactoryRenderer?.()
        r?.update?.()
        return !!placed
      },
      { x, z, type },
    )
  }

  /**
   * Set a machine's rotation directly via factory.rotateMachine. Returns true on success.
   */
  async setMachineRotationDirect(x: number, z: number, rotation: string): Promise<boolean> {
    return this.page.evaluate(
      ({ x, z, rotation }) => {
        const gm = (window as any).__gameManager
        const m = gm?.factory?.getMachineAt?.(x, z)
        if (!m) return false
        const ok = gm.factory.rotateMachine(m, rotation)
        const r = (window as any).__getFactoryRenderer?.()
        r?.update?.()
        return !!ok
      },
      { x, z, rotation },
    )
  }

  /** Read a machine's current rotation by grid coordinate. */
  async getMachineRotation(x: number, z: number): Promise<string | null> {
    return this.page.evaluate(
      ({ x, z }) => {
        const gm = (window as any).__gameManager
        const m = gm?.factory?.getMachineAt?.(x, z)
        return m ? m.rotation : null
      },
      { x, z },
    )
  }

  /**
   * Place a belt chain from the machine at (sx, sz) to the machine at (dx, dz)
   * using the factory API directly. Returns true on success.
   */
  async placeBeltChainBetween(
    sx: number, sz: number, dx: number, dz: number,
  ): Promise<boolean> {
    return this.page.evaluate(
      ({ sx, sz, dx, dz }) => {
        const gm = (window as any).__gameManager
        const f = gm?.factory
        if (!f) return false
        const src = f.getMachineAt(sx, sz)
        const dst = f.getMachineAt(dx, dz)
        if (!src || !dst) return false
        const ok = f.placeBeltChain(src, dst, 'output')
        const r = (window as any).__getFactoryRenderer?.()
        r?.update?.()
        return !!ok
      },
      { sx, sz, dx, dz },
    )
  }

  /**
   * Return belts with source/destination coords + slot positions, suitable for
   * assertions about which slots a newly-drawn belt connects.
   */
  async getBeltsDetailed(): Promise<Array<{
    id: string
    sourceX: number; sourceZ: number; sourceSlot: string
    destX: number; destZ: number; destSlot: string
  }>> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const belts = gm?.factory?.getBelts?.() ?? []
      return belts.map((b: any) => ({
        id: b.id,
        sourceX: b.sourceMachine.x,
        sourceZ: b.sourceMachine.z,
        sourceSlot: b.sourceSlot,
        destX: b.destinationMachine.x,
        destZ: b.destinationMachine.z,
        destSlot: b.destinationSlot,
      }))
    })
  }

  /**
   * Project the world position of a specific input/output slot mesh of the
   * machine at (x, z) to canvas-relative pixel coordinates. Returns null if
   * the machine or the requested slot mesh does not exist.
   */
  async getMachineSlotScreenPos(
    x: number, z: number, kind: 'input' | 'output', slotIndex = 0,
  ): Promise<{ x: number; y: number } | null> {
    return this.page.evaluate(
      ({ x, z, kind, slotIndex }) => {
        const gm = (window as any).__gameManager
        const renderer = (window as any).__getFactoryRenderer?.()
        const sm = (window as any).__sceneManager
        if (!gm?.factory || !renderer || !sm) return null
        const m = gm.factory.getMachineAt(x, z)
        if (!m) return null
        const slotMap: Map<string, { inputs: any[]; outputs: any[] }> = (renderer as any).slotMeshes
        const entry = slotMap?.get?.(m.id)
        if (!entry) return null
        const list = kind === 'input' ? entry.inputs : entry.outputs
        const mesh = list?.[slotIndex]
        if (!mesh) return null
        const camera = sm.getCamera()
        const v = mesh.position.clone()
        v.project(camera)
        const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
        const rect = canvas.getBoundingClientRect()
        return {
          x: Math.round(((v.x + 1) / 2) * rect.width),
          y: Math.round(((1 - v.y) / 2) * rect.height),
        }
      },
      { x, z, kind, slotIndex },
    )
  }
}
