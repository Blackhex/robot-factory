export interface PausableSimulation {
  readonly running: boolean
  readonly paused: boolean
  pause(): void
  resume(): void
}

export type SimulationProvider = () => PausableSimulation | undefined

export class DragInteractionLifecycle {
  private readonly target: HTMLElement
  private readonly getSimulation?: SimulationProvider
  private activePointerId: number | null = null

  constructor(target: HTMLElement, getSimulation?: SimulationProvider) {
    this.target = target
    this.getSimulation = getSimulation
  }

  beginPointerCapture(event: PointerEvent): void {
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : null
    this.activePointerId = pointerId
    if (pointerId === null || typeof this.target.setPointerCapture !== 'function') return
    try {
      this.target.setPointerCapture(pointerId)
    } catch {
      // Pointer capture is best-effort; window-level handlers still cover cleanup.
    }
  }

  releasePointerCapture(): void {
    const pointerId = this.activePointerId
    this.activePointerId = null
    if (pointerId === null || typeof this.target.releasePointerCapture !== 'function') return
    try {
      if (typeof this.target.hasPointerCapture !== 'function' || this.target.hasPointerCapture(pointerId)) {
        this.target.releasePointerCapture(pointerId)
      }
    } catch {
      // Losing capture during cleanup is harmless; drag state is already reset.
    }
  }

  isActivePointer(event: PointerEvent): boolean {
    return this.activePointerId === null || event.pointerId === this.activePointerId
  }

  shouldCancelActiveDrag(event: PointerEvent, isDragging: boolean): boolean {
    return isDragging && this.isActivePointer(event)
  }

  runWithSimulationPausedForCommit<T>(commit: () => T): T {
    const sim = this.getSimulation?.()
    const shouldPause = !!sim?.running && !sim.paused
    if (shouldPause) sim.pause()
    try {
      return commit()
    } finally {
      if (shouldPause && sim.running && sim.paused) {
        sim.resume()
      }
    }
  }

  cancelDragLifecycle(): void {
    this.releasePointerCapture()
  }
}