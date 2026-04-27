import type { Page } from '@playwright/test'

export class ProjectionProbe {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

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

  async projectMachineWorldToScreen(gx: number, gz: number): Promise<{ x: number; y: number }> {
    return this.projectFactoryWorldToScreen(gx, gz, 0.45)
  }

  async projectGridWorldToScreen(gx: number, gz: number): Promise<{ x: number; y: number }> {
    return this.projectFactoryWorldToScreen(gx, gz, 0)
  }

  private async projectFactoryWorldToScreen(gx: number, gz: number, y: number): Promise<{ x: number; y: number }> {
    return this.page.evaluate(
      ({ gx, gz, y }) => {
        const sm = (window as any).__sceneManager
        const camera = sm.getCamera()
        const gm = (window as any).__gameManager
        const factory = gm.factory
        const worldX = gx - factory.width / 2 + 0.5
        const worldZ = gz - factory.height / 2 + 0.5
        const vec = camera.position.clone()
        vec.set(worldX, y, worldZ)
        vec.project(camera)
        const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
        const rect = canvas.getBoundingClientRect()
        return {
          x: Math.round(((vec.x + 1) / 2) * rect.width),
          y: Math.round(((1 - vec.y) / 2) * rect.height),
        }
      },
      { gx, gz, y },
    )
  }

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
        const arrowMap: Map<string, { inputs: any[]; outputs: any[] }> = (renderer as any).machineArrows
        const slotMap: Map<string, { inputs: any[]; outputs: any[] }> = (renderer as any).slotMeshes
        const entry = arrowMap?.get?.(m.id) ?? slotMap?.get?.(m.id)
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