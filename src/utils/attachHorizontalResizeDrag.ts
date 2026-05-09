/**
 * Generic horizontal-resize-handle drag helper. Used by both the right-docked
 * PXT editor panel and the left-docked Projects panel.
 *
 * The handle is a thin vertical strip pinned to one edge of the panel. While
 * the user drags, the panel's CSS width is updated and the handle's CSS
 * `left` or `right` offset is kept mirrored to that width so the visual
 * alignment is preserved.
 *
 * `edge` describes which side of the viewport the panel is docked to:
 *  - `'right'`: panel grows leftward; handle uses `right: calc(W - 3px)`
 *  - `'left'`:  panel grows rightward; handle uses `left:  calc(W - 3px)`
 *
 * `minWidthPx` and `maxWidthFraction` clamp the resulting CSS width.
 * `onResize` (optional) is invoked once per pointermove tick after the CSS
 * width has been applied — wire it to camera-refit / SceneManager.resize so
 * the canvas tracks the new visible region in real time.
 */
export interface AttachHorizontalResizeDragOptions {
  handle: HTMLElement
  panel: HTMLElement
  edge: 'left' | 'right'
  minWidthPx: number
  /** Maximum width as a fraction of viewport width, e.g. 0.5 for 50%. */
  maxWidthFraction: number
  onResize?: () => void
}

export interface HorizontalResizeDragHandle {
  dispose(): void
}

export function attachHorizontalResizeDrag(
  options: AttachHorizontalResizeDragOptions,
): HorizontalResizeDragHandle {
  const { handle, panel, edge, minWidthPx, maxWidthFraction, onResize } = options
  let dragging = false

  const onPointerDown = (e: PointerEvent): void => {
    e.preventDefault()
    dragging = true
    handle.classList.add('dragging')
    handle.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return
    const viewportW = window.innerWidth
    const minPct = (minWidthPx / viewportW) * 100
    const maxPct = maxWidthFraction * 100
    const rawPct =
      edge === 'right'
        ? ((viewportW - e.clientX) / viewportW) * 100
        : (e.clientX / viewportW) * 100
    const pct = Math.min(maxPct, Math.max(minPct, rawPct))
    panel.style.width = `${pct}%`
    if (edge === 'right') {
      handle.style.right = `calc(${pct}% - 3px)`
    } else {
      handle.style.left = `calc(${pct}% - 3px)`
    }
    onResize?.()
  }

  const stopDrag = (): void => {
    if (!dragging) return
    dragging = false
    handle.classList.remove('dragging')
  }

  handle.addEventListener('pointerdown', onPointerDown)
  handle.addEventListener('pointermove', onPointerMove)
  handle.addEventListener('pointerup', stopDrag)
  handle.addEventListener('pointercancel', stopDrag)

  return {
    dispose(): void {
      handle.removeEventListener('pointerdown', onPointerDown)
      handle.removeEventListener('pointermove', onPointerMove)
      handle.removeEventListener('pointerup', stopDrag)
      handle.removeEventListener('pointercancel', stopDrag)
    },
  }
}
