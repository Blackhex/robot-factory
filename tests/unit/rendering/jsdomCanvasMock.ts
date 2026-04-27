import { vi } from 'vitest'

/**
 * Install a minimal jsdom CanvasRenderingContext2D mock so production code
 * that calls `canvas.getContext('2d')` (e.g. RenderingAssets texture builders)
 * can run inside the unit-test environment.
 *
 * Call from a top-level `beforeAll(installJsdomCanvasMock)` in any rendering
 * spec that triggers texture creation.
 */
export function installJsdomCanvasMock(): void {
  const mockCtx = {
    clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    arc: vi.fn(), quadraticCurveTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(),
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    scale: vi.fn(), setTransform: vi.fn(),
    strokeStyle: '', fillStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
    globalCompositeOperation: '', font: '', textAlign: '', textBaseline: '',
    measureText: vi.fn().mockReturnValue({ width: 10 }),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as any)
}
